/**
 * 餐厅积分抽奖系统 V4.5.0材料系统架构 - 资产转换服务（AssetConversionService）
 *
 * 核心职责：基于统一账本（BalanceService）进行材料资产转换
 * 支持规则驱动 + 手续费三方记账
 *
 * 业务场景：提供材料资产的显式转换功能（规则驱动，支持任意资产对）
 *
 * 核心功能：
 * 1. 规则驱动材料转换（支持任意在 material_conversion_rules 表配置的转换规则）
 * 2. 手续费机制（三方记账：用户扣减 + 用户入账 + 系统手续费入账）
 * 3. 完整的事务保护（扣减材料 + 增加目标资产 + 手续费入账在同一事务中完成）
 * 4. 幂等性控制（防止重复转换）+ 409冲突保护（参数不同返回409）
 * 5. 规则验证（转换规则存在性、启用状态、数量限制、手续费配置）
 * 6. 完整的流水记录（统一账本双/三分录）
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 所有写操作 **强制要求** 外部事务传入（options.transaction）
 * - 未提供事务时直接报错（使用 assertAndGetTransaction）
 * - 服务层禁止自建事务，由入口层统一使用 TransactionManager.execute()
 *
 * 降维护成本方案（2026-01-13 升级）：
 * - ✅ 规则驱动：转换规则配置在 material_conversion_rules 表中
 * - ✅ 移除硬编码：不再限制只能 red_shard → DIAMOND
 * - ✅ 支持手续费：fee_rate / fee_min_amount 配置
 * - ✅ 三方记账：用户扣减 + 用户入账 + 系统手续费入账
 * - ✅ 数量限制：min_from_amount / max_from_amount 配置
 * - ✅ 舍入控制：rounding_mode（floor/ceil/round）
 * - ✅ 幂等优化：从"扫描"改为"点查"（getTransactionByIdempotencyKey）
 *
 * 业务流程：
 *
 * 1. **显式转换流程**（用户主动发起）
 *    - 用户选择源材料数量 → convertMaterial()
 *    - 查询转换规则（material_conversion_rules）
 *    - 验证规则启用状态、数量限制
 *    - 计算产出数量和手续费
 *    - 统一账本双/三分录：
 *      - 扣减材料（debit）
 *      - 增加目标资产（credit，已扣除手续费）
 *      - 系统手续费入账（fee，如有配置）
 *    - 写入统一流水记录（asset_transactions表）→ 转换完成
 *
 * 2. **幂等性保护（Phase 4优化）**
 *    - 客户端必须传入idempotency_key（幂等键）
 *    - 同一idempotency_key只能转换一次
 *    - 重复请求（参数相同）：返回原结果（is_duplicate=true）
 *    - 重复请求（参数不同）：返回409冲突错误（IDEMPOTENCY_KEY_CONFLICT）
 *    - 幂等检查改为点查（O(1)复杂度）
 *
 * 3. **错误处理**
 *    - 转换规则不存在/已禁用 → 拒绝转换（RULE_NOT_FOUND）
 *    - 转换数量超出限制 → 拒绝转换（AMOUNT_OUT_OF_RANGE）
 *    - 材料余额不足 → 拒绝转换（INSUFFICIENT_BALANCE）
 *    - 参数冲突 → 返回409错误（IDEMPOTENCY_KEY_CONFLICT）
 *    - 任何异常自动回滚事务
 *
 * 设计原则：
 * - **规则驱动**：转换规则来自数据库配置表，运营可调整无需代码变更
 * - **统一账本**：所有资产变动通过BalanceService统一管理（Single Source of Truth）
 * - **三方记账**：用户扣减 + 用户入账 + 系统手续费入账
 * - **事务原子性**：所有分录在同一事务中完成，要么全成功要么全失败
 * - **幂等性保证**：通过idempotency_key防止重复转换，参数不同返回409
 * - **规则配置化**：转换规则来自数据库配置表，支持版本化（effective_at）
 * - **完整审计**：每次转换都有完整的流水记录（asset_transactions）
 * - **不隐式触发**：只提供显式API，不在兑换等流程中自动转换
 *
 * 关键方法列表：
 * - convertMaterial() - 材料转换（核心方法，支持手续费三方记账）
 * - convertRedShardToDiamond() - 红水晶碎片转钻石（便捷方法）
 * - getConversionRules() - 获取可用转换规则列表
 *
 * 数据模型关联（Phase 4最终态）：
 * - MaterialConversionRule：转换规则配置表（规则真相源）
 * - AccountAssetBalance：统一资产余额表（管理所有资产余额）
 * - AssetTransaction：统一资产流水表（记录所有资产变动）
 *   - business_type: material_convert_debit（材料扣减分录）
 *   - business_type: material_convert_credit（目标资产入账分录）
 *   - business_type: material_convert_fee（手续费入账分录）
 *
 * 创建时间：2025-12-15
 * 最后更新：2026-01-05（事务边界治理改造）
 * 最后更新：2026-01-13（规则驱动 + 手续费三方记账）
 * 使用模型：Claude Sonnet 4.5
 */

'use strict'

const { sequelize } = require('../config/database')
// V4.7.0 AssetService 拆分：使用子服务替代原 AssetService（2026-01-31）
const BalanceService = require('./asset/BalanceService')
const QueryService = require('./asset/QueryService')
// 🔴 从 models/index.js 获取已初始化的 Sequelize Model（避免直接 require 模型定义文件导致未初始化）
const { MaterialConversionRule } = require('../models')
// const MaterialAssetType = require('../models/MaterialAssetType') // P1-3: 材料类型配置（预留未来使用）
const logger = require('../utils/logger')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')

/**
 * 资产转换服务类
 * 职责：提供材料资产的显式转换功能，组合MaterialService和DiamondService
 * 设计模式：服务层模式 + 事务管理模式 + 组合模式
 */
class AssetConversionService {
  /**
   * 材料转换（核心方法 - 支持手续费三方记账）
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * 降维护成本方案（2026-01-13 升级）：
   * - 规则驱动：从数据库读取转换规则，支持任意资产对
   * - 数量限制：min_from_amount / max_from_amount
   * - 手续费机制：fee_rate / fee_min_amount / fee_asset_code
   * - 舍入控制：rounding_mode（floor/ceil/round）
   * - 幂等优化：使用点查替代扫描
   *
   * 业务规则：
   * - 根据转换规则配置进行材料转换
   * - 扣减源材料 + 增加目标资产 + 系统手续费入账在同一事务中完成
   * - 支持幂等性控制，防止重复转换
   * - 验证转换规则、材料余额、数量限制
   *
   * @param {number} user_id - 用户ID（User ID）
   * @param {string} from_asset_code - 源材料资产代码（Source Asset Code）如：red_shard
   * @param {string} to_asset_code - 目标资产代码（Target Asset Code）如：DIAMOND
   * @param {number} from_amount - 源材料数量（Source Material Amount）必须大于0
   * @param {Object} options - 选项参数（Options）
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {string} options.idempotency_key - 业务唯一ID（Business ID）必填，用于幂等性控制
   * @param {string} options.title - 转换标题（Title）可选，默认为"材料转换"
   * @param {Object} options.meta - 元数据（Meta）可选，额外的业务信息
   * @returns {Promise<Object>} 转换结果（Conversion Result）
   * @throws {Error} 转换失败时抛出异常（Throws error on conversion failure）
   *
   * 返回对象结构：
   * {
   *   success: true,
   *   from_asset_code: 'red_shard',
   *   to_asset_code: 'DIAMOND',
   *   from_amount: 50,
   *   gross_to_amount: 1000,  // 原始产出（未扣手续费）
   *   fee_amount: 50,         // 手续费
   *   fee_asset_code: 'DIAMOND',
   *   to_amount: 950,         // 实际入账（已扣手续费）
   *   from_tx_id: 123,        // 材料扣减流水ID
   *   to_tx_id: 456,          // 目标资产入账流水ID
   *   fee_tx_id: 789,         // 手续费入账流水ID（无手续费时为null）
   *   from_balance: 100,      // 转换后的材料余额
   *   to_balance: 5000,       // 转换后的目标资产余额
   *   is_duplicate: false,    // 是否为重复请求
   *   rule_id: 1,             // 使用的规则ID
   *   title: '红水晶碎片分解',    // 规则标题
   *   fee_rate: 0.05,         // 手续费费率
   *   conversion_rate: 20,    // 转换比例
   *   display_icon: '💎'      // 显示图标
   * }
   */
  static async convertMaterial(user_id, from_asset_code, to_asset_code, from_amount, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'AssetConversionService.convertMaterial')

    // 参数验证（Parameter validation）
    if (!user_id || user_id <= 0) {
      throw new Error('用户ID无效')
    }

    if (!from_asset_code) {
      throw new Error('源材料资产代码不能为空')
    }

    if (!to_asset_code) {
      throw new Error('目标资产代码不能为空')
    }

    if (!from_amount || from_amount <= 0) {
      throw new Error('转换数量必须大于0')
    }

    if (!options.idempotency_key) {
      throw new Error('idempotency_key不能为空（幂等性控制必需）')
    }

    // 🔴 从 DB 读取转换规则（支持版本化查询）
    const rule = await MaterialConversionRule.getEffectiveRule(
      from_asset_code,
      to_asset_code,
      new Date(), // 查询当前生效的规则
      { transaction }
    )

    if (!rule) {
      const ruleNotFoundError = new Error(
        `转换规则不存在：${from_asset_code} → ${to_asset_code}（未找到生效的转换规则）`
      )
      ruleNotFoundError.errorCode = 'RULE_NOT_FOUND'
      throw ruleNotFoundError
    }

    // 验证规则是否启用
    if (!rule.is_enabled) {
      const ruleDisabledError = new Error(`转换规则已禁用：${from_asset_code} → ${to_asset_code}`)
      ruleDisabledError.errorCode = 'RULE_DISABLED'
      throw ruleDisabledError
    }

    // 🔴 2026-01-13 新增：数量限制验证
    const minAmount = rule.min_from_amount || 1
    const maxAmount = rule.max_from_amount // null 表示无上限

    if (from_amount < minAmount) {
      const minAmountError = new Error(
        `转换数量低于最小限制：最小 ${minAmount}，当前 ${from_amount}`
      )
      minAmountError.errorCode = 'AMOUNT_BELOW_MINIMUM'
      throw minAmountError
    }

    if (maxAmount && from_amount > maxAmount) {
      const maxAmountError = new Error(
        `转换数量超过最大限制：最大 ${maxAmount}，当前 ${from_amount}`
      )
      maxAmountError.errorCode = 'AMOUNT_ABOVE_MAXIMUM'
      throw maxAmountError
    }

    // 🔴 2026-01-13 新增：计算转换产出和手续费
    const conversionResult = this._calculateConversion(from_amount, rule)
    const { gross_to_amount, fee_amount, net_to_amount, fee_asset_code } = conversionResult

    const idempotency_key = options.idempotency_key
    const title = options.title || rule.title || `材料转换：${from_asset_code} → ${to_asset_code}`
    const meta = {
      ...options.meta,
      from_asset_code,
      to_asset_code,
      from_amount,
      gross_to_amount,
      fee_amount,
      fee_asset_code,
      net_to_amount,
      rule_id: rule.rule_id, // 记录规则ID用于审计
      rule_effective_at: rule.effective_at, // 记录规则生效时间用于回放
      conversion_rate: rule.to_amount / rule.from_amount, // 转换比例
      fee_rate: parseFloat(rule.fee_rate) || 0,
      rule_from_amount: rule.from_amount, // 规则源数量
      rule_to_amount: rule.to_amount // 规则目标数量
    }

    // 🔴 2026-01-13 优化：幂等检查从"扫描"改为"点查"
    const debit_idempotency_key = `${idempotency_key}:debit`
    const existing_record = await QueryService.getTransactionByIdempotencyKey(
      debit_idempotency_key,
      { transaction }
    )

    if (existing_record) {
      // 参数一致性验证（409冲突保护）
      const existing_meta = existing_record.meta || {}
      const is_params_match =
        existing_meta.from_asset_code === from_asset_code &&
        existing_meta.to_asset_code === to_asset_code &&
        Math.abs(existing_record.delta_amount) === from_amount

      if (!is_params_match) {
        // 参数不一致，返回409冲突
        const conflictError = new Error(
          `幂等键冲突：idempotency_key="${idempotency_key}" 已被使用于不同参数的转换操作。` +
            `原转换：${existing_meta.from_asset_code || 'unknown'} → ${existing_meta.to_asset_code || 'unknown'}, ` +
            `数量=${Math.abs(existing_record.delta_amount || 0)}；` +
            `当前请求：${from_asset_code} → ${to_asset_code}, 数量=${from_amount}。` +
            '请使用不同的幂等键或确认请求参数正确。'
        )
        conflictError.statusCode = 409 // HTTP 409 Conflict
        conflictError.errorCode = 'IDEMPOTENCY_KEY_CONFLICT'
        throw conflictError
      }

      // 参数一致，返回幂等结果
      logger.info('⚠️ 幂等性检查：材料转换已存在，参数一致，返回原结果', {
        user_id,
        from_asset_code,
        to_asset_code,
        from_amount,
        net_to_amount,
        idempotency_key
      })

      // 查询对应的目标资产入账记录和手续费记录
      const credit_idempotency_key = `${idempotency_key}:credit`
      const existing_credit = await QueryService.getTransactionByIdempotencyKey(
        credit_idempotency_key,
        { transaction }
      )

      let existing_fee = null
      if (fee_amount > 0) {
        const fee_idempotency_key = `${idempotency_key}:fee`
        existing_fee = await QueryService.getTransactionByIdempotencyKey(fee_idempotency_key, {
          transaction
        })
      }

      // 获取当前余额
      const from_balance_obj = await BalanceService.getBalance(
        { user_id, asset_code: from_asset_code },
        { transaction }
      )
      const to_balance_obj = await BalanceService.getBalance(
        { user_id, asset_code: to_asset_code },
        { transaction }
      )

      return {
        success: true,
        from_asset_code,
        to_asset_code,
        from_amount,
        gross_to_amount,
        fee_amount,
        fee_asset_code,
        to_amount: net_to_amount,
        from_tx_id: existing_record.asset_transaction_id,
        to_tx_id: existing_credit?.asset_transaction_id || null,
        fee_tx_id: existing_fee?.asset_transaction_id || null,
        from_balance: from_balance_obj.available_amount,
        to_balance: to_balance_obj.available_amount,
        is_duplicate: true,
        rule_id: rule.rule_id,
        title: rule.title || title,
        fee_rate: parseFloat(rule.fee_rate) || 0,
        conversion_rate: rule.to_amount / rule.from_amount,
        display_icon: rule.display_icon || '💎'
      }
    }

    // 获取双录所需的系统账户
    const burnAccount = await BalanceService.getOrCreateAccount(
      { system_code: 'SYSTEM_BURN' },
      { transaction }
    )
    const mintAccount = await BalanceService.getOrCreateAccount(
      { system_code: 'SYSTEM_MINT' },
      { transaction }
    )
    const userAccount = await BalanceService.getOrCreateAccount({ user_id }, { transaction })

    /*
     * 步骤1：扣减源材料（使用统一账本 BalanceService）
     * business_type: material_convert_debit
     */
    // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
    const from_result = await BalanceService.changeBalance(
      {
        user_id,
        asset_code: from_asset_code,
        delta_amount: -from_amount,
        idempotency_key: `${idempotency_key}:debit`,
        business_type: 'material_convert_debit',
        counterpart_account_id: burnAccount.account_id,
        meta: {
          ...meta,
          step: 'debit',
          title: `${title}（扣减${from_asset_code}）`
        }
      },
      { transaction }
    )

    /*
     * 步骤2：增加目标资产（使用统一账本 BalanceService）
     * business_type: material_convert_credit
     */
    // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
    const to_result = await BalanceService.changeBalance(
      {
        user_id,
        asset_code: to_asset_code,
        delta_amount: net_to_amount,
        idempotency_key: `${idempotency_key}:credit`,
        business_type: 'material_convert_credit',
        counterpart_account_id: mintAccount.account_id,
        meta: {
          ...meta,
          step: 'credit',
          title: `${title}（获得${to_asset_code}）`
        }
      },
      { transaction }
    )

    /*
     * 步骤3：系统手续费入账（如有配置）
     * business_type: material_convert_fee
     */
    let fee_result = null
    if (fee_amount > 0) {
      // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
      fee_result = await BalanceService.changeBalance(
        {
          system_code: 'SYSTEM_PLATFORM_FEE',
          asset_code: fee_asset_code,
          delta_amount: fee_amount,
          idempotency_key: `${idempotency_key}:fee`,
          business_type: 'material_convert_fee',
          counterpart_account_id: userAccount.account_id,
          meta: {
            ...meta,
            step: 'fee',
            title: `${title}（手续费入账）`,
            payer_user_id: user_id
          }
        },
        { transaction }
      )

      logger.info('✅ 材料转换手续费入账', {
        user_id,
        fee_amount,
        fee_asset_code,
        fee_tx_id: fee_result.transaction_record.asset_transaction_id
      })
    }

    logger.info('✅ 材料转换成功（统一账本三方记账）', {
      user_id,
      from_asset_code,
      to_asset_code,
      from_amount,
      gross_to_amount,
      fee_amount,
      net_to_amount,
      from_tx_id: from_result.transaction_record.asset_transaction_id,
      to_tx_id: to_result.transaction_record.asset_transaction_id,
      fee_tx_id: fee_result?.transaction_record.asset_transaction_id || null,
      idempotency_key
    })

    return {
      success: true,
      from_asset_code,
      to_asset_code,
      from_amount,
      gross_to_amount,
      fee_amount,
      fee_asset_code,
      to_amount: net_to_amount,
      from_tx_id: from_result.transaction_record.asset_transaction_id,
      to_tx_id: to_result.transaction_record.asset_transaction_id,
      fee_tx_id: fee_result?.transaction_record.asset_transaction_id || null,
      from_balance: from_result.balance.available_amount,
      to_balance: to_result.balance.available_amount,
      is_duplicate: false,
      rule_id: rule.rule_id,
      title: rule.title || title,
      fee_rate: parseFloat(rule.fee_rate) || 0,
      conversion_rate: rule.to_amount / rule.from_amount,
      display_icon: rule.display_icon || '💎',
      rate_description: `1${from_asset_code} = ${rule.to_amount / rule.from_amount}${to_asset_code}`
    }
  }

  /**
   * 计算转换产出和手续费（内部方法）
   *
   * 计算逻辑：
   * 1. gross_to_amount = (from_amount / rule.from_amount) * rule.to_amount（应用舍入模式）
   * 2. fee_amount = max(gross_to_amount * fee_rate, fee_min_amount)
   * 3. net_to_amount = gross_to_amount - fee_amount
   *
   * @param {number} from_amount - 源材料数量
   * @param {Object} rule - 转换规则对象
   * @returns {Object} 计算结果 { gross_to_amount, fee_amount, net_to_amount, fee_asset_code }
   * @private
   */
  static _calculateConversion(from_amount, rule) {
    // 1. 计算原始产出
    const rawAmount = (from_amount / rule.from_amount) * rule.to_amount

    // 2. 应用舍入模式
    let gross_to_amount
    const roundingMode = rule.rounding_mode || 'floor'
    switch (roundingMode) {
      case 'ceil':
        gross_to_amount = Math.ceil(rawAmount)
        break
      case 'round':
        gross_to_amount = Math.round(rawAmount)
        break
      case 'floor':
      default:
        gross_to_amount = Math.floor(rawAmount)
    }

    // 3. 计算手续费
    const feeRate = parseFloat(rule.fee_rate) || 0
    const feeMinAmount = parseInt(rule.fee_min_amount) || 0
    let fee_amount = 0

    if (feeRate > 0 || feeMinAmount > 0) {
      const calculatedFee = Math.floor(gross_to_amount * feeRate)
      fee_amount = Math.max(calculatedFee, feeMinAmount)
    }

    // 4. 计算净入账
    const net_to_amount = gross_to_amount - fee_amount

    // 5. 确定手续费资产类型（默认与目标资产相同）
    const fee_asset_code = rule.fee_asset_code || rule.to_asset_code

    return {
      gross_to_amount,
      fee_amount,
      net_to_amount,
      fee_asset_code
    }
  }

  /**
   * 红水晶碎片转钻石（便捷方法）
   *
   * 业务规则：
   * - 1个红水晶碎片（red_shard）= 20个钻石（DIAMOND）
   * - 这是convertMaterial()的便捷封装
   * - 固定转换类型：red_shard → DIAMOND
   *
   * @param {number} user_id - 用户ID（User ID）
   * @param {number} red_shard_amount - 红水晶碎片数量（Red Shard Amount）必须大于0
   * @param {Object} options - 选项参数（Options）
   * @param {string} options.idempotency_key - 业务唯一ID（Business ID）必填，用于幂等性控制
   * @returns {Promise<Object>} 转换结果（Conversion Result）
   *
   * 使用示例：
   * ```javascript
   * // 将50个红水晶碎片转换为1000个钻石
   * const result = await AssetConversionService.convertRedShardToDiamond(
   *   1, // user_id
   *   50, // red_shard_amount
   *   {
   *     idempotency_key: `convert_${Date.now()}`
   *   }
   * )
   * ```
   */
  static async convertRedShardToDiamond(user_id, red_shard_amount, options = {}) {
    if (!options.idempotency_key) {
      throw new Error('idempotency_key不能为空（幂等性控制必需）')
    }

    return await this.convertMaterial(
      user_id,
      'red_shard', // 固定源材料：红水晶碎片
      'DIAMOND', // 固定目标资产：钻石
      red_shard_amount,
      {
        ...options,
        title: options.title || '红水晶碎片分解为钻石'
      }
    )
  }

  /**
   * 获取材料转换规则列表（从数据库读取）
   *
   * 业务场景：
   * - 给用户侧/管理侧展示当前可用的材料转换规则
   * - **规则真相**来自 material_conversion_rules（禁止硬编码）
   *
   * 返回口径：
   * - 默认返回所有 is_enabled=true 的规则，按 effective_at 倒序
   * - 不在路由层直接查询 models，统一由 Service 层承接（项目规范：路由不直连 models）
   *
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务（可选）
   * @param {Date} options.as_of_time - 查询生效时间点（可选，默认当前时间）
   * @param {boolean} options.visible_only - 仅返回前端可见规则（可选，默认 false）
   * @returns {Promise<Array<Object>>} 规则列表（增强版含完整字段信息）
   */
  static async getConversionRules(options = {}) {
    const { transaction, as_of_time, visible_only = false } = options
    const asOfTime = as_of_time || new Date()

    // 构建查询条件
    const whereCondition = {
      is_enabled: true,
      effective_at: {
        [sequelize.Sequelize.Op.lte]: asOfTime
      }
    }

    // 如果仅查询前端可见规则
    if (visible_only) {
      whereCondition.is_visible = true
    }

    const rules = await MaterialConversionRule.findAll({
      where: whereCondition,
      order: [
        ['effective_at', 'DESC'],
        ['material_conversion_rule_id', 'DESC']
      ],
      transaction,
      raw: true
    })

    return rules
  }
}

module.exports = AssetConversionService
