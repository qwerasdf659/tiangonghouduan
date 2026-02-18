/**
 * 用户端 - 广告活动管理模块
 *
 * 业务范围：
 * - 我的广告活动列表查询（分页+状态筛选）
 * - 创建广告活动
 * - 查看广告活动详情
 * - 更新草稿状态的活动
 * - 提交审核
 * - 取消活动
 * - 查看活动报表（Phase 6）
 *
 * 架构规范：
 * - 路由层不直连 models，通过 ServiceManager 获取 AdCampaignService
 * - 使用 res.apiSuccess / res.apiError 统一响应
 * - 用户只能操作自己的广告活动
 *
 * @see docs/广告系统升级方案.md
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
/**
 * 异步路由包装器 - 自动捕获 async/await 错误
 *
 * @param {Function} fn - 异步路由处理函数
 * @returns {Function} Express 中间件函数
 */
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}
const logger = require('../../../utils/logger').logger

/**
 * GET / - 获取我的广告活动列表
 * @route GET /api/v4/user/ad-campaigns
 * @access Private
 * @query {string} [status] - 活动状态筛选（draft/submitted/approved/rejected/running/paused/completed/cancelled）
 * @query {number} [page=1] - 页码
 * @query {number} [limit=20] - 每页数量
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const { status = null, page = 1, limit = 20 } = req.query
      const pageNum = parseInt(page) || 1
      const pageSize = parseInt(limit) || 20

      const AdCampaignService = req.app.locals.services.getService('ad_campaign')
      const result = await AdCampaignService.getMyAdCampaigns(req.user.user_id, {
        status,
        page: pageNum,
        pageSize
      })

      return res.apiSuccess(
        {
          campaigns: result.list,
          pagination: {
            total: result.total,
            page: result.page,
            limit: pageSize,
            total_pages: Math.ceil(result.total / pageSize)
          }
        },
        '获取广告活动列表成功'
      )
    } catch (error) {
      logger.error('获取广告活动列表失败', { error: error.message, user_id: req.user.user_id })
      return res.apiInternalError('获取广告活动列表失败', error.message, 'AD_CAMPAIGN_LIST_ERROR')
    }
  })
)

/**
 * POST / - 创建广告活动
 * @route POST /api/v4/user/ad-campaigns
 * @access Private
 * @body {string} campaign_name - 活动名称
 * @body {number} ad_slot_id - 广告位ID
 * @body {string} billing_mode - 计费模式（cpc/cpm/cpa）
 * @body {number} budget_amount - 预算金额（分）
 * @body {Date} start_date - 开始日期
 * @body {Date} end_date - 结束日期
 * @body {Object} targeting_config - 定向配置
 * @body {Array} creatives - 创意列表
 */
router.post(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const {
        campaign_name,
        ad_slot_id,
        billing_mode,
        budget_amount,
        start_date,
        end_date,
        targeting_config,
        creatives
      } = req.body

      if (!campaign_name || !ad_slot_id || !billing_mode || !budget_amount) {
        return res.apiBadRequest(
          '缺少必需参数：campaign_name, ad_slot_id, billing_mode, budget_amount'
        )
      }

      const AdCampaignService = req.app.locals.services.getService('ad_campaign')
      const campaign = await AdCampaignService.createCampaign({
        advertiser_user_id: req.user.user_id,
        campaign_name,
        ad_slot_id,
        billing_mode,
        budget_amount,
        start_date,
        end_date,
        targeting_config,
        creatives
      })

      logger.info('创建广告活动成功', {
        campaign_id: campaign.ad_campaign_id,
        user_id: req.user.user_id
      })

      return res.apiSuccess(campaign, '创建广告活动成功')
    } catch (error) {
      logger.error('创建广告活动失败', { error: error.message, user_id: req.user.user_id })
      return res.apiInternalError('创建广告活动失败', error.message, 'AD_CAMPAIGN_CREATE_ERROR')
    }
  })
)

/**
 * GET /:id - 获取广告活动详情
 * @route GET /api/v4/user/ad-campaigns/:id
 * @access Private
 * @param {number} id - 广告活动ID
 */
router.get(
  '/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params

      const AdCampaignService = req.app.locals.services.getService('ad_campaign')
      const campaign = await AdCampaignService.getCampaignById(id, { userId: req.user.user_id })

      if (!campaign) {
        return res.apiError('广告活动不存在或无权限访问', 'CAMPAIGN_NOT_FOUND', null, 404)
      }

      return res.apiSuccess(campaign, '获取广告活动详情成功')
    } catch (error) {
      logger.error('获取广告活动详情失败', {
        error: error.message,
        campaign_id: req.params.id,
        user_id: req.user.user_id
      })
      return res.apiInternalError('获取广告活动详情失败', error.message, 'AD_CAMPAIGN_DETAIL_ERROR')
    }
  })
)

/**
 * PUT /:id - 更新草稿状态的广告活动
 * @route PUT /api/v4/user/ad-campaigns/:id
 * @access Private
 * @param {number} id - 广告活动ID
 * @body {Object} updateData - 更新数据
 */
router.put(
  '/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params
      const updateData = req.body

      const AdCampaignService = req.app.locals.services.getService('ad_campaign')
      const campaign = await AdCampaignService.updateCampaign(id, req.user.user_id, updateData)

      if (!campaign) {
        return res.apiError('广告活动不存在或无权限修改', 'CAMPAIGN_NOT_FOUND', null, 404)
      }

      logger.info('更新广告活动成功', {
        campaign_id: id,
        user_id: req.user.user_id
      })

      return res.apiSuccess(campaign, '更新广告活动成功')
    } catch (error) {
      logger.error('更新广告活动失败', {
        error: error.message,
        campaign_id: req.params.id,
        user_id: req.user.user_id
      })
      return res.apiInternalError('更新广告活动失败', error.message, 'AD_CAMPAIGN_UPDATE_ERROR')
    }
  })
)

/**
 * POST /:id/submit - 提交广告活动审核
 *
 * 固定包天模式提交审核时，自动冻结广告主的钻石余额。
 * 冻结操作和状态变更在同一事务内完成，保证数据一致性。
 *
 * @route POST /api/v4/user/ad-campaigns/:id/submit
 * @access Private
 * @param {number} id - 广告活动ID
 */
router.post(
  '/:id/submit',
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params

      const AdCampaignService = req.app.locals.services.getService('ad_campaign')
      const AdBillingService = req.app.locals.services.getService('ad_billing')
      const TransactionManager = req.app.locals.services.getService('transaction_manager')

      const campaign = await TransactionManager.executeTransaction(async transaction => {
        // 1. 更新状态为待审核
        const submitted = await AdCampaignService.submitForReview(id, req.user.user_id, {
          transaction
        })

        if (!submitted) {
          throw new Error('广告活动不存在或无权限提交')
        }

        // 2. 固定包天模式：冻结钻石
        if (submitted.billing_mode === 'fixed_daily' && submitted.fixed_total_diamond > 0) {
          await AdBillingService.freezeDiamonds(
            submitted.ad_campaign_id,
            submitted.fixed_total_diamond,
            { transaction }
          )
        }

        return submitted
      })

      logger.info('提交广告活动审核成功', {
        campaign_id: id,
        user_id: req.user.user_id,
        billing_mode: campaign.billing_mode
      })

      return res.apiSuccess(campaign, '提交审核成功')
    } catch (error) {
      logger.error('提交广告活动审核失败', {
        error: error.message,
        campaign_id: req.params.id,
        user_id: req.user.user_id
      })
      return res.apiInternalError('提交审核失败', error.message, 'AD_CAMPAIGN_SUBMIT_ERROR')
    }
  })
)

/**
 * POST /:id/cancel - 取消广告活动
 *
 * 取消待审核状态的固定包天计划时，自动退还已冻结的钻石。
 *
 * @route POST /api/v4/user/ad-campaigns/:id/cancel
 * @access Private
 * @param {number} id - 广告活动ID
 */
router.post(
  '/:id/cancel',
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params

      const AdCampaignService = req.app.locals.services.getService('ad_campaign')
      const AdBillingService = req.app.locals.services.getService('ad_billing')
      const TransactionManager = req.app.locals.services.getService('transaction_manager')

      const campaign = await TransactionManager.executeTransaction(async transaction => {
        const cancelled = await AdCampaignService.cancelCampaign(id, req.user.user_id, {
          transaction
        })

        if (!cancelled) {
          throw new Error('广告活动不存在或无权限取消')
        }

        // 如果有冻结的钻石，执行退款
        if (cancelled.billing_mode === 'fixed_daily') {
          await AdBillingService.refundDiamonds(cancelled.ad_campaign_id, { transaction })
        }

        return cancelled
      })

      logger.info('取消广告活动成功', {
        campaign_id: id,
        user_id: req.user.user_id
      })

      return res.apiSuccess(campaign, '取消广告活动成功')
    } catch (error) {
      logger.error('取消广告活动失败', {
        error: error.message,
        campaign_id: req.params.id,
        user_id: req.user.user_id
      })
      return res.apiInternalError('取消广告活动失败', error.message, 'AD_CAMPAIGN_CANCEL_ERROR')
    }
  })
)

/**
 * GET /:id/report - 获取广告活动报表（Phase 6）
 * @route GET /api/v4/user/ad-campaigns/:id/report
 * @access Private
 * @param {number} id - 广告活动ID
 * @query {string} [start_date] - 开始日期（YYYY-MM-DD）
 * @query {string} [end_date] - 结束日期（YYYY-MM-DD）
 */
router.get(
  '/:id/report',
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params
      const { start_date, end_date } = req.query

      const AdReportService = req.app.locals.services.getService('ad_report')
      const report = await AdReportService.getCampaignReport(id, req.user.user_id, {
        start_date,
        end_date
      })

      if (!report) {
        return res.apiError('报表数据不存在或无权限访问', 'REPORT_NOT_FOUND', null, 404)
      }

      return res.apiSuccess(report, '获取活动报表成功')
    } catch (error) {
      logger.error('获取广告活动报表失败', {
        error: error.message,
        campaign_id: req.params.id,
        user_id: req.user.user_id
      })
      return res.apiInternalError('获取活动报表失败', error.message, 'AD_CAMPAIGN_REPORT_ERROR')
    }
  })
)

module.exports = router
