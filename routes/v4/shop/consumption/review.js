/**
 * 消费记录管理模块 - 管理员审核
 *
 * @route /api/v4/shop/consumption
 * @description 管理员审核消费记录（通过/拒绝）
 *
 * API列表：
 * - GET /pending - 管理员查询待审核的消费记录
 * - GET /admin/records - 管理员查询所有消费记录（支持筛选、搜索、统计）
 * - POST /approve/:record_id - 管理员审核通过消费记录
 * - POST /reject/:record_id - 管理员审核拒绝消费记录
 *
 * 业务场景：
 * - 审核通过后自动奖励积分（1元=1分）
 * - 审核拒绝需要填写原因（5-500字符）
 *
 * 创建时间：2025年12月22日
 * 从consumption.js拆分而来
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const BeijingTimeHelper = require('../../../../utils/timeHelper')

/**
 * @route GET /api/v4/shop/consumption/pending
 * @desc 管理员查询待审核的消费记录
 * @access Private (管理员)
 *
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大100）
 */
router.get('/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionService（符合TR-005规范）
    const ConsumptionService = req.app.locals.services.getService('consumption')

    const { page = 1, page_size = 20 } = req.query

    // 分页参数验证
    const finalPageSize = Math.min(parseInt(page_size) || 20, 100)
    const finalPage = Math.max(parseInt(page) || 1, 1)

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
    return handleServiceError(error, res, '查询待审核记录失败')
  }
})

/**
 * @route GET /api/v4/shop/consumption/admin/records
 * @desc 管理员查询所有消费记录（支持筛选、搜索、统计）
 * @access Private (管理员)
 *
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大100）
 * @query {string} status - 状态筛选（pending/approved/rejected/all，默认all）
 * @query {string} search - 搜索关键词（手机号、用户昵称）
 *
 * @returns {Object} {
 *   records: Array - 消费记录列表
 *   pagination: Object - 分页信息
 *   statistics: Object - 统计数据（待审核、今日审核、通过、拒绝）
 * }
 */
router.get('/admin/records', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionService（符合TR-005规范）
    const ConsumptionService = req.app.locals.services.getService('consumption')

    const { page = 1, page_size = 20, status = 'all', search = '' } = req.query

    logger.info('管理员查询消费记录', {
      admin_id: req.user.user_id,
      page,
      page_size,
      status,
      search
    })

    // 调用服务层查询
    const result = await ConsumptionService.getAdminRecords({
      page: parseInt(page),
      page_size: parseInt(page_size),
      status,
      search
    })

    return res.apiSuccess(result, '查询成功')
  } catch (error) {
    logger.error('管理员查询消费记录失败', { error: error.message })
    return handleServiceError(error, res, '查询消费记录失败')
  }
})

/**
 * @route POST /api/v4/shop/consumption/approve/:record_id
 * @desc 管理员审核通过消费记录
 * @access Private (管理员)
 *
 * @param {number} record_id - 消费记录ID
 * @body {string} admin_notes - 审核备注（可选）
 *
 * @returns {Object} 审核结果
 * @returns {number} data.record_id - 消费记录ID
 * @returns {string} data.status - 新状态（approved）
 * @returns {number} data.points_awarded - 奖励的积分数
 * @returns {number} data.new_balance - 用户新的积分余额
 * @returns {string} data.reviewed_at - 审核时间（北京时间）
 *
 * @example
 * POST /api/v4/shop/consumption/approve/123
 * {
 *   "admin_notes": "核实无误，审核通过"
 * }
 */
router.post('/approve/:record_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionService（符合TR-005规范）
    const ConsumptionService = req.app.locals.services.getService('consumption')

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
    logger.error('审核通过失败', {
      error: error.message,
      record_id: req.params.record_id,
      reviewer_id: req.user.user_id
    })
    return handleServiceError(error, res, '审核通过失败')
  }
})

/**
 * @route POST /api/v4/shop/consumption/reject/:record_id
 * @desc 管理员审核拒绝消费记录
 * @access Private (管理员)
 *
 * @param {number} record_id - 消费记录ID
 * @body {string} admin_notes - 拒绝原因（必填，5-500字符）
 *
 * @returns {Object} 审核结果
 * @returns {number} data.record_id - 消费记录ID
 * @returns {string} data.status - 新状态（rejected）
 * @returns {string} data.reject_reason - 拒绝原因
 * @returns {string} data.reviewed_at - 审核时间（北京时间）
 *
 * @example
 * POST /api/v4/shop/consumption/reject/123
 * {
 *   "admin_notes": "消费金额与实际不符"
 * }
 */
router.post('/reject/:record_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionService（符合TR-005规范）
    const ConsumptionService = req.app.locals.services.getService('consumption')

    const { record_id } = req.params
    const { admin_notes } = req.body
    const reviewerId = req.user.user_id

    // 验证拒绝原因（5-500字符）
    if (!admin_notes || admin_notes.trim().length < 5) {
      return res.apiError('拒绝原因不能为空，且至少5个字符', 'BAD_REQUEST', null, 400)
    }

    // 增加最大长度限制（防止超长文本影响性能和前端显示）
    if (admin_notes.length > 500) {
      return res.apiError('拒绝原因最多500个字符，请精简描述', 'BAD_REQUEST', null, 400)
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
      reason: admin_notes.substring(0, 50)
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
    return handleServiceError(error, res, '审核拒绝失败')
  }
})

module.exports = router
