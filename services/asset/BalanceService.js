/**
 * 余额操作服务 - AssetService 拆分子服务
 *
 * @description 处理所有账户和余额相关操作（从 AssetService 提取）
 * @module services/asset/BalanceService
 * @version 1.0.0
 * @date 2026-01-31
 *
 * 职责范围：
 * - 账户创建/查询：getOrCreateAccount
 * - 余额管理：getOrCreateBalance, changeBalance
 * - 冻结管理：freeze, unfreeze, settleFromFrozen
 * - 余额查询：getBalance, getAllBalances
 *
 * 服务类型：静态类（无需实例化）
 * 服务键名：asset_balance
 *
 * 依赖服务：无循环依赖（基础层服务）
 *
 * 数据模型：
 * - Account：账户（user_id/system_code + account_type）
 * - AccountAssetBalance：账户余额（account_id + asset_code + lottery_campaign_id）
 * - AssetTransaction：资产变更交易记录
 *
 * 设计原则（继承自 AssetService）：
 * - 所有资产操作支持外部事务传入
 * - 所有资产变动支持幂等性控制（idempotency_key 唯一约束）
 * - 余额不足时直接抛出异常，不允许负余额
 * - 记录变动前后余额用于完整对账（before + delta = after）
 * - 冻结模型：交易市场购买和资产挂牌必须走冻结→结算链路
 */

'use strict'

const { Account, AccountAssetBalance, AssetTransaction, User } = require('../../models')
const logger = require('../../utils/logger')
const { requireTransaction } = require('../../utils/transactionHelpers')

/**
 * 余额操作服务类
 *
 * @class BalanceService
 * @description 处理账户余额相关的所有操作，是资产服务的核心基础层
 */
class BalanceService {
  /**
   * 获取或创建账户（支持用户账户和系统账户）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（用户账户必填）
   * @param {string} params.system_code - 系统账户代码（系统账户必填，如SYSTEM_PLATFORM_FEE）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} 账户对象
   */
  static async getOrCreateAccount(params, options = {}) {
    const { user_id, system_code } = params
    const { transaction } = options

    // 参数验证：user_id 和 system_code 必须二选一
    if (!user_id && !system_code) {
      throw new Error('user_id 或 system_code 必须提供其中之一')
    }
    if (user_id && system_code) {
      throw new Error('user_id 和 system_code 不能同时提供')
    }

    // 用户账户
    if (user_id) {
      // 验证用户是否存在
      const user = await User.findByPk(user_id, { transaction })
      if (!user) {
        throw new Error(`用户不存在：user_id=${user_id}`)
      }

      // 查找或创建用户账户
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
        logger.info('✅ 创建新用户账户', {
          service: 'BalanceService',
          method: 'getOrCreateAccount',
          account_id: account.account_id,
          user_id
        })
      }

      return account
    }

    // 系统账户
    if (system_code) {
      // 查找系统账户（系统账户在迁移时已创建，不应该动态创建）
      const account = await Account.findOne({
        where: {
          account_type: 'system',
          system_code
        },
        transaction
      })

      if (!account) {
        throw new Error(`系统账户不存在：system_code=${system_code}，请检查数据库初始化`)
      }

      return account
    }
  }

  /**
   * 获取或创建资产余额记录
   *
   * 业务规则（BUDGET_POINTS 架构）：
   * - BUDGET_POINTS 必须指定 lottery_campaign_id（活动隔离）
   * - 其他资产类型 lottery_campaign_id 可选
   *
   * @param {number} account_id - 账户ID
   * @param {string} asset_code - 资产代码（如DIAMOND、red_shard、BUDGET_POINTS）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @param {string|number} options.lottery_campaign_id - 活动ID（BUDGET_POINTS 必填，其他资产可选）
   * @returns {Promise<Object>} 资产余额对象
   */
  static async getOrCreateBalance(account_id, asset_code, options = {}) {
    const { transaction, lottery_campaign_id } = options

    // 🔥 BUDGET_POINTS 必须指定 lottery_campaign_id
    if (asset_code === 'BUDGET_POINTS' && !lottery_campaign_id) {
      throw new Error('BUDGET_POINTS 必须指定 lottery_campaign_id 参数（活动隔离规则）')
    }

    // 构建查询条件
    const whereCondition = {
      account_id,
      asset_code
    }

    // BUDGET_POINTS 按活动隔离
    if (asset_code === 'BUDGET_POINTS' && lottery_campaign_id) {
      whereCondition.lottery_campaign_id = String(lottery_campaign_id)
    }

    // 默认值
    const defaults = {
      account_id,
      asset_code,
      available_amount: 0,
      frozen_amount: 0
    }

    // BUDGET_POINTS 需要记录 lottery_campaign_id
    if (asset_code === 'BUDGET_POINTS' && lottery_campaign_id) {
      defaults.lottery_campaign_id = String(lottery_campaign_id)
    }

    // 查找或创建资产余额记录（使用findOrCreate确保原子性）
    const [balance, created] = await AccountAssetBalance.findOrCreate({
      where: whereCondition,
      defaults,
      transaction
    })

    if (created) {
      logger.info('✅ 创建新资产余额记录', {
        service: 'BalanceService',
        method: 'getOrCreateBalance',
        balance_id: balance.balance_id,
        account_id,
        asset_code,
        lottery_campaign_id: lottery_campaign_id || null
      })
    }

    return balance
  }

  /**
   * 改变可用余额（核心方法 - 方案B业界标准幂等机制）
   *
   * 业务规则：
   * - 支持幂等性控制（idempotency_key唯一约束）
   * - 扣减时必须验证可用余额充足
   * - 记录变动前后余额用于完整对账（before + delta = after）
   * - 支持外部事务传入
   * - BUDGET_POINTS 必须指定 lottery_campaign_id（活动隔离）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（用户账户）
   * @param {string} params.system_code - 系统账户代码（系统账户）
   * @param {string} params.asset_code - 资产代码
   * @param {number} params.delta_amount - 变动金额（正数=增加，负数=扣减）
   * @param {string} params.business_type - 业务类型（必填）
   * @param {string} params.idempotency_key - 独立幂等键（必填）
   * @param {string} params.lottery_session_id - 抽奖会话ID（可选，仅抽奖业务使用）
   * @param {string|number} params.lottery_campaign_id - 活动ID（BUDGET_POINTS 必填，其他资产可选）
   * @param {Object} params.meta - 扩展信息（可选）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（强制要求）
   * @returns {Promise<Object>} 结果对象 {account, balance, transaction_record, is_duplicate}
   */
  static async changeBalance(params, options = {}) {
    const {
      user_id,
      system_code,
      asset_code,
      delta_amount,
      business_type,
      idempotency_key,
      lottery_session_id,
      lottery_campaign_id,
      meta = {}
    } = params
    const { transaction } = options

    // 🔒 事务边界检查：强制要求传入事务（2026-01-05 治理决策）
    requireTransaction(transaction, 'BalanceService.changeBalance')

    // 参数验证
    if (!idempotency_key) {
      throw new Error('idempotency_key是必填参数（幂等性控制）')
    }
    if (!business_type) {
      throw new Error('business_type是必填参数（业务场景分类）')
    }
    if (delta_amount === 0) {
      throw new Error('变动金额不能为0')
    }
    if (!asset_code) {
      throw new Error('asset_code是必填参数')
    }

    // 🔥 BUDGET_POINTS 必须指定 lottery_campaign_id（活动隔离规则）
    if (asset_code === 'BUDGET_POINTS' && !lottery_campaign_id) {
      throw new Error('BUDGET_POINTS 必须指定 lottery_campaign_id 参数（活动隔离规则）')
    }

    try {
      // 🔥 幂等性检查：通过唯一约束兜底
      const existingTransaction = await AssetTransaction.findOne({
        where: { idempotency_key },
        transaction
      })

      if (existingTransaction) {
        logger.info('⚠️ 幂等性检查：资产变动已存在，返回原结果', {
          service: 'BalanceService',
          method: 'changeBalance',
          idempotency_key,
          business_type,
          asset_transaction_id: existingTransaction.asset_transaction_id
        })

        // 获取当前账户和余额状态
        const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })
        const balance = await this.getOrCreateBalance(account.account_id, asset_code, {
          transaction,
          lottery_campaign_id
        })

        return {
          account,
          balance,
          transaction_record: existingTransaction,
          is_duplicate: true
        }
      }

      // 获取或创建账户
      const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })

      // 构建余额查询条件（BUDGET_POINTS 需要按活动隔离）
      const balanceWhereCondition = {
        account_id: account.account_id,
        asset_code
      }

      // BUDGET_POINTS 按活动隔离查询
      if (asset_code === 'BUDGET_POINTS' && lottery_campaign_id) {
        balanceWhereCondition.lottery_campaign_id = String(lottery_campaign_id)
      }

      // 获取或创建余额记录（加行级锁）
      const balance = await AccountAssetBalance.findOne({
        where: balanceWhereCondition,
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      let finalBalance
      if (!balance) {
        // 余额记录不存在，创建新记录
        if (delta_amount < 0) {
          throw new Error(`余额不足：账户不存在且尝试扣减${Math.abs(delta_amount)}个${asset_code}`)
        }
        finalBalance = await this.getOrCreateBalance(account.account_id, asset_code, {
          transaction,
          lottery_campaign_id
        })
      } else {
        finalBalance = balance
      }

      // 验证可用余额充足（扣减时）
      if (delta_amount < 0) {
        const required_amount = Math.abs(delta_amount)
        if (finalBalance.available_amount < required_amount) {
          throw new Error(
            `可用余额不足：当前可用余额${finalBalance.available_amount}个${asset_code}，需要${required_amount}个，差额${required_amount - finalBalance.available_amount}个`
          )
        }
      }

      // 记录变动前余额
      const balance_before = Number(finalBalance.available_amount)

      // 计算变动后余额
      const balance_after = balance_before + Number(delta_amount)

      // 验证变动后余额不为负数（double check）
      if (balance_after < 0) {
        throw new Error(
          `变动后余额不能为负数：当前${balance_before} + 变动${delta_amount} = ${balance_after}`
        )
      }

      // 更新可用余额
      await finalBalance.update(
        {
          available_amount: balance_after
        },
        { transaction }
      )

      // 创建资产流水记录（方案B：使用 idempotency_key）
      const transaction_record = await AssetTransaction.create(
        {
          account_id: account.account_id,
          asset_code,
          delta_amount,
          balance_before,
          balance_after,
          business_type,
          lottery_session_id: lottery_session_id || null,
          idempotency_key,
          meta: {
            ...meta,
            lottery_campaign_id: lottery_campaign_id || null
          }
        },
        { transaction }
      )

      logger.info('✅ 资产变动成功', {
        service: 'BalanceService',
        method: 'changeBalance',
        account_id: account.account_id,
        system_code,
        asset_code,
        delta_amount,
        balance_before,
        balance_after,
        business_type,
        lottery_session_id: lottery_session_id || null,
        lottery_campaign_id: lottery_campaign_id || null,
        idempotency_key,
        asset_transaction_id: transaction_record.asset_transaction_id
      })

      // 刷新余额数据
      await finalBalance.reload({ transaction })

      return {
        account,
        balance: finalBalance,
        transaction_record,
        is_duplicate: false
      }
    } catch (error) {
      logger.error('❌ 资产变动失败', {
        service: 'BalanceService',
        method: 'changeBalance',
        user_id,
        system_code,
        asset_code,
        delta_amount,
        business_type,
        lottery_campaign_id: lottery_campaign_id || null,
        idempotency_key,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 冻结资产（交易市场购买、资产挂牌必须冻结）
   *
   * 业务规则：
   * - 从available_amount扣减，增加到frozen_amount
   * - 支持幂等性控制（idempotency_key唯一约束）
   * - 记录冻结流水
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（用户账户）
   * @param {string} params.system_code - 系统账户代码（系统账户）
   * @param {string} params.asset_code - 资产代码
   * @param {number} params.amount - 冻结金额（必须为正数）
   * @param {string} params.business_type - 业务类型（必填，如order_freeze_buyer）
   * @param {string} params.idempotency_key - 独立幂等键（必填）
   * @param {Object} params.meta - 扩展信息（可选）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（强制要求）
   * @returns {Promise<Object>} 结果对象 {account, balance, transaction_record, is_duplicate}
   */
  static async freeze(params, options = {}) {
    const {
      user_id,
      system_code,
      asset_code,
      amount,
      business_type,
      idempotency_key,
      meta = {}
    } = params
    const { transaction } = options

    // 🔒 事务边界检查：强制要求传入事务（2026-01-05 治理决策）
    requireTransaction(transaction, 'BalanceService.freeze')

    // 参数验证
    if (!idempotency_key) {
      throw new Error('idempotency_key是必填参数（幂等性控制）')
    }
    if (!business_type) {
      throw new Error('business_type是必填参数（业务场景分类）')
    }
    if (amount <= 0) {
      throw new Error('冻结金额必须为正数')
    }
    if (!asset_code) {
      throw new Error('asset_code是必填参数')
    }

    try {
      // 🔥 幂等性检查
      const existingTransaction = await AssetTransaction.findOne({
        where: { idempotency_key },
        transaction
      })

      if (existingTransaction) {
        logger.info('⚠️ 幂等性检查：冻结操作已存在，返回原结果', {
          service: 'BalanceService',
          method: 'freeze',
          idempotency_key,
          business_type,
          asset_transaction_id: existingTransaction.asset_transaction_id
        })

        const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })
        const balance = await this.getOrCreateBalance(account.account_id, asset_code, {
          transaction
        })

        return {
          account,
          balance,
          transaction_record: existingTransaction,
          is_duplicate: true
        }
      }

      // 获取账户和余额（加锁）
      const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })
      const balance = await AccountAssetBalance.findOne({
        where: {
          account_id: account.account_id,
          asset_code
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!balance) {
        throw new Error(
          `余额记录不存在：account_id=${account.account_id}, asset_code=${asset_code}`
        )
      }

      // 验证可用余额充足
      if (balance.available_amount < amount) {
        throw new Error(
          `可用余额不足：当前可用余额${balance.available_amount}个${asset_code}，需要冻结${amount}个，差额${amount - balance.available_amount}个`
        )
      }

      // 记录变动前余额
      const available_before = Number(balance.available_amount)
      const frozen_before = Number(balance.frozen_amount)

      // 计算变动后余额
      const available_after = available_before - amount
      const frozen_after = frozen_before + amount

      // 更新余额（available减少，frozen增加）
      await balance.update(
        {
          available_amount: available_after,
          frozen_amount: frozen_after
        },
        { transaction }
      )

      // 创建冻结流水记录
      const transaction_record = await AssetTransaction.create(
        {
          account_id: account.account_id,
          asset_code,
          delta_amount: -amount,
          balance_before: available_before,
          balance_after: available_after,
          frozen_amount_change: amount,
          business_type,
          lottery_session_id: null,
          idempotency_key,
          meta: {
            ...meta,
            freeze_amount: amount,
            frozen_before,
            frozen_after
          }
        },
        { transaction }
      )

      logger.info('✅ 资产冻结成功', {
        service: 'BalanceService',
        method: 'freeze',
        account_id: account.account_id,
        system_code,
        asset_code,
        amount,
        available_before,
        available_after,
        frozen_before,
        frozen_after,
        business_type,
        idempotency_key,
        asset_transaction_id: transaction_record.asset_transaction_id
      })

      await balance.reload({ transaction })

      return {
        account,
        balance,
        transaction_record,
        is_duplicate: false
      }
    } catch (error) {
      logger.error('❌ 资产冻结失败', {
        service: 'BalanceService',
        method: 'freeze',
        user_id,
        system_code,
        asset_code,
        amount,
        business_type,
        idempotency_key,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 解冻资产（订单取消、超时解锁）
   *
   * 业务规则：
   * - 从frozen_amount扣减，增加到available_amount
   * - 支持幂等性控制（idempotency_key唯一约束）
   * - 记录解冻流水
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（用户账户）
   * @param {string} params.system_code - 系统账户代码（系统账户）
   * @param {string} params.asset_code - 资产代码
   * @param {number} params.amount - 解冻金额（必须为正数）
   * @param {string} params.business_type - 业务类型（必填，如order_unfreeze_buyer）
   * @param {string} params.idempotency_key - 独立幂等键（必填）
   * @param {Object} params.meta - 扩展信息（可选）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（强制要求）
   * @returns {Promise<Object>} 结果对象 {account, balance, transaction_record, is_duplicate}
   */
  static async unfreeze(params, options = {}) {
    const {
      user_id,
      system_code,
      asset_code,
      amount,
      business_type,
      idempotency_key,
      meta = {}
    } = params
    const { transaction } = options

    // 🔒 事务边界检查：强制要求传入事务（2026-01-05 治理决策）
    requireTransaction(transaction, 'BalanceService.unfreeze')

    // 参数验证
    if (!idempotency_key) {
      throw new Error('idempotency_key是必填参数（幂等性控制）')
    }
    if (!business_type) {
      throw new Error('business_type是必填参数（业务场景分类）')
    }
    if (amount <= 0) {
      throw new Error('解冻金额必须为正数')
    }
    if (!asset_code) {
      throw new Error('asset_code是必填参数')
    }

    try {
      // 🔥 幂等性检查
      const existingTransaction = await AssetTransaction.findOne({
        where: { idempotency_key },
        transaction
      })

      if (existingTransaction) {
        logger.info('⚠️ 幂等性检查：解冻操作已存在，返回原结果', {
          service: 'BalanceService',
          method: 'unfreeze',
          idempotency_key,
          business_type,
          asset_transaction_id: existingTransaction.asset_transaction_id
        })

        const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })
        const balance = await this.getOrCreateBalance(account.account_id, asset_code, {
          transaction
        })

        return {
          account,
          balance,
          transaction_record: existingTransaction,
          is_duplicate: true
        }
      }

      // 获取账户和余额（加锁）
      const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })
      const balance = await AccountAssetBalance.findOne({
        where: {
          account_id: account.account_id,
          asset_code
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!balance) {
        throw new Error(
          `余额记录不存在：account_id=${account.account_id}, asset_code=${asset_code}`
        )
      }

      // 验证冻结余额充足
      if (balance.frozen_amount < amount) {
        throw new Error(
          `冻结余额不足：当前冻结余额${balance.frozen_amount}个${asset_code}，需要解冻${amount}个，差额${amount - balance.frozen_amount}个`
        )
      }

      // 记录变动前余额
      const available_before = Number(balance.available_amount)
      const frozen_before = Number(balance.frozen_amount)

      // 计算变动后余额
      const available_after = available_before + amount
      const frozen_after = frozen_before - amount

      // 更新余额（available增加，frozen减少）
      await balance.update(
        {
          available_amount: available_after,
          frozen_amount: frozen_after
        },
        { transaction }
      )

      // 创建解冻流水记录
      const transaction_record = await AssetTransaction.create(
        {
          account_id: account.account_id,
          asset_code,
          delta_amount: amount,
          balance_before: available_before,
          balance_after: available_after,
          frozen_amount_change: -amount,
          business_type,
          lottery_session_id: null,
          idempotency_key,
          meta: {
            ...meta,
            unfreeze_amount: amount,
            frozen_before,
            frozen_after
          }
        },
        { transaction }
      )

      logger.info('✅ 资产解冻成功', {
        service: 'BalanceService',
        method: 'unfreeze',
        account_id: account.account_id,
        system_code,
        asset_code,
        amount,
        available_before,
        available_after,
        frozen_before,
        frozen_after,
        business_type,
        idempotency_key,
        asset_transaction_id: transaction_record.asset_transaction_id
      })

      await balance.reload({ transaction })

      return {
        account,
        balance,
        transaction_record,
        is_duplicate: false
      }
    } catch (error) {
      logger.error('❌ 资产解冻失败', {
        service: 'BalanceService',
        method: 'unfreeze',
        user_id,
        system_code,
        asset_code,
        amount,
        business_type,
        idempotency_key,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 从冻结余额结算（订单完成时使用）
   *
   * 业务规则：
   * - 从frozen_amount扣减（无需增加到available）
   * - 支持幂等性控制（idempotency_key唯一约束）
   * - 记录结算流水
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（用户账户）
   * @param {string} params.system_code - 系统账户代码（系统账户）
   * @param {string} params.asset_code - 资产代码
   * @param {number} params.amount - 结算金额（必须为正数）
   * @param {string} params.business_type - 业务类型（必填，如order_settle_buyer）
   * @param {string} params.idempotency_key - 独立幂等键（必填）
   * @param {Object} params.meta - 扩展信息（可选）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（强制要求）
   * @returns {Promise<Object>} 结果对象 {account, balance, transaction_record, is_duplicate}
   */
  static async settleFromFrozen(params, options = {}) {
    const {
      user_id,
      system_code,
      asset_code,
      amount,
      business_type,
      idempotency_key,
      meta = {}
    } = params
    const { transaction } = options

    // 🔒 事务边界检查：强制要求传入事务（2026-01-05 治理决策）
    requireTransaction(transaction, 'BalanceService.settleFromFrozen')

    // 参数验证
    if (!idempotency_key) {
      throw new Error('idempotency_key是必填参数（幂等性控制）')
    }
    if (!business_type) {
      throw new Error('business_type是必填参数（业务场景分类）')
    }
    if (amount <= 0) {
      throw new Error('结算金额必须为正数')
    }
    if (!asset_code) {
      throw new Error('asset_code是必填参数')
    }

    try {
      // 🔥 幂等性检查
      const existingTransaction = await AssetTransaction.findOne({
        where: { idempotency_key },
        transaction
      })

      if (existingTransaction) {
        logger.info('⚠️ 幂等性检查：结算操作已存在，返回原结果', {
          service: 'BalanceService',
          method: 'settleFromFrozen',
          idempotency_key,
          business_type,
          asset_transaction_id: existingTransaction.asset_transaction_id
        })

        const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })
        const balance = await this.getOrCreateBalance(account.account_id, asset_code, {
          transaction
        })

        return {
          account,
          balance,
          transaction_record: existingTransaction,
          is_duplicate: true
        }
      }

      // 获取账户和余额（加锁）
      const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })
      const balance = await AccountAssetBalance.findOne({
        where: {
          account_id: account.account_id,
          asset_code
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!balance) {
        throw new Error(
          `余额记录不存在：account_id=${account.account_id}, asset_code=${asset_code}`
        )
      }

      // 验证冻结余额充足
      if (balance.frozen_amount < amount) {
        throw new Error(
          `冻结余额不足：当前冻结余额${balance.frozen_amount}个${asset_code}，需要结算${amount}个，差额${amount - balance.frozen_amount}个`
        )
      }

      // 记录变动前余额
      const available_before = Number(balance.available_amount)
      const frozen_before = Number(balance.frozen_amount)

      // 计算变动后余额（仅从frozen扣减，available不变）
      const available_after = available_before
      const frozen_after = frozen_before - amount

      // 更新余额（仅frozen减少）
      await balance.update(
        {
          frozen_amount: frozen_after
        },
        { transaction }
      )

      // 创建结算流水记录
      const transaction_record = await AssetTransaction.create(
        {
          account_id: account.account_id,
          asset_code,
          delta_amount: 0, // 可用余额不变
          balance_before: available_before,
          balance_after: available_after,
          frozen_amount_change: -amount,
          business_type,
          lottery_session_id: null,
          idempotency_key,
          meta: {
            ...meta,
            settle_amount: amount,
            frozen_before,
            frozen_after
          }
        },
        { transaction }
      )

      logger.info('✅ 资产结算成功（从冻结余额）', {
        service: 'BalanceService',
        method: 'settleFromFrozen',
        account_id: account.account_id,
        system_code,
        asset_code,
        amount,
        available_before,
        available_after,
        frozen_before,
        frozen_after,
        business_type,
        idempotency_key,
        asset_transaction_id: transaction_record.asset_transaction_id
      })

      await balance.reload({ transaction })

      return {
        account,
        balance,
        transaction_record,
        is_duplicate: false
      }
    } catch (error) {
      logger.error('❌ 资产结算失败', {
        service: 'BalanceService',
        method: 'settleFromFrozen',
        user_id,
        system_code,
        asset_code,
        amount,
        business_type,
        idempotency_key,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取余额（available + frozen）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（用户账户）
   * @param {string} params.system_code - 系统账户代码（系统账户）
   * @param {string} params.asset_code - 资产代码
   * @param {string|number} params.lottery_campaign_id - 活动ID（BUDGET_POINTS 必填，其他资产可选）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<Object|null>} 余额对象或null
   */
  static async getBalance(params, options = {}) {
    const { user_id, system_code, asset_code, lottery_campaign_id } = params
    const { transaction } = options

    // 🔥 BUDGET_POINTS 必须指定 lottery_campaign_id
    if (asset_code === 'BUDGET_POINTS' && !lottery_campaign_id) {
      throw new Error('BUDGET_POINTS 必须指定 lottery_campaign_id 参数（活动隔离规则）')
    }

    try {
      // 获取账户
      const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })

      // 构建查询条件
      const whereCondition = {
        account_id: account.account_id,
        asset_code
      }

      // BUDGET_POINTS 按活动隔离查询
      if (asset_code === 'BUDGET_POINTS' && lottery_campaign_id) {
        whereCondition.lottery_campaign_id = String(lottery_campaign_id)
      }

      // 查找余额记录
      const balance = await AccountAssetBalance.findOne({
        where: whereCondition,
        transaction
      })

      return balance
    } catch (error) {
      // 账户不存在时返回null（非致命错误）
      if (error.message.includes('用户不存在') || error.message.includes('系统账户不存在')) {
        return null
      }
      throw error
    }
  }

  /**
   * 获取用户所有资产余额
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<Array>} 余额数组
   */
  static async getAllBalances(params, options = {}) {
    const { user_id } = params
    const { transaction } = options

    try {
      // 获取用户账户
      const account = await Account.findOne({
        where: {
          account_type: 'user',
          user_id
        },
        transaction
      })

      if (!account) {
        return []
      }

      // 查找所有余额记录
      const balances = await AccountAssetBalance.findAll({
        where: {
          account_id: account.account_id
        },
        transaction
      })

      return balances
    } catch (error) {
      logger.error('❌ 获取所有余额失败', {
        service: 'BalanceService',
        method: 'getAllBalances',
        user_id,
        error: error.message
      })
      throw error
    }
  }
}

module.exports = BalanceService
