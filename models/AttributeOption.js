/**
 * 属性预设选项模型（统一商品中心 Layer 1）
 *
 * 业务场景：
 * - 当属性 input_type 为 select 时，提供可选值（如颜色：冰蓝/火红）
 * - 供 SKU 销售属性行引用，保证取值标准化、可统计
 * - 支持按属性维度排序与单独启用/停用
 *
 * 表名：attribute_options；主键：option_id
 *
 * @module models/AttributeOption
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 属性选项模型类
 * 职责：隶属于某一属性定义，承载具体可选值
 */
class AttributeOption extends Model {
  /**
   * 定义模型关联
   *
   * @param {Object} models - Sequelize 已注册模型集合
   * @returns {void}
   */
  static associate(models) {
    AttributeOption.belongsTo(models.Attribute, {
      foreignKey: 'attribute_id',
      as: 'attribute'
    })
  }
}

/**
 * @param {import('sequelize').Sequelize} sequelize - Sequelize 实例
 * @returns {typeof AttributeOption} 初始化后的属性选项模型
 */
module.exports = sequelize => {
  AttributeOption.init(
    {
      option_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '选项主键'
      },
      attribute_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'attributes', key: 'attribute_id' },
        comment: '所属属性定义'
      },
      option_value: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '选项展示值（用户可见文案）'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '同属性下选项排序'
      },
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否可选（停用后历史数据仍可追溯）'
      }
    },
    {
      sequelize,
      modelName: 'AttributeOption',
      tableName: 'attribute_options',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '属性预设选项（EAV 商品中心）'
    }
  )

  return AttributeOption
}
