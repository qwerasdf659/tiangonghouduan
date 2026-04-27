/**
 * 餐厅积分抽奖系统 V4.2 - 兑换订单管理端服务（RedemptionAdminService）
 *
 * 职责：
 * - 管理员核销/取消/过期订单操作
 * - 从 RedemptionService 拆分的管理端方法
 *
 * 拆分自 RedemptionService.js（2026-04-24）
 */

const BusinessError = require('../utils/BusinessError')
const { RedemptionOrder, Item, Store, StoreStaff } = require('../models')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const ItemService = require('./asset/ItemService')

const logger = require('../utils/logger').logger

/**
 * 兑换订单管理端服务
 * @description 提供管理员核销、取消、过期等订单管理操作
 */
class RedemptionAdminService {
  /**
   * 管理员直接核销订单（通过 order_id，无需核销码）
   *
   * @param {string|number} order_id - 订单ID
   * @param {Object} options - 事务和业务选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {number} options.admin_user_id - 管理员用户ID（必填）
   * @param {number} [options.store_id] - 核销门店ID
   * @param {string} [options.remark] - 备注
   * @returns {Promise<RedemptionOrder>} 核销后的订单对象
   */
  static async adminFulfillOrderById(order_id, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'RedemptionAdminService.adminFulfillOrderById'
    )
    const { admin_user_id, store_id, staff_id, remark } = options

    if (!admin_user_id) {
      throw new BusinessError('admin_user_id 是必填参数', 'REDEMPTION_REQUIRED', 400)
    }
    logger.info('管理员开始核销订单', {
      order_id,
      admin_user_id,
      store_id,
      remark
    })

    const order = await RedemptionOrder.findByPk(order_id, {
      include: [{ model: Item, as: 'item' }],
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!order) {
      throw new BusinessError('订单不存在', 'REDEMPTION_NOT_FOUND', 404)
    }

    if (order.status === 'fulfilled') {
      throw new BusinessError('订单已核销', 'REDEMPTION_ERROR', 400)
    }
    if (order.status === 'cancelled') {
      throw new BusinessError('订单已取消', 'REDEMPTION_ERROR', 400)
    }

    if (order.status === 'expired') {
      throw new BusinessError('订单已过期', 'REDEMPTION_EXPIRED', 400)
    }

    if (order.isExpired()) {
      await order.update({ status: 'expired' }, { transaction })
      throw new BusinessError('订单已超过有效期', 'REDEMPTION_EXCEEDED', 400)
    }

    let fulfilledStoreId = store_id || null
    let fulfilledByStaffId = staff_id || null
    if (!fulfilledStoreId || !fulfilledByStaffId) {
      const staffRecord = await StoreStaff.findOne({
        where: { user_id: admin_user_id, status: 'active' },
        transaction
      })

      if (staffRecord) {
        fulfilledStoreId = fulfilledStoreId || staffRecord.store_id
        fulfilledByStaffId = fulfilledByStaffId || staffRecord.store_staff_id
      }
    }
    if (fulfilledStoreId && order.item?.merchant_id) {
      const checkStore = await Store.findByPk(fulfilledStoreId, {
        attributes: ['store_id', 'merchant_id'],
        transaction
      })

      if (checkStore && checkStore.merchant_id !== order.item.merchant_id) {
        logger.error('管理员核销 - 商家一致性校验失败', {
          item_merchant_id: order.item.merchant_id,
          store_merchant_id: checkStore.merchant_id,
          store_id: fulfilledStoreId,
          item_id: order.item_id,
          admin_user_id
        })
        throw new BusinessError(
          `核销失败：物品归属商家(${order.item.merchant_id})与核销门店归属商家(${checkStore.merchant_id})不匹配`,
          'REDEMPTION_FAILED',
          500
        )
      }
    }
    await order.update(
      {
        status: 'fulfilled',
        redeemer_user_id: admin_user_id,
        fulfilled_at: new Date(),
        fulfilled_store_id: fulfilledStoreId,
        fulfilled_by_staff_id: fulfilledByStaffId
      },
      { transaction }
    )

    if (order.item_id) {
      await ItemService.consumeItem(
        {
          item_id: order.item_id,
          operator_user_id: admin_user_id,
          business_type: 'admin_redemption_fulfill',
          idempotency_key: `admin_fulfill_${order.redemption_order_id}`,
          meta: {
            order_id: order.redemption_order_id,
            admin_user_id,
            store_id: fulfilledStoreId,
            staff_id: fulfilledByStaffId,
            remark
          }
        },
        { transaction }
      )
    }
    logger.info('管理员核销订单成功', {
      order_id: order.redemption_order_id,
      admin_user_id,
      store_id: fulfilledStoreId,
      staff_id: fulfilledByStaffId,
      remark
    })

    return order
  }

  /**
   * 管理员取消订单（通过 order_id）
   *
   * @param {string|number} order_id - 订单ID
   * @param {Object} options - 事务和业务选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {number} options.admin_user_id - 管理员用户ID（必填）
   * @param {string} [options.reason] - 取消原因
   * @returns {Promise<RedemptionOrder>} 取消后的订单对象
   */
  static async adminCancelOrderById(order_id, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'RedemptionAdminService.adminCancelOrderById'
    )
    const { admin_user_id, reason } = options

    if (!admin_user_id) {
      throw new BusinessError('admin_user_id 是必填参数', 'REDEMPTION_REQUIRED', 400)
    }

    logger.info('管理员开始取消订单', { order_id, admin_user_id, reason })
    const order = await RedemptionOrder.findByPk(order_id, {
      include: [{ model: Item, as: 'item' }],
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!order) {
      throw new BusinessError('订单不存在', 'REDEMPTION_NOT_FOUND', 404)
    }

    if (order.status === 'fulfilled') {
      throw new BusinessError('订单已核销，不能取消', 'REDEMPTION_NOT_ALLOWED', 400)
    }

    if (order.status === 'cancelled') {
      logger.info('订单已取消，幂等返回', { order_id, admin_user_id })
      return order
    }

    await order.update({ status: 'cancelled' }, { transaction })
    if (order.item) {
      await ItemService.releaseHold(
        {
          item_id: order.item_id,
          hold_type: 'redemption',
          holder_ref: String(order.redemption_order_id)
        },
        { transaction }
      )
      logger.info('物品锁定已释放', {
        item_id: order.item_id,
        order_id,
        hold_type: 'redemption',
        admin_user_id
      })
    }

    logger.info('管理员取消订单成功', {
      order_id: order.redemption_order_id,
      admin_user_id,
      reason,
      item_unlocked: true
    })

    return order
  }

  /**
   * 管理员批量核销订单
   *
   * @param {Array<number|string>} order_ids - 待核销的订单ID数组
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} options.admin_user_id - 管理员用户ID（必填）
   * @param {number} [options.store_id] - 核销门店ID
   * @param {string} [options.remark] - 备注
   * @returns {Promise<Object>} { fulfilled_count, failed_orders }
   */
  static async adminBatchFulfillOrders(order_ids, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'RedemptionAdminService.adminBatchFulfillOrders'
    )
    const { admin_user_id, store_id, remark } = options

    if (!admin_user_id) {
      throw new BusinessError('admin_user_id 是必填参数', 'REDEMPTION_REQUIRED', 400)
    }
    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      throw new BusinessError('order_ids 必须是非空数组', 'REDEMPTION_REQUIRED', 400)
    }

    logger.info('管理员开始批量核销订单', {
      order_count: order_ids.length,
      admin_user_id,
      store_id
    })

    let fulfilledCount = 0
    const failedOrders = []

    for (const order_id of order_ids) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await RedemptionAdminService.adminFulfillOrderById(order_id, {
          transaction,
          admin_user_id,
          store_id,
          remark: remark || '批量核销'
        })
        fulfilledCount++
      } catch (error) {
        logger.warn('批量核销中单个订单失败', {
          order_id,
          reason: error.message
        })
        failedOrders.push({ order_id, reason: error.message })
      }
    }
    logger.info('管理员批量核销订单完成', {
      fulfilled_count: fulfilledCount,
      failed_count: failedOrders.length,
      admin_user_id
    })

    return {
      fulfilled_count: fulfilledCount,
      failed_orders: failedOrders
    }
  }

  /**
   * 管理员批量过期订单
   *
   * @param {Array<number|string>} order_ids - 待过期的订单ID数组
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} options.admin_user_id - 管理员用户ID（必填）
   * @param {string} [options.reason] - 过期原因
   * @returns {Promise<Object>} { expired_count, unlocked_count, failed_orders }
   */
  static async adminBatchExpireOrders(order_ids, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'RedemptionAdminService.adminBatchExpireOrders'
    )
    const { admin_user_id, reason } = options

    if (!admin_user_id) {
      throw new BusinessError('admin_user_id 是必填参数', 'REDEMPTION_REQUIRED', 400)
    }

    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      throw new BusinessError('order_ids 必须是非空数组', 'REDEMPTION_REQUIRED', 400)
    }
    logger.info('管理员开始批量过期订单', {
      order_count: order_ids.length,
      admin_user_id,
      reason
    })

    const orders = await RedemptionOrder.findAll({
      where: { redemption_order_id: order_ids, status: 'pending' },
      include: [{ model: Item, as: 'item', required: false }],
      transaction
    })

    if (orders.length === 0) {
      logger.info('无符合条件的订单需要过期', { order_ids, admin_user_id })
      return { expired_count: 0, unlocked_count: 0, failed_orders: [] }
    }

    const validOrderIds = orders.map(order => order.redemption_order_id)
    await RedemptionOrder.update(
      { status: 'expired' },
      { where: { redemption_order_id: validOrderIds }, transaction }
    )
    let unlockedCount = 0
    for (const order of orders) {
      if (order.item) {
        // eslint-disable-next-line no-await-in-loop
        await ItemService.releaseHold(
          {
            item_id: order.item_id,
            hold_type: 'redemption',
            holder_ref: String(order.redemption_order_id)
          },
          { transaction }
        )
        unlockedCount++
      }
    }

    const failedOrders = order_ids.filter(id => !validOrderIds.includes(id))

    logger.info('管理员批量过期订单完成', {
      expired_count: orders.length,
      unlocked_count: unlockedCount,
      failed_count: failedOrders.length,
      admin_user_id,
      reason
    })
    return {
      expired_count: orders.length,
      unlocked_count: unlockedCount,
      failed_orders: failedOrders
    }
  }

  /**
   * 管理员批量取消订单
   *
   * @param {Array<number|string>} order_ids - 待取消的订单ID数组
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} options.admin_user_id - 管理员用户ID（必填）
   * @param {string} [options.reason] - 取消原因
   * @returns {Promise<Object>} { cancelled_count, failed_orders }
   */
  static async adminBatchCancelOrders(order_ids, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'RedemptionAdminService.adminBatchCancelOrders'
    )
    const { admin_user_id, reason } = options

    if (!admin_user_id) {
      throw new BusinessError('admin_user_id 是必填参数', 'REDEMPTION_REQUIRED', 400)
    }

    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      throw new BusinessError('order_ids 必须是非空数组', 'REDEMPTION_REQUIRED', 400)
    }
    logger.info('管理员开始批量取消订单', {
      order_count: order_ids.length,
      admin_user_id,
      reason
    })

    let cancelledCount = 0
    const failedOrders = []

    for (const order_id of order_ids) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await RedemptionAdminService.adminCancelOrderById(order_id, {
          transaction,
          admin_user_id,
          reason: reason || '批量取消'
        })
        cancelledCount++
      } catch (error) {
        logger.warn('批量取消中单个订单失败', {
          order_id,
          reason: error.message
        })
        failedOrders.push({ order_id, reason: error.message })
      }
    }
    logger.info('管理员批量取消订单完成', {
      cancelled_count: cancelledCount,
      failed_count: failedOrders.length,
      admin_user_id
    })

    return {
      cancelled_count: cancelledCount,
      failed_orders: failedOrders
    }
  }
}

module.exports = RedemptionAdminService
