'use strict'

/**
 * 市场挂牌异常监控定时任务
 *
 * 业务场景：
 * - 监控价格异常挂牌（单价过高或过低）
 * - 监控超长时间挂牌（超过设定天数仍未成交）
 * - 监控冻结余额异常（冻结总额与挂牌不匹配）
 * - 发送监控告警给管理员
 *
 * 执行频率：每小时执行一次
 *
 * 监控规则（可配置）：
 * - 价格异常：单价低于市场均价的10%或高于市场均价的300%
 * - 超长挂牌：on_sale状态超过7天未成交
 * - 冻结异常：用户冻结总额与其挂牌资产数量不匹配
 *
 * 创建时间：2026-01-08
 */

const { MarketListing, AccountAssetBalance, Account, sequelize } = require('../models')
const { Op } = sequelize.Sequelize
const NotificationService = require('../services/NotificationService')
const logger = require('../utils/logger').logger

/**
 * 监控配置
 */
const MONITOR_CONFIG = {
  /** 价格下限阈值（市场均价的百分比） */
  price_low_threshold: 0.1,
  /** 价格上限阈值（市场均价的倍数） */
  price_high_threshold: 3.0,
  /** 超长挂牌天数阈值 */
  long_listing_days: 7,
  /** 单次检查的最大挂牌数量 */
  max_check_count: 1000
}

/**
 * 市场挂牌异常监控任务类
 */
class HourlyMarketListingMonitor {
  /**
   * 执行监控任务
   *
   * @returns {Promise<Object>} 监控报告
   */
  static async execute() {
    const report = {
      started_at: new Date().toISOString(),
      price_anomalies: [],
      long_listings: [],
      frozen_anomalies: [],
      errors: []
    }

    try {
      logger.info('[市场监控] 开始执行异常挂牌监控...')

      // 1. 价格异常监控
      await this.checkPriceAnomalies(report)

      // 2. 超长挂牌监控
      await this.checkLongListings(report)

      // 3. 冻结余额异常监控
      await this.checkFrozenAnomalies(report)

      // 4. 发送监控报告（如有异常）
      await this.sendAlertIfNeeded(report)

      report.completed_at = new Date().toISOString()
      report.success = true

      logger.info('[市场监控] 监控任务执行完成', {
        price_anomalies: report.price_anomalies.length,
        long_listings: report.long_listings.length,
        frozen_anomalies: report.frozen_anomalies.length
      })

      return report
    } catch (error) {
      report.errors.push(error.message)
      report.success = false
      logger.error('[市场监控] 监控任务执行失败:', error)
      return report
    }
  }

  /**
   * 检查价格异常
   *
   * @param {Object} report - 监控报告对象
   * @returns {Promise<void>} 无返回值，结果直接写入report对象
   */
  static async checkPriceAnomalies(report) {
    try {
      logger.info('[市场监控] 检查价格异常...')

      // 获取各资产类型的市场均价
      const avgPrices = await MarketListing.findAll({
        attributes: [
          'offer_asset_code',
          [sequelize.fn('AVG', sequelize.literal('price_amount / offer_amount')), 'avg_unit_price'],
          [sequelize.fn('COUNT', sequelize.col('listing_id')), 'listing_count']
        ],
        where: {
          listing_kind: 'fungible_asset',
          status: 'on_sale'
        },
        group: ['offer_asset_code'],
        raw: true
      })

      // 构建均价映射
      const avgPriceMap = new Map()
      avgPrices.forEach(item => {
        avgPriceMap.set(item.offer_asset_code, {
          avg_unit_price: parseFloat(item.avg_unit_price) || 0,
          listing_count: parseInt(item.listing_count, 10)
        })
      })

      // 检查每个活跃挂牌的价格
      const activeListings = await MarketListing.findAll({
        where: {
          listing_kind: 'fungible_asset',
          status: 'on_sale'
        },
        limit: MONITOR_CONFIG.max_check_count
      })

      for (const listing of activeListings) {
        const avgData = avgPriceMap.get(listing.offer_asset_code)
        if (!avgData || avgData.listing_count < 3) {
          // 挂牌数量太少，跳过均价检查
          continue
        }

        const unitPrice = listing.price_amount / listing.offer_amount
        const avgUnitPrice = avgData.avg_unit_price

        // 检查价格下限
        if (unitPrice < avgUnitPrice * MONITOR_CONFIG.price_low_threshold) {
          report.price_anomalies.push({
            listing_id: listing.listing_id,
            seller_user_id: listing.seller_user_id,
            offer_asset_code: listing.offer_asset_code,
            offer_amount: listing.offer_amount,
            price_amount: listing.price_amount,
            unit_price: unitPrice,
            avg_unit_price: avgUnitPrice,
            anomaly_type: 'price_too_low',
            description: `单价 ${unitPrice.toFixed(2)} 低于市场均价 ${avgUnitPrice.toFixed(2)} 的 ${(MONITOR_CONFIG.price_low_threshold * 100).toFixed(0)}%`
          })
        }

        // 检查价格上限
        if (unitPrice > avgUnitPrice * MONITOR_CONFIG.price_high_threshold) {
          report.price_anomalies.push({
            listing_id: listing.listing_id,
            seller_user_id: listing.seller_user_id,
            offer_asset_code: listing.offer_asset_code,
            offer_amount: listing.offer_amount,
            price_amount: listing.price_amount,
            unit_price: unitPrice,
            avg_unit_price: avgUnitPrice,
            anomaly_type: 'price_too_high',
            description: `单价 ${unitPrice.toFixed(2)} 高于市场均价 ${avgUnitPrice.toFixed(2)} 的 ${(MONITOR_CONFIG.price_high_threshold * 100).toFixed(0)}%`
          })
        }
      }

      logger.info(`[市场监控] 价格异常检查完成，发现 ${report.price_anomalies.length} 条异常`)
    } catch (error) {
      logger.error('[市场监控] 价格异常检查失败:', error)
      report.errors.push(`价格异常检查失败: ${error.message}`)
    }
  }

  /**
   * 检查超长挂牌
   *
   * @param {Object} report - 监控报告对象
   * @returns {Promise<void>} 无返回值，结果直接写入report对象
   */
  static async checkLongListings(report) {
    try {
      logger.info('[市场监控] 检查超长挂牌...')

      const threshold = new Date(
        Date.now() - MONITOR_CONFIG.long_listing_days * 24 * 60 * 60 * 1000
      )

      const longListings = await MarketListing.findAll({
        attributes: [
          'listing_id',
          'listing_kind',
          'seller_user_id',
          'offer_asset_code',
          'offer_amount',
          'price_amount',
          'created_at'
        ],
        where: {
          status: 'on_sale',
          created_at: {
            [Op.lt]: threshold
          }
        },
        limit: MONITOR_CONFIG.max_check_count
      })

      for (const listing of longListings) {
        const daysOnSale = Math.floor(
          (Date.now() - new Date(listing.created_at).getTime()) / (24 * 60 * 60 * 1000)
        )

        report.long_listings.push({
          listing_id: listing.listing_id,
          listing_kind: listing.listing_kind,
          seller_user_id: listing.seller_user_id,
          offer_asset_code: listing.offer_asset_code,
          offer_amount: listing.offer_amount,
          price_amount: listing.price_amount,
          created_at: listing.created_at,
          days_on_sale: daysOnSale,
          description: `挂牌已上架 ${daysOnSale} 天，超过阈值 ${MONITOR_CONFIG.long_listing_days} 天`
        })
      }

      logger.info(`[市场监控] 超长挂牌检查完成，发现 ${report.long_listings.length} 条超长挂牌`)
    } catch (error) {
      logger.error('[市场监控] 超长挂牌检查失败:', error)
      report.errors.push(`超长挂牌检查失败: ${error.message}`)
    }
  }

  /**
   * 检查冻结余额异常
   *
   * 检测两类异常：
   * 1. 挂牌冻结不足：用户有活跃挂牌但冻结余额小于挂牌总量
   * 2. 冻结孤儿：用户有冻结余额但无对应活跃挂牌（资金被卡死风险）
   *
   * @param {Object} report - 监控报告对象
   * @returns {Promise<void>} 无返回值，结果直接写入report对象
   */
  static async checkFrozenAnomalies(report) {
    try {
      logger.info('[市场监控] 检查冻结余额异常...')

      /*
       * ==================== Part 1: 检查挂牌冻结是否足够 ====================
       * 获取所有有活跃挂牌的用户及其挂牌资产总量
       */
      const listingTotals = await MarketListing.findAll({
        attributes: [
          'seller_user_id',
          'offer_asset_code',
          [sequelize.fn('SUM', sequelize.col('offer_amount')), 'total_listed']
        ],
        where: {
          listing_kind: 'fungible_asset',
          status: 'on_sale',
          seller_offer_frozen: true
        },
        group: ['seller_user_id', 'offer_asset_code'],
        raw: true
      })

      // 对比冻结余额（需要通过 Account 表关联 user_id → account_id）
      for (const listingTotal of listingTotals) {
        // 先查询用户的资产账户
        const account = await Account.findOne({
          where: {
            user_id: listingTotal.seller_user_id,
            account_type: 'user'
          },
          attributes: ['account_id']
        })

        if (!account) {
          report.frozen_anomalies.push({
            user_id: listingTotal.seller_user_id,
            asset_code: listingTotal.offer_asset_code,
            expected_frozen: parseInt(listingTotal.total_listed, 10),
            actual_frozen: 0,
            anomaly_type: 'account_not_found',
            description: '用户有活跃挂牌但无对应资产账户记录'
          })
          continue
        }

        // 通过 account_id 查询余额（修复原来直接用 user_id 的 bug）
        const balance = await AccountAssetBalance.findOne({
          where: {
            account_id: account.account_id,
            asset_code: listingTotal.offer_asset_code
          }
        })

        if (!balance) {
          report.frozen_anomalies.push({
            user_id: listingTotal.seller_user_id,
            account_id: account.account_id,
            asset_code: listingTotal.offer_asset_code,
            expected_frozen: parseInt(listingTotal.total_listed, 10),
            actual_frozen: 0,
            anomaly_type: 'balance_not_found',
            description: '用户有活跃挂牌但无对应资产余额记录'
          })
          continue
        }

        const expectedFrozen = parseInt(listingTotal.total_listed, 10)
        const actualFrozen = parseInt(balance.frozen_amount, 10) || 0

        // 冻结余额应该至少等于挂牌总量
        if (actualFrozen < expectedFrozen) {
          report.frozen_anomalies.push({
            user_id: listingTotal.seller_user_id,
            account_id: account.account_id,
            asset_code: listingTotal.offer_asset_code,
            expected_frozen: expectedFrozen,
            actual_frozen: actualFrozen,
            difference: expectedFrozen - actualFrozen,
            anomaly_type: 'frozen_insufficient',
            description: `冻结余额不足：应冻结 ${expectedFrozen}，实际冻结 ${actualFrozen}，差额 ${expectedFrozen - actualFrozen}`
          })
        }
      }

      /*
       * ==================== Part 2: 检查冻结孤儿（有冻结但无挂牌） ====================
       * 获取所有有冻结余额的用户账户（排除系统账户）
       */
      const frozenBalances = await AccountAssetBalance.findAll({
        attributes: ['account_id', 'asset_code', 'frozen_amount'],
        where: {
          frozen_amount: {
            [Op.gt]: 0
          }
        },
        include: [
          {
            model: Account,
            as: 'account',
            attributes: ['user_id', 'account_type'],
            where: {
              account_type: 'user' // 只检查用户账户，排除系统账户
            },
            required: true
          }
        ],
        raw: true,
        nest: true
      })

      // 构建挂牌映射（user_id + asset_code → total_listed）
      const listingMap = new Map()
      listingTotals.forEach(lt => {
        const key = `${lt.seller_user_id}_${lt.offer_asset_code}`
        listingMap.set(key, parseInt(lt.total_listed, 10))
      })

      // 检查每个冻结余额是否有对应挂牌
      for (const fb of frozenBalances) {
        const userId = fb.account?.user_id
        if (!userId) continue

        const key = `${userId}_${fb.asset_code}`
        const listedAmount = listingMap.get(key) || 0
        const frozenAmount = parseInt(fb.frozen_amount, 10)

        // 冻结 > 挂牌 = 冻结孤儿（可能是之前的挂牌被删除但未解冻）
        if (frozenAmount > listedAmount) {
          report.frozen_anomalies.push({
            user_id: userId,
            account_id: fb.account_id,
            asset_code: fb.asset_code,
            frozen_amount: frozenAmount,
            listed_amount: listedAmount,
            orphan_amount: frozenAmount - listedAmount,
            anomaly_type: 'frozen_orphan',
            description: `冻结孤儿：冻结 ${frozenAmount}，挂牌仅 ${listedAmount}，孤儿余额 ${frozenAmount - listedAmount}（资金被卡死风险）`
          })
        }
      }

      logger.info(`[市场监控] 冻结余额检查完成，发现 ${report.frozen_anomalies.length} 条异常`)
    } catch (error) {
      logger.error('[市场监控] 冻结余额检查失败:', error)
      report.errors.push(`冻结余额检查失败: ${error.message}`)
    }
  }

  /**
   * 发送告警（如有异常）
   *
   * @param {Object} report - 监控报告对象
   * @returns {Promise<void>} 无返回值
   */
  static async sendAlertIfNeeded(report) {
    const totalAnomalies =
      report.price_anomalies.length + report.long_listings.length + report.frozen_anomalies.length

    if (totalAnomalies === 0 && report.errors.length === 0) {
      logger.info('[市场监控] 无异常，不发送告警')
      return
    }

    try {
      // 构建告警内容
      const alertContent = this.buildAlertContent(report)

      // 发送管理员告警
      await NotificationService.sendToAdmins({
        type: 'market_monitor_alert',
        title: '🚨 市场挂牌异常监控告警',
        content: alertContent,
        data: {
          price_anomalies_count: report.price_anomalies.length,
          long_listings_count: report.long_listings.length,
          frozen_anomalies_count: report.frozen_anomalies.length,
          errors_count: report.errors.length,
          report_time: report.started_at
        }
      })

      logger.info('[市场监控] 告警已发送给管理员')
    } catch (error) {
      logger.error('[市场监控] 发送告警失败:', error)
    }
  }

  /**
   * 构建告警内容
   *
   * @param {Object} report - 监控报告对象
   * @returns {string} 告警内容
   */
  static buildAlertContent(report) {
    const parts = []

    if (report.price_anomalies.length > 0) {
      parts.push(`📊 价格异常: ${report.price_anomalies.length} 条`)
      report.price_anomalies.slice(0, 5).forEach(item => {
        parts.push(`  - 挂牌#${item.listing_id}: ${item.description}`)
      })
      if (report.price_anomalies.length > 5) {
        parts.push(`  - ...还有 ${report.price_anomalies.length - 5} 条`)
      }
    }

    if (report.long_listings.length > 0) {
      parts.push(`⏰ 超长挂牌: ${report.long_listings.length} 条`)
      report.long_listings.slice(0, 5).forEach(item => {
        parts.push(`  - 挂牌#${item.listing_id}: 已上架 ${item.days_on_sale} 天`)
      })
      if (report.long_listings.length > 5) {
        parts.push(`  - ...还有 ${report.long_listings.length - 5} 条`)
      }
    }

    if (report.frozen_anomalies.length > 0) {
      parts.push(`❄️ 冻结异常: ${report.frozen_anomalies.length} 条`)
      report.frozen_anomalies.slice(0, 5).forEach(item => {
        parts.push(`  - 用户#${item.user_id} ${item.asset_code}: ${item.description}`)
      })
      if (report.frozen_anomalies.length > 5) {
        parts.push(`  - ...还有 ${report.frozen_anomalies.length - 5} 条`)
      }
    }

    if (report.errors.length > 0) {
      parts.push(`⚠️ 监控错误: ${report.errors.length} 条`)
      report.errors.forEach(err => {
        parts.push(`  - ${err}`)
      })
    }

    return parts.join('\n')
  }
}

module.exports = HourlyMarketListingMonitor
