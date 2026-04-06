/**
 * 统一资产转换规则服务 — AssetConversionRuleService
 *
 * 合并原 ExchangeRateService（汇率兑换）、AssetConversionService（材料转换）
 * 和 MaterialManagementService 中的转换规则管理功能。
 *
 * 核心职责：
 * 1. 规则查询（用户端 + 管理后台）
 * 2. 预览转换结果（不执行）
 * 3. 执行转换（三方记账：SYSTEM_BURN + SYSTEM_MINT + SYSTEM_PLATFORM_FEE）
 * 4. 管理后台 CRUD（创建/更新/启停规则）
 * 5. 风控校验（循环拦截 + 套利检测）
 *
 * 事务边界治理：
 * - 所有写操作强制要求外部事务传入（assertAndGetTransaction）
 * - 服务层禁止自建事务
 *
 * 三方记账模型（SYSTEM_BURN + SYSTEM_MINT）：
 * - debit 分录：用户扣减源资产 → 对手方 SYSTEM_BURN(3)
 * - credit 分录：用户入账目标资产 → 对手方 SYSTEM_MINT(2)
 * - fee 分录：系统手续费入账 → 对手方 SYSTEM_PLATFORM_FEE(1)
 *
 * business_type 统一前缀：asset_convert_
 * - asset_convert_debit：源资产扣减
 * - asset_convert_debit_counterpart：扣减对手方（SYSTEM_BURN）
 * - asset_convert_credit：目标资产入账
 * - asset_convert_credit_counterpart：入账对手方（SYSTEM_MINT）
 * - asset_convert_fee：手续费入账
 * - asset_convert_fee_counterpart：手续费对手方（SYSTEM_PLATFORM_FEE）
 *
 * @module services/AssetConversionRuleService
 * @version 1.0.0
 * @date 2026-04-05
 */

'use strict'

const BalanceService = require('./asset/BalanceService')
const { AssetConversionRule } = require('../models')
const logger = require('../utils/logger')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const { AssetCode } = require('../constants/AssetCode')
const { BusinessCacheHelper } = require('../utils/BusinessCacheHelper')
const { Op } = require('sequelize')

/** 系统账户ID常量 */
const SYSTEM_ACCOUNTS = {
  BURN: 3, // SYSTEM_BURN — 资产回收（扣减对手方）
  MINT: 2, // SYSTEM_MINT — 资产发放（入账对手方）
  PLATFORM_FEE: 1 // SYSTEM_PLATFORM_FEE — 手续费收取
}

/** business_type 统一前缀 */
const BIZ_TYPE = {
  DEBIT: 'asset_convert_debit',
  CREDIT: 'asset_convert_credit',
  FEE: 'asset_convert_fee'
}

/**
 * 统一资产转换规则服务
 */
class AssetConversionRuleService {
  /*
   * ========================================
   * 用户端查询方法
   * ========================================
   */

  /**
   * 查询特定币对当前生效的规则
   *
   * @param {string} fromAssetCode - 源资产代码
   * @param {string} toAssetCode - 目标资产代码
   * @param {Object} [options={}] - 查询选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<AssetConversionRule|null>} 生效的规则实例
   */
  static async getEffectiveRule(fromAssetCode, toAssetCode, options = {}) {
    return AssetConversionRule.getEffectiveRule(fromAssetCode, toAssetCode, options)
  }

  /**
   * 查询所有可用的转换规则（用户端列表，带 60s 缓存）
   *
   * @param {Object} [options={}] - 查询选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<AssetConversionRule[]>} 可用规则列表
   */
  static async getAvailableRules(options = {}) {
    /* 非事务查询时使用缓存 */
    if (!options.transaction) {
      const cached = await BusinessCacheHelper.getConversionRule('available_rules')
      if (cached) return cached
    }

    const rules = await AssetConversionRule.getAvailableRules(options)

    /* 写入缓存（60s TTL） */
    if (!options.transaction) {
      await BusinessCacheHelper.setConversionRule('available_rules', rules).catch(err => {
        logger.logger.warn('[AssetConversionRuleService] 缓存写入失败（非致命）:', err.message)
      })
    }

    return rules
  }

  /*
   * ========================================
   * 预览 + 执行转换
   * ========================================
   */

  /**
   * 预览转换结果（不执行，不需要事务）
   *
   * @param {number} userId - 用户ID
   * @param {string} fromAssetCode - 源资产代码
   * @param {string} toAssetCode - 目标资产代码
   * @param {number} fromAmount - 源资产数量
   * @param {Object} [options={}] - 选项
   * @returns {Promise<Object>} 预览结果
   */
  static async previewConvert(userId, fromAssetCode, toAssetCode, fromAmount, options = {}) {
    /* 1. 查询生效规则 */
    const rule = await this.getEffectiveRule(fromAssetCode, toAssetCode, options)
    if (!rule) {
      const error = new Error(`未找到 ${fromAssetCode} → ${toAssetCode} 的有效转换规则`)
      error.code = 'RULE_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    /* 2. 验证数量范围 */
    this._validateAmount(fromAmount, rule)

    /* 3. 计算转换结果 */
    const { gross, fee, net } = rule.calculateConversion(fromAmount)

    /* 4. 查询用户余额 */
    const fromBalance = await BalanceService.getBalance({
      user_id: userId,
      asset_code: fromAssetCode
    })

    return {
      conversion_rule_id: rule.conversion_rule_id,
      from_asset_code: fromAssetCode,
      to_asset_code: toAssetCode,
      from_amount: fromAmount,
      gross_amount: gross,
      fee_amount: fee,
      net_amount: net,
      fee_rate: rule.fee_rate,
      rate_numerator: rule.rate_numerator,
      rate_denominator: rule.rate_denominator,
      rounding_mode: rule.rounding_mode,
      from_balance: fromBalance ? fromBalance.available_amount : 0,
      sufficient: fromBalance ? fromBalance.available_amount >= fromAmount : false
    }
  }

  /**
   * 执行资产转换（三方记账：BURN + MINT + FEE）
   *
   * @param {number} userId - 用户ID
   * @param {string} fromAssetCode - 源资产代码
   * @param {string} toAssetCode - 目标资产代码
   * @param {number} fromAmount - 源资产数量
   * @param {string} idempotencyKey - 幂等键
   * @param {Object} options - 选项（必须包含 transaction）
   * @param {Object} options.transaction - 事务对象（强制）
   * @returns {Promise<Object>} 转换结果
   */
  static async executeConvert(
    userId,
    fromAssetCode,
    toAssetCode,
    fromAmount,
    idempotencyKey,
    options = {}
  ) {
    const transaction = assertAndGetTransaction(
      options,
      'AssetConversionRuleService.executeConvert'
    )

    /* 1. 幂等性检查 */
    const existingTx = await this._checkIdempotency(
      idempotencyKey,
      userId,
      fromAssetCode,
      toAssetCode,
      fromAmount,
      transaction
    )
    if (existingTx) return existingTx

    /* 2. 查询生效规则 */
    const rule = await this.getEffectiveRule(fromAssetCode, toAssetCode, { transaction })
    if (!rule) {
      const error = new Error(`未找到 ${fromAssetCode} → ${toAssetCode} 的有效转换规则`)
      error.code = 'RULE_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    /* 3. 验证数量范围 */
    this._validateAmount(fromAmount, rule)

    /* 4. 计算转换结果 */
    const { gross, fee, net } = rule.calculateConversion(fromAmount)

    if (net <= 0) {
      const error = new Error('转换后净额为0，手续费超过产出')
      error.code = 'NET_AMOUNT_ZERO'
      error.statusCode = 400
      throw error
    }

    /* 5. 三方记账 */
    const debitIdempotencyKey = `${idempotencyKey}_debit`
    const creditIdempotencyKey = `${idempotencyKey}_credit`
    const feeIdempotencyKey = `${idempotencyKey}_fee`

    /* 5a. 扣减源资产（用户 → SYSTEM_BURN） */
    await BalanceService.changeBalance(
      {
        user_id: userId,
        asset_code: fromAssetCode,
        delta_amount: -fromAmount,
        business_type: BIZ_TYPE.DEBIT,
        counterpart_account_id: SYSTEM_ACCOUNTS.BURN,
        idempotency_key: debitIdempotencyKey,
        meta: {
          conversion_rule_id: rule.conversion_rule_id,
          description: `资产转换扣减: ${fromAmount} ${fromAssetCode}`
        }
      },
      { transaction }
    )

    /* 5b. 入账目标资产（SYSTEM_MINT → 用户） */
    await BalanceService.changeBalance(
      {
        user_id: userId,
        asset_code: toAssetCode,
        delta_amount: net,
        business_type: BIZ_TYPE.CREDIT,
        counterpart_account_id: SYSTEM_ACCOUNTS.MINT,
        idempotency_key: creditIdempotencyKey,
        meta: {
          conversion_rule_id: rule.conversion_rule_id,
          description: `资产转换入账: ${net} ${toAssetCode}`
        }
      },
      { transaction }
    )

    /* 5c. 手续费入账（如有） */
    if (fee > 0) {
      const feeAssetCode = rule.fee_asset_code || toAssetCode
      await BalanceService.changeBalance(
        {
          system_code: 'SYSTEM_PLATFORM_FEE',
          asset_code: feeAssetCode,
          delta_amount: fee,
          business_type: BIZ_TYPE.FEE,
          counterpart_account_id: userId,
          idempotency_key: feeIdempotencyKey,
          meta: {
            conversion_rule_id: rule.conversion_rule_id,
            description: `资产转换手续费: ${fee} ${feeAssetCode}`
          }
        },
        { transaction }
      )
    }

    /* 6. 查询转换后余额 */
    const fromBalance = await BalanceService.getBalance(
      { user_id: userId, asset_code: fromAssetCode },
      { transaction }
    )
    const toBalance = await BalanceService.getBalance(
      { user_id: userId, asset_code: toAssetCode },
      { transaction }
    )

    logger.logger.info('[AssetConversionRuleService] 转换成功', {
      user_id: userId,
      from: `${fromAmount} ${fromAssetCode}`,
      to: `${net} ${toAssetCode}`,
      fee: `${fee} ${rule.fee_asset_code || toAssetCode}`,
      conversion_rule_id: rule.conversion_rule_id,
      idempotency_key: idempotencyKey
    })

    /* 7. 失效缓存 */
    await BusinessCacheHelper.invalidateConversionRule('convert_executed').catch(err => {
      logger.logger.warn('[AssetConversionRuleService] 缓存失效失败（非致命）:', err.message)
    })

    return {
      conversion_rule_id: rule.conversion_rule_id,
      from_asset_code: fromAssetCode,
      to_asset_code: toAssetCode,
      from_amount: fromAmount,
      gross_amount: gross,
      fee_amount: fee,
      net_amount: net,
      from_balance: fromBalance ? fromBalance.available_amount : 0,
      to_balance: toBalance ? toBalance.available_amount : 0,
      is_duplicate: false
    }
  }

  /*
   * ========================================
   * 管理后台方法
   * ========================================
   */

  /**
   * 管理后台 — 规则列表（分页/筛选）
   *
   * @param {Object} [filters={}] - 筛选条件
   * @param {string} [filters.status] - 状态筛选
   * @param {string} [filters.from_asset_code] - 源资产筛选
   * @param {string} [filters.to_asset_code] - 目标资产筛选
   * @param {string} [filters.keyword] - 关键词搜索（标题/描述）
   * @param {number} [filters.page=1] - 页码
   * @param {number} [filters.page_size=20] - 每页条数
   * @returns {Promise<Object>} { rules, total, page, page_size }
   */
  static async adminListRules(filters = {}) {
    const { status, from_asset_code, to_asset_code, keyword, page = 1, page_size = 20 } = filters

    const where = {}

    if (status) where.status = status
    if (from_asset_code) where.from_asset_code = from_asset_code
    if (to_asset_code) where.to_asset_code = to_asset_code
    if (keyword) {
      where[Op.or] = [
        { title: { [Op.like]: `%${keyword}%` } },
        { description: { [Op.like]: `%${keyword}%` } }
      ]
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await AssetConversionRule.findAndCountAll({
      where,
      order: [
        ['status', 'ASC'],
        ['from_asset_code', 'ASC'],
        ['to_asset_code', 'ASC'],
        ['priority', 'DESC']
      ],
      limit: page_size,
      offset
    })

    return {
      rules: rows,
      total: count,
      page,
      page_size
    }
  }

  /**
   * 管理后台 — 获取规则详情
   *
   * @param {number} ruleId - 规则ID
   * @returns {Promise<AssetConversionRule>} 规则实例
   */
  static async adminGetRuleById(ruleId) {
    const rule = await AssetConversionRule.findByPk(ruleId)
    if (!rule) {
      const error = new Error(`转换规则不存在: ${ruleId}`)
      error.code = 'RULE_NOT_FOUND'
      error.statusCode = 404
      throw error
    }
    return rule
  }

  /**
   * 管理后台 — 创建规则（含风控校验）
   *
   * @param {Object} data - 规则数据
   * @param {Object} options - 选项（必须包含 transaction）
   * @returns {Promise<AssetConversionRule>} 创建的规则实例
   */
  static async adminCreateRule(data, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'AssetConversionRuleService.adminCreateRule'
    )

    /* 风控校验 */
    await this._riskValidation(data, null, transaction)

    const rule = await AssetConversionRule.create(data, { transaction })

    /* 失效缓存 */
    await BusinessCacheHelper.invalidateConversionRule('rule_created').catch(err => {
      logger.logger.warn('[AssetConversionRuleService] 缓存失效失败（非致命）:', err.message)
    })

    logger.logger.info('[AssetConversionRuleService] 创建规则', {
      conversion_rule_id: rule.conversion_rule_id,
      pair: `${data.from_asset_code} → ${data.to_asset_code}`,
      rate: `${data.rate_numerator}/${data.rate_denominator}`
    })

    return rule
  }

  /**
   * 管理后台 — 更新规则
   *
   * @param {number} ruleId - 规则ID
   * @param {Object} data - 更新数据
   * @param {Object} options - 选项（必须包含 transaction）
   * @returns {Promise<AssetConversionRule>} 更新后的规则实例
   */
  static async adminUpdateRule(ruleId, data, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'AssetConversionRuleService.adminUpdateRule'
    )

    const rule = await AssetConversionRule.findByPk(ruleId, { transaction })
    if (!rule) {
      const error = new Error(`转换规则不存在: ${ruleId}`)
      error.code = 'RULE_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    /* 如果修改了币对或比率，需要风控校验 */
    const needsRiskCheck =
      data.from_asset_code || data.to_asset_code || data.rate_numerator || data.rate_denominator
    if (needsRiskCheck) {
      const mergedData = { ...rule.toJSON(), ...data }
      await this._riskValidation(mergedData, ruleId, transaction)
    }

    await rule.update(data, { transaction })

    /* 失效缓存 */
    await BusinessCacheHelper.invalidateConversionRule('rule_updated').catch(err => {
      logger.logger.warn('[AssetConversionRuleService] 缓存失效失败（非致命）:', err.message)
    })

    logger.logger.info('[AssetConversionRuleService] 更新规则', {
      conversion_rule_id: ruleId,
      updated_fields: Object.keys(data)
    })

    return rule
  }

  /**
   * 管理后台 — 更新规则状态（启用/暂停/禁用）
   *
   * @param {number} ruleId - 规则ID
   * @param {string} status - 新状态：active / paused / disabled
   * @param {Object} options - 选项（必须包含 transaction）
   * @returns {Promise<AssetConversionRule>} 更新后的规则实例
   */
  static async adminUpdateStatus(ruleId, status, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'AssetConversionRuleService.adminUpdateStatus'
    )

    const rule = await AssetConversionRule.findByPk(ruleId, { transaction })
    if (!rule) {
      const error = new Error(`转换规则不存在: ${ruleId}`)
      error.code = 'RULE_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    /* 启用时需要风控校验 */
    if (status === 'active' && rule.status !== 'active') {
      await this._riskValidation(rule.toJSON(), ruleId, transaction)
    }

    await rule.update({ status }, { transaction })

    /* 失效缓存 */
    await BusinessCacheHelper.invalidateConversionRule('status_updated').catch(err => {
      logger.logger.warn('[AssetConversionRuleService] 缓存失效失败（非致命）:', err.message)
    })

    logger.logger.info('[AssetConversionRuleService] 更新规则状态', {
      conversion_rule_id: ruleId,
      old_status: rule.status,
      new_status: status
    })

    return rule
  }

  /*
   * ========================================
   * 内部辅助方法
   * ========================================
   */

  /**
   * 验证转换数量范围
   *
   * @param {number} fromAmount - 源资产数量
   * @param {Object} rule - 转换规则实例
   * @returns {void}
   * @private
   */
  static _validateAmount(fromAmount, rule) {
    if (!Number.isInteger(fromAmount) || fromAmount <= 0) {
      const error = new Error('转换数量必须为正整数')
      error.code = 'INVALID_AMOUNT'
      error.statusCode = 400
      throw error
    }

    const minAmount = rule.min_from_amount || 1
    const maxAmount = rule.max_from_amount

    if (fromAmount < minAmount) {
      const error = new Error(`转换数量不能小于 ${minAmount}`)
      error.code = 'AMOUNT_TOO_SMALL'
      error.statusCode = 400
      throw error
    }

    if (maxAmount && fromAmount > maxAmount) {
      const error = new Error(`转换数量不能大于 ${maxAmount}`)
      error.code = 'AMOUNT_TOO_LARGE'
      error.statusCode = 400
      throw error
    }
  }

  /**
   * 幂等性检查
   *
   * @param {string} idempotencyKey - 幂等键
   * @param {number} userId - 用户ID
   * @param {string} fromAssetCode - 源资产代码
   * @param {string} toAssetCode - 目标资产代码
   * @param {number} fromAmount - 源资产数量
   * @param {Object} transaction - 事务对象
   * @returns {Promise<Object|null>} 已存在的结果或 null
   * @private
   */
  static async _checkIdempotency(
    idempotencyKey,
    userId,
    fromAssetCode,
    toAssetCode,
    fromAmount,
    transaction
  ) {
    const { AssetTransaction } = require('../models')

    const existingTx = await AssetTransaction.findOne({
      where: {
        idempotency_key: `${idempotencyKey}_debit`,
        business_type: BIZ_TYPE.DEBIT
      },
      transaction
    })

    if (!existingTx) return null

    /* 检查参数是否一致 */
    const isSameParams =
      existingTx.account_id === userId &&
      existingTx.asset_code === fromAssetCode &&
      Math.abs(existingTx.amount) === fromAmount

    if (!isSameParams) {
      const error = new Error('幂等键冲突：相同的幂等键但参数不同')
      error.code = 'IDEMPOTENCY_KEY_CONFLICT'
      error.statusCode = 409
      throw error
    }

    /* 返回原结果 */
    const fromBalance = await BalanceService.getBalance(
      { user_id: userId, asset_code: fromAssetCode },
      { transaction }
    )
    const toBalance = await BalanceService.getBalance(
      { user_id: userId, asset_code: toAssetCode },
      { transaction }
    )

    return {
      from_asset_code: fromAssetCode,
      to_asset_code: toAssetCode,
      from_amount: fromAmount,
      net_amount: Math.abs(existingTx.amount),
      from_balance: fromBalance ? fromBalance.available_amount : 0,
      to_balance: toBalance ? toBalance.available_amount : 0,
      is_duplicate: true
    }
  }

  /**
   * 风控校验（循环拦截 + 套利检测）
   *
   * 复用 materialConversionValidator 的图算法
   *
   * @param {Object} ruleData - 待验证的规则数据
   * @param {number|null} excludeRuleId - 排除的规则ID（更新时排除自身）
   * @param {Object} transaction - 事务对象
   * @returns {Promise<void>} 校验通过无返回，不通过抛出错误
   * @private
   */
  static async _riskValidation(ruleData, excludeRuleId, transaction) {
    /* 获取所有活跃规则 */
    const where = { status: 'active' }
    if (excludeRuleId) {
      where.conversion_rule_id = { [Op.ne]: excludeRuleId }
    }

    const existingRules = await AssetConversionRule.findAll({
      where,
      raw: true,
      transaction
    })

    /* 加入待验证的规则 */
    const allRules = [
      ...existingRules,
      {
        from_asset_code: ruleData.from_asset_code,
        to_asset_code: ruleData.to_asset_code,
        rate_numerator: ruleData.rate_numerator,
        rate_denominator: ruleData.rate_denominator
      }
    ]

    /* 终点货币禁止流出检查 */
    const terminalAssets = [AssetCode.STAR_STONE, AssetCode.POINTS]
    if (terminalAssets.includes(ruleData.from_asset_code)) {
      const error = new Error(`终点货币 ${ruleData.from_asset_code} 禁止作为转换源`)
      error.code = 'TERMINAL_ASSET_OUTFLOW'
      error.statusCode = 400
      throw error
    }

    /* 构建有向图并检测环 */
    const nodes = new Set()
    const edges = []

    allRules.forEach(rule => {
      nodes.add(rule.from_asset_code)
      nodes.add(rule.to_asset_code)
      const ratio = Number(rule.rate_numerator) / Number(rule.rate_denominator)
      edges.push({
        from: rule.from_asset_code,
        to: rule.to_asset_code,
        weight: -Math.log(ratio)
      })
    })

    /* DFS 环检测 */
    const nodeArray = Array.from(nodes)
    const adjList = new Map()
    nodeArray.forEach(n => adjList.set(n, []))
    edges.forEach(e => adjList.get(e.from).push(e.to))

    const visited = new Set()
    const recStack = new Set()

    const hasCycle = node => {
      visited.add(node)
      recStack.add(node)
      for (const neighbor of adjList.get(node) || []) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) return true
        } else if (recStack.has(neighbor)) {
          return true
        }
      }
      recStack.delete(node)
      return false
    }

    for (const node of nodeArray) {
      if (!visited.has(node) && hasCycle(node)) {
        const error = new Error('检测到循环转换路径，禁止创建/启用此规则')
        error.code = 'CYCLE_DETECTED'
        error.statusCode = 400
        throw error
      }
    }

    /* Bellman-Ford 负环检测（套利检测） */
    const dist = new Map()
    nodeArray.forEach(n => dist.set(n, Infinity))
    if (nodeArray.length > 0) dist.set(nodeArray[0], 0)

    for (let i = 0; i < nodeArray.length - 1; i++) {
      for (const edge of edges) {
        const d = dist.get(edge.from)
        if (d !== Infinity && d + edge.weight < dist.get(edge.to)) {
          dist.set(edge.to, d + edge.weight)
        }
      }
    }

    /* 检查是否存在负环 */
    for (const edge of edges) {
      const d = dist.get(edge.from)
      if (d !== Infinity && d + edge.weight < dist.get(edge.to)) {
        const error = new Error('检测到套利闭环（负环），禁止创建/启用此规则')
        error.code = 'ARBITRAGE_DETECTED'
        error.statusCode = 400
        throw error
      }
    }
  }
}

module.exports = AssetConversionRuleService
