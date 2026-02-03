/**
 * 客服管理 - 会话列表和统计模块
 *
 * 业务范围：
 * - 获取客服会话列表
 * - 获取会话统计信息
 *
 * 架构规范：
 * - 路由层不直连 models（通过 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 *
 * 创建时间：2025-12-22
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../../utils/logger').logger
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')

// 所有路由都需要后台访问权限（role_level >= 1 即可访问客服功能）
router.use(authenticateToken, requireRoleLevel(1))

/**
 * GET /sessions - 获取会话列表
 *
 * @description 获取客服会话列表，支持分页、筛选、排序
 * @route GET /api/v4/console/customer-service/sessions
 * @access Admin
 */
router.get('/', async (req, res) => {
  try {
    // 通过 ServiceManager 获取 AdminCustomerServiceService
    const AdminCustomerServiceService = req.app.locals.services.getService('admin_customer_service')

    const options = {
      page: req.query.page,
      page_size: req.query.page_size,
      status: req.query.status,
      admin_id: req.query.admin_id,
      search: req.query.search,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order
    }

    // 调用服务层方法
    const result = await AdminCustomerServiceService.getSessionList(options)

    res.apiSuccess(result, '获取会话列表成功')
  } catch (error) {
    logger.error('获取会话列表失败:', error)
    res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /sessions/stats - 获取会话统计
 *
 * @description 获取会话统计信息（待处理、进行中、已关闭等）
 * @route GET /api/v4/console/customer-service/sessions/stats
 * @access Admin
 */
router.get('/stats', async (req, res) => {
  try {
    // 通过 ServiceManager 获取 AdminCustomerServiceService
    const AdminCustomerServiceService = req.app.locals.services.getService('admin_customer_service')

    const admin_id = req.query.admin_id ? parseInt(req.query.admin_id) : undefined

    // 调用服务层方法
    const stats = await AdminCustomerServiceService.getSessionStats(admin_id)

    res.apiSuccess(stats, '获取统计信息成功')
  } catch (error) {
    logger.error('获取统计信息失败:', error)
    res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /sessions/response-stats - 获取客服响应时长统计
 *
 * @description 统计客服响应时长指标（平均响应时间、达标率、分布等）
 * @route GET /api/v4/console/customer-service/sessions/response-stats
 * @access Admin (role_level >= 100)
 *
 * @query {number} [days=7] - 统计天数（默认7天）
 *
 * @returns {Object} 响应时长统计数据
 * @returns {Object} data.summary - 汇总数据（平均响应时间、达标率）
 * @returns {Array} data.distribution - 响应时间分布
 * @returns {Array} data.trend - 每日趋势
 * @returns {Array} data.admin_ranking - 客服排行
 * @returns {string} data.updated_at - 数据更新时间
 *
 * @example
 * GET /api/v4/console/customer-service/sessions/response-stats?days=7
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "summary": {
 *       "avg_response_seconds": 180,
 *       "avg_response_display": "3分钟",
 *       "compliance_rate": 0.85,
 *       "total_sessions": 120,
 *       "responded_sessions": 102
 *     },
 *     "distribution": [
 *       { "range": "0-60秒", "count": 45, "percentage": 0.44 },
 *       { "range": "1-3分钟", "count": 35, "percentage": 0.34 },
 *       { "range": "3-5分钟", "count": 15, "percentage": 0.15 },
 *       { "range": ">5分钟", "count": 7, "percentage": 0.07 }
 *     ],
 *     "trend": [
 *       { "date": "2026-02-01", "avg_response_seconds": 150, "count": 18 }
 *     ],
 *     "admin_ranking": [
 *       { "admin_id": 1, "admin_name": "客服A", "avg_response_seconds": 120, "sessions_count": 50 }
 *     ],
 *     "updated_at": "2026-02-03T14:30:00.000+08:00"
 *   },
 *   "message": "获取成功"
 * }
 *
 * 关联需求：§4.7.1 客服响应统计接口
 */
router.get('/response-stats', async (req, res) => {
  try {
    const { days = 7 } = req.query

    logger.info('[客服管理] 获取响应时长统计', {
      admin_id: req.user.user_id,
      days: parseInt(days)
    })

    // 🔄 通过 ServiceManager 获取 CustomerServiceResponseStatsService
    const CustomerServiceResponseStatsService =
      req.app.locals.services.getService('cs_response_stats')
    const result = await CustomerServiceResponseStatsService.getResponseStats({
      days: parseInt(days) || 7
    })

    res.apiSuccess(result, '获取成功')
  } catch (error) {
    logger.error('[客服管理] 获取响应时长统计失败:', error)
    res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

module.exports = router
