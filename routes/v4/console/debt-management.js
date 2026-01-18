/**
 * 欠账管理后端 API - 统一抽奖架构核心组件
 * 创建时间：2026年01月18日 北京时间
 *
 * 业务职责：
 * - 提供欠账看板数据（按活动/奖品/责任人汇总）
 * - 提供欠账趋势数据
 * - 提供欠账冲销功能
 * - 提供欠账上限配置管理
 *
 * @version 4.1.0
 * @description 预设欠账管理后端 API
 *              2026-01-18 路由层合规性治理：移除直接模型访问，使用 DebtManagementService
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const logger = require('../../../utils/logger')

/**
 * 通过 ServiceManager 获取 DebtManagementService
 *
 * @param {Object} req - Express 请求对象
 * @returns {Object} DebtManagementService
 */
const getDebtManagementService = req => {
  return req.app.locals.services.getService('debt_management')
}

/*
 * =============================================================================
 * 欠账看板 API
 * =============================================================================
 */

/**
 * GET /dashboard - 欠账看板总览
 *
 * @description 获取系统级欠账统计数据
 * @route GET /api/v4/console/debt-management/dashboard
 * @access admin
 * @returns {Object} 欠账看板数据
 */
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const DebtManagementService = getDebtManagementService(req)
    const dashboard = await DebtManagementService.getDashboard()
    return res.apiSuccess(dashboard, '欠账看板数据获取成功')
  } catch (error) {
    logger.error('[debt-management] 获取欠账看板失败:', { error: error.message })
    return res.apiError(`获取欠账看板失败: ${error.message}`, 'DEBT_DASHBOARD_ERROR', null, 500)
  }
})

/**
 * GET /by-campaign - 按活动汇总欠账
 *
 * @description 获取按活动分组的欠账统计
 * @route GET /api/v4/console/debt-management/by-campaign
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 * @query {string} [debt_type] - 欠账类型: inventory|budget|all
 * @access admin
 * @returns {Object} 按活动分组的欠账数据
 */
router.get('/by-campaign', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const DebtManagementService = getDebtManagementService(req)
    const result = await DebtManagementService.getDebtByCampaign({
      page: req.query.page,
      page_size: req.query.page_size,
      debt_type: req.query.debt_type
    })
    return res.apiSuccess(result, '按活动汇总欠账获取成功')
  } catch (error) {
    logger.error('[debt-management] 按活动汇总欠账失败:', { error: error.message })
    return res.apiError(`按活动汇总欠账失败: ${error.message}`, 'DEBT_BY_CAMPAIGN_ERROR', null, 500)
  }
})

/**
 * GET /by-prize - 按奖品汇总库存欠账
 *
 * @description 获取按奖品分组的库存欠账统计
 * @route GET /api/v4/console/debt-management/by-prize
 * @query {number} [campaign_id] - 活动ID（可选）
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 * @access admin
 * @returns {Object} 按奖品分组的库存欠账数据
 */
router.get('/by-prize', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const DebtManagementService = getDebtManagementService(req)
    const result = await DebtManagementService.getDebtByPrize({
      campaign_id: req.query.campaign_id,
      page: req.query.page,
      page_size: req.query.page_size
    })
    return res.apiSuccess(result, '按奖品汇总库存欠账获取成功')
  } catch (error) {
    logger.error('[debt-management] 按奖品汇总库存欠账失败:', { error: error.message })
    return res.apiError(
      `按奖品汇总库存欠账失败: ${error.message}`,
      'DEBT_BY_PRIZE_ERROR',
      null,
      500
    )
  }
})

/**
 * GET /by-creator - 按责任人汇总欠账
 *
 * @description 获取按预设创建人分组的欠账统计（用于追责审计）
 * @route GET /api/v4/console/debt-management/by-creator
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 * @access admin
 * @returns {Object} 按责任人分组的欠账数据
 */
router.get('/by-creator', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const DebtManagementService = getDebtManagementService(req)
    const result = await DebtManagementService.getDebtByCreator({
      page: req.query.page,
      page_size: req.query.page_size
    })
    return res.apiSuccess(result, '按责任人汇总欠账获取成功')
  } catch (error) {
    logger.error('[debt-management] 按责任人汇总欠账失败:', { error: error.message })
    return res.apiError(
      `按责任人汇总欠账失败: ${error.message}`,
      'DEBT_BY_CREATOR_ERROR',
      null,
      500
    )
  }
})

/**
 * GET /trend - 欠账趋势数据
 *
 * @description 获取欠账趋势数据（按日/周/月）
 * @route GET /api/v4/console/debt-management/trend
 * @query {string} [period=day] - 时间粒度: day|week|month
 * @query {number} [days=30] - 查询天数
 * @query {string} [debt_type] - 欠账类型: inventory|budget|all
 * @access admin
 * @returns {Object} 欠账趋势数据
 */
router.get('/trend', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const DebtManagementService = getDebtManagementService(req)
    const result = await DebtManagementService.getDebtTrend({
      period: req.query.period,
      days: req.query.days,
      debt_type: req.query.debt_type
    })
    return res.apiSuccess(result, '欠账趋势数据获取成功')
  } catch (error) {
    logger.error('[debt-management] 获取欠账趋势失败:', { error: error.message })
    return res.apiError(`获取欠账趋势失败: ${error.message}`, 'DEBT_TREND_ERROR', null, 500)
  }
})

/*
 * =============================================================================
 * 欠账冲销 API
 * =============================================================================
 */

/**
 * GET /pending - 查询待冲销欠账
 *
 * @description 获取待冲销的欠账列表
 * @route GET /api/v4/console/debt-management/pending
 * @query {string} debt_type - 欠账类型: inventory|budget
 * @query {number} [campaign_id] - 活动ID（可选）
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 * @access admin
 * @returns {Object} 待冲销欠账列表
 */
router.get('/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const DebtManagementService = getDebtManagementService(req)
    const result = await DebtManagementService.getPendingDebts({
      debt_type: req.query.debt_type,
      campaign_id: req.query.campaign_id,
      page: req.query.page,
      page_size: req.query.page_size
    })
    return res.apiSuccess(result, '待冲销欠账列表获取成功')
  } catch (error) {
    logger.error('[debt-management] 查询待冲销欠账失败:', { error: error.message })
    return res.apiError(`查询待冲销欠账失败: ${error.message}`, 'PENDING_DEBT_ERROR', null, 500)
  }
})

/**
 * POST /clear - 执行欠账清偿
 *
 * @description 清偿指定欠账（清偿/冲销欠账记录）
 * @route POST /api/v4/console/debt-management/clear
 * @body {string} debt_type - 欠账类型: inventory|budget
 * @body {number} debt_id - 欠账ID
 * @body {number} amount - 清偿数量/金额
 * @body {string} [remark] - 备注
 * @access admin
 * @returns {Object} 清偿结果
 */
router.post('/clear', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { debt_type, debt_id, amount, remark } = req.body
    const admin_id = req.user.user_id

    // 参数验证
    if (!debt_type || !debt_id || !amount) {
      return res.apiError('缺少必要参数: debt_type, debt_id, amount', 'INVALID_PARAMS', null, 400)
    }

    if (amount <= 0) {
      return res.apiError('清偿数量/金额必须大于0', 'INVALID_AMOUNT', null, 400)
    }

    const DebtManagementService = getDebtManagementService(req)
    const result = await DebtManagementService.clearDebt({
      debt_type,
      debt_id,
      amount,
      admin_id,
      remark
    })

    const message = result.is_fully_cleared ? '欠账已完全清偿' : '欠账部分清偿成功'
    return res.apiSuccess(result, message)
  } catch (error) {
    logger.error('[debt-management] 欠账清偿失败:', { error: error.message })
    return res.apiError(`欠账清偿失败: ${error.message}`, 'CLEAR_DEBT_ERROR', null, 500)
  }
})

/*
 * =============================================================================
 * 欠账上限配置 API
 * =============================================================================
 */

/**
 * GET /limits - 获取欠账上限配置列表
 *
 * @description 获取所有活动的欠账上限配置
 * @route GET /api/v4/console/debt-management/limits
 * @query {number} [campaign_id] - 活动ID（可选）
 * @query {string} [status] - 状态: active|inactive
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 * @access admin
 * @returns {Object} 欠账上限配置列表
 */
router.get('/limits', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const DebtManagementService = getDebtManagementService(req)
    const result = await DebtManagementService.getDebtLimits({
      campaign_id: req.query.campaign_id,
      limit_level: req.query.limit_level,
      status: req.query.status,
      page: req.query.page,
      page_size: req.query.page_size
    })
    return res.apiSuccess(result, '欠账上限配置列表获取成功')
  } catch (error) {
    logger.error('[debt-management] 获取欠账上限配置失败:', { error: error.message })
    return res.apiError(`获取欠账上限配置失败: ${error.message}`, 'LIMITS_LIST_ERROR', null, 500)
  }
})

/**
 * GET /limits/:campaign_id - 获取指定活动的欠账上限配置
 *
 * @description 获取或创建指定活动的欠账上限配置
 * @route GET /api/v4/console/debt-management/limits/:campaign_id
 * @param {number} campaign_id - 活动ID
 * @access admin
 * @returns {Object} 欠账上限配置
 */
router.get('/limits/:campaign_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const campaign_id = parseInt(req.params.campaign_id, 10)
    if (isNaN(campaign_id) || campaign_id <= 0) {
      return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
    }

    const DebtManagementService = getDebtManagementService(req)
    const result = await DebtManagementService.getCampaignDebtLimit(campaign_id)
    return res.apiSuccess(result, '欠账上限配置获取成功')
  } catch (error) {
    logger.error('[debt-management] 获取欠账上限配置失败:', { error: error.message })

    if (error.message === '活动不存在') {
      return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND', null, 404)
    }
    return res.apiError(`获取欠账上限配置失败: ${error.message}`, 'LIMIT_GET_ERROR', null, 500)
  }
})

/**
 * PUT /limits/:campaign_id - 更新欠账上限配置
 *
 * @description 更新指定活动的欠账上限配置
 * @route PUT /api/v4/console/debt-management/limits/:campaign_id
 * @param {number} campaign_id - 活动ID
 * @body {number} [inventory_debt_limit] - 最大库存欠账数量
 * @body {number} [budget_debt_limit] - 最大预算欠账金额
 * @body {string} [description] - 配置说明
 * @body {string} [status] - 状态: active|inactive
 * @access admin
 * @returns {Object} 更新后的配置
 */
router.put('/limits/:campaign_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const campaign_id = parseInt(req.params.campaign_id, 10)
    if (isNaN(campaign_id) || campaign_id <= 0) {
      return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
    }

    const admin_id = req.user.user_id
    const { inventory_debt_limit, budget_debt_limit, description, status } = req.body

    const DebtManagementService = getDebtManagementService(req)
    const result = await DebtManagementService.updateCampaignDebtLimit(
      campaign_id,
      { inventory_debt_limit, budget_debt_limit, description, status },
      admin_id
    )
    return res.apiSuccess(result, '欠账上限配置更新成功')
  } catch (error) {
    logger.error('[debt-management] 更新欠账上限配置失败:', { error: error.message })

    if (error.message === '活动不存在') {
      return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND', null, 404)
    }
    return res.apiError(`更新欠账上限配置失败: ${error.message}`, 'LIMIT_UPDATE_ERROR', null, 500)
  }
})

/**
 * GET /limits/:campaign_id/alert-check - 检查活动欠账告警状态
 *
 * @description 检查指定活动的欠账是否接近上限
 * @route GET /api/v4/console/debt-management/limits/:campaign_id/alert-check
 * @param {number} campaign_id - 活动ID
 * @access admin
 * @returns {Object} 告警检查结果
 */
router.get(
  '/limits/:campaign_id/alert-check',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const campaign_id = parseInt(req.params.campaign_id, 10)
      if (isNaN(campaign_id) || campaign_id <= 0) {
        return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
      }

      const DebtManagementService = getDebtManagementService(req)
      const result = await DebtManagementService.checkAlertStatus(campaign_id)
      return res.apiSuccess(result, '告警状态检查完成')
    } catch (error) {
      logger.error('[debt-management] 检查告警状态失败:', { error: error.message })
      return res.apiError(`检查告警状态失败: ${error.message}`, 'ALERT_CHECK_ERROR', null, 500)
    }
  }
)

module.exports = router
