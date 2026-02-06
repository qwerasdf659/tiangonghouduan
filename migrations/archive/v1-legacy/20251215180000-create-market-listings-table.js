/**
 * 数据库迁移：创建市场挂牌表（market_listings）
 *
 * 业务场景：
 * - 支持不可叠加物品交易（用户库存物品二手市场）
 * - 支持可叠加资产挂牌交易（如材料资产出售）
 * - 提供挂牌锁定机制，防止并发购买冲突
 * - 记录挂牌状态流转（on_sale → locked → sold/withdrawn）
 *
 * 核心功能：
 * 1. 挂牌类型区分：item_instance（不可叠加物品）、fungible_asset（可叠加资产）
 * 2. 标的资产管理：offer_item_instance_id（物品实例）或 offer_asset_code+offer_amount（可叠加资产）
 * 3. 定价管理：price_asset_code（固定DIAMOND）+ price_amount
 * 4. 锁定机制：locked_by_order_id + locked_at，防止并发购买
 * 5. 冻结标记：seller_offer_frozen（可叠加资产挂牌必须冻结卖家标的）
 * 6. 状态流转：on_sale（在售）→ locked（锁定）→ sold（已售）/withdrawn（已撤回）
 *
 * 数据完整性约束：
 * - listing_kind=item_instance 时，offer_item_instance_id 必填
 * - listing_kind=fungible_asset 时，offer_asset_code + offer_amount 必填
 * - price_asset_code 固定为 DIAMOND
 * - seller_offer_frozen 在 fungible_asset 挂牌时必须为 true
 *
 * 关联表：
 * - users：卖家用户（seller_user_id）
 * - user_inventory：物品实例（offer_item_instance_id，仅 item_instance 类型）
 * - trade_orders：订单锁定（locked_by_order_id）
 *
 * 创建时间：2025年12月15日
 * 迁移版本：v4.2.0
 * 使用模型：Claude Sonnet 4.5
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：创建 market_listings 表
   */
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('market_listings', {
      // 主键
      listing_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '挂牌ID（主键）'
      },

      // 挂牌类型
      listing_kind: {
        type: Sequelize.ENUM('item_instance', 'fungible_asset'),
        allowNull: false,
        comment:
          '挂牌类型（Listing Kind）：item_instance-不可叠加物品实例（如装备、卡牌）| fungible_asset-可叠加资产（如材料、钻石）；业务规则：决定标的资产字段的填充规则'
      },

      // 卖家信息
      seller_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '卖家用户ID（Seller User ID）：挂牌创建者，外键关联 users.user_id',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      // 标的资产（Offer）- 不可叠加物品
      offer_item_instance_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment:
          '标的物品实例ID（Offer Item Instance ID）：当 listing_kind=item_instance 时必填，外键关联 user_inventory.inventory_id；业务规则：挂牌时物品状态必须为 available，成交后物品所有权转移给买家',
        references: {
          model: 'user_inventory',
          key: 'inventory_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      // 标的资产（Offer）- 可叠加资产
      offer_asset_code: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment:
          '标的资产代码（Offer Asset Code）：当 listing_kind=fungible_asset 时必填，如 red_shard、DIAMOND；业务规则：挂牌时必须冻结卖家该资产的 offer_amount 数量'
      },

      offer_amount: {
        type: Sequelize.BIGINT,
        allowNull: true,
        comment:
          '标的资产数量（Offer Amount）：当 listing_kind=fungible_asset 时必填，单位为 offer_asset_code 的最小单位；业务规则：必须 >0，挂牌时冻结该数量'
      },

      // 成交对价（Price）
      price_asset_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'DIAMOND',
        comment:
          '结算资产代码（Price Asset Code）：交易市场结算币种，固定为 DIAMOND；业务规则：前端和后端都强制校验只允许 DIAMOND'
      },

      price_amount: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment:
          '挂牌价格（Price Amount）：卖家设定的总价，单位为 price_asset_code（DIAMOND）；业务规则：必须 >0，成交时买家支付该金额（含手续费）'
      },

      // 冻结与锁定
      seller_offer_frozen: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment:
          '卖家标的是否已冻结（Seller Offer Frozen）：标记卖家标的资产是否已冻结；业务规则：listing_kind=fungible_asset 时必须为 true（挂牌时冻结卖家资产），listing_kind=item_instance 时为 false（物品实例不需要冻结）'
      },

      locked_by_order_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        comment:
          '锁定订单ID（Locked By Order ID）：记录当前锁定该挂牌的订单ID，外键关联 trade_orders.order_id；业务规则：status=locked 时必填，用于防止并发购买和超时解锁'
      },

      locked_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment:
          '锁定时间（Locked At）：记录挂牌被锁定的北京时间；业务规则：status=locked 时必填，用于超时解锁检查（默认超时时间：15分钟）'
      },

      // 状态管理
      status: {
        type: Sequelize.ENUM('on_sale', 'locked', 'sold', 'withdrawn'),
        allowNull: false,
        defaultValue: 'on_sale',
        comment:
          '挂牌状态（Status）：on_sale-在售中（可被购买或撤回）| locked-已锁定（订单处理中，不可购买或撤回）| sold-已售出（终态，成交完成）| withdrawn-已撤回（终态，卖家主动下架）；业务规则：on_sale → locked → sold/withdrawn，locked 超时自动回滚为 on_sale'
      },

      // 时间戳
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间（Created At）：挂牌创建的北京时间'
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        comment: '更新时间（Updated At）：挂牌最后更新的北京时间'
      }
    })

    // 创建索引
    await queryInterface.addIndex('market_listings', ['seller_user_id'], {
      name: 'idx_market_listings_seller_user_id',
      comment: '卖家用户索引（用于查询用户的挂牌列表）'
    })

    await queryInterface.addIndex('market_listings', ['status'], {
      name: 'idx_market_listings_status',
      comment: '状态索引（用于筛选在售/已售/已撤回的挂牌）'
    })

    await queryInterface.addIndex('market_listings', ['listing_kind'], {
      name: 'idx_market_listings_listing_kind',
      comment: '挂牌类型索引（用于区分物品实例和可叠加资产挂牌）'
    })

    await queryInterface.addIndex('market_listings', ['offer_item_instance_id'], {
      name: 'idx_market_listings_offer_item_instance_id',
      comment: '标的物品实例索引（用于关联查询物品详情）'
    })

    await queryInterface.addIndex('market_listings', ['offer_asset_code'], {
      name: 'idx_market_listings_offer_asset_code',
      comment: '标的资产代码索引（用于筛选特定资产的挂牌）'
    })

    await queryInterface.addIndex('market_listings', ['locked_by_order_id'], {
      name: 'idx_market_listings_locked_by_order_id',
      comment: '锁定订单索引（用于订单关联查询）'
    })

    await queryInterface.addIndex('market_listings', ['locked_at'], {
      name: 'idx_market_listings_locked_at',
      comment: '锁定时间索引（用于超时解锁任务扫描）'
    })

    await queryInterface.addIndex('market_listings', ['created_at'], {
      name: 'idx_market_listings_created_at',
      comment: '创建时间索引（用于时间排序和查询）'
    })

    console.log('✅ market_listings 表创建成功')
  },

  /**
   * 回滚迁移：删除 market_listings 表
   */
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('market_listings')
    console.log('✅ market_listings 表已删除')
  }
}
