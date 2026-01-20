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
const { authenticateToken, requireRole } = require('../../../../middleware/auth')

// 所有路由都需要管理员权限
router.use(authenticateToken, requireRole(['admin', 'ops']))

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

module.exports = router
