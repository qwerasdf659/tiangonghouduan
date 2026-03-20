/**
 * 品类与属性绑定模型（统一商品中心 Layer 1）
 *
 * 业务场景：
 * - 声明「某品类需要哪些属性」及在该品类内的展示顺序
 * - 作为 Attribute 与 Category 多对多关系的中间表（并承载 sort_order）
 * - 与 attributes、categories 同步维护，删除品类或属性时级联清理绑定行
 *
 * 表名：category_attributes；主键：id
 *
 * @module models/CategoryAttribute
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 品类属性关联模型类
 * 职责：连接品类与属性定义，控制属性在品类维度的排序
 */
class CategoryAttribute extends Model {
  /**
   * 定义模型关联
   *
   * @param {Object} models - Sequelize 已注册模型集合
   * @returns {void}
   */
  static associate(models) {
    CategoryAttribute.belongsTo(models.Category, {
      foreignKey: 'category_id',
      as: 'category'
    })

    CategoryAttribute.belongsTo(models.Attribute, {
      foreignKey: 'attribute_id',
      as: 'attribute'
    })
  }
}

/**
 * @param {import('sequelize').Sequelize} sequelize - Sequelize 实例
 * @returns {typeof CategoryAttribute} 初始化后的中间表模型
 */
module.exports = sequelize => {
  CategoryAttribute.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键'
      },
      category_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'categories', key: 'category_id' },
        comment: '品类 ID'
      },
      attribute_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'attributes', key: 'attribute_id' },
        comment: '属性 ID'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '该品类内属性展示顺序'
      }
    },
    {
      sequelize,
      modelName: 'CategoryAttribute',
      tableName: 'category_attributes',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '品类绑定属性（EAV 商品中心）'
    }
  )

  return CategoryAttribute
}
