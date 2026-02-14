/**
 * 竞价商品模型 - BidProduct
 * 臻选空间/幸运空间竞价功能核心表
 *
 * 业务场景：
 * - 管理员创建竞价活动，关联兑换商品（exchange_items）
 * - 竞价时间段内用户出价，冻结资产
 * - 到期后自动结算：中标者扣除冻结资产 + 商品入背包，落选者解冻返还
 *
 * 状态机（7态，决策15 + 决策16）：
 * - pending: 待开始（尚未到达 start_time）
 * - active: 进行中（到达 start_time，定时任务自动激活）
 * - ended: 已结束（到达 end_time，待结算）
 * - settled: 已结算（中标者扣除 + 落选者解冻 + 商品入背包）
 * - settlement_failed: 结算失败（需人工处理）
 * - no_bid: 流拍（无人出价，不做任何资产/库存操作）
 * - cancelled: 已取消（管理员手动取消，所有出价者解冻返还）
 *
 * 一物一拍（决策11）：
 * - 同一 exchange_item_id 同时只能有一个 active 或 pending 状态的竞价
 * - 代码层校验，批次号 batch_no 预留扩展
 *
 * 表名（snake_case）：bid_products
 * 主键命名：bid_product_id
 * 创建时间：2026-02-16
 *
 * @see docs/臻选空间-幸运空间-竞价功能-后端实施方案.md §3.2
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const BidProduct = sequelize.define(
    'BidProduct',
    {
      /** 竞价商品ID（自增主键） */
      bid_product_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '竞价商品ID（自增主键）'
      },

      /** 关联兑换商品ID（exchange_items.exchange_item_id） */
      exchange_item_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '关联兑换商品ID',
        references: {
          model: 'exchange_items',
          key: 'exchange_item_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      /** 起拍价（材料资产数量） */
      start_price: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '起拍价（材料资产数量）'
      },

      /**
       * 竞价使用的资产类型
       * - 禁止 POINTS 和 BUDGET_POINTS（决策1，硬编码黑名单）
       * - 允许 DIAMOND、red_shard 等（决策9，动态白名单）
       */
      price_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'DIAMOND',
        comment: '竞价使用的资产类型（禁止 POINTS/BUDGET_POINTS）'
      },

      /** 当前最高出价（冗余字段，提升查询性能） */
      current_price: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '当前最高出价（冗余字段）'
      },

      /** 最小加价幅度 */
      min_bid_increment: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 10,
        comment: '最小加价幅度'
      },

      /** 竞价开始时间 */
      start_time: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '竞价开始时间'
      },

      /** 竞价结束时间 */
      end_time: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '竞价结束时间'
      },

      /** 中标用户ID（结算后填入） */
      winner_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: '中标用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },

      /** 中标出价记录ID（结算后填入） */
      winner_bid_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '中标出价记录ID（bid_records.bid_record_id）'
      },

      /**
       * 竞价状态（7态状态机）
       * @see 文档 §3.2 状态机流转说明
       */
      status: {
        type: DataTypes.ENUM(
          'pending',
          'active',
          'ended',
          'cancelled',
          'settled',
          'settlement_failed',
          'no_bid'
        ),
        allowNull: false,
        defaultValue: 'pending',
        comment: '竞价状态：pending/active/ended/cancelled/settled/settlement_failed/no_bid'
      },

      /** 总出价次数 */
      bid_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总出价次数'
      },

      /** 批次号（预留扩展，决策11） */
      batch_no: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: null,
        comment: '批次号（预留字段，未来多批次竞价扩展用）'
      },

      /** 创建人（管理员用户ID） */
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '创建人（管理员用户ID）',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      }
    },
    {
      tableName: 'bid_products',
      timestamps: true,
      underscored: true,
      comment: '竞价商品表（臻选空间/幸运空间竞价功能，7态状态机）',
      indexes: [
        { fields: ['status', 'end_time'], name: 'idx_bid_products_status_end' },
        { fields: ['exchange_item_id'], name: 'idx_bid_products_exchange_item' },
        { fields: ['exchange_item_id', 'status'], name: 'idx_bid_products_item_status' },
        { fields: ['exchange_item_id', 'batch_no'], name: 'idx_bid_products_item_batch' },
        { fields: ['status', 'start_time'], name: 'idx_bid_products_status_start' }
      ]
    }
  )

  /**
   * 关联定义
   *
   * @param {Object} models - Sequelize 所有模型集合
   * @returns {void}
   */
  BidProduct.associate = function (models) {
    // 竞价商品关联兑换商品（多对一）
    BidProduct.belongsTo(models.ExchangeItem, {
      foreignKey: 'exchange_item_id',
      as: 'exchangeItem'
    })

    // 竞价商品有多个出价记录（一对多）
    BidProduct.hasMany(models.BidRecord, {
      foreignKey: 'bid_product_id',
      as: 'bidRecords'
    })

    // 中标用户（多对一）
    BidProduct.belongsTo(models.User, {
      foreignKey: 'winner_user_id',
      as: 'winner'
    })

    // 创建人/管理员（多对一）
    BidProduct.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator'
    })
  }

  /**
   * 检查竞价是否可以接受出价
   *
   * @returns {boolean} 是否可出价（status=active 且未到结束时间）
   */
  BidProduct.prototype.isAcceptingBids = function () {
    return this.status === 'active' && new Date(this.end_time) > new Date()
  }

  /**
   * 检查竞价是否已到期待结算
   *
   * @returns {boolean} 是否到期（status=active 且已过结束时间）
   */
  BidProduct.prototype.isExpiredAndPendingSettlement = function () {
    return this.status === 'active' && new Date(this.end_time) <= new Date()
  }

  return BidProduct
}
