/**
 * 资产流水模型 - AssetTransaction
 * 记录所有资产变动流水（DIAMOND和材料资产）
 *
 * 业务场景：
 * - 抽奖消耗与奖励（lottery_consume/lottery_reward）
 * - 交易市场购买（买家扣减、卖家入账、平台手续费）
 * - 兑换市场扣减（材料资产消耗）
 * - 材料转换（碎红水晶扣减、DIAMOND入账）
 * - 管理员调整（资产增加/扣减）
 *
 * 设计特点：
 * - delta_amount可正可负（正数表示增加，负数表示扣减）
 * - 记录变动后余额（balance_after）用于快速对账
 *
 * 幂等性机制（方案B - 业界标准 - 入口幂等 + 内部派生）：
 * - idempotency_key：每条事务记录的独立幂等键（唯一约束）
 * - lottery_session_id：抽奖会话ID（一次抽奖对应多条事务，如 consume + reward），非抽奖业务可为NULL
 *
 * 幂等键生成规则：
 * - 抽奖场景：从请求幂等键派生，如 {request_key}:consume、{request_key}:reward
 * - 独立场景：{business_type}_{account_id}_{timestamp}_{random}
 *
 * 命名规范（snake_case）：
 * - 表名：asset_transactions
 * - 主键：transaction_id
 * - 外键：account_id（关联 accounts 表）
 *
 * 创建时间：2025-12-15
 * 更新时间：2025-12-26（方案B - 业界标准幂等架构：删除 business_id，lottery_session_id 允许 NULL）
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 资产流水模型类
 * 职责：记录所有资产变动流水，支持幂等性控制和审计追溯
 * 设计模式：事件溯源模式
 */
class AssetTransaction extends Model {
  /**
   * 静态关联定义
   *
   * @param {Object} models - Sequelize所有模型的集合对象
   * @returns {void} 无返回值，仅定义关联关系
   */
  static associate(models) {
    // 多对一：流水归属于账户（Account 体系）
    AssetTransaction.belongsTo(models.Account, {
      foreignKey: 'account_id',
      as: 'account',
      onDelete: 'RESTRICT', // 账户删除时保护流水数据
      onUpdate: 'CASCADE',
      comment: '关联账户信息（流水所属账户，支持用户账户和系统账户）'
    })
  }

  /**
   * 模型验证规则
   *
   * @param {Object} data - 需要验证的流水数据
   * @param {number} data.delta_amount - 变动金额
   * @param {number} data.balance_after - 变动后余额
   * @returns {Object} 验证结果对象 {is_valid: boolean, errors: Array<string>}
   */
  static validateTransaction(data) {
    const errors = []

    /**
     * 🔴 P0-6 修复：删除 delta_amount === 0 的检查
     * 原因：settleFromFrozen 场景下，从 frozen_amount 扣减并不改变 available_amount
     * 因此 delta_amount 可能为 0（仅记录冻结结算动作，不改变可用余额）
     * 允许冻结结算场景的 delta_amount = 0
     */

    // 验证变动后余额不能为负数
    if (data.balance_after < 0) {
      errors.push('变动后余额不能为负数')
    }

    return {
      is_valid: errors.length === 0,
      errors
    }
  }

  /**
   * 业务类型常量定义
   * 用于标准化业务场景分类
   */
  static BUSINESS_TYPES = {
    // 抽奖相关（Lottery - 抽奖业务）
    LOTTERY_CONSUME: 'lottery_consume', // 抽奖消耗积分
    LOTTERY_REWARD: 'lottery_reward', // 抽奖奖励发放
    CONSUMPTION_REWARD: 'consumption_reward', // 消费奖励

    // 市场购买相关（Market Purchase - 交易市场DIAMOND结算）
    MARKET_PURCHASE_BUYER_DEBIT: 'market_purchase_buyer_debit', // 市场购买买家扣减
    MARKET_PURCHASE_SELLER_CREDIT: 'market_purchase_seller_credit', // 市场购买卖家入账
    MARKET_PURCHASE_PLATFORM_FEE_CREDIT: 'market_purchase_platform_fee_credit', // 市场购买平台手续费

    // 兑换市场相关（Exchange Market - 材料资产扣减）
    EXCHANGE_DEBIT: 'exchange_debit', // 兑换扣减

    // 材料转换相关（Material Conversion - 材料→DIAMOND）
    MATERIAL_CONVERT_DEBIT: 'material_convert_debit', // 材料转换扣减
    MATERIAL_CONVERT_CREDIT: 'material_convert_credit', // 材料转换入账（DIAMOND）

    // 管理员调整相关（Admin Adjustment）
    ADMIN_ADJUSTMENT: 'admin_adjustment' // 管理员调整资产
  }
}

/**
 * 模型初始化
 *
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {AssetTransaction} 初始化后的模型
 */
module.exports = sequelize => {
  AssetTransaction.init(
    {
      // 主键ID（Transaction ID - 流水唯一标识）
      transaction_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '流水ID（主键）'
      },

      // 账户ID（Account ID - 流水所属账户）
      account_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment:
          '账户ID（Account ID - 流水所属账户）：关联accounts.account_id，支持用户账户和系统账户（平台手续费、铸币、销毁、托管）'
      },

      // 资产代码（Asset Code - 资产类型标识）
      asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '资产代码（Asset Code - 资产类型标识）：DIAMOND-钻石资产, red_shard-碎红水晶, 等'
      },

      // 变动金额（Delta Amount - 资产变动数量）
      delta_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment:
          '变动金额（Delta Amount - 资产变动数量）：正数表示增加，负数表示扣减，单位为1个资产单位（如1 DIAMOND），不能为0'
      },

      // 变动前余额（Balance Before - 变动前的资产余额）
      balance_before: {
        type: DataTypes.BIGINT,
        allowNull: true, // 允许NULL（兼容历史数据）
        comment:
          '变动前余额（Balance Before - 本次变动前的资产余额）：与balance_after配合用于完整对账（before + delta = after），新业务必填'
      },

      // 变动后余额（Balance After - 变动后的资产余额）
      balance_after: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment:
          '变动后余额（Balance After - 本次变动后的资产余额）：用于快速查询和对账，记录当前账户余额状态，不能为负数'
      },

      // 业务类型（Business Type - 业务场景分类）
      business_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment:
          '业务类型（Business Type - 业务场景分类）：lottery_consume-抽奖消耗, lottery_reward-抽奖奖励, market_purchase_*-市场购买, exchange_debit-兑换扣减, material_convert_*-材料转换'
      },

      // 抽奖会话ID（Lottery Session ID - 一次抽奖对应多条事务）
      lottery_session_id: {
        type: DataTypes.STRING(100),
        allowNull: true, // 方案B：非抽奖业务可为 NULL
        comment:
          '抽奖会话ID（仅抽奖业务使用，非抽奖业务可为NULL）：用于把同一次抽奖的多条流水（consume + reward）关联起来'
      },

      // 幂等键（Idempotency Key - 每条事务记录唯一）
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment:
          '幂等键（每条流水唯一）：抽奖格式 {request_key}:consume/{request_key}:reward，其他格式 {type}_{account}_{ts}_{random}'
      },

      // 扩展信息（Meta - JSON格式存储业务扩展信息）
      meta: {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          '扩展信息（Meta - JSON格式存储业务扩展信息）：如order_no, item_id, conversion_rule, fee_amount等，用于业务追溯和审计'
      }
    },
    {
      sequelize,
      modelName: 'AssetTransaction',
      tableName: 'asset_transactions',
      timestamps: true,
      created_at: 'created_at',
      updatedAt: false, // 流水表不需要updated_at字段（不可修改）
      underscored: true,
      comment: '资产流水表（记录所有资产变动，支持幂等性控制和审计追溯）',
      indexes: [
        // 主幂等键唯一索引（方案B - 每条事务记录唯一）
        {
          fields: ['idempotency_key'],
          unique: true,
          name: 'uk_idempotency_key',
          comment: '唯一索引：幂等键（每条事务记录唯一，防止重复入账）'
        },
        // 抽奖会话关联索引（一次抽奖的多条流水）
        {
          fields: ['lottery_session_id'],
          name: 'idx_lottery_session_id',
          comment: '索引：抽奖会话ID（用于查询同一次抽奖的所有流水）'
        },
        {
          fields: ['account_id', 'asset_code', 'created_at'],
          name: 'idx_account_asset_time',
          comment: '索引：账户ID + 资产代码 + 创建时间（用于查询账户的资产流水历史）'
        },
        {
          fields: ['business_type', 'created_at'],
          name: 'idx_business_type_time',
          comment: '索引：业务类型 + 创建时间（用于按业务场景统计分析）'
        },
        {
          fields: ['asset_code', 'created_at'],
          name: 'idx_asset_code_time',
          comment: '索引：资产代码 + 创建时间（用于按资产类型统计分析）'
        }
      ]
    }
  )

  return AssetTransaction
}
