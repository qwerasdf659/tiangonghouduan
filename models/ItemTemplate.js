/**
 * 物品模板模型
 *
 * 业务场景：
 * - 定义不可叠加物品（NFT类物品）的模板
 * - 为 ItemInstance 提供模板定义（名称、类目、稀有度、图片等）
 * - 为市场挂牌提供物品分类筛选维度
 *
 * 硬约束：
 * - item_template_id 为自增主键
 * - template_code 为唯一业务标识（如 prize_iphone_15_pro）
 * - item_type 对应 item_instances.item_type
 * - 关联 category_defs 和 rarity_defs 字典表
 *
 * 命名规范（snake_case）：
 * - 表名：item_templates
 * - 主键：item_template_id
 *
 * @version 1.0.0
 * @date 2026-01-15
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 物品模板模型类
 * 职责：物品模板定义和管理
 * 设计模式：模板模式
 */
class ItemTemplate extends Model {
  /**
   * 静态关联定义
   *
   * @param {Object} models - Sequelize所有模型的集合对象
   * @returns {void} 无返回值，仅定义关联关系
   */
  static associate(models) {
    // 关联类目字典（多对一）
    if (models.CategoryDef) {
      ItemTemplate.belongsTo(models.CategoryDef, {
        foreignKey: 'category_code',
        targetKey: 'category_code',
        as: 'category'
      })
    }

    // 关联稀有度字典（多对一）
    if (models.RarityDef) {
      ItemTemplate.belongsTo(models.RarityDef, {
        foreignKey: 'rarity_code',
        targetKey: 'rarity_code',
        as: 'rarity'
      })
    }

    // 关联物品实例（一对多）
    if (models.ItemInstance) {
      ItemTemplate.hasMany(models.ItemInstance, {
        foreignKey: 'item_template_id',
        sourceKey: 'item_template_id',
        as: 'item_instances'
      })
    }

    // 关联市场挂牌（一对多）
    if (models.MarketListing) {
      ItemTemplate.hasMany(models.MarketListing, {
        foreignKey: 'offer_item_template_id',
        sourceKey: 'item_template_id',
        as: 'market_listings'
      })
    }

    // 关联图片资源（多对一，统一图片管理体系）
    if (models.ImageResources) {
      ItemTemplate.belongsTo(models.ImageResources, {
        foreignKey: 'image_resource_id',
        as: 'primaryImage'
      })
    }
  }

  /**
   * 按物品类型获取模板
   *
   * @param {string} itemType - 物品类型
   * @returns {Promise<Array>} 符合条件的模板列表
   */
  static async getByItemType(itemType) {
    return this.findAll({
      where: {
        item_type: itemType,
        is_enabled: true
      },
      order: [['display_name', 'ASC']]
    })
  }

  /**
   * 按模板代码获取模板
   *
   * @param {string} templateCode - 模板代码
   * @returns {Promise<ItemTemplate|null>} 模板实例或 null
   */
  static async getByCode(templateCode) {
    return this.findOne({
      where: { template_code: templateCode }
    })
  }

  /**
   * 获取可交易的模板
   *
   * @returns {Promise<Array>} 可交易的模板列表
   */
  static async getTradable() {
    return this.findAll({
      where: {
        is_tradable: true,
        is_enabled: true
      },
      order: [['display_name', 'ASC']]
    })
  }

  /**
   * 按类目获取模板
   *
   * @param {string} categoryCode - 类目代码
   * @returns {Promise<Array>} 符合条件的模板列表
   */
  static async getByCategory(categoryCode) {
    return this.findAll({
      where: {
        category_code: categoryCode,
        is_enabled: true
      },
      order: [['display_name', 'ASC']]
    })
  }
}

/**
 * 模型初始化
 *
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {ItemTemplate} 初始化后的模型
 */
module.exports = sequelize => {
  ItemTemplate.init(
    {
      // 物品模板ID（主键）
      item_template_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '物品模板ID（主键）'
      },

      // 模板代码（唯一业务标识）
      template_code: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '模板代码（唯一业务标识）：如 prize_iphone_15_pro'
      },

      // 物品类型（对应 item_instances.item_type）
      item_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '物品类型：对应 item_instances.item_type'
      },

      // 类目代码（外键 → category_defs）
      category_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '类目代码（外键 → category_defs.category_code）'
      },

      // 稀有度代码（外键 → rarity_defs）
      rarity_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '稀有度代码（外键 → rarity_defs.rarity_code）'
      },

      // 显示名称（用户可见）
      display_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '显示名称（UI展示）'
      },

      // 物品描述
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '物品描述'
      },

      // 主图片ID（外键 → image_resources，统一图片管理体系）
      image_resource_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '主图片ID（外键 → image_resources.image_resource_id）',
        references: {
          model: 'image_resources',
          key: 'image_resource_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },

      // 遗留字段（已废弃，保留数据库兼容性，新功能使用 image_resource_id）
      image_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '【已废弃】物品图片URL（请使用 image_resource_id）'
      },

      // 遗留字段（已废弃）
      thumbnail_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '【已废弃】缩略图URL（请使用 image_resource_id 关联的缩略图）'
      },

      // 参考价格（积分）
      reference_price_points: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0.0,
        comment: '参考价格（积分）：用于估值和建议定价',
        /**
         * 获取参考价格，将DECIMAL转换为浮点数
         * @returns {number} 参考价格（积分）
         */
        get() {
          const value = this.getDataValue('reference_price_points')
          return value ? parseFloat(value) : 0
        }
      },

      // 是否允许交易上架
      is_tradable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否允许交易上架'
      },

      // 是否启用
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
      },

      // 扩展元数据（JSON格式）
      meta: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '扩展元数据（JSON格式）'
      }
    },
    {
      sequelize,
      modelName: 'ItemTemplate',
      tableName: 'item_templates',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '物品模板表（Item Templates - 不可叠加物品模板定义）',
      indexes: [
        { fields: ['item_type'], name: 'idx_item_templates_item_type' },
        { fields: ['category_code'], name: 'idx_item_templates_category_code' },
        { fields: ['rarity_code'], name: 'idx_item_templates_rarity_code' },
        { fields: ['is_tradable', 'is_enabled'], name: 'idx_item_templates_tradable_enabled' }
      ]
    }
  )

  return ItemTemplate
}
