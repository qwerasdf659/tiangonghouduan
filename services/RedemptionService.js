/**
 * 餐厅积分抽奖系统 V4.2 - 兑换订单服务（RedemptionService）
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
 * 事务边界治理（2026-01-05 决策）：
 * - 所有写操作 **强制要求** 外部事务传入（options.transaction）
 * - 未提供事务时直接报错（使用 assertAndGetTransaction）
 * - 服务层禁止自建事务，由入口层统一使用 TransactionManager.execute()
 *
 * 创建时间：2025-12-17
 * 最后更新：2026年01月05日（事务边界治理改造）
 */

const { sequelize, RedemptionOrder, ItemInstance, User } = require('../models')
const RedemptionCodeGenerator = require('../utils/RedemptionCodeGenerator')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')

const logger = require('../utils/logger').logger

/**
 * 兑换订单服务类
 *
 * @class RedemptionService
 * @description 核销码域核心服务，负责核销订单的全生命周期管理
 */
class RedemptionService {
  /**
   * 创建兑换订单（生成核销码）
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * 业务流程：
   * 1. 验证物品实例存在且可用
   * 2. 🔐 验证所有权或管理员权限（服务层兜底）
   * 3. 生成唯一的12位Base32核销码
   * 4. 计算SHA-256哈希
   * 5. 创建订单记录（30天有效期）
   * 6. 返回明文码（仅此一次，不再存储）
   *
   * @param {number} item_instance_id - 物品实例ID
   * @param {Object} options - 事务选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {number} [options.creator_user_id] - 创建者用户ID（用于权限兜底校验）
   * @returns {Promise<Object>} {order, code} - 订单对象和明文码
   * @throws {Error} 物品实例不存在、物品不可用、权限不足、核销码生成失败等
   *
   * @example
   * const result = await RedemptionService.createOrder(123, { transaction, creator_user_id: 456 })
   * logger.info('核销码:', result.code) // '3K7J-2MQP-WXYZ'
   * logger.info('订单ID:', result.order.order_id)
   * logger.info('过期时间:', result.order.expires_at)
   */
  static async createOrder (item_instance_id, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'RedemptionService.createOrder')
    const { creator_user_id } = options

    logger.info('开始创建兑换订单', { item_instance_id, creator_user_id })

    // 1. 验证物品实例存在且可用（使用行锁防止并发冲突）
    const item = await ItemInstance.findByPk(item_instance_id, {
      lock: transaction.LOCK.UPDATE, // 添加行锁（SELECT ... FOR UPDATE）
      transaction
    })

    if (!item) {
      throw new Error(`物品实例不存在: ${item_instance_id}`)
    }

    if (item.status !== 'available') {
      throw new Error(`物品实例不可用: status=${item.status}`)
    }

    // 1.5 幂等性检查：防止同一物品并发创建多个pending订单
    const existingOrder = await RedemptionOrder.findOne({
      where: {
        item_instance_id,
        status: 'pending'
      },
      transaction
    })

    if (existingOrder) {
      logger.warn('物品已有pending核销订单，拒绝重复创建', {
        item_instance_id,
        existing_order_id: existingOrder.order_id,
        creator_user_id
      })
      throw new Error('该物品已有待核销订单，请勿重复生成核销码')
    }

    // 🔐 2. 服务层兜底：所有权或管理员权限校验（防越权）
    if (creator_user_id) {
      // 检查创建者是否为物品所有者
      if (item.owner_user_id !== creator_user_id) {
        // 检查创建者是否为管理员（统一使用getUserRoles，基于role_level判定）
        const { getUserRoles } = require('../middleware/auth')
        const userRoles = await getUserRoles(creator_user_id)

        // 管理员判定：role_level >= 100
        if (!userRoles.isAdmin) {
          logger.error('服务层兜底：非所有者且非管理员尝试生成核销码', {
            creator_user_id,
            item_instance_id,
            actual_owner: item.owner_user_id,
            role_level: userRoles.role_level
          })
          throw new Error('权限不足：仅物品所有者或管理员可生成核销码')
        }

        logger.info('服务层验证：管理员生成核销码', {
          admin_user_id: creator_user_id,
          item_instance_id,
          actual_owner: item.owner_user_id,
          role_level: userRoles.role_level
        })
      }
    } else {
      // 如果未传入creator_user_id，记录警告（建议路由层传入）
      logger.warn('创建核销订单时未传入creator_user_id，无法执行权限兜底校验', {
        item_instance_id
      })
    }

    // 2. 生成唯一核销码（最多重试3次）
    const code = await RedemptionCodeGenerator.generateUnique(
      async generatedCode => {
        const codeHash = RedemptionCodeGenerator.hash(generatedCode)
        const existing = await RedemptionOrder.findOne({
          where: { code_hash: codeHash },
          transaction
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
      { transaction }
    )

    /*
     * 5. 立即锁定物品实例（防止码已发出但物品被转让/重复生成码）
     * 方案B升级：使用多级锁定机制，redemption 锁有效期 30 天
     */
    await item.lock(order.order_id, 'redemption', expiresAt, {
      transaction,
      reason: '兑换订单锁定'
    })

    logger.info('物品已锁定', {
      item_instance_id,
      order_id: order.order_id,
      lock_type: 'redemption',
      expires_at: expiresAt
    })

    logger.info('兑换订单创建成功', {
      order_id: order.order_id,
      item_instance_id,
      expires_at: expiresAt,
      item_locked: true
    })

    // ⚠️ 明文码只返回一次，不再存储
    return { order, code }
  }

  /**
   * 核销订单
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
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
   * @param {Object} options - 事务选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<RedemptionOrder>} 核销后的订单对象
   * @throws {Error} 核销码格式错误、订单不存在、订单已使用、订单已过期等
   *
   * @example
   * const order = await RedemptionService.fulfillOrder('3K7J-2MQP-WXYZ', 123, { transaction })
   * logger.info('核销成功:', order.order_id)
   */
  static async fulfillOrder (code, redeemer_user_id, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'RedemptionService.fulfillOrder')

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
      lock: transaction.LOCK.UPDATE, // 行锁，防止并发核销
      transaction
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
      await order.update({ status: 'expired' }, { transaction })
      throw new Error('核销码已超过有效期')
    }

    // 5. 更新订单状态
    await order.update(
      {
        status: 'fulfilled',
        redeemer_user_id,
        fulfilled_at: new Date()
      },
      { transaction }
    )

    // 6. 使用 AssetService.consumeItem() 消耗物品实例（自动记录事件）
    if (order.item_instance) {
      const AssetService = require('./AssetService')
      await AssetService.consumeItem(
        {
          item_instance_id: order.item_instance.item_instance_id,
          operator_user_id: redeemer_user_id,
          business_type: 'redemption_use',
          idempotency_key: order.order_id,
          meta: {
            order_id: order.order_id,
            redeemer_user_id,
            item_name: order.item_instance.meta?.name
          }
        },
        { transaction }
      )
    }

    logger.info('核销成功', {
      order_id: order.order_id,
      redeemer_user_id
    })

    return order
  }

  /**
   * 取消兑换订单
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {string} order_id - 订单ID（UUID）
   * @param {Object} options - 事务选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<RedemptionOrder>} 取消后的订单对象
   * @throws {Error} 订单不存在、订单已核销等
   */
  static async cancelOrder (order_id, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'RedemptionService.cancelOrder')

    logger.info('开始取消订单', { order_id })

    const order = await RedemptionOrder.findByPk(order_id, {
      lock: transaction.LOCK.UPDATE,
      transaction,
      include: [
        {
          model: ItemInstance,
          as: 'item_instance'
        }
      ]
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
      return order
    }

    // 更新订单状态为cancelled
    await order.update({ status: 'cancelled' }, { transaction })

    /*
     * 释放物品锁定（如果物品被该订单锁定）
     * 方案B升级：使用多级锁定机制，通过 lock_id 精确匹配
     */
    if (order.item_instance) {
      const existingLock = order.item_instance.getLockById(order_id)
      if (existingLock && existingLock.lock_type === 'redemption') {
        await order.item_instance.unlock(order_id, 'redemption', { transaction })
        logger.info('物品锁定已释放', {
          item_instance_id: order.item_instance_id,
          order_id,
          lock_type: 'redemption'
        })
      }
    }

    logger.info('订单取消成功', { order_id, item_unlocked: true })

    return order
  }

  /**
   * 定时任务：清理过期订单
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * 业务规则：
   * - 批量更新 status = pending 且 expires_at < now 的订单
   * - 更新为 status = expired
   *
   * @param {Object} options - 事务选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<number>} 过期订单数量
   */
  static async expireOrders (options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'RedemptionService.expireOrders')

    logger.info('开始清理过期兑换订单')

    // 1. 查找所有过期的pending订单（需要关联物品实例以便解锁）
    const expiredOrders = await RedemptionOrder.findAll({
      where: {
        status: 'pending',
        expires_at: {
          [sequelize.Sequelize.Op.lt]: new Date()
        }
      },
      include: [
        {
          model: ItemInstance,
          as: 'item_instance',
          required: false // LEFT JOIN，避免物品不存在时订单无法过期
        }
      ],
      transaction
    })

    if (expiredOrders.length === 0) {
      logger.info('无过期订单需要清理')
      return 0
    }

    // 2. 批量更新订单状态为expired
    const orderIds = expiredOrders.map(order => order.order_id)
    await RedemptionOrder.update(
      { status: 'expired' },
      {
        where: {
          order_id: orderIds
        },
        transaction
      }
    )

    /*
     * 3. 释放被这些订单锁定的物品
     * 方案B升级：使用多级锁定机制，通过 lock_id 精确匹配
     */
    let unlockedCount = 0
    for (const order of expiredOrders) {
      if (order.item_instance) {
        const existingLock = order.item_instance.getLockById(order.order_id)
        if (existingLock && existingLock.lock_type === 'redemption') {
          await order.item_instance.unlock(order.order_id, 'redemption', { transaction })
          unlockedCount++
        }
      }
    }

    logger.info('过期订单清理完成', {
      expired_count: expiredOrders.length,
      unlocked_items: unlockedCount
    })

    return expiredOrders.length
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
  static async getOrderDetail (order_id, options = {}) {
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
  static async getOrderByItem (item_instance_id, options = {}) {
    const { transaction = null } = options

    const order = await RedemptionOrder.findOne({
      where: { item_instance_id },
      order: [['created_at', 'DESC']], // 获取最新的订单
      transaction
    })

    return order
  }
}

module.exports = RedemptionService
