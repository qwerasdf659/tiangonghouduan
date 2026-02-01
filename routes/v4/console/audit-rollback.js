/**
 * 审计回滚路由
 *
 * 功能说明：
 * - 可回滚操作查询：获取可回滚的操作列表
 * - 回滚执行：执行一键回滚
 * - 回滚历史：查看已回滚的操作
 * - 审计统计：操作审计统计分析
 *
 * 任务编号：B-43 回滚接口, B-45 审计统计接口
 * 创建时间：2026年01月31日
 *
 * @module routes/v4/console/audit-rollback
 */

'use strict'

const express = require('express')
const router = express.Router()
const ServiceManager = require('../../../services')
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { highRiskOperationMiddleware } = require('../../../middleware/highRiskOperationMiddleware')
const logger = require('../../../utils/logger')

// ==================== 可回滚操作 (B-43) ====================

/**
 * GET /api/v4/console/audit-rollback/rollbackable
 *
 * 获取可回滚的操作列表
 *
 * 查询参数:
 * - operator_id: 操作者ID筛选
 * - operation_type: 操作类型筛选
 * - start_time: 开始时间
 * - end_time: 结束时间
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 */
router.get('/rollbackable', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const rollbackService = ServiceManager.getService('audit_rollback')
    const { operator_id, operation_type, start_time, end_time, page, page_size } = req.query

    const result = await rollbackService.getRollbackableLogs({
      operator_id: operator_id ? parseInt(operator_id, 10) : undefined,
      operation_type,
      start_time: start_time ? new Date(start_time) : undefined,
      end_time: end_time ? new Date(end_time) : undefined,
      page: parseInt(page, 10) || 1,
      page_size: parseInt(page_size, 10) || 20
    })

    return res.apiSuccess(result, '获取可回滚操作列表成功')
  } catch (error) {
    logger.error('[审计回滚] 获取可回滚列表失败', { error: error.message })
    return res.apiError('获取可回滚操作列表失败', 'ROLLBACKABLE_LIST_ERROR', null, 500)
  }
})

/**
 * GET /api/v4/console/audit-rollback/history
 *
 * 获取回滚历史
 *
 * 查询参数:
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 */
router.get('/history', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const rollbackService = ServiceManager.getService('audit_rollback')
    const { page, page_size } = req.query

    const result = await rollbackService.getRollbackHistory({
      page: parseInt(page, 10) || 1,
      page_size: parseInt(page_size, 10) || 20
    })

    return res.apiSuccess(result, '获取回滚历史成功')
  } catch (error) {
    logger.error('[审计回滚] 获取回滚历史失败', { error: error.message })
    return res.apiError('获取回滚历史失败', 'ROLLBACK_HISTORY_ERROR', null, 500)
  }
})

/**
 * GET /api/v4/console/audit-rollback/check/:log_id
 *
 * 检查操作是否可回滚
 */
router.get('/check/:log_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const rollbackService = ServiceManager.getService('audit_rollback')
    const logId = parseInt(req.params.log_id, 10)

    if (!logId || isNaN(logId)) {
      return res.apiError('无效的日志ID', 'INVALID_LOG_ID', null, 400)
    }

    const result = await rollbackService.checkRollbackable(logId)

    return res.apiSuccess(result, '检查回滚状态完成')
  } catch (error) {
    logger.error('[审计回滚] 检查回滚状态失败', { error: error.message })
    return res.apiError('检查回滚状态失败', 'CHECK_ROLLBACK_ERROR', null, 500)
  }
})

/**
 * POST /api/v4/console/audit-rollback/:log_id/execute
 *
 * 执行回滚操作（高风险操作，需要二次确认）
 *
 * 请求体:
 * - reason: 回滚原因
 * - _confirmed: 确认标记（必需为true）
 */
router.post(
  '/:log_id/execute',
  authenticateToken,
  requireRoleLevel(100),
  highRiskOperationMiddleware,
  async (req, res) => {
    try {
      const rollbackService = ServiceManager.getService('audit_rollback')
      const logId = parseInt(req.params.log_id, 10)

      if (!logId || isNaN(logId)) {
        return res.apiError('无效的日志ID', 'INVALID_LOG_ID', null, 400)
      }

      const { reason } = req.body

      const result = await rollbackService.rollback(logId, {
        operator_id: req.user.user_id,
        reason
      })

      logger.info('[审计回滚] 回滚执行成功', {
        log_id: logId,
        operator_id: req.user.user_id,
        result
      })

      return res.apiSuccess(result, '回滚操作执行成功')
    } catch (error) {
      logger.error('[审计回滚] 回滚执行失败', {
        log_id: req.params.log_id,
        error: error.message
      })
      return res.apiError(`回滚执行失败: ${error.message}`, 'ROLLBACK_EXECUTE_ERROR', null, 500)
    }
  }
)

// ==================== 审计统计 (B-45) ====================

/**
 * GET /api/v4/console/audit-rollback/stats
 *
 * 获取审计统计数据
 *
 * 查询参数:
 * - start_time: 开始时间
 * - end_time: 结束时间
 */
router.get('/stats', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const rollbackService = ServiceManager.getService('audit_rollback')
    const { start_time, end_time } = req.query

    const stats = await rollbackService.getAuditStats({
      start_time: start_time ? new Date(start_time) : undefined,
      end_time: end_time ? new Date(end_time) : undefined
    })

    return res.apiSuccess(stats, '获取审计统计成功')
  } catch (error) {
    logger.error('[审计回滚] 获取审计统计失败', { error: error.message })
    return res.apiError('获取审计统计失败', 'AUDIT_STATS_ERROR', null, 500)
  }
})

/**
 * GET /api/v4/console/audit-rollback/stats/by-operator
 *
 * 按操作者统计
 *
 * 查询参数:
 * - start_time: 开始时间
 * - end_time: 结束时间
 * - limit: 返回数量（默认10）
 */
router.get('/stats/by-operator', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { AdminOperationLog, User } = require('../../../models')
    const { Op } = require('sequelize')
    const sequelize = require('../../../models').sequelize

    const { start_time, end_time, limit } = req.query

    const where = {}
    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) {
        where.created_at[Op.gte] = new Date(start_time)
      }
      if (end_time) {
        where.created_at[Op.lte] = new Date(end_time)
      }
    }

    const stats = await AdminOperationLog.findAll({
      where,
      attributes: [
        'operator_id',
        [sequelize.fn('COUNT', sequelize.col('log_id')), 'total_operations'],
        [
          sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('operation_type'))),
          'operation_types'
        ]
      ],
      include: [
        {
          model: User,
          as: 'operator',
          attributes: ['nickname']
        }
      ],
      group: ['operator_id', 'operator.user_id', 'operator.nickname'],
      order: [[sequelize.fn('COUNT', sequelize.col('log_id')), 'DESC']],
      limit: parseInt(limit, 10) || 10,
      raw: false
    })

    const result = stats.map(item => ({
      operator_id: item.operator_id,
      nickname: item.operator?.nickname || 'Unknown',
      total_operations: parseInt(item.dataValues.total_operations, 10),
      operation_types: parseInt(item.dataValues.operation_types, 10)
    }))

    return res.apiSuccess(result, '获取操作者统计成功')
  } catch (error) {
    logger.error('[审计回滚] 获取操作者统计失败', { error: error.message })
    return res.apiError('获取操作者统计失败', 'OPERATOR_STATS_ERROR', null, 500)
  }
})

/**
 * GET /api/v4/console/audit-rollback/stats/by-risk-level
 *
 * 按风险等级统计
 *
 * 查询参数:
 * - start_time: 开始时间
 * - end_time: 结束时间
 */
router.get('/stats/by-risk-level', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { AdminOperationLog } = require('../../../models')
    const { Op } = require('sequelize')
    const sequelize = require('../../../models').sequelize

    const { start_time, end_time } = req.query

    const where = {}
    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) {
        where.created_at[Op.gte] = new Date(start_time)
      }
      if (end_time) {
        where.created_at[Op.lte] = new Date(end_time)
      }
    }

    const stats = await AdminOperationLog.findAll({
      where,
      attributes: ['risk_level', [sequelize.fn('COUNT', sequelize.col('log_id')), 'count']],
      group: ['risk_level'],
      raw: true
    })

    const result = {}
    stats.forEach(item => {
      result[item.risk_level] = parseInt(item.count, 10)
    })

    return res.apiSuccess(result, '获取风险等级统计成功')
  } catch (error) {
    logger.error('[审计回滚] 获取风险等级统计失败', { error: error.message })
    return res.apiError('获取风险等级统计失败', 'RISK_LEVEL_STATS_ERROR', null, 500)
  }
})

module.exports = router
