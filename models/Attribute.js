/**
 * 商品属性定义模型（统一商品中心 Layer 1）
 *
 * 业务场景：
 * - 定义可复用的规格/参数（如颜色、内存、尺码），供品类绑定与 SKU 生成使用
 * - 区分销售属性（参与 SKU 组合）与非销售属性（仅展示或筛选）
 * - 通过下拉选项（attribute_options）或文本/数字录入收集属性值
 *
 * 表名：attributes；主键：attribute_id
 *
 * @module models/Attribute
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 属性定义模型类
 * 职责：描述属性的元数据与录入方式，并与品类多对多关联
 */
class Attribute extends Model {
  /**
   * 定义模型关联
   *
   * @param {Object} models - Sequelize 已注册模型集合
   * @returns {void}
   */
  static associate(models) {
    if (models.AttributeOption) {
      Attribute.hasMany(models.AttributeOption, {
        foreignKey: 'attribute_id',
        as: 'options'
      })
    }

    if (models.Category && models.CategoryAttribute) {
      Attribute.belongsToMany(models.Category, {
        through: models.CategoryAttribute,
        foreignKey: 'attribute_id',
        otherKey: 'category_id',
        as: 'categories'
      })
    }
  }
}

/**
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Model} 初始化后的模型类
 */
module.exports = sequelize => {
  Attribute.init(
    {
      attribute_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '属性主键'
      },
      attribute_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '属性显示名称'
      },
      attribute_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '属性编码（程序与配置引用）'
      },
      input_type: {
        type: DataTypes.ENUM('select', 'text', 'number'),
        allowNull: false,
        defaultValue: 'select',
        comment: '录入方式：下拉 / 文本 / 数字'
      },
      is_required: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '在该品类绑定场景下是否必填'
      },
      is_sale_attr: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否销售属性（参与 SKU 规格组合）'
      },
      is_searchable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否参与前台筛选/搜索'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '列表与表单中的排序'
      },
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用该属性定义'
      }
    },
    {
      sequelize,
      modelName: 'Attribute',
      tableName: 'attributes',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '属性定义（EAV 商品中心）'
    }
  )

  return Attribute
}
