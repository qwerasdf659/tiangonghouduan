/**
 * 物品类目字典模型
 *
 * 业务场景：
 * - 定义商品/物品的分类（如电子产品、餐饮美食、优惠券等）
 * - 为市场挂牌和物品模板提供标准化分类
 * - 支持前端筛选和分类展示
 * - 支持两级分类（parent_category_def_id 自引用）
 *
 * 硬约束：
 * - category_def_id 为自增整数主键（V2.0 迁移自 VARCHAR PK）
 * - category_code 为唯一业务标识（UNIQUE KEY）
 * - 所有分类必须来自此表，禁止硬编码
 *
 * 命名规范（snake_case）：
 * - 表名：category_defs
 * - 主键：category_def_id（整数自增）
 * - 业务标识：category_code（UNIQUE）
 *
 * @version 2.0.0
 * @date 2026-03-16
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 分类定义模型 — 两级分类体系（一级 + 二级）
 * 用于商品模板、集市挂单、兑换商品的分类归属
 */
class CategoryDef extends Model {
  /**
   * 定义分类与其他模型的关联关系
   * @param {Object} models - Sequelize 模型集合
   * @returns {void}
   */
  static associate(models) {
    // 两级分类自引用
    CategoryDef.belongsTo(CategoryDef, {
      foreignKey: 'parent_category_def_id',
      as: 'parent'
    })
    CategoryDef.hasMany(CategoryDef, {
      foreignKey: 'parent_category_def_id',
      as: 'children'
    })

    /** 图标通过 media_attachments 多态关联获取（替代已删除的 icon_url 列） */
    if (models.MediaAttachment) {
      CategoryDef.hasOne(models.MediaAttachment, {
        foreignKey: 'attachable_id',
        constraints: false,
        scope: { attachable_type: 'category_def', role: 'icon' },
        as: 'iconAttachment'
      })
    }

    if (models.ItemTemplate) {
      CategoryDef.hasMany(models.ItemTemplate, {
        foreignKey: 'category_def_id',
        as: 'item_templates'
      })
    }

    if (models.MarketListing) {
      CategoryDef.hasMany(models.MarketListing, {
        foreignKey: 'offer_category_def_id',
        as: 'market_listings'
      })
    }

    if (models.ExchangeItem) {
      CategoryDef.hasMany(models.ExchangeItem, {
        foreignKey: 'category_def_id',
        as: 'exchange_items'
      })
    }
  }

  /**
   * 获取两级分类树（零递归，一次查询后内存组装）
   *
   * @returns {Promise<Array>} 树形分类结构，顶层为一级分类，每项含 children 子数组
   */
  static async getTree() {
    const all = await this.findAll({
      where: { is_enabled: true },
      order: [
        ['level', 'ASC'],
        ['sort_order', 'ASC']
      ],
      raw: true
    })
    const top = all.filter(c => c.level === 1)
    return top.map(t => ({
      ...t,
      children: all.filter(c => c.parent_category_def_id === t.category_def_id)
    }))
  }

  /**
   * 获取指定一级分类下所有子分类 ID（含自身）
   *
   * @param {number} parentDefId - 一级分类 ID
   * @returns {Promise<number[]>} 分类 ID 数组（含 parentDefId 自身）
   */
  static async getIdsWithChildren(parentDefId) {
    const children = await this.findAll({
      where: { parent_category_def_id: parentDefId },
      attributes: ['category_def_id'],
      raw: true
    })
    return [parentDefId, ...children.map(c => c.category_def_id)]
  }

  /**
   * 通过 category_code 查找分类（配置实体使用 code 标识）
   *
   * @param {string} code - 分类代码
   * @returns {Promise<CategoryDef|null>} 匹配的分类实例，未找到时返回 null
   */
  static async findByCode(code) {
    return this.findOne({ where: { category_code: code } })
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
 * @param {Sequelize} sequelize - Sequelize 实例
 * @returns {CategoryDef} 初始化后的模型
 */
module.exports = sequelize => {
  CategoryDef.init(
    {
      category_def_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '类目定义ID（整数自增主键）'
      },

      category_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '类目代码（业务唯一标识）：如 food_drink, electronics, fashion'
      },

      display_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '显示名称（UI展示）'
      },

      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '类目描述'
      },

      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序顺序（升序）'
      },

      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
      },

      parent_category_def_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: '父分类ID，NULL 表示一级分类',
        references: {
          model: 'category_defs',
          key: 'category_def_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },

      level: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1,
        comment: '层级（1=一级，2=二级），应用层限制最多 2 级',
        validate: {
          isIn: [[1, 2]]
        }
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
