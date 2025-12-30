/**
 * 交易市场超时解锁任务
 *
 * 职责：
 * - 每小时扫描超时锁定的物品（超过3分钟）
 * - 释放超时的物品锁定（status: locked → available）
 * - 取消关联的超时订单（status: frozen → cancelled）
 * - 解冻买家冻结的资产
 *
 * 业务规则（拍板决策）：
 * - 物品锁定超时时间：3分钟
 * - 订单超时后：自动取消并解冻资产（与商家审核不同，可以自动解冻）
 * - 记录超时解锁事件到 item_instance_events
 *
 * 执行策略：
 * - 定时执行：每小时整点
 * - 并发安全：使用事务 + 悲观锁
 *
 * 创建时间：2025-12-29
 * 使用模型：Claude Opus 4.5
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
const AssetService = require('../services/AssetService')
const logger = require('../utils/logger')

/**
 * 交易市场超时解锁任务类
 *
 * @class HourlyUnlockTimeoutTradeOrders
 * @description 释放超时锁定的物品和取消超时订单
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
    logger.info('开始执行交易市场超时解锁任务')

    try {
      // 1. 释放超时锁定的物品
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
   * 释放超时锁定的物品
   *
   * @private
   * @returns {Promise<Object>} 释放结果
   */
  static async _releaseTimeoutLockedItems() {
    const transaction = await sequelize.transaction()

    try {
      // 查找超时锁定的物品（locked_at 超过3分钟）
      const timeout_threshold = new Date(Date.now() - this.LOCK_TIMEOUT_MINUTES * 60 * 1000)

      const locked_items = await ItemInstance.findAll({
        where: {
          status: 'locked',
          locked_at: { [Op.lt]: timeout_threshold }
        },
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

      const released_items = []

      for (const item of locked_items) {
        // 检查是否有关联的进行中订单
        // eslint-disable-next-line no-await-in-loop
        const pending_order = await TradeOrder.findOne({
          where: {
            [Op.or]: [
              { listing_id: { [Op.not]: null } } // 通过 listing 关联的订单
            ],
            status: 'frozen'
          },
          include: [
            {
              model: MarketListing,
              as: 'listing',
              where: {
                offer_item_instance_id: item.item_instance_id
              }
            }
          ],
          transaction
        })

        // 如果没有关联订单，或者订单已经不是 frozen 状态，直接释放锁
        // eslint-disable-next-line no-await-in-loop
        await item.update(
          {
            status: 'available',
            locked_by_order_id: null,
            locked_at: null
          },
          { transaction }
        )

        // 记录解锁事件
        // eslint-disable-next-line no-await-in-loop
        await ItemInstanceEvent.create(
          {
            item_instance_id: item.item_instance_id,
            event_type: 'unlock',
            operator_user_id: null,
            operator_type: 'system',
            status_before: 'locked',
            status_after: 'available',
            owner_before: item.owner_user_id,
            owner_after: item.owner_user_id,
            business_type: 'timeout_release',
            business_id: `timeout_${item.item_instance_id}_${Date.now()}`,
            meta: {
              locked_by_order_id: item.locked_by_order_id,
              locked_at: item.locked_at,
              release_reason: `锁超时自动释放（${this.LOCK_TIMEOUT_MINUTES}分钟）`,
              has_pending_order: !!pending_order
            }
          },
          { transaction }
        )

        released_items.push({
          item_instance_id: item.item_instance_id,
          owner_user_id: item.owner_user_id,
          locked_by_order_id: item.locked_by_order_id,
          locked_at: item.locked_at
        })
      }

      await transaction.commit()

      logger.info('✅ 批量释放超时锁定物品', {
        released_count: released_items.length,
        items: released_items
      })

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
          // 解冻买家资产
          // eslint-disable-next-line no-await-in-loop
          await AssetService.unfreeze(
            {
              user_id: order.buyer_user_id,
              asset_code: order.asset_code,
              amount: order.gross_amount,
              business_type: 'order_timeout_unfreeze',
              idempotency_key: `${order.business_id}:timeout_unfreeze`,
              meta: {
                order_id: order.order_id,
                unfreeze_reason: '订单超时自动取消'
              }
            },
            { transaction }
          )

          total_unfrozen_amount += Number(order.gross_amount)

          // 解锁挂牌
          if (order.listing_id) {
            // eslint-disable-next-line no-await-in-loop
            await MarketListing.update(
              {
                status: 'on_sale',
                locked_by_order_id: null,
                locked_at: null
              },
              {
                where: { listing_id: order.listing_id },
                transaction
              }
            )
          }

          // 更新订单状态
          // eslint-disable-next-line no-await-in-loop
          await order.update(
            {
              status: 'cancelled',
              cancel_reason: '订单超时自动取消',
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

      logger.info('✅ 批量取消超时交易订单', {
        cancelled_count: cancelled_orders.length,
        total_unfrozen_amount,
        orders: cancelled_orders
      })

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
