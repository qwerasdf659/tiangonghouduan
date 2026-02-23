/**
 * 物品模型（Item Model） — 三表模型缓存层
 *
 * 业务定位：
 * - 物品当前状态的缓存/快照，方便查询
 * - 可从 item_ledger（真相层）随时重建
 * 架构特点：
 *   1. 关键属性都是正式列（非 JSON meta）
 *   2. 锁定状态由 item_holds 独立表管理（非 JSON locks）
 *   3. 持有者使用 account_id（统一用户和系统账户）
 *   4. 唯一身份标识 tracking_code（人类可读）
 *
 * 表名：items
 * 主键：item_id
 *
 * @module models/Item
 * @version 1.0.0
 * @date 2026-02-22
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * Item 类定义（物品模型 — 缓存层）
 *
 * @class Item
 * @extends Model
 */
class Item extends Model {
  /**
   * 模型关联定义
   *
   * @param {Object} models - 所有模型的映射对象
   * @returns {void}
   */
  static associate(models) {
    // 物品属于某个账户（当前持有者，统一用户账户和系统账户）
    Item.belongsTo(models.Account, {
      foreignKey: 'owner_account_id',
      as: 'ownerAccount',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })

    // 物品对应的账本记录（一对多：一个物品有多条账本条目）
    Item.hasMany(models.ItemLedger, {
      foreignKey: 'item_id',
      as: 'ledgerEntries'
    })

    // 物品对应的锁定记录（一对多：一个物品可有多条锁定历史）
    Item.hasMany(models.ItemHold, {
      foreignKey: 'item_id',
      as: 'holds'
    })

    // 物品对应的交易市场挂牌
    Item.hasMany(models.MarketListing, {
      foreignKey: 'offer_item_id',
      as: 'marketListings'
    })

    // 物品对应的兑换订单
    Item.hasMany(models.RedemptionOrder, {
      foreignKey: 'item_id',
      as: 'redemptionOrders'
    })

    // 物品来源商家（NULL=平台自营）
    if (models.Merchant) {
      Item.belongsTo(models.Merchant, {
        foreignKey: 'merchant_id',
        as: 'merchant'
      })
    }
  }

  /**
   * 检查物品是否可用（状态为 available 且无活跃锁）
   *
   * @returns {boolean} 是否可用
   */
  isAvailable() {
    return this.status === 'available'
  }

  /**
   * 检查物品是否被锁定
   *
   * @returns {boolean} 是否被锁定
   */
  isHeld() {
    return this.status === 'held'
  }

  /**
   * 检查物品是否已终态（used/expired/destroyed 不可逆）
   *
   * @returns {boolean} 是否已终态
   */
  isTerminal() {
    return ['used', 'expired', 'destroyed'].includes(this.status)
  }
}

/**
 * 模型初始化
 *
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Model} 初始化后的模型
 */
module.exports = sequelize => {
  Item.init(
    {
      item_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '物品ID（自增主键）'
      },

      tracking_code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        comment: '人类可读追踪码（格式：LT260219028738）'
      },

      owner_account_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '当前持有者账户ID（从 item_ledger 派生，统一用户/系统账户）'
      },

      status: {
        type: DataTypes.ENUM('available', 'held', 'used', 'expired', 'destroyed'),
        allowNull: false,
        defaultValue: 'available',
        comment:
          '物品状态：available=可用 / held=锁定中 / used=已使用 / expired=已过期 / destroyed=已销毁'
      },

      item_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '物品类型：voucher=优惠券 / product=实物商品 / service=服务'
      },

      item_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '物品名称（正式列，非 JSON）'
      },

      item_description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '物品描述'
      },

      item_value: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '物品价值（积分计）'
      },

      prize_definition_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '来自哪个奖品定义（lottery_prizes.lottery_prize_id）'
      },

      rarity_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'common',
        comment: '稀有度代码（关联 rarity_defs.rarity_code）'
      },

      source: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment:
          '物品来源：lottery=抽奖 / bid_settlement=竞价结算 / exchange=兑换 / admin=管理员 / test=测试 / legacy=历史数据'
      },

      source_ref_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '来源关联ID（lottery_draw_id / bid_product_id 等，用于追溯物品起源）'
      },

      /** 来源商家ID（NULL=平台自营） */
      merchant_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'merchants',
          key: 'merchant_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: '来源商家ID（NULL=平台自营，关联 merchants 表）'
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
      },

      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间'
      }
    },
    {
      sequelize,
      modelName: 'Item',
      tableName: 'items',
      timestamps: true,
      underscored: true,
      comment: '物品表（当前状态缓存，可从 item_ledger 重建）',

      indexes: [
        {
          name: 'idx_items_owner',
          fields: ['owner_account_id']
        },
        {
          name: 'idx_items_status',
          fields: ['status']
        },
        {
          name: 'idx_items_source_ref',
          fields: ['source_ref_id']
        },
        {
          name: 'idx_items_type',
          fields: ['item_type']
        }
      ]
    }
  )

  return Item
}
