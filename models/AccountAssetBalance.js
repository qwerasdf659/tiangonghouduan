/**
 * AccountAssetBalance 模型 - 账户资产余额（可用 + 冻结）
 *
 * 业务场景：
 * - 账本余额真相：每个账户的每种资产有独立的余额记录
 * - 支持冻结模型：available_amount（可用）+ frozen_amount（冻结）
 * - 交易市场冻结链路：下单冻结 → 成交结算 → 取消解冻
 * - 挂牌冻结链路：挂牌冻结标的资产 → 成交扣减 → 撤单解冻
 *
 * 核心功能：
 * 1. 余额查询：按 (account_id, asset_code) 查询
 * 2. 可用余额变更：available_amount 增加/扣减
 * 3. 冻结操作：available_amount → frozen_amount
 * 4. 解冻操作：frozen_amount → available_amount
 * 5. 从冻结扣减：frozen_amount 直接扣减（成交结算）
 *
 * 业务规则：
 * - 总余额 = available_amount + frozen_amount
 * - available_amount 和 frozen_amount 都不可为负数
 * - 所有变更必须通过 BalanceService 统一操作（V4.7.0 从 AssetService 拆分）
 * - 每个 (account_id, asset_code) 只有一条记录（唯一约束）
 *
 * 数据库表名：account_asset_balances
 * 主键：balance_id（BIGINT，自增）
 * 外键：account_id → accounts.account_id（CASCADE更新，RESTRICT删除）
 *
 * 创建时间：2025-12-15
 * 最后更新：2025-12-15
 */

'use strict'

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const AccountAssetBalance = sequelize.define(
    'AccountAssetBalance',
    {
      // ==================== 主键 ====================
      account_asset_balance_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '余额记录ID（主键，自增）'
      },

      // ==================== 账户关联 ====================
      account_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '账户ID（Account ID）：关联 accounts.account_id，外键约束CASCADE更新/RESTRICT删除',
        references: {
          model: 'accounts',
          key: 'account_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      // ==================== 资产代码 ====================
      asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment:
          '资产代码（Asset Code）：如 DIAMOND、POINTS、BUDGET_POINTS、red_shard 等；唯一约束：(account_id, asset_code, lottery_campaign_id)'
      },

      // ==================== 抽奖活动ID（BUDGET_POINTS专用） ====================
      lottery_campaign_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: null,
        comment:
          '抽奖活动ID（Lottery Campaign ID）：仅 BUDGET_POINTS 需要，其他资产为 NULL；业务规则：BUDGET_POINTS 必须关联抽奖活动，实现多活动预算隔离'
      },

      // ==================== 抽奖活动键（生成列，用于唯一约束） ====================
      lottery_campaign_key: {
        type: DataTypes.VIRTUAL(DataTypes.STRING(50)),
        /**
         * 注意：此字段在数据库中是 GENERATED COLUMN，Sequelize 中定义为 VIRTUAL 仅供读取
         * 实际值由数据库生成：COALESCE(lottery_campaign_id, 'GLOBAL')
         */
        comment: '抽奖活动键（自动生成）：COALESCE(lottery_campaign_id, GLOBAL)，用于唯一约束'
      },

      // ==================== 可用余额 ====================
      available_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment:
          '可用余额（Available Amount）：可直接支付、转让、挂牌的余额；业务规则：不可为负数，所有扣减操作必须验证余额充足；单位：整数（BIGINT避免浮点精度问题）'
      },

      // ==================== 冻结余额 ====================
      frozen_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment:
          '冻结余额（Frozen Amount）：下单冻结、挂牌冻结的余额；业务规则：交易市场购买时冻结买家DIAMOND，挂牌时冻结卖家标的资产；成交后从冻结转为扣减或入账；取消/超时时解冻回到 available_amount；不可为负数'
      }
    },
    {
      tableName: 'account_asset_balances',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        {
          // 唯一约束使用生成列 lottery_campaign_key（确保 NULL 值也能唯一）
          name: 'uk_account_asset_lottery_campaign_key',
          unique: true,
          fields: ['account_id', 'asset_code', 'lottery_campaign_key']
        },
        {
          name: 'idx_account_asset_balances_asset_code',
          fields: ['asset_code']
        },
        {
          name: 'idx_account_asset_balances_account_id',
          fields: ['account_id']
        },
        {
          name: 'idx_account_asset_balances_lottery_campaign_id',
          fields: ['lottery_campaign_id']
        }
      ],
      comment: '账户资产余额表（可用余额 + 冻结余额）'
    }
  )

  /**
   * 定义关联关系
   *
   * @param {Object} models - 模型对象集合
   * @returns {void} 无返回值
   */
  AccountAssetBalance.associate = function (models) {
    // 关联账户
    AccountAssetBalance.belongsTo(models.Account, {
      foreignKey: 'account_id',
      as: 'account',
      comment: '关联账户'
    })
  }

  /**
   * 静态方法：获取或创建资产余额记录
   *
   * @param {number} account_id - 账户ID
   * @param {string} asset_code - 资产代码
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 事务对象
   * @returns {Promise<Object>} 余额记录对象
   */
  AccountAssetBalance.getOrCreate = async function (account_id, asset_code, options = {}) {
    const { transaction } = options

    const [balance, created] = await AccountAssetBalance.findOrCreate({
      where: {
        account_id,
        asset_code
      },
      defaults: {
        account_id,
        asset_code,
        available_amount: 0,
        frozen_amount: 0
      },
      transaction
    })

    if (created) {
      console.log(
        `✅ 创建资产余额记录：account_id=${account_id}, asset_code=${asset_code}, balance_id=${balance.account_asset_balance_id}`
      )
    }

    return balance
  }

  /**
   * 实例方法：获取总余额（可用 + 冻结）
   *
   * @returns {number} 总余额
   */
  AccountAssetBalance.prototype.getTotalBalance = function () {
    return Number(this.available_amount) + Number(this.frozen_amount)
  }

  /**
   * 实例方法：检查可用余额是否充足
   *
   * @param {number} amount - 需要的金额
   * @returns {boolean} true-充足，false-不足
   */
  AccountAssetBalance.prototype.hasEnoughAvailable = function (amount) {
    return Number(this.available_amount) >= Number(amount)
  }

  /**
   * 实例方法：检查冻结余额是否充足
   *
   * @param {number} amount - 需要的金额
   * @returns {boolean} true-充足，false-不足
   */
  AccountAssetBalance.prototype.hasEnoughFrozen = function (amount) {
    return Number(this.frozen_amount) >= Number(amount)
  }

  /**
   * 实例方法：冻结操作（available_amount → frozen_amount）
   *
   * @param {number} amount - 冻结金额
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   * @throws {Error} 可用余额不足时抛出异常
   */
  AccountAssetBalance.prototype.freeze = async function (amount, options = {}) {
    const { transaction } = options

    if (!this.hasEnoughAvailable(amount)) {
      throw new Error(`可用余额不足：需要${amount}，当前可用${this.available_amount}`)
    }

    this.available_amount = Number(this.available_amount) - Number(amount)
    this.frozen_amount = Number(this.frozen_amount) + Number(amount)

    await this.save({ transaction })

    console.log(
      `✅ 冻结成功：account_id=${this.account_id}, asset_code=${this.asset_code}, amount=${amount}, available=${this.available_amount}, frozen=${this.frozen_amount}`
    )
  }

  /**
   * 实例方法：解冻操作（frozen_amount → available_amount）
   *
   * @param {number} amount - 解冻金额
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   * @throws {Error} 冻结余额不足时抛出异常
   */
  AccountAssetBalance.prototype.unfreeze = async function (amount, options = {}) {
    const { transaction } = options

    if (!this.hasEnoughFrozen(amount)) {
      throw new Error(`冻结余额不足：需要${amount}，当前冻结${this.frozen_amount}`)
    }

    this.frozen_amount = Number(this.frozen_amount) - Number(amount)
    this.available_amount = Number(this.available_amount) + Number(amount)

    await this.save({ transaction })

    console.log(
      `✅ 解冻成功：account_id=${this.account_id}, asset_code=${this.asset_code}, amount=${amount}, available=${this.available_amount}, frozen=${this.frozen_amount}`
    )
  }

  /**
   * 实例方法：从冻结扣减（成交结算时使用）
   *
   * @param {number} amount - 扣减金额
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   * @throws {Error} 冻结余额不足时抛出异常
   */
  AccountAssetBalance.prototype.deductFromFrozen = async function (amount, options = {}) {
    const { transaction } = options

    if (!this.hasEnoughFrozen(amount)) {
      throw new Error(`冻结余额不足：需要${amount}，当前冻结${this.frozen_amount}`)
    }

    this.frozen_amount = Number(this.frozen_amount) - Number(amount)

    await this.save({ transaction })

    console.log(
      `✅ 从冻结扣减成功：account_id=${this.account_id}, asset_code=${this.asset_code}, amount=${amount}, frozen=${this.frozen_amount}`
    )
  }

  return AccountAssetBalance
}
