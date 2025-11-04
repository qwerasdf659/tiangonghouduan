/**
 * 餐厅积分抽奖系统 V4.0 - 消费记录管理API（商家扫码录入方案A）
 *
 * 业务场景：
 * - 商家扫码录入消费记录
 * - 用户查询自己的消费记录
 * - 管理员审核消费记录（通过/拒绝）
 * - 审核通过自动奖励积分（1元=1分）
 *
 * 核心功能：
 * 1. POST /api/v4/consumption/submit - 商家提交消费记录
 * 2. GET /api/v4/consumption/user/:user_id - 用户查询消费记录
 * 3. GET /api/v4/consumption/detail/:record_id - 查询消费记录详情
 * 4. POST /api/v4/consumption/approve/:record_id - 管理员审核通过
 * 5. POST /api/v4/consumption/reject/:record_id - 管理员审核拒绝
 * 6. GET /api/v4/consumption/pending - 管理员查询待审核记录
 * 7. GET /api/v4/consumption/qrcode/:user_id - 生成用户二维码
 *
 * 路径前缀: /api/v4/consumption
 *
 * 创建时间：2025年10月30日
 * 使用 Claude Sonnet 4.5 模型
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')
const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const ConsumptionService = require('../../../services/ConsumptionService')
const QRCodeValidator = require('../../../utils/QRCodeValidator')
const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')

const logger = new Logger('ConsumptionAPI')

/*
 * ========================================
 * 商家端API - 提交消费记录
 * ========================================
 */

/**
 * @route POST /api/v4/consumption/submit
 * @desc 商家提交消费记录（扫码录入）
 * @access Private (商家/管理员)
 *
 * @body {string} qr_code - 用户二维码（必填）
 * @body {number} consumption_amount - 消费金额（元，必填）
 * @body {string} merchant_notes - 商家备注（可选）
 *
 * @example
 * POST /api/v4/consumption/submit
 * {
 *   "qr_code": "QR_123_a1b2c3d4...",
 *   "consumption_amount": 88.50,
 *   "merchant_notes": "消费2份套餐"
 * }
 */
router.post('/submit', authenticateToken, async (req, res) => {
  try {
    const { qr_code, consumption_amount, merchant_notes } = req.body
    const merchantId = req.user.user_id

    // 参数验证
    if (!qr_code) {
      return res.apiError('二维码不能为空', 400)
    }

    if (!consumption_amount || consumption_amount <= 0) {
      return res.apiError('消费金额必须大于0', 400)
    }

    if (consumption_amount > 99999.99) {
      return res.apiError('消费金额不能超过99999.99元', 400)
    }

    logger.info('商家提交消费记录', {
      merchant_id: merchantId,
      qr_code,
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
    return res.apiError(error.message, 400)
  }
})

/*
 * ========================================
 * 用户端API - 查询消费记录
 * ========================================
 */

/**
 * @route GET /api/v4/consumption/user/:user_id
 * @desc 用户查询自己的消费记录
 * @access Private (用户本人或管理员)
 *
 * @param {number} user_id - 用户ID
 * @query {string} status - 状态筛选（pending/approved/rejected/expired，可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大50）
 */
router.get('/user/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params
    const { status, page = 1, page_size = 20 } = req.query

    // 权限检查：只能查询自己的记录，或管理员可查询所有
    if (req.user.user_id !== parseInt(user_id) && req.user.role !== 'admin') {
      return res.apiError('无权查询其他用户的消费记录', 403)
    }

    // 分页参数验证
    const finalPageSize = Math.min(parseInt(page_size), 50)
    const finalPage = Math.max(parseInt(page), 1)

    logger.info('查询用户消费记录', {
      user_id,
      status,
      page: finalPage,
      page_size: finalPageSize
    })

    // 调用服务层查询
    const result = await ConsumptionService.getUserConsumptionRecords(parseInt(user_id), {
      status,
      page: finalPage,
      page_size: finalPageSize
    })

    return res.apiSuccess(result, '查询成功')
  } catch (error) {
    logger.error('查询用户消费记录失败', { error: error.message })
    return res.apiError(error.message, 500)
  }
})

/**
 * @route GET /api/v4/consumption/detail/:record_id
 * @desc 查询消费记录详情
 * @access Private (相关用户或管理员)
 *
 * @param {number} record_id - 消费记录ID
 */
router.get('/detail/:record_id', authenticateToken, async (req, res) => {
  try {
    const { record_id } = req.params

    logger.info('查询消费记录详情', { record_id })

    // 调用服务层查询
    const record = await ConsumptionService.getConsumptionRecordDetail(parseInt(record_id), {
      include_review_records: true,
      include_points_transaction: true
    })

    // 权限检查：只能查询自己相关的记录，或管理员
    if (
      req.user.user_id !== record.user_id &&
      req.user.user_id !== record.merchant_id &&
      req.user.role !== 'admin'
    ) {
      return res.apiError('无权查看此消费记录', 403)
    }

    return res.apiSuccess(record, '查询成功')
  } catch (error) {
    logger.error('查询消费记录详情失败', { error: error.message })
    return res.apiError(error.message, 404)
  }
})

/*
 * ========================================
 * 管理员API - 审核管理
 * ========================================
 */

/**
 * @route GET /api/v4/consumption/pending
 * @desc 管理员查询待审核的消费记录
 * @access Private (管理员)
 *
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大100）
 */
router.get('/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, page_size = 20 } = req.query

    // 分页参数验证
    const finalPageSize = Math.min(parseInt(page_size), 100)
    const finalPage = Math.max(parseInt(page), 1)

    logger.info('管理员查询待审核消费记录', {
      admin_id: req.user.user_id,
      page: finalPage,
      page_size: finalPageSize
    })

    // 调用服务层查询
    const result = await ConsumptionService.getPendingConsumptionRecords({
      page: finalPage,
      page_size: finalPageSize
    })

    return res.apiSuccess(result, '查询成功')
  } catch (error) {
    logger.error('查询待审核记录失败', { error: error.message })
    return res.apiError(error.message, 500)
  }
})

/**
 * @route POST /api/v4/consumption/approve/:record_id
 * @desc 管理员审核通过消费记录
 * @access Private (管理员)
 *
 * @param {number} record_id - 消费记录ID
 * @body {string} admin_notes - 审核备注（可选）
 *
 * @example
 * POST /api/v4/consumption/approve/123
 * {
 *   "admin_notes": "核实无误，审核通过"
 * }
 */
router.post('/approve/:record_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { record_id } = req.params
    const { admin_notes } = req.body
    const reviewerId = req.user.user_id

    logger.info('管理员审核通过消费记录', {
      record_id,
      reviewer_id: reviewerId
    })

    // 调用服务层处理
    const result = await ConsumptionService.approveConsumption(parseInt(record_id), {
      reviewer_id: reviewerId,
      admin_notes
    })

    logger.info('✅ 消费记录审核通过', {
      record_id,
      user_id: result.consumption_record.user_id,
      points_awarded: result.points_awarded
    })

    return res.apiSuccess(
      {
        record_id: result.consumption_record.record_id,
        status: result.consumption_record.status,
        points_awarded: result.points_awarded,
        new_balance: result.new_balance,
        reviewed_at: BeijingTimeHelper.formatForAPI(result.consumption_record.reviewed_at)
      },
      `审核通过，已奖励${result.points_awarded}积分`
    )
  } catch (error) {
    logger.error('审核通过失败', { error: error.message })
    return res.apiError(error.message, 400)
  }
})

/**
 * @route POST /api/v4/consumption/reject/:record_id
 * @desc 管理员审核拒绝消费记录
 * @access Private (管理员)
 *
 * @param {number} record_id - 消费记录ID
 * @body {string} admin_notes - 拒绝原因（必填）
 *
 * @example
 * POST /api/v4/consumption/reject/123
 * {
 *   "admin_notes": "消费金额与实际不符"
 * }
 */
router.post('/reject/:record_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { record_id } = req.params
    const { admin_notes } = req.body
    const reviewerId = req.user.user_id

    // 验证拒绝原因
    if (!admin_notes || admin_notes.trim().length < 5) {
      return res.apiError('拒绝原因不能为空，且至少5个字符', 400)
    }

    logger.info('管理员审核拒绝消费记录', {
      record_id,
      reviewer_id: reviewerId
    })

    // 调用服务层处理
    const result = await ConsumptionService.rejectConsumption(parseInt(record_id), {
      reviewer_id: reviewerId,
      admin_notes
    })

    logger.info('✅ 消费记录审核拒绝', {
      record_id,
      reason: admin_notes
    })

    return res.apiSuccess(
      {
        record_id: result.consumption_record.record_id,
        status: result.consumption_record.status,
        reject_reason: result.reject_reason,
        reviewed_at: BeijingTimeHelper.formatForAPI(result.consumption_record.reviewed_at)
      },
      '已拒绝该消费记录'
    )
  } catch (error) {
    logger.error('审核拒绝失败', { error: error.message })
    return res.apiError(error.message, 400)
  }
})

/*
 * ========================================
 * 工具API - 二维码生成
 * ========================================
 */

/**
 * @route GET /api/v4/consumption/qrcode/:user_id
 * @desc 生成用户固定身份二维码
 * @access Private (用户本人或管理员)
 *
 * @param {number} user_id - 用户ID
 *
 * @returns {Object} 二维码信息
 * @example
 * GET /api/v4/consumption/qrcode/123
 * {
 *   "qr_code": "QR_123_a1b2c3d4...",
 *   "user_id": 123,
 *   "valid_until": "2025-10-30 23:59:59",
 *   "usage": "请商家扫描此二维码录入消费"
 * }
 */
router.get('/qrcode/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params

    // 权限检查：只能生成自己的二维码，或管理员可生成任何用户
    if (req.user.user_id !== parseInt(user_id) && req.user.role !== 'admin') {
      return res.apiError('无权生成其他用户的二维码', 403)
    }

    logger.info('生成用户二维码', { user_id })

    // 生成二维码
    const qrCodeInfo = QRCodeValidator.generateQRCodeInfo(parseInt(user_id))

    return res.apiSuccess(
      {
        qr_code: qrCodeInfo.qr_code,
        user_id: qrCodeInfo.user_id,
        generated_at: qrCodeInfo.generated_at,
        validity: qrCodeInfo.validity, // 固定身份码，永久有效
        note: qrCodeInfo.note, // 说明：此二维码长期有效，可打印使用
        usage: '请商家扫描此二维码录入消费金额'
      },
      '二维码生成成功'
    )
  } catch (error) {
    logger.error('生成二维码失败', { error: error.message })
    return res.apiError(error.message, 500)
  }
})

/**
 * @route POST /api/v4/consumption/validate-qrcode
 * @desc 验证二维码有效性（供商家使用）
 * @access Private (商家/管理员)
 *
 * @body {string} qr_code - 要验证的二维码
 *
 * @example
 * POST /api/v4/consumption/validate-qrcode
 * {
 *   "qr_code": "QR_123_a1b2c3d4..."
 * }
 */
router.post('/validate-qrcode', authenticateToken, async (req, res) => {
  try {
    const { qr_code } = req.body

    if (!qr_code) {
      return res.apiError('二维码不能为空', 400)
    }

    logger.info('验证二维码', { qr_code: qr_code.substring(0, 20) + '...' })

    // 验证二维码
    const validation = QRCodeValidator.validateQRCode(qr_code)

    if (validation.valid) {
      return res.apiSuccess(
        {
          valid: true,
          user_id: validation.user_id,
          message: '二维码有效'
        },
        '验证成功'
      )
    } else {
      return res.apiError(validation.error, 400)
    }
  } catch (error) {
    logger.error('验证二维码失败', { error: error.message })
    return res.apiError(error.message, 500)
  }
})

/*
 * ========================================
 * API#7 统一软删除机制 - 消费记录软删除
 * ========================================
 */

/**
 * @route DELETE /api/v4/consumption/:record_id
 * @desc 软删除消费记录（用户端隐藏记录，管理员可恢复）
 * @access Private (用户自己的记录)
 *
 * @param {number} record_id - 消费记录ID（路径参数）
 *
 * @returns {Object} 删除确认信息
 * @returns {number} data.record_id - 被删除的记录ID
 * @returns {number} data.is_deleted - 删除标记（1=已删除）
 * @returns {string} data.deleted_at - 删除时间（北京时间）
 * @returns {string} data.record_type - 记录类型（consumption）
 * @returns {string} data.note - 操作说明
 *
 * @example
 * DELETE /api/v4/consumption/123
 * Response:
 * {
 *   "success": true,
 *   "message": "消费记录已删除",
 *   "data": {
 *     "record_id": 123,
 *     "is_deleted": 1,
 *     "deleted_at": "2025-11-02 14:30:00",
 *     "record_type": "consumption",
 *     "note": "消费记录已删除，将不再显示在列表中"
 *   }
 * }
 *
 * 业务规则：
 * - 只能删除自己的消费记录（通过JWT token验证user_id）
 * - 软删除：记录仍然保留在数据库中，只是标记为已删除（is_deleted=1）
 * - 前端查询时自动过滤已删除记录（WHERE is_deleted=0）
 * - 用户删除后无法自己恢复，只有管理员可以在后台恢复
 * - 删除不影响已奖励的积分（积分已发放，不会回收）
 */
router.delete('/:record_id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id // 从JWT token获取用户ID
    const { record_id } = req.params

    // 1. 参数验证：检查record_id是否为有效的正整数
    if (!record_id || isNaN(parseInt(record_id))) {
      return res.apiError('无效的记录ID，必须是正整数', 400)
    }

    const recordId = parseInt(record_id)

    // 2. 查询记录：必须是用户自己的记录且未删除
    const record = await ConsumptionService.getRecordById(recordId)

    if (!record) {
      return res.apiError('消费记录不存在或已被删除', 404)
    }

    // 3. 权限验证：只能删除自己的记录
    if (record.user_id !== userId) {
      return res.apiError('您无权删除此消费记录', 403)
    }

    // 4. 检查是否已经被删除
    if (record.is_deleted === 1) {
      return res.apiError('该消费记录已经被删除，无需重复操作', 400)
    }

    // 5. 执行软删除：标记为已删除
    const deletedAt = BeijingTimeHelper.createDatabaseTime()

    await record.update({
      is_deleted: 1, // 软删除标记
      deleted_at: deletedAt // 删除时间（北京时间）
    })

    logger.info('软删除消费记录成功', {
      record_id: recordId,
      user_id: userId,
      deleted_at: BeijingTimeHelper.formatForAPI(deletedAt)
    })

    // 6. 返回成功响应
    return res.apiSuccess(
      {
        record_id: recordId,
        is_deleted: 1,
        deleted_at: BeijingTimeHelper.formatForAPI(deletedAt),
        record_type: 'consumption',
        note: '消费记录已删除，将不再显示在列表中'
      },
      '消费记录已删除'
    )
  } catch (error) {
    logger.error('软删除消费记录失败', {
      error: error.message,
      record_id: req.params.record_id,
      user_id: req.user?.user_id
    })
    return res.apiError(error.message, 500)
  }
})

/**
 * @route POST /api/v4/consumption/:record_id/restore
 * @desc 管理员恢复已删除的消费记录（管理员专用）
 * @access Private (仅管理员)
 *
 * @param {number} record_id - 消费记录ID（路径参数）
 *
 * @returns {Object} 恢复确认信息
 * @returns {number} data.record_id - 恢复的记录ID
 * @returns {number} data.is_deleted - 删除标记（0=未删除）
 * @returns {number} data.user_id - 记录所属用户ID
 * @returns {string} data.note - 操作说明
 *
 * @example
 * POST /api/v4/consumption/123/restore
 * Response:
 * {
 *   "success": true,
 *   "message": "消费记录已恢复",
 *   "data": {
 *     "record_id": 123,
 *     "is_deleted": 0,
 *     "user_id": 456,
 *     "note": "消费记录已恢复，用户端将重新显示该记录"
 *   }
 * }
 *
 * 业务规则：
 * - 仅管理员可以恢复已删除的记录
 * - 恢复后用户端将重新显示该记录
 * - 恢复操作会清空deleted_at时间戳
 */
router.post('/:record_id/restore', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { record_id } = req.params
    const adminId = req.user.user_id

    // 1. 参数验证
    if (!record_id || isNaN(parseInt(record_id))) {
      return res.apiError('无效的记录ID', 400)
    }

    const recordId = parseInt(record_id)

    // 2. 查询已删除的记录（包含已删除的记录）
    const record = await ConsumptionService.getRecordById(recordId, { includeDeleted: true })

    if (!record) {
      return res.apiError('消费记录不存在', 404)
    }

    // 3. 检查是否已经被删除
    if (record.is_deleted === 0) {
      return res.apiError('该消费记录未被删除，无需恢复', 400)
    }

    // 4. 恢复记录：清除软删除标记
    await record.update({
      is_deleted: 0, // 恢复显示
      deleted_at: null // 清空删除时间
    })

    logger.info('管理员恢复消费记录成功', {
      record_id: recordId,
      admin_id: adminId,
      original_user_id: record.user_id
    })

    // 5. 返回成功响应
    return res.apiSuccess(
      {
        record_id: recordId,
        is_deleted: 0,
        user_id: record.user_id,
        note: '消费记录已恢复，用户端将重新显示该记录'
      },
      '消费记录已恢复'
    )
  } catch (error) {
    logger.error('恢复消费记录失败', {
      error: error.message,
      record_id: req.params.record_id,
      admin_id: req.user?.user_id
    })
    return res.apiError(error.message, 500)
  }
})

module.exports = router
