/**
 * 消费记录管理模块 - 商家提交
 *
 * @route /api/v4/shop/consumption
 * @description 商家扫码录入消费记录
 *
 * API列表：
 * - POST /submit - 商家提交消费记录
 *
 * 业务场景：
 * - 商家扫描用户二维码后录入消费金额
 * - 消费记录创建后状态为pending，等待管理员审核
 * - 审核通过后自动奖励积分（1元=1分）
 *
 * 幂等性保证（业界标准形态 - 破坏性重构 2026-01-02）：
 * - 统一只接受 Header Idempotency-Key
 * - 服务端不再自动生成幂等键，缺失幂等键直接返回 400
 *
 * 创建时间：2025年12月22日
 * 更新时间：2026年01月02日 - 业界标准形态破坏性重构
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const BeijingTimeHelper = require('../../../../utils/timeHelper')
// 业界标准幂等架构 - 统一入口幂等服务
const IdempotencyService = require('../../../../services/IdempotencyService')
const TransactionManager = require('../../../../utils/TransactionManager')

/**
 * @route POST /api/v4/shop/consumption/submit
 * @desc 商家提交消费记录（扫码录入）
 * @access Private (商家/管理员)
 *
 * @header {string} Idempotency-Key - 幂等键（必填，不接受body参数）
 * @body {string} qr_code - 用户二维码（必填，格式：QR_{uuid}_{signature}）
 * @body {number} consumption_amount - 消费金额（元，必填，范围：0.01-99999.99）
 * @body {string} merchant_notes - 商家备注（可选，最大500字符）
 *
 * @returns {Object} 创建的消费记录信息
 * @returns {number} data.record_id - 消费记录ID
 * @returns {number} data.user_id - 用户ID
 * @returns {number} data.consumption_amount - 消费金额
 * @returns {number} data.points_to_award - 待奖励积分（1元=1分）
 * @returns {string} data.status - 状态（pending）
 * @returns {string} data.status_name - 状态名称（待审核）
 * @returns {string} data.created_at - 创建时间（北京时间）
 * @returns {boolean} data.is_duplicate - 是否为幂等回放请求
 *
 * 业务场景：商家扫描用户二维码后录入消费金额
 * 幂等性控制（业界标准形态）：统一通过 Header Idempotency-Key 防止重复提交
 */
router.post('/submit', authenticateToken, async (req, res) => {
  // 【业界标准形态】强制从 Header 获取幂等键，不接受 body，不服务端生成
  const idempotency_key = req.headers['idempotency-key']

  // 缺失幂等键直接返回 400
  if (!idempotency_key) {
    return res.apiError(
      '缺少必需的幂等键：请在 Header 中提供 Idempotency-Key。' +
        '重试时必须复用同一幂等键以防止重复提交。',
      'MISSING_IDEMPOTENCY_KEY',
      {
        required_header: 'Idempotency-Key',
        example: 'Idempotency-Key: consumption_submit_<timestamp>_<random>'
      },
      400
    )
  }

  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionService（符合TR-005规范）
    const ConsumptionService = req.app.locals.services.getService('consumption')

    const { qr_code, consumption_amount, merchant_notes } = req.body
    const merchantId = req.user.user_id

    // 参数验证：二维码必填
    if (!qr_code) {
      return res.apiError('二维码不能为空', 'BAD_REQUEST', null, 400)
    }

    // 参数验证：消费金额必须大于0
    if (!consumption_amount || consumption_amount <= 0) {
      return res.apiError('消费金额必须大于0', 'BAD_REQUEST', null, 400)
    }

    // 参数验证：消费金额上限
    if (consumption_amount > 99999.99) {
      return res.apiError('消费金额不能超过99999.99元', 'BAD_REQUEST', null, 400)
    }

    logger.info('商家提交消费记录', {
      merchant_id: merchantId,
      qr_code: qr_code.substring(0, 20) + '...',
      consumption_amount,
      idempotency_key
    })

    /*
     * 【入口幂等检查】防止同一次请求被重复提交
     * 统一使用 IdempotencyService 进行请求级幂等控制
     */
    const idempotencyResult = await IdempotencyService.getOrCreateRequest(idempotency_key, {
      api_path: '/api/v4/shop/consumption/submit',
      http_method: 'POST',
      request_params: { qr_code: qr_code.substring(0, 20), consumption_amount },
      user_id: merchantId
    })

    // 如果已完成，直接返回首次结果（幂等性要求）+ is_duplicate 标记
    if (!idempotencyResult.should_process) {
      logger.info('🔄 入口幂等拦截：重复请求，返回首次结果', {
        idempotency_key,
        merchant_id: merchantId
      })
      const duplicateResponse = {
        ...idempotencyResult.response,
        is_duplicate: true
      }
      return res.apiSuccess(duplicateResponse, '消费记录已存在（幂等回放）')
    }

    /*
     * 调用服务层处理（传入幂等键）
     * 使用 TransactionManager 统一事务边界（符合治理决策）
     */
    const result = await TransactionManager.execute(async (transaction) => {
      return await ConsumptionService.merchantSubmitConsumption({
        qr_code,
        consumption_amount,
        merchant_notes,
        merchant_id: merchantId,
        idempotency_key, // 业界标准形态：统一使用 idempotency_key
        transaction
      })
    })

    // 从服务层获取 record 和 is_duplicate 标志
    const record = result.record || result
    const isDuplicate = result.is_duplicate === true

    // 构建响应数据
    const responseData = {
      record_id: record.record_id,
      user_id: record.user_id,
      consumption_amount: parseFloat(record.consumption_amount),
      points_to_award: record.points_to_award,
      status: record.status,
      status_name: record.getStatusName ? record.getStatusName() : record.status,
      created_at: BeijingTimeHelper.formatForAPI(record.created_at),
      is_duplicate: isDuplicate
    }

    /*
     * 【标记请求完成】保存结果快照到入口幂等表
     */
    await IdempotencyService.markAsCompleted(
      idempotency_key,
      record.record_id, // 业务事件ID = 消费记录ID
      responseData
    )

    logger.info('✅ 消费记录创建成功', {
      record_id: record.record_id,
      user_id: record.user_id,
      idempotency_key,
      is_duplicate: isDuplicate
    })

    return res.apiSuccess(
      responseData,
      isDuplicate ? '消费记录已存在（幂等回放）' : '消费记录提交成功，等待审核'
    )
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

    logger.error('提交消费记录失败', {
      error: error.message,
      idempotency_key
    })
    return handleServiceError(error, res, '提交消费记录失败')
  }
})

module.exports = router
