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
 * 依据文档：docs/商家员工域权限体系升级方案.md
 */

const express = require('express')
const router = express.Router()
const { Op } = require('sequelize')
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger
const BeijingTimeHelper = require('../../../utils/timeHelper')
const TransactionManager = require('../../../utils/TransactionManager')

// 延迟加载模型
let modelsCache = null

/**
 * 获取数据库模型实例（延迟加载）
 *
 * @returns {Object} Sequelize 模型对象集合
 */
function getModels() {
  if (!modelsCache) {
    modelsCache = require('../../../models')
  }
  return modelsCache
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
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  const { RiskAlert, User, Store } = getModels()

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

  // 构建查询条件
  const where = {}

  if (alert_type) {
    where.alert_type = alert_type
  }

  if (severity) {
    where.severity = severity
  }

  if (status) {
    where.status = status
  }

  if (store_id) {
    where.store_id = parseInt(store_id)
  }

  if (operator_id) {
    where.operator_id = parseInt(operator_id)
  }

  if (target_user_id) {
    where.target_user_id = parseInt(target_user_id)
  }

  if (is_blocked !== undefined) {
    where.is_blocked = is_blocked === 'true' || is_blocked === true
  }

  // 时间范围筛选
  if (start_time || end_time) {
    where.created_at = {}
    if (start_time) {
      where.created_at[Op.gte] = BeijingTimeHelper.parseBeijingTime(start_time)
    }
    if (end_time) {
      where.created_at[Op.lte] = BeijingTimeHelper.parseBeijingTime(end_time)
    }
  }

  // 分页参数
  const pageNum = Math.max(1, parseInt(page))
  const pageSize = Math.min(100, Math.max(1, parseInt(page_size)))
  const offset = (pageNum - 1) * pageSize

  try {
    const { count, rows } = await RiskAlert.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'operator',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: Store,
          as: 'store',
          attributes: ['store_id', 'store_name']
        },
        {
          model: User,
          as: 'targetUser',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['user_id', 'nickname']
        }
      ],
      order: [
        ['severity', 'DESC'],
        ['created_at', 'DESC']
      ],
      limit: pageSize,
      offset
    })

    const items = rows.map(alert => ({
      alert_id: alert.alert_id,
      alert_type: alert.alert_type,
      alert_type_name: RiskAlert.ALERT_TYPE_DESCRIPTIONS?.[alert.alert_type] || alert.alert_type,
      severity: alert.severity,
      rule_name: alert.rule_name,
      rule_threshold: alert.rule_threshold,
      actual_value: alert.actual_value,
      alert_message: alert.alert_message,
      is_blocked: alert.is_blocked,
      status: alert.status,
      review_notes: alert.review_notes,
      reviewed_at: alert.reviewed_at ? BeijingTimeHelper.formatForAPI(alert.reviewed_at) : null,
      created_at: BeijingTimeHelper.formatForAPI(alert.created_at),
      operator_info: alert.operator
        ? {
            user_id: alert.operator.user_id,
            nickname: alert.operator.nickname,
            mobile: alert.operator.mobile
          }
        : null,
      store_info: alert.store
        ? {
            store_id: alert.store.store_id,
            store_name: alert.store.store_name
          }
        : null,
      target_user_info: alert.targetUser
        ? {
            user_id: alert.targetUser.user_id,
            nickname: alert.targetUser.nickname,
            mobile: alert.targetUser.mobile
          }
        : null,
      reviewer_info: alert.reviewer
        ? {
            user_id: alert.reviewer.user_id,
            nickname: alert.reviewer.nickname
          }
        : null
    }))

    return res.apiSuccess(
      {
        items,
        pagination: {
          page: pageNum,
          page_size: pageSize,
          total: count,
          total_pages: Math.ceil(count / pageSize)
        }
      },
      '获取风控告警列表成功'
    )
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
router.get('/pending', authenticateToken, requireAdmin, async (req, res) => {
  const { RiskAlert } = getModels()

  const { alert_type, severity, store_id, operator_id, page = 1, page_size = 20 } = req.query

  try {
    const result = await RiskAlert.getPendingAlerts(
      { alert_type, severity, store_id, operator_id },
      { page: parseInt(page), page_size: parseInt(page_size) }
    )

    const items = result.items.map(alert => ({
      alert_id: alert.alert_id,
      alert_type: alert.alert_type,
      alert_type_name: RiskAlert.ALERT_TYPE_DESCRIPTIONS?.[alert.alert_type] || alert.alert_type,
      severity: alert.severity,
      rule_name: alert.rule_name,
      rule_threshold: alert.rule_threshold,
      actual_value: alert.actual_value,
      alert_message: alert.alert_message,
      is_blocked: alert.is_blocked,
      operator_id: alert.operator_id,
      store_id: alert.store_id,
      target_user_id: alert.target_user_id,
      created_at: BeijingTimeHelper.formatForAPI(alert.created_at)
    }))

    return res.apiSuccess(
      {
        items,
        pagination: {
          page: result.page,
          page_size: result.page_size,
          total: result.total,
          total_pages: result.total_pages
        }
      },
      '获取待处理风控告警成功'
    )
  } catch (error) {
    return handleServiceError(error, res, '查询待处理风控告警')
  }
})

/**
 * GET /api/v4/console/risk-alerts/:alert_id
 * @desc 获取风控告警详情
 * @access Admin only (role_level >= 100)
 *
 * @param {number} alert_id - 告警ID
 */
router.get('/:alert_id', authenticateToken, requireAdmin, async (req, res) => {
  const { RiskAlert, User, Store, ConsumptionRecord } = getModels()
  const { alert_id } = req.params

  if (!alert_id || isNaN(parseInt(alert_id))) {
    return res.apiError('无效的告警ID', 'INVALID_ALERT_ID', null, 400)
  }

  try {
    const alert = await RiskAlert.findByPk(parseInt(alert_id), {
      include: [
        {
          model: User,
          as: 'operator',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: Store,
          as: 'store',
          attributes: ['store_id', 'store_name', 'address']
        },
        {
          model: User,
          as: 'targetUser',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['user_id', 'nickname']
        },
        {
          model: ConsumptionRecord,
          as: 'relatedRecord',
          attributes: ['record_id', 'consumption_amount', 'points_earned', 'status', 'created_at']
        }
      ]
    })

    if (!alert) {
      return res.apiError('告警记录不存在', 'ALERT_NOT_FOUND', null, 404)
    }

    const alertDetail = {
      alert_id: alert.alert_id,
      alert_type: alert.alert_type,
      alert_type_name: RiskAlert.ALERT_TYPE_DESCRIPTIONS?.[alert.alert_type] || alert.alert_type,
      severity: alert.severity,
      rule_name: alert.rule_name,
      rule_threshold: alert.rule_threshold,
      actual_value: alert.actual_value,
      alert_message: alert.alert_message,
      is_blocked: alert.is_blocked,
      status: alert.status,
      review_notes: alert.review_notes,
      reviewed_at: alert.reviewed_at ? BeijingTimeHelper.formatForAPI(alert.reviewed_at) : null,
      created_at: BeijingTimeHelper.formatForAPI(alert.created_at),
      operator_info: alert.operator
        ? {
            user_id: alert.operator.user_id,
            nickname: alert.operator.nickname,
            mobile: alert.operator.mobile
          }
        : null,
      store_info: alert.store
        ? {
            store_id: alert.store.store_id,
            store_name: alert.store.store_name,
            address: alert.store.address
          }
        : null,
      target_user_info: alert.targetUser
        ? {
            user_id: alert.targetUser.user_id,
            nickname: alert.targetUser.nickname,
            mobile: alert.targetUser.mobile
          }
        : null,
      reviewer_info: alert.reviewer
        ? {
            user_id: alert.reviewer.user_id,
            nickname: alert.reviewer.nickname
          }
        : null,
      related_record_info: alert.relatedRecord
        ? {
            record_id: alert.relatedRecord.record_id,
            consumption_amount: parseFloat(alert.relatedRecord.consumption_amount),
            points_earned: alert.relatedRecord.points_earned,
            status: alert.relatedRecord.status,
            created_at: BeijingTimeHelper.formatForAPI(alert.relatedRecord.created_at)
          }
        : null
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
router.post('/:alert_id/review', authenticateToken, requireAdmin, async (req, res) => {
  const { RiskAlert } = getModels()
  const { alert_id } = req.params
  const { status, review_notes } = req.body
  const reviewed_by = req.user.user_id

  if (!alert_id || isNaN(parseInt(alert_id))) {
    return res.apiError('无效的告警ID', 'INVALID_ALERT_ID', null, 400)
  }

  if (!status || !['reviewed', 'ignored'].includes(status)) {
    return res.apiError('状态必须为 reviewed 或 ignored', 'INVALID_STATUS', null, 400)
  }

  try {
    const alert = await TransactionManager.execute(async transaction => {
      return await RiskAlert.reviewAlert(
        parseInt(alert_id),
        { reviewed_by, status, review_notes },
        { transaction }
      )
    })

    logger.info('风控告警已复核', {
      alert_id: parseInt(alert_id),
      reviewed_by,
      status,
      review_notes
    })

    return res.apiSuccess(
      {
        alert_id: alert.alert_id,
        status: alert.status,
        reviewed_by: alert.reviewed_by,
        review_notes: alert.review_notes,
        reviewed_at: BeijingTimeHelper.formatForAPI(alert.reviewed_at)
      },
      `告警已${status === 'reviewed' ? '复核' : '忽略'}`
    )
  } catch (error) {
    return handleServiceError(error, res, '复核风控告警')
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
router.get('/stats/summary', authenticateToken, requireAdmin, async (req, res) => {
  const { RiskAlert } = getModels()
  const { start_time, end_time } = req.query

  // 构建时间条件
  const timeCondition = {}
  if (start_time) {
    timeCondition[Op.gte] = BeijingTimeHelper.parseBeijingTime(start_time)
  }
  if (end_time) {
    timeCondition[Op.lte] = BeijingTimeHelper.parseBeijingTime(end_time)
  }

  const where = {}
  if (Object.keys(timeCondition).length > 0) {
    where.created_at = timeCondition
  }

  try {
    // 总数统计
    const totalCount = await RiskAlert.count({ where })
    const pendingCount = await RiskAlert.count({ where: { ...where, status: 'pending' } })
    const reviewedCount = await RiskAlert.count({ where: { ...where, status: 'reviewed' } })
    const ignoredCount = await RiskAlert.count({ where: { ...where, status: 'ignored' } })
    const blockedCount = await RiskAlert.count({ where: { ...where, is_blocked: true } })

    // 按告警类型统计
    const byType = await RiskAlert.findAll({
      attributes: ['alert_type', [RiskAlert.sequelize.fn('COUNT', '*'), 'count']],
      where,
      group: ['alert_type'],
      raw: true
    })

    const typeStats = {}
    byType.forEach(item => {
      typeStats[item.alert_type] = parseInt(item.count)
    })

    // 按严重程度统计
    const bySeverity = await RiskAlert.findAll({
      attributes: ['severity', [RiskAlert.sequelize.fn('COUNT', '*'), 'count']],
      where,
      group: ['severity'],
      raw: true
    })

    const severityStats = {}
    bySeverity.forEach(item => {
      severityStats[item.severity] = parseInt(item.count)
    })

    // 今日新增
    const todayStart = BeijingTimeHelper.getTodayRange().start
    const todayCount = await RiskAlert.count({
      where: {
        created_at: { [Op.gte]: todayStart }
      }
    })

    return res.apiSuccess(
      {
        total: totalCount,
        by_status: {
          pending: pendingCount,
          reviewed: reviewedCount,
          ignored: ignoredCount
        },
        blocked_count: blockedCount,
        by_type: typeStats,
        by_severity: severityStats,
        today_count: todayCount,
        time_range: {
          start_time: start_time || null,
          end_time: end_time || null
        }
      },
      '获取风控告警统计成功'
    )
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
router.get('/stats/store/:store_id', authenticateToken, requireAdmin, async (req, res) => {
  const { RiskAlert } = getModels()
  const { store_id } = req.params
  const { start_time, end_time } = req.query

  if (!store_id || isNaN(parseInt(store_id))) {
    return res.apiError('无效的门店ID', 'INVALID_STORE_ID', null, 400)
  }

  // 构建时间条件
  const timeCondition = {}
  if (start_time) {
    timeCondition[Op.gte] = BeijingTimeHelper.parseBeijingTime(start_time)
  }
  if (end_time) {
    timeCondition[Op.lte] = BeijingTimeHelper.parseBeijingTime(end_time)
  }

  const where = { store_id: parseInt(store_id) }
  if (Object.keys(timeCondition).length > 0) {
    where.created_at = timeCondition
  }

  try {
    const totalCount = await RiskAlert.count({ where })
    const pendingCount = await RiskAlert.count({ where: { ...where, status: 'pending' } })
    const blockedCount = await RiskAlert.count({ where: { ...where, is_blocked: true } })

    // 按告警类型统计
    const byType = await RiskAlert.findAll({
      attributes: ['alert_type', [RiskAlert.sequelize.fn('COUNT', '*'), 'count']],
      where,
      group: ['alert_type'],
      raw: true
    })

    const typeStats = {}
    byType.forEach(item => {
      typeStats[item.alert_type] = parseInt(item.count)
    })

    // 按操作员统计 TOP 5
    const topOperators = await RiskAlert.findAll({
      attributes: ['operator_id', [RiskAlert.sequelize.fn('COUNT', '*'), 'count']],
      where,
      group: ['operator_id'],
      order: [[RiskAlert.sequelize.literal('count'), 'DESC']],
      limit: 5,
      raw: true
    })

    return res.apiSuccess(
      {
        store_id: parseInt(store_id),
        total: totalCount,
        pending: pendingCount,
        blocked: blockedCount,
        by_type: typeStats,
        top_operators: topOperators.map(item => ({
          operator_id: item.operator_id,
          alert_count: parseInt(item.count)
        })),
        time_range: {
          start_time: start_time || null,
          end_time: end_time || null
        }
      },
      '获取门店风控统计成功'
    )
  } catch (error) {
    return handleServiceError(error, res, '获取门店风控统计')
  }
})

/**
 * GET /api/v4/console/risk-alerts/types
 * @desc 获取所有告警类型列表
 * @access Admin only (role_level >= 100)
 */
router.get('/types', authenticateToken, requireAdmin, async (req, res) => {
  const { RiskAlert } = getModels()

  const alertTypes = Object.entries(RiskAlert.ALERT_TYPES || {}).map(([key, value]) => ({
    code: value,
    name: RiskAlert.ALERT_TYPE_DESCRIPTIONS?.[value] || value,
    key
  }))

  const severityLevels = Object.entries(RiskAlert.SEVERITY_LEVELS || {}).map(([key, value]) => ({
    code: value,
    name: key.toLowerCase(),
    key
  }))

  const alertStatus = Object.entries(RiskAlert.ALERT_STATUS || {}).map(([key, value]) => ({
    code: value,
    name: key.toLowerCase(),
    key
  }))

  return res.apiSuccess(
    {
      alert_types: alertTypes,
      severity_levels: severityLevels,
      alert_status: alertStatus
    },
    '获取告警类型列表成功'
  )
})

module.exports = router
