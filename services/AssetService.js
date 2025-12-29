/**
 * 统一资产服务 - AssetService（升级版：支持账户体系 + 冻结模型 + 业界标准幂等架构）
 * 管理DIAMOND和材料资产的核心服务
 *
 * 业务场景：
 * - 交易市场DIAMOND结算（买家扣减、卖家入账、平台手续费）
 * - 兑换市场材料资产扣减（兑换商品消耗材料）
 * - 材料转换（碎红水晶→DIAMOND）
 * - 管理员资产调整
 *
 * 核心能力（V2升级）：
 * - getOrCreateAccount: 获取或创建账户（支持用户账户和系统账户）
 * - getOrCreateBalance: 获取或创建资产余额记录
 * - changeBalance: 改变可用余额（支持幂等性、事务保护）
 * - freeze: 冻结资产（交易市场购买、资产挂牌必须冻结）
 * - unfreeze: 解冻资产（订单取消、超时解锁）
 * - settleFromFrozen: 从冻结余额结算（订单完成时使用）
 * - getBalance: 获取余额（available + frozen）
 * - getTransactions: 获取流水记录
 *
 * 设计原则：
 * - 所有资产操作支持外部事务传入
 * - 所有资产变动支持幂等性控制（idempotency_key 唯一约束）
 * - 余额不足时直接抛出异常，不允许负余额
 * - 记录变动前后余额用于完整对账（before + delta = after）
 * - 冻结模型：交易市场购买和资产挂牌必须走冻结→结算链路
 *
 * 幂等性机制（方案B - 业界标准）：
 * - idempotency_key：每条事务记录的独立幂等键（唯一约束）
 * - lottery_session_id：抽奖会话ID（仅抽奖业务使用，非抽奖业务可为NULL）
 *
 * 命名规范（snake_case）：
 * - 所有方法、参数、字段使用snake_case
 * - 符合项目统一命名规范
 *
 * 创建时间：2025-12-15
 * 升级时间：2025-12-15（Phase 1-4：支持账户体系 + 冻结模型）
 * 升级时间：2025-12-26（方案B：业界标准幂等架构，删除 business_id 参数）
 */

'use strict'

const { Account, AccountAssetBalance, AssetTransaction, User } = require('../models')
const { sequelize } = require('../config/database')
const logger = require('../utils/logger')

/**
 * 资产服务类（V2升级版）
 * 负责所有资产相关的业务逻辑
 */
class AssetService {
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
   * @param {number} account_id - 账户ID
   * @param {string} asset_code - 资产代码（如DIAMOND、red_shard）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} 资产余额对象
   */
  static async getOrCreateBalance(account_id, asset_code, options = {}) {
    const { transaction } = options

    // 查找或创建资产余额记录（使用findOrCreate确保原子性）
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
      logger.info('✅ 创建新资产余额记录', {
        balance_id: balance.balance_id,
        account_id,
        asset_code
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
   *
   * 幂等机制（方案B - 业界标准）：
   * - idempotency_key：独立幂等键（每条记录唯一）
   * - lottery_session_id：抽奖会话ID（仅抽奖业务使用，非抽奖业务可为NULL）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（用户账户）
   * @param {string} params.system_code - 系统账户代码（系统账户）
   * @param {string} params.asset_code - 资产代码
   * @param {number} params.delta_amount - 变动金额（正数=增加，负数=扣减）
   * @param {string} params.business_type - 业务类型（必填）
   * @param {string} params.idempotency_key - 独立幂等键（必填）
   * @param {string} params.lottery_session_id - 抽奖会话ID（可选，仅抽奖业务使用）
   * @param {Object} params.meta - 扩展信息（可选）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
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
      meta = {}
    } = params
    const { transaction: externalTransaction } = options

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

    // 支持外部事务传入
    const transaction = externalTransaction || (await sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      // 🔥 幂等性检查：通过唯一约束兜底
      const existingTransaction = await AssetTransaction.findOne({
        where: { idempotency_key },
        transaction
      })

      if (existingTransaction) {
        logger.info('⚠️ 幂等性检查：资产变动已存在，返回原结果', {
          idempotency_key,
          business_type,
          transaction_id: existingTransaction.transaction_id
        })

        // 获取当前账户和余额状态
        const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })
        const balance = await this.getOrCreateBalance(account.account_id, asset_code, {
          transaction
        })

        if (shouldCommit) {
          await transaction.commit()
        }

        return {
          account,
          balance,
          transaction_record: existingTransaction,
          is_duplicate: true
        }
      }

      // 获取或创建账户
      const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })

      // 获取或创建余额记录（加行级锁）
      const balance = await AccountAssetBalance.findOne({
        where: {
          account_id: account.account_id,
          asset_code
        },
        lock: transaction.LOCK.UPDATE, // 行级锁，防止并发问题
        transaction
      })

      let finalBalance
      if (!balance) {
        // 余额记录不存在，创建新记录
        if (delta_amount < 0) {
          throw new Error(`余额不足：账户不存在且尝试扣减${Math.abs(delta_amount)}个${asset_code}`)
        }
        finalBalance = await this.getOrCreateBalance(account.account_id, asset_code, {
          transaction
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

      // 创建资产流水记录（方案B：无 business_id）
      const transaction_record = await AssetTransaction.create(
        {
          account_id: account.account_id,
          asset_code,
          delta_amount,
          balance_before,
          balance_after,
          business_type,
          lottery_session_id: lottery_session_id || null, // 非抽奖业务可为NULL
          idempotency_key,
          meta
        },
        { transaction }
      )

      logger.info('✅ 资产变动成功', {
        account_id: account.account_id,
        system_code,
        asset_code,
        delta_amount,
        balance_before,
        balance_after,
        business_type,
        lottery_session_id: lottery_session_id || null,
        idempotency_key,
        transaction_id: transaction_record.transaction_id
      })

      if (shouldCommit) {
        await transaction.commit()
      }

      // 刷新余额数据
      await finalBalance.reload({ transaction: externalTransaction })

      return {
        account,
        balance: finalBalance,
        transaction_record,
        is_duplicate: false
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('❌ 资产变动失败', {
        user_id,
        system_code,
        asset_code,
        delta_amount,
        business_type,
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
   * @param {Object} options.transaction - Sequelize事务对象（可选）
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
    const { transaction: externalTransaction } = options

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

    // 支持外部事务传入
    const transaction = externalTransaction || (await sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      // 🔥 幂等性检查
      const existingTransaction = await AssetTransaction.findOne({
        where: { idempotency_key },
        transaction
      })

      if (existingTransaction) {
        logger.info('⚠️ 幂等性检查：冻结操作已存在，返回原结果', {
          idempotency_key,
          business_type,
          transaction_id: existingTransaction.transaction_id
        })

        const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })
        const balance = await this.getOrCreateBalance(account.account_id, asset_code, {
          transaction
        })

        if (shouldCommit) {
          await transaction.commit()
        }

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

      // 创建冻结流水记录（delta_amount为负数表示从available扣减）
      const transaction_record = await AssetTransaction.create(
        {
          account_id: account.account_id,
          asset_code,
          delta_amount: -amount, // 负数表示从available扣减
          balance_before: available_before,
          balance_after: available_after,
          business_type,
          lottery_session_id: null, // 冻结操作不关联抽奖会话
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
        transaction_id: transaction_record.transaction_id
      })

      if (shouldCommit) {
        await transaction.commit()
      }

      await balance.reload({ transaction: externalTransaction })

      return {
        account,
        balance,
        transaction_record,
        is_duplicate: false
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('❌ 资产冻结失败', {
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
   * @param {Object} options.transaction - Sequelize事务对象（可选）
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
    const { transaction: externalTransaction } = options

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

    // 支持外部事务传入
    const transaction = externalTransaction || (await sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      // 🔥 幂等性检查
      const existingTransaction = await AssetTransaction.findOne({
        where: { idempotency_key },
        transaction
      })

      if (existingTransaction) {
        logger.info('⚠️ 幂等性检查：解冻操作已存在，返回原结果', {
          idempotency_key,
          business_type,
          transaction_id: existingTransaction.transaction_id
        })

        const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })
        const balance = await this.getOrCreateBalance(account.account_id, asset_code, {
          transaction
        })

        if (shouldCommit) {
          await transaction.commit()
        }

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

      // 创建解冻流水记录（delta_amount为正数表示增加到available）
      const transaction_record = await AssetTransaction.create(
        {
          account_id: account.account_id,
          asset_code,
          delta_amount: amount, // 正数表示增加到available
          balance_before: available_before,
          balance_after: available_after,
          business_type,
          lottery_session_id: null, // 解冻操作不关联抽奖会话
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
        transaction_id: transaction_record.transaction_id
      })

      if (shouldCommit) {
        await transaction.commit()
      }

      await balance.reload({ transaction: externalTransaction })

      return {
        account,
        balance,
        transaction_record,
        is_duplicate: false
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('❌ 资产解冻失败', {
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
   * - 从frozen_amount扣减（不增加到available）
   * - 支持幂等性控制（idempotency_key唯一约束）
   * - 记录结算流水
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（用户账户）
   * @param {string} params.system_code - 系统账户代码（系统账户）
   * @param {string} params.asset_code - 资产代码
   * @param {number} params.amount - 结算金额（必须为正数）
   * @param {string} params.business_type - 业务类型（必填，如order_settle_buyer_debit）
   * @param {string} params.idempotency_key - 独立幂等键（必填）
   * @param {Object} params.meta - 扩展信息（可选）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
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
    const { transaction: externalTransaction } = options

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

    // 支持外部事务传入
    const transaction = externalTransaction || (await sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      // 🔥 幂等性检查
      const existingTransaction = await AssetTransaction.findOne({
        where: { idempotency_key },
        transaction
      })

      if (existingTransaction) {
        logger.info('⚠️ 幂等性检查：结算操作已存在，返回原结果', {
          idempotency_key,
          business_type,
          transaction_id: existingTransaction.transaction_id
        })

        const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })
        const balance = await this.getOrCreateBalance(account.account_id, asset_code, {
          transaction
        })

        if (shouldCommit) {
          await transaction.commit()
        }

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

      // 计算变动后余额（available不变，frozen减少）
      const available_after = available_before
      const frozen_after = frozen_before - amount

      // 更新余额（只减少frozen，available不变）
      await balance.update(
        {
          frozen_amount: frozen_after
        },
        { transaction }
      )

      // 创建结算流水记录（delta_amount为0，因为available不变）
      const transaction_record = await AssetTransaction.create(
        {
          account_id: account.account_id,
          asset_code,
          delta_amount: 0, // available不变
          balance_before: available_before,
          balance_after: available_after,
          business_type,
          lottery_session_id: null, // 结算操作不关联抽奖会话
          idempotency_key,
          meta: {
            ...meta,
            settle_amount: amount,
            frozen_before,
            frozen_after,
            settle_from: 'frozen'
          }
        },
        { transaction }
      )

      logger.info('✅ 从冻结余额结算成功', {
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
        transaction_id: transaction_record.transaction_id
      })

      if (shouldCommit) {
        await transaction.commit()
      }

      await balance.reload({ transaction: externalTransaction })

      return {
        account,
        balance,
        transaction_record,
        is_duplicate: false
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('❌ 从冻结余额结算失败', {
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
   * 获取资产余额（available + frozen）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（用户账户）
   * @param {string} params.system_code - 系统账户代码（系统账户）
   * @param {string} params.asset_code - 资产代码
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<Object>} 余额对象 {available_amount, frozen_amount, total_amount}
   */
  static async getBalance(params, options = {}) {
    const { user_id, system_code, asset_code } = params
    const { transaction } = options

    const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })
    const balance = await AccountAssetBalance.findOne({
      where: {
        account_id: account.account_id,
        asset_code
      },
      transaction
    })

    if (!balance) {
      return {
        available_amount: 0,
        frozen_amount: 0,
        total_amount: 0
      }
    }

    return {
      available_amount: Number(balance.available_amount),
      frozen_amount: Number(balance.frozen_amount),
      total_amount: Number(balance.available_amount) + Number(balance.frozen_amount)
    }
  }

  /**
   * 获取账户所有资产余额
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（用户账户）
   * @param {string} params.system_code - 系统账户代码（系统账户）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<Array>} 资产余额列表
   */
  static async getAllBalances(params, options = {}) {
    const { user_id, system_code } = params
    const { transaction } = options

    const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })

    return await AccountAssetBalance.findAll({
      where: {
        account_id: account.account_id
      },
      transaction,
      order: [['asset_code', 'ASC']]
    })
  }

  /**
   * 获取资产流水记录
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（用户账户）
   * @param {string} params.system_code - 系统账户代码（系统账户）
   * @param {Object} filters - 筛选条件
   * @param {string} filters.asset_code - 资产代码（可选）
   * @param {string} filters.business_type - 业务类型（可选）
   * @param {number} filters.page - 页码（默认1）
   * @param {number} filters.page_size - 每页数量（默认20）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<Object>} 流水记录列表和分页信息
   */
  static async getTransactions(params, filters = {}, options = {}) {
    const { user_id, system_code } = params
    const { asset_code, business_type, page = 1, page_size = 20 } = filters
    const { transaction } = options

    const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })

    const where = { account_id: account.account_id }

    if (asset_code) {
      where.asset_code = asset_code
    }

    if (business_type) {
      where.business_type = business_type
    }

    const { count, rows } = await AssetTransaction.findAndCountAll({
      where,
      limit: page_size,
      offset: (page - 1) * page_size,
      order: [['created_at', 'DESC']],
      transaction
    })

    return {
      transactions: rows,
      total: count,
      page,
      page_size,
      total_pages: Math.ceil(count / page_size)
    }
  }

  /**
   * 获取用户资产总览（统一资产域入口）
   *
   * 整合三个资产域：
   * 1. 积分（POINTS） - 来自 user_points_accounts
   * 2. 可叠加资产（DIAMOND、材料） - 来自 account_asset_balances
   * 3. 不可叠加物品 - 来自 item_instances
   *
   * 业务场景：
   * - 用户背包页面展示
   * - 资产统计仪表盘
   * - 用户资产概览
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（必填）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @param {boolean} options.include_items - 是否包含物品列表（默认false，仅返回统计数据）
   * @returns {Promise<Object>} 资产总览对象
   */
  static async getAssetPortfolio(params, options = {}) {
    const { user_id } = params
    const { transaction, include_items = false } = options

    if (!user_id) {
      throw new Error('user_id是必填参数')
    }

    // 需要动态引入模型（避免循环依赖）
    const { UserPointsAccount, ItemInstance, MaterialAssetType } = require('../models')

    // 1. 获取积分余额
    const pointsAccount = await UserPointsAccount.findOne({
      where: { user_id },
      transaction
    })

    const points = pointsAccount
      ? {
          available: Number(pointsAccount.available_points),
          total_earned: Number(pointsAccount.history_total_points || 0),
          total_consumed: Number(pointsAccount.consumed_total_points || 0)
        }
      : {
          available: 0,
          total_earned: 0,
          total_consumed: 0
        }

    // 2. 获取可叠加资产余额
    let account = null
    try {
      account = await this.getOrCreateAccount({ user_id }, { transaction })
    } catch (e) {
      // 用户可能没有账户，返回空余额
      logger.info('用户暂无资产账户', { user_id })
    }

    const fungible_assets = []
    if (account) {
      const balances = await AccountAssetBalance.findAll({
        where: { account_id: account.account_id },
        transaction,
        order: [['asset_code', 'ASC']]
      })

      // 获取材料类型的显示名称
      const materialTypes = await MaterialAssetType.findAll({
        where: { is_enabled: true },
        transaction
      })
      const materialTypeMap = new Map(
        materialTypes.map(t => [t.asset_code, { display_name: t.display_name }])
      )

      for (const balance of balances) {
        const materialInfo = materialTypeMap.get(balance.asset_code)
        fungible_assets.push({
          asset_code: balance.asset_code,
          display_name: materialInfo?.display_name || balance.asset_code,
          available_amount: Number(balance.available_amount),
          frozen_amount: Number(balance.frozen_amount),
          total_amount: Number(balance.available_amount) + Number(balance.frozen_amount),
          campaign_id: balance.campaign_id || null // 仅 BUDGET_POINTS 有值
        })
      }
    }

    // 3. 获取不可叠加物品统计
    const { Op } = require('sequelize')
    const itemCounts = await ItemInstance.findAll({
      attributes: [
        'item_type',
        'status',
        [require('sequelize').fn('COUNT', require('sequelize').col('item_instance_id')), 'count']
      ],
      where: {
        owner_user_id: user_id,
        status: { [Op.in]: ['available', 'locked'] } // 只统计用户持有的物品
      },
      group: ['item_type', 'status'],
      raw: true,
      transaction
    })

    // 整理物品统计
    const non_fungible_items = {
      total_count: 0,
      available_count: 0,
      locked_count: 0,
      by_type: {}
    }

    for (const item of itemCounts) {
      const count = Number(item.count)
      non_fungible_items.total_count += count

      if (item.status === 'available') {
        non_fungible_items.available_count += count
      } else if (item.status === 'locked') {
        non_fungible_items.locked_count += count
      }

      if (!non_fungible_items.by_type[item.item_type]) {
        non_fungible_items.by_type[item.item_type] = { available: 0, locked: 0 }
      }
      non_fungible_items.by_type[item.item_type][item.status] = count
    }

    // 4. 可选：获取物品详细列表
    let items_list = null
    if (include_items) {
      items_list = await ItemInstance.findAll({
        where: {
          owner_user_id: user_id,
          status: { [Op.in]: ['available', 'locked'] }
        },
        order: [['created_at', 'DESC']],
        limit: 100, // 限制返回数量
        transaction
      })
    }

    logger.info('✅ 获取用户资产总览成功', {
      user_id,
      points_available: points.available,
      fungible_count: fungible_assets.length,
      item_total: non_fungible_items.total_count
    })

    return {
      user_id,
      points,
      fungible_assets,
      non_fungible_items,
      items_list,
      retrieved_at: new Date().toISOString()
    }
  }

  // ==================== 物品实例操作（统一资产域入口） ====================

  /**
   * 铸造物品实例（抽奖/发放/管理员赠送）
   *
   * 业务规则：
   * - 通过 source_type + source_id 实现幂等性控制
   * - 必须记录铸造事件到 item_instance_events 表
   * - 支持外部事务传入
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 目标用户ID（物品所有者）
   * @param {string} params.item_type - 物品类型（voucher/product/service/equipment/card）
   * @param {string} params.source_type - 来源类型（lottery/gift/admin/purchase）
   * @param {string} params.source_id - 来源ID（幂等关联，如 lottery_session_id）
   * @param {Object} params.meta - 物品元数据（name/description/icon/value/attributes等）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} 创建的物品实例对象
   */
  static async mintItem(params, options = {}) {
    const { user_id, item_type, source_type, source_id, meta = {} } = params
    const { transaction: externalTransaction } = options

    // 参数验证
    if (!user_id) {
      throw new Error('user_id 是必填参数')
    }
    if (!item_type) {
      throw new Error('item_type 是必填参数')
    }
    if (!source_type || !source_id) {
      throw new Error('source_type 和 source_id 是必填参数（幂等性控制）')
    }

    // 动态引入模型（避免循环依赖）
    const { ItemInstance, ItemInstanceEvent } = require('../models')

    const transaction = externalTransaction || (await sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      /*
       * 幂等性检查：通过 item_instance_events 表的 business_type + business_id 检查
       * 注意：实际项目中建议在数据库层添加 source_type + source_id 的唯一约束
       */
      const existingEvent = await ItemInstanceEvent.findOne({
        where: {
          event_type: 'mint',
          business_type: source_type,
          business_id: source_id
        },
        transaction
      })

      if (existingEvent) {
        logger.info('⚠️ 幂等性检查：物品已铸造，返回原结果', {
          source_type,
          source_id,
          event_id: existingEvent.event_id
        })

        // 获取已存在的物品实例
        const existingInstance = await ItemInstance.findByPk(existingEvent.item_instance_id, {
          transaction
        })

        if (shouldCommit) {
          await transaction.commit()
        }

        return {
          item_instance: existingInstance,
          is_duplicate: true
        }
      }

      // 创建物品实例
      const item_instance = await ItemInstance.create(
        {
          owner_user_id: user_id,
          item_type,
          status: 'available',
          meta
        },
        { transaction }
      )

      // 记录铸造事件
      await ItemInstanceEvent.recordEvent(
        {
          item_instance_id: item_instance.item_instance_id,
          event_type: 'mint',
          operator_user_id: null,
          operator_type: 'system',
          status_before: null,
          status_after: 'available',
          owner_before: null,
          owner_after: user_id,
          business_type: source_type,
          business_id: source_id,
          meta: { source_type, source_id, ...meta }
        },
        { transaction }
      )

      logger.info('✅ 物品铸造成功', {
        item_instance_id: item_instance.item_instance_id,
        user_id,
        item_type,
        source_type,
        source_id
      })

      if (shouldCommit) {
        await transaction.commit()
      }

      return {
        item_instance,
        is_duplicate: false
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('❌ 物品铸造失败', {
        user_id,
        item_type,
        source_type,
        source_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 锁定物品实例（交易/核销下单）
   *
   * 业务规则：
   * - 只能锁定 available 状态的物品
   * - 锁定超时时间为 3 分钟
   * - 如果物品已锁定但超时，自动释放后重新锁定
   * - 必须记录锁定事件到 item_instance_events 表
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_instance_id - 物品实例ID
   * @param {string} params.locked_by_order_id - 锁定订单ID
   * @param {string} params.business_type - 业务类型（market_listing/trade_order/redemption_order）
   * @param {Object} params.meta - 锁定元数据
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} 锁定后的物品实例
   */
  static async lockItem(params, options = {}) {
    const { item_instance_id, locked_by_order_id, business_type, meta = {} } = params
    const { transaction: externalTransaction } = options

    if (!item_instance_id) {
      throw new Error('item_instance_id 是必填参数')
    }
    if (!locked_by_order_id) {
      throw new Error('locked_by_order_id 是必填参数')
    }

    const { ItemInstance, ItemInstanceEvent } = require('../models')

    const transaction = externalTransaction || (await sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      // 获取物品实例（加行锁）
      const item_instance = await ItemInstance.findByPk(item_instance_id, {
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!item_instance) {
        throw new Error(`物品实例不存在：item_instance_id=${item_instance_id}`)
      }

      // 检查物品状态
      if (item_instance.status === 'locked') {
        // 检查是否超时
        if (item_instance.isLockTimeout()) {
          logger.warn('⚠️ 检测到超时锁，自动释放后重新锁定', {
            item_instance_id,
            old_order_id: item_instance.locked_by_order_id
          })
          // 超时锁会在下面的 lock() 方法中自动释放
        } else {
          throw new Error(`物品已被订单 ${item_instance.locked_by_order_id} 锁定`)
        }
      } else if (item_instance.status !== 'available') {
        throw new Error(`物品状态不可锁定：${item_instance.status}`)
      }

      const status_before = item_instance.status

      // 执行锁定
      await item_instance.lock(locked_by_order_id, { transaction })

      // 记录锁定事件
      await ItemInstanceEvent.recordEvent(
        {
          item_instance_id,
          event_type: 'lock',
          operator_user_id: null,
          operator_type: 'system',
          status_before,
          status_after: 'locked',
          business_type: business_type || 'item_lock',
          business_id: locked_by_order_id,
          meta: { locked_by_order_id, ...meta }
        },
        { transaction }
      )

      logger.info('✅ 物品锁定成功', {
        item_instance_id,
        locked_by_order_id,
        business_type
      })

      if (shouldCommit) {
        await transaction.commit()
      }

      await item_instance.reload({ transaction: externalTransaction })

      return item_instance
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('❌ 物品锁定失败', {
        item_instance_id,
        locked_by_order_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 解锁物品实例（订单取消/超时解锁）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_instance_id - 物品实例ID
   * @param {string} params.business_type - 业务类型
   * @param {string} params.business_id - 业务ID
   * @param {Object} params.meta - 解锁元数据
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} 解锁后的物品实例
   */
  static async unlockItem(params, options = {}) {
    const { item_instance_id, business_type, business_id, meta = {} } = params
    const { transaction: externalTransaction } = options

    if (!item_instance_id) {
      throw new Error('item_instance_id 是必填参数')
    }

    const { ItemInstance, ItemInstanceEvent } = require('../models')

    const transaction = externalTransaction || (await sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      const item_instance = await ItemInstance.findByPk(item_instance_id, {
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!item_instance) {
        throw new Error(`物品实例不存在：item_instance_id=${item_instance_id}`)
      }

      if (item_instance.status !== 'locked') {
        throw new Error(`物品状态不是 locked，无法解锁：${item_instance.status}`)
      }

      const old_order_id = item_instance.locked_by_order_id

      // 执行解锁
      await item_instance.unlock({ transaction })

      // 记录解锁事件
      await ItemInstanceEvent.recordEvent(
        {
          item_instance_id,
          event_type: 'unlock',
          operator_user_id: null,
          operator_type: 'system',
          status_before: 'locked',
          status_after: 'available',
          business_type: business_type || 'item_unlock',
          business_id: business_id || old_order_id,
          meta: { previous_order_id: old_order_id, ...meta }
        },
        { transaction }
      )

      logger.info('✅ 物品解锁成功', {
        item_instance_id,
        previous_order_id: old_order_id
      })

      if (shouldCommit) {
        await transaction.commit()
      }

      await item_instance.reload({ transaction: externalTransaction })

      return item_instance
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('❌ 物品解锁失败', {
        item_instance_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 转移物品所有权（交易成交）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_instance_id - 物品实例ID
   * @param {number} params.new_owner_id - 新所有者用户ID
   * @param {string} params.business_type - 业务类型（market_transfer/gift_transfer）
   * @param {string} params.business_id - 业务ID（订单ID）
   * @param {Object} params.meta - 转移元数据
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} 转移后的物品实例
   */
  static async transferItem(params, options = {}) {
    const { item_instance_id, new_owner_id, business_type, business_id, meta = {} } = params
    const { transaction: externalTransaction } = options

    if (!item_instance_id) {
      throw new Error('item_instance_id 是必填参数')
    }
    if (!new_owner_id) {
      throw new Error('new_owner_id 是必填参数')
    }
    if (!business_id) {
      throw new Error('business_id 是必填参数（幂等性控制）')
    }

    const { ItemInstance, ItemInstanceEvent } = require('../models')

    const transaction = externalTransaction || (await sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      // 幂等性检查
      const existingEvent = await ItemInstanceEvent.findOne({
        where: {
          item_instance_id,
          event_type: 'transfer',
          business_id
        },
        transaction
      })

      if (existingEvent) {
        logger.info('⚠️ 幂等性检查：物品转移已存在，返回原结果', {
          item_instance_id,
          business_id,
          event_id: existingEvent.event_id
        })

        const existingInstance = await ItemInstance.findByPk(item_instance_id, { transaction })

        if (shouldCommit) {
          await transaction.commit()
        }

        return {
          item_instance: existingInstance,
          is_duplicate: true
        }
      }

      const item_instance = await ItemInstance.findByPk(item_instance_id, {
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!item_instance) {
        throw new Error(`物品实例不存在：item_instance_id=${item_instance_id}`)
      }

      if (!['available', 'locked'].includes(item_instance.status)) {
        throw new Error(`物品状态不可转移：${item_instance.status}`)
      }

      const old_owner_id = item_instance.owner_user_id

      // 执行转移
      await item_instance.transferOwnership(new_owner_id, { transaction })

      // 记录转移事件
      await ItemInstanceEvent.recordEvent(
        {
          item_instance_id,
          event_type: 'transfer',
          operator_user_id: new_owner_id,
          operator_type: 'user',
          status_before: 'locked',
          status_after: 'transferred',
          owner_before: old_owner_id,
          owner_after: new_owner_id,
          business_type: business_type || 'item_transfer',
          business_id,
          meta: { from_user: old_owner_id, to_user: new_owner_id, ...meta }
        },
        { transaction }
      )

      logger.info('✅ 物品转移成功', {
        item_instance_id,
        from_user: old_owner_id,
        to_user: new_owner_id,
        business_id
      })

      if (shouldCommit) {
        await transaction.commit()
      }

      await item_instance.reload({ transaction: externalTransaction })

      return {
        item_instance,
        is_duplicate: false
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('❌ 物品转移失败', {
        item_instance_id,
        new_owner_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 消耗物品实例（核销/使用）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_instance_id - 物品实例ID
   * @param {number} params.operator_user_id - 操作者用户ID
   * @param {string} params.business_type - 业务类型（redemption_use/item_use）
   * @param {string} params.business_id - 业务ID（订单ID）
   * @param {Object} params.meta - 消耗元数据
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} 消耗后的物品实例
   */
  static async consumeItem(params, options = {}) {
    const { item_instance_id, operator_user_id, business_type, business_id, meta = {} } = params
    const { transaction: externalTransaction } = options

    if (!item_instance_id) {
      throw new Error('item_instance_id 是必填参数')
    }
    if (!business_id) {
      throw new Error('business_id 是必填参数（幂等性控制）')
    }

    const { ItemInstance, ItemInstanceEvent } = require('../models')

    const transaction = externalTransaction || (await sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      // 幂等性检查
      const existingEvent = await ItemInstanceEvent.findOne({
        where: {
          item_instance_id,
          event_type: 'use',
          business_id
        },
        transaction
      })

      if (existingEvent) {
        logger.info('⚠️ 幂等性检查：物品消耗已存在，返回原结果', {
          item_instance_id,
          business_id,
          event_id: existingEvent.event_id
        })

        const existingInstance = await ItemInstance.findByPk(item_instance_id, { transaction })

        if (shouldCommit) {
          await transaction.commit()
        }

        return {
          item_instance: existingInstance,
          is_duplicate: true
        }
      }

      const item_instance = await ItemInstance.findByPk(item_instance_id, {
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!item_instance) {
        throw new Error(`物品实例不存在：item_instance_id=${item_instance_id}`)
      }

      if (!['available', 'locked'].includes(item_instance.status)) {
        throw new Error(`物品状态不可消耗：${item_instance.status}`)
      }

      const status_before = item_instance.status

      // 执行消耗
      await item_instance.markAsUsed({ transaction })

      // 记录消耗事件
      await ItemInstanceEvent.recordEvent(
        {
          item_instance_id,
          event_type: 'use',
          operator_user_id: operator_user_id || null,
          operator_type: operator_user_id ? 'user' : 'system',
          status_before,
          status_after: 'used',
          business_type: business_type || 'item_consume',
          business_id,
          meta: { operator_user_id, ...meta }
        },
        { transaction }
      )

      logger.info('✅ 物品消耗成功', {
        item_instance_id,
        operator_user_id,
        business_id
      })

      if (shouldCommit) {
        await transaction.commit()
      }

      await item_instance.reload({ transaction: externalTransaction })

      return {
        item_instance,
        is_duplicate: false
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('❌ 物品消耗失败', {
        item_instance_id,
        operator_user_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 记录物品事件（统一入口）
   *
   * @param {Object} params - 事件参数
   * @param {number} params.item_instance_id - 物品实例ID
   * @param {string} params.event_type - 事件类型（mint/lock/unlock/transfer/use/expire/destroy）
   * @param {number|null} params.operator_user_id - 操作者用户ID
   * @param {string} params.operator_type - 操作者类型（user/admin/system）
   * @param {string|null} params.status_before - 变更前状态
   * @param {string|null} params.status_after - 变更后状态
   * @param {number|null} params.owner_before - 变更前所有者
   * @param {number|null} params.owner_after - 变更后所有者
   * @param {string|null} params.business_type - 业务类型
   * @param {string|null} params.business_id - 业务ID
   * @param {Object|null} params.meta - 事件元数据
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} 创建的事件记录
   */
  static async recordItemEvent(params, options = {}) {
    const { ItemInstanceEvent } = require('../models')
    return await ItemInstanceEvent.recordEvent(params, options)
  }

  /**
   * 获取物品事件历史
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_instance_id - 物品实例ID（可选）
   * @param {number} params.user_id - 用户ID（可选，查询用户相关的所有物品事件）
   * @param {Array<string>} params.event_types - 事件类型过滤（可选）
   * @param {number} params.page - 页码（默认1）
   * @param {number} params.limit - 每页数量（默认20）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} 事件列表和分页信息
   */
  static async getItemEvents(params, options = {}) {
    const { item_instance_id, user_id, event_types, page = 1, limit = 20 } = params
    const { transaction } = options

    const { ItemInstanceEvent, ItemInstance } = require('../models')
    const { Op } = require('sequelize')

    // 构建查询条件
    const where = {}

    if (item_instance_id) {
      where.item_instance_id = item_instance_id
    }

    if (event_types && event_types.length > 0) {
      where.event_type = { [Op.in]: event_types }
    }

    // 如果指定用户ID，需要 JOIN item_instances 表
    const include = []
    if (user_id) {
      include.push({
        model: ItemInstance,
        as: 'item_instance',
        where: { owner_user_id: user_id },
        attributes: ['item_instance_id', 'owner_user_id', 'item_type', 'status']
      })
    }

    const { count, rows } = await ItemInstanceEvent.findAndCountAll({
      where,
      include,
      limit,
      offset: (page - 1) * limit,
      order: [['created_at', 'DESC']],
      transaction
    })

    return {
      events: rows,
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit)
    }
  }
}

module.exports = AssetService
