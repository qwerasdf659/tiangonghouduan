/**
 * 组合明细模型（ProductBundleItem）— S4 组合 BOM
 *
 * 业务定位（docs/商品编码体系设计方案.md §14.3）：
 * - 组合明细（BOM）：父组合 ↔ 子 SPU/SKU + 数量 + 是否赠品。
 * - 施工边界：本次仅建表结构 + 模型，不接入业务流。
 *
 * 表名：product_bundle_items；主键：id（BIGINT）
 *
 * @module models/ProductBundleItem
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * @class ProductBundleItem
 * @extends Model
 */
class ProductBundleItem extends Model {
  /**
   * 定义模型关联
   * @param {Object} models - Sequelize 已注册模型集合
   * @returns {void}
   */
  static associate(models) {
    if (models.ProductBundle) {
      ProductBundleItem.belongsTo(models.ProductBundle, {
        foreignKey: 'bundle_id',
        as: 'bundle'
      })
    }
    if (models.ExchangeItem) {
      ProductBundleItem.belongsTo(models.ExchangeItem, {
        foreignKey: 'child_item_id',
        as: 'childItem'
      })
    }
    if (models.ExchangeItemSku) {
      ProductBundleItem.belongsTo(models.ExchangeItemSku, {
        foreignKey: 'child_sku_id',
        as: 'childSku'
      })
    }
  }
}

/**
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Model} 初始化后的模型类
 */
module.exports = sequelize => {
  ProductBundleItem.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '组合明细主键'
      },
      bundle_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: 'product_bundles', key: 'bundle_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: '所属组合'
      },
      child_item_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: 'exchange_items', key: 'exchange_item_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: '子项SPU'
      },
      child_sku_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: 'exchange_item_skus', key: 'sku_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: '子项SKU'
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '数量'
      },
      is_gift: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否赠品'
      }
    },
    {
      sequelize,
      modelName: 'ProductBundleItem',
      tableName: 'product_bundle_items',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '组合明细BOM(S4)'
    }
  )

  return ProductBundleItem
}
