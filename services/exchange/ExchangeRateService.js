/**
 * 固定汇率兑换服务 — ExchangeRateService
 *
 * 核心职责：基于 exchange_rates 配置表，执行资产间固定汇率兑换
 *
 * 架构模式（参考 AssetConversionService）：
 * - 规则驱动：汇率规则来自 exchange_rates 表，运营可调整无需代码变更
 * - 三方记账：用户扣减(debit) + 用户入账(credit) + 系统手续费(fee)
 * - 事务原子性：所有分录在同一事务中完成
 * - 幂等控制：通过 idempotency_key 防止重复兑换
 * - 限额管理：每用户每日限额 + 全局每日限额
 *
 * 事务边界治理：
 * - 强制要求外部事务传入（assertAndGetTransaction）
 * - 服务层禁止自建事务
 *
 * business_type 常量：
 * - exchange_rate_debit：源资产扣减分录
 * - exchange_rate_credit：目标资产入账分录
 * - exchange_rate_fee：手续费入账分录
 *
 * @module services/exchange/ExchangeRateService
 * @version 1.0.0
 * @date 2026-02-23
 */

'use strict'

const { sequelize } = require('../../config/database')
const BalanceService = require('../asset/BalanceService')
const QueryService = require('../asset/QueryService')
const { ExchangeRate } = require('../../models')
const logger = require('../../utils/logger').logger || require('../../utils/logger')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

/**
 * 固定汇率兑换服务类
 * 职责：基于 exchange_rates 配置表，执行资产间固定汇率兑换
 * 设计模式：服务层模式 + 事务管理模式 + 三方记账模式
 */
class ExchangeRateService {
  /**
   * 获取特定币对的当前生效汇率
   *
   * @param {string} from_asset_code - 源资产代码
   * @param {string} to_asset_code - 目标资产代码
   * @param {Object} options - 查询选项
   * @returns {Promise<Object|null>} 汇率规则或null
   */
  static async getRate(from_asset_code, to_asset_code, options = {}) {
    const rate = await ExchangeRate.getEffectiveRate(from_asset_code, to_asset_code, options)
    if (!rate) return null

    return {
      exchange_rate_id: rate.exchange_rate_id,
      from_asset_code: rate.from_asset_code,
      to_asset_code: rate.to_asset_code,
      rate_numerator: Number(rate.rate_numerator),
      rate_denominator: Number(rate.rate_denominator),
      rate_display: `${rate.rate_denominator}${rate.from_asset_code} = ${rate.rate_numerator}${rate.to_asset_code}`,
      min_from_amount: Number(rate.min_from_amount),
      max_from_amount: rate.max_from_amount ? Number(rate.max_from_amount) : null,
      daily_user_limit: rate.daily_user_limit ? Number(rate.daily_user_limit) : null,
      daily_global_limit: rate.daily_global_limit ? Number(rate.daily_global_limit) : null,
      fee_rate: parseFloat(rate.fee_rate) || 0,
      status: rate.status,
      description: rate.description
    }
  }

  /**
   * 获取所有活跃的汇率规则（带 Redis 缓存）
   *
   * @param {Object} options - 查询选项
   * @returns {Promise<Array<Object>>} 汇率规则列表
   */
  static async getAllRates(options = {}) {
    const cacheKey = 'exchange_rate:all_active'

    // 尝试读取缓存
    const cached = await BusinessCacheHelper.getExchangeRate(cacheKey)
    if (cached) return cached

    const rates = await ExchangeRate.getAllActiveRates(options)

    const result = rates.map(rate => ({
      exchange_rate_id: rate.exchange_rate_id,
      from_asset_code: rate.from_asset_code,
      to_asset_code: rate.to_asset_code,
      rate_numerator: Number(rate.rate_numerator),
      rate_denominator: Number(rate.rate_denominator),
      rate_display: `${rate.rate_denominator}${rate.from_asset_code} = ${rate.rate_numerator}${rate.to_asset_code}`,
      min_from_amount: Number(rate.min_from_amount),
      max_from_amount: rate.max_from_amount ? Number(rate.max_from_amount) : null,
      daily_user_limit: rate.daily_user_limit ? Number(rate.daily_user_limit) : null,
      fee_rate: parseFloat(rate.fee_rate) || 0,
      status: rate.status,
      description: rate.description
    }))

    // 写入缓存（60秒 TTL）
    await BusinessCacheHelper.setExchangeRate(cacheKey, result)

    return result
  }

  /**
   * 预览兑换结果（不执行，仅计算）
   *
   * @param {number} user_id - 用户ID
   * @param {string} from_asset_code - 源资产代码
   * @param {string} to_asset_code - 目标资产代码
   * @param {number} from_amount - 兑换数量
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 预览结果
   */
  static async previewConvert(user_id, from_asset_code, to_asset_code, from_amount, options = {}) {
    if (!from_amount || from_amount <= 0) {
      throw Object.assign(new Error('兑换数量必须大于0'), { errorCode: 'INVALID_AMOUNT' })
    }

    const rate = await ExchangeRate.getEffectiveRate(from_asset_code, to_asset_code, options)
    if (!rate) {
      throw Object.assign(new Error(`汇率规则不存在：${from_asset_code} → ${to_asset_code}`), {
        errorCode: 'RATE_NOT_FOUND'
      })
    }

    // 数量限制检查
    this._validateAmount(from_amount, rate)

    // 计算兑换结果
    const conversion = rate.calculateConversion(from_amount)

    // 查询用户余额
    let user_balance = 0
    try {
      const balanceObj = await BalanceService.getBalance(
        { user_id, asset_code: from_asset_code },
        options
      )
      user_balance = Number(balanceObj.available_amount)
    } catch {
      // 余额查询失败不影响预览
    }

    // 查询今日已用额度
    const daily_used = await this.getUserDailyUsage(user_id, rate.exchange_rate_id, from_asset_code)

    return {
      from_asset_code,
      to_asset_code,
      from_amount,
      gross_to_amount: conversion.gross_to_amount,
      fee_amount: conversion.fee_amount,
      net_to_amount: conversion.net_to_amount,
      fee_rate: parseFloat(rate.fee_rate) || 0,
      rate_numerator: Number(rate.rate_numerator),
      rate_denominator: Number(rate.rate_denominator),
      rate_display: `${rate.rate_denominator}${from_asset_code} = ${rate.rate_numerator}${to_asset_code}`,
      user_balance,
      sufficient_balance: user_balance >= from_amount,
      daily_user_limit: rate.daily_user_limit ? Number(rate.daily_user_limit) : null,
      daily_used,
      daily_remaining: rate.daily_user_limit
        ? Math.max(0, Number(rate.daily_user_limit) - daily_used)
        : null
    }
  }

  /**
   * 执行汇率兑换（核心方法 — 三方记账 + 幂等 + 限额校验）
   *
   * @param {number} user_id - 用户ID
   * @param {string} from_asset_code - 源资产代码
   * @param {string} to_asset_code - 目标资产代码
   * @param {number} from_amount - 兑换数量
   * @param {string} idempotency_key - 幂等键（必填）
   * @param {Object} options - 选项 { transaction }
   * @returns {Promise<Object>} 兑换结果
   */
  static async executeConvert(
    user_id,
    from_asset_code,
    to_asset_code,
    from_amount,
    idempotency_key,
    options = {}
  ) {
    const transaction = assertAndGetTransaction(options, 'ExchangeRateService.executeConvert')

    // 参数验证
    if (!user_id || user_id <= 0) throw new Error('用户ID无效')
    if (!from_asset_code) throw new Error('源资产代码不能为空')
    if (!to_asset_code) throw new Error('目标资产代码不能为空')
    if (!from_amount || from_amount <= 0) throw new Error('兑换数量必须大于0')
    if (!idempotency_key) throw new Error('idempotency_key不能为空（幂等性控制必需）')

    // 查询汇率规则
    const rate = await ExchangeRate.getEffectiveRate(from_asset_code, to_asset_code, {
      transaction
    })
    if (!rate) {
      throw Object.assign(new Error(`汇率规则不存在：${from_asset_code} → ${to_asset_code}`), {
        errorCode: 'RATE_NOT_FOUND'
      })
    }

    // 数量限制验证
    this._validateAmount(from_amount, rate)

    // 每日限额校验
    await this._validateDailyLimit(user_id, rate, from_amount, from_asset_code, { transaction })

    // 计算兑换结果
    const conversion = rate.calculateConversion(from_amount)
    const { gross_to_amount, fee_amount, net_to_amount } = conversion

    if (net_to_amount <= 0) {
      throw Object.assign(new Error('兑换后净入账为0（可能因手续费或汇率导致），请增加兑换数量'), {
        errorCode: 'NET_AMOUNT_ZERO'
      })
    }

    const meta = {
      from_asset_code,
      to_asset_code,
      from_amount,
      gross_to_amount,
      fee_amount,
      net_to_amount,
      exchange_rate_id: rate.exchange_rate_id,
      rate_numerator: Number(rate.rate_numerator),
      rate_denominator: Number(rate.rate_denominator),
      fee_rate: parseFloat(rate.fee_rate) || 0
    }

    // 幂等检查（点查）
    const debit_key = `${idempotency_key}:debit`
    const existing = await QueryService.getTransactionByIdempotencyKey(debit_key, { transaction })

    if (existing) {
      return this._handleDuplicateRequest(existing, rate, idempotency_key, {
        from_asset_code,
        to_asset_code,
        from_amount,
        gross_to_amount,
        fee_amount,
        net_to_amount,
        user_id,
        transaction
      })
    }

    // 获取系统账户
    const exchangeAccount = await BalanceService.getOrCreateAccount(
      { system_code: 'SYSTEM_EXCHANGE' },
      { transaction }
    )
    const userAccount = await BalanceService.getOrCreateAccount({ user_id }, { transaction })

    // 步骤1：扣减源资产
    // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
    const debit_result = await BalanceService.changeBalance(
      {
        user_id,
        asset_code: from_asset_code,
        delta_amount: -from_amount,
        idempotency_key: debit_key,
        business_type: 'exchange_rate_debit',
        counterpart_account_id: exchangeAccount.account_id,
        meta: { ...meta, step: 'debit' }
      },
      { transaction }
    )

    // 步骤2：入账目标资产
    // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
    const credit_result = await BalanceService.changeBalance(
      {
        user_id,
        asset_code: to_asset_code,
        delta_amount: net_to_amount,
        idempotency_key: `${idempotency_key}:credit`,
        business_type: 'exchange_rate_credit',
        counterpart_account_id: exchangeAccount.account_id,
        meta: { ...meta, step: 'credit' }
      },
      { transaction }
    )

    // 步骤3：手续费入账（如有）
    let fee_result = null
    if (fee_amount > 0) {
      // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
      fee_result = await BalanceService.changeBalance(
        {
          system_code: 'SYSTEM_PLATFORM_FEE',
          asset_code: to_asset_code,
          delta_amount: fee_amount,
          idempotency_key: `${idempotency_key}:fee`,
          business_type: 'exchange_rate_fee',
          counterpart_account_id: userAccount.account_id,
          meta: { ...meta, step: 'fee', payer_user_id: user_id }
        },
        { transaction }
      )
    }

    // 失效缓存
    await BusinessCacheHelper.invalidateExchangeRate()

    logger.info('✅ 汇率兑换成功（三方记账）', {
      user_id,
      from_asset_code,
      to_asset_code,
      from_amount,
      gross_to_amount,
      fee_amount,
      net_to_amount,
      exchange_rate_id: rate.exchange_rate_id,
      idempotency_key
    })

    return {
      success: true,
      from_asset_code,
      to_asset_code,
      from_amount,
      gross_to_amount,
      fee_amount,
      net_to_amount,
      from_balance: debit_result.balance.available_amount,
      to_balance: credit_result.balance.available_amount,
      from_tx_id: debit_result.transaction_record.asset_transaction_id,
      to_tx_id: credit_result.transaction_record.asset_transaction_id,
      fee_tx_id: fee_result?.transaction_record.asset_transaction_id || null,
      is_duplicate: false,
      exchange_rate_id: rate.exchange_rate_id,
      rate_display: `${rate.rate_denominator}${from_asset_code} = ${rate.rate_numerator}${to_asset_code}`
    }
  }

  /**
   * 查询用户今日已兑换额度
   *
   * @param {number} user_id - 用户ID
   * @param {number} exchange_rate_id - 汇率规则ID
   * @param {string} from_asset_code - 源资产代码
   * @returns {Promise<number>} 今日已兑换数量（源资产）
   */
  static async getUserDailyUsage(user_id, exchange_rate_id, from_asset_code) {
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const [results] = await sequelize.query(
        `SELECT COALESCE(SUM(ABS(at2.delta_amount)), 0) AS daily_total
         FROM asset_transactions at2
         INNER JOIN accounts a ON at2.account_id = a.account_id AND a.user_id = :user_id
         WHERE at2.business_type = 'exchange_rate_debit'
           AND at2.asset_code = :from_asset_code
           AND at2.created_at >= :today`,
        {
          replacements: { user_id, from_asset_code, today },
          type: sequelize.QueryTypes.SELECT
        }
      )

      return Number(results?.daily_total) || 0
    } catch {
      return 0
    }
  }

  // ==================== 管理端方法 ====================

  /**
   * 管理后台：查询所有汇率规则（含分页/筛选）
   *
   * @param {Object} filters - 筛选条件 { status, from_asset_code, page, page_size }
   * @returns {Promise<Object>} { items, total, page, page_size }
   */
  static async adminListRates(filters = {}) {
    const { status, from_asset_code, page = 1, page_size = 20 } = filters
    const where = {}

    if (status) where.status = status
    if (from_asset_code) where.from_asset_code = from_asset_code

    const { count, rows } = await ExchangeRate.findAndCountAll({
      where,
      order: [
        ['from_asset_code', 'ASC'],
        ['priority', 'DESC']
      ],
      limit: page_size,
      offset: (page - 1) * page_size
    })

    return {
      items: rows,
      total: count,
      page,
      page_size
    }
  }

  /**
   * 管理后台：创建汇率规则
   *
   * @param {Object} data - 规则数据
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 新创建的规则
   */
  static async adminCreateRate(data, options = {}) {
    const rate = await ExchangeRate.create(data, options)
    await BusinessCacheHelper.invalidateExchangeRate()
    return rate
  }

  /**
   * 管理后台：更新汇率规则
   *
   * @param {number} exchange_rate_id - 规则ID
   * @param {Object} data - 更新数据
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 更新后的规则
   */
  static async adminUpdateRate(exchange_rate_id, data, options = {}) {
    const rate = await ExchangeRate.findByPk(exchange_rate_id, options)
    if (!rate) {
      throw Object.assign(new Error('汇率规则不存在'), {
        errorCode: 'RATE_NOT_FOUND',
        statusCode: 404
      })
    }

    await rate.update(data, options)
    await BusinessCacheHelper.invalidateExchangeRate()
    return rate
  }

  /**
   * 管理后台：更新汇率规则状态
   *
   * @param {number} exchange_rate_id - 规则ID
   * @param {string} status - 新状态
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 更新后的规则
   */
  static async adminUpdateStatus(exchange_rate_id, status, options = {}) {
    const validStatuses = ['active', 'paused', 'disabled']
    if (!validStatuses.includes(status)) {
      throw Object.assign(new Error(`无效状态: ${status}`), { errorCode: 'INVALID_STATUS' })
    }

    return this.adminUpdateRate(exchange_rate_id, { status }, options)
  }

  // ==================== 内部方法 ====================

  /**
   * 验证兑换数量是否在规则允许范围内
   * @param {number} from_amount - 兑换数量
   * @param {Object} rate - 汇率规则对象
   * @returns {void}
   * @private
   */
  static _validateAmount(from_amount, rate) {
    const min = Number(rate.min_from_amount) || 1
    const max = rate.max_from_amount ? Number(rate.max_from_amount) : null

    if (from_amount < min) {
      throw Object.assign(new Error(`兑换数量低于最小限制：最小 ${min}，当前 ${from_amount}`), {
        errorCode: 'AMOUNT_BELOW_MINIMUM'
      })
    }

    if (max && from_amount > max) {
      throw Object.assign(new Error(`兑换数量超过最大限制：最大 ${max}，当前 ${from_amount}`), {
        errorCode: 'AMOUNT_ABOVE_MAXIMUM'
      })
    }
  }

  /**
   * 验证每日限额
   * @param {number} user_id - 用户ID
   * @param {Object} rate - 汇率规则对象
   * @param {number} from_amount - 兑换数量
   * @param {string} from_asset_code - 源资产代码
   * @returns {Promise<void>} 无返回值，超限时抛出异常
   * @private
   */
  static async _validateDailyLimit(user_id, rate, from_amount, from_asset_code) {
    if (rate.daily_user_limit) {
      const daily_used = await this.getUserDailyUsage(
        user_id,
        rate.exchange_rate_id,
        from_asset_code
      )
      const limit = Number(rate.daily_user_limit)

      if (daily_used + from_amount > limit) {
        throw Object.assign(
          new Error(`超出每日兑换限额：限额 ${limit}，已用 ${daily_used}，本次 ${from_amount}`),
          { errorCode: 'DAILY_LIMIT_EXCEEDED' }
        )
      }
    }
  }

  /**
   * 处理幂等重复请求
   * @param {Object} existing - 已存在的交易记录
   * @param {Object} rate - 汇率规则对象
   * @param {string} idempotency_key - 幂等键
   * @param {Object} ctx - 上下文信息（含 from_asset_code, to_asset_code, from_amount 等）
   * @returns {Promise<Object>} 幂等结果
   * @private
   */
  static async _handleDuplicateRequest(existing, rate, idempotency_key, ctx) {
    const existingMeta = existing.meta || {}
    const isMatch =
      existingMeta.from_asset_code === ctx.from_asset_code &&
      existingMeta.to_asset_code === ctx.to_asset_code &&
      Math.abs(existing.delta_amount) === ctx.from_amount

    if (!isMatch) {
      throw Object.assign(
        new Error(`幂等键冲突：idempotency_key="${idempotency_key}" 已用于不同参数的兑换操作`),
        { statusCode: 409, errorCode: 'IDEMPOTENCY_KEY_CONFLICT' }
      )
    }

    logger.info('⚠️ 幂等性检查：汇率兑换已存在，参数一致，返回原结果', {
      user_id: ctx.user_id,
      from_asset_code: ctx.from_asset_code,
      idempotency_key
    })

    const fromBalance = await BalanceService.getBalance(
      { user_id: ctx.user_id, asset_code: ctx.from_asset_code },
      { transaction: ctx.transaction }
    )
    const toBalance = await BalanceService.getBalance(
      { user_id: ctx.user_id, asset_code: ctx.to_asset_code },
      { transaction: ctx.transaction }
    )

    return {
      success: true,
      from_asset_code: ctx.from_asset_code,
      to_asset_code: ctx.to_asset_code,
      from_amount: ctx.from_amount,
      gross_to_amount: ctx.gross_to_amount,
      fee_amount: ctx.fee_amount,
      net_to_amount: ctx.net_to_amount,
      from_balance: fromBalance.available_amount,
      to_balance: toBalance.available_amount,
      is_duplicate: true,
      exchange_rate_id: rate.exchange_rate_id
    }
  }
}

module.exports = ExchangeRateService
