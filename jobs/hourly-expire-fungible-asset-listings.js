/**
 * 可叠加资产挂牌自动过期任务（C2C材料交易）
 *
 * 职责：
 * - 每小时扫描超时的可叠加资产挂牌（status='on_sale' 且 created_at > 3天）
 * - 自动撤回挂牌并解冻卖家资产
 * - 发送过期通知给卖家
 *
 * 业务规则（2026-01-08 C2C材料交易实施方案）：
 * - 挂牌有效期：3天
 * - 超时后：自动撤回并解冻资产
 * - 仅处理 listing_kind='fungible_asset' 的挂牌
 * - 物品挂牌（item_instance）的过期由 HourlyUnlockTimeoutTradeOrders 处理
 *
 * 执行策略：
 * - 定时执行：每小时整点
 * - 并发安全：使用事务 + 悲观锁
 * - 分布式锁：防止多实例重复执行
 *
 * 创建时间：2026-01-08
 */

'use strict'

const { MarketListing, sequelize, Op } = require('../models')
const AssetService = require('../services/AssetService')
const NotificationService = require('../services/NotificationService')
const logger = require('../utils/logger')

/**
 * 可叠加资产挂牌过期任务类
 *
 * @class HourlyExpireFungibleAssetListings
 * @description 自动过期超时的可叠加资产挂牌并解冻资产
 */
class HourlyExpireFungibleAssetListings {
  /**
   * 挂牌有效期（天）
   */
  static LISTING_EXPIRY_DAYS = 3

  /**
   * 执行挂牌过期任务
   *
   * @returns {Promise<Object>} 执行报告
   */
  static async execute() {
    const start_time = Date.now()
    logger.info('开始执行可叠加资产挂牌过期任务')

    try {
      // 扫描并处理超时挂牌
      const result = await this._expireTimeoutListings()

      const duration_ms = Date.now() - start_time

      const report = {
        timestamp: new Date().toISOString(),
        duration_ms,
        expired_count: result.expired_count,
        failed_count: result.failed_count,
        total_unfrozen_amount: result.total_unfrozen_amount,
        details: result.details
      }

      if (result.expired_count > 0) {
        logger.warn('可叠加资产挂牌过期任务完成（有过期数据）', report)
      } else {
        logger.info('可叠加资产挂牌过期任务完成（无过期数据）', report)
      }

      return report
    } catch (error) {
      logger.error('可叠加资产挂牌过期任务失败', { error: error.message })
      throw error
    }
  }

  /**
   * 过期超时的挂牌
   *
   * @private
   * @returns {Promise<Object>} 过期结果
   */
  static async _expireTimeoutListings() {
    // 计算过期时间阈值（3天前）
    const expiryThreshold = new Date(Date.now() - this.LISTING_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

    // 查询超时的可叠加资产挂牌（不加锁，批量查询）
    const timeoutListings = await MarketListing.findAll({
      where: {
        listing_kind: 'fungible_asset',
        status: 'on_sale',
        seller_offer_frozen: true,
        created_at: {
          [Op.lt]: expiryThreshold
        }
      },
      limit: 100 // 每次最多处理100个，避免一次处理太多
    })

    logger.info(`发现 ${timeoutListings.length} 个超时的可叠加资产挂牌`)

    if (timeoutListings.length === 0) {
      return {
        expired_count: 0,
        failed_count: 0,
        total_unfrozen_amount: 0,
        details: []
      }
    }

    // 逐个处理超时挂牌（使用独立事务）
    let expired_count = 0
    let failed_count = 0
    let total_unfrozen_amount = 0
    const details = []

    for (const listing of timeoutListings) {
      const transaction = await sequelize.transaction()

      try {
        // 1. 重新查询并加锁
        const lockedListing = await MarketListing.findOne({
          where: {
            listing_id: listing.listing_id,
            status: 'on_sale' // 确保状态未变
          },
          lock: transaction.LOCK.UPDATE,
          transaction
        })

        if (!lockedListing) {
          // 状态已变更，跳过
          await transaction.rollback()
          continue
        }

        // 2. 解冻卖家资产
        let unfreezeResult = null
        if (
          lockedListing.seller_offer_frozen &&
          lockedListing.offer_asset_code &&
          lockedListing.offer_amount > 0
        ) {
          const unfreezeIdempotencyKey = `listing_expire_unfreeze_${lockedListing.listing_id}_${Date.now()}`

          unfreezeResult = await AssetService.unfreeze(
            {
              user_id: lockedListing.seller_user_id,
              asset_code: lockedListing.offer_asset_code,
              amount: Number(lockedListing.offer_amount),
              business_type: 'market_listing_expire_unfreeze',
              idempotency_key: unfreezeIdempotencyKey,
              meta: {
                listing_id: lockedListing.listing_id,
                expire_reason: 'auto_expire_3_days'
              }
            },
            { transaction }
          )

          total_unfrozen_amount += Number(lockedListing.offer_amount)
        }

        // 3. 更新挂牌状态
        await lockedListing.update(
          {
            status: 'withdrawn',
            seller_offer_frozen: false
          },
          { transaction }
        )

        await transaction.commit()

        expired_count++
        details.push({
          listing_id: lockedListing.listing_id,
          seller_user_id: lockedListing.seller_user_id,
          offer_asset_code: lockedListing.offer_asset_code,
          offer_amount: Number(lockedListing.offer_amount),
          created_at: lockedListing.created_at,
          action: 'expired_and_unfrozen',
          success: true
        })

        logger.info(`挂牌 ${lockedListing.listing_id} 已自动过期`, {
          seller_user_id: lockedListing.seller_user_id,
          offer_asset_code: lockedListing.offer_asset_code,
          offer_amount: lockedListing.offer_amount,
          unfreeze_transaction_id: unfreezeResult?.transaction_record?.transaction_id
        })

        // 发送过期通知给卖家（站内信 + WebSocket）
        try {
          await NotificationService.notifyListingExpired(lockedListing.seller_user_id, {
            listing_id: lockedListing.listing_id,
            offer_asset_code: lockedListing.offer_asset_code,
            offer_amount: Number(lockedListing.offer_amount)
          })
        } catch (notifyError) {
          // 通知发送失败不影响主流程
          logger.warn(`挂牌 ${lockedListing.listing_id} 过期通知发送失败`, {
            error: notifyError.message
          })
        }
      } catch (error) {
        await transaction.rollback()
        failed_count++
        details.push({
          listing_id: listing.listing_id,
          seller_user_id: listing.seller_user_id,
          action: 'failed',
          success: false,
          error: error.message
        })

        logger.error(`处理挂牌 ${listing.listing_id} 过期失败`, { error: error.message })
      }
    }

    return {
      expired_count,
      failed_count,
      total_unfrozen_amount,
      details
    }
  }
}

module.exports = HourlyExpireFungibleAssetListings
