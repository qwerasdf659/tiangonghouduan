/**
 * SKU 销售属性值模型（EAV — 规格层）
 *
 * 业务用途：
 * - 用关系表替代 JSON spec_values：每个 SKU 对「销售属性」选定一个预设选项（如颜色=冰蓝）
 * - 支持 SQL 级筛选与唯一约束（同一 SKU 同一属性只能选一个选项）
 *
 * 数据关系：
 * - 多对一归属 SKU、属性定义、属性选项；与 SPU 非销售属性（product_attribute_values）互补
 *
 * @see migrations/20260320200000-create-table-unified-product-center.js
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * @class SkuAttributeValue
 * @description SKU 销售属性与选项绑定
 */
class SkuAttributeValue extends Model {
  /**
   * 定义模型关联
   * @param {Object} models - Sequelize 已加载的模型集合
   * @returns {void}
   */
  static associate(models) {
    SkuAttributeValue.belongsTo(models.ProductSku, {
      foreignKey: 'sku_id',
      as: 'sku'
    })
    SkuAttributeValue.belongsTo(models.Attribute, {
      foreignKey: 'attribute_id',
      as: 'attribute'
    })
    SkuAttributeValue.belongsTo(models.AttributeOption, {
      foreignKey: 'option_id',
      as: 'option'
    })
  }
}

/**
 * @param {import('sequelize').Sequelize} sequelize - Sequelize 实例
 * @returns {typeof SkuAttributeValue}
 */
module.exports = sequelize => {
  SkuAttributeValue.init(
    {
      /** 主键 */
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键'
      },
      /** 所属 SKU */
      sku_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '所属 SKU（product_skus.sku_id）',
        references: {
          model: 'product_skus',
          key: 'sku_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      /** 销售属性 */
      attribute_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '属性（attributes.attribute_id）',
        references: {
          model: 'attributes',
          key: 'attribute_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      /** 选中的预设选项 */
      option_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '选项（attribute_options.option_id）',
        references: {
          model: 'attribute_options',
          key: 'option_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      }
    },
    {
      sequelize,
      modelName: 'SkuAttributeValue',
      tableName: 'sku_attribute_values',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: 'SKU 销售属性值（替代 JSON spec_values）'
    }
  )

  return SkuAttributeValue
}
