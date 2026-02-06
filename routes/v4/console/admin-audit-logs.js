'use strict'

/**
 * 餐厅积分抽奖系统 V4 - 管理员操作审计日志管理路由（Console域）
 *
 * 功能说明：
 * - 提供管理员操作审计日志（admin_operation_logs表）的只读查询接口
 * - 支持按操作员/操作类型/目标类型/时间范围等多维度筛选
 * - 支持统计分析（操作类型统计、操作员统计）
 * - 支持审计报告生成（综合汇总、分组统计、趋势数据）
 *
 * 业务场景：
 * - 管理员操作审计日志只读查询
 * - 系统安全审计和问题追溯
 * - 审计报告生成（按时间范围汇总统计）
 *
 * API 路径前缀：/api/v4/console/admin-audit-logs
 * 访问权限：admin + ops（只读查询）
 *
 * 架构规范：
 * - 路由层不直连 models（通过 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 *
 * ⚠️ 路由定义顺序说明：
 * Express 按注册顺序匹配路由，动态参数 /:log_id 会吞掉 /report、/statistics 等静态路径。
 * 因此所有静态路径（/report、/statistics、/operation-types、/target-types）
 * 必须在动态参数路由 /:log_id 之前定义。
 *
 * 创建时间：2026-01-21
 * 更新时间：2026-02-06（合并 system/audit-logs.js 的 report 和 statistics 端点，修正路由定义顺序）
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger

/**
 * 获取审计日志服务（通过 ServiceManager 统一入口）
 * @param {Object} req - Express 请求对象
 * @returns {Object} AuditLogService 实例
 */
function getAuditLogService(req) {
  return req.app.locals.services.getService('audit_log')
}

/**
 * 处理服务层错误（统一错误响应格式）
 *
 * @param {Error} error - 错误对象
 * @param {Object} res - Express 响应对象
 * @param {string} operation - 操作名称（用于日志记录）
 * @returns {Object} Express 响应对象
 */
function handleServiceError(error, res, operation) {
  logger.error(`❌ ${operation}失败`, { error: error.message, stack: error.stack })

  if (error.message.includes('不存在') || error.message.includes('not found')) {
    return res.apiError(error.message, 'NOT_FOUND', null, 404)
  }

  if (
    error.message.includes('不能为空') ||
    error.message.includes('无效') ||
    error.message.includes('必填') ||
    error.message.includes('缺少')
  ) {
    return res.apiError(error.message, 'VALIDATION_ERROR', null, 400)
  }

  return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
}

/*
 * =================================================================
 * 管理员操作审计日志查询接口 (Console Domain)
 *
 * 路由定义顺序：静态路径在前，动态参数 /:log_id 在最后
 * =================================================================
 */

/**
 * GET /api/v4/console/admin-audit-logs
 * @desc 查询管理员操作审计日志列表（分页、多维度筛选）
 * @access admin + ops (role_level >= 30)
 *
 * @query {number} [operator_id] - 操作员ID（管理员user_id）
 * @query {string} [operation_type] - 操作类型（user_update/points_adjust/item_transfer等）
 * @query {string} [target_type] - 目标对象类型（user/item/prize等）
 * @query {number} [target_id] - 目标对象ID
 * @query {string} [start_date] - 开始日期（北京时间，格式：YYYY-MM-DD）
 * @query {string} [end_date] - 结束日期（北京时间，格式：YYYY-MM-DD）
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量（最大100）
 * @query {string} [sort_by=created_at] - 排序字段
 * @query {string} [sort_order=DESC] - 排序方向（ASC/DESC）
 */
router.get('/', authenticateToken, requireRoleLevel(30), async (req, res) => {
  try {
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

    logger.info('管理员查询操作审计日志列表', {
      admin_id: req.user.user_id,
      filters: { operator_id, operation_type, target_type, start_date, end_date },
      page,
      page_size
    })

    const result = await getAuditLogService(req).getAdminAuditLogs({
      operator_id: operator_id ? parseInt(operator_id) : null,
      operation_type: operation_type || null,
      target_type: target_type || null,
      target_id: target_id ? parseInt(target_id) : null,
      start_date: start_date || null,
      end_date: end_date || null,
      page: parseInt(page),
      page_size: Math.min(parseInt(page_size), 100),
      sort_by,
      sort_order
    })

    logger.info('查询管理员操作审计日志成功', {
      admin_id: req.user.user_id,
      total: result.pagination?.total || 0,
      page: parseInt(page)
    })

    return res.apiSuccess(result, '获取管理员操作审计日志列表成功')
  } catch (error) {
    return handleServiceError(error, res, '查询管理员操作审计日志列表')
  }
})

/**
 * GET /api/v4/console/admin-audit-logs/report
 * @desc 生成综合审计报告（汇总统计、分组统计、趋势数据）
 * @access admin + ops (role_level >= 30)
 *
 * @query {string} [time_range=7d] - 时间范围（7d/30d/90d/custom）
 * @query {string} [start_date] - 自定义开始日期（YYYY-MM-DD），time_range=custom 时必填
 * @query {string} [end_date] - 自定义结束日期（YYYY-MM-DD），time_range=custom 时必填
 * @query {number} [operator_id] - 特定操作员ID筛选
 *
 * @returns {Object} data.summary - 汇总统计（总操作数、高风险数、回滚数、独立操作员数）
 * @returns {Array} data.by_operation_type - 按操作类型分组统计
 * @returns {Array} data.by_target_type - 按目标类型分组统计
 * @returns {Array} data.by_operator - 按操作员分组统计
 * @returns {Array} data.by_risk_level - 按风险等级分组统计
 * @returns {Array} data.trend - 时间趋势数据（按天分组）
 * @returns {Object} data.report_meta - 报告元数据（生成时间、时间范围）
 */
router.get('/report', authenticateToken, requireRoleLevel(30), async (req, res) => {
  try {
    const { time_range = '7d', start_date, end_date, operator_id } = req.query

    logger.info('管理员生成审计报告', {
      admin_id: req.user.user_id,
      time_range,
      start_date,
      end_date,
      operator_id
    })

    /* 参数验证：时间范围 */
    const validTimeRanges = ['7d', '30d', '90d', 'custom']
    if (!validTimeRanges.includes(time_range)) {
      return res.apiError(
        '无效的时间范围参数，支持：7d/30d/90d/custom',
        'VALIDATION_ERROR',
        { valid_values: validTimeRanges },
        400
      )
    }

    /* 自定义时间范围需要 start_date 和 end_date */
    if (time_range === 'custom') {
      if (!start_date || !end_date) {
        return res.apiError(
          '自定义时间范围需要提供 start_date 和 end_date 参数',
          'VALIDATION_ERROR',
          null,
          400
        )
      }
      const datePattern = /^\d{4}-\d{2}-\d{2}$/
      if (!datePattern.test(start_date) || !datePattern.test(end_date)) {
        return res.apiError(
          '日期格式无效，应为 YYYY-MM-DD',
          'VALIDATION_ERROR',
          { expected_format: 'YYYY-MM-DD' },
          400
        )
      }
    }

    const report = await getAuditLogService(req).generateAuditReport({
      time_range,
      start_date: start_date || null,
      end_date: end_date || null,
      operator_id: operator_id ? parseInt(operator_id) : null
    })

    logger.info('管理员审计报告生成成功', {
      admin_id: req.user.user_id,
      time_range,
      total_operations: report.summary?.total_operations
    })

    return res.apiSuccess(report, '审计报告生成成功')
  } catch (error) {
    return handleServiceError(error, res, '生成审计报告')
  }
})

/**
 * GET /api/v4/console/admin-audit-logs/statistics
 * @desc 获取增强版审计日志统计（今日、本周、操作类型分布、风险等级分布等多维度统计）
 * @access admin + ops (role_level >= 30)
 *
 * @query {number} [operator_id] - 操作员ID筛选
 * @query {string} [start_date] - 开始日期（YYYY-MM-DD）
 * @query {string} [end_date] - 结束日期（YYYY-MM-DD）
 *
 * @returns {Object} 增强版审计日志统计信息
 */
router.get('/statistics', authenticateToken, requireRoleLevel(30), async (req, res) => {
  try {
    const { operator_id, start_date, end_date } = req.query

    logger.info('管理员查询增强版审计日志统计', {
      admin_id: req.user.user_id,
      operator_id,
      start_date,
      end_date
    })

    const statistics = await getAuditLogService(req).getAuditStatisticsEnhanced({
      operator_id: operator_id ? parseInt(operator_id) : null,
      start_date: start_date || null,
      end_date: end_date || null
    })

    logger.info('获取增强版审计日志统计成功', {
      admin_id: req.user.user_id,
      total: statistics.total,
      today_count: statistics.today_count
    })

    return res.apiSuccess(statistics, '审计日志统计查询成功')
  } catch (error) {
    return handleServiceError(error, res, '获取增强版审计日志统计')
  }
})

/**
 * GET /api/v4/console/admin-audit-logs/statistics/summary
 * @desc 获取审计日志基础统计摘要（简化版统计）
 * @access admin + ops (role_level >= 30)
 *
 * @query {string} [start_date] - 统计开始日期（北京时间，格式：YYYY-MM-DD）
 * @query {string} [end_date] - 统计结束日期（北京时间，格式：YYYY-MM-DD）
 */
router.get('/statistics/summary', authenticateToken, requireRoleLevel(30), async (req, res) => {
  const { start_date, end_date } = req.query

  try {
    logger.info('管理员查询操作审计日志基础统计', {
      admin_id: req.user.user_id,
      start_date,
      end_date
    })

    const statistics = await getAuditLogService(req).getAuditStatistics({
      start_date: start_date || null,
      end_date: end_date || null
    })

    logger.info('获取管理员操作审计日志基础统计成功', {
      admin_id: req.user.user_id,
      total_logs: statistics.total_logs || 0
    })

    return res.apiSuccess(statistics, '获取管理员操作审计日志基础统计成功')
  } catch (error) {
    return handleServiceError(error, res, '获取管理员操作审计日志基础统计')
  }
})

/**
 * GET /api/v4/console/admin-audit-logs/operation-types
 * @desc 获取所有支持的操作类型列表（枚举查询，供前端筛选器使用）
 * @access admin + ops (role_level >= 30)
 */
router.get('/operation-types', authenticateToken, requireRoleLevel(30), async (req, res) => {
  try {
    const {
      OPERATION_TYPES,
      OPERATION_TYPE_DESCRIPTIONS
    } = require('../../../constants/AuditOperationTypes')

    const operationTypes = Object.entries(OPERATION_TYPES).map(([key, value]) => ({
      code: value,
      name: OPERATION_TYPE_DESCRIPTIONS[value] || value,
      key
    }))

    logger.info('获取操作类型列表成功', {
      admin_id: req.user.user_id,
      count: operationTypes.length
    })

    return res.apiSuccess({ operation_types: operationTypes }, '获取操作类型列表成功')
  } catch (error) {
    return handleServiceError(error, res, '获取操作类型列表')
  }
})

/**
 * GET /api/v4/console/admin-audit-logs/target-types
 * @desc 获取所有支持的目标类型列表（枚举查询，供前端筛选器使用）
 * @access admin + ops (role_level >= 30)
 */
router.get('/target-types', authenticateToken, requireRoleLevel(30), async (req, res) => {
  try {
    const {
      AUDIT_TARGET_TYPES,
      getTargetTypeDisplayName
    } = require('../../../constants/AuditTargetTypes')

    const targetTypes = Object.entries(AUDIT_TARGET_TYPES).map(([key, value]) => ({
      code: value,
      name: getTargetTypeDisplayName(value) || value,
      key
    }))

    logger.info('获取目标类型列表成功', {
      admin_id: req.user.user_id,
      count: targetTypes.length
    })

    return res.apiSuccess({ target_types: targetTypes }, '获取目标类型列表成功')
  } catch (error) {
    return handleServiceError(error, res, '获取目标类型列表')
  }
})

/*
 * =================================================================
 * ⚠️ 动态参数路由必须放在最后（避免吞掉上面的静态路径）
 * =================================================================
 */

/**
 * GET /api/v4/console/admin-audit-logs/:log_id
 * @desc 获取管理员操作审计日志详情（单条记录查询）
 * @access admin + ops (role_level >= 30)
 *
 * @param {number} log_id - 审计日志ID（事务实体，数字ID）
 */
router.get('/:log_id', authenticateToken, requireRoleLevel(30), async (req, res) => {
  const { log_id } = req.params

  if (!log_id || isNaN(parseInt(log_id))) {
    return res.apiError('无效的审计日志ID', 'INVALID_LOG_ID', null, 400)
  }

  try {
    logger.info('管理员查询操作审计日志详情', {
      admin_id: req.user.user_id,
      log_id: parseInt(log_id)
    })

    const logDetail = await getAuditLogService(req).getById(parseInt(log_id))

    if (!logDetail) {
      return res.apiError('审计日志不存在', 'LOG_NOT_FOUND', null, 404)
    }

    logger.info('获取管理员操作审计日志详情成功', {
      admin_id: req.user.user_id,
      log_id: parseInt(log_id),
      operation_type: logDetail.operation_type
    })

    return res.apiSuccess(logDetail, '获取管理员操作审计日志详情成功')
  } catch (error) {
    return handleServiceError(error, res, '获取管理员操作审计日志详情')
  }
})

module.exports = router
