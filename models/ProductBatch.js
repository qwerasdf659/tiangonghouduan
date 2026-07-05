/**
 * 产品批次模型（ProductBatch）— S2 批次管理（一批一码）
 *
 * 业务定位（docs/商品编码体系设计方案.md §13.3/§14.1）：
 * - 半标品天然「这批料 vs 那批料」，按批次管成本、按批次召回、按批次做防伪连号。
 * - 批次码 batch_code 是「采购/生产域」的独立编码（前缀+日期+序号风格），与对外 item_code 解耦。
 * - 与 product_series（营销成套）是两个正交维度，不合并。
 *
 * 表名：product_batches；主键：batch_id（BIGINT）；唯一键：batch_code
 * 施工边界：本次仅建表结构 + 模型，不接入业务流（S2 启用时再填充 Service/接口）。
 *
 * @module models/ProductBatch
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * @class ProductBatch
 * @extends Model
 */
class ProductBatch extends Model {
  /**
   * 定义模型关联
   * @param {Object} models - Sequelize 已注册模型集合
   * @returns {void}
   */
  static associate(models) {
    if (models.ExchangeItem) {
      ProductBatch.belongsTo(models.ExchangeItem, {
        foreignKey: 'exchange_item_id',
        as: 'exchangeItem'
      })
    }
    if (models.ExchangeItemSku) {
      ProductBatch.belongsTo(models.ExchangeItemSku, {
        foreignKey: 'sku_id',
        as: 'sku'
      })
    }
    if (models.Supplier) {
      ProductBatch.belongsTo(models.Supplier, {
        foreignKey: 'supplier_id',
        as: 'supplier'
      })
    }
    if (models.Item) {
      ProductBatch.hasMany(models.Item, {
        foreignKey: 'batch_id',
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
  ProductBatch.init(
    {
      batch_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '批次主键'
      },
      batch_code: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
        comment: '批次码(可读,前缀+日期+序号风格)'
      },
      exchange_item_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: 'exchange_items', key: 'exchange_item_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: '关联SPU(可空,批次可跨SKU)'
      },
      sku_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: 'exchange_item_skus', key: 'sku_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: '关联SKU(可空)'
      },
      supplier_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: 'suppliers', key: 'supplier_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: '进货来源供应商'
      },
      batch_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '批次成本(进货价)',
        /** @returns {number|null} DECIMAL 转数值（不使用 raw:true 时生效） */
        get() {
          const raw = this.getDataValue('batch_cost')
          if (raw === null || raw === undefined) return null
          const n = parseFloat(raw)
          return Number.isNaN(n) ? null : n
        }
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '批次数量'
      },
      produced_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生产/入库日期（UTC 存储，北京时间展示）'
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
      modelName: 'ProductBatch',
      tableName: 'product_batches',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '产品批次(一批一码;批次与系列号正交)'
    }
  )

  return ProductBatch
}
