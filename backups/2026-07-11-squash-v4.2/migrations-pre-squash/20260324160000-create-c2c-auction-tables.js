'use strict'

/**
 * C2C 用户间竞拍底表迁移
 *
 * 新建两张表：
 * - auction_listings: C2C 拍卖挂牌表（复用 bid_products 7态状态机 ENUM）
 * - auction_bids: C2C 拍卖出价记录表（FK → auction_listings）
 *
 * 同时向 system_settings 插入 auction_min_duration_hours 配置（决策2：可配置最低拍卖时长，默认2小时）
 *
 * @see docs/C2C竞拍方案.md §4
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ====== 1. auction_listings（C2C 拍卖挂牌表）======
    await queryInterface.createTable('auction_listings', {
      auction_listing_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: 'C2C拍卖挂牌ID（自增主键）'
      },

      // 卖方（B2C 无此字段，C2C 核心差异）
      seller_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '卖方用户ID（users.user_id）',
        references: { model: 'users', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      // 拍卖标的：用户背包中的物品实例
      item_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment: '拍卖物品ID（items.item_id）',
        references: { model: 'items', key: 'item_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      // 出价资产（复用 BidService._getAllowedBidAssets() 白名单校验）
      price_asset_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'DIAMOND',
        comment: '竞价使用的资产类型（禁止 POINTS/BUDGET_POINTS）'
      },

      // 价格参数
      start_price: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment: '起拍价（材料资产数量）'
      },
      current_price: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '当前最高出价（冗余字段，提升查询性能）'
      },
      min_bid_increment: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 10,
        comment: '最小加价幅度'
      },

      // 一口价（决策1：V1直接支持，NULL=不支持一口价）
      buyout_price: {
        type: Sequelize.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '一口价（NULL=不支持一口价，有值时出价>=此价即时结算）'
      },

      // 时间窗口
      start_time: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: '拍卖开始时间'
      },
      end_time: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: '拍卖结束时间'
      },

      // 中标信息
      winner_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: '中标用户ID（结算后填入）',
        references: { model: 'users', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      winner_bid_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '中标出价记录ID（auction_bids.auction_bid_id）'
      },

      // 状态机（与 bid_products 完全相同的 7 态 ENUM，顺序对齐）
      status: {
        type: Sequelize.ENUM('pending', 'active', 'ended', 'cancelled', 'settled', 'settlement_failed', 'no_bid'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '拍卖状态：pending/active/ended/cancelled/settled/settlement_failed/no_bid'
      },

      // 手续费（B2C 无此字段，C2C 核心差异）
      fee_rate: {
        type: Sequelize.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0.0500,
        comment: '手续费率（默认5%，与 config/fee_rules.js 统一）'
      },
      gross_amount: {
        type: Sequelize.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '成交总额（=中标价，结算后填入）'
      },
      fee_amount: {
        type: Sequelize.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '手续费（结算后填入）'
      },
      net_amount: {
        type: Sequelize.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '卖方实收（gross_amount - fee_amount，结算后填入）'
      },

      // 统计
      bid_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总出价次数'
      },
      unique_bidders: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '不同出价用户数'
      },

      // 物品快照（创建时冻结物品当时状态，争议举证用）
      item_snapshot: {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: null,
        comment: '物品快照JSON（item_name/item_type/rarity_code/item_value/item_template_id/instance_attributes）'
      },

      // 结算重试计数（决策7：最多3次自动重试，超限推送管理员告警）
      retry_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '结算重试次数（决策7：最多3次，超限管理员告警）'
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    }, {
      engine: 'InnoDB',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'C2C拍卖挂牌表（用户间竞拍，7态状态机，含手续费/一口价/物品快照）'
    })

    // auction_listings 索引
    await queryInterface.addIndex('auction_listings', ['status', 'end_time'], { name: 'idx_auction_status_end' })
    await queryInterface.addIndex('auction_listings', ['seller_user_id', 'status'], { name: 'idx_auction_seller' })
    await queryInterface.addIndex('auction_listings', ['item_id'], { name: 'idx_auction_item' })
    await queryInterface.addIndex('auction_listings', ['price_asset_code', 'status'], { name: 'idx_auction_asset' })
    await queryInterface.addIndex('auction_listings', ['status', 'start_time'], { name: 'idx_auction_status_start' })

    // ====== 2. auction_bids（C2C 拍卖出价记录表）======
    await queryInterface.createTable('auction_bids', {
      auction_bid_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: 'C2C拍卖出价记录ID（自增主键）'
      },

      auction_listing_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment: '关联拍卖挂牌ID（auction_listings.auction_listing_id）',
        references: { model: 'auction_listings', key: 'auction_listing_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '出价用户ID（users.user_id）',
        references: { model: 'users', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      bid_amount: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment: '出价金额（材料资产数量）'
      },

      previous_highest: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '出价时的前最高价（审计用）'
      },

      is_winning: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否当前最高价'
      },

      is_final_winner: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否最终中标（结算时标记）'
      },

      freeze_transaction_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '冻结流水ID（对账用，关联 asset_transactions.asset_transaction_id）'
      },

      idempotency_key: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
        comment: '幂等键（格式：auction_{user_id}_{auction_listing_id}_{timestamp}）'
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    }, {
      engine: 'InnoDB',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'C2C拍卖出价记录表（含冻结流水对账、幂等性控制）'
    })

    // auction_bids 索引
    await queryInterface.addIndex('auction_bids', ['auction_listing_id', 'bid_amount'], { name: 'idx_auction_bids_listing_amount' })
    await queryInterface.addIndex('auction_bids', ['user_id', 'auction_listing_id'], { name: 'idx_auction_bids_user' })

    // ====== 3. system_settings 新增拍卖最低时长配置（决策2：默认2小时）======
    const [existing] = await queryInterface.sequelize.query(
      "SELECT system_setting_id FROM system_settings WHERE setting_key = 'auction_min_duration_hours' LIMIT 1"
    )
    if (existing.length === 0) {
      await queryInterface.bulkInsert('system_settings', [{
        category: 'auction',
        setting_key: 'auction_min_duration_hours',
        setting_value: '2',
        value_type: 'number',
        description: 'C2C拍卖最低时长（小时），决策2：可配置，默认2小时',
        is_visible: 1,
        is_readonly: 0,
        created_at: new Date(),
        updated_at: new Date()
      }])
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('auction_bids')
    await queryInterface.dropTable('auction_listings')
    await queryInterface.sequelize.query(
      "DELETE FROM system_settings WHERE setting_key = 'auction_min_duration_hours'"
    )
  }
}
