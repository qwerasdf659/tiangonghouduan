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
 * 管理员生成审计报告（F-59 审计报告功能）
 * GET /api/v4/console/system/audit-logs/report
 *
 * @description 生成综合审计报告，包含汇总统计、分组统计和趋势数据
 *
 * @query {string} time_range - 时间范围 (7d/30d/90d/custom)，默认 7d
 * @query {string} start_date - 自定义开始日期 (YYYY-MM-DD)，time_range=custom 时必填
 * @query {string} end_date - 自定义结束日期 (YYYY-MM-DD)，time_range=custom 时必填
 * @query {number} operator_id - 特定操作员ID筛选（可选）
 *
 * @returns {Object} 审计报告数据
 * @returns {Object} data.summary - 汇总统计（总操作数、高风险数、回滚数、独立操作员数）
 * @returns {Array} data.by_operation_type - 按操作类型分组统计
 * @returns {Array} data.by_target_type - 按目标类型分组统计
 * @returns {Array} data.by_operator - 按操作员分组统计
 * @returns {Array} data.by_risk_level - 按风险等级分组统计
 * @returns {Array} data.trend - 时间趋势数据（按天分组）
 * @returns {Object} data.report_meta - 报告元数据（生成时间、时间范围）
 *
 * @security JWT + Admin权限
 *
 * @note 此路由必须在 /:log_id 之前定义，否则 "report" 会被当作 log_id 解析
 */
router.get('/report', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const AuditLogService = req.app.locals.services.getService('audit_log')

    const { time_range = '7d', start_date, end_date, operator_id } = req.query
    const admin_id = req.user.user_id

    logger.info('管理员生成审计报告', {
      admin_id,
      time_range,
      start_date,
      end_date,
      operator_id
    })

    // 参数验证
    const validTimeRanges = ['7d', '30d', '90d', 'custom']
    if (!validTimeRanges.includes(time_range)) {
      return res.apiError(
        '无效的时间范围参数，支持：7d/30d/90d/custom',
        'BAD_REQUEST',
        { valid_values: validTimeRanges },
        400
      )
    }

    // 自定义时间范围需要提供 start_date 和 end_date
    if (time_range === 'custom') {
      if (!start_date || !end_date) {
        return res.apiError(
          '自定义时间范围需要提供 start_date 和 end_date 参数',
          'BAD_REQUEST',
          null,
          400
        )
      }
      // 验证日期格式
      const datePattern = /^\d{4}-\d{2}-\d{2}$/
      if (!datePattern.test(start_date) || !datePattern.test(end_date)) {
        return res.apiError(
          '日期格式无效，应为 YYYY-MM-DD',
          'BAD_REQUEST',
          { expected_format: 'YYYY-MM-DD' },
          400
        )
      }
    }

    // 调用服务层方法生成审计报告
    const report = await AuditLogService.generateAuditReport({
      time_range,
      start_date,
      end_date,
      operator_id: operator_id ? parseInt(operator_id) : null
    })

    logger.info('管理员审计报告生成成功', {
      admin_id,
      time_range,
      total_operations: report.summary.total_operations,
      high_risk_count: report.summary.high_risk_count
    })

    return res.apiSuccess(report, '审计报告生成成功')
  } catch (error) {
    logger.error('管理员生成审计报告失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })

    return res.apiError(error.message || '生成审计报告失败', 'INTERNAL_ERROR', null, 500)
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
