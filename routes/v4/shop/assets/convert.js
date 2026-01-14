/**
 * 餐厅积分抽奖系统 V4.5.0 - 材料转换API
 * 处理材料资产的显式转换功能（规则驱动，支持任意材料转换）
 *
 * 功能说明：
 * - 规则驱动的材料转换（支持任意资产对）
 * - 支持手续费机制（三方记账：用户扣减 + 用户入账 + 系统手续费入账）
 * - 支持强幂等性控制（防止重复转换）
 * - 完整的事务保护（扣减+入账原子操作）
 * - 转换规则验证（数量限制、启用状态、生效时间）
 *
 * 业务规则（强制）：
 * - ✅ 规则驱动：转换规则配置在 material_conversion_rules 表中
 * - ✅ 支持手续费：fee_rate / fee_min_amount 配置
 * - ✅ 必须传入幂等键（Header Idempotency-Key）
 * - ✅ 同一幂等键重复请求返回原结果（is_duplicate=true）
 * - ✅ 材料余额不足直接失败，不允许负余额
 * - ❌ 不在兑换流程中隐式触发转换（必须显式调用）
 *
 * 幂等性保证（业界标准形态 - 破坏性重构 2026-01-02）：
 * - 统一只接受 Header Idempotency-Key
 * - 缺失幂等键直接返回 400
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 写操作使用 TransactionManager.execute() 统一管理事务
 * - IdempotencyService 在事务外执行（独立幂等检查）
 *
 * 降维护成本方案（2026-01-13 升级）：
 * - 移除硬编码的资产类型校验，改为数据库规则驱动
 * - 支持手续费三方记账
 * - 返回手续费信息给前端
 *
 * 创建时间：2025年12月22日
 * 更新时间：2026年01月05日 - 事务边界治理改造
 * 更新时间：2026年01月13日 - 规则驱动 + 手续费支持
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const TransactionManager = require('../../../../utils/TransactionManager')
// P1-9：服务通过 ServiceManager 获取（B1-Injected + E2-Strict snake_case）

/**
 * 材料转换接口（显式转换 - 规则驱动）
 * POST /api/v4/shop/assets/convert
 *
 * 业务场景：
 * - 用户主动进行材料转换（如碎红水晶分解为钻石）
 * - 支持强幂等性，防止重复转换
 * - 规则驱动：支持任意在 material_conversion_rules 表中配置的转换规则
 * - 支持手续费机制（三方记账）
 *
 * 请求参数：
 * @header {string} Idempotency-Key - 幂等键（必填，不接受body参数）
 * @body {string} from_asset_code - 源材料资产代码
 * @body {string} to_asset_code - 目标资产代码
 * @body {number} from_amount - 转换数量（源材料数量，必须大于0）
 *
 * 响应数据：
 * {
 *   "success": true,
 *   "data": {
 *     "from_asset_code": "red_shard",
 *     "to_asset_code": "DIAMOND",
 *     "from_amount": 50,
 *     "to_amount": 1000,
 *     "fee_amount": 0,
 *     "fee_asset_code": "DIAMOND",
 *     "net_to_amount": 1000,
 *     "from_tx_id": 123,
 *     "to_tx_id": 456,
 *     "fee_tx_id": null,
 *     "from_balance": 100,
 *     "to_balance": 5000,
 *     "is_duplicate": false,
 *     "conversion_info": {
 *       "rule_id": 1,
 *       "title": "红晶片分解",
 *       "rate_description": "1碎红水晶 = 20钻石",
 *       "fee_rate": 0,
 *       "fee_description": "无手续费"
 *     }
 *   },
 *   "message": "材料转换成功"
 * }
 *
 * 错误码：
 * - 400 MISSING_IDEMPOTENCY_KEY: 缺少幂等键
 * - 400 BAD_REQUEST: 缺少必填参数、转换规则不支持、数量不符合限制
 * - 400 RULE_NOT_FOUND: 不支持的转换规则（未配置或已禁用）
 * - 400 AMOUNT_OUT_OF_RANGE: 转换数量超出限制
 * - 403 INSUFFICIENT_BALANCE: 余额不足
 * - 500 INTERNAL_ERROR: 服务器内部错误
 *
 * 幂等性控制（业界标准形态）：统一通过 Header Idempotency-Key 防止重复转换
 */
router.post('/convert', authenticateToken, async (req, res) => {
  // P1-9：通过 ServiceManager 获取服务（B1-Injected + E2-Strict snake_case）
  const IdempotencyService = req.app.locals.services.getService('idempotency')
  const AssetConversionService = req.app.locals.services.getService('asset_conversion')

  // 【业界标准形态】强制从 Header 获取幂等键，不接受 body
  const idempotency_key = req.headers['idempotency-key']

  // 缺失幂等键直接返回 400
  if (!idempotency_key) {
    return res.apiError(
      '缺少必需的幂等键：请在 Header 中提供 Idempotency-Key。' +
        '重试时必须复用同一幂等键以防止重复转换。',
      'MISSING_IDEMPOTENCY_KEY',
      {
        required_header: 'Idempotency-Key',
        example: 'Idempotency-Key: convert_<timestamp>_<random>'
      },
      400
    )
  }

  try {
    const { from_asset_code, to_asset_code, from_amount } = req.body
    const user_id = req.user.user_id

    logger.info('收到材料转换请求', {
      user_id,
      from_asset_code,
      to_asset_code,
      from_amount,
      idempotency_key
    })

    /*
     * 参数验证
     * 1. 必填参数验证
     */
    if (!from_asset_code) {
      return res.apiError(
        '缺少必填参数：from_asset_code（源材料资产代码）',
        'BAD_REQUEST',
        null,
        400
      )
    }

    if (!to_asset_code) {
      return res.apiError('缺少必填参数：to_asset_code（目标资产代码）', 'BAD_REQUEST', null, 400)
    }

    if (!from_amount) {
      return res.apiError('缺少必填参数：from_amount（转换数量）', 'BAD_REQUEST', null, 400)
    }

    // 转换数量验证
    const parsedAmount = parseInt(from_amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.apiError(
        '转换数量必须是大于0的正整数',
        'BAD_REQUEST',
        { from_amount, parsed_amount: parsedAmount },
        400
      )
    }

    /*
     * 🔴 2026-01-13 规则驱动改造：移除硬编码的资产类型校验
     *
     * 改造前：硬编码校验 from_asset_code === 'red_shard' && to_asset_code === 'DIAMOND'
     * 改造后：由 AssetConversionService.convertMaterial 内部查询 material_conversion_rules 表
     *         如果规则不存在或未启用，服务层抛出 RULE_NOT_FOUND 异常
     *
     * 收益：
     * - 运营可直接在数据库配置新规则，无需代码变更
     * - 支持任意资产对的转换
     * - 统一的规则管理入口
     */

    /*
     * 【入口幂等检查】防止同一次请求被重复提交
     * 统一使用 IdempotencyService 进行请求级幂等控制
     */
    const idempotencyResult = await IdempotencyService.getOrCreateRequest(idempotency_key, {
      api_path: '/api/v4/shop/assets/convert',
      http_method: 'POST',
      request_params: { from_asset_code, to_asset_code, from_amount: parsedAmount },
      user_id
    })

    // 如果已完成，直接返回首次结果（幂等性要求）+ is_duplicate 标记
    if (!idempotencyResult.should_process) {
      logger.info('🔄 入口幂等拦截：重复请求，返回首次结果', {
        idempotency_key,
        user_id,
        from_asset_code,
        to_asset_code
      })
      const duplicateResponse = {
        ...idempotencyResult.response,
        is_duplicate: true
      }
      return res.apiSuccess(duplicateResponse, '材料转换记录已存在（幂等返回）')
    }

    /*
     * 调用服务层执行转换（使用 TransactionManager 统一管理事务）
     * 2026-01-05 事务边界治理：路由层提供事务，服务层不再自建事务
     */
    const result = await TransactionManager.execute(
      async transaction => {
        return await AssetConversionService.convertMaterial(
          user_id,
          from_asset_code,
          to_asset_code,
          parsedAmount,
          {
            idempotency_key,
            title: '碎红水晶分解为钻石',
            meta: {
              source: 'api',
              endpoint: '/api/v4/shop/assets/convert',
              request_time: new Date().toISOString()
            },
            transaction
          }
        )
      },
      { description: 'convertMaterial' }
    )

    /*
     * 构建响应数据（2026-01-13 增强：包含手续费信息）
     *
     * 字段说明：
     * - to_amount: 用户实际获得的目标资产数量（已扣除手续费）
     * - fee_amount: 扣除的手续费数量
     * - fee_asset_code: 手续费资产类型
     * - gross_to_amount: 转换产出原始数量（未扣除手续费）
     * - conversion_info.fee_rate: 手续费费率
     */
    const responseData = {
      from_asset_code: result.from_asset_code,
      to_asset_code: result.to_asset_code,
      from_amount: result.from_amount,
      to_amount: result.to_amount, // 实际入账数量（已扣手续费）
      gross_to_amount: result.gross_to_amount || result.to_amount, // 原始产出数量
      fee_amount: result.fee_amount || 0, // 手续费数量
      fee_asset_code: result.fee_asset_code || result.to_asset_code, // 手续费资产类型
      from_tx_id: result.from_tx_id,
      to_tx_id: result.to_tx_id,
      fee_tx_id: result.fee_tx_id || null, // 手续费交易ID（无手续费时为null）
      from_balance: result.from_balance,
      to_balance: result.to_balance,
      is_duplicate: false,
      conversion_info: {
        rule_id: result.rule_id || null,
        title: result.title || '材料转换',
        rate_description:
          result.rate_description ||
          `1${from_asset_code} = ${result.conversion_rate || 1}${to_asset_code}`,
        fee_rate: result.fee_rate || 0,
        fee_description:
          result.fee_amount > 0
            ? `手续费: ${result.fee_amount} ${result.fee_asset_code}`
            : '无手续费',
        display_icon: result.display_icon || '💎'
      }
    }

    /*
     * 【标记请求完成】保存结果快照到入口幂等表
     */
    await IdempotencyService.markAsCompleted(
      idempotency_key,
      `${result.from_tx_id}:${result.to_tx_id}`, // 业务事件ID = 交易ID组合
      responseData
    )

    logger.info('材料转换成功', {
      user_id,
      from_asset_code,
      to_asset_code,
      from_amount: parsedAmount,
      to_amount: result.to_amount,
      from_tx_id: result.from_tx_id,
      to_tx_id: result.to_tx_id,
      idempotency_key
    })

    return res.apiSuccess(responseData, '材料转换成功')
  } catch (error) {
    // 标记幂等请求失败（允许重试）
    await IdempotencyService.markAsFailed(idempotency_key, error.message).catch(markError => {
      logger.error('标记幂等请求失败状态时出错:', markError)
    })

    // 处理幂等键冲突错误（409状态码）
    if (error.statusCode === 409) {
      logger.warn('幂等性错误:', {
        idempotency_key,
        error_code: error.errorCode,
        message: error.message
      })
      return res.apiError(error.message, error.errorCode || 'IDEMPOTENCY_ERROR', {}, 409)
    }

    // 错误日志记录
    logger.error('材料转换失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id,
      from_asset_code: req.body.from_asset_code,
      to_asset_code: req.body.to_asset_code,
      from_amount: req.body.from_amount,
      idempotency_key
    })

    // 余额不足错误（特殊处理）
    if (error.message && error.message.includes('余额不足')) {
      return res.apiError(
        '材料余额不足，无法完成转换',
        'INSUFFICIENT_BALANCE',
        {
          error: error.message,
          hint: '请先获取足够的碎红水晶再进行转换'
        },
        403
      )
    }

    // 转换规则错误（特殊处理 - 2026-01-13 规则驱动改造后细化错误类型）
    if (error.message) {
      // 规则不存在或未启用
      if (error.message.includes('不支持的材料转换') || error.message.includes('转换规则不存在')) {
        return res.apiError(
          error.message,
          'RULE_NOT_FOUND',
          {
            from_asset_code: req.body.from_asset_code,
            to_asset_code: req.body.to_asset_code,
            hint: '该转换规则未配置或已禁用，请检查资产代码或联系管理员'
          },
          400
        )
      }

      // 数量超出限制
      if (
        error.message.includes('数量') &&
        (error.message.includes('最小') || error.message.includes('最大'))
      ) {
        return res.apiError(error.message, 'AMOUNT_OUT_OF_RANGE', null, 400)
      }
    }

    // 其他错误（通用处理）
    return handleServiceError(error, res, '材料转换失败')
  }
})

module.exports = router
