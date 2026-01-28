'use strict'

/**
 * 餐厅积分抽奖系统 V4 - 管理员操作审计日志管理路由（Console域）
 *
 * 功能说明：
 * - 提供管理员操作审计日志（admin_operation_logs表）的只读查询接口
 * - 支持按操作员/操作类型/目标类型/时间范围等多维度筛选
 * - 支持统计分析（操作类型统计、操作员统计）
 *
 * 业务场景：
 * - P1优先级：管理员操作审计日志只读查询
 * - 用于系统安全审计和问题追溯
 *
 * API 路径前缀：/api/v4/console/admin-audit-logs
 * 访问权限：admin + ops（只读查询，符合P1优先级权限要求）
 *
 * 架构规范：
 * - 路由层不直连 models（通过 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 *
 * 创建时间：2026-01-21
 * 依据文档：docs/数据库表API覆盖率分析报告.md
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const AuditLogService = require('../../../services/AuditLogService')
const logger = require('../../../utils/logger').logger

/**
 * 处理服务层错误
 *
 * @param {Error} error - 错误对象
 * @param {Object} res - Express 响应对象
 * @param {string} operation - 操作名称
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
 * 管理员操作审计日志查询接口 (Console Domain - Admin Only)
 * =================================================================
 */

/**
 * GET /api/v4/console/admin-audit-logs
 * @desc 查询管理员操作审计日志列表
 * @access Admin only (role_level >= 100)
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

    const result = await AuditLogService.getAdminAuditLogs({
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
 * GET /api/v4/console/admin-audit-logs/:log_id
 * @desc 获取管理员操作审计日志详情
 * @access Admin only (role_level >= 100)
 *
 * @param {number} log_id - 审计日志ID
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

    const logDetail = await AuditLogService.getById(parseInt(log_id))

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

/**
 * GET /api/v4/console/admin-audit-logs/statistics/summary
 * @desc 获取管理员操作审计日志统计摘要
 * @access Admin only (role_level >= 100)
 *
 * @query {string} [start_date] - 统计开始日期（北京时间，格式：YYYY-MM-DD）
 * @query {string} [end_date] - 统计结束日期（北京时间，格式：YYYY-MM-DD）
 */
router.get('/statistics/summary', authenticateToken, requireRoleLevel(30), async (req, res) => {
  const { start_date, end_date } = req.query

  try {
    logger.info('管理员查询操作审计日志统计', {
      admin_id: req.user.user_id,
      start_date,
      end_date
    })

    const statistics = await AuditLogService.getAuditStatistics({
      start_date: start_date || null,
      end_date: end_date || null
    })

    logger.info('获取管理员操作审计日志统计成功', {
      admin_id: req.user.user_id,
      total_logs: statistics.total_logs || 0
    })

    return res.apiSuccess(statistics, '获取管理员操作审计日志统计成功')
  } catch (error) {
    return handleServiceError(error, res, '获取管理员操作审计日志统计')
  }
})

/**
 * GET /api/v4/console/admin-audit-logs/operation-types
 * @desc 获取所有支持的操作类型列表
 * @access Admin only (role_level >= 100)
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

    return res.apiSuccess(
      {
        operation_types: operationTypes
      },
      '获取操作类型列表成功'
    )
  } catch (error) {
    return handleServiceError(error, res, '获取操作类型列表')
  }
})

/**
 * GET /api/v4/console/admin-audit-logs/target-types
 * @desc 获取所有支持的目标类型列表
 * @access Admin only (role_level >= 100)
 */
router.get('/target-types', authenticateToken, requireRoleLevel(30), async (req, res) => {
  try {
    const {
      TARGET_TYPES,
      TARGET_TYPE_DESCRIPTIONS
    } = require('../../../constants/AuditTargetTypes')

    const targetTypes = Object.entries(TARGET_TYPES).map(([key, value]) => ({
      code: value,
      name: TARGET_TYPE_DESCRIPTIONS?.[value] || value,
      key
    }))

    logger.info('获取目标类型列表成功', {
      admin_id: req.user.user_id,
      count: targetTypes.length
    })

    return res.apiSuccess(
      {
        target_types: targetTypes
      },
      '获取目标类型列表成功'
    )
  } catch (error) {
    return handleServiceError(error, res, '获取目标类型列表')
  }
})

module.exports = router
