/**
 * 餐厅积分抽奖系统 V4.2统一账本架构 - 市场挂牌模型（MarketListing）
 *
 * 业务场景：管理交易市场的挂牌信息，支持不可叠加物品和可叠加资产的挂牌交易
 *
 * 核心功能：
 * 1. 挂牌类型区分（item 不可叠加物品、fungible_asset 可叠加资产）
 * 2. 标的资产管理（物品实例或可叠加资产数量）
 * 3. 定价管理（固定使用 DIAMOND 结算）
 * 4. 锁定机制（防止并发购买，支持超时解锁）
 * 5. 冻结标记（可叠加资产挂牌必须冻结卖家标的）
 * 6. 状态流转（on_sale → locked → sold/withdrawn）
 *
 * 业务流程：
 * 1. 创建挂牌
 *    - 不可叠加物品：关联 items 表，通过 ItemService.holdItem() 锁定物品
 *    - 可叠加资产：冻结卖家资产（seller_offer_frozen=true），写入 offer_asset_code + offer_amount
 * 2. 购买挂牌
 *    - 锁定挂牌：status=on_sale → locked，记录 locked_by_order_id + locked_at
 *    - 冻结买家 DIAMOND：通过 BalanceService 冻结 gross_amount
 *    - 成交结算：多分录（买家扣减、卖家入账、平台手续费）
 *    - 转移所有权：物品实例转移或资产交付
 *    - 完成订单：status=locked → sold
 * 3. 撤回挂牌
 *    - 只允许 status=on_sale
 *    - 解冻卖家资产（如果是 fungible_asset）
 *    - 更新状态：status=on_sale → withdrawn
 * 4. 超时解锁
 *    - 定时任务扫描 status=locked 且 locked_at 超时（默认 15 分钟）
 *    - 解冻买家 DIAMOND
 *    - 回滚挂牌：status=locked → on_sale
 *
 * 状态流转规则：
 * - on_sale（在售中）→ locked（已锁定）：购买时锁定
 * - locked（已锁定）→ sold（已售出）：成交完成
 * - locked（已锁定）→ on_sale（在售中）：超时解锁
 * - on_sale（在售中）→ withdrawn（已撤回）：卖家撤回
 * - on_sale/locked（在售中/已锁定）→ admin_withdrawn（管理员强制撤回）：客服强制撤回
 * - sold/withdrawn/admin_withdrawn 为终态，不可逆转
 *
 * 数据库表名：market_listings
 * 主键：market_listing_id（BIGINT，自增）
 * 外键：
 * - seller_user_id（users.user_id，卖家用户）
 * - offer_item_id（items.item_id，标的物品）
 * - locked_by_order_id（trade_orders.trade_order_id，锁定订单）
 *
 * 集成服务：
 * - BalanceService：冻结/解冻卖家标的资产（可叠加资产挂牌）
 * - TradeOrderService：订单创建和状态管理
 * - ItemService：物品状态管理（三表模型双录）
 *
 * 创建时间：2025年12月15日
 * 最后更新：2025年12月15日
 * 使用模型：Claude Sonnet 4.5
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const MarketListing = sequelize.define(
    'MarketListing',
    {
      // 主键
      market_listing_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '挂牌ID（主键）'
      },

      // 挂牌类型
      listing_kind: {
        type: DataTypes.ENUM('item', 'fungible_asset'),
        allowNull: false,
        comment:
          '挂牌类型（Listing Kind）：item-不可叠加物品（如装备、卡牌）| fungible_asset-可叠加资产（如材料、钻石）；业务规则：决定标的资产字段的填充规则'
      },

      // 卖家信息
      seller_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '卖家用户ID（Seller User ID）：挂牌创建者，外键关联 users.user_id',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      // 幂等键（业界标准形态 - 2026-01-02）
      idempotency_key: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment:
          '幂等键（业界标准命名）：所有写操作必须由客户端提供；用于防止重复挂牌与对账定位（同一 idempotency_key 重复请求返回同结果，参数不一致返回409）- 必填字段'
      },

      // 标的物品ID（三表模型 items 表）
      offer_item_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment:
          '标的物品ID（Offer Item ID）：当 listing_kind=item 时必填，外键关联 items.item_id；业务规则：挂牌时物品状态必须为 available，成交后物品所有权转移给买家',
        references: {
          model: 'items',
          key: 'item_id'
        }
      },

      /*
       * === 快照字段（物品实例相关）- 2026-01-15 新增 ===
       * 物品模板ID（快照）
       */
      offer_item_template_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment:
          '挂牌物品模板ID（快照 → item_templates.item_template_id）：仅 listing_kind=item 时有值，挂牌时从物品实例关联的模板复制'
      },

      // 物品类目代码（快照）
      offer_item_category_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment:
          '挂牌物品类目代码（快照 → category_defs.category_code）：用于前端筛选，挂牌时从物品模板复制'
      },

      // 物品稀有度（快照）
      offer_item_rarity: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment:
          '挂牌物品稀有度（快照 → rarity_defs.rarity_code）：用于前端筛选，挂牌时从物品模板复制'
      },

      // 物品显示名称（快照）
      offer_item_display_name: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '挂牌物品显示名称（快照）：便于搜索和展示，挂牌时从物品模板复制'
      },

      /*
       * === 快照字段（可叠加资产相关）- 2026-01-15 新增 ===
       * 资产分组代码（快照）
       */
      offer_asset_group_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment:
          '挂牌资产分组代码（快照 → asset_group_defs.group_code）：仅 listing_kind=fungible_asset 时有值，用于前端筛选'
      },

      // 资产显示名称（快照）
      offer_asset_display_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '挂牌资产显示名称（快照）：便于搜索和展示，挂牌时从 material_asset_types 复制'
      },

      // 标的资产（Offer）- 可叠加资产
      offer_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment:
          '标的资产代码（Offer Asset Code）：当 listing_kind=fungible_asset 时必填，如 red_shard、DIAMOND；业务规则：挂牌时必须冻结卖家该资产的 offer_amount 数量'
      },

      offer_amount: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment:
          '标的资产数量（Offer Amount）：当 listing_kind=fungible_asset 时必填，单位为 offer_asset_code 的最小单位；业务规则：必须 >0，挂牌时冻结该数量'
      },

      // 成交对价（Price）
      price_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'DIAMOND',
        comment:
          '结算资产代码（Price Asset Code）：交易市场结算币种，固定为 DIAMOND；业务规则：前端和后端都强制校验只允许 DIAMOND'
      },

      price_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment:
          '挂牌价格（Price Amount）：卖家设定的总价，单位为 price_asset_code（DIAMOND）；业务规则：必须 >0，成交时买家支付该金额（含手续费）'
      },

      // 冻结与锁定
      seller_offer_frozen: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment:
          '卖家标的是否已冻结（Seller Offer Frozen）：标记卖家标的资产是否已冻结；业务规则：listing_kind=fungible_asset 时必须为 true（挂牌时冻结卖家资产），listing_kind=item 时为 false（物品不需要冻结）'
      },

      locked_by_order_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment:
          '锁定订单ID（Locked By Order ID）：记录当前锁定该挂牌的订单ID，外键关联 trade_orders.trade_order_id；业务规则：status=locked 时必填，用于防止并发购买和超时解锁'
      },

      locked_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment:
          '锁定时间（Locked At）：记录挂牌被锁定的北京时间；业务规则：status=locked 时必填，用于超时解锁检查（默认超时时间：15分钟）'
      },

      // 状态管理
      status: {
        type: DataTypes.ENUM('on_sale', 'locked', 'sold', 'withdrawn', 'admin_withdrawn'),
        allowNull: false,
        defaultValue: 'on_sale',
        comment:
          '挂牌状态（Status）：on_sale-在售中 | locked-已锁定 | sold-已售出 | withdrawn-已撤回 | admin_withdrawn-管理员强制撤回；业务规则：on_sale → locked → sold/withdrawn/admin_withdrawn，locked 超时自动回滚为 on_sale'
      }
    },
    {
      tableName: 'market_listings',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['idempotency_key'],
          name: 'uk_market_listings_idempotency_key',
          comment: '幂等键全局唯一索引（业界标准形态）'
        },
        {
          unique: true,
          fields: ['seller_user_id', 'idempotency_key'],
          name: 'uk_market_listings_seller_idempotency',
          comment: '卖家+幂等键唯一索引（幂等保证）'
        },
        {
          fields: ['seller_user_id']
        },
        {
          fields: ['status']
        },
        {
          fields: ['listing_kind']
        },
        {
          fields: ['offer_item_id']
        },
        {
          fields: ['offer_asset_code']
        },
        {
          fields: ['locked_by_order_id']
        },
        {
          fields: ['locked_at']
        },
        {
          fields: ['created_at']
        }
      ],
      comment: '市场挂牌表'
    }
  )

  // 定义关联关系
  MarketListing.associate = function (models) {
    // 卖家用户
    MarketListing.belongsTo(models.User, {
      foreignKey: 'seller_user_id',
      as: 'seller',
      comment: '卖家用户关联（Seller Association）- 关联挂牌创建者'
    })

    /** 标的物品（三表模型 items 表） */
    MarketListing.belongsTo(models.Item, {
      foreignKey: 'offer_item_id',
      as: 'offerItem',
      comment: '标的物品关联 — 关联 items 表（三表模型缓存层）'
    })

    // === 2026-01-15 新增：快照字段关联 ===

    // 物品模板关联（快照来源）
    if (models.ItemTemplate) {
      MarketListing.belongsTo(models.ItemTemplate, {
        foreignKey: 'offer_item_template_id',
        as: 'offerItemTemplate',
        comment: '物品模板关联（快照来源）- 关联挂牌物品的模板定义'
      })
    }

    // 物品类目关联（筛选维度）
    if (models.CategoryDef) {
      MarketListing.belongsTo(models.CategoryDef, {
        foreignKey: 'offer_item_category_code',
        targetKey: 'category_code',
        as: 'offerCategory',
        comment: '物品类目关联（筛选维度）- 关联挂牌物品的类目'
      })
    }

    // 物品稀有度关联（筛选维度）
    if (models.RarityDef) {
      MarketListing.belongsTo(models.RarityDef, {
        foreignKey: 'offer_item_rarity',
        targetKey: 'rarity_code',
        as: 'offerRarity',
        comment: '物品稀有度关联（筛选维度）- 关联挂牌物品的稀有度'
      })
    }

    // 资产分组关联（筛选维度）
    if (models.AssetGroupDef) {
      MarketListing.belongsTo(models.AssetGroupDef, {
        foreignKey: 'offer_asset_group_code',
        targetKey: 'group_code',
        as: 'offerAssetGroup',
        comment: '资产分组关联（筛选维度）- 关联挂牌资产的分组'
      })
    }

    /**
     * V4.7.0 修复：添加可叠加资产类型关联（fungible_asset 类型挂牌使用）
     * QueryService.getMarketListings 需要此关联来展示资产详情
     */
    if (models.MaterialAssetType) {
      MarketListing.belongsTo(models.MaterialAssetType, {
        foreignKey: 'offer_asset_code',
        targetKey: 'asset_code',
        as: 'offerMaterialAsset',
        comment: '可叠加资产类型关联（Offer Material Asset Association）- 关联挂牌的资产类型定义'
      })
    }

    // 锁定订单
    MarketListing.belongsTo(models.TradeOrder, {
      foreignKey: 'locked_by_order_id',
      as: 'lockingOrder',
      comment: '锁定订单关联（Locking Order Association）- 关联当前锁定该挂牌的订单'
    })

    // 关联的订单列表
    MarketListing.hasMany(models.TradeOrder, {
      foreignKey: 'market_listing_id',
      as: 'orders',
      comment: '订单列表关联（Orders Association）- 关联该挂牌的所有订单'
    })
  }

  /**
   * 检查挂牌是否已超时锁定
   *
   * 业务场景：判断挂牌锁定是否已超时，用于超时解锁任务
   *
   * 业务规则：
   * - 如果 status 不是 locked，返回 false
   * - 如果 locked_at 为 null，返回 false
   * - 如果当前北京时间超过 locked_at + 超时时间（默认 15 分钟），返回 true
   *
   * @param {number} timeoutMinutes - 超时时间（分钟），默认 15 分钟
   * @returns {boolean} true-已超时，false-未超时或未锁定
   *
   * @example
   * const listing = await MarketListing.findByPk(1);
   * if (listing.isLockTimeout()) {
   *   console.log('挂牌锁定已超时，需要解锁');
   * }
   */
  MarketListing.prototype.isLockTimeout = function (timeoutMinutes = 15) {
    if (this.status !== 'locked' || !this.locked_at) {
      return false
    }

    const now = BeijingTimeHelper.createDatabaseTime()
    const lockedTime = new Date(this.locked_at)
    const timeoutMs = timeoutMinutes * 60 * 1000
    const elapsedMs = now - lockedTime

    return elapsedMs > timeoutMs
  }

  /**
   * 检查挂牌是否可以购买
   *
   * 业务场景：验证挂牌当前是否可以被购买
   *
   * 业务规则：
   * - status 必须为 on_sale
   * - 如果是 fungible_asset 类型，seller_offer_frozen 必须为 true
   *
   * @returns {boolean} true-可以购买，false-不可购买
   *
   * @example
   * const listing = await MarketListing.findByPk(1);
   * if (listing.canPurchase()) {
   *   // 允许购买
   * } else {
   *   throw new Error('该挂牌不可购买');
   * }
   */
  MarketListing.prototype.canPurchase = function () {
    if (this.status !== 'on_sale') {
      return false
    }

    // 如果是可叠加资产挂牌，必须已冻结卖家标的
    if (this.listing_kind === 'fungible_asset' && !this.seller_offer_frozen) {
      return false
    }

    return true
  }

  /**
   * 检查挂牌是否可以撤回
   *
   * 业务场景：验证挂牌当前是否可以被卖家撤回
   *
   * 业务规则：
   * - status 必须为 on_sale（locked/sold/withdrawn 不可撤回）
   *
   * @returns {boolean} true-可以撤回，false-不可撤回
   *
   * @example
   * const listing = await MarketListing.findByPk(1);
   * if (listing.canWithdraw()) {
   *   // 允许撤回
   * } else {
   *   throw new Error('该挂牌不可撤回');
   * }
   */
  MarketListing.prototype.canWithdraw = function () {
    return this.status === 'on_sale'
  }

  return MarketListing
}
