/**
 * 物品操作服务 - AssetService 拆分子服务
 *
 * @description 处理所有物品实例相关操作（从 AssetService 提取）
 * @module services/asset/ItemService
 * @version 1.0.0
 * @date 2026-01-31
 *
 * 职责范围：
 * - 物品铸造：mintItem（抽奖/发放/管理员赠送）
 * - 物品锁定：lockItem（多级锁定 trade/redemption/security）
 * - 物品解锁：unlockItem
 * - 所有权转移：transferItem（交易成交）
 * - 物品消耗：consumeItem（核销/使用）
 * - 事件记录：recordItemEvent
 * - 查询：getItemEvents, getUserItemInstances, getItemInstanceDetail
 *
 * 服务类型：静态类（无需实例化）
 * 服务键名：asset_item
 *
 * 依赖服务：无循环依赖（基础层服务）
 *
 * 数据模型：
 * - ItemInstance：物品实例
 * - ItemInstanceEvent：物品事件记录
 * - TradeOrder：交易订单（锁定覆盖时可能需要取消）
 *
 * 设计原则（继承自 AssetService）：
 * - 物品生命周期：mint → lock → transfer/consume → used
 * - 多级锁定：trade(3分钟) / redemption(30天) / security(无限期)
 * - 优先级规则：security > redemption > trade
 * - 幂等控制：通过 ItemInstanceEvent 的 idempotency_key 实现
 */

'use strict'

const { Op } = require('sequelize')
const logger = require('../../utils/logger')
const { requireTransaction } = require('../../utils/transactionHelpers')
const { attachDisplayNames, DICT_TYPES } = require('../../utils/displayNameHelper')

/**
 * 物品操作服务类
 *
 * @class ItemService
 * @description 处理物品实例生命周期的所有操作
 */
class ItemService {
  /**
   * 铸造物品实例（抽奖/发放/管理员赠送）
   *
   * 业务规则：
   * - 通过 source_type + source_id 实现幂等性控制
   * - 必须记录铸造事件到 item_instance_events 表
   * - 支持外部事务传入
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 目标用户ID（物品所有者）
   * @param {string} params.item_type - 物品类型（voucher/product/service/equipment/card）
   * @param {string} params.source_type - 来源类型（lottery/gift/admin/purchase）
   * @param {string} params.source_id - 来源ID（幂等关联，如 lottery_session_id）
   * @param {Object} params.meta - 物品元数据（name/description/icon/value/attributes等）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（强制要求）
   * @returns {Promise<Object>} { item_instance, is_duplicate }
   */
  static async mintItem(params, options = {}) {
    const { user_id, item_type, source_type, source_id, meta = {} } = params
    const { transaction } = options

    // 🔒 事务边界检查：强制要求传入事务
    requireTransaction(transaction, 'ItemService.mintItem')

    // 参数验证
    if (!user_id) {
      throw new Error('user_id 是必填参数')
    }
    if (!item_type) {
      throw new Error('item_type 是必填参数')
    }
    if (!source_type || !source_id) {
      throw new Error('source_type 和 source_id 是必填参数（幂等性控制）')
    }

    // 动态引入模型（避免循环依赖）
    const { ItemInstance, ItemInstanceEvent } = require('../../models')

    try {
      // 幂等性检查：通过 item_instance_events 表的 business_type + idempotency_key 检查
      const existingEvent = await ItemInstanceEvent.findOne({
        where: {
          event_type: 'mint',
          business_type: source_type,
          idempotency_key: source_id
        },
        transaction
      })

      if (existingEvent) {
        logger.info('⚠️ 幂等性检查：物品已铸造，返回原结果', {
          service: 'ItemService',
          method: 'mintItem',
          source_type,
          source_id,
          event_id: existingEvent.event_id
        })

        // 获取已存在的物品实例
        const existingInstance = await ItemInstance.findByPk(existingEvent.item_instance_id, {
          transaction
        })

        return {
          item_instance: existingInstance,
          is_duplicate: true
        }
      }

      // 创建物品实例
      const item_instance = await ItemInstance.create(
        {
          owner_user_id: user_id,
          item_type,
          status: 'available',
          meta
        },
        { transaction }
      )

      // 记录铸造事件
      await ItemInstanceEvent.recordEvent(
        {
          item_instance_id: item_instance.item_instance_id,
          event_type: 'mint',
          operator_user_id: null,
          operator_type: 'system',
          status_before: null,
          status_after: 'available',
          owner_before: null,
          owner_after: user_id,
          business_type: source_type,
          idempotency_key: source_id,
          meta: { source_type, source_id, ...meta }
        },
        { transaction }
      )

      logger.info('✅ 物品铸造成功', {
        service: 'ItemService',
        method: 'mintItem',
        item_instance_id: item_instance.item_instance_id,
        user_id,
        item_type,
        source_type,
        source_id
      })

      return {
        item_instance,
        is_duplicate: false
      }
    } catch (error) {
      logger.error('❌ 物品铸造失败', {
        service: 'ItemService',
        method: 'mintItem',
        user_id,
        item_type,
        source_type,
        source_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 锁定物品实例（多级锁定版本）
   *
   * 业务规则：
   * - 支持多级锁定：trade（3分钟）/ redemption（30天）/ security（无限期）
   * - 优先级规则：security > redemption > trade
   * - 互斥规则：一个物品同时只能有一种锁
   * - 高优先级锁可覆盖低优先级锁
   * - security 锁覆盖 trade 时，强制取消对应的 TradeOrder
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_instance_id - 物品实例ID
   * @param {string} params.lock_id - 锁ID（订单ID或业务单号）
   * @param {string} params.lock_type - 锁类型（trade/redemption/security）
   * @param {Date} params.expires_at - 过期时间
   * @param {string} params.business_type - 业务类型（可选）
   * @param {string} params.reason - 锁定原因（可选）
   * @param {Object} params.meta - 锁定元数据（可选）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（强制要求）
   * @returns {Promise<Object>} 锁定后的物品实例
   */
  static async lockItem(params, options = {}) {
    const {
      item_instance_id,
      lock_id,
      lock_type,
      expires_at,
      business_type,
      reason = '',
      meta = {}
    } = params
    const { transaction } = options

    // 🔒 事务边界检查
    requireTransaction(transaction, 'ItemService.lockItem')

    // 参数验证
    if (!item_instance_id) {
      throw new Error('item_instance_id 是必填参数')
    }
    if (!lock_id) {
      throw new Error('lock_id 是必填参数')
    }
    if (!lock_type) {
      throw new Error('lock_type 是必填参数（trade/redemption/security）')
    }
    if (!expires_at) {
      throw new Error('expires_at 是必填参数')
    }

    // 验证锁类型
    const validLockTypes = ['trade', 'redemption', 'security']
    if (!validLockTypes.includes(lock_type)) {
      throw new Error(`无效的锁类型: ${lock_type}，有效值: ${validLockTypes.join(', ')}`)
    }

    const { ItemInstance, ItemInstanceEvent, TradeOrder } = require('../../models')

    try {
      // 验证 lock_id 格式（security 必须是业务单号）
      ItemInstance.validateLockId(lock_type, lock_id)

      // 获取物品实例（悲观锁）
      const item_instance = await ItemInstance.findByPk(item_instance_id, {
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!item_instance) {
        throw new Error(`物品实例不存在：item_instance_id=${item_instance_id}`)
      }

      // 检查是否可以添加锁
      const {
        canLock,
        reason: lockReason,
        needOverride,
        existingLock
      } = item_instance.canAddLock(lock_type)

      if (!canLock) {
        throw new Error(lockReason)
      }

      // 如果需要覆盖，处理被覆盖的锁
      if (needOverride && existingLock) {
        logger.warn('⚠️ 高优先级锁覆盖低优先级锁', {
          service: 'ItemService',
          method: 'lockItem',
          item_instance_id,
          old_lock: existingLock,
          new_lock: { lock_type, lock_id }
        })

        // 如果 security 覆盖了 trade 锁，强制取消对应的 TradeOrder
        if (lock_type === 'security' && existingLock.lock_type === 'trade') {
          try {
            const [updatedCount] = await TradeOrder.update(
              {
                status: 'cancelled',
                cancel_reason: `风控冻结（业务单号: ${lock_id}）`,
                cancelled_at: new Date()
              },
              {
                where: { order_id: existingLock.lock_id },
                transaction
              }
            )

            if (updatedCount > 0) {
              logger.info('✅ 风控覆盖导致交易订单被取消', {
                service: 'ItemService',
                method: 'lockItem',
                trade_order_id: existingLock.lock_id,
                security_lock_id: lock_id
              })
            }
          } catch (error) {
            logger.error('❌ 取消交易订单失败', {
              service: 'ItemService',
              method: 'lockItem',
              trade_order_id: existingLock.lock_id,
              error: error.message
            })
            // 不阻断锁定流程，仅记录错误
          }
        }
      }

      const status_before = item_instance.status

      // 执行锁定（使用模型的 lock 方法）
      await item_instance.lock(lock_id, lock_type, expires_at, {
        transaction,
        reason: reason || `${lock_type} 锁定`
      })

      // 记录锁定事件
      await ItemInstanceEvent.recordEvent(
        {
          item_instance_id,
          event_type: 'lock',
          operator_user_id: null,
          operator_type: 'system',
          status_before,
          status_after: 'locked',
          business_type: business_type || `item_lock_${lock_type}`,
          idempotency_key: lock_id,
          meta: {
            lock_type,
            lock_id,
            expires_at: expires_at.toISOString(),
            override_info: needOverride ? { overridden_lock: existingLock } : null,
            ...meta
          }
        },
        { transaction }
      )

      logger.info('✅ 物品锁定成功', {
        service: 'ItemService',
        method: 'lockItem',
        item_instance_id,
        lock_type,
        lock_id,
        expires_at: expires_at.toISOString(),
        overridden: needOverride
      })

      await item_instance.reload({ transaction })

      return item_instance
    } catch (error) {
      logger.error('❌ 物品锁定失败', {
        service: 'ItemService',
        method: 'lockItem',
        item_instance_id,
        lock_type,
        lock_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 解锁物品实例（多级锁定版本）
   *
   * 业务规则：
   * - 需要指定 lock_id 和 lock_type 精确匹配
   * - 只有匹配的锁才会被移除
   * - locks 为空时状态变为 available
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_instance_id - 物品实例ID
   * @param {string} params.lock_id - 锁ID
   * @param {string} params.lock_type - 锁类型（trade/redemption/security）
   * @param {string} params.business_type - 业务类型（可选）
   * @param {Object} params.meta - 解锁元数据（可选）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（强制要求）
   * @returns {Promise<Object>} 解锁后的物品实例
   */
  static async unlockItem(params, options = {}) {
    const { item_instance_id, lock_id, lock_type, business_type, meta = {} } = params
    const { transaction } = options

    // 🔒 事务边界检查
    requireTransaction(transaction, 'ItemService.unlockItem')

    // 参数验证
    if (!item_instance_id) {
      throw new Error('item_instance_id 是必填参数')
    }
    if (!lock_id) {
      throw new Error('lock_id 是必填参数')
    }
    if (!lock_type) {
      throw new Error('lock_type 是必填参数（trade/redemption/security）')
    }

    const { ItemInstance, ItemInstanceEvent } = require('../../models')

    try {
      const item_instance = await ItemInstance.findByPk(item_instance_id, {
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!item_instance) {
        throw new Error(`物品实例不存在：item_instance_id=${item_instance_id}`)
      }

      // 查找指定的锁
      const existingLock = item_instance.getLockById(lock_id)
      if (!existingLock) {
        logger.warn('⚠️ 未找到要解锁的锁', {
          service: 'ItemService',
          method: 'unlockItem',
          item_instance_id,
          lock_id,
          lock_type,
          existing_locks: item_instance.locks
        })
        // 未找到锁但不抛出异常，返回当前状态
        return item_instance
      }

      // 验证锁类型匹配
      if (existingLock.lock_type !== lock_type) {
        throw new Error(`锁类型不匹配：期望 ${lock_type}，实际 ${existingLock.lock_type}`)
      }

      const status_before = item_instance.status

      // 执行解锁（使用模型的 unlock 方法）
      const unlockResult = await item_instance.unlock(lock_id, lock_type, { transaction })

      if (!unlockResult) {
        logger.warn('⚠️ 解锁操作返回 false', {
          service: 'ItemService',
          method: 'unlockItem',
          item_instance_id,
          lock_id,
          lock_type
        })
      }

      // 记录解锁事件
      await ItemInstanceEvent.recordEvent(
        {
          item_instance_id,
          event_type: 'unlock',
          operator_user_id: null,
          operator_type: 'system',
          status_before,
          status_after: item_instance.status,
          business_type: business_type || `item_unlock_${lock_type}`,
          idempotency_key: lock_id,
          meta: {
            lock_type,
            lock_id,
            previous_lock: existingLock,
            ...meta
          }
        },
        { transaction }
      )

      logger.info('✅ 物品解锁成功', {
        service: 'ItemService',
        method: 'unlockItem',
        item_instance_id,
        lock_type,
        lock_id,
        new_status: item_instance.status
      })

      await item_instance.reload({ transaction })

      return item_instance
    } catch (error) {
      logger.error('❌ 物品解锁失败', {
        service: 'ItemService',
        method: 'unlockItem',
        item_instance_id,
        lock_type,
        lock_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 转移物品所有权（交易成交）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_instance_id - 物品实例ID
   * @param {number} params.new_owner_id - 新所有者用户ID
   * @param {string} params.business_type - 业务类型（market_transfer/gift_transfer）
   * @param {string} params.idempotency_key - 业务ID（订单ID）
   * @param {Object} params.meta - 转移元数据
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（强制要求）
   * @returns {Promise<Object>} { item_instance, is_duplicate }
   */
  static async transferItem(params, options = {}) {
    const { item_instance_id, new_owner_id, business_type, idempotency_key, meta = {} } = params
    const { transaction } = options

    // 🔒 事务边界检查
    requireTransaction(transaction, 'ItemService.transferItem')

    if (!item_instance_id) {
      throw new Error('item_instance_id 是必填参数')
    }
    if (!new_owner_id) {
      throw new Error('new_owner_id 是必填参数')
    }
    if (!idempotency_key) {
      throw new Error('idempotency_key 是必填参数（幂等性控制）')
    }

    const { ItemInstance, ItemInstanceEvent } = require('../../models')

    try {
      // 幂等性检查
      const existingEvent = await ItemInstanceEvent.findOne({
        where: {
          item_instance_id,
          event_type: 'transfer',
          idempotency_key
        },
        transaction
      })

      if (existingEvent) {
        logger.info('⚠️ 幂等性检查：物品转移已存在，返回原结果', {
          service: 'ItemService',
          method: 'transferItem',
          item_instance_id,
          idempotency_key,
          event_id: existingEvent.event_id
        })

        const existingInstance = await ItemInstance.findByPk(item_instance_id, { transaction })

        return {
          item_instance: existingInstance,
          is_duplicate: true
        }
      }

      const item_instance = await ItemInstance.findByPk(item_instance_id, {
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!item_instance) {
        throw new Error(`物品实例不存在：item_instance_id=${item_instance_id}`)
      }

      if (!['available', 'locked'].includes(item_instance.status)) {
        throw new Error(`物品状态不可转移：${item_instance.status}`)
      }

      const old_owner_id = item_instance.owner_user_id

      // 执行转移
      await item_instance.transferOwnership(new_owner_id, { transaction })

      // 记录转移事件
      await ItemInstanceEvent.recordEvent(
        {
          item_instance_id,
          event_type: 'transfer',
          operator_user_id: new_owner_id,
          operator_type: 'user',
          status_before: 'locked',
          status_after: 'transferred',
          owner_before: old_owner_id,
          owner_after: new_owner_id,
          business_type: business_type || 'item_transfer',
          idempotency_key,
          meta: { from_user: old_owner_id, to_user: new_owner_id, ...meta }
        },
        { transaction }
      )

      logger.info('✅ 物品转移成功', {
        service: 'ItemService',
        method: 'transferItem',
        item_instance_id,
        from_user: old_owner_id,
        to_user: new_owner_id,
        idempotency_key
      })

      await item_instance.reload({ transaction })

      return {
        item_instance,
        is_duplicate: false
      }
    } catch (error) {
      logger.error('❌ 物品转移失败', {
        service: 'ItemService',
        method: 'transferItem',
        item_instance_id,
        new_owner_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 消耗物品实例（核销/使用）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_instance_id - 物品实例ID
   * @param {number} params.operator_user_id - 操作者用户ID
   * @param {string} params.business_type - 业务类型（redemption_use/item_use）
   * @param {string} params.idempotency_key - 业务ID（订单ID）
   * @param {Object} params.meta - 消耗元数据
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（强制要求）
   * @returns {Promise<Object>} { item_instance, is_duplicate }
   */
  static async consumeItem(params, options = {}) {
    const { item_instance_id, operator_user_id, business_type, idempotency_key, meta = {} } = params
    const { transaction } = options

    // 🔒 事务边界检查
    requireTransaction(transaction, 'ItemService.consumeItem')

    if (!item_instance_id) {
      throw new Error('item_instance_id 是必填参数')
    }
    if (!idempotency_key) {
      throw new Error('idempotency_key 是必填参数（幂等性控制）')
    }

    const { ItemInstance, ItemInstanceEvent } = require('../../models')

    try {
      // 幂等性检查
      const existingEvent = await ItemInstanceEvent.findOne({
        where: {
          item_instance_id,
          event_type: 'use',
          idempotency_key
        },
        transaction
      })

      if (existingEvent) {
        logger.info('⚠️ 幂等性检查：物品消耗已存在，返回原结果', {
          service: 'ItemService',
          method: 'consumeItem',
          item_instance_id,
          idempotency_key,
          event_id: existingEvent.event_id
        })

        const existingInstance = await ItemInstance.findByPk(item_instance_id, { transaction })

        return {
          item_instance: existingInstance,
          is_duplicate: true
        }
      }

      const item_instance = await ItemInstance.findByPk(item_instance_id, {
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!item_instance) {
        throw new Error(`物品实例不存在：item_instance_id=${item_instance_id}`)
      }

      if (!['available', 'locked'].includes(item_instance.status)) {
        throw new Error(`物品状态不可消耗：${item_instance.status}`)
      }

      const status_before = item_instance.status

      // 执行消耗
      await item_instance.markAsUsed({ transaction })

      // 记录消耗事件
      await ItemInstanceEvent.recordEvent(
        {
          item_instance_id,
          event_type: 'use',
          operator_user_id: operator_user_id || null,
          operator_type: operator_user_id ? 'user' : 'system',
          status_before,
          status_after: 'used',
          business_type: business_type || 'item_consume',
          idempotency_key,
          meta: { operator_user_id, ...meta }
        },
        { transaction }
      )

      logger.info('✅ 物品消耗成功', {
        service: 'ItemService',
        method: 'consumeItem',
        item_instance_id,
        operator_user_id,
        idempotency_key
      })

      await item_instance.reload({ transaction })

      return {
        item_instance,
        is_duplicate: false
      }
    } catch (error) {
      logger.error('❌ 物品消耗失败', {
        service: 'ItemService',
        method: 'consumeItem',
        item_instance_id,
        operator_user_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 记录物品事件（统一入口）
   *
   * @param {Object} params - 事件参数
   * @param {number} params.item_instance_id - 物品实例ID
   * @param {string} params.event_type - 事件类型（mint/lock/unlock/transfer/use/expire/destroy）
   * @param {number|null} params.operator_user_id - 操作者用户ID
   * @param {string} params.operator_type - 操作者类型（user/admin/system）
   * @param {string|null} params.status_before - 变更前状态
   * @param {string|null} params.status_after - 变更后状态
   * @param {number|null} params.owner_before - 变更前所有者
   * @param {number|null} params.owner_after - 变更后所有者
   * @param {string|null} params.business_type - 业务类型
   * @param {string|null} params.idempotency_key - 业务ID
   * @param {Object|null} params.meta - 事件元数据
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} 创建的事件记录
   */
  static async recordItemEvent(params, options = {}) {
    const { ItemInstanceEvent } = require('../../models')
    return await ItemInstanceEvent.recordEvent(params, options)
  }

  /**
   * 获取物品事件历史
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_instance_id - 物品实例ID（可选）
   * @param {number} params.user_id - 用户ID（可选，查询用户相关的所有物品事件）
   * @param {Array<string>} params.event_types - 事件类型过滤（可选）
   * @param {number} params.page - 页码（默认1）
   * @param {number} params.limit - 每页数量（默认20）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<Object>} { events, total, page, limit, total_pages }
   */
  static async getItemEvents(params, options = {}) {
    const { item_instance_id, user_id, event_types, page = 1, limit = 20 } = params
    const { transaction } = options

    const { ItemInstanceEvent, ItemInstance } = require('../../models')

    // 构建查询条件
    const where = {}

    if (item_instance_id) {
      where.item_instance_id = item_instance_id
    }

    if (event_types && event_types.length > 0) {
      where.event_type = { [Op.in]: event_types }
    }

    // 如果指定用户ID，需要 JOIN item_instances 表
    const include = []
    if (user_id) {
      include.push({
        model: ItemInstance,
        as: 'item_instance',
        where: { owner_user_id: user_id },
        attributes: ['item_instance_id', 'owner_user_id', 'item_type', 'status']
      })
    }

    const { count, rows } = await ItemInstanceEvent.findAndCountAll({
      where,
      include,
      limit,
      offset: (page - 1) * limit,
      order: [['created_at', 'DESC']],
      transaction
    })

    return {
      events: rows,
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit)
    }
  }

  /**
   * 获取用户物品实例列表（分页）
   *
   * 业务场景：
   * - 后台运营查看用户物品列表
   * - 客服查询用户物品
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {Object} filters - 筛选条件
   * @param {string} filters.item_type - 物品类型筛选（可选）
   * @param {string} filters.status - 状态筛选（可选，默认查询 available/locked）
   * @param {number} filters.page - 页码（默认1）
   * @param {number} filters.page_size - 每页数量（默认20，最大100）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<Object>} { items, total, page, page_size, total_pages }
   */
  static async getUserItemInstances(params, filters = {}, options = {}) {
    const { user_id } = params
    const { item_type, status, page = 1, page_size = 20 } = filters
    const { transaction } = options

    const { ItemInstance } = require('../../models')

    // 构建查询条件
    const where = { owner_user_id: user_id }

    if (item_type) {
      where.item_type = item_type
    }

    if (status) {
      where.status = status
    } else {
      // 默认只查询 available 和 locked 状态
      where.status = { [Op.in]: ['available', 'locked'] }
    }

    const { count, rows } = await ItemInstance.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset: (page - 1) * page_size,
      transaction
    })

    // 附加中文显示名称（status/item_type → _display/_color）
    const items = rows.map(r => (r.toJSON ? r.toJSON() : r))
    await attachDisplayNames(items, [
      { field: 'status', dictType: DICT_TYPES.ITEM_STATUS },
      { field: 'item_type', dictType: DICT_TYPES.ITEM_TYPE }
    ])

    return {
      items,
      total: count,
      page,
      page_size,
      total_pages: Math.ceil(count / page_size)
    }
  }

  /**
   * 获取物品实例详情（包含事件历史）
   *
   * 业务场景：
   * - 后台运营查看物品详情
   * - 客服查询物品完整轨迹
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（权限验证）
   * @param {number} params.item_instance_id - 物品实例ID
   * @param {Object} options - 选项
   * @param {number} options.event_limit - 事件历史数量限制（默认10）
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<Object|null>} { item, events } 或 null
   */
  static async getItemInstanceDetail(params, options = {}) {
    const { user_id, item_instance_id } = params
    const { event_limit = 10, transaction } = options

    const { ItemInstance, ItemInstanceEvent } = require('../../models')

    // 查询物品（只能查看自己的物品）
    const item = await ItemInstance.findOne({
      where: {
        item_instance_id,
        owner_user_id: user_id
      },
      transaction
    })

    if (!item) {
      return null
    }

    // 查询物品事件历史
    const events = await ItemInstanceEvent.findAll({
      where: { item_instance_id },
      order: [['created_at', 'DESC']],
      limit: event_limit,
      transaction
    })

    // 附加中文显示名称（status/item_type → _display/_color）
    const itemData = item.toJSON ? item.toJSON() : item
    await attachDisplayNames(itemData, [
      { field: 'status', dictType: DICT_TYPES.ITEM_STATUS },
      { field: 'item_type', dictType: DICT_TYPES.ITEM_TYPE }
    ])

    return {
      item: itemData,
      events
    }
  }
}

module.exports = ItemService
