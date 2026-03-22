/**
 * 兑换商品 SKU 模型（规格变体 + 库存真源）
 *
 * 业务用途：
 * - 每个 SPU（exchange_items）下可有多个 SKU，承载独立 sku_code、库存、成本与展示图
 * - 兑换渠道定价（exchange_channel_prices）与 SKU 销售属性（sku_attribute_values）均挂载在本表
 *
 * 数据关系：
 * - 库存与已售为运营/交易核心字段；成本价用于财务核算（可选）
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * @class ExchangeItemSku
 * @description 兑换商品 SKU（规格、库存、媒体）
 */
class ExchangeItemSku extends Model {
  /**
   * 定义模型关联（部分关联在对应模型尚未注册时跳过，避免启动失败）
   * @param {Object} models - Sequelize 已加载的模型集合
   * @returns {void}
   */
  static associate(models) {
    ExchangeItemSku.belongsTo(models.ExchangeItem, {
      foreignKey: 'exchange_item_id',
      as: 'exchangeItem'
    })

    if (models.SkuAttributeValue) {
      ExchangeItemSku.hasMany(models.SkuAttributeValue, {
        foreignKey: 'sku_id',
        as: 'attributeValues'
      })
    }

    if (models.ExchangeChannelPrice) {
      ExchangeItemSku.hasMany(models.ExchangeChannelPrice, {
        foreignKey: 'sku_id',
        as: 'channelPrices'
      })
    }

    if (models.MediaFile) {
      ExchangeItemSku.belongsTo(models.MediaFile, {
        foreignKey: 'image_id',
        targetKey: 'media_id',
        as: 'skuImage'
      })
    }
  }

  /**
   * 判断库存是否不少于指定数量
   * @param {number} [quantity=1] - 需求数量
   * @returns {boolean}
   */
  hasStock(quantity = 1) {
    return this.stock >= quantity
  }
}

/**
 * @param {import('sequelize').Sequelize} sequelize - Sequelize 实例
 * @returns {typeof ExchangeItemSku}
 */
module.exports = sequelize => {
  ExchangeItemSku.init(
    {
      /** SKU 主键 */
      sku_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: 'SKU 主键'
      },
      /** 所属兑换商品 SPU */
      exchange_item_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '所属兑换商品（exchange_items.exchange_item_id）',
        references: {
          model: 'exchange_items',
          key: 'exchange_item_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      /** 全局唯一 SKU 编码 */
      sku_code: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: 'SKU 唯一编码（如 dragon_gem_blue_L）'
      },
      /** 可售库存 */
      stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '库存数量（全渠道共享）'
      },
      /** 累计销量 */
      sold_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '已售数量'
      },
      /** 成本价（MySQL DECIMAL 读入常为字符串，getter 转为 number） */
      cost_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '成本价（人民币，可选）',
        /**
         * @description 将 DECIMAL 字符串安全转为 number，便于业务计算
         * @returns {number|null}
         */
        get() {
          const raw = this.getDataValue('cost_price')
          if (raw === null || raw === undefined) return null
          if (typeof raw === 'number') return raw
          const n = parseFloat(raw)
          return Number.isNaN(n) ? null : n
        }
      },
      /** 上下架状态 */
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: '状态：active 可售 | inactive 停售'
      },
      /** SKU 主图（媒体库） */
      image_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        comment: 'SKU 专属图片（media_files.media_id）',
        references: {
          model: 'media_files',
          key: 'media_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      /** 同 SPU 内排序 */
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序（越小越靠前）'
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
      comment: '兑换商品 SKU 表（EAV 商品中心）'
    }
  )

  return ExchangeItemSku
}
