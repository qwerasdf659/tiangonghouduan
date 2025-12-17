/**
 * 餐厅积分抽奖系统 V4.2 - 兑换订单服务（RedemptionOrderService）
 *
 * 职责：
 * - 核销码域（Redemption Code Domain）核心服务
 * - 统一管理核销订单的创建、核销、取消、过期
 * - 协调物品实例状态变更（调用 ItemInstance）
 * - 提供强幂等性保证（code_hash 唯一）
 *
 * 业务流程：
 * 1. 创建订单（createOrder）：
 *    - 验证物品实例状态（available）
 *    - 生成12位Base32核销码
 *    - 计算SHA-256哈希
 *    - 创建订单记录（status = pending, expires_at = now + 30天）
 *    - 返回明文码（仅一次）
 * 2. 核销订单（fulfillOrder）：
 *    - 验证核销码格式
 *    - 计算哈希查找订单
 *    - 检查订单状态和过期时间
 *    - 更新订单状态（status = fulfilled）
 *    - 标记物品已使用（ItemInstance.status = used）
 * 3. 取消订单（cancelOrder）：
 *    - 更新订单状态（status = cancelled）
 * 4. 过期清理（expireOrders）：
 *    - 批量更新过期订单（status = expired）
 *
 * 创建时间：2025-12-17
 * 使用模型：Claude Sonnet 4.5
 */

const { sequelize, RedemptionOrder, ItemInstance, User } = require('../models')
const RedemptionCodeGenerator = require('../utils/RedemptionCodeGenerator')
const Logger = require('./UnifiedLotteryEngine/utils/Logger')

const logger = new Logger('RedemptionOrderService')

/**
 * 兑换订单服务类
 *
 * @class RedemptionOrderService
 * @description 核销码域核心服务，负责核销订单的全生命周期管理
 */
class RedemptionOrderService {
  /**
   * 创建兑换订单（生成核销码）
   *
   * 业务流程：
   * 1. 验证物品实例存在且可用
   * 2. 生成唯一的12位Base32核销码
   * 3. 计算SHA-256哈希
   * 4. 创建订单记录（30天有效期）
   * 5. 返回明文码（仅此一次，不再存储）
   *
   * @param {number} item_instance_id - 物品实例ID
   * @param {Object} [options] - 事务选项
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<Object>} {order, code} - 订单对象和明文码
   * @throws {Error} 物品实例不存在、物品不可用、核销码生成失败等
   *
   * @example
   * const result = await RedemptionOrderService.createOrder(123)
   * console.log('核销码:', result.code) // '3K7J-2MQP-WXYZ'
   * console.log('订单ID:', result.order.order_id)
   * console.log('过期时间:', result.order.expires_at)
   */
  static async createOrder(item_instance_id, options = {}) {
    const { transaction: externalTx } = options
    const tx = externalTx || (await sequelize.transaction())
    const shouldCommit = !externalTx

    try {
      logger.info('开始创建兑换订单', { item_instance_id })

      // 1. 验证物品实例存在且可用
      const item = await ItemInstance.findByPk(item_instance_id, {
        transaction: tx
      })

      if (!item) {
        throw new Error(`物品实例不存在: ${item_instance_id}`)
      }

      if (item.status !== 'available') {
        throw new Error(`物品实例不可用: status=${item.status}`)
      }

      // 2. 生成唯一核销码（最多重试3次）
      const code = await RedemptionCodeGenerator.generateUnique(
        async generatedCode => {
          const codeHash = RedemptionCodeGenerator.hash(generatedCode)
          const existing = await RedemptionOrder.findOne({
            where: { code_hash: codeHash },
            transaction: tx
          })
          return !existing // 返回true表示唯一
        },
        3 // 最多重试3次
      )

      const codeHash = RedemptionCodeGenerator.hash(code)

      // 3. 计算过期时间（30天后）
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 30)

      // 4. 创建订单记录
      const order = await RedemptionOrder.create(
        {
          code_hash: codeHash,
          item_instance_id,
          expires_at: expiresAt,
          status: 'pending'
        },
        { transaction: tx }
      )

      if (shouldCommit) await tx.commit()

      logger.info('兑换订单创建成功', {
        order_id: order.order_id,
        item_instance_id,
        expires_at: expiresAt
      })

      // ⚠️ 明文码只返回一次，不再存储
      return { order, code }
    } catch (error) {
      if (shouldCommit) await tx.rollback()
      logger.error('兑换订单创建失败', {
        error: error.message,
        item_instance_id
      })
      throw error
    }
  }

  /**
   * 核销订单
   *
   * 业务流程：
   * 1. 验证核销码格式
   * 2. 计算哈希查找订单
   * 3. 检查订单状态和过期时间
   * 4. 更新订单状态（fulfilled）
   * 5. 标记物品已使用（used）
   *
   * @param {string} code - 12位Base32核销码（格式：XXXX-YYYY-ZZZZ）
   * @param {number} redeemer_user_id - 核销用户ID
   * @param {Object} [options] - 事务选项
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<RedemptionOrder>} 核销后的订单对象
   * @throws {Error} 核销码格式错误、订单不存在、订单已使用、订单已过期等
   *
   * @example
   * const order = await RedemptionOrderService.fulfillOrder('3K7J-2MQP-WXYZ', 123)
   * console.log('核销成功:', order.order_id)
   */
  static async fulfillOrder(code, redeemer_user_id, options = {}) {
    const { transaction: externalTx } = options
    const tx = externalTx || (await sequelize.transaction())
    const shouldCommit = !externalTx

    try {
      logger.info('开始核销订单', {
        code_partial: code.slice(0, 4) + '****',
        redeemer_user_id
      })

      // 1. 验证核销码格式
      if (!RedemptionCodeGenerator.validate(code)) {
        throw new Error('核销码格式错误')
      }

      // 2. 计算哈希查找订单
      const codeHash = RedemptionCodeGenerator.hash(code)

      const order = await RedemptionOrder.findOne({
        where: { code_hash: codeHash },
        include: [
          {
            model: ItemInstance,
            as: 'item_instance'
          }
        ],
        lock: tx.LOCK.UPDATE, // 行锁，防止并发核销
        transaction: tx
      })

      if (!order) {
        throw new Error('核销码不存在')
      }

      // 3. 检查订单状态
      if (order.status === 'fulfilled') {
        throw new Error('核销码已被使用')
      }

      if (order.status === 'cancelled') {
        throw new Error('核销码已取消')
      }

      if (order.status === 'expired') {
        throw new Error('核销码已过期')
      }

      // 4. 检查是否超过有效期
      if (order.isExpired()) {
        // 自动标记为过期
        await order.update({ status: 'expired' }, { transaction: tx })
        throw new Error('核销码已超过有效期')
      }

      // 5. 更新订单状态
      await order.update(
        {
          status: 'fulfilled',
          redeemer_user_id,
          fulfilled_at: new Date()
        },
        { transaction: tx }
      )

      // 6. 标记物品实例为已使用
      if (order.item_instance) {
        await order.item_instance.update({ status: 'used' }, { transaction: tx })
      }

      if (shouldCommit) await tx.commit()

      logger.info('核销成功', {
        order_id: order.order_id,
        redeemer_user_id
      })

      return order
    } catch (error) {
      if (shouldCommit) await tx.rollback()
      logger.error('核销失败', {
        error: error.message,
        code_partial: code.slice(0, 4) + '****'
      })
      throw error
    }
  }

  /**
   * 取消兑换订单
   *
   * @param {string} order_id - 订单ID（UUID）
   * @param {Object} [options] - 事务选项
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<RedemptionOrder>} 取消后的订单对象
   * @throws {Error} 订单不存在、订单已核销等
   */
  static async cancelOrder(order_id, options = {}) {
    const { transaction: externalTx } = options
    const tx = externalTx || (await sequelize.transaction())
    const shouldCommit = !externalTx

    try {
      logger.info('开始取消订单', { order_id })

      const order = await RedemptionOrder.findByPk(order_id, {
        lock: tx.LOCK.UPDATE,
        transaction: tx
      })

      if (!order) {
        throw new Error('订单不存在')
      }

      if (order.status === 'fulfilled') {
        throw new Error('订单已核销，不能取消')
      }

      if (order.status === 'cancelled') {
        // 幂等：已取消的订单再次取消，直接返回
        logger.info('订单已取消，幂等返回', { order_id })
        if (shouldCommit) await tx.commit()
        return order
      }

      await order.update({ status: 'cancelled' }, { transaction: tx })

      if (shouldCommit) await tx.commit()

      logger.info('订单取消成功', { order_id })

      return order
    } catch (error) {
      if (shouldCommit) await tx.rollback()
      logger.error('订单取消失败', {
        error: error.message,
        order_id
      })
      throw error
    }
  }

  /**
   * 定时任务：清理过期订单
   *
   * 业务规则：
   * - 批量更新 status = pending 且 expires_at < now 的订单
   * - 更新为 status = expired
   *
   * @returns {Promise<number>} 过期订单数量
   */
  static async expireOrders() {
    const tx = await sequelize.transaction()

    try {
      logger.info('开始清理过期兑换订单')

      const [affectedCount] = await RedemptionOrder.update(
        { status: 'expired' },
        {
          where: {
            status: 'pending',
            expires_at: {
              [sequelize.Sequelize.Op.lt]: new Date()
            }
          },
          transaction: tx
        }
      )

      await tx.commit()

      logger.info('过期订单清理完成', { expired_count: affectedCount })

      return affectedCount
    } catch (error) {
      await tx.rollback()
      logger.error('过期订单清理失败', { error: error.message })
      throw error
    }
  }

  /**
   * 查询订单详情
   *
   * @param {string} order_id - 订单ID（UUID）
   * @param {Object} [options] - 选项
   * @param {boolean} [options.include_item] - 是否包含物品实例信息
   * @param {boolean} [options.include_redeemer] - 是否包含核销人信息
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<RedemptionOrder>} 订单对象
   */
  static async getOrderDetail(order_id, options = {}) {
    const { include_item = false, include_redeemer = false, transaction = null } = options

    const include = []

    if (include_item) {
      include.push({
        model: ItemInstance,
        as: 'item_instance'
      })
    }

    if (include_redeemer) {
      include.push({
        model: User,
        as: 'redeemer',
        attributes: ['user_id', 'mobile', 'nickname']
      })
    }

    const order = await RedemptionOrder.findByPk(order_id, {
      include,
      transaction
    })

    if (!order) {
      throw new Error('订单不存在')
    }

    return order
  }

  /**
   * 查询物品实例的兑换订单
   *
   * @param {number} item_instance_id - 物品实例ID
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<RedemptionOrder|null>} 订单对象或null
   */
  static async getOrderByItem(item_instance_id, options = {}) {
    const { transaction = null } = options

    const order = await RedemptionOrder.findOne({
      where: { item_instance_id },
      order: [['created_at', 'DESC']], // 获取最新的订单
      transaction
    })

    return order
  }
}

module.exports = RedemptionOrderService
