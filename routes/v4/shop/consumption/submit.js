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
 * 创建时间：2025年12月22日
 * 从consumption.js拆分而来
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const BeijingTimeHelper = require('../../../../utils/timeHelper')

/**
 * @route POST /api/v4/shop/consumption/submit
 * @desc 商家提交消费记录（扫码录入）
 * @access Private (商家/管理员)
 *
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
 *
 * @example
 * POST /api/v4/shop/consumption/submit
 * {
 *   "qr_code": "QR_550e8400-e29b-41d4-a716-446655440000_a1b2c3d4...",
 *   "consumption_amount": 88.50,
 *   "merchant_notes": "消费2份套餐"
 * }
 */
router.post('/submit', authenticateToken, async (req, res) => {
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
      consumption_amount
    })

    // 调用服务层处理
    const record = await ConsumptionService.merchantSubmitConsumption({
      qr_code,
      consumption_amount,
      merchant_notes,
      merchant_id: merchantId
    })

    logger.info('✅ 消费记录创建成功', {
      record_id: record.record_id,
      user_id: record.user_id
    })

    return res.apiSuccess(
      {
        record_id: record.record_id,
        user_id: record.user_id,
        consumption_amount: parseFloat(record.consumption_amount),
        points_to_award: record.points_to_award,
        status: record.status,
        status_name: record.getStatusName(),
        created_at: BeijingTimeHelper.formatForAPI(record.created_at)
      },
      '消费记录提交成功，等待审核'
    )
  } catch (error) {
    logger.error('提交消费记录失败', { error: error.message })
    return handleServiceError(error, res, '提交消费记录失败')
  }
})

module.exports = router
