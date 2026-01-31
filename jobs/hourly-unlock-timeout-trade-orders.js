/**
 * 交易市场超时解锁任务（JSON多级锁定版本）
 *
 * 职责：
 * - 每小时扫描超时锁定的物品（trade 锁超过3分钟）
 * - 释放超时的物品锁定（使用 locks JSON 字段）
 * - 取消关联的超时订单（status: frozen → cancelled）
 * - 解冻买家冻结的资产
 *
 * 业务规则（2026-01-03 方案B升级）：
 * - 仅处理 lock_type='trade' 且 auto_release=true 的锁
 * - 物品锁定超时时间：3分钟
 * - 不处理 redemption 锁和 security 锁
 * - 订单超时后：自动取消并解冻资产
 *
 * 执行策略：
 * - 定时执行：每小时整点
 * - 并发安全：使用事务 + 悲观锁
 *
 * 创建时间：2025-12-29
 * 更新时间：2026-01-03（方案B：JSON多级锁定）
 */

'use strict'

const {
  ItemInstance,
  TradeOrder,
  ItemInstanceEvent,
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
   * 释放超时锁定的物品（JSON多级锁定版本）
   * 仅处理 lock_type='trade' 且 auto_release=true 的锁
   *
   * @private
   * @returns {Promise<Object>} 释放结果
   */
  static async _releaseTimeoutLockedItems() {
    const transaction = await sequelize.transaction()

    try {
      const timeout_threshold = new Date(Date.now() - this.LOCK_TIMEOUT_MINUTES * 60 * 1000)

      // 查询所有 locked 状态的物品
      const locked_items = await ItemInstance.findAll({
        where: { status: 'locked' },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (locked_items.length === 0) {
        await transaction.commit()
        return {
          released_count: 0,
          items: []
        }
      }

      logger.info(`找到 ${locked_items.length} 个锁定物品，开始过滤超时的 trade 锁`)

      const released_items = []

      for (const item of locked_items) {
        const locks = item.locks || []

        // 过滤出超时的 trade 锁（auto_release=true）
        const timeout_trade_locks = locks.filter(lock => {
          if (lock.lock_type !== 'trade') return false
          if (!lock.auto_release) return false
          const expires_at = new Date(lock.expires_at)
          return expires_at < timeout_threshold
        })

        if (timeout_trade_locks.length === 0) {
          continue
        }

        // 处理每个超时的 trade 锁
        for (const lock of timeout_trade_locks) {
          // 移除该锁
          const remaining_locks = locks.filter(
            l => !(l.lock_type === lock.lock_type && l.lock_id === lock.lock_id)
          )

          // eslint-disable-next-line no-await-in-loop
          await item.update(
            {
              status: remaining_locks.length === 0 ? 'available' : 'locked',
              locks: remaining_locks.length > 0 ? remaining_locks : null
            },
            { transaction }
          )

          /**
           * 记录解锁事件（统一入口：ItemInstanceEvent.recordEvent）
           *
           * 幂等键规则（确定性派生）：
           * - 格式：timeout_release:item_{item_instance_id}:lock_{lock_id}
           * - 确保同一个超时解锁操作重试时返回幂等结果
           */
          // eslint-disable-next-line no-await-in-loop
          await ItemInstanceEvent.recordEvent(
            {
              item_instance_id: item.item_instance_id,
              event_type: 'unlock',
              operator_user_id: null,
              operator_type: 'system',
              status_before: 'locked',
              status_after: remaining_locks.length === 0 ? 'available' : 'locked',
              owner_before: item.owner_user_id,
              owner_after: item.owner_user_id,
              business_type: 'trade_timeout_release',
              idempotency_key: `timeout_release:item_${item.item_instance_id}:lock_${lock.lock_id}`,
              meta: {
                lock_type: lock.lock_type,
                lock_id: lock.lock_id,
                locked_at: lock.locked_at,
                expires_at: lock.expires_at,
                release_reason: `trade 锁超时自动释放（${this.LOCK_TIMEOUT_MINUTES}分钟）`
              }
            },
            { transaction }
          )

          released_items.push({
            item_instance_id: item.item_instance_id,
            owner_user_id: item.owner_user_id,
            lock_type: lock.lock_type,
            lock_id: lock.lock_id,
            locked_at: lock.locked_at,
            expires_at: lock.expires_at
          })
        }
      }

      await transaction.commit()

      if (released_items.length > 0) {
        logger.info('✅ 批量释放超时 trade 锁', {
          released_count: released_items.length,
          items: released_items
        })
      }

      return {
        released_count: released_items.length,
        items: released_items
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
              amount: order.gross_amount,
              business_type: 'order_timeout_unfreeze',
              idempotency_key: `${order.idempotency_key}:timeout_unfreeze`,
              meta: {
                order_id: order.order_id,
                unfreeze_reason: '订单超时自动取消'
              }
            },
            { transaction }
          )

          total_unfrozen_amount += Number(order.gross_amount)

          // 解锁挂牌（更新为新的 JSON 格式）
          if (order.listing_id) {
            // eslint-disable-next-line no-await-in-loop
            const listing = await MarketListing.findByPk(order.listing_id, { transaction })
            if (listing) {
              // 清除挂牌的锁定状态
              // eslint-disable-next-line no-await-in-loop
              await listing.update(
                {
                  status: 'on_sale'
                },
                { transaction }
              )
            }
          }

          // 更新订单状态
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
            order_id: order.order_id,
            business_id: order.business_id,
            buyer_user_id: order.buyer_user_id,
            gross_amount: order.gross_amount,
            asset_code: order.asset_code,
            created_at: order.created_at
          })
        } catch (err) {
          // 单个订单处理失败，记录日志但继续处理其他订单
          logger.error('处理单个超时订单失败', {
            order_id: order.order_id,
            error: err.message
          })
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
