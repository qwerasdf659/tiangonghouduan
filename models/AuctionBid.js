/**
 * C2C 拍卖出价记录模型 - AuctionBid
 * 用户间竞拍功能出价流水表
 *
 * 业务场景：
 * - 记录用户每次出价（含冻结流水对账、幂等性控制）
 * - is_winning 标记当前最高出价，is_final_winner 标记最终中标
 * - 通过 idempotency_key UNIQUE 约束防止重复出价
 * - freeze_transaction_id 关联冻结流水用于对账
 *
 * 与 BidRecord 的区别：
 * - FK 指向 auction_listings 而非 bid_products
 * - 幂等键格式：auction_{user_id}_{auction_listing_id}_{timestamp}
 *
 * 表名（snake_case）：auction_bids
 * 主键命名：auction_bid_id
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const AuctionBid = sequelize.define(
    'AuctionBid',
    {
      /** 出价记录ID（自增主键） */
      auction_bid_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: 'C2C拍卖出价记录ID（自增主键）'
      },

      /** 关联拍卖挂牌ID（auction_listings.auction_listing_id） */
      auction_listing_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '关联拍卖挂牌ID',
        references: { model: 'auction_listings', key: 'auction_listing_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      /** 出价用户ID（users.user_id） */
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '出价用户ID',
        references: { model: 'users', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      /** 出价金额（材料资产数量） */
      bid_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '出价金额（材料资产数量）',
        /** @returns {number} BIGINT 转换为 JS Number */
        get() {
          return Number(this.getDataValue('bid_amount') || 0)
        }
      },

      /** 出价时的前最高价（审计用） */
      previous_highest: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '出价时的前最高价（审计用）',
        /** @returns {number} BIGINT 转换为 JS Number */
        get() {
          return Number(this.getDataValue('previous_highest') || 0)
        }
      },

      /** 是否当前最高价（出价时标记，后续出价会将前一条改为 false） */
      is_winning: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否当前最高价'
      },

      /** 是否最终中标（结算时由定时任务/一口价即时结算标记） */
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
        comment: '幂等键（格式：auction_{user_id}_{auction_listing_id}_{timestamp}）'
      }
    },
    {
      tableName: 'auction_bids',
      timestamps: true,
      underscored: true,
      updatedAt: false,
      comment: 'C2C拍卖出价记录表（含冻结流水对账、幂等性控制）',
      indexes: [
        { fields: ['auction_listing_id', 'bid_amount'], name: 'idx_auction_bids_listing_amount' },
        { fields: ['user_id', 'auction_listing_id'], name: 'idx_auction_bids_user' }
      ]
    }
  )

  /**
   * 关联定义
   * @param {Object} models - Sequelize 所有模型集合
   * @returns {void}
   */
  AuctionBid.associate = function (models) {
    // 出价记录属于拍卖挂牌（多对一）
    AuctionBid.belongsTo(models.AuctionListing, {
      foreignKey: 'auction_listing_id',
      as: 'auctionListing'
    })

    // 出价记录属于用户（多对一）
    AuctionBid.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'bidder'
    })
  }

  return AuctionBid
}
