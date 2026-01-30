'use strict'

/**
 * 餐厅积分抽奖系统 V4 - 风控告警管理路由（Console域）
 *
 * 功能说明：
 * - 提供风控告警的查询和处理接口（仅限管理员）
 * - 支持按告警类型/严重程度/门店/操作员等多维度筛选
 * - 支持告警复核和状态更新
 * - 支持告警统计分析
 *
 * 业务场景（来自商家员工域权限体系升级方案 AC5）：
 * - AC5.1: 频次限制（硬阻断）- 单员工60秒内最多10次提交
 * - AC5.2: 金额告警（软提醒）- 单笔消费>5000 或 累计>2万/天
 * - AC5.3: 关联告警（软提醒）- 同一用户10分钟内被不同门店录入
 *
 * API 路径前缀：/api/v4/console/risk-alerts
 * 访问权限：admin（role_level >= 100）
 *
 * 创建时间：2026-01-12
 * 更新时间：2026-01-18 路由层合规性治理：移除直接模型访问，使用 MerchantRiskControlService
 * 依据文档：docs/商家员工域权限体系升级方案.md
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger
const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * 通过 ServiceManager 获取 MerchantRiskControlService
 *
 * @param {Object} req - Express 请求对象
 * @returns {Object} MerchantRiskControlService
 */
const getRiskControlService = req => {
  return req.app.locals.services.getService('merchant_risk_control')
}

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

  if (error.message.includes('已处理') || error.message.includes('状态')) {
    return res.apiError(error.message, 'INVALID_STATUS', null, 400)
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
 * 风控告警管理接口 (Console Domain - Admin Only)
 * =================================================================
 */

/**
 * GET /api/v4/console/risk-alerts
 * @desc 查询风控告警列表
 * @access Admin only (role_level >= 100)
 *
 * @query {string} [alert_type] - 告警类型（frequency_limit/amount_limit/duplicate_user/suspicious_pattern）
 * @query {string} [severity] - 严重程度（low/medium/high/critical）
 * @query {string} [status] - 状态（pending/reviewed/ignored）
 * @query {number} [store_id] - 门店ID
 * @query {number} [operator_id] - 操作员ID
 * @query {number} [target_user_id] - 目标用户ID
 * @query {string} [start_time] - 开始时间（北京时间）
 * @query {string} [end_time] - 结束时间（北京时间）
 * @query {boolean} [is_blocked] - 是否阻断
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量（最大100）
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const {
    alert_type,
    severity,
    status,
    store_id,
    operator_id,
    target_user_id,
    start_time,
    end_time,
    is_blocked,
    page = 1,
    page_size = 20
  } = req.query

  try {
    const MerchantRiskControlService = getRiskControlService(req)
    const result = await MerchantRiskControlService.queryRiskAlertsWithDetails(
      {
        alert_type,
        severity,
        status,
        store_id,
        operator_id,
        target_user_id,
        start_time,
        end_time,
        is_blocked
      },
      { page, page_size }
    )

    return res.apiSuccess(result, '获取风控告警列表成功')
  } catch (error) {
    return handleServiceError(error, res, '查询风控告警列表')
  }
})

/**
 * GET /api/v4/console/risk-alerts/pending
 * @desc 查询待处理的风控告警
 * @access Admin only (role_level >= 100)
 *
 * @query {string} [alert_type] - 告警类型
 * @query {string} [severity] - 严重程度
 * @query {number} [store_id] - 门店ID
 * @query {number} [operator_id] - 操作员ID
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get('/pending', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const { alert_type, severity, store_id, operator_id, page = 1, page_size = 20 } = req.query

  try {
    const MerchantRiskControlService = getRiskControlService(req)
    const result = await MerchantRiskControlService.getPendingAlerts(
      { alert_type, severity, store_id, operator_id },
      { page, page_size }
    )

    // 格式化响应
    const items = (result.items || result.alerts || []).map(alert => ({
      alert_id: alert.alert_id,
      alert_type: alert.alert_type,
      severity: alert.severity,
      rule_name: alert.rule_name,
      rule_threshold: alert.rule_threshold,
      actual_value: alert.actual_value,
      alert_message: alert.alert_message,
      is_blocked: alert.is_blocked,
      operator_id: alert.operator_id,
      store_id: alert.store_id,
      target_user_id: alert.target_user_id,
      created_at: alert.created_at
        ? BeijingTimeHelper.formatForAPI(alert.created_at)
        : alert.created_at
    }))

    return res.apiSuccess(
      {
        items,
        pagination: {
          page: result.page || parseInt(page, 10),
          page_size: result.page_size || parseInt(page_size, 10),
          total: result.total || 0,
          total_pages: result.total_pages || 0
        }
      },
      '获取待处理风控告警成功'
    )
  } catch (error) {
    return handleServiceError(error, res, '查询待处理风控告警')
  }
})

/**
 * GET /api/v4/console/risk-alerts/stats/summary
 * @desc 获取风控告警统计摘要
 * @access Admin only (role_level >= 100)
 *
 * @query {string} [start_time] - 统计开始时间
 * @query {string} [end_time] - 统计结束时间
 */
router.get('/stats/summary', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const { start_time, end_time } = req.query

  try {
    const MerchantRiskControlService = getRiskControlService(req)
    const stats = await MerchantRiskControlService.getStatsSummary({ start_time, end_time })

    return res.apiSuccess(stats, '获取风控告警统计成功')
  } catch (error) {
    return handleServiceError(error, res, '获取风控告警统计')
  }
})

/**
 * GET /api/v4/console/risk-alerts/stats/store/:store_id
 * @desc 获取门店的风控告警统计
 * @access Admin only (role_level >= 100)
 *
 * @param {number} store_id - 门店ID
 * @query {string} [start_time] - 统计开始时间
 * @query {string} [end_time] - 统计结束时间
 */
router.get('/stats/store/:store_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const { store_id } = req.params
  const { start_time, end_time } = req.query

  if (!store_id || isNaN(parseInt(store_id, 10))) {
    return res.apiError('无效的门店ID', 'INVALID_STORE_ID', null, 400)
  }

  try {
    const MerchantRiskControlService = getRiskControlService(req)
    const stats = await MerchantRiskControlService.getStoreStats(store_id, { start_time, end_time })

    return res.apiSuccess(stats, '获取门店风控统计成功')
  } catch (error) {
    return handleServiceError(error, res, '获取门店风控统计')
  }
})

/**
 * GET /api/v4/console/risk-alerts/types
 * @desc 获取所有告警类型列表
 * @access Admin only (role_level >= 100)
 */
router.get('/types', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const MerchantRiskControlService = getRiskControlService(req)
    const types = await MerchantRiskControlService.getAlertTypesList()

    return res.apiSuccess(types, '获取告警类型列表成功')
  } catch (error) {
    return handleServiceError(error, res, '获取告警类型列表')
  }
})

/**
 * POST /api/v4/console/risk-alerts/mark-all-read
 * @desc 批量标记所有待处理告警为已读
 * @access Admin only (role_level >= 100)
 *
 * @body {string} [alert_type] - 告警类型筛选（可选）
 * @body {string} [severity] - 严重程度筛选（可选）
 *
 * @since 2026-01-30 前端告警中心功能支持
 */
router.post('/mark-all-read', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const reviewed_by = req.user.user_id
  const { alert_type, severity } = req.body

  try {
    const MerchantRiskControlService = getRiskControlService(req)
    const result = await MerchantRiskControlService.markAllAsRead(reviewed_by, {
      alert_type,
      severity
    })

    return res.apiSuccess(result, result.message)
  } catch (error) {
    return handleServiceError(error, res, '批量标记告警已读')
  }
})

/**
 * GET /api/v4/console/risk-alerts/:alert_id
 * @desc 获取风控告警详情
 * @access Admin only (role_level >= 100)
 *
 * @param {number} alert_id - 告警ID
 */
router.get('/:alert_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const { alert_id } = req.params

  if (!alert_id || isNaN(parseInt(alert_id, 10))) {
    return res.apiError('无效的告警ID', 'INVALID_ALERT_ID', null, 400)
  }

  try {
    const MerchantRiskControlService = getRiskControlService(req)
    const alertDetail = await MerchantRiskControlService.getAlertDetail(parseInt(alert_id, 10))

    if (!alertDetail) {
      return res.apiError('告警记录不存在', 'ALERT_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(alertDetail, '获取风控告警详情成功')
  } catch (error) {
    return handleServiceError(error, res, '获取风控告警详情')
  }
})

/**
 * POST /api/v4/console/risk-alerts/:alert_id/review
 * @desc 复核风控告警
 * @access Admin only (role_level >= 100)
 *
 * @param {number} alert_id - 告警ID
 * @body {string} status - 新状态（reviewed/ignored）
 * @body {string} [review_notes] - 复核备注
 */
router.post('/:alert_id/review', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const { alert_id } = req.params
  const { status, review_notes } = req.body
  const reviewed_by = req.user.user_id

  if (!alert_id || isNaN(parseInt(alert_id, 10))) {
    return res.apiError('无效的告警ID', 'INVALID_ALERT_ID', null, 400)
  }

  if (!status || !['reviewed', 'ignored'].includes(status)) {
    return res.apiError('状态必须为 reviewed 或 ignored', 'INVALID_STATUS', null, 400)
  }

  try {
    const MerchantRiskControlService = getRiskControlService(req)
    const result = await MerchantRiskControlService.reviewAlert(parseInt(alert_id, 10), {
      reviewed_by,
      status,
      review_notes
    })

    return res.apiSuccess(result, `告警已${status === 'reviewed' ? '复核' : '忽略'}`)
  } catch (error) {
    return handleServiceError(error, res, '复核风控告警')
  }
})

module.exports = router
