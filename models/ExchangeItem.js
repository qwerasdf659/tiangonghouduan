/**
 * 兑换市场商品模型 - ExchangeItem
 * 双账户模型兑换市场核心表
 * 用户可以使用虚拟奖品价值或积分兑换商品
 *
 * 业务场景：
 * - 用户抽奖获得虚拟奖品（水晶、贵金属等）
 * - 虚拟奖品存入背包（UserInventory）
 * - 用户使用背包中的虚拟奖品价值兑换商品
 * - 兑换时不再扣预算积分（已在抽奖时扣除）
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

      // 价格类型（双账户模型核心字段）
      price_type: {
        type: DataTypes.ENUM('virtual', 'points', 'mixed'),
        allowNull: false,
        comment: '支付方式：虚拟奖品/积分/混合'
      },
      virtual_value_price: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '虚拟奖品价格（价值积分）'
      },
      points_price: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '积分价格'
      },
      mixed_virtual_value: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '混合支付-虚拟奖品价值'
      },
      mixed_points: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '混合支付-积分数量'
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
   */
  ExchangeItem.prototype.getPaymentRequired = function () {
    return {
      virtualValue: this.price_type === 'virtual'
        ? this.virtual_value_price
        : this.price_type === 'mixed' ? this.mixed_virtual_value : 0,
      points: this.price_type === 'points'
        ? this.points_price
        : this.price_type === 'mixed' ? this.mixed_points : 0
    }
  }

  return ExchangeItem
}
