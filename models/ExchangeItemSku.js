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
   * @returns {boolean} 判断结果
   */
  hasStock(quantity = 1) {
    return this.stock >= quantity
  }
}

/**
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Model} 初始化后的模型类
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
      /**
       * SKU 平台展示码（无意义随机码，系统生成）
       * 规范形 = SK + 12 位 Base32 随机字符（如 SK4N8PTX2H9QYR），展示形 SK-XXXX-XXXX-XXXX。
       * 编码不含业务语义，业务含义落在 SKU 销售属性表；由 ProductCodeGenerator('SK') 统一生成。
       */
      sku_code: {
        type: DataTypes.STRING(14),
        allowNull: false,
        unique: true,
        comment: 'SKU 平台展示码(无意义随机码 SK+12位规范形,系统生成)'
      },
      /**
       * 国际标准条码（UPC/EAN-13/GTIN，预留字段，可空）
       * 对接商超/海外/扫码枪用；区别于供应商货号（supplier_item_code），当前留空不参与逻辑。
       */
      barcode: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '国际标准条码(UPC/EAN/GTIN,预留,可空)'
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
         * 将 DECIMAL 字符串安全转为 number，便于业务计算
         * @returns {number|null} 转换后的数值或 null
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
