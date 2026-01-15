/**
 * 稀有度字典模型
 *
 * 业务场景：
 * - 定义物品的稀有度等级（如普通、稀有、史诗、传说等）
 * - 为物品模板和市场挂牌提供标准化稀有度分类
 * - 支持前端按稀有度筛选和颜色展示
 *
 * 硬约束：
 * - rarity_code 为主键，使用语义化业务代码（如 common、rare、legendary）
 * - 所有稀有度必须来自此表，禁止硬编码
 * - tier 字段用于数值比较（越高越稀有）
 *
 * 命名规范（snake_case）：
 * - 表名：rarity_defs
 * - 主键：rarity_code（字符串主键）
 *
 * @version 1.0.0
 * @date 2026-01-15
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 稀有度字典模型类
 * 职责：物品稀有度定义和管理
 * 设计模式：字典表模式
 */
class RarityDef extends Model {
  /**
   * 静态关联定义
   *
   * @param {Object} models - Sequelize所有模型的集合对象
   * @returns {void} 无返回值，仅定义关联关系
   */
  static associate(models) {
    // 关联物品模板（一个稀有度有多个物品模板）
    if (models.ItemTemplate) {
      RarityDef.hasMany(models.ItemTemplate, {
        foreignKey: 'rarity_code',
        sourceKey: 'rarity_code',
        as: 'item_templates'
      })
    }

    // 关联市场挂牌（一个稀有度有多个挂牌记录）
    if (models.MarketListing) {
      RarityDef.hasMany(models.MarketListing, {
        foreignKey: 'offer_item_rarity',
        sourceKey: 'rarity_code',
        as: 'market_listings'
      })
    }
  }

  /**
   * 获取所有启用的稀有度（按排序）
   *
   * @returns {Promise<Array>} 启用的稀有度列表
   */
  static async getEnabled() {
    return this.findAll({
      where: { is_enabled: true },
      order: [['sort_order', 'ASC']]
    })
  }

  /**
   * 按等级获取稀有度（tier >= 指定值）
   *
   * @param {number} minTier - 最低等级
   * @returns {Promise<Array>} 符合条件的稀有度列表
   */
  static async getByMinTier(minTier) {
    return this.findAll({
      where: {
        is_enabled: true,
        tier: { [require('sequelize').Op.gte]: minTier }
      },
      order: [['tier', 'ASC']]
    })
  }
}

/**
 * 模型初始化
 *
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {RarityDef} 初始化后的模型
 */
module.exports = sequelize => {
  RarityDef.init(
    {
      // 稀有度代码（主键，语义化业务标识）
      rarity_code: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        allowNull: false,
        comment: '稀有度代码（主键）：如 common, uncommon, rare, epic, legendary'
      },

      // 显示名称（用户可见）
      display_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '显示名称（UI展示）'
      },

      // 稀有度描述
      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '稀有度描述'
      },

      // 主题颜色（HEX格式）
      color_hex: {
        type: DataTypes.STRING(7),
        allowNull: true,
        comment: '主题颜色（HEX格式）：如 #FFFFFF'
      },

      // 稀有度等级（数值，越高越稀有）
      tier: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '稀有度等级（数值越高越稀有）'
      },

      // 排序顺序
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序顺序（升序）'
      },

      // 是否启用
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
      }
    },
    {
      sequelize,
      modelName: 'RarityDef',
      tableName: 'rarity_defs',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '稀有度字典表（Rarity Definitions - 物品稀有度等级定义）'
    }
  )

  return RarityDef
}
