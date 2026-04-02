/**
 * C2C 拍卖挂牌模型 - AuctionListing
 * 用户间竞拍功能核心表
 *
 * 业务场景：
 * - 用户从背包选择物品发起拍卖（与 B2C 的 BidProduct 由管理员创建不同）
 * - 卖方物品通过 ItemService.holdItem() 锁定（hold_type='trade'）
 * - 竞拍时间段内其他用户出价，冻结资产
 * - 到期后自动结算：物品 transferItem + 手续费 + 卖方入账 + 落选者解冻
 * - 支持一口价（buyout_price）即时结算
 *
 * 与 BidProduct 的区别：
 * - 卖方是普通用户（seller_user_id），不是管理员
 * - 商品来源是 items 表（物品实例），不是 exchange_items
 * - 结算涉及手续费（fee_rate/fee_amount/net_amount）和物品转移
 *
 * 状态机（7态，与 bid_products 完全相同）：
 * - pending → active（定时任务激活）
 * - active → ended → settled（有出价，正常结算）
 * - active → ended → no_bid（无出价，流拍，释放物品锁定）
 * - active → ended → settlement_failed（结算异常，最多重试3次）
 * - pending/active → cancelled（卖方取消或管理员强制取消）
 *
 * 表名（snake_case）：auction_listings
 * 主键命名：auction_listing_id
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const AuctionListing = sequelize.define(
    'AuctionListing',
    {
      /** C2C拍卖挂牌ID（自增主键） */
      auction_listing_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: 'C2C拍卖挂牌ID（自增主键）'
      },

      /** 卖方用户ID（C2C核心字段，B2C无此字段） */
      seller_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '卖方用户ID',
        references: { model: 'users', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      /** 拍卖物品ID（items.item_id，用户背包中的物品实例） */
      item_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '拍卖物品ID（items.item_id）',
        references: { model: 'items', key: 'item_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      /** 竞价使用的资产类型（复用 BidService._getAllowedBidAssets 白名单校验） */
      price_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'star_stone',
        comment: '竞价使用的资产类型（禁止 points/budget_points）'
      },

      /** 起拍价（材料资产数量） */
      start_price: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '起拍价（材料资产数量）'
      },

      /** 当前最高出价（冗余字段，提升查询性能） */
      current_price: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '当前最高出价（冗余字段）',
        /** @returns {number} BIGINT 转换为 JS Number */
        get() {
          return Number(this.getDataValue('current_price') || 0)
        }
      },

      /** 最小加价幅度 */
      min_bid_increment: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 10,
        comment: '最小加价幅度'
      },

      /** 一口价（决策1：V1直接支持，NULL=不支持） */
      buyout_price: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '一口价（NULL=不支持一口价，有值时出价>=此价即时结算）',
        /** @returns {number|null} BIGINT 转换为 JS Number，NULL 保持 null */
        get() {
          const raw = this.getDataValue('buyout_price')
          return raw == null ? null : Number(raw)
        }
      },

      /** 拍卖开始时间 */
      start_time: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '拍卖开始时间'
      },

      /** 拍卖结束时间 */
      end_time: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '拍卖结束时间'
      },

      /** 中标用户ID（结算后填入） */
      winner_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: '中标用户ID',
        references: { model: 'users', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },

      /** 中标出价记录ID（结算后填入） */
      winner_bid_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '中标出价记录ID（auction_bids.auction_bid_id）'
      },

      /**
       * 拍卖状态（7态状态机，与 bid_products ENUM 顺序对齐）
       * @see docs/C2C竞拍方案.md §4.1
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
        comment: '拍卖状态：pending/active/ended/cancelled/settled/settlement_failed/no_bid'
      },

      /** 手续费率（决策3：统一5%，与 config/fee_rules.js 一致） */
      fee_rate: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0.05,
        comment: '手续费率（默认5%）',
        /** @returns {number} DECIMAL 转换为 JS Number */
        get() {
          return Number(this.getDataValue('fee_rate') || 0)
        }
      },

      /** 成交总额（=中标价，结算后填入） */
      gross_amount: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '成交总额（=中标价，结算后填入）',
        /** @returns {number|null} BIGINT 转换为 JS Number，未结算时 null */
        get() {
          const raw = this.getDataValue('gross_amount')
          return raw == null ? null : Number(raw)
        }
      },

      /** 手续费（结算后填入） */
      fee_amount: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '手续费（结算后填入）',
        /** @returns {number|null} BIGINT 转换为 JS Number，未结算时 null */
        get() {
          const raw = this.getDataValue('fee_amount')
          return raw == null ? null : Number(raw)
        }
      },

      /** 卖方实收（gross_amount - fee_amount，结算后填入） */
      net_amount: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '卖方实收（结算后填入）',
        /** @returns {number|null} BIGINT 转换为 JS Number，未结算时 null */
        get() {
          const raw = this.getDataValue('net_amount')
          return raw == null ? null : Number(raw)
        }
      },

      /** 总出价次数 */
      bid_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总出价次数'
      },

      /** 不同出价用户数（bid_products 无此字段，C2C 拍卖新增） */
      unique_bidders: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '不同出价用户数'
      },

      /** 物品快照JSON（创建时冻结物品当时状态，争议举证用） */
      item_snapshot: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        comment:
          '物品快照JSON（item_name/item_type/rarity_code/item_value/item_template_id/instance_attributes）'
      },

      /** 结算重试次数（决策7：最多3次自动重试，超限推送管理员告警） */
      retry_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '结算重试次数（决策7：最多3次，超限管理员告警）'
      }
    },
    {
      tableName: 'auction_listings',
      timestamps: true,
      underscored: true,
      comment: 'C2C拍卖挂牌表（用户间竞拍，7态状态机，含手续费/一口价/物品快照）',
      indexes: [
        { fields: ['status', 'end_time'], name: 'idx_auction_status_end' },
        { fields: ['seller_user_id', 'status'], name: 'idx_auction_seller' },
        { fields: ['item_id'], name: 'idx_auction_item' },
        { fields: ['price_asset_code', 'status'], name: 'idx_auction_asset' },
        { fields: ['status', 'start_time'], name: 'idx_auction_status_start' }
      ]
    }
  )

  /**
   * 关联定义
   * @param {Object} models - Sequelize 所有模型集合
   * @returns {void}
   */
  AuctionListing.associate = function (models) {
    // 卖方用户（多对一）
    AuctionListing.belongsTo(models.User, {
      foreignKey: 'seller_user_id',
      as: 'seller'
    })

    // 拍卖物品（多对一）
    AuctionListing.belongsTo(models.Item, {
      foreignKey: 'item_id',
      as: 'item'
    })

    // 中标用户（多对一）
    AuctionListing.belongsTo(models.User, {
      foreignKey: 'winner_user_id',
      as: 'winner'
    })

    // 拍卖有多个出价记录（一对多）
    AuctionListing.hasMany(models.AuctionBid, {
      foreignKey: 'auction_listing_id',
      as: 'auctionBids'
    })
  }

  /**
   * 检查拍卖是否可以接受出价
   * @returns {boolean} status=active 且未到结束时间
   */
  AuctionListing.prototype.isAcceptingBids = function () {
    return this.status === 'active' && new Date(this.end_time) > new Date()
  }

  /**
   * 检查拍卖是否已到期待结算
   * @returns {boolean} status=active 且已过结束时间
   */
  AuctionListing.prototype.isExpiredAndPendingSettlement = function () {
    return this.status === 'active' && new Date(this.end_time) <= new Date()
  }

  /** 结算重试上限（决策7） */
  AuctionListing.MAX_RETRY_COUNT = 3

  return AuctionListing
}
