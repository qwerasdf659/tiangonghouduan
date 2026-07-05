/**
 * 采购单明细行模型（PurchaseOrderItem）— S1 进货管理
 *
 * 业务定位（docs/商品编码体系设计方案.md §14.2）：
 * - 采购单的明细行：采购的 SPU/SKU、数量、进货单价、入库批次。
 * - 施工边界：本次仅建表结构 + 模型，不接入业务流。
 *
 * 表名：purchase_order_items；主键：id（BIGINT）
 *
 * @module models/PurchaseOrderItem
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * @class PurchaseOrderItem
 * @extends Model
 */
class PurchaseOrderItem extends Model {
  /**
   * 定义模型关联
   * @param {Object} models - Sequelize 已注册模型集合
   * @returns {void}
   */
  static associate(models) {
    if (models.PurchaseOrder) {
      PurchaseOrderItem.belongsTo(models.PurchaseOrder, {
        foreignKey: 'purchase_order_id',
        as: 'order'
      })
    }
    if (models.ExchangeItem) {
      PurchaseOrderItem.belongsTo(models.ExchangeItem, {
        foreignKey: 'exchange_item_id',
        as: 'exchangeItem'
      })
    }
    if (models.ExchangeItemSku) {
      PurchaseOrderItem.belongsTo(models.ExchangeItemSku, {
        foreignKey: 'sku_id',
        as: 'sku'
      })
    }
    if (models.ProductBatch) {
      PurchaseOrderItem.belongsTo(models.ProductBatch, {
        foreignKey: 'batch_id',
        as: 'batch'
      })
    }
  }
}

/**
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Model} 初始化后的模型类
 */
module.exports = sequelize => {
  PurchaseOrderItem.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '采购单行主键'
      },
      purchase_order_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: 'purchase_orders', key: 'purchase_order_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: '所属采购单'
      },
      exchange_item_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: 'exchange_items', key: 'exchange_item_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: '采购的SPU'
      },
      sku_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: 'exchange_item_skus', key: 'sku_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: '采购的SKU'
      },
      batch_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: 'product_batches', key: 'batch_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: '入库批次(关联product_batches)'
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '采购数量'
      },
      purchase_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '进货单价',
        /** @returns {number|null} DECIMAL 转数值（不使用 raw:true 时生效） */
        get() {
          const raw = this.getDataValue('purchase_price')
          if (raw === null || raw === undefined) return null
          const n = parseFloat(raw)
          return Number.isNaN(n) ? null : n
        }
      }
    },
    {
      sequelize,
      modelName: 'PurchaseOrderItem',
      tableName: 'purchase_order_items',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '采购单明细行(S1)'
    }
  )

  return PurchaseOrderItem
}
