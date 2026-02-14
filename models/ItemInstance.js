/**
 * 物品实例模型（Item Instance Model）
 *
 * Phase 3 - P3-1：物品实例真相模型
 * 升级时间：2026-01-03（方案B：JSON多级锁定机制）
 *
 * 业务场景：
 * - 不可叠加物品的所有权真相（装备、卡牌、兑换券、二手商品等）
 * - 支持物品实例状态机（available/locked/transferred/used/expired）
 * - 支持多级锁定机制（locks JSON字段）
 *
 * 多级锁定机制：
 * - trade: 交易订单锁定（3分钟TTL，自动释放）
 * - redemption: 兑换码锁定（30天TTL，手动释放）
 * - security: 风控冻结锁定（无限期，仅管理员显式解锁）
 *
 * 锁覆盖规则：
 * - 优先级: security(3) > redemption(2) > trade(1)
 * - security 可覆盖 trade/redemption（用于紧急风控冻结）
 * - 互斥原则：一个物品同时只能有一种锁
 *
 * 硬约束（来自文档）：
 * - **单一真相**：物品所有权只能来自 item_instances 表
 * - **状态机**：available→locked→transferred/used/expired
 * - **锁超时**：trade 3分钟，redemption 30天，security 无限期
 *
 * 表名（snake_case）：item_instances
 * 主键命名：item_instance_id
 * 创建时间：2025-12-15
 * 更新时间：2026-01-03（方案B：JSON多级锁定，移除旧字段）
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 锁类型优先级映射
 * 数值越大优先级越高
 */
const LOCK_PRIORITY = {
  trade: 1, // 交易订单锁：最低优先级
  redemption: 2, // 兑换码锁：中优先级
  security: 3 // 风控锁：最高优先级
}

/**
 * 有效的锁类型列表
 */
const VALID_LOCK_TYPES = ['trade', 'redemption', 'security']

/**
 * ItemInstance 类定义（物品实例模型）
 */
class ItemInstance extends Model {
  /**
   * 模型关联定义
   *
   * @param {Object} models - 所有模型的映射对象
   * @returns {void} 无返回值
   */
  static associate(models) {
    // 物品实例属于某个用户（所有权真相）
    ItemInstance.belongsTo(models.User, {
      foreignKey: 'owner_user_id',
      as: 'owner',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })

    // 物品实例关联物品模板（获取分类和稀有度信息）
    ItemInstance.belongsTo(models.ItemTemplate, {
      foreignKey: 'item_template_id',
      as: 'itemTemplate',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
      comment: '物品模板关联（获取类目/稀有度等快照信息）'
    })
  }

  /**
   * 检查物品是否可用（未锁定且状态为available）
   *
   * @returns {boolean} 是否可用 - true表示可用，false表示不可用
   */
  isAvailable() {
    const locks = this.locks || []
    return this.status === 'available' && locks.length === 0
  }

  /**
   * 检查是否有任何锁定
   *
   * @returns {boolean} 是否有锁定 - true表示有锁定
   */
  isLocked() {
    const locks = this.locks || []
    return locks.length > 0
  }

  /**
   * 检查是否有指定类型的锁
   *
   * @param {string} lockType - 锁类型（trade/redemption/security）
   * @returns {boolean} 是否有该类型锁
   */
  hasLock(lockType) {
    const locks = this.locks || []
    return locks.some(lock => lock.lock_type === lockType)
  }

  /**
   * 获取所有锁的类型列表
   *
   * @returns {Array<string>} 锁类型数组
   */
  getLockTypes() {
    const locks = this.locks || []
    return locks.map(lock => lock.lock_type)
  }

  /**
   * 获取最高优先级的锁
   *
   * @returns {Object|null} 最高优先级锁对象，无锁返回null
   */
  getHighestPriorityLock() {
    const locks = this.locks || []
    if (locks.length === 0) return null

    return locks.reduce((highest, lock) => {
      const currentPriority = LOCK_PRIORITY[lock.lock_type] || 0
      const highestPriority = LOCK_PRIORITY[highest.lock_type] || 0
      return currentPriority > highestPriority ? lock : highest
    }, locks[0])
  }

  /**
   * 获取指定类型的锁
   *
   * @param {string} lockType - 锁类型
   * @returns {Object|null} 锁对象，不存在返回null
   */
  getLock(lockType) {
    const locks = this.locks || []
    return locks.find(lock => lock.lock_type === lockType) || null
  }

  /**
   * 获取指定订单ID的锁
   *
   * @param {string} lockId - 锁ID（订单ID）
   * @returns {Object|null} 锁对象，不存在返回null
   */
  getLockById(lockId) {
    const locks = this.locks || []
    return locks.find(lock => lock.lock_id === lockId) || null
  }

  /**
   * 验证 lock_id 格式（security 必须是业务单号）
   *
   * @param {string} lockType - 锁类型
   * @param {string} lockId - 锁ID
   * @throws {Error} 当 security 锁的 lock_id 格式不正确时抛出错误
   * @returns {boolean} 验证通过返回 true
   */
  static validateLockId(lockType, lockId) {
    if (lockType === 'security') {
      // security 必须是业务单号格式：risk_case_xxx 或 appeal_xxx
      if (!lockId.match(/^(risk_case_|appeal_)\w+$/)) {
        throw new Error(
          `security 锁的 lock_id 必须是业务单号格式（risk_case_xxx 或 appeal_xxx），当前: ${lockId}`
        )
      }
    }
    return true
  }

  /**
   * 检查是否可以添加指定类型的锁
   * 基于互斥规则和优先级规则
   *
   * @param {string} newLockType - 要添加的锁类型
   * @returns {Object} { canLock: boolean, reason: string, needOverride: boolean, existingLock: Object|null }
   */
  canAddLock(newLockType) {
    const locks = this.locks || []

    // 没有现有锁，可以添加
    if (locks.length === 0) {
      return { canLock: true, reason: '无现有锁定', needOverride: false, existingLock: null }
    }

    const existingLock = locks[0] // 互斥规则：只有一个锁
    const existingPriority = LOCK_PRIORITY[existingLock.lock_type] || 0
    const newPriority = LOCK_PRIORITY[newLockType] || 0

    // 高优先级锁可以覆盖低优先级锁
    if (newPriority > existingPriority) {
      return {
        canLock: true,
        reason: `高优先级锁 ${newLockType} 可覆盖 ${existingLock.lock_type}`,
        needOverride: true,
        existingLock
      }
    }

    // 低优先级或同优先级无法添加
    return {
      canLock: false,
      reason: `物品已被 ${existingLock.lock_type} 锁定（订单: ${existingLock.lock_id}），${newLockType} 优先级不足`,
      needOverride: false,
      existingLock
    }
  }

  /**
   * 检查锁定是否超时
   * 仅对 auto_release=true 的锁有效
   *
   * @returns {boolean} 是否有超时的锁
   */
  hasTimeoutLock() {
    const locks = this.locks || []
    const now = new Date()

    return locks.some(lock => {
      if (!lock.auto_release) return false
      const expiresAt = new Date(lock.expires_at)
      return expiresAt < now
    })
  }

  /**
   * 获取所有超时的锁
   *
   * @returns {Array<Object>} 超时锁数组
   */
  getTimeoutLocks() {
    const locks = this.locks || []
    const now = new Date()

    return locks.filter(lock => {
      if (!lock.auto_release) return false
      const expiresAt = new Date(lock.expires_at)
      return expiresAt < now
    })
  }

  /**
   * 锁定物品（用于订单下单）
   * 注意：推荐使用 ItemService.lockItem()，此方法仅用于内部调用
   *
   * @param {string} lockId - 锁ID（订单ID）
   * @param {string} lockType - 锁类型（trade/redemption/security）
   * @param {Date} expiresAt - 过期时间
   * @param {Object} options - 选项参数
   * @param {Sequelize.Transaction} options.transaction - 事务对象
   * @param {string} options.reason - 锁定原因
   * @returns {Promise<Object>} 新创建的锁对象
   */
  async lock(lockId, lockType, expiresAt, options = {}) {
    const { transaction, reason = '' } = options

    // 验证锁类型
    if (!VALID_LOCK_TYPES.includes(lockType)) {
      throw new Error(`无效的锁类型: ${lockType}，有效值: ${VALID_LOCK_TYPES.join(', ')}`)
    }

    // 验证 lock_id 格式
    ItemInstance.validateLockId(lockType, lockId)

    // 检查是否可以添加锁
    const { canLock, reason: lockReason } = this.canAddLock(lockType)
    if (!canLock) {
      throw new Error(lockReason)
    }

    // 构建北京时间格式的时间字符串
    const now = new Date()
    const lockedAtStr = this._formatBeijingTime(now)
    const expiresAtStr = this._formatBeijingTime(expiresAt)

    // 创建新锁对象
    const newLock = {
      lock_type: lockType,
      lock_id: lockId,
      locked_at: lockedAtStr,
      expires_at: expiresAtStr,
      auto_release: lockType === 'trade', // 仅交易锁自动释放
      reason: reason || `${lockType} 锁定`
    }

    // 互斥规则：替换现有锁（如果有覆盖则记录日志）
    const newLocks = [newLock]

    await this.update(
      {
        status: 'locked',
        locks: newLocks
      },
      { transaction }
    )

    return newLock
  }

  /**
   * 解锁物品（用于订单取消/超时）
   * 注意：推荐使用 ItemService.unlockItem()，此方法仅用于内部调用
   *
   * @param {string} lockId - 锁ID
   * @param {string} lockType - 锁类型
   * @param {Object} options - 选项参数
   * @param {Sequelize.Transaction} options.transaction - 事务对象
   * @returns {Promise<boolean>} 解锁成功返回 true
   */
  async unlock(lockId, lockType, options = {}) {
    const { transaction } = options
    const locks = this.locks || []

    // 查找要移除的锁
    const lockIndex = locks.findIndex(
      lock => lock.lock_type === lockType && lock.lock_id === lockId
    )

    if (lockIndex === -1) {
      // 未找到锁，不抛出异常但返回 false
      return false
    }

    // 移除指定锁
    locks.splice(lockIndex, 1)

    // 状态一致性规则：locks 为空才变为 available
    const newStatus = locks.length === 0 ? 'available' : 'locked'

    await this.update(
      {
        status: newStatus,
        locks: locks.length > 0 ? locks : null // 空数组存为 null
      },
      { transaction }
    )

    return true
  }

  /**
   * 强制清除所有锁定（仅用于系统管理）
   *
   * @param {Object} options - 选项参数
   * @param {Sequelize.Transaction} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   */
  async clearAllLocks(options = {}) {
    await this.update(
      {
        status: 'available',
        locks: null
      },
      options
    )
  }

  /**
   * 转移所有权（用于交易成交）
   *
   * @param {number} newOwnerId - 新所有者用户ID
   * @param {Object} options - 选项参数
   * @param {Sequelize.Transaction} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   */
  async transferOwnership(newOwnerId, options = {}) {
    await this.update(
      {
        owner_user_id: newOwnerId,
        status: 'transferred',
        locks: null // 转移后清除所有锁定
      },
      options
    )
  }

  /**
   * 标记为已使用（用于兑换/核销）
   *
   * @param {Object} options - 选项参数
   * @param {Sequelize.Transaction} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   */
  async markAsUsed(options = {}) {
    await this.update(
      {
        status: 'used',
        locks: null // 使用后清除所有锁定
      },
      options
    )
  }

  /**
   * 标记为已过期
   *
   * @param {Object} options - 选项参数
   * @param {Sequelize.Transaction} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   */
  async markAsExpired(options = {}) {
    await this.update(
      {
        status: 'expired',
        locks: null // 过期后清除所有锁定
      },
      options
    )
  }

  /**
   * 格式化为北京时间 ISO8601 字符串
   *
   * @private
   * @param {Date} date - 日期对象
   * @returns {string} 北京时间格式字符串 (YYYY-MM-DDTHH:mm:ss.SSS+08:00)
   */
  _formatBeijingTime(date) {
    // 获取北京时间（UTC+8）
    const beijingOffset = 8 * 60 * 60 * 1000
    const beijingDate = new Date(date.getTime() + beijingOffset)

    const year = beijingDate.getUTCFullYear()
    const month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0')
    const day = String(beijingDate.getUTCDate()).padStart(2, '0')
    const hours = String(beijingDate.getUTCHours()).padStart(2, '0')
    const minutes = String(beijingDate.getUTCMinutes()).padStart(2, '0')
    const seconds = String(beijingDate.getUTCSeconds()).padStart(2, '0')
    const ms = String(beijingDate.getUTCMilliseconds()).padStart(3, '0')

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}+08:00`
  }
}

module.exports = sequelize => {
  ItemInstance.init(
    {
      // 主键ID（Item Instance ID）
      item_instance_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '物品实例ID（自增主键）'
      },

      // 所有者用户ID（Owner User ID - 所有权真相）
      owner_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '所有者用户ID（所有权真相，关联 users.user_id）'
      },

      // 物品类型（Item Type）
      item_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '物品类型（如 voucher/product/service/equipment/card）'
      },

      // 物品模板ID（Item Template ID）
      item_template_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '物品模板ID（可选，关联物品模板表或奖品表）'
      },

      // 物品状态（Item Status - 状态机）
      status: {
        type: DataTypes.ENUM('available', 'locked', 'transferred', 'used', 'expired'),
        allowNull: false,
        defaultValue: 'available',
        comment:
          '物品状态（available=可用/locked=锁定中/transferred=已转移/used=已使用/expired=已过期）'
      },

      // 物品元数据（Item Metadata - JSON）
      meta: {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          '物品元数据（JSON格式，包含：name/description/icon/value/attributes/serial_number等）',
        /**
         * Getter方法：返回物品元数据
         *
         * @returns {Object} 物品元数据对象
         */
        get() {
          const value = this.getDataValue('meta')
          return value || {}
        }
      },

      // 锁定记录（Locks - JSON多级锁定机制）
      locks: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        comment:
          '锁定记录数组。格式: [{lock_type, lock_id, locked_at, expires_at, auto_release, reason}]。' +
          'lock_type: trade(交易锁3分钟)/redemption(兑换码锁30天)/security(风控锁无限期)'
      },

      /**
       * 来源标识（决策10：区分物品来源）
       * - NULL: 历史数据（无法确定来源）
       * - exchange: 普通兑换
       * - bid_settlement: 竞价结算
       * - lottery: 抽奖
       */
      source: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: null,
        comment: '来源：exchange=兑换, bid_settlement=竞价结算, lottery=抽奖（存量为 NULL）'
      },

      // 创建时间（Created At）
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间（北京时间存储）'
      },

      // 更新时间（Updated At）
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间（北京时间存储）'
      }
    },
    {
      sequelize,
      modelName: 'ItemInstance',
      tableName: 'item_instances',
      timestamps: true,
      underscored: true,
      comment: '物品实例表（不可叠加物品所有权真相，支持多级锁定）',

      // 索引定义
      indexes: [
        {
          name: 'idx_item_instances_owner_user_id',
          fields: ['owner_user_id']
        },
        {
          name: 'idx_item_instances_status',
          fields: ['status']
        },
        {
          name: 'idx_item_instances_type_template',
          fields: ['item_type', 'item_template_id']
        }
      ]
    }
  )

  return ItemInstance
}
