/**
 * SPU 非销售属性值模型（EAV — 商品层）
 *
 * 业务用途：
 * - 存储「不拆 SKU」的商品描述型属性（如材质、产地、证书编号），与统一 SPU（products）绑定
 * - 与 SKU 级销售属性（sku_attribute_values）区分：本表不参与规格组合，仅用于详情展示与检索
 *
 * 数据关系：
 * - 多对一归属某商品（product_id），并指向属性定义（attribute_id）
 * - 库表层对 (product_id, attribute_id) 唯一，避免同一属性重复录入
 *
 * @see migrations/20260320200000-create-table-unified-product-center.js
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * @class ProductAttributeValue
 * @description 商品（SPU）非销售属性值
 */
class ProductAttributeValue extends Model {
  /**
   * 定义模型关联
   * @param {Object} models - Sequelize 已加载的模型集合
   * @returns {void}
   */
  static associate(models) {
    ProductAttributeValue.belongsTo(models.Product, {
      foreignKey: 'product_id',
      as: 'product'
    })
    ProductAttributeValue.belongsTo(models.Attribute, {
      foreignKey: 'attribute_id',
      as: 'attribute'
    })
  }
}

/**
 * @param {import('sequelize').Sequelize} sequelize - Sequelize 实例
 * @returns {typeof ProductAttributeValue}
 */
module.exports = sequelize => {
  ProductAttributeValue.init(
    {
      /** 主键 */
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键'
      },
      /** 所属统一商品 SPU */
      product_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '所属商品（products.product_id）',
        references: {
          model: 'products',
          key: 'product_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      /** 属性定义 */
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
      /** 文本型属性值 */
      attribute_value: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: '属性值文本（如天然水晶、GIA 证书号）'
      }
    },
    {
      sequelize,
      modelName: 'ProductAttributeValue',
      tableName: 'product_attribute_values',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: 'SPU 非销售属性值（EAV 商品中心）'
    }
  )

  return ProductAttributeValue
}
