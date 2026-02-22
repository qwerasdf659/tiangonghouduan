/**
 * 物品双录记账本模型（ItemLedger Model） — 三表模型真相层
 *
 * 业务定位：
 * - 物品所有权的唯一真相，双录记账，同时也是审计日志
 * - 只追加，不修改，不删除
 * - 每次操作写两条记录（出方 delta=-1 + 入方 delta=+1）
 * - SUM(delta) GROUP BY item_id 全部为 0 = 物品守恒
 *
 * 三重角色：
 * 1. 双录记账本 — SUM(delta) 可数学验证守恒
 * 2. 审计日志 — 谁在什么时间做了什么
 * 3. 事件溯源 — 完整的物品流转历史
 *
 * 表名：item_ledger
 * 主键：ledger_entry_id
 *
 * @module models/ItemLedger
 * @version 1.0.0
 * @date 2026-02-22
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * ItemLedger 类定义（物品双录记账本）
 *
 * @class ItemLedger
 * @extends Model
 */
class ItemLedger extends Model {
  /**
   * 模型关联定义
   *
   * @param {Object} models - 所有模型的映射对象
   */
  static associate(models) {
    // 账本条目关联物品
    ItemLedger.belongsTo(models.Item, {
      foreignKey: 'item_id',
      as: 'item',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })

    // 账本条目关联当前方账户
    ItemLedger.belongsTo(models.Account, {
      foreignKey: 'account_id',
      as: 'account',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })

    // 账本条目关联对手方账户
    ItemLedger.belongsTo(models.Account, {
      foreignKey: 'counterpart_id',
      as: 'counterpartAccount',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })
  }

  /**
   * 事件类型常量
   * 每种事件类型的双录含义见架构文档第七章 7.3 节
   */
  static EVENT_TYPES = {
    MINT: 'mint', // 铸造：SYSTEM_MINT → 用户
    TRANSFER: 'transfer', // 转移：卖方 → 买方
    USE: 'use', // 使用/核销：用户 → SYSTEM_BURN
    EXPIRE: 'expire', // 过期：用户 → SYSTEM_BURN
    DESTROY: 'destroy' // 销毁：用户 → SYSTEM_BURN
  }

  /**
   * 业务类型常量
   * 标识触发该账本条目的业务场景
   */
  static BUSINESS_TYPES = {
    LOTTERY_MINT: 'lottery_mint', // 抽奖铸造
    BID_SETTLEMENT_MINT: 'bid_settlement_mint', // 竞价结算铸造
    ADMIN_MINT: 'admin_mint', // 管理员赠送
    MARKET_TRANSFER: 'market_transfer', // 交易市场转移
    GIFT_TRANSFER: 'gift_transfer', // 赠送转移
    REDEMPTION_USE: 'redemption_use', // 兑换码核销
    BACKPACK_USE: 'backpack_use', // 背包内直接使用
    ADMIN_USE: 'admin_use', // 管理员代核销
    AUTO_EXPIRE: 'auto_expire', // 自动过期
    ADMIN_DESTROY: 'admin_destroy', // 管理员销毁
    DATA_MIGRATION: 'data_migration' // 历史数据迁移
  }
}

/**
 * 模型初始化
 *
 * @param {import('sequelize').Sequelize} sequelize - Sequelize 实例
 * @returns {ItemLedger} 初始化后的模型
 */
module.exports = sequelize => {
  ItemLedger.init(
    {
      ledger_entry_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '账本条目ID（自增主键）'
      },

      item_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '物品ID（关联 items.item_id）'
      },

      account_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '当前方账户ID（出入账方，关联 accounts.account_id）'
      },

      delta: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '变动方向：+1 入账（获得物品） / -1 出账（失去物品）'
      },

      counterpart_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '对手方账户ID（双录记账的另一方，关联 accounts.account_id）'
      },

      event_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '事件类型：mint=铸造 / transfer=转移 / use=使用 / expire=过期 / destroy=销毁'
      },

      operator_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '操作者ID（user_id 或 admin_id，系统操作为 NULL）'
      },

      operator_type: {
        type: DataTypes.ENUM('user', 'admin', 'system'),
        allowNull: false,
        defaultValue: 'system',
        comment: '操作者类型：user=普通用户 / admin=管理员 / system=系统自动'
      },

      business_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '业务类型：lottery_mint / market_transfer / redemption_use 等'
      },

      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '幂等键（同一物品同一操作不重复写入）'
      },

      meta: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '扩展元数据（仅存真正动态的扩展信息，如来源详情）',
        get() {
          const value = this.getDataValue('meta')
          return value || {}
        }
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间（不可变，无 updated_at）'
      }
    },
    {
      sequelize,
      modelName: 'ItemLedger',
      tableName: 'item_ledger',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false, // 账本只追加不修改，无 updated_at
      underscored: true,
      comment: '物品双录记账本（唯一真相，只追加不修改不删除）',

      indexes: [
        {
          name: 'uk_item_idempotency',
          fields: ['item_id', 'idempotency_key'],
          unique: true
        },
        {
          name: 'idx_ledger_item_time',
          fields: ['item_id', 'created_at']
        },
        {
          name: 'idx_ledger_account_time',
          fields: ['account_id', 'created_at']
        },
        {
          name: 'idx_ledger_event_type',
          fields: ['event_type', 'created_at']
        },
        {
          name: 'idx_ledger_business',
          fields: ['business_type', 'created_at']
        }
      ]
    }
  )

  return ItemLedger
}
