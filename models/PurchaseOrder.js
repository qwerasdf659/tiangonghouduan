/**
 * 采购单头模型（PurchaseOrder）— S1 进货管理
 *
 * 业务定位（docs/商品编码体系设计方案.md §13.2/§14.2）：
 * - 向供应商按批进货的单据头，记录供应商、总额、状态、下单/到货时间。
 * - 施工边界：本次仅建表结构 + 模型，不接入业务流（S1 启用时再填充 Service/接口）。
 *
 * 表名：purchase_orders；主键：purchase_order_id（BIGINT）；唯一键：order_no
 *
 * @module models/PurchaseOrder
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * @class PurchaseOrder
 * @extends Model
 */
class PurchaseOrder extends Model {
  /**
   * 定义模型关联
   * @param {Object} models - Sequelize 已注册模型集合
   * @returns {void}
   */
  static associate(models) {
    if (models.Supplier) {
      PurchaseOrder.belongsTo(models.Supplier, {
        foreignKey: 'supplier_id',
        as: 'supplier'
      })
    }
    if (models.PurchaseOrderItem) {
      PurchaseOrder.hasMany(models.PurchaseOrderItem, {
        foreignKey: 'purchase_order_id',
        as: 'lines'
      })
    }
  }
}

/**
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Model} 初始化后的模型类
 */
module.exports = sequelize => {
  PurchaseOrder.init(
    {
      purchase_order_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '采购单主键'
      },
      order_no: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
        comment: '采购单号'
      },
      supplier_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: 'suppliers', key: 'supplier_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: '供应商'
      },
      total_amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        comment: '采购总额',
        /** @returns {number|null} DECIMAL 转数值（不使用 raw:true 时生效） */
        get() {
          const raw = this.getDataValue('total_amount')
          if (raw === null || raw === undefined) return null
          const n = parseFloat(raw)
          return Number.isNaN(n) ? null : n
        }
      },
      status: {
        type: DataTypes.ENUM('draft', 'ordered', 'received', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft',
        comment: '状态：draft草稿/ordered已下单/received已到货/cancelled已取消'
      },
      ordered_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '下单时间（UTC 存储，北京时间展示）'
      },
      received_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '到货时间（UTC 存储，北京时间展示）'
      },
      remark: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '备注'
      }
    },
    {
      sequelize,
      modelName: 'PurchaseOrder',
      tableName: 'purchase_orders',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '采购单头(S1进货管理)'
    }
  )

  return PurchaseOrder
}
