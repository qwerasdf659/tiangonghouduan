/**
 * 餐厅积分抽奖系统 V4.5.0 - 材料转换API
 * 处理材料资产的显式转换功能（如碎红水晶分解为钻石）
 *
 * 功能说明：
 * - 材料转换（碎红水晶 → 钻石）
 * - 支持强幂等性控制（防止重复转换）
 * - 完整的事务保护（扣减+入账原子操作）
 * - 转换规则验证（数量限制、启用状态）
 *
 * 业务规则（强制）：
 * - ✅ 本期只支持：red_shard → DIAMOND（1:20比例）
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
 * 创建时间：2025年12月22日
 * 更新时间：2026年01月05日 - 事务边界治理改造
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const TransactionManager = require('../../../../utils/TransactionManager')
// 业界标准幂等架构 - 统一入口幂等服务
const IdempotencyService = require('../../../../services/IdempotencyService')

/**
 * 材料转换接口（显式转换）
 * POST /api/v4/shop/assets/convert
 *
 * 业务场景：
 * - 用户主动将碎红水晶分解为钻石
 * - 支持强幂等性，防止重复转换
 * - 本期只支持red_shard → DIAMOND转换
 *
 * 请求参数：
 * @header {string} Idempotency-Key - 幂等键（必填，不接受body参数）
 * @body {string} from_asset_code - 源材料资产代码（当前只支持"red_shard"）
 * @body {string} to_asset_code - 目标资产代码（当前只支持"DIAMOND"）
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
 *     "from_tx_id": 123,
 *     "to_tx_id": 456,
 *     "from_balance": 100,
 *     "to_balance": 5000,
 *     "is_duplicate": false
 *   },
 *   "message": "材料转换成功"
 * }
 *
 * 错误码：
 * - 400 MISSING_IDEMPOTENCY_KEY: 缺少幂等键
 * - 400 BAD_REQUEST: 缺少必填参数、转换规则不支持、数量不符合限制
 * - 403 INSUFFICIENT_BALANCE: 余额不足
 * - 500 INTERNAL_ERROR: 服务器内部错误
 *
 * 幂等性控制（业界标准形态）：统一通过 Header Idempotency-Key 防止重复转换
 */
router.post('/convert', authenticateToken, async (req, res) => {
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
    // 通过 ServiceManager 获取 AssetConversionService（符合TR-005规范）
    const AssetConversionService = req.app.locals.services.getService('assetConversion')

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

    // 4. 转换规则验证（本期只支持red_shard → DIAMOND）
    if (from_asset_code !== 'red_shard') {
      return res.apiError(
        '不支持的源材料类型：当前只支持"red_shard"（碎红水晶）',
        'BAD_REQUEST',
        {
          from_asset_code,
          supported_types: ['red_shard'],
          hint: '如需支持其他材料转换，请联系管理员'
        },
        400
      )
    }

    if (to_asset_code !== 'DIAMOND') {
      return res.apiError(
        '不支持的目标资产类型：当前只支持"DIAMOND"（钻石）',
        'BAD_REQUEST',
        {
          to_asset_code,
          supported_types: ['DIAMOND'],
          hint: '如需支持其他资产转换，请联系管理员'
        },
        400
      )
    }

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

    // 构建响应数据
    const responseData = {
      from_asset_code: result.from_asset_code,
      to_asset_code: result.to_asset_code,
      from_amount: result.from_amount,
      to_amount: result.to_amount,
      from_tx_id: result.from_tx_id,
      to_tx_id: result.to_tx_id,
      from_balance: result.from_balance,
      to_balance: result.to_balance,
      is_duplicate: false,
      conversion_rate: 20, // 转换比例：1碎红水晶 = 20钻石
      conversion_info: {
        rule_description: '碎红水晶分解为钻石',
        rate_description: '1碎红水晶 = 20钻石',
        display_icon: '💎'
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

    // 转换规则错误（特殊处理）
    if (
      error.message &&
      (error.message.includes('不支持的材料转换') || error.message.includes('转换规则'))
    ) {
      return res.apiError(
        error.message,
        'UNSUPPORTED_CONVERSION',
        {
          hint: '当前只支持碎红水晶转钻石，其他材料转换规则暂未开放'
        },
        400
      )
    }

    // 其他错误（通用处理）
    return handleServiceError(error, res, '材料转换失败')
  }
})

module.exports = router
