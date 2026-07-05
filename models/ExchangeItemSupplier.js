/**
 * 商品-供应商关联模型（ExchangeItemSupplier）— 多对多关联行
 *
 * 业务定位（docs/商品编码体系设计方案.md §3.8/§4.5）：
 * - 承载「一个 SPU 可对应多个供应商」的多源采购关系；每行存该供应商对此 SPU 的原始货号。
 * - 货号 supplier_item_code 是「他们的语言」——可空、可重复、不建唯一索引（脏数据如实存），
 *   仅作采购对账参考，加普通索引加速辅助查询；系统内部只认我方 item_code。
 *
 * 表名：exchange_item_suppliers；主键：id（BIGINT）；唯一：(exchange_item_id, supplier_id)
 *
 * @module models/ExchangeItemSupplier
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * @class ExchangeItemSupplier
 * @extends Model
 */
class ExchangeItemSupplier extends Model {
  /**
   * 定义模型关联
   * @param {Object} models - Sequelize 已注册模型集合
   * @returns {void}
   */
  static associate(models) {
    if (models.ExchangeItem) {
      ExchangeItemSupplier.belongsTo(models.ExchangeItem, {
        foreignKey: 'exchange_item_id',
        as: 'exchangeItem'
      })
    }
    if (models.Supplier) {
      ExchangeItemSupplier.belongsTo(models.Supplier, {
        foreignKey: 'supplier_id',
        as: 'supplier'
      })
    }
  }
}

/**
 * DECIMAL 字符串安全转 number（不使用 raw:true 时模型 getter 生效）
 * @param {*} raw - 原始值
 * @returns {number|null} 数值或 null
 */
function decimalToNumber(raw) {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return raw
  const n = parseFloat(raw)
  return Number.isNaN(n) ? null : n
}

/**
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Model} 初始化后的模型类
 */
module.exports = sequelize => {
  ExchangeItemSupplier.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '关联主键'
      },
      exchange_item_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: 'exchange_items', key: 'exchange_item_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: '商品SPU(exchange_items.exchange_item_id)'
      },
      supplier_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: 'suppliers', key: 'supplier_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: '供应商(suppliers.supplier_id)'
      },
      supplier_item_code: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '该供应商对此SPU的原始货号(可空可重复,仅采购对账参考)'
      },
      is_primary: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否主供货商(展示/默认对账)'
      },
      purchase_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '最近进货价(预留,S1采购单启用时维护)',
        /** @returns {number|null} DECIMAL 转数值（不使用 raw:true 时生效） */
        get() {
          return decimalToNumber(this.getDataValue('purchase_price'))
        }
      },
      quality_score: {
        type: DataTypes.DECIMAL(3, 1),
        allowNull: true,
        comment: '供货质量评分(预留,0.0~10.0)',
        /** @returns {number|null} DECIMAL 转数值（不使用 raw:true 时生效） */
        get() {
          return decimalToNumber(this.getDataValue('quality_score'))
        }
      }
    },
    {
      sequelize,
      modelName: 'ExchangeItemSupplier',
      tableName: 'exchange_item_suppliers',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '商品-供应商多对多关联(货号挂关联行)'
    }
  )

  return ExchangeItemSupplier
}
