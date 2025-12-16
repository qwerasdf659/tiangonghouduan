/**
 * 资产流水模型 - AssetTransaction
 * 记录所有资产变动流水（DIAMOND和材料资产）
 *
 * 业务场景：
 * - 交易市场购买（买家扣减、卖家入账、平台手续费）
 * - 兑换市场扣减（材料资产消耗）
 * - 材料转换（碎红水晶扣减、DIAMOND入账）
 * - 管理员调整（资产增加/扣减）
 *
 * 设计特点：
 * - 支持幂等性控制（business_id + business_type唯一约束）
 * - delta_amount可正可负（正数表示增加，负数表示扣减）
 * - 记录变动后余额（balance_after）用于快速对账
 *
 * 幂等性机制：
 * - business_id + business_type组合唯一索引
 * - 防止网络重试导致重复扣款/入账
 * - 类似积分系统的幂等性保护机制
 *
 * 命名规范（snake_case）：
 * - 表名：asset_transactions
 * - 主键：transaction_id
 * - 外键：user_id
 *
 * 创建时间：2025-12-15
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
    // 多对一：流水归属于用户（历史兼容字段）
    AssetTransaction.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'RESTRICT', // 用户删除时保护流水数据
      onUpdate: 'CASCADE',
      comment: '关联用户信息（流水所属用户，历史兼容字段）'
    })

    // 多对一：流水归属于账户（新账户体系）
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

      // 用户ID（User ID - 流水所属用户，历史兼容字段）
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // 系统账户时为NULL
        comment:
          '用户ID（User ID - 流水所属用户，历史兼容字段）：关联users.user_id，标识这笔流水属于哪个用户，系统账户时为NULL，新业务应使用account_id'
      },

      // 账户ID（Account ID - 流水所属账户，新账户体系）
      account_id: {
        type: DataTypes.BIGINT,
        allowNull: true, // 允许NULL（兼容历史数据）
        comment:
          '账户ID（Account ID - 流水所属账户）：关联accounts.account_id，支持用户账户和系统账户（平台手续费、铸币、销毁、托管），新业务必填'
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

      // 业务唯一标识（Business ID - 幂等性控制）
      business_id: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment:
          '业务唯一标识（Business ID - 业务层传入的幂等键）：如market_purchase_buyer_xxx, exchange_xxx, material_convert_xxx，与business_type组合确保幂等性，防止重复扣款/入账'
      },

      // 业务类型（Business Type - 业务场景分类）
      business_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment:
          '业务类型（Business Type - 业务场景分类）：market_purchase_buyer_debit-市场购买买家扣减, market_purchase_seller_credit-市场购买卖家入账, market_purchase_platform_fee_credit-市场购买平台手续费, exchange_debit-兑换扣减, material_convert_debit-材料转换扣减, material_convert_credit-材料转换入账'
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
        {
          fields: ['business_id', 'business_type'],
          unique: true,
          name: 'uk_business_idempotency',
          comment: '唯一索引：业务ID + 业务类型（幂等性保证，防止重复扣款/入账）'
        },
        {
          fields: ['user_id', 'asset_code', 'created_at'],
          name: 'idx_user_asset_time',
          comment: '索引：用户ID + 资产代码 + 创建时间（用于查询用户的资产流水历史，历史兼容）'
        },
        {
          fields: ['account_id', 'asset_code', 'created_at'],
          name: 'idx_account_asset_time',
          comment: '索引：账户ID + 资产代码 + 创建时间（用于查询账户的资产流水历史，新账户体系）'
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
