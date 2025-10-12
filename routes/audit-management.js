/**
 * 审核管理路由
 *
 * 功能：
 * 1. 批量审核订单
 * 2. 获取超时订单
 * 3. 待审核订单统计
 *
 * 路径前缀: /api/v4/audit-management
 */

const express = require('express')
const router = express.Router()
// 服务重命名（2025-10-12）：
// - ExchangeOperationService：兑换订单运营服务（批量审核、超时告警）
// - ContentAuditEngine：通用内容审核引擎（支持exchange/image/feedback）
const ExchangeOperationService = require('../services/ExchangeOperationService')
const ContentAuditEngine = require('../services/ContentAuditEngine')
const authMiddleware = require('../middleware/auth')
const ApiResponse = require('../utils/ApiResponse')
const auditLogMiddleware = require('../middleware/auditLog')

/**
 * @route POST /api/v4/audit-management/batch-approve
 * @desc 批量审核通过订单
 * @access Private (管理员)
 *
 * @body {Array<number>} exchange_ids - 订单ID数组
 * @body {string} reason - 批量审核原因（可选）
 */
router.post('/batch-approve', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const { exchange_ids, reason } = req.body
    const auditorId = req.user.user_id

    // 验证参数
    if (!Array.isArray(exchange_ids) || exchange_ids.length === 0) {
      return ApiResponse.error(res, 'exchange_ids必须是非空数组', 400)
    }

    if (exchange_ids.length > 100) {
      return ApiResponse.error(res, '批量审核最多支持100个订单', 400)
    }

    // 执行批量审核
    const result = await ExchangeOperationService.batchApproveOrders(
      auditorId,
      exchange_ids,
      reason || '批量审核通过'
    )

    return ApiResponse.success(
      res,
      result,
      `批量审核完成，成功${result.success.length}个，失败${result.failed.length}个`
    )
  } catch (error) {
    console.error('[批量审核通过] 错误:', error)
    return ApiResponse.error(res, error.message, 500)
  }
})

/**
 * @route POST /api/v4/audit-management/batch-reject
 * @desc 批量审核拒绝订单
 * @access Private (管理员)
 *
 * @body {Array<Object>} reject_items - 拒绝订单数组 [{exchange_id, reason}]
 */
router.post('/batch-reject', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const { reject_items } = req.body
    const auditorId = req.user.user_id

    // 验证参数
    if (!Array.isArray(reject_items) || reject_items.length === 0) {
      return ApiResponse.error(res, 'reject_items必须是非空数组', 400)
    }

    if (reject_items.length > 100) {
      return ApiResponse.error(res, '批量审核最多支持100个订单', 400)
    }

    // 验证每个项目的格式
    const invalidItems = reject_items.filter(
      item => !item.exchange_id || !item.reason || item.reason.length < 5
    )

    if (invalidItems.length > 0) {
      return ApiResponse.error(res, '每个订单必须包含exchange_id和reason（至少5个字符）', 400)
    }

    // 执行批量拒绝
    const result = await ExchangeOperationService.batchRejectOrders(auditorId, reject_items)

    return ApiResponse.success(
      res,
      result,
      `批量审核完成，成功${result.success.length}个，失败${result.failed.length}个`
    )
  } catch (error) {
    console.error('[批量审核拒绝] 错误:', error)
    return ApiResponse.error(res, error.message, 500)
  }
})

/**
 * @route GET /api/v4/audit-management/timeout-orders
 * @desc 获取超时待审核订单
 * @access Private (管理员)
 *
 * @query {number} hours - 超时小时数，默认24小时
 */
router.get('/timeout-orders', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24

    if (hours < 1 || hours > 720) {
      return ApiResponse.error(res, '超时小时数必须在1-720之间', 400)
    }

    const orders = await ExchangeOperationService.getTimeoutPendingOrders(hours)

    return ApiResponse.success(res, {
      timeout_hours: hours,
      count: orders.length,
      orders
    }, '获取超时订单成功')
  } catch (error) {
    console.error('[获取超时订单] 错误:', error)
    return ApiResponse.error(res, error.message, 500)
  }
})

/**
 * @route POST /api/v4/audit-management/check-timeout-alert
 * @desc 手动触发超时订单检查和告警
 * @access Private (管理员)
 *
 * @body {number} hours - 超时小时数，默认24小时
 */
router.post('/check-timeout-alert', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const { hours = 24 } = req.body

    const result = await ExchangeOperationService.checkTimeoutAndAlert(hours)

    return ApiResponse.success(
      res,
      result,
      result.hasTimeout
        ? `发现${result.count}个超时订单，已发送告警`
        : '没有超时订单'
    )
  } catch (error) {
    console.error('[超时告警检查] 错误:', error)
    return ApiResponse.error(res, error.message, 500)
  }
})

/**
 * @route GET /api/v4/audit-management/statistics
 * @desc 获取待审核订单统计信息
 * @access Private (管理员)
 */
router.get('/statistics', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const statistics = await ExchangeOperationService.getPendingOrdersStatistics()

    return ApiResponse.success(res, statistics, '获取统计信息成功')
  } catch (error) {
    console.error('[获取审核统计] 错误:', error)
    return ApiResponse.error(res, error.message, 500)
  }
})

// ========== 统一审核系统API（2025-10-11新增） ==========

/**
 * @route GET /api/v4/audit-management/unified/pending
 * @desc 获取统一审核系统的待审核记录列表
 * @access Private (管理员)
 *
 * @query {string} type - 审核类型（exchange/image/feedback，可选）
 * @query {string} priority - 优先级（high/medium/low，可选）
 * @query {number} limit - 每页数量，默认20
 * @query {number} offset - 偏移量，默认0
 */
router.get('/unified/pending', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const { type, priority, limit = 20, offset = 0 } = req.query

    const audits = await ContentAuditEngine.getPendingAudits({
      auditableType: type,
      priority,
      limit: parseInt(limit),
      offset: parseInt(offset)
    })

    return ApiResponse.success(res, {
      count: audits.length,
      audits
    }, '获取待审核记录成功')
  } catch (error) {
    console.error('[获取待审核记录] 错误:', error)
    return ApiResponse.error(res, error.message, 500)
  }
})

/**
 * @route GET /api/v4/audit-management/unified/:audit_id
 * @desc 获取审核记录详情
 * @access Private (管理员)
 */
router.get('/unified/:audit_id', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const { audit_id } = req.params

    const audit = await ContentAuditEngine.getAuditById(parseInt(audit_id))

    return ApiResponse.success(res, audit, '获取审核详情成功')
  } catch (error) {
    console.error('[获取审核详情] 错误:', error)
    return ApiResponse.error(res, error.message, 500)
  }
})

/**
 * @route POST /api/v4/audit-management/unified/:audit_id/approve
 * @desc 统一审核通过
 * @access Private (管理员)
 *
 * @body {string} reason - 审核意见（可选）
 */
router.post('/unified/:audit_id/approve', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const { audit_id } = req.params
    const { reason } = req.body
    const auditorId = req.user.user_id

    const result = await ContentAuditEngine.approve(parseInt(audit_id), auditorId, reason)

    return ApiResponse.success(res, result, '审核通过成功')
  } catch (error) {
    console.error('[统一审核通过] 错误:', error)
    return ApiResponse.error(res, error.message, 500)
  }
})

/**
 * @route POST /api/v4/audit-management/unified/:audit_id/reject
 * @desc 统一审核拒绝
 * @access Private (管理员)
 *
 * @body {string} reason - 拒绝原因（必需，至少5个字符）
 */
router.post('/unified/:audit_id/reject', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const { audit_id } = req.params
    const { reason } = req.body
    const auditorId = req.user.user_id

    if (!reason || reason.trim().length < 5) {
      return ApiResponse.error(res, '拒绝原因必须提供，且不少于5个字符', 400)
    }

    const result = await ContentAuditEngine.reject(parseInt(audit_id), auditorId, reason)

    return ApiResponse.success(res, result, '审核拒绝成功')
  } catch (error) {
    console.error('[统一审核拒绝] 错误:', error)
    return ApiResponse.error(res, error.message, 500)
  }
})

/**
 * @route GET /api/v4/audit-management/unified/statistics
 * @desc 获取统一审核系统统计信息
 * @access Private (管理员)
 *
 * @query {string} type - 审核类型（exchange/image/feedback，可选）
 */
router.get('/unified/statistics', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const { type } = req.query

    const statistics = await ContentAuditEngine.getAuditStatistics(type)

    return ApiResponse.success(res, statistics, '获取统计信息成功')
  } catch (error) {
    console.error('[获取统一审核统计] 错误:', error)
    return ApiResponse.error(res, error.message, 500)
  }
})

// ========== 操作审计日志API（2025-10-12新增） ==========

/**
 * @route GET /api/v4/audit-management/audit-logs
 * @desc 查询操作审计日志
 * @access Private (管理员)
 *
 * @query {number} operator_id - 操作员ID（可选）
 * @query {string} operation_type - 操作类型（可选）
 * @query {string} target_type - 目标对象类型（可选）
 * @query {number} target_id - 目标对象ID（可选）
 * @query {string} start_date - 开始日期（YYYY-MM-DD，可选）
 * @query {string} end_date - 结束日期（YYYY-MM-DD，可选）
 * @query {number} limit - 每页数量，默认50，最大100
 * @query {number} offset - 偏移量，默认0
 */
router.get('/audit-logs', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const {
      operator_id,
      operation_type,
      target_type,
      target_id,
      start_date,
      end_date,
      limit = 50,
      offset = 0
    } = req.query

    // 验证参数
    const limitNum = Math.min(parseInt(limit) || 50, 100)
    const offsetNum = parseInt(offset) || 0

    const queryOptions = {
      operatorId: operator_id ? parseInt(operator_id) : null,
      operationType: operation_type,
      targetType: target_type,
      targetId: target_id ? parseInt(target_id) : null,
      startDate: start_date,
      endDate: end_date,
      limit: limitNum,
      offset: offsetNum
    }

    const logs = await auditLogMiddleware.queryAuditLogs(queryOptions)

    return ApiResponse.success(res, {
      count: logs.length,
      limit: limitNum,
      offset: offsetNum,
      logs
    }, '查询审计日志成功')
  } catch (error) {
    console.error('[查询审计日志] 错误:', error)
    return ApiResponse.error(res, error.message, 500)
  }
})

/**
 * @route GET /api/v4/audit-management/audit-logs/statistics
 * @desc 获取操作审计日志统计信息
 * @access Private (管理员)
 *
 * @query {number} operator_id - 操作员ID（可选）
 * @query {string} start_date - 开始日期（YYYY-MM-DD，可选）
 * @query {string} end_date - 结束日期（YYYY-MM-DD，可选）
 */
router.get('/audit-logs/statistics', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const { operator_id, start_date, end_date } = req.query

    const statistics = await auditLogMiddleware.getAuditStatistics({
      operatorId: operator_id ? parseInt(operator_id) : null,
      startDate: start_date,
      endDate: end_date
    })

    return ApiResponse.success(res, statistics, '获取审计日志统计成功')
  } catch (error) {
    console.error('[审计日志统计] 错误:', error)
    return ApiResponse.error(res, error.message, 500)
  }
})

/**
 * @route GET /api/v4/audit-management/audit-logs/:log_id
 * @desc 获取审计日志详情
 * @access Private (管理员)
 */
router.get('/audit-logs/:log_id', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const { log_id } = req.params
    const { AuditLog, User } = require('../models')

    const log = await AuditLog.findByPk(parseInt(log_id), {
      include: [
        {
          model: User,
          as: 'operator',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ]
    })

    if (!log) {
      return ApiResponse.error(res, '审计日志不存在', 404)
    }

    return ApiResponse.success(res, log, '获取审计日志详情成功')
  } catch (error) {
    console.error('[获取审计日志详情] 错误:', error)
    return ApiResponse.error(res, error.message, 500)
  }
})

module.exports = router
