/**
 * 运营看板模块（Dashboard）
 *
 * @route /api/v4/console/dashboard
 * @description 运营看板数据聚合接口，提供待处理事项统计
 *
 * 📌 模块说明：
 * - 此模块属于 console 域，仅限 admin（role_level >= 100）访问
 * - 提供运营首页看板所需的聚合数据
 *
 * API列表：
 * - GET /pending-summary - 待处理事项聚合统计
 *
 * 创建时间：2026年01月31日
 * 关联文档：后端数据库开发任务清单-2026年1月.md（P0-B5）
 *
 * @module routes/v4/console/dashboard
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger

/**
 * @route GET /api/v4/console/dashboard/pending-summary
 * @desc 获取待处理事项聚合统计（运营看板用）
 * @access Private (管理员，role_level >= 100)
 *
 * @returns {Object} 待处理聚合数据
 * @returns {Object} data.consumption_pending - 消费记录待审核统计
 * @returns {Object} data.customer_service_pending - 客服会话待处理统计
 * @returns {Object} data.risk_alerts - 风控告警统计
 * @returns {Object} data.lottery_alerts - 抽奖告警统计
 * @returns {Object} data.total - 总体统计
 * @returns {string} data.updated_at - 数据更新时间
 *
 * @example
 * GET /api/v4/console/dashboard/pending-summary
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "consumption_pending": { "count": 5, "urgent_count": 2, "oldest_minutes": 180 },
 *     "customer_service_pending": { "count": 3, "urgent_count": 1, "oldest_minutes": 45 },
 *     "risk_alerts": { "count": 1, "urgent_count": 0 },
 *     "lottery_alerts": { "count": 2, "urgent_count": 1 },
 *     "total": { "total_count": 11, "urgent_count": 4 },
 *     "updated_at": "2026-01-31T14:30:00.000+08:00"
 *   },
 *   "message": "获取成功"
 * }
 */
router.get('/pending-summary', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    logger.info('[运营看板] 获取待处理聚合统计', {
      admin_id: req.user.user_id
    })

    // 🔄 通过 ServiceManager 获取 PendingSummaryService（符合TR-005规范）
    const PendingSummaryService = req.app.locals.services.getService('pending_summary')
    const result = await PendingSummaryService.getPendingSummary()

    return res.apiSuccess(result, '获取成功')
  } catch (error) {
    logger.error('[运营看板] 获取待处理统计失败', { error: error.message })
    return handleServiceError(error, res, '获取待处理统计失败')
  }
})

module.exports = router
