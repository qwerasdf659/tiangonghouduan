/**
 * 二手寄卖单模型（ConsignmentOrder）— S3 二手回流/寄卖
 *
 * 业务定位（docs/商品编码体系设计方案.md §13.4/§14.5）：
 * - 用户把旧物寄卖回平台再售；所有权流转复用 items + item_ledger（一物一码为天然载体）。
 * - 转赠不单独建表（复用 item_ledger 的 owner_account_id 变更 + event_type='transfer'）。
 * - 施工边界：本次仅建表结构 + 模型，不接入业务流（S3 风控最重，上线前单独评审）。
 *
 * 表名：consignment_orders；主键：consignment_id（BIGINT）；唯一键：order_no
 *
 * @module models/ConsignmentOrder
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * @class ConsignmentOrder
 * @extends Model
 */
class ConsignmentOrder extends Model {
  /**
   * 定义模型关联
   * @param {Object} models - Sequelize 已注册模型集合
   * @returns {void}
   */
  static associate(models) {
    if (models.Item) {
      ConsignmentOrder.belongsTo(models.Item, {
        foreignKey: 'item_id',
        as: 'item'
      })
    }
    if (models.Account) {
      ConsignmentOrder.belongsTo(models.Account, {
        foreignKey: 'consignor_account_id',
        as: 'consignor'
      })
    }
    if (models.ExchangeItem) {
      ConsignmentOrder.belongsTo(models.ExchangeItem, {
        foreignKey: 'relist_item_id',
        as: 'relistItem'
      })
    }
  }
}

/**
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Model} 初始化后的模型类
 */
module.exports = sequelize => {
  ConsignmentOrder.init(
    {
      consignment_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '寄卖单主键'
      },
      order_no: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
        comment: '寄卖单号'
      },
      item_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: 'items', key: 'item_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: '寄卖的实物实例(items.item_id,一物一码)'
      },
      consignor_account_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: 'accounts', key: 'account_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: '寄卖人账户(accounts.account_id)'
      },
      list_price: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '寄卖定价(计价资产数量)'
      },
      list_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '计价资产码'
      },
      relist_item_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: 'exchange_items', key: 'exchange_item_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: '回流后再上架的目标SPU'
      },
      status: {
        type: DataTypes.ENUM('pending', 'listed', 'sold', 'withdrawn', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '状态'
      }
    },
    {
      sequelize,
      modelName: 'ConsignmentOrder',
      tableName: 'consignment_orders',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '二手寄卖单(S3)'
    }
  )

  return ConsignmentOrder
}
