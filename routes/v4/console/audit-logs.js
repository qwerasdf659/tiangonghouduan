'use strict'

/**
 * 餐厅积分抽奖系统 V4 - 商家操作审计日志管理路由（Console域）
 *
 * 功能说明：
 * - 提供商家域审计日志的查询接口（仅限管理员）
 * - 支持按门店/员工/时间范围/操作类型等多维度筛选
 * - 支持统计分析（门店统计、员工统计）
 * - 支持审计日志清理（定时任务或手动触发）
 *
 * 业务场景：
 * - AC4.3: 后端提供商家操作日志查询 API，支持筛选
 * - AC4.4: 审计日志保留 180 天（定期清理）
 *
 * API 路径前缀：/api/v4/console/audit-logs
 * 访问权限：admin（role_level >= 100）
 *
 * 创建时间：2026-01-12
 * 依据文档：docs/商家员工域权限体系升级方案.md
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const MerchantOperationLogService = require('../../../services/MerchantOperationLogService')
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
 * 商家操作审计日志查询接口 (Console Domain - Admin Only)
 * =================================================================
 */

/**
 * GET /api/v4/console/audit-logs
 * @desc 查询商家操作审计日志列表
 * @access Admin only (role_level >= 100)
 *
 * @query {number} [store_id] - 门店ID
 * @query {number} [operator_id] - 操作员ID
 * @query {number} [target_user_id] - 目标用户ID
 * @query {string} [operation_type] - 操作类型（scan_user/submit_consumption/等）
 * @query {string} [action] - 操作动作（create/read/scan/update）
 * @query {string} [result] - 操作结果（success/failed/blocked）
 * @query {string} [start_time] - 开始时间（北京时间，格式：YYYY-MM-DD HH:mm:ss）
 * @query {string} [end_time] - 结束时间（北京时间，格式：YYYY-MM-DD HH:mm:ss）
 * @query {string} [request_id] - 请求ID（用于全链路追踪）
 * @query {string} [idempotency_key] - 幂等键
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量（最大100）
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const result = await MerchantOperationLogService.queryLogs(req.query)
    return res.apiSuccess(result, '获取商家操作审计日志列表成功')
  } catch (error) {
    return handleServiceError(error, res, '查询商家操作审计日志列表')
  }
})

/**
 * GET /api/v4/console/audit-logs/:merchant_log_id
 * @desc 获取商家操作审计日志详情
 * @access Admin only (role_level >= 100)
 *
 * @param {number} merchant_log_id - 审计日志ID
 */
router.get('/:merchant_log_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const { merchant_log_id } = req.params

  if (!merchant_log_id || isNaN(parseInt(merchant_log_id))) {
    return res.apiError('无效的审计日志ID', 'INVALID_LOG_ID', null, 400)
  }

  try {
    const logDetail = await MerchantOperationLogService.getLogDetail(parseInt(merchant_log_id))

    if (!logDetail) {
      return res.apiError('审计日志不存在', 'LOG_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(logDetail, '获取商家操作审计日志详情成功')
  } catch (error) {
    return handleServiceError(error, res, '获取商家操作审计日志详情')
  }
})

/**
 * GET /api/v4/console/audit-logs/stats/store/:store_id
 * @desc 获取门店的审计日志统计
 * @access Admin only (role_level >= 100)
 *
 * @param {number} store_id - 门店ID
 * @query {string} [start_time] - 统计开始时间（北京时间）
 * @query {string} [end_time] - 统计结束时间（北京时间）
 */
router.get('/stats/store/:store_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const { store_id } = req.params
  const { start_time, end_time } = req.query

  if (!store_id || isNaN(parseInt(store_id))) {
    return res.apiError('无效的门店ID', 'INVALID_STORE_ID', null, 400)
  }

  try {
    const stats = await MerchantOperationLogService.getStoreStats(parseInt(store_id), {
      start_time,
      end_time
    })

    return res.apiSuccess(stats, '获取门店审计日志统计成功')
  } catch (error) {
    return handleServiceError(error, res, '获取门店审计日志统计')
  }
})

/**
 * GET /api/v4/console/audit-logs/stats/operator/:operator_id
 * @desc 获取操作员的审计日志统计
 * @access Admin only (role_level >= 100)
 *
 * @param {number} operator_id - 操作员ID
 * @query {string} [start_time] - 统计开始时间（北京时间）
 * @query {string} [end_time] - 统计结束时间（北京时间）
 */
router.get(
  '/stats/operator/:operator_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    const { operator_id } = req.params
    const { start_time, end_time } = req.query

    if (!operator_id || isNaN(parseInt(operator_id))) {
      return res.apiError('无效的操作员ID', 'INVALID_OPERATOR_ID', null, 400)
    }

    try {
      const stats = await MerchantOperationLogService.getOperatorStats(parseInt(operator_id), {
        start_time,
        end_time
      })

      return res.apiSuccess(stats, '获取操作员审计日志统计成功')
    } catch (error) {
      return handleServiceError(error, res, '获取操作员审计日志统计')
    }
  }
)

/**
 * POST /api/v4/console/audit-logs/cleanup
 * @desc 清理过期的审计日志
 * @access Admin only (role_level >= 100)
 *
 * @body {number} [retention_days=180] - 保留天数（默认180天）
 * @body {boolean} [dry_run=false] - 干跑模式（只统计不删除）
 */
router.post('/cleanup', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const { retention_days = 180, dry_run = false } = req.body

  // 验证参数
  if (retention_days && (isNaN(parseInt(retention_days)) || retention_days < 30)) {
    return res.apiError('保留天数必须为大于等于30的整数', 'INVALID_RETENTION_DAYS', null, 400)
  }

  try {
    const result = await MerchantOperationLogService.cleanupExpiredLogs({
      retention_days: parseInt(retention_days),
      dry_run: Boolean(dry_run)
    })

    logger.info('审计日志清理操作', {
      operator_id: req.user.user_id,
      retention_days,
      dry_run,
      result
    })

    return res.apiSuccess(
      result,
      dry_run
        ? `干跑模式：发现 ${result.count_to_delete} 条待清理日志`
        : `清理完成：已删除 ${result.deleted_count} 条过期日志`
    )
  } catch (error) {
    return handleServiceError(error, res, '清理审计日志')
  }
})

/**
 * GET /api/v4/console/audit-logs/operation-types
 * @desc 获取所有支持的操作类型列表
 * @access Admin only (role_level >= 100)
 */
router.get('/operation-types', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const {
    MERCHANT_OPERATION_TYPES,
    OPERATION_TYPE_DESCRIPTIONS
  } = require('../../../models/MerchantOperationLog')

  const operationTypes = Object.entries(MERCHANT_OPERATION_TYPES).map(([key, value]) => ({
    code: value,
    name: OPERATION_TYPE_DESCRIPTIONS[value] || value,
    key
  }))

  return res.apiSuccess(
    {
      operation_types: operationTypes
    },
    '获取操作类型列表成功'
  )
})

module.exports = router
