/**
 * 供货商主数据模型（Supplier）
 *
 * 业务定位（docs/商品编码体系设计方案.md §3.8/§4.5）：
 * - 记录商品的进货来源（供货商），与核销结算的 merchants（核销商家）语义完全不同，彻底分表不复用。
 * - 一个商品可对应多个供应商（多源采购），关联落在 exchange_item_suppliers 关联表，货号挂关联行。
 *
 * 表名：suppliers；主键：supplier_id（BIGINT）；唯一键：supplier_name（防重复建档）
 *
 * @module models/Supplier
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * @class Supplier
 * @extends Model
 */
class Supplier extends Model {
  /**
   * 定义模型关联
   * @param {Object} models - Sequelize 已注册模型集合
   * @returns {void}
   */
  static associate(models) {
    if (models.ExchangeItem && models.ExchangeItemSupplier) {
      Supplier.belongsToMany(models.ExchangeItem, {
        through: models.ExchangeItemSupplier,
        foreignKey: 'supplier_id',
        otherKey: 'exchange_item_id',
        as: 'items'
      })
      Supplier.hasMany(models.ExchangeItemSupplier, {
        foreignKey: 'supplier_id',
        as: 'itemLinks'
      })
    }
  }
}

/**
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Model} 初始化后的模型类
 */
module.exports = sequelize => {
  Supplier.init(
    {
      supplier_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '供应商主键'
      },
      supplier_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '供应商名称（唯一，防运营重复建档）'
      },
      contact_name: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '联系人'
      },
      contact_phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '联系电话'
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: '状态：active 启用 / inactive 停用'
      },
      notes: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '备注'
      }
    },
    {
      sequelize,
      modelName: 'Supplier',
      tableName: 'suppliers',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '供货商主数据(区别于核销 merchants)'
    }
  )

  return Supplier
}
