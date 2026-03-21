/**
 * 统一商品 SPU 模型（统一商品中心 Layer 1）
 *
 * 业务场景：
 * - 作为兑换/商城侧的「商品主数据」，承载名称、品类、图文、营销标签与上下架节奏
 * - 关联物品模板与稀有度，支撑铸造实例与展示策略
 * - 具体库存与渠道定价在 SKU 层（product_skus、exchange_channel_prices）维护
 *
 * 表名：products；主键：product_id（BIGINT）
 *
 * 关联说明（兑换渠道定价）：
 * - 定价行挂在 SKU 上（exchange_channel_prices.sku_id → product_skus）
 * - 商品与定价无直接外键；预加载请使用 Product → ProductSku → ExchangeChannelPrice 嵌套 include
 *
 * @module models/Product
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 商品（SPU）模型类
 * 职责：描述可售卖商品主体，聚合 SKU 与属性值
 */
class Product extends Model {
  /**
   * 定义模型关联
   *
   * @param {Object} models - Sequelize 已注册模型集合
   * @returns {void}
   */
  static associate(models) {
    Product.belongsTo(models.Category, {
      foreignKey: 'category_id',
      as: 'category'
    })

    if (models.ItemTemplate) {
      Product.belongsTo(models.ItemTemplate, {
        foreignKey: 'item_template_id',
        as: 'itemTemplate'
      })
    }

    if (models.RarityDef) {
      Product.belongsTo(models.RarityDef, {
        foreignKey: 'rarity_code',
        targetKey: 'rarity_code',
        as: 'rarityDef'
      })
    }

    if (models.MediaFile) {
      Product.belongsTo(models.MediaFile, {
        foreignKey: 'primary_media_id',
        as: 'primary_media'
      })
    }

    if (models.ProductSku) {
      Product.hasMany(models.ProductSku, {
        foreignKey: 'product_id',
        as: 'skus'
      })
    }

    if (models.ProductAttributeValue) {
      Product.hasMany(models.ProductAttributeValue, {
        foreignKey: 'product_id',
        as: 'attributeValues'
      })
    }

    /**
     * 兑换渠道定价经 SKU 中转，不在此声明 Product.hasMany(ExchangeChannelPrice)，
     * 避免与表结构（定价表仅含 sku_id）不一致。
     * 典型查询：include: [{ model: ProductSku, as: 'skus', include: [{ model: ExchangeChannelPrice, as: '...' }] }]
     */
  }

  /**
   * 判断是否存在至少一条启用中的 SKU（用于上架校验、运营提示）
   *
   * @returns {Promise<boolean>} 存在 active SKU 时为 true
   */
  async hasActiveSkus() {
    const ProductSku = this.sequelize.models.ProductSku
    if (!ProductSku) return false

    const count = await ProductSku.count({
      where: {
        product_id: this.product_id,
        status: 'active'
      }
    })
    return count > 0
  }

  /**
   * 判断当前是否处于「可对外展示」的发布窗口内：
   * - status 必须为 active
   * - 若配置了 publish_at，则当前时间须不早于该时间
   * - 若配置了 unpublish_at，则当前时间须早于该时间
   *
   * @param {Date} [at=new Date()] - 判定时刻（便于单元测试传入固定时间）
   * @returns {boolean} 在发布窗口内为 true
   */
  isPublished(at = new Date()) {
    if (this.status !== 'active') return false

    const t = at instanceof Date ? at : new Date(at)

    if (this.publish_at) {
      const start = new Date(this.publish_at)
      if (t < start) return false
    }

    if (this.unpublish_at) {
      const end = new Date(this.unpublish_at)
      if (t >= end) return false
    }

    return true
  }
}

/**
 * @param {import('sequelize').Sequelize} sequelize - Sequelize 实例
 * @returns {typeof Product} 初始化后的商品模型
 */
module.exports = sequelize => {
  Product.init(
    {
      product_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '商品主键（SPU）'
      },
      product_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '商品名称'
      },
      category_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'categories', key: 'category_id' },
        comment: '所属品类'
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '商品描述（可富文本）'
      },
      primary_media_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'media_files', key: 'media_id' },
        comment: '主图 media_id'
      },
      item_template_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: 'item_templates', key: 'item_template_id' },
        comment: '关联物品模板（铸造用）'
      },
      mint_instance: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '兑换后是否自动铸造物品实例'
      },
      rarity_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'common',
        references: { model: 'rarity_defs', key: 'rarity_code' },
        comment: '稀有度编码（字典表）'
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
        comment: '列表排序'
      },
      space: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'lucky',
        comment: '展示空间 lucky/premium/both 等'
      },
      is_pinned: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否置顶'
      },
      pinned_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '置顶时间'
      },
      is_new: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否新品标签'
      },
      is_hot: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否热门标签'
      },
      is_limited: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否限量标签'
      },
      is_recommended: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否推荐标签'
      },
      tags: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '标签 JSON 数组'
      },
      sell_point: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '一句话卖点'
      },
      usage_rules: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '使用说明等结构化内容'
      },
      video_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '视频地址'
      },
      stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'SPU 汇总库存（= SUM(product_skus.stock)）'
      },
      sold_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'SPU 汇总已售（= SUM(product_skus.sold_count)）'
      },
      min_cost_amount: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: 'SPU 最低兑换价（= MIN(exchange_channel_prices.cost_amount)）'
      },
      max_cost_amount: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: 'SPU 最高兑换价（= MAX(exchange_channel_prices.cost_amount)）'
      },
      stock_alert_threshold: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '库存预警阈值'
      },
      publish_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '定时上架时间'
      },
      unpublish_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '定时下架时间'
      },
      attributes_json: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '商品参数快照等非 EAV 补充'
      }
    },
    {
      sequelize,
      modelName: 'Product',
      tableName: 'products',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '统一 SPU（EAV 商品中心）'
    }
  )

  return Product
}
