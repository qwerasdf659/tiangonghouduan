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
 * 依据文档：docs/商家员工域权限体系升级方案.md AC5
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireMerchantPermission } = require('../../../../middleware/auth')
const { resolveStoreContext } = require('../../../../middleware/resolveStoreContext')
const { isUserActiveInStore } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const TransactionManager = require('../../../../utils/TransactionManager')
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
  resolveStoreContext({ storeIdParam: 'query', required: false }),
  asyncHandler(async (req, res) => {
    const {
      alert_type,
      severity,
      status,
      start_date,
      end_date,
      page = 1,
      page_size = 20
    } = req.query

    /*
     * 议题3：门店范围由 resolveStoreContext 统一解析。
     * 管理员不带 store_id → store_context.store_id=null → 查全部门店告警；
     * 普通员工 → 限定到其在职门店（单店自动填充 / 多店须指定）。
     */
    const resolved_store_id = req.store_context.store_id

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

    // 通过 ServiceManager 获取服务
    const MerchantRiskAlertService = req.app.locals.services.getService('merchant_risk_alert')
    const result = await MerchantRiskAlertService.queryRiskAlerts(filters, {
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10)
    })

    return res.apiSuccess(result, '风险告警列表获取成功')
  })
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
  asyncHandler(async (req, res) => {
    const { alert_id } = req.params
    const alertId = parseInt(alert_id, 10)

    if (isNaN(alertId) || alertId <= 0) {
      return res.apiError('无效的告警ID', 'BAD_REQUEST', null, 400)
    }

    // 通过 ServiceManager 获取服务
    const MerchantRiskAlertService = req.app.locals.services.getService('merchant_risk_alert')
    const alert = await MerchantRiskAlertService.getAlertDetail(alertId)

    if (!alert) {
      return res.apiError('告警不存在', 'NOT_FOUND', null, 404)
    }

    // 非管理员只能查看所属门店的告警（议题3：用 isUserActiveInStore 实时校验在职）
    if (req.user.role_level < 100 && alert.store_id) {
      const hasAccess = await isUserActiveInStore(req.user.user_id, alert.store_id)
      if (!hasAccess) {
        return res.apiError('无权查看此告警', 'FORBIDDEN', null, 403)
      }
    }

    return res.apiSuccess(alert, '告警详情获取成功')
  })
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
  asyncHandler(async (req, res) => {
    const { alert_id } = req.params
    const { review_notes } = req.body
    const alertId = parseInt(alert_id, 10)

    if (isNaN(alertId) || alertId <= 0) {
      return res.apiError('无效的告警ID', 'BAD_REQUEST', null, 400)
    }

    // 通过 ServiceManager 获取服务
    const MerchantRiskAlertService = req.app.locals.services.getService('merchant_risk_alert')

    // 验证告警存在且用户有权限
    const alert = await MerchantRiskAlertService.getAlertBasic(alertId)
    if (!alert) {
      return res.apiError('告警不存在', 'NOT_FOUND', null, 404)
    }

    // 非管理员只能处理所属门店的告警（议题3：用 isUserActiveInStore 实时校验在职）
    if (req.user.role_level < 100 && alert.store_id) {
      const hasAccess = await isUserActiveInStore(req.user.user_id, alert.store_id)
      if (!hasAccess) {
        return res.apiError('无权处理此告警', 'FORBIDDEN', null, 403)
      }
    }

    // 使用 TransactionManager 统一事务边界（TS2.2）
    const result = await TransactionManager.execute(
      async transaction => {
        return await MerchantRiskAlertService.updateAlertStatus(
          alertId,
          {
            status: 'reviewed',
            reviewer_id: req.user.user_id,
            review_notes
          },
          { transaction }
        )
      },
      { description: `复核告警 ${alertId}` }
    )

    logger.info('✅ 风险告警已复核', {
      alert_id: alertId,
      reviewer_id: req.user.user_id
    })

    return res.apiSuccess(result, '告警已标记为已复核')
  })
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
  asyncHandler(async (req, res) => {
    const { alert_id } = req.params
    const { review_notes } = req.body
    const alertId = parseInt(alert_id, 10)

    if (isNaN(alertId) || alertId <= 0) {
      return res.apiError('无效的告警ID', 'BAD_REQUEST', null, 400)
    }

    // 通过 ServiceManager 获取服务
    const MerchantRiskAlertService = req.app.locals.services.getService('merchant_risk_alert')

    // 验证告警存在且用户有权限
    const alert = await MerchantRiskAlertService.getAlertBasic(alertId)
    if (!alert) {
      return res.apiError('告警不存在', 'NOT_FOUND', null, 404)
    }

    // 非管理员只能处理所属门店的告警（议题3：用 isUserActiveInStore 实时校验在职）
    if (req.user.role_level < 100 && alert.store_id) {
      const hasAccess = await isUserActiveInStore(req.user.user_id, alert.store_id)
      if (!hasAccess) {
        return res.apiError('无权处理此告警', 'FORBIDDEN', null, 403)
      }
    }

    // 使用 TransactionManager 统一事务边界（TS2.2）
    const result = await TransactionManager.execute(
      async transaction => {
        return await MerchantRiskAlertService.updateAlertStatus(
          alertId,
          {
            status: 'ignored',
            reviewer_id: req.user.user_id,
            review_notes
          },
          { transaction }
        )
      },
      { description: `忽略告警 ${alertId}` }
    )

    logger.info('✅ 风险告警已忽略', {
      alert_id: alertId,
      reviewer_id: req.user.user_id
    })

    return res.apiSuccess(result, '告警已忽略')
  })
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
  resolveStoreContext({ storeIdParam: 'query', required: false }),
  asyncHandler(async (req, res) => {
    // 议题3：门店范围由 resolveStoreContext 统一解析（管理员不带 store_id 则统计全部门店）
    const resolved_store_id = req.store_context.store_id

    // 通过 ServiceManager 获取服务
    const MerchantRiskAlertService = req.app.locals.services.getService('merchant_risk_alert')
    const stats = await MerchantRiskAlertService.getAlertStats({
      store_id: resolved_store_id
    })

    return res.apiSuccess(stats, '风控统计获取成功')
  })
)

module.exports = router
