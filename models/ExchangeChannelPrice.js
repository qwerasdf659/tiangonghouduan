/**
 * 兑换渠道定价模型（Layer 2）
 *
 * 业务用途：
 * - 在统一 SKU 上配置「兑换商城」所需材料资产类型与数量（支持划线价、定时上下架）
 * - 同一 SKU 同一资产代码一条记录（库表唯一约束），实现多渠道共享库存但独立定价
 *
 * 数据关系：
 * - 多对一归属 ProductSku；上架与否由 is_enabled 与 publish_at / unpublish_at 共同决定
 *
 * @see migrations/20260320200000-create-table-unified-product-center.js
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * @class ExchangeChannelPrice
 * @description 兑换渠道下 SKU 的材料定价
 */
class ExchangeChannelPrice extends Model {
  /**
   * 定义模型关联
   * @param {Object} models - Sequelize 已加载的模型集合
   * @returns {void}
   */
  static associate(models) {
    ExchangeChannelPrice.belongsTo(models.ProductSku, {
      foreignKey: 'sku_id',
      as: 'sku'
    })
  }

  /**
   * 是否处于「已上架」状态：启用 + 当前时间在发布窗口内
   * - publish_at 为空：不限制开始时间（视为已可展示）
   * - unpublish_at 为空：不限制结束时间
   * - 到达 unpublish_at 时刻起视为已下架（含边界）
   * @returns {boolean}
   */
  isPublished() {
    if (!this.is_enabled) return false
    const now = new Date()
    if (this.publish_at && new Date(this.publish_at) > now) return false
    if (this.unpublish_at && new Date(this.unpublish_at) <= now) return false
    return true
  }
}

/**
 * @param {import('sequelize').Sequelize} sequelize - Sequelize 实例
 * @returns {typeof ExchangeChannelPrice}
 */
module.exports = sequelize => {
  ExchangeChannelPrice.init(
    {
      /** 主键 */
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键'
      },
      /** 所属 SKU */
      sku_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: 'SKU（product_skus.sku_id）',
        references: {
          model: 'product_skus',
          key: 'sku_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      /** 支付材料资产代码 */
      cost_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '材料资产类型（如 red_shard）'
      },
      /** 所需材料数量 */
      cost_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '兑换所需数量'
      },
      /** 划线原价（可选） */
      original_amount: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '原价（展示用，可为空）'
      },
      /** 是否在兑换渠道启用 */
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用该条定价'
      },
      /** 定时上架时间 */
      publish_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '定时上架（空表示不限制开始）'
      },
      /** 定时下架时间 */
      unpublish_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '定时下架（空表示不限制结束）'
      }
    },
    {
      sequelize,
      modelName: 'ExchangeChannelPrice',
      tableName: 'exchange_channel_prices',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '兑换渠道定价（SKU × 材料资产）'
    }
  )

  return ExchangeChannelPrice
}
