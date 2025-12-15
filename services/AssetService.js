/**
 * 统一资产服务 - AssetService
 * 管理DIAMOND和材料资产的核心服务
 *
 * 业务场景：
 * - 交易市场DIAMOND结算（买家扣减、卖家入账、平台手续费）
 * - 兑换市场材料资产扣减（兑换商品消耗材料）
 * - 材料转换（碎红水晶→DIAMOND）
 * - 管理员资产调整
 *
 * 核心能力：
 * - getOrCreateAccount: 获取或创建资产账户
 * - changeBalance: 改变资产余额（支持幂等性、事务保护）
 * - assertSufficient: 验证余额是否充足
 * - getBalance: 获取余额
 * - getTransactions: 获取流水记录
 *
 * 设计原则：
 * - 所有资产操作支持外部事务传入
 * - 所有资产变动支持幂等性控制（business_id + business_type）
 * - 余额不足时直接抛出异常，不允许负余额
 * - 记录变动后余额用于快速对账
 *
 * 命名规范（snake_case）：
 * - 所有方法、参数、字段使用snake_case
 * - 符合项目统一命名规范
 *
 * 创建时间：2025-12-15
 */

'use strict'

const { UserAssetAccount, AssetTransaction, User } = require('../models')
const { sequelize } = require('../config/database')
const BeijingTimeHelper = require('../utils/timeHelper')
const logger = require('../utils/logger')

/**
 * 资产服务类
 * 负责所有资产相关的业务逻辑
 */
class AssetService {
  /**
   * 获取或创建资产账户
   *
   * @param {number} user_id - 用户ID
   * @param {string} asset_code - 资产代码（如DIAMOND、red_shard）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} 资产账户对象
   */
  static async getOrCreateAccount (user_id, asset_code, options = {}) {
    const { transaction } = options

    // 验证用户是否存在
    const user = await User.findByPk(user_id, { transaction })
    if (!user) {
      throw new Error(`用户不存在：user_id=${user_id}`)
    }

    // 查找或创建资产账户（使用findOrCreate确保原子性）
    const [account, created] = await UserAssetAccount.findOrCreate({
      where: {
        user_id,
        asset_code
      },
      defaults: {
        user_id,
        asset_code,
        available_amount: 0
      },
      transaction
    })

    if (created) {
      logger.info('✅ 创建新资产账户', {
        user_id,
        asset_code,
        asset_account_id: account.asset_account_id
      })
    }

    return account
  }

  /**
   * 改变资产余额（核心方法）
   *
   * 业务规则：
   * - 支持幂等性控制（business_id + business_type唯一约束）
   * - 扣减时必须验证余额充足
   * - 记录变动后余额用于对账
   * - 支持外部事务传入
   *
   * @param {number} user_id - 用户ID
   * @param {string} asset_code - 资产代码
   * @param {number} delta_amount - 变动金额（正数=增加，负数=扣减）
   * @param {Object} options - 选项
   * @param {string} options.business_id - 业务唯一ID（幂等键，必填）
   * @param {string} options.business_type - 业务类型（必填）
   * @param {Object} options.meta - 扩展信息（可选）
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<Object>} 结果对象 {account, transaction_record, is_duplicate}
   */
  static async changeBalance (user_id, asset_code, delta_amount, options = {}) {
    const { business_id, business_type, meta = {}, transaction: externalTransaction } = options

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

        // 获取当前账户状态
        const account = await this.getOrCreateAccount(user_id, asset_code, { transaction })

        if (shouldCommit) {
          await transaction.commit()
        }

        return {
          account,
          transaction_record: existingTransaction,
          is_duplicate: true
        }
      }

      // 获取或创建资产账户（加行级锁）
      const account = await UserAssetAccount.findOne({
        where: {
          user_id,
          asset_code
        },
        lock: transaction.LOCK.UPDATE, // 行级锁，防止并发问题
        transaction
      })

      let finalAccount
      if (!account) {
        // 账户不存在，创建新账户
        if (delta_amount < 0) {
          throw new Error(`余额不足：账户不存在且尝试扣减${Math.abs(delta_amount)}个${asset_code}`)
        }
        finalAccount = await this.getOrCreateAccount(user_id, asset_code, { transaction })
      } else {
        finalAccount = account
      }

      // 验证余额充足（扣减时）
      if (delta_amount < 0) {
        const required_amount = Math.abs(delta_amount)
        if (finalAccount.available_amount < required_amount) {
          throw new Error(
            `余额不足：当前余额${finalAccount.available_amount}个${asset_code}，需要${required_amount}个，差额${required_amount - finalAccount.available_amount}个`
          )
        }
      }

      // 计算变动后余额
      const balance_after = Number(finalAccount.available_amount) + Number(delta_amount)

      // 验证变动后余额不为负数（double check）
      if (balance_after < 0) {
        throw new Error(
          `变动后余额不能为负数：当前${finalAccount.available_amount} + 变动${delta_amount} = ${balance_after}`
        )
      }

      // 更新账户余额
      await finalAccount.update(
        {
          available_amount: balance_after
        },
        { transaction }
      )

      // 创建资产流水记录
      const transaction_record = await AssetTransaction.create(
        {
          user_id,
          asset_code,
          delta_amount,
          balance_after,
          business_id,
          business_type,
          meta
        },
        { transaction }
      )

      logger.info('✅ 资产变动成功', {
        user_id,
        asset_code,
        delta_amount,
        balance_after,
        business_id,
        business_type,
        transaction_id: transaction_record.transaction_id
      })

      if (shouldCommit) {
        await transaction.commit()
      }

      // 刷新账户数据
      await finalAccount.reload({ transaction: externalTransaction })

      return {
        account: finalAccount,
        transaction_record,
        is_duplicate: false
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      logger.error('❌ 资产变动失败', {
        user_id,
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
   * 验证余额是否充足
   *
   * @param {number} user_id - 用户ID
   * @param {string} asset_code - 资产代码
   * @param {number} amount - 需要的金额
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<boolean>} 是否充足
   * @throws {Error} 余额不足时抛出异常
   */
  static async assertSufficient (user_id, asset_code, amount, options = {}) {
    const { transaction } = options

    const account = await UserAssetAccount.findOne({
      where: {
        user_id,
        asset_code
      },
      transaction
    })

    if (!account || account.available_amount < amount) {
      const current_amount = account ? account.available_amount : 0
      throw new Error(
        `余额不足：需要${amount}个${asset_code}，当前余额${current_amount}个，差额${amount - current_amount}个`
      )
    }

    return true
  }

  /**
   * 获取资产余额
   *
   * @param {number} user_id - 用户ID
   * @param {string} asset_code - 资产代码
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<number>} 余额数量
   */
  static async getBalance (user_id, asset_code, options = {}) {
    const { transaction } = options

    const account = await UserAssetAccount.findOne({
      where: {
        user_id,
        asset_code
      },
      transaction
    })

    return account ? Number(account.available_amount) : 0
  }

  /**
   * 获取用户所有资产账户
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<Array>} 资产账户列表
   */
  static async getAllAccounts (user_id, options = {}) {
    const { transaction } = options

    return await UserAssetAccount.findAll({
      where: {
        user_id
      },
      transaction,
      order: [['asset_code', 'ASC']]
    })
  }

  /**
   * 获取资产流水记录
   *
   * @param {number} user_id - 用户ID
   * @param {Object} filters - 筛选条件
   * @param {string} filters.asset_code - 资产代码（可选）
   * @param {string} filters.business_type - 业务类型（可选）
   * @param {number} filters.page - 页码（默认1）
   * @param {number} filters.page_size - 每页数量（默认20）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<Object>} 流水记录列表和分页信息
   */
  static async getTransactions (user_id, filters = {}, options = {}) {
    const { asset_code, business_type, page = 1, page_size = 20 } = filters
    const { transaction } = options

    const where = { user_id }

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
