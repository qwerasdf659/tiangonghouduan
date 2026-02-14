/**
 * 竞价出价记录模型 - BidRecord
 * 臻选空间/幸运空间竞价功能出价流水表
 *
 * 业务场景：
 * - 记录用户每次出价（含冻结流水对账、幂等性控制）
 * - is_winning 标记当前最高出价，is_final_winner 标记最终中标
 * - 通过 idempotency_key UNIQUE 约束防止重复出价
 * - freeze_transaction_id 关联冻结流水用于对账
 *
 * 幂等键格式：bid_{user_id}_{bid_product_id}_{timestamp}
 *
 * 表名（snake_case）：bid_records
 * 主键命名：bid_record_id
 * 创建时间：2026-02-16
 *
 * @see docs/臻选空间-幸运空间-竞价功能-后端实施方案.md §3.3
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const BidRecord = sequelize.define(
    'BidRecord',
    {
      /** 出价记录ID（自增主键） */
      bid_record_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '出价记录ID（自增主键）'
      },

      /** 关联竞价商品ID（bid_products.bid_product_id） */
      bid_product_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '关联竞价商品ID',
        references: {
          model: 'bid_products',
          key: 'bid_product_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      /** 出价用户ID（users.user_id） */
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '出价用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      /** 出价金额（材料资产数量） */
      bid_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '出价金额（材料资产数量）'
      },

      /** 出价时的前最高价（审计用） */
      previous_highest: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '出价时的前最高价（审计用）'
      },

      /** 是否当前最高价（出价时标记，后续出价会将前一条改为 false） */
      is_winning: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否当前最高价'
      },

      /** 是否最终中标（结算时由定时任务标记） */
      is_final_winner: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否最终中标（结算时标记）'
      },

      /** 冻结流水ID（对账用，关联 asset_transactions.asset_transaction_id） */
      freeze_transaction_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '冻结流水ID（对账用）'
      },

      /** 幂等键（防止重复出价，UNIQUE 约束） */
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '幂等键（格式：bid_{user_id}_{bid_product_id}_{timestamp}）'
      }
    },
    {
      tableName: 'bid_records',
      timestamps: true,
      underscored: true,
      updatedAt: false, // 出价记录不需要 updated_at（只写不改）
      comment: '竞价出价记录表（含冻结流水对账、幂等性控制）',
      indexes: [
        { fields: ['bid_product_id', 'bid_amount'], name: 'idx_bid_records_product_amount' },
        { fields: ['user_id', 'bid_product_id'], name: 'idx_bid_records_user_bid' }
      ]
    }
  )

  /**
   * 关联定义
   *
   * @param {Object} models - Sequelize 所有模型集合
   * @returns {void}
   */
  BidRecord.associate = function (models) {
    // 出价记录属于竞价商品（多对一）
    BidRecord.belongsTo(models.BidProduct, {
      foreignKey: 'bid_product_id',
      as: 'bidProduct'
    })

    // 出价记录属于用户（多对一）
    BidRecord.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'bidder'
    })
  }

  return BidRecord
}
