/**
 * 待处理中心模块（Pending Center）
 *
 * @route /api/v4/console/pending
 * @description 统一待处理事项管理，提供分类汇总和列表查询
 *
 * 📌 模块说明：
 * - 此模块属于 console 域，仅限 admin（role_level >= 100）访问
 * - 汇聚4大核心待处理数据源：消费审核、客服会话、风控告警、抽奖告警
 *
 * API列表：
 * - GET /summary - 分类汇总统计（按业务分类）
 * - GET /list - 统一待处理列表（分页、筛选、紧急优先）
 *
 * 关联文档：后端数据库开发任务清单-2026年1月.md（P0-B6、P0-B7）
 *
 * @module routes/v4/console/analytics/pending
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger

/**
 * @route GET /api/v4/console/pending/summary
 * @desc 获取待处理分类汇总（按业务分类统计）
 * @access Private (管理员，role_level >= 100)
 *
 * @returns {Object} 分类汇总数据
 * @returns {Array} data.segments - 各分类统计
 * @returns {Object} data.total - 总体统计
 * @returns {string} data.updated_at - 数据更新时间
 *
 * @example
 * GET /api/v4/console/pending/summary
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "segments": [
 *       { "category": "consumption", "category_name": "消费记录审核", "count": 5, "urgent_count": 2 },
 *       { "category": "customer_service", "category_name": "客服会话", "count": 3, "urgent_count": 1 },
 *       { "category": "risk_alert", "category_name": "风控告警", "count": 1, "urgent_count": 0 },
 *       { "category": "lottery_alert", "category_name": "抽奖告警", "count": 2, "urgent_count": 1 }
 *     ],
 *     "total": { "total": 11, "urgent_count": 4 },
 *     "updated_at": "2026-01-31T14:30:00.000+08:00"
 *   },
 *   "message": "获取成功"
 * }
 */
router.get(
  '/summary',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    logger.info('[待处理中心] 获取分类汇总', {
      admin_id: req.user.user_id
    })

    // 🔄 通过 ServiceManager 获取 PendingCenterService（符合TR-005规范）
    const PendingCenterService = req.app.locals.services.getService('pending_center')
    const result = await PendingCenterService.getSegmentStats()

    return res.apiSuccess(result, '获取成功')
  })
)

/**
 * @route GET /api/v4/console/pending/list
 * @desc 获取统一待处理列表（分页、筛选）
 * @access Private (管理员，role_level >= 100)
 *
 * @query {string} [category] - 筛选分类（consumption/customer_service/risk_alert/lottery_alert）
 * @query {boolean} [urgent_only] - 仅显示紧急项（默认：false）
 * @query {number} [page] - 页码（默认：1）
 * @query {number} [page_size] - 每页数量（默认：20，最大：100）
 *
 * @returns {Object} 分页列表数据
 * @returns {Array} data.items - 待处理事项列表
 * @returns {Object} data.pagination - 分页信息
 * @returns {Object} data.filter - 当前筛选条件
 * @returns {string} data.updated_at - 数据更新时间
 *
 * @example
 * GET /api/v4/console/pending/list?category=consumption&urgent_only=true&page=1&page_size=20
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "items": [
 *       {
 *         "id": 123,
 *         "category": "consumption",
 *         "category_name": "消费记录审核",
 *         "title": "消费金额 ¥128.00",
 *         "description": "待审核消费记录",
 *         "user_id": 1001,
 *         "user_info": { "nickname": "张三", "mobile": "138****1234" },
 *         "created_at": "2026-01-31 10:30:00",
 *         "waiting_time": "4小时30分钟",
 *         "waiting_minutes": 270,
 *         "is_urgent": true,
 *         "action_url": "/admin/consumption/review/123"
 *       }
 *     ],
 *     "pagination": { "page": 1, "page_size": 20, "total": 5, "total_pages": 1 },
 *     "filter": { "category": "consumption", "urgent_only": true },
 *     "updated_at": "2026-01-31T14:30:00.000+08:00"
 *   },
 *   "message": "获取成功"
 * }
 */
/**
 * @route GET /api/v4/console/pending/health-score
 * @desc 获取待办健康度评分（综合评估待处理压力状况）
 * @access Private (管理员，role_level >= 100)
 *
 * @returns {Object} 健康度评分数据
 * @returns {number} data.score - 综合健康度评分（0-100）
 * @returns {string} data.status - 健康状态（healthy/warning/critical）
 * @returns {Object} data.components - 各维度得分明细
 * @returns {Array} data.alerts - 告警信息列表
 * @returns {string} data.updated_at - 数据更新时间
 *
 * @example
 * GET /api/v4/console/pending/health-score
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "score": 72,
 *     "status": "warning",
 *     "status_text": "压力较大，建议及时处理",
 *     "components": {
 *       "consumption": { "score": 65, "count": 8, "urgent_count": 3 },
 *       "customer_service": { "score": 80, "count": 2, "urgent_count": 0 },
 *       "risk_alert": { "score": 70, "count": 5, "urgent_count": 2 },
 *       "lottery_alert": { "score": 75, "count": 3, "urgent_count": 1 }
 *     },
 *     "alerts": [
 *       { "level": "warning", "message": "消费审核积压较多", "action": "优先处理高金额记录" }
 *     ],
 *     "updated_at": "2026-02-03T14:30:00.000+08:00"
 *   },
 *   "message": "获取成功"
 * }
 *
 * 关联需求：§3.1.1 待办健康度评分
 */
router.get(
  '/health-score',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    logger.info('[待处理中心] 获取健康度评分', {
      admin_id: req.user.user_id
    })

    // 🔄 通过 ServiceManager 获取 PendingHealthScoreService
    const PendingHealthScoreService = req.app.locals.services.getService('pending_health_score')
    const result = await PendingHealthScoreService.getHealthScore()

    return res.apiSuccess(result, '获取成功')
  })
)

router.get(
  '/list',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { category, urgent_only, page = 1, page_size = 20 } = req.query

    // 参数处理
    const options = {
      category: category || null,
      urgent_only: urgent_only === 'true' || urgent_only === true,
      page: Math.max(parseInt(page) || 1, 1),
      page_size: Math.min(Math.max(parseInt(page_size) || 20, 1), 100)
    }

    logger.info('[待处理中心] 获取统一列表', {
      admin_id: req.user.user_id,
      options
    })

    // 🔄 通过 ServiceManager 获取 PendingCenterService（符合TR-005规范）
    const PendingCenterService = req.app.locals.services.getService('pending_center')
    const result = await PendingCenterService.getUnifiedList(options)

    return res.apiSuccess(result, '获取成功')
  })
)

module.exports = router
