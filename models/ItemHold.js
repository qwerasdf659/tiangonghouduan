/**
 * 物品锁定记录模型（ItemHold Model） — 三表模型锁定层
 *
 * 业务定位：
 * - 唯一的锁定状态真相，替代旧 item_instances.locks JSON 字段
 * - 有状态变更：active → released / expired / overridden
 * - 释放/过期的记录保留，作为锁定/解锁的完整审计
 *
 * 与旧 JSON locks 的关键区别：
 * - 可索引 — "所有过期的 hold" 只需 WHERE status='active' AND expires_at < NOW()
 * - 可查询 — "这个订单锁了哪些物品" 一条 SQL
 * - 有历史 — released/expired 的记录保留
 * - 无 JSON 解析 — 不需要在应用层解析判断锁状态
 *
 * 表名：item_holds
 * 主键：hold_id
 *
 * @module models/ItemHold
 * @version 1.0.0
 * @date 2026-02-22
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 锁类型与优先级映射
 * trade < redemption < security
 */
const HOLD_PRIORITY = {
  trade: 1, // 交易订单锁：3分钟TTL，优先级最低
  redemption: 2, // 兑换码锁：30天TTL，中优先级
  security: 3 // 风控冻结锁：无限期，优先级最高
}

/**
 * ItemHold 类定义（物品锁定记录模型）
 *
 * @class ItemHold
 * @extends Model
 */
class ItemHold extends Model {
  /**
   * 模型关联定义
   *
   * @param {Object} models - 所有模型的映射对象
   */
  static associate(models) {
    // 锁定记录关联物品
    ItemHold.belongsTo(models.Item, {
      foreignKey: 'item_id',
      as: 'item',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })
  }

  /**
   * 优先级常量
   */
  static HOLD_PRIORITY = HOLD_PRIORITY

  /**
   * 检查当前锁定是否已过期
   *
   * @returns {boolean} 是否已过期
   */
  isExpired() {
    if (!this.expires_at) return false // NULL = 永不过期（security）
    return new Date(this.expires_at) < new Date()
  }

  /**
   * 检查当前锁定是否可被新锁覆盖
   *
   * @param {string} newHoldType - 新锁类型
   * @returns {{ canOverride: boolean, reason: string }} 是否可覆盖及原因
   */
  canBeOverriddenBy(newHoldType) {
    const currentPriority = HOLD_PRIORITY[this.hold_type] || 0
    const newPriority = HOLD_PRIORITY[newHoldType] || 0

    if (newPriority > currentPriority) {
      return {
        canOverride: true,
        reason: `高优先级 ${newHoldType}(${newPriority}) 可覆盖 ${this.hold_type}(${currentPriority})`
      }
    }

    return {
      canOverride: false,
      reason: `${newHoldType}(${newPriority}) 优先级不足以覆盖 ${this.hold_type}(${currentPriority})`
    }
  }
}

/**
 * 模型初始化
 *
 * @param {import('sequelize').Sequelize} sequelize - Sequelize 实例
 * @returns {ItemHold} 初始化后的模型
 */
module.exports = sequelize => {
  ItemHold.init(
    {
      hold_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '锁定记录ID（自增主键）'
      },

      item_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '被锁定的物品ID（关联 items.item_id）'
      },

      hold_type: {
        type: DataTypes.ENUM('trade', 'redemption', 'security'),
        allowNull: false,
        comment: '锁定类型：trade=交易锁(3分钟) / redemption=兑换码锁(30天) / security=风控锁(无限期)'
      },

      holder_ref: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '持锁方引用（trade_order_id / redemption_order_id / risk_case_xxx）'
      },

      priority: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1,
        comment: '优先级数值：trade=1 / redemption=2 / security=3'
      },

      status: {
        type: DataTypes.ENUM('active', 'released', 'expired', 'overridden'),
        allowNull: false,
        defaultValue: 'active',
        comment: '锁定状态：active=活跃 / released=已释放 / expired=已过期 / overridden=被高优先级覆盖'
      },

      reason: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '锁定/释放原因'
      },

      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '过期时间（NULL=永不过期，用于 security 类型）'
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
      },

      released_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '释放时间（released/expired/overridden 时填写）'
      }
    },
    {
      sequelize,
      modelName: 'ItemHold',
      tableName: 'item_holds',
      timestamps: false, // 手动管理 created_at 和 released_at
      underscored: true,
      comment: '物品锁定/保留记录（替代旧 JSON locks，可索引可查询有审计历史）',

      indexes: [
        {
          name: 'idx_holds_item',
          fields: ['item_id', 'status']
        },
        {
          name: 'idx_holds_active_expiry',
          fields: ['status', 'expires_at']
        },
        {
          name: 'idx_holds_holder',
          fields: ['holder_ref']
        }
      ]
    }
  )

  return ItemHold
}
