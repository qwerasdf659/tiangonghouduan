/**
 * Account 模型 - 账户主体（用户账户 + 系统账户）
 *
 * 业务场景：
 * - 统一账户体系：用户账户（account_type=user）关联真实用户
 * - 系统账户（account_type=system）：平台手续费、系统发放、系统销毁等
 * - 替换旧方案：不再使用 PLATFORM_USER_ID（真实用户）承接手续费
 *
 * 核心功能：
 * 1. 用户账户管理：每个用户对应一个账户（user_id唯一）
 * 2. 系统账户管理：预定义系统账户（system_code唯一）
 * 3. 账户状态控制：active（活跃）/ disabled（禁用）
 * 4. 余额关联：通过 account_asset_balances 表管理各资产余额
 * 5. 流水关联：通过 asset_transactions 表记录所有资产变动
 *
 * 系统账户定义：
 * - SYSTEM_PLATFORM_FEE：平台手续费账户（交易市场手续费入账）
 * - SYSTEM_MINT：系统发放账户（管理员发放资产来源）
 * - SYSTEM_BURN：系统销毁账户（资产销毁记录）
 * - SYSTEM_ESCROW：托管账户（争议/退款临时托管，预留）
 *
 * 数据库表名：accounts
 * 主键：account_id（BIGINT，自增）
 * 外键：user_id → users.user_id（CASCADE更新，RESTRICT删除）
 *
 * 创建时间：2025-12-15
 * 最后更新：2025-12-15
 */

'use strict'

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const Account = sequelize.define(
    'Account',
    {
      // ==================== 主键 ====================
      account_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '账户ID（主键，自增）'
      },

      // ==================== 账户类型 ====================
      account_type: {
        type: DataTypes.ENUM('user', 'system'),
        allowNull: false,
        comment:
          '账户类型（Account Type）：user-用户账户（关联真实用户，user_id必填）| system-系统账户（平台运营账户，system_code必填）'
      },

      // ==================== 用户账户关联 ====================
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment:
          '用户ID（User ID）：当 account_type=user 时必填且唯一；当 account_type=system 时为NULL；外键关联 users.user_id',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      // ==================== 系统账户标识 ====================
      system_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment:
          '系统账户代码（System Code）：当 account_type=system 时必填且唯一；预定义系统账户：SYSTEM_PLATFORM_FEE（平台手续费）、SYSTEM_MINT（系统发放）、SYSTEM_BURN（系统销毁）、SYSTEM_ESCROW（托管/争议）'
      },

      // ==================== 账户状态 ====================
      status: {
        type: DataTypes.ENUM('active', 'disabled'),
        allowNull: false,
        defaultValue: 'active',
        comment:
          '账户状态（Account Status）：active-活跃（可正常交易）| disabled-禁用（冻结状态，禁止任何交易）'
      }
    },
    {
      tableName: 'accounts',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        {
          name: 'uk_accounts_user_id',
          unique: true,
          fields: ['user_id'],
          where: {
            account_type: 'user',
            user_id: {
              [require('sequelize').Op.not]: null
            }
          }
        },
        {
          name: 'uk_accounts_system_code',
          unique: true,
          fields: ['system_code'],
          where: {
            account_type: 'system',
            system_code: {
              [require('sequelize').Op.not]: null
            }
          }
        },
        {
          name: 'idx_accounts_type_status',
          fields: ['account_type', 'status']
        }
      ],
      comment: '账户表（统一用户账户与系统账户）'
    }
  )

  /**
   * 定义关联关系
   *
   * @param {Object} models - 所有模型的集合
   * @returns {void}
   */
  Account.associate = function (models) {
    // 关联用户（用户账户 belongsTo User）
    Account.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      comment: '用户账户关联（当 account_type=user 时）'
    })

    // 关联资产余额（一个账户可以有多种资产余额）
    Account.hasMany(models.AccountAssetBalance, {
      foreignKey: 'account_id',
      as: 'asset_balances',
      comment: '账户的所有资产余额'
    })

    // 关联资产流水（一个账户的所有资产变动记录）
    Account.hasMany(models.AssetTransaction, {
      foreignKey: 'account_id',
      as: 'transactions',
      comment: '账户的所有资产流水记录'
    })
  }

  /**
   * 静态方法：根据 user_id 获取或创建用户账户
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 事务对象
   * @returns {Promise<Object>} 账户对象
   */
  Account.getOrCreateUserAccount = async function (user_id, options = {}) {
    const { transaction } = options

    const [account, created] = await Account.findOrCreate({
      where: {
        account_type: 'user',
        user_id
      },
      defaults: {
        account_type: 'user',
        user_id,
        status: 'active'
      },
      transaction
    })

    if (created) {
      console.log(`✅ 创建用户账户：user_id=${user_id}, account_id=${account.account_id}`)
    }

    return account
  }

  /**
   * 静态方法：根据 system_code 获取系统账户
   *
   * @param {string} system_code - 系统账户代码（如 SYSTEM_PLATFORM_FEE）
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 事务对象
   * @returns {Promise<Object>} 账户对象
   * @throws {Error} 系统账户不存在时抛出异常
   */
  Account.getSystemAccount = async function (system_code, options = {}) {
    const { transaction } = options

    const account = await Account.findOne({
      where: {
        account_type: 'system',
        system_code
      },
      transaction
    })

    if (!account) {
      throw new Error(`系统账户不存在：system_code=${system_code}`)
    }

    return account
  }

  /**
   * 实例方法：检查账户是否为活跃状态
   *
   * @returns {boolean} true-活跃可用，false-已禁用
   */
  Account.prototype.isActive = function () {
    return this.status === 'active'
  }

  /**
   * 实例方法：检查账户是否为用户账户
   *
   * @returns {boolean} true-用户账户，false-系统账户
   */
  Account.prototype.isUserAccount = function () {
    return this.account_type === 'user'
  }

  /**
   * 实例方法：检查账户是否为系统账户
   *
   * @returns {boolean} true-系统账户，false-用户账户
   */
  Account.prototype.isSystemAccount = function () {
    return this.account_type === 'system'
  }

  return Account
}
