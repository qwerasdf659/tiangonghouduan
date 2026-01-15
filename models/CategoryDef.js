/**
 * 物品类目字典模型
 *
 * 业务场景：
 * - 定义商品/物品的分类（如电子产品、餐饮美食、优惠券等）
 * - 为市场挂牌和物品模板提供标准化分类
 * - 支持前端筛选和分类展示
 *
 * 硬约束：
 * - category_code 为主键，使用语义化业务代码（如 electronics、food_drink）
 * - 所有分类必须来自此表，禁止硬编码
 *
 * 命名规范（snake_case）：
 * - 表名：category_defs
 * - 主键：category_code（字符串主键）
 *
 * @version 1.0.0
 * @date 2026-01-15
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 物品类目字典模型类
 * 职责：物品分类定义和管理
 * 设计模式：字典表模式
 */
class CategoryDef extends Model {
  /**
   * 静态关联定义
   *
   * @param {Object} models - Sequelize所有模型的集合对象
   * @returns {void} 无返回值，仅定义关联关系
   */
  static associate(models) {
    // 关联物品模板（一个类目有多个物品模板）
    if (models.ItemTemplate) {
      CategoryDef.hasMany(models.ItemTemplate, {
        foreignKey: 'category_code',
        sourceKey: 'category_code',
        as: 'item_templates'
      })
    }

    // 关联市场挂牌（一个类目有多个挂牌记录）
    if (models.MarketListing) {
      CategoryDef.hasMany(models.MarketListing, {
        foreignKey: 'offer_item_category_code',
        sourceKey: 'category_code',
        as: 'market_listings'
      })
    }
  }

  /**
   * 获取所有启用的类目（按排序）
   *
   * @returns {Promise<Array>} 启用的类目列表
   */
  static async getEnabled() {
    return this.findAll({
      where: { is_enabled: true },
      order: [['sort_order', 'ASC']]
    })
  }
}

/**
 * 模型初始化
 *
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {CategoryDef} 初始化后的模型
 */
module.exports = sequelize => {
  CategoryDef.init(
    {
      // 类目代码（主键，语义化业务标识）
      category_code: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        allowNull: false,
        comment: '类目代码（主键）：如 food_drink, electronics, fashion'
      },

      // 显示名称（用户可见）
      display_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '显示名称（UI展示）'
      },

      // 类目描述
      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '类目描述'
      },

      // 图标URL
      icon_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '图标URL'
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
      modelName: 'CategoryDef',
      tableName: 'category_defs',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '物品类目字典表（Category Definitions - 商品/物品分类定义）'
    }
  )

  return CategoryDef
}
