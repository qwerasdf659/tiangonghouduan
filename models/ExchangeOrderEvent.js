'use strict'

/**
 * 兑换订单状态变更事件模型（ExchangeOrderEvent）
 *
 * 业务场景：记录兑换订单的完整状态变更历史链
 * - 用户创建订单、取消订单、确认收货、评分
 * - 管理员审核通过、发货、拒绝
 * - 系统自动确认收货（7天超时）
 *
 * 表名（snake_case）：exchange_order_events
 * 主键命名：event_id（BIGINT自增）
 *
 * @module models/ExchangeOrderEvent
 * @created 2026-03-10（兑换订单功能增强）
 * @see docs/兑换订单接口-后端对接需求.md - 决策1
 */

const { Model, DataTypes } = require('sequelize')

/** 订单状态 ENUM 值 */
const ORDER_STATUS_ENUM = [
  'pending',
  'approved',
  'shipped',
  'received',
  'rated',
  'rejected',
  'refunded',
  'cancelled',
  'completed'
]

/**
 * ExchangeOrderEvent 类定义
 *
 * @class ExchangeOrderEvent
 * @extends {Model}
 */
class ExchangeOrderEvent extends Model {
  /**
   * 模型关联定义
   *
   * @static
   * @param {Object} models - 所有模型的映射对象
   * @returns {void}
   */
  static associate(models) {
    ExchangeOrderEvent.belongsTo(models.ExchangeRecord, {
      foreignKey: 'order_no',
      targetKey: 'order_no',
      as: 'order',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })

    ExchangeOrderEvent.belongsTo(models.User, {
      foreignKey: 'operator_id',
      as: 'operator',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })
  }

  /**
   * 生成幂等键
   *
   * @static
   * @param {string} order_no - 订单号
   * @param {string} new_status - 新状态
   * @param {number} operator_id - 操作人ID
   * @returns {string} 幂等键
   */
  static generateIdempotencyKey(order_no, new_status, operator_id) {
    const timestamp = Math.floor(Date.now() / 1000)
    return `order_event_${order_no}_${new_status}_${operator_id}_${timestamp}`
  }
}

/**
 * 模型初始化函数
 *
 * @param {Object} sequelize - Sequelize实例
 * @returns {Model} ExchangeOrderEvent模型
 */
module.exports = sequelize => {
  ExchangeOrderEvent.init(
    {
      event_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '事件ID'
      },

      order_no: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '订单号（关联 exchange_records.order_no）'
      },

      old_status: {
        type: DataTypes.ENUM(...ORDER_STATUS_ENUM),
        allowNull: true,
        comment: '变更前状态（首次创建时为NULL）'
      },

      new_status: {
        type: DataTypes.ENUM(...ORDER_STATUS_ENUM),
        allowNull: false,
        comment: '变更后状态'
      },

      operator_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '操作人ID（用户/管理员/系统）'
      },

      operator_type: {
        type: DataTypes.ENUM('user', 'admin', 'system'),
        allowNull: false,
        comment: '操作人类型：user=用户 | admin=管理员 | system=系统定时任务'
      },

      reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '变更原因/备注'
      },

      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '额外元数据（退款信息、快照等）'
      },

      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '幂等键（防止重复事件写入）'
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
      }
    },
    {
      sequelize,
      modelName: 'ExchangeOrderEvent',
      tableName: 'exchange_order_events',
      timestamps: false,
      comment: '兑换订单状态变更事件表（审计追踪）',

      scopes: {
        byOrder: order_no => ({
          where: { order_no },
          order: [['created_at', 'ASC']]
        }),
        byOperator: operator_id => ({
          where: { operator_id }
        })
      }
    }
  )

  return ExchangeOrderEvent
}
