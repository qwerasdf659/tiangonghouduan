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

/**
 * @route GET /api/v4/console/dashboard/business-health
 * @desc 获取全局业务健康度评分（综合评估业务运营状况）
 * @access Private (管理员，role_level >= 100)
 *
 * @returns {Object} 业务健康度数据
 * @returns {number} data.score - 综合健康度评分（0-100）
 * @returns {string} data.status - 健康状态（healthy/warning/critical）
 * @returns {Object} data.components - 各维度得分明细
 * @returns {Array} data.recommendations - 优化建议列表
 * @returns {string} data.updated_at - 数据更新时间
 *
 * @example
 * GET /api/v4/console/dashboard/business-health
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "score": 78,
 *     "status": "healthy",
 *     "status_text": "业务运转良好",
 *     "components": {
 *       "asset_flow": { "score": 75, "weight": 0.4, "details": {...} },
 *       "lottery_activity": { "score": 82, "weight": 0.3, "details": {...} },
 *       "user_growth": { "score": 78, "weight": 0.3, "details": {...} }
 *     },
 *     "recommendations": [
 *       { "priority": "medium", "message": "用户转化率偏低，建议优化活动策略" }
 *     ],
 *     "updated_at": "2026-02-03T14:30:00.000+08:00"
 *   },
 *   "message": "获取成功"
 * }
 *
 * 关联需求：§3.1.2 全局业务健康度评分
 */
router.get('/business-health', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    logger.info('[运营看板] 获取业务健康度评分', {
      admin_id: req.user.user_id
    })

    // 🔄 通过 ServiceManager 获取 BusinessHealthScoreService
    const BusinessHealthScoreService = req.app.locals.services.getService('business_health_score')
    const result = await BusinessHealthScoreService.getBusinessHealthScore()

    return res.apiSuccess(result, '获取成功')
  } catch (error) {
    logger.error('[运营看板] 获取业务健康度失败', { error: error.message })
    return handleServiceError(error, res, '获取业务健康度失败')
  }
})

/**
 * @route GET /api/v4/console/dashboard/time-comparison
 * @desc 获取时间对比数据（本周vs上周、本月vs上月）
 * @access Private (管理员，role_level >= 100)
 *
 * @query {string} [dimension] - 统计维度（consumption/lottery/user），默认全部
 *
 * @returns {Object} 时间对比数据
 * @returns {Object} data.week_comparison - 周对比（本周vs上周）
 * @returns {Object} data.month_comparison - 月对比（本月vs上月）
 * @returns {string} data.updated_at - 数据更新时间
 *
 * @example
 * GET /api/v4/console/dashboard/time-comparison?dimension=consumption
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "week_comparison": {
 *       "this_week": { "amount": 50000, "count": 120 },
 *       "last_week": { "amount": 45000, "count": 110 },
 *       "change_rate": { "amount": 0.1111, "count": 0.0909 }
 *     },
 *     "month_comparison": {
 *       "this_month": { "amount": 200000, "count": 480 },
 *       "last_month": { "amount": 180000, "count": 450 },
 *       "change_rate": { "amount": 0.1111, "count": 0.0667 }
 *     },
 *     "updated_at": "2026-02-03T14:30:00.000+08:00"
 *   },
 *   "message": "获取成功"
 * }
 *
 * 关联需求：§4.3 时间对比数据
 */
router.get('/time-comparison', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { dimension } = req.query

    logger.info('[运营看板] 获取时间对比数据', {
      admin_id: req.user.user_id,
      dimension
    })

    // 🔄 通过 ServiceManager 获取 MultiDimensionStatsService
    const MultiDimensionStatsService = req.app.locals.services.getService('multi_dimension_stats')
    const result = await MultiDimensionStatsService.getTimeComparison({
      dimension: dimension || null
    })

    return res.apiSuccess(result, '获取成功')
  } catch (error) {
    logger.error('[运营看板] 获取时间对比数据失败', { error: error.message })
    return handleServiceError(error, res, '获取时间对比数据失败')
  }
})

module.exports = router
