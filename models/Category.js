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

    if (models.Product) {
      Category.hasMany(models.Product, {
        foreignKey: 'category_id',
        as: 'products'
      })
    }

    if (models.CategoryAttribute) {
      Category.hasMany(models.CategoryAttribute, {
        foreignKey: 'category_id',
        as: 'category_attributes'
      })
    }

    if (models.MediaFile) {
      Category.belongsTo(models.MediaFile, {
        foreignKey: 'icon_media_id',
        as: 'icon_media'
      })
    }
  }
}

/**
 * @param {import('sequelize').Sequelize} sequelize - Sequelize 实例
 * @returns {typeof Category} 初始化后的品类模型
 */
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
