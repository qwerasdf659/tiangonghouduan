/**
 * 统一资产服务 - AssetService（升级版：支持账户体系 + 冻结模型）
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
 * - 所有资产变动支持幂等性控制（business_id + business_type）
 * - 余额不足时直接抛出异常，不允许负余额
 * - 记录变动前后余额用于完整对账（before + delta = after）
 * - 冻结模型：交易市场购买和资产挂牌必须走冻结→结算链路
 *
 * 命名规范（snake_case）：
 * - 所有方法、参数、字段使用snake_case
 * - 符合项目统一命名规范
 *
 * 创建时间：2025-12-15
 * 升级时间：2025-12-15（Phase 1-4：支持账户体系 + 冻结模型）
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
   * 改变可用余额（核心方法）
   *
   * 业务规则：
   * - 支持幂等性控制（business_id + business_type唯一约束）
   * - 扣减时必须验证可用余额充足
   * - 记录变动前后余额用于完整对账（before + delta = after）
   * - 支持外部事务传入
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（用户账户）
   * @param {string} params.system_code - 系统账户代码（系统账户）
   * @param {string} params.asset_code - 资产代码
   * @param {number} params.delta_amount - 变动金额（正数=增加，负数=扣减）
   * @param {string} params.business_id - 业务唯一ID（幂等键，必填）
   * @param {string} params.business_type - 业务类型（必填）
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
      business_id,
      business_type,
      meta = {}
    } = params
    const { transaction: externalTransaction } = options

    // 参数验证
    if (!business_id) {
      throw new Error('business_id是必填参数（幂等性控制）')
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
        where: {
          business_id,
          business_type
        },
        transaction
      })

      if (existingTransaction) {
        logger.info('⚠️ 幂等性检查：资产变动已存在，返回原结果', {
          business_id,
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

      // 创建资产流水记录（包含account_id和balance_before）
      const transaction_record = await AssetTransaction.create(
        {
          account_id: account.account_id,
          user_id: user_id || null, // 兼容历史字段
          asset_code,
          delta_amount,
          balance_before,
          balance_after,
          business_id,
          business_type,
          meta
        },
        { transaction }
      )

      logger.info('✅ 资产变动成功', {
        account_id: account.account_id,
        user_id,
        system_code,
        asset_code,
        delta_amount,
        balance_before,
        balance_after,
        business_id,
        business_type,
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
        business_id,
        business_type,
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
   * - 支持幂等性控制
   * - 记录冻结流水
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（用户账户）
   * @param {string} params.system_code - 系统账户代码（系统账户）
   * @param {string} params.asset_code - 资产代码
   * @param {number} params.amount - 冻结金额（必须为正数）
   * @param {string} params.business_id - 业务唯一ID（幂等键，必填）
   * @param {string} params.business_type - 业务类型（必填，如order_freeze_buyer）
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
      business_id,
      business_type,
      meta = {}
    } = params
    const { transaction: externalTransaction } = options

    // 参数验证
    if (!business_id) {
      throw new Error('business_id是必填参数（幂等性控制）')
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
        where: {
          business_id,
          business_type
        },
        transaction
      })

      if (existingTransaction) {
        logger.info('⚠️ 幂等性检查：冻结操作已存在，返回原结果', {
          business_id,
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
          user_id: user_id || null,
          asset_code,
          delta_amount: -amount, // 负数表示从available扣减
          balance_before: available_before,
          balance_after: available_after,
          business_id,
          business_type,
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
        user_id,
        system_code,
        asset_code,
        amount,
        available_before,
        available_after,
        frozen_before,
        frozen_after,
        business_id,
        business_type,
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
        business_id,
        business_type,
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
   * - 支持幂等性控制
   * - 记录解冻流水
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（用户账户）
   * @param {string} params.system_code - 系统账户代码（系统账户）
   * @param {string} params.asset_code - 资产代码
   * @param {number} params.amount - 解冻金额（必须为正数）
   * @param {string} params.business_id - 业务唯一ID（幂等键，必填）
   * @param {string} params.business_type - 业务类型（必填，如order_unfreeze_buyer）
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
      business_id,
      business_type,
      meta = {}
    } = params
    const { transaction: externalTransaction } = options

    // 参数验证
    if (!business_id) {
      throw new Error('business_id是必填参数（幂等性控制）')
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
        where: {
          business_id,
          business_type
        },
        transaction
      })

      if (existingTransaction) {
        logger.info('⚠️ 幂等性检查：解冻操作已存在，返回原结果', {
          business_id,
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
          user_id: user_id || null,
          asset_code,
          delta_amount: amount, // 正数表示增加到available
          balance_before: available_before,
          balance_after: available_after,
          business_id,
          business_type,
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
        user_id,
        system_code,
        asset_code,
        amount,
        available_before,
        available_after,
        frozen_before,
        frozen_after,
        business_id,
        business_type,
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
        business_id,
        business_type,
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
   * - 支持幂等性控制
   * - 记录结算流水
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（用户账户）
   * @param {string} params.system_code - 系统账户代码（系统账户）
   * @param {string} params.asset_code - 资产代码
   * @param {number} params.amount - 结算金额（必须为正数）
   * @param {string} params.business_id - 业务唯一ID（幂等键，必填）
   * @param {string} params.business_type - 业务类型（必填，如order_settle_buyer_debit）
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
      business_id,
      business_type,
      meta = {}
    } = params
    const { transaction: externalTransaction } = options

    // 参数验证
    if (!business_id) {
      throw new Error('business_id是必填参数（幂等性控制）')
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
        where: {
          business_id,
          business_type
        },
        transaction
      })

      if (existingTransaction) {
        logger.info('⚠️ 幂等性检查：结算操作已存在，返回原结果', {
          business_id,
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
          user_id: user_id || null,
          asset_code,
          delta_amount: 0, // available不变
          balance_before: available_before,
          balance_after: available_after,
          business_id,
          business_type,
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
        user_id,
        system_code,
        asset_code,
        amount,
        available_before,
        available_after,
        frozen_before,
        frozen_after,
        business_id,
        business_type,
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
        business_id,
        business_type,
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
}

module.exports = AssetService
