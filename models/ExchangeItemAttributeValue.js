/**
 * SPU 非销售属性值模型（EAV — 兑换商品层）
 *
 * 业务用途：
 * - 存储「不拆 SKU」的商品描述型属性（如材质、产地、证书编号），与兑换商品 SPU（exchange_items）绑定
 * - 与 SKU 级销售属性（sku_attribute_values）区分：本表不参与规格组合，仅用于详情展示与检索
 *
 * 数据关系：
 * - 多对一归属某商品（exchange_item_id），并指向属性定义（attribute_id）
 * - 库表层对 (exchange_item_id, attribute_id) 唯一，避免同一属性重复录入
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * @class ExchangeItemAttributeValue
 * @description 兑换商品（SPU）非销售属性值
 */
class ExchangeItemAttributeValue extends Model {
  /**
   * 定义模型关联
   * @param {Object} models - Sequelize 已加载的模型集合
   * @returns {void}
   */
  static associate(models) {
    ExchangeItemAttributeValue.belongsTo(models.ExchangeItem, {
      foreignKey: 'exchange_item_id',
      as: 'exchangeItem'
    })
    ExchangeItemAttributeValue.belongsTo(models.Attribute, {
      foreignKey: 'attribute_id',
      as: 'attribute'
    })
  }
}

/**
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Model} 初始化后的模型类
 */
module.exports = sequelize => {
  ExchangeItemAttributeValue.init(
    {
      /** 主键 */
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键'
      },
      /** 所属兑换商品 SPU */
      exchange_item_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '所属兑换商品（exchange_items.exchange_item_id）',
        references: {
          model: 'exchange_items',
          key: 'exchange_item_id'
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
      modelName: 'ExchangeItemAttributeValue',
      tableName: 'exchange_item_attribute_values',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '兑换商品 SPU 非销售属性值（EAV 商品中心）'
    }
  )

  return ExchangeItemAttributeValue
}
