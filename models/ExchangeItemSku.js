/**
 * 兑换商品 SKU 模型 - ExchangeItemSku
 * 全量 SKU 模式：所有商品至少有一个默认 SKU（spec_values={}）
 *
 * 业务场景：
 * - 单品商品：自动创建一个默认 SKU（spec_values={}，价格和库存从 SPU 复制）
 * - 多规格商品：多个 SKU，每个 SKU 有独立的规格值、价格、库存
 * - 所有库存查询和扣减统一走 exchange_item_skus 表
 *
 * 数据模型关系：
 * - exchange_items（SPU 商品主体）1:N exchange_item_skus（SKU 规格变体）
 * - 兑换流程中，exchange_records.item_snapshot 记录 sku_id + spec_values
 *
 * @see docs/管理后台功能差距分析与优化方案.md 5.2.7 + 9.1#2
 * @version 1.0.0
 * @date 2026-03-16
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 兑换商品 SKU 模型类
 * 职责：商品规格变体管理（价格、库存、规格值独立）
 */
class ExchangeItemSku extends Model {
  /**
   * 关联定义
   * @param {Object} models - Sequelize 所有模型集合
   * @returns {void}
   */
  static associate(models) {
    ExchangeItemSku.belongsTo(models.ExchangeItem, {
      foreignKey: 'exchange_item_id',
      as: 'exchangeItem'
    })

    // SKU 图片通过 media_attachments 多态关联（2026-03-16 媒体体系）
  }

  /**
   * 检查 SKU 库存是否充足
   * @param {number} quantity - 需要的数量
   * @returns {boolean} 是否有足够库存
   */
  hasStock(quantity = 1) {
    return this.stock >= quantity
  }

  /**
   * 获取有效的支付资产代码（SKU 级别覆盖或使用 SPU 默认值）
   * @param {string} spuAssetCode - SPU 默认的资产代码
   * @returns {string} 实际使用的资产代码
   */
  getEffectiveAssetCode(spuAssetCode) {
    return this.cost_asset_code || spuAssetCode
  }

  /**
   * 判断是否为默认 SKU（单品商品的默认规格）
   * @returns {boolean} spec_values 为空对象时视为默认 SKU
   */
  isDefaultSku() {
    const specs = this.spec_values
    if (!specs) return true
    if (typeof specs === 'string') {
      try {
        return Object.keys(JSON.parse(specs)).length === 0
      } catch {
        return true
      }
    }
    return Object.keys(specs).length === 0
  }
}

/**
 * 模型初始化
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} 初始化后的模型
 */
module.exports = sequelize => {
  ExchangeItemSku.init(
    {
      /** SKU 主键（自增） */
      sku_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: 'SKU 主键'
      },

      /** 关联 SPU 商品ID */
      exchange_item_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '关联 SPU 商品ID（exchange_items.exchange_item_id）',
        references: {
          model: 'exchange_items',
          key: 'exchange_item_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      /**
       * 规格值 JSON
       * 单品商品为 {}（空对象），多规格商品如 {"颜色":"白色","尺码":"S"}
       */
      spec_values: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
        comment: '规格值 JSON，如 {"颜色":"白色","尺码":"S"}；单品商品为 {}'
      },

      /**
       * 支付资产代码（可覆盖 SPU 默认值）
       * NULL 时使用 SPU 的 cost_asset_code
       */
      cost_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '支付资产代码（可覆盖 SPU 默认值），NULL 时使用 SPU 的 cost_asset_code'
      },

      /** 该 SKU 的兑换价格（材料数量） */
      cost_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '该 SKU 的兑换价格（材料数量）'
      },

      /** 该 SKU 独立库存 */
      stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '该 SKU 独立库存'
      },

      /** 该 SKU 已售数量 */
      sold_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '该 SKU 已售数量'
      },

      /** SKU 状态 */
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: 'SKU 状态：active-可售 | inactive-停售'
      },

      /** SKU 排序（同一商品内的展示顺序） */
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'SKU 排序（同一商品内的展示顺序）'
      },

      /** SKU 专属图片 ID（不同规格对应不同图片，如不同颜色） */
      image_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: 'SKU 专属图片 ID（不同规格对应不同图片，如不同颜色）'
      }
    },
    {
      sequelize,
      modelName: 'ExchangeItemSku',
      tableName: 'exchange_item_skus',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        { fields: ['exchange_item_id'], name: 'idx_sku_exchange_item_id' },
        { fields: ['exchange_item_id', 'status'], name: 'idx_sku_item_status' },
        { fields: ['status'], name: 'idx_sku_status' }
      ],
      comment: '兑换商品 SKU 表（规格变体，全量模式：所有商品至少有一个默认 SKU）'
    }
  )

  return ExchangeItemSku
}
