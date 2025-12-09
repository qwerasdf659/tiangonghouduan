/**
 * 兑换市场记录模型 - ExchangeMarketRecord
 * 记录用户使用虚拟奖品价值兑换商品的订单（唯一支付方式）
 *
 * 业务场景：
 * - 用户选择商品并支付虚拟奖品价值
 * - 扣除用户背包中的虚拟奖品价值
 * - 创建兑换订单
 * - 发货和订单状态管理
 *
 * 业务规则（强制）：
 * - ✅ 只支持虚拟奖品价值支付
 * - ❌ 禁止扣除 available_points（显示积分）
 * - ❌ 禁止扣除 remaining_budget_points（预算积分）
 * - ✅ points_paid 必须强制为 0
 * - ✅ payment_type 必须为 'virtual'
 *
 * 最后修改：2025年12月09日 - 统一为只支持virtual支付方式
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const ExchangeMarketRecord = sequelize.define(
    'ExchangeMarketRecord',
    {
      // 主键
      record_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '兑换记录唯一标识'
      },

      // 关联字段
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },
      item_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '兑换商品ID',
        references: {
          model: 'exchange_items',
          key: 'item_id'
        }
      },

      // 支付信息
      payment_type: {
        type: DataTypes.ENUM('virtual'),
        allowNull: false,
        defaultValue: 'virtual',
        comment: '支付方式（仅支持虚拟奖品价值支付）'
      },
      virtual_value_paid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '消耗虚拟奖品价值（实际支付金额）'
      },
      points_paid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '消耗积分（应始终为0，仅用于展示）'
      },

      // 成本信息（后端记录，不对外暴露）
      actual_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '实际成本'
      },

      // 订单信息
      order_no: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '订单号'
      },
      status: {
        type: DataTypes.ENUM('pending', 'completed', 'shipped', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '订单状态'
      },
      shipped_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '发货时间'
      }
    },
    {
      tableName: 'exchange_market_records',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      indexes: [
        { fields: ['order_no'], unique: true },
        { fields: ['user_id'] },
        { fields: ['status'] },
        { fields: ['created_at'] }
      ],
      comment: '兑换市场记录表'
    }
  )

  /**
   * 关联定义
   */
  ExchangeMarketRecord.associate = function (models) {
    // 属于用户
    ExchangeMarketRecord.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    // 属于商品
    ExchangeMarketRecord.belongsTo(models.ExchangeItem, {
      foreignKey: 'item_id',
      as: 'item'
    })
  }

  /**
   * 生成订单号
   */
  ExchangeMarketRecord.generateOrderNo = function () {
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
    return `EXC${timestamp}${random}`
  }

  return ExchangeMarketRecord
}
