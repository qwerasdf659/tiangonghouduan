/**
 * 品类树模型（统一商品中心 Layer 1）
 *
 * 业务场景：
 * - 支撑多级品类导航（父子树），用于商品归类与前台筛选
 * - 品类可绑定展示图标（关联媒体库），并控制启用状态与排序
 * - 作为属性绑定的入口：某品类下可配置哪些规格/参数属性
 *
 * 表名：categories；主键：category_id
 *
 * @module models/Category
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 品类模型类
 * 职责：维护品类层级与编码，连接商品与品类属性配置
 */
class Category extends Model {
  /**
   * 定义模型关联（部分关联在对应模型尚未加载时做存在性判断）
   *
   * @param {Object} models - Sequelize 已注册模型集合
   * @returns {void}
   */
  static associate(models) {
    Category.belongsTo(Category, {
      foreignKey: 'parent_category_id',
      as: 'parent'
    })

    Category.hasMany(Category, {
      foreignKey: 'parent_category_id',
      as: 'children'
    })

    if (models.ExchangeItem) {
      Category.hasMany(models.ExchangeItem, {
        foreignKey: 'category_id',
        as: 'exchangeItems'
      })
    }

    if (models.CategoryAttribute) {
      Category.hasMany(models.CategoryAttribute, {
        foreignKey: 'category_id',
        as: 'category_attributes'
      })
    }

    if (models.ItemTemplate) {
      Category.hasMany(models.ItemTemplate, {
        foreignKey: 'category_id',
        as: 'item_templates'
      })
    }

    if (models.MarketListing) {
      Category.hasMany(models.MarketListing, {
        foreignKey: 'offer_category_id',
        as: 'market_listings'
      })
    }

    if (models.MediaFile) {
      Category.belongsTo(models.MediaFile, {
        foreignKey: 'icon_media_id',
        as: 'icon_media'
      })
    }

    if (models.MediaAttachment) {
      Category.hasOne(models.MediaAttachment, {
        foreignKey: 'attachable_id',
        constraints: false,
        scope: { attachable_type: 'category' },
        as: 'iconAttachment'
      })
    }
  }

  /**
   * 构建品类树（一级+二级嵌套）
   *
   * @returns {Promise<Array>} 顶级品类数组，每项含 children 子品类
   */
  static async getTree() {
    const all = await this.findAll({
      order: [['sort_order', 'ASC']],
      raw: true
    })
    const topLevel = all.filter(c => c.parent_category_id == null)
    return topLevel.map(t => ({
      ...t,
      children: all.filter(c => c.parent_category_id === t.category_id)
    }))
  }

  /**
   * 获取指定品类及其所有子品类的 ID 数组（用于 WHERE IN 查询）
   *
   * @param {number} parentId - 父品类 ID
   * @returns {Promise<number[]>} [parentId, ...childIds]
   */
  static async getIdsWithChildren(parentId) {
    const children = await this.findAll({
      where: { parent_category_id: parentId },
      attributes: ['category_id'],
      raw: true
    })
    return [parentId, ...children.map(c => c.category_id)]
  }

  /**
   * 通过 category_code 查找品类
   *
   * @param {string} code - 品类编码
   * @returns {Promise<Category|null>} 匹配的品类实例，未找到时返回 null
   */
  static async findByCode(code) {
    return this.findOne({ where: { category_code: code } })
  }

  /**
   * 将品类主键数字或 category_code 解析为 category_id（查询层统一入口）
   *
   * @param {string|number|null|undefined} codeOrId - 数字 ID 或品类编码
   * @param {Object} [options={}] - 查询选项
   * @param {Object} [options.transaction] - Sequelize 事务
   * @returns {Promise<number|null>} 有效品类主键，不存在或无效时 null
   */
  static async resolveToId(codeOrId, options = {}) {
    const { transaction } = options
    if (codeOrId === null || codeOrId === undefined || codeOrId === '') {
      return null
    }
    const str = String(codeOrId).trim()
    const asNum = parseInt(str, 10)
    if (!Number.isNaN(asNum) && str === String(asNum) && asNum > 0) {
      const row = await this.findByPk(asNum, { attributes: ['category_id'], transaction })
      return row ? row.category_id : null
    }
    const row = await this.findOne({
      where: { category_code: str },
      attributes: ['category_id'],
      transaction
    })
    return row ? row.category_id : null
  }
}

// eslint-disable-next-line valid-jsdoc
/** @param {import('sequelize').Sequelize} sequelize */
module.exports = sequelize => {
  Category.init(
    {
      category_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '品类主键'
      },
      parent_category_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'categories', key: 'category_id' },
        comment: '父品类 ID，顶级为 NULL'
      },
      category_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '品类名称（展示用）'
      },
      category_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '品类编码（全局唯一，用于接口与配置）'
      },
      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '品类说明（运营/字典展示）'
      },
      level: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1,
        comment: '层级深度（1 一级 / 2 二级 …）'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '同级排序，数值越小越靠前'
      },
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否在前台与后台启用'
      },
      icon_media_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'media_files', key: 'media_id' },
        comment: '品类图标，对应 media_files.media_id'
      }
    },
    {
      sequelize,
      modelName: 'Category',
      tableName: 'categories',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '品类树（EAV 商品中心）'
    }
  )

  return Category
}
