/**
 * 管理后台 - 审计日志管理路由
 *
 * @description 管理员查看审计日志列表和详情
 * @version 1.0.0
 * @date 2026-01-09（web管理平台功能完善）
 *
 * 功能：
 * - 审计日志列表（分页、筛选）
 * - 审计日志详情
 * - 审计日志统计
 *
 * 路由挂载说明：
 * - 此模块挂载在 /api/v4/console/system/audit-logs 路径下
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
/*
 * P1-9：服务通过 ServiceManager 获取（B1-Injected + E2-Strict snake_case）
 * const AuditLogService = require('../../../../services/AuditLogService')
 */
const logger = require('../../../../utils/logger').logger

/**
 * 管理员获取审计日志列表
 * GET /api/v4/console/system/audit-logs
 *
 * @description 管理员查看所有审计日志，支持分页、筛选、排序
 *
 * @query {number} operator_id - 操作员ID筛选（可选）
 * @query {string} operation_type - 操作类型筛选（可选）
 * @query {string} target_type - 目标类型筛选（可选）
 * @query {number} target_id - 目标ID筛选（可选）
 * @query {string} start_date - 开始日期（可选）
 * @query {string} end_date - 结束日期（可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20）
 * @query {string} sort_by - 排序字段（默认created_at）
 * @query {string} sort_order - 排序方向（默认DESC）
 *
 * @returns {Object} 审计日志列表和分页信息
 *
 * @security JWT + Admin权限
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const AuditLogService = req.app.locals.services.getService('audit_log')

    const {
      operator_id,
      operation_type,
      target_type,
      target_id,
      start_date,
      end_date,
      page = 1,
      page_size = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query
    const admin_id = req.user.user_id

    logger.info('管理员查询审计日志列表', {
      admin_id,
      operator_id,
      operation_type,
      target_type,
      target_id,
      page,
      page_size
    })

    // 调用服务层方法获取审计日志列表
    const result = await AuditLogService.getAdminAuditLogs({
      operator_id: operator_id ? parseInt(operator_id) : null,
      operation_type,
      target_type,
      target_id: target_id ? parseInt(target_id) : null,
      start_date,
      end_date,
      page: parseInt(page),
      page_size: parseInt(page_size),
      sort_by,
      sort_order
    })

    logger.info('管理员查询审计日志成功', {
      admin_id,
      total: result.pagination.total,
      page: result.pagination.page
    })

    return res.apiSuccess(result, '审计日志列表查询成功')
  } catch (error) {
    logger.error('管理员查询审计日志失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })

    return res.apiError(error.message || '查询审计日志列表失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 管理员获取审计日志统计
 * GET /api/v4/console/system/audit-logs/statistics
 *
 * @description 管理员获取审计日志统计信息（今日、本周、成功、失败等）
 *
 * @query {number} operator_id - 操作员ID筛选（可选）
 * @query {string} start_date - 开始日期（可选）
 * @query {string} end_date - 结束日期（可选）
 *
 * @returns {Object} 审计日志统计信息
 *
 * @security JWT + Admin权限
 *
 * @note 此路由必须在 /:log_id 之前定义，否则 "statistics" 会被当作 log_id 解析
 */
router.get('/statistics', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const AuditLogService = req.app.locals.services.getService('audit_log')

    const { operator_id, start_date, end_date } = req.query
    const admin_id = req.user.user_id

    logger.info('管理员查询审计日志统计', {
      admin_id,
      operator_id,
      start_date,
      end_date
    })

    // 调用服务层方法获取统计信息
    const statistics = await AuditLogService.getAuditStatisticsEnhanced({
      operator_id: operator_id ? parseInt(operator_id) : null,
      start_date,
      end_date
    })

    logger.info('管理员获取审计日志统计成功', {
      admin_id,
      total: statistics.total,
      today_count: statistics.today_count
    })

    return res.apiSuccess(statistics, '审计日志统计查询成功')
  } catch (error) {
    logger.error('管理员查询审计日志统计失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })

    return res.apiError(error.message || '查询审计日志统计失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 管理员获取审计日志详情
 * GET /api/v4/console/system/audit-logs/:log_id
 *
 * @description 管理员查看审计日志详情
 *
 * @param {number} log_id - 日志ID
 *
 * @returns {Object} 审计日志详情
 *
 * @security JWT + Admin权限
 */
router.get('/:log_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const AuditLogService = req.app.locals.services.getService('audit_log')

    const { log_id } = req.params
    const admin_id = req.user.user_id

    logger.info('管理员查询审计日志详情', {
      admin_id,
      log_id
    })

    // 参数验证
    const logId = parseInt(log_id)
    if (isNaN(logId) || logId <= 0) {
      return res.apiError('无效的日志ID', 'BAD_REQUEST', null, 400)
    }

    // 调用服务层方法获取日志详情
    const log = await AuditLogService.getById(logId)

    logger.info('管理员获取审计日志详情成功', {
      admin_id,
      log_id: logId,
      operation_type: log?.operation_type
    })

    return res.apiSuccess(
      {
        success: true,
        log
      },
      '审计日志详情查询成功'
    )
  } catch (error) {
    logger.error('管理员查询审计日志详情失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id,
      log_id: req.params.log_id
    })

    // 业务错误处理
    if (error.message.includes('不存在')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }

    return res.apiError(error.message || '查询审计日志详情失败', 'INTERNAL_ERROR', null, 500)
  }
})

module.exports = router
