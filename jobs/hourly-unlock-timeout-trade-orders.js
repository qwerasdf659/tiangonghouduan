/**
 * 交易市场超时解锁任务（三表模型版本）
 *
 * ⚠️ 注意：此任务需要重构以适配新的 ItemHold 模型
 * - 旧版本使用 ItemInstance.locks JSON 字段
 * - 新版本使用 ItemHold 表（item_holds）
 * - 当前代码仍引用旧模型，需要更新为 Item + ItemHold
 *
 * 职责：
 * - 每小时扫描超时锁定的物品（trade 锁超过3分钟）
 * - 释放超时的物品锁定（使用 item_holds 表）
 * - 取消关联的超时订单（status: frozen → cancelled）
 * - 解冻买家冻结的资产
 *
 * 业务规则：
 * - 仅处理 hold_type='trade' 且 status='active' 的锁
 * - 物品锁定超时时间：3分钟
 * - 不处理 redemption 锁和 security 锁
 * - 订单超时后：自动取消并解冻资产
 *
 * 执行策略：
 * - 定时执行：每小时整点
 * - 并发安全：使用事务 + 悲观锁
 *
 * 创建时间：2025-12-29
 * 更新时间：2026-02-22（迁移到三表模型，需要重构）
 */

'use strict'

const {
  Item: _Item,
  ItemHold: _ItemHold,
  TradeOrder,
  MarketListing,
  Op,
  sequelize
} = require('../models')
// V4.7.0 AssetService 拆分：使用子服务替代原 AssetService（2026-01-31）
const BalanceService = require('../services/asset/BalanceService')
const logger = require('../utils/logger')

/**
 * 交易市场超时解锁任务类
 *
 * @class HourlyUnlockTimeoutTradeOrders
 * @description 释放超时锁定的物品和取消超时订单（仅处理 trade 锁）
 */
class HourlyUnlockTimeoutTradeOrders {
  /**
   * 锁定超时阈值：3分钟
   */
  static LOCK_TIMEOUT_MINUTES = 3

  /**
   * 执行超时解锁任务
   *
   * @returns {Promise<Object>} 执行报告
   */
  static async execute() {
    const start_time = Date.now()
    logger.info('开始执行交易市场超时解锁任务（JSON多级锁定版本）')

    try {
      // 1. 释放超时锁定的物品（仅 trade 锁）
      const items_result = await this._releaseTimeoutLockedItems()

      // 2. 取消超时的交易订单并解冻资产
      const orders_result = await this._cancelTimeoutOrders()

      const duration_ms = Date.now() - start_time

      const report = {
        timestamp: new Date().toISOString(),
        duration_ms,
        released_items: items_result,
        cancelled_orders: orders_result,
        total_released_items: items_result.released_count,
        total_cancelled_orders: orders_result.cancelled_count,
        total_unfrozen_amount: orders_result.total_unfrozen_amount
      }

      if (items_result.released_count > 0 || orders_result.cancelled_count > 0) {
        logger.warn('交易市场超时解锁任务完成（有超时数据）', report)
      } else {
        logger.info('交易市场超时解锁任务完成（无超时数据）', report)
      }

      return report
    } catch (error) {
      logger.error('交易市场超时解锁任务失败', { error: error.message })
      throw error
    }
  }

  /**
   * 释放超时锁定的物品（三表模型版本）
   * ⚠️ TODO: 需要重构以使用 ItemHold 表替代旧 JSON locks
   *
   * 仅处理 hold_type='trade' 且 status='active' 的锁
   *
   * @private
   * @returns {Promise<Object>} 释放结果
   */
  static async _releaseTimeoutLockedItems() {
    /*
     * ⚠️ TODO: 重构此方法以使用 ItemHold 表
     * 新逻辑应该是：
     * 1. 查询 ItemHold 表中 status='active' AND hold_type='trade' AND expires_at < NOW() 的记录
     * 2. 更新这些记录的 status='expired', released_at=NOW()
     * 3. 通过 ItemLedger 记录解锁事件（而不是 ItemInstanceEvent）
     */

    logger.warn('⚠️ _releaseTimeoutLockedItems 需要重构以使用 ItemHold 表')

    const transaction = await sequelize.transaction()

    try {
      const _timeout_threshold = new Date(Date.now() - this.LOCK_TIMEOUT_MINUTES * 60 * 1000)

      /*
       * TODO: 查询超时的 trade holds
       * const expired_holds = await ItemHold.findAll({
       *   where: {
       *     hold_type: 'trade',
       *     status: 'active',
       *     expires_at: { [Op.lt]: timeout_threshold }
       *   },
       *   lock: transaction.LOCK.UPDATE,
       *   transaction
       * })
       */

      await transaction.commit()
      return {
        released_count: 0,
        items: []
      }
    } catch (error) {
      await transaction.rollback()
      logger.error('❌ 释放超时锁定物品失败', { error: error.message })
      throw error
    }
  }

  /**
   * 取消超时的交易订单并解冻资产
   *
   * @private
   * @returns {Promise<Object>} 取消结果
   */
  static async _cancelTimeoutOrders() {
    const transaction = await sequelize.transaction()

    try {
      // 查找超时的订单（created_at 超过3分钟且状态仍为 frozen）
      const timeout_threshold = new Date(Date.now() - this.LOCK_TIMEOUT_MINUTES * 60 * 1000)

      const frozen_orders = await TradeOrder.findAll({
        where: {
          status: 'frozen',
          created_at: { [Op.lt]: timeout_threshold }
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (frozen_orders.length === 0) {
        await transaction.commit()
        return {
          cancelled_count: 0,
          orders: [],
          total_unfrozen_amount: 0
        }
      }

      const cancelled_orders = []
      let total_unfrozen_amount = 0

      for (const order of frozen_orders) {
        try {
          /**
           * 解冻买家资产（幂等键派生规则：${root_idempotency_key}:timeout_unfreeze）
           *
           * 使用 order.idempotency_key 作为根幂等键（与订单创建时一致），
           * 便于通过根幂等键串联订单的所有关联流水记录。
           */
          // eslint-disable-next-line no-await-in-loop
          await BalanceService.unfreeze(
            {
              user_id: order.buyer_user_id,
              asset_code: order.asset_code,
              amount: Number(order.gross_amount),
              business_type: 'order_timeout_unfreeze',
              idempotency_key: `${order.idempotency_key}:timeout_unfreeze`,
              meta: {
                trade_order_id: order.trade_order_id,
                unfreeze_reason: '订单超时自动取消'
              }
            },
            { transaction }
          )

          total_unfrozen_amount += Number(order.gross_amount)

          // 解锁挂牌（更新为新的 JSON 格式）
          if (order.market_listing_id) {
            // eslint-disable-next-line no-await-in-loop
            const listing = await MarketListing.findByPk(order.market_listing_id, { transaction })
            if (listing) {
              // eslint-disable-next-line no-await-in-loop
              await listing.update(
                {
                  status: 'on_sale'
                },
                { transaction }
              )
            }
          }

          // eslint-disable-next-line no-await-in-loop
          await order.update(
            {
              status: 'cancelled',
              cancel_reason: '订单超时自动取消（3分钟）',
              cancelled_at: new Date()
            },
            { transaction }
          )

          cancelled_orders.push({
            trade_order_id: order.trade_order_id,
            business_id: order.business_id,
            buyer_user_id: order.buyer_user_id,
            gross_amount: order.gross_amount,
            asset_code: order.asset_code,
            created_at: order.created_at
          })
        } catch (err) {
          /*
           * 解冻失败时仍需取消订单，防止"frozen 订单永远无法取消"的无限重试循环。
           * 典型原因：历史测试残留导致 frozen_amount 与实际订单不一致。
           * 取消后标记异常原因，运营可通过对账脚本修复余额。
           */
          logger.error('超时订单解冻失败，强制取消订单以阻断重试循环', {
            trade_order_id: order.trade_order_id,
            buyer_user_id: order.buyer_user_id,
            asset_code: order.asset_code,
            gross_amount: order.gross_amount,
            error: err.message
          })

          try {
            // eslint-disable-next-line no-await-in-loop
            await order.update(
              {
                status: 'cancelled',
                cancel_reason: `订单超时取消（解冻失败：${err.message}）`,
                cancelled_at: new Date()
              },
              { transaction }
            )

            if (order.market_listing_id) {
              // eslint-disable-next-line no-await-in-loop
              const listing = await MarketListing.findByPk(order.market_listing_id, { transaction })
              if (listing && listing.status === 'locked') {
                // eslint-disable-next-line no-await-in-loop
                await listing.update({ status: 'on_sale' }, { transaction })
              }
            }

            cancelled_orders.push({
              trade_order_id: order.trade_order_id,
              business_id: order.business_id,
              buyer_user_id: order.buyer_user_id,
              gross_amount: order.gross_amount,
              asset_code: order.asset_code,
              created_at: order.created_at,
              unfreeze_failed: true
            })
          } catch (cancelErr) {
            logger.error('强制取消订单也失败', {
              trade_order_id: order.trade_order_id,
              error: cancelErr.message
            })
          }
        }
      }

      await transaction.commit()

      if (cancelled_orders.length > 0) {
        logger.info('✅ 批量取消超时交易订单', {
          cancelled_count: cancelled_orders.length,
          total_unfrozen_amount,
          orders: cancelled_orders
        })
      }

      return {
        cancelled_count: cancelled_orders.length,
        orders: cancelled_orders,
        total_unfrozen_amount
      }
    } catch (error) {
      await transaction.rollback()
      logger.error('❌ 取消超时交易订单失败', { error: error.message })
      throw error
    }
  }
}

module.exports = HourlyUnlockTimeoutTradeOrders
