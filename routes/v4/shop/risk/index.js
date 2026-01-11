/**
 * 风险告警管理路由
 *
 * @route /api/v4/shop/risk
 * @description 风控告警查询/复核/忽略 API（AC5）
 *
 * API列表：
 * - GET /alerts - 查询风险告警列表
 * - GET /alerts/:alert_id - 查询单条告警详情
 * - POST /alerts/:alert_id/review - 复核告警（标记为已处理）
 * - POST /alerts/:alert_id/ignore - 忽略告警
 * - GET /stats - 获取风控统计概览
 *
 * 权限控制：
 * - 需要 staff:manage 权限（店长/管理员）
 * - 非管理员只能查看/处理所属门店的告警
 *
 * 创建时间：2026-01-12
 * 依据文档：docs/商家员工域权限体系升级方案.md AC5
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireMerchantPermission } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const MerchantRiskControlService = require('../../../../services/MerchantRiskControlService')
const { RiskAlert, User, Store, ConsumptionRecord } = require('../../../../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../../../../utils/timeHelper')

/**
 * @route GET /api/v4/shop/risk/alerts
 * @desc 查询风险告警列表
 * @access Private (店长或管理员，需 staff:manage 权限)
 *
 * @query {number} store_id - 门店ID（可选，管理员可不传查全部）
 * @query {string} alert_type - 告警类型（可选：frequency_limit/amount_limit/duplicate_user）
 * @query {string} severity - 严重程度（可选：low/medium/high/critical）
 * @query {string} status - 状态（可选：pending/reviewed/ignored）
 * @query {string} start_date - 开始日期（可选）
 * @query {string} end_date - 结束日期（可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页条数（默认20）
 *
 * @returns {Object} 告警列表
 */
router.get(
  '/alerts',
  authenticateToken,
  requireMerchantPermission('staff:manage', { scope: 'store', storeIdParam: 'query' }),
  async (req, res) => {
    try {
      const {
        store_id,
        alert_type,
        severity,
        status,
        start_date,
        end_date,
        page = 1,
        page_size = 20
      } = req.query

      const user_stores = req.user_stores || []

      // 确定查询的门店范围
      let resolved_store_id = req.verified_store_id || (store_id ? parseInt(store_id, 10) : null)

      // 非管理员限制只能查看所属门店
      if (req.user.role_level < 100 && !resolved_store_id) {
        if (user_stores.length === 0) {
          return res.apiError('您未绑定任何门店', 'NO_STORE_BINDING', null, 403)
        } else if (user_stores.length === 1) {
          resolved_store_id = user_stores[0].store_id
        } else {
          return res.apiError(
            '您绑定了多个门店，请明确指定 store_id 参数',
            'MULTIPLE_STORES_REQUIRE_STORE_ID',
            {
              available_stores: user_stores.map(s => ({
                store_id: s.store_id,
                store_name: s.store_name
              }))
            },
            400
          )
        }
      }

      // 构建筛选条件
      const filters = {}
      if (resolved_store_id) filters.store_id = resolved_store_id
      if (alert_type) filters.alert_type = alert_type
      if (severity) filters.severity = severity
      if (status) filters.status = status
      if (start_date) filters.start_date = BeijingTimeHelper.parseFromDateString(start_date)
      if (end_date) {
        const endDateTime = BeijingTimeHelper.parseFromDateString(end_date)
        endDateTime.setHours(23, 59, 59, 999)
        filters.end_date = endDateTime
      }

      const result = await MerchantRiskControlService.queryRiskAlerts(filters, {
        page: parseInt(page, 10),
        page_size: parseInt(page_size, 10)
      })

      return res.apiSuccess(result, '风险告警列表获取成功')
    } catch (error) {
      logger.error('获取风险告警列表失败', { error: error.message })
      return handleServiceError(error, res, '获取风险告警列表失败')
    }
  }
)

/**
 * @route GET /api/v4/shop/risk/alerts/:alert_id
 * @desc 查询单条告警详情
 * @access Private (店长或管理员，需 staff:manage 权限)
 */
router.get(
  '/alerts/:alert_id',
  authenticateToken,
  requireMerchantPermission('staff:manage', { scope: 'global' }),
  async (req, res) => {
    try {
      const { alert_id } = req.params
      const alertId = parseInt(alert_id, 10)

      if (isNaN(alertId) || alertId <= 0) {
        return res.apiError('无效的告警ID', 'BAD_REQUEST', null, 400)
      }

      const alert = await RiskAlert.findByPk(alertId, {
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
          },
          {
            model: ConsumptionRecord,
            as: 'relatedRecord',
            attributes: ['record_id', 'consumption_amount', 'status', 'created_at']
          }
        ]
      })

      if (!alert) {
        return res.apiError('告警不存在', 'NOT_FOUND', null, 404)
      }

      // 非管理员只能查看所属门店的告警
      const user_stores = req.user_stores || []
      if (req.user.role_level < 100 && alert.store_id) {
        const hasAccess = user_stores.some(s => s.store_id === alert.store_id)
        if (!hasAccess) {
          return res.apiError('无权查看此告警', 'FORBIDDEN', null, 403)
        }
      }

      const result = {
        ...(alert.toAPIResponse ? alert.toAPIResponse() : alert.toJSON()),
        operator: alert.operator
          ? {
              user_id: alert.operator.user_id,
              nickname: alert.operator.nickname,
              mobile: alert.operator.mobile
            }
          : null,
        store: alert.store
          ? {
              store_id: alert.store.store_id,
              store_name: alert.store.store_name
            }
          : null,
        target_user: alert.targetUser
          ? {
              user_id: alert.targetUser.user_id,
              nickname: alert.targetUser.nickname,
              mobile: alert.targetUser.mobile
            }
          : null,
        reviewer: alert.reviewer
          ? {
              user_id: alert.reviewer.user_id,
              nickname: alert.reviewer.nickname
            }
          : null,
        related_record: alert.relatedRecord
          ? {
              record_id: alert.relatedRecord.record_id,
              consumption_amount: parseFloat(alert.relatedRecord.consumption_amount),
              status: alert.relatedRecord.status,
              created_at: BeijingTimeHelper.formatForAPI(alert.relatedRecord.created_at)
            }
          : null
      }

      return res.apiSuccess(result, '告警详情获取成功')
    } catch (error) {
      logger.error('获取告警详情失败', { error: error.message })
      return handleServiceError(error, res, '获取告警详情失败')
    }
  }
)

/**
 * @route POST /api/v4/shop/risk/alerts/:alert_id/review
 * @desc 复核告警（标记为已处理）
 * @access Private (店长或管理员，需 staff:manage 权限)
 *
 * @body {string} review_notes - 复核备注（可选）
 */
router.post(
  '/alerts/:alert_id/review',
  authenticateToken,
  requireMerchantPermission('staff:manage', { scope: 'global' }),
  async (req, res) => {
    try {
      const { alert_id } = req.params
      const { review_notes } = req.body
      const alertId = parseInt(alert_id, 10)

      if (isNaN(alertId) || alertId <= 0) {
        return res.apiError('无效的告警ID', 'BAD_REQUEST', null, 400)
      }

      // 验证告警存在且用户有权限
      const alert = await RiskAlert.findByPk(alertId)
      if (!alert) {
        return res.apiError('告警不存在', 'NOT_FOUND', null, 404)
      }

      // 非管理员只能处理所属门店的告警
      const user_stores = req.user_stores || []
      if (req.user.role_level < 100 && alert.store_id) {
        const hasAccess = user_stores.some(s => s.store_id === alert.store_id)
        if (!hasAccess) {
          return res.apiError('无权处理此告警', 'FORBIDDEN', null, 403)
        }
      }

      const result = await MerchantRiskControlService.updateAlertStatus(alertId, {
        status: 'reviewed',
        reviewer_id: req.user.user_id,
        review_notes
      })

      logger.info('✅ 风险告警已复核', {
        alert_id: alertId,
        reviewer_id: req.user.user_id
      })

      return res.apiSuccess(result, '告警已标记为已复核')
    } catch (error) {
      logger.error('复核告警失败', { error: error.message })
      return handleServiceError(error, res, '复核告警失败')
    }
  }
)

/**
 * @route POST /api/v4/shop/risk/alerts/:alert_id/ignore
 * @desc 忽略告警
 * @access Private (店长或管理员，需 staff:manage 权限)
 *
 * @body {string} review_notes - 忽略原因（推荐填写）
 */
router.post(
  '/alerts/:alert_id/ignore',
  authenticateToken,
  requireMerchantPermission('staff:manage', { scope: 'global' }),
  async (req, res) => {
    try {
      const { alert_id } = req.params
      const { review_notes } = req.body
      const alertId = parseInt(alert_id, 10)

      if (isNaN(alertId) || alertId <= 0) {
        return res.apiError('无效的告警ID', 'BAD_REQUEST', null, 400)
      }

      // 验证告警存在且用户有权限
      const alert = await RiskAlert.findByPk(alertId)
      if (!alert) {
        return res.apiError('告警不存在', 'NOT_FOUND', null, 404)
      }

      // 非管理员只能处理所属门店的告警
      const user_stores = req.user_stores || []
      if (req.user.role_level < 100 && alert.store_id) {
        const hasAccess = user_stores.some(s => s.store_id === alert.store_id)
        if (!hasAccess) {
          return res.apiError('无权处理此告警', 'FORBIDDEN', null, 403)
        }
      }

      const result = await MerchantRiskControlService.updateAlertStatus(alertId, {
        status: 'ignored',
        reviewer_id: req.user.user_id,
        review_notes
      })

      logger.info('✅ 风险告警已忽略', {
        alert_id: alertId,
        reviewer_id: req.user.user_id
      })

      return res.apiSuccess(result, '告警已忽略')
    } catch (error) {
      logger.error('忽略告警失败', { error: error.message })
      return handleServiceError(error, res, '忽略告警失败')
    }
  }
)

/**
 * @route GET /api/v4/shop/risk/stats
 * @desc 获取风控统计概览
 * @access Private (店长或管理员，需 staff:manage 权限)
 */
router.get(
  '/stats',
  authenticateToken,
  requireMerchantPermission('staff:manage', { scope: 'store', storeIdParam: 'query' }),
  async (req, res) => {
    try {
      const { store_id } = req.query
      const user_stores = req.user_stores || []

      // 确定统计的门店范围
      let resolved_store_id = req.verified_store_id || (store_id ? parseInt(store_id, 10) : null)

      // 非管理员限制只能查看所属门店
      if (req.user.role_level < 100 && !resolved_store_id) {
        if (user_stores.length === 1) {
          resolved_store_id = user_stores[0].store_id
        }
      }

      // 构建查询条件
      const where = {}
      if (resolved_store_id) where.store_id = resolved_store_id

      // 按状态统计
      const statusStats = await RiskAlert.findAll({
        where,
        attributes: [
          'status',
          [RiskAlert.sequelize.fn('COUNT', RiskAlert.sequelize.col('alert_id')), 'count']
        ],
        group: ['status'],
        raw: true
      })

      // 按类型统计
      const typeStats = await RiskAlert.findAll({
        where,
        attributes: [
          'alert_type',
          [RiskAlert.sequelize.fn('COUNT', RiskAlert.sequelize.col('alert_id')), 'count']
        ],
        group: ['alert_type'],
        raw: true
      })

      // 按严重程度统计
      const severityStats = await RiskAlert.findAll({
        where,
        attributes: [
          'severity',
          [RiskAlert.sequelize.fn('COUNT', RiskAlert.sequelize.col('alert_id')), 'count']
        ],
        group: ['severity'],
        raw: true
      })

      // 今日新增
      const todayStart = BeijingTimeHelper.getTodayStart()
      const todayCount = await RiskAlert.count({
        where: {
          ...where,
          created_at: { [Op.gte]: todayStart }
        }
      })

      // 获取风控配置
      const riskConfig = MerchantRiskControlService.getRiskConfig()

      return res.apiSuccess(
        {
          by_status: statusStats.reduce((acc, item) => {
            acc[item.status] = parseInt(item.count, 10)
            return acc
          }, {}),
          by_type: typeStats.reduce((acc, item) => {
            acc[item.alert_type] = parseInt(item.count, 10)
            return acc
          }, {}),
          by_severity: severityStats.reduce((acc, item) => {
            acc[item.severity] = parseInt(item.count, 10)
            return acc
          }, {}),
          today_count: todayCount,
          risk_config: riskConfig,
          store_id: resolved_store_id
        },
        '风控统计获取成功'
      )
    } catch (error) {
      logger.error('获取风控统计失败', { error: error.message })
      return handleServiceError(error, res, '获取风控统计失败')
    }
  }
)

module.exports = router
