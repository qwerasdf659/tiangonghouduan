/**
 * 兑换市场商品模型 - ExchangeItem
 * 双账户模型兑换市场核心表
 * 用户只能使用虚拟奖品价值兑换商品（唯一支付方式）
 *
 * 业务场景：
 * - 用户抽奖获得虚拟奖品（水晶、贵金属等）
 * - 虚拟奖品存入背包（UserInventory）
 * - 用户使用背包中的虚拟奖品价值兑换商品
 * - 兑换时不扣除显示积分和预算积分（已在抽奖时扣除）
 *
 * 支付方式说明：
 * - price_type：只支持 'virtual'（虚拟奖品价值支付，唯一方式）
 * - virtual_value_price：实际扣除的虚拟奖品价值（必须字段）
 * - points_price：仅用于前端展示，不实际扣除显示积分（可选字段）
 *
 * 业务规则（强制）：
 * - ✅ 兑换只能使用虚拟奖品价值
 * - ❌ 禁止扣除 available_points（显示积分）
 * - ❌ 禁止扣除 remaining_budget_points（预算积分）
 * - ✅ price_type 必须为 'virtual'
 * - ✅ points_price 仅用于展示
 *
 * 最后修改：2025年12月08日 - 统一为只支持virtual支付方式
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const ExchangeItem = sequelize.define(
    'ExchangeItem',
    {
      // 主键
      item_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '商品唯一标识'
      },

      // 基础信息
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '商品名称'
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '商品描述'
      },
      image_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '商品图片URL'
      },

      // 价格类型（双账户模型核心字段 - 已简化为只支持virtual）
      price_type: {
        type: DataTypes.ENUM('virtual'),
        allowNull: false,
        defaultValue: 'virtual',
        comment: '支付方式（仅支持虚拟奖品价值支付）'
      },
      virtual_value_price: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '虚拟奖品价格（实际扣除的虚拟价值，必须字段）'
      },
      points_price: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '积分价格（仅用于前端展示，不扣除用户显示积分）'
      },

      // 成本和库存
      cost_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '实际成本（人民币）'
      },
      stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '库存数量'
      },
      sold_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '已售数量'
      },

      // 分类和状态
      category: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '商品分类'
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: '商品状态'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序序号'
      }
    },
    {
      tableName: 'exchange_items',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      indexes: [
        { fields: ['price_type'] },
        { fields: ['status'] },
        { fields: ['category'] }
      ],
      comment: '兑换市场商品表'
    }
  )

  /**
   * 关联定义
   */
  ExchangeItem.associate = function (models) {
    // 一对多：商品有多个兑换记录
    ExchangeItem.hasMany(models.ExchangeMarketRecord, {
      foreignKey: 'item_id',
      as: 'exchangeRecords'
    })
  }

  /**
   * 检查库存是否充足
   */
  ExchangeItem.prototype.hasStock = function () {
    return this.stock > 0
  }

  /**
   * 获取支付要求
   * 注意：当前只支持 virtual 支付方式
   *
   * @returns {Object} 支付要求
   * @returns {number} returns.virtualValue - 需要的虚拟奖品价值
   * @returns {number} returns.points - 展示用积分价格（不实际扣除）
   */
  ExchangeItem.prototype.getPaymentRequired = function () {
    return {
      virtualValue: this.virtual_value_price || 0,
      points: this.points_price || 0 // 仅用于展示，不扣除显示积分
    }
  }

  return ExchangeItem
}
