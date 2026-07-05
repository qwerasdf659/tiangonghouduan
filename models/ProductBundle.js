/**
 * 组合商品主体模型（ProductBundle）— S4 组合/套装/赠品
 *
 * 业务定位（docs/商品编码体系设计方案.md §13.5/§14.3）：
 * - 「手串 + 礼盒 + 保养油」打包成套售卖；组合自身也是一个 SPU（有自己的 item_code）。
 * - 明细走 product_bundle_items（BOM）；子项仍是独立 SPU/SKU，库存/履约按明细拆解。
 * - 施工边界：本次仅建表结构 + 模型，不接入业务流。
 *
 * 表名：product_bundles；主键：bundle_id（BIGINT）；唯一键：exchange_item_id
 *
 * @module models/ProductBundle
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * @class ProductBundle
 * @extends Model
 */
class ProductBundle extends Model {
  /**
   * 定义模型关联
   * @param {Object} models - Sequelize 已注册模型集合
   * @returns {void}
   */
  static associate(models) {
    if (models.ExchangeItem) {
      ProductBundle.belongsTo(models.ExchangeItem, {
        foreignKey: 'exchange_item_id',
        as: 'exchangeItem'
      })
    }
    if (models.ProductBundleItem) {
      ProductBundle.hasMany(models.ProductBundleItem, {
        foreignKey: 'bundle_id',
        as: 'items'
      })
    }
  }
}

/**
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Model} 初始化后的模型类
 */
module.exports = sequelize => {
  ProductBundle.init(
    {
      bundle_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '组合主键'
      },
      exchange_item_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        unique: true,
        references: { model: 'exchange_items', key: 'exchange_item_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: '组合自身对应的SPU(有自己的item_code)'
      },
      bundle_type: {
        type: DataTypes.ENUM('suit', 'gift'),
        allowNull: false,
        defaultValue: 'suit',
        comment: 'suit=套装/gift=赠品搭售'
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: '状态'
      }
    },
    {
      sequelize,
      modelName: 'ProductBundle',
      tableName: 'product_bundles',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '组合商品主体(S4,组合本身也是SPU)'
    }
  )

  return ProductBundle
}
