/**
 * 余额操作服务 - AssetService 拆分子服务
 *
 * @description 处理所有账户和余额相关操作（从 AssetService 提取）
 * @module services/asset/BalanceService
 * @version 1.1.0
 * @date 2026-02-23
 *
 * 职责范围：
 * - 账户创建/查询：getOrCreateAccount
 * - 余额管理：getOrCreateBalance, changeBalance
 * - 冻结管理：freeze, unfreeze, settleFromFrozen（V1.1.0 接入双录记账）
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
 *
 * V1.1.0 双录变更（2026-02-23）：
 * - freeze/unfreeze 自动在 SYSTEM_ESCROW 账户写反向流水，保证全局 SUM(delta_amount)=0
 * - settleFromFrozen 的 delta_amount=0，仅记录 counterpart_account_id 用于审计追踪
 * - 所有冻结/解冻操作记录 counterpart_account_id，支持完整的对手方追溯
 */

'use strict'

const crypto = require('crypto')
const { Account, AccountAssetBalance, AssetTransaction, User } = require('../../models')
const logger = require('../../utils/logger')
const OrderNoGenerator = require('../../utils/OrderNoGenerator')
const { requireTransaction } = require('../../utils/transactionHelpers')

/**
 * 资产流水创建时占位 transaction_no（迁移后列 NOT NULL，写入后用主键生成正式 TX 号）
 * @returns {string} 占位字符串
 */
function assetTransactionNoPlaceholder() {
  return `PH${crypto.randomBytes(12).toString('hex').toUpperCase()}`
}

/**
 * 资产余额安全上限（10亿）
 *
 * 防止测试/误操作写入 BIGINT MAX 等极端值污染统计数据。
 * 单笔变动和变动后余额均不得超过此值。
 * 如业务需要调整，修改此常量即可。
 *
 * @constant {number}
 */
const BALANCE_SAFETY_LIMIT = 1_000_000_000

/**
 * 余额操作服务类
 *
 * @class BalanceService
 * @description 处理账户余额相关的所有操作，是资产服务的核心基础层
 */
class BalanceService {
  /**
   * 用主键与创建时间生成统一 TX 流水号并写回（编码规则统一方案）
   *
   * @param {Object} row - AssetTransaction 实例（Sequelize Model）
   * @param {Object} transaction - 当前 Sequelize 事务
   * @returns {Promise<Object>} 刷新后的流水记录
   */
  static async finalizeAssetTransactionNo(row, transaction) {
    await row.reload({ transaction })
    await row.update(
      {
        transaction_no: OrderNoGenerator.generate(
          'TX',
          row.asset_transaction_id,
          row.createdAt || row.created_at
        )
      },
      { transaction }
    )
    await row.reload({ transaction })
    return row
  }

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

    // BUDGET_POINTS 按活动隔离（lottery_campaign_id 隔离规则）
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

    // BUDGET_POINTS 需要记录 lottery_campaign_id（活动隔离）
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
      counterpart_account_id,
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

    // 🛡️ 单笔变动金额安全上限校验（防止测试数据污染）
    if (Math.abs(delta_amount) > BALANCE_SAFETY_LIMIT) {
      throw new Error(
        `单笔变动金额超出安全上限：|${delta_amount}| > ${BALANCE_SAFETY_LIMIT}（10亿），如确需大额操作请联系管理员调整 BALANCE_SAFETY_LIMIT`
      )
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
        if (Number(finalBalance.available_amount) < Number(required_amount)) {
          throw new Error(
            `可用余额不足：当前可用余额${finalBalance.available_amount}个${asset_code}，需要${required_amount}个，差额${required_amount - Number(finalBalance.available_amount)}个`
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

      // 🛡️ 验证变动后余额不超过安全上限（防止测试数据/溢出污染统计）
      if (balance_after > BALANCE_SAFETY_LIMIT) {
        throw new Error(
          `变动后余额超出安全上限：${balance_before} + ${delta_amount} = ${balance_after} > ${BALANCE_SAFETY_LIMIT}（10亿）`
        )
      }

      // 更新可用余额
      await finalBalance.update(
        {
          available_amount: balance_after
        },
        { transaction }
      )

      // 创建资产流水记录（方案B：使用 idempotency_key + 双录对手方）
      const transaction_record = await AssetTransaction.create(
        {
          account_id: account.account_id,
          counterpart_account_id: counterpart_account_id || null,
          asset_code,
          delta_amount,
          balance_before,
          balance_after,
          business_type,
          lottery_session_id: lottery_session_id || null,
          idempotency_key,
          transaction_no: assetTransactionNoPlaceholder(),
          meta: {
            ...meta,
            lottery_campaign_id: lottery_campaign_id || null,
            counterpart_account_id: params.counterpart_account_id || null
          }
        },
        { transaction }
      )
      await BalanceService.finalizeAssetTransactionNo(transaction_record, transaction)

      /*
       * 双录记账：写入对手方反向流水（V4.2.0 → V4.8.0 全覆盖升级）
       *
       * 规则：对所有提供 counterpart_account_id 的操作创建 counterpart 反向记录
       * - 用户↔系统操作（抽奖、充值、兑换等）：创建 counterpart 使全局 SUM=0
       * - 用户↔用户操作（交易结算）：同样创建 counterpart，保证全局 SUM(delta_amount)=0
       *
       * V4.8.0 修复：移除 account_type === 'system' 限制
       * 原因：trade settlement 中的 seller_credit/platform_fee_credit/buyer_offer_credit
       *       因 counterpart 是 user 账户而跳过了反向流水，导致全局 SUM ≠ 0
       */
      if (params.counterpart_account_id) {
        const counterpartIdempotencyKey = `${idempotency_key}:counterpart`
        const existingCounterpart = await AssetTransaction.findOne({
          where: { idempotency_key: counterpartIdempotencyKey },
          transaction
        })

        if (!existingCounterpart) {
          const counterpart_row = await AssetTransaction.create(
            {
              account_id: params.counterpart_account_id,
              counterpart_account_id: account.account_id,
              asset_code,
              delta_amount: -delta_amount,
              balance_before: 0,
              balance_after: 0,
              business_type: `${business_type}_counterpart`,
              lottery_session_id: lottery_session_id || null,
              idempotency_key: counterpartIdempotencyKey,
              transaction_no: assetTransactionNoPlaceholder(),
              meta: {
                counterpart_of: idempotency_key,
                original_account_id: account.account_id,
                lottery_campaign_id: lottery_campaign_id || null
              }
            },
            { transaction }
          )
          await BalanceService.finalizeAssetTransactionNo(counterpart_row, transaction)
        }
      }

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
        asset_transaction_id: transaction_record.asset_transaction_id,
        double_entry: !!params.counterpart_account_id
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
   * - 【V1.1.0】自动在 SYSTEM_ESCROW 写反向 counterpart 流水（保证全局 SUM(delta_amount)=0）
   *
   * 双录设计（冻结 = 账户内 available→frozen 状态变更）：
   * - 主记录：用户账户 delta_amount = -amount（可用余额减少）
   * - 对手方：SYSTEM_ESCROW delta_amount = +amount（托管概念上"接收"冻结资金）
   * - 解冻或结算时写反向记录抵消，保证 SYSTEM_ESCROW 最终余额为 0
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

    // 🛡️ 冻结金额安全上限校验
    if (amount > BALANCE_SAFETY_LIMIT) {
      throw new Error(`冻结金额超出安全上限：${amount} > ${BALANCE_SAFETY_LIMIT}（10亿）`)
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

      // 验证可用余额充足（BIGINT 返回字符串，必须 Number() 转换防止字典序比较）
      if (Number(balance.available_amount) < Number(amount)) {
        throw new Error(
          `可用余额不足：当前可用余额${balance.available_amount}个${asset_code}，需要冻结${amount}个，差额${Number(amount) - Number(balance.available_amount)}个`
        )
      }

      // 记录变动前余额
      const available_before = Number(balance.available_amount)
      const frozen_before = Number(balance.frozen_amount)

      // 计算变动后余额（🔒 强制 Number() 转换，防止 BIGINT 字符串拼接）
      const numericAmount = Number(amount)
      const available_after = available_before - numericAmount
      const frozen_after = frozen_before + numericAmount

      // 更新余额（available减少，frozen增加）
      await balance.update(
        {
          available_amount: available_after,
          frozen_amount: frozen_after
        },
        { transaction }
      )

      // 获取 SYSTEM_ESCROW 账户（双录对手方）
      const escrowAccount = await this.getOrCreateAccount(
        { system_code: 'SYSTEM_ESCROW' },
        { transaction }
      )

      // 创建冻结流水记录（主记录，含对手方标记）
      const transaction_record = await AssetTransaction.create(
        {
          account_id: account.account_id,
          counterpart_account_id: escrowAccount.account_id,
          asset_code,
          delta_amount: -numericAmount,
          balance_before: available_before,
          balance_after: available_after,
          frozen_amount_change: numericAmount,
          business_type,
          lottery_session_id: null,
          idempotency_key,
          transaction_no: assetTransactionNoPlaceholder(),
          meta: {
            ...meta,
            freeze_amount: numericAmount,
            frozen_before,
            frozen_after
          }
        },
        { transaction }
      )
      await BalanceService.finalizeAssetTransactionNo(transaction_record, transaction)

      // 双录记账：在 SYSTEM_ESCROW 写反向流水（delta = +amount，对冲主记录的 -amount）
      const counterpartIdempotencyKey = `${idempotency_key}:escrow_counterpart`
      const existingCounterpart = await AssetTransaction.findOne({
        where: { idempotency_key: counterpartIdempotencyKey },
        transaction
      })
      if (!existingCounterpart) {
        const escrow_row = await AssetTransaction.create(
          {
            account_id: escrowAccount.account_id,
            counterpart_account_id: account.account_id,
            asset_code,
            delta_amount: numericAmount,
            balance_before: 0,
            balance_after: 0,
            frozen_amount_change: 0,
            business_type: `${business_type}_counterpart`,
            lottery_session_id: null,
            idempotency_key: counterpartIdempotencyKey,
            transaction_no: assetTransactionNoPlaceholder(),
            meta: {
              counterpart_of: idempotency_key,
              original_account_id: account.account_id,
              operation: 'freeze'
            }
          },
          { transaction }
        )
        await BalanceService.finalizeAssetTransactionNo(escrow_row, transaction)
      }

      logger.info('✅ 资产冻结成功（双录）', {
        service: 'BalanceService',
        method: 'freeze',
        account_id: account.account_id,
        counterpart_account_id: escrowAccount.account_id,
        system_code,
        asset_code,
        amount,
        available_before,
        available_after,
        frozen_before,
        frozen_after,
        business_type,
        idempotency_key,
        asset_transaction_id: transaction_record.asset_transaction_id,
        double_entry: true
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
   * - 【V1.1.0】自动在 SYSTEM_ESCROW 写反向 counterpart 流水（抵消冻结时的 counterpart）
   *
   * 双录设计（解冻 = 冻结的反向操作）：
   * - 主记录：用户账户 delta_amount = +amount（可用余额恢复）
   * - 对手方：SYSTEM_ESCROW delta_amount = -amount（托管"释放"冻结资金）
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

    // 🛡️ 解冻金额安全上限校验
    if (amount > BALANCE_SAFETY_LIMIT) {
      throw new Error(`解冻金额超出安全上限：${amount} > ${BALANCE_SAFETY_LIMIT}（10亿）`)
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

      // 验证冻结余额充足（强制 Number() 防御 DECIMAL 字符串比较）
      const currentFrozen = Number(balance.frozen_amount)
      const unfreezeAmount = Number(amount)
      if (currentFrozen < unfreezeAmount) {
        throw new Error(
          `冻结余额不足：当前冻结余额${currentFrozen}个${asset_code}，需要解冻${unfreezeAmount}个，差额${unfreezeAmount - currentFrozen}个`
        )
      }

      // 记录变动前余额
      const available_before = Number(balance.available_amount)
      const frozen_before = Number(balance.frozen_amount)

      // 计算变动后余额（🔒 强制 Number() 转换，防止 BIGINT 字符串拼接）
      const numericAmount = Number(amount)
      const available_after = available_before + numericAmount
      const frozen_after = frozen_before - numericAmount

      // 更新余额（available增加，frozen减少）
      await balance.update(
        {
          available_amount: available_after,
          frozen_amount: frozen_after
        },
        { transaction }
      )

      // 获取 SYSTEM_ESCROW 账户（双录对手方）
      const escrowAccount = await this.getOrCreateAccount(
        { system_code: 'SYSTEM_ESCROW' },
        { transaction }
      )

      // 创建解冻流水记录（主记录，含对手方标记）
      const transaction_record = await AssetTransaction.create(
        {
          account_id: account.account_id,
          counterpart_account_id: escrowAccount.account_id,
          asset_code,
          delta_amount: numericAmount,
          balance_before: available_before,
          balance_after: available_after,
          frozen_amount_change: -numericAmount,
          business_type,
          lottery_session_id: null,
          idempotency_key,
          transaction_no: assetTransactionNoPlaceholder(),
          meta: {
            ...meta,
            unfreeze_amount: numericAmount,
            frozen_before,
            frozen_after
          }
        },
        { transaction }
      )
      await BalanceService.finalizeAssetTransactionNo(transaction_record, transaction)

      // 双录记账：在 SYSTEM_ESCROW 写反向流水（delta = -amount，抵消冻结时的 +amount）
      const counterpartIdempotencyKey = `${idempotency_key}:escrow_counterpart`
      const existingCounterpart = await AssetTransaction.findOne({
        where: { idempotency_key: counterpartIdempotencyKey },
        transaction
      })
      if (!existingCounterpart) {
        const escrow_un_row = await AssetTransaction.create(
          {
            account_id: escrowAccount.account_id,
            counterpart_account_id: account.account_id,
            asset_code,
            delta_amount: -numericAmount,
            balance_before: 0,
            balance_after: 0,
            frozen_amount_change: 0,
            business_type: `${business_type}_counterpart`,
            lottery_session_id: null,
            idempotency_key: counterpartIdempotencyKey,
            transaction_no: assetTransactionNoPlaceholder(),
            meta: {
              counterpart_of: idempotency_key,
              original_account_id: account.account_id,
              operation: 'unfreeze'
            }
          },
          { transaction }
        )
        await BalanceService.finalizeAssetTransactionNo(escrow_un_row, transaction)
      }

      logger.info('✅ 资产解冻成功（双录）', {
        service: 'BalanceService',
        method: 'unfreeze',
        account_id: account.account_id,
        counterpart_account_id: escrowAccount.account_id,
        system_code,
        asset_code,
        amount,
        available_before,
        available_after,
        frozen_before,
        frozen_after,
        business_type,
        idempotency_key,
        asset_transaction_id: transaction_record.asset_transaction_id,
        double_entry: true
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
   * - 【V1.1.0】记录 SYSTEM_ESCROW 为 counterpart_account_id（审计追踪）
   *
   * 双录设计（结算 = 冻结资金消耗，V4.8.0 完善）：
   * - 主记录：delta_amount = 0（可用余额不变），frozen_amount_change = -amount
   * - ESCROW counterpart：delta = -amount（对冲 freeze 时的 +amount，使 ESCROW 归零）
   * - 结算的"真实"对手方由同一事务中的 changeBalance（如卖家收款）处理
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

    // 🛡️ 结算金额安全上限校验
    if (amount > BALANCE_SAFETY_LIMIT) {
      throw new Error(`结算金额超出安全上限：${amount} > ${BALANCE_SAFETY_LIMIT}（10亿）`)
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

      // 验证冻结余额充足（BIGINT 返回字符串，必须 Number() 转换防止字典序比较）
      if (Number(balance.frozen_amount) < Number(amount)) {
        throw new Error(
          `冻结余额不足：当前冻结余额${balance.frozen_amount}个${asset_code}，需要结算${amount}个，差额${Number(amount) - Number(balance.frozen_amount)}个`
        )
      }

      // 记录变动前余额
      const available_before = Number(balance.available_amount)
      const frozen_before = Number(balance.frozen_amount)

      /*
       * 计算变动后余额（仅从frozen扣减，available不变）
       * 🔒 强制 Number() 转换，防止 BIGINT 字符串拼接
       */
      const numericAmount = Number(amount)
      const available_after = available_before
      const frozen_after = frozen_before - numericAmount

      // 更新余额（仅frozen减少）
      await balance.update(
        {
          frozen_amount: frozen_after
        },
        { transaction }
      )

      // 获取 SYSTEM_ESCROW 账户（审计追踪对手方）
      const escrowAccount = await this.getOrCreateAccount(
        { system_code: 'SYSTEM_ESCROW' },
        { transaction }
      )

      // 创建结算流水记录（delta_amount=0，仅记录 frozen_amount_change 和 counterpart 用于审计）
      const transaction_record = await AssetTransaction.create(
        {
          account_id: account.account_id,
          counterpart_account_id: escrowAccount.account_id,
          asset_code,
          delta_amount: 0,
          balance_before: available_before,
          balance_after: available_after,
          frozen_amount_change: -numericAmount,
          business_type,
          lottery_session_id: null,
          idempotency_key,
          transaction_no: assetTransactionNoPlaceholder(),
          meta: {
            ...meta,
            settle_amount: numericAmount,
            frozen_before,
            frozen_after
          }
        },
        { transaction }
      )
      await BalanceService.finalizeAssetTransactionNo(transaction_record, transaction)

      /*
       * V4.9.0 增强版方案 B：settleFromFrozen 不再写毯式 ESCROW 释放记录。
       *
       * 改由结算调用方（如 TradeOrderService.settleOrder）在每笔 credit 时
       * 将 counterpart_account_id 指向 SYSTEM_ESCROW，使 changeBalance 的
       * 双录机制自动创建逐笔 ESCROW 释放记录。
       *
       * 优势：ESCROW 的每一笔释放都能追溯到具体收款方（卖家/平台），
       * 而非一个笼统的 -500 释放。
       *
       * 历史记录：V4.8.0 曾在此处写 ESCROW 毯式释放（`${business_type}_counterpart`），
       * 已有的历史记录保留在数据库中不受影响，由 system_reconciliation_final 兜底平衡。
       */

      logger.info('✅ 资产结算成功（从冻结余额）', {
        service: 'BalanceService',
        method: 'settleFromFrozen',
        account_id: account.account_id,
        counterpart_account_id: escrowAccount.account_id,
        system_code,
        asset_code,
        amount,
        available_before,
        available_after,
        frozen_before,
        frozen_after,
        business_type,
        idempotency_key,
        asset_transaction_id: transaction_record.asset_transaction_id,
        double_entry: true
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
module.exports.BALANCE_SAFETY_LIMIT = BALANCE_SAFETY_LIMIT
