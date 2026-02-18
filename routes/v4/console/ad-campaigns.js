/**
 * 管理后台 - 广告活动管理模块
 *
 * 业务范围：
 * - 广告活动列表查询（分页+多维度筛选）
 * - 广告活动详情查看（含创意和账单记录）
 * - 广告活动审核（通过/拒绝）
 * - 活动统计数据
 * - 广告概览仪表板
 *
 * 架构规范：
 * - 路由层不直连 models，通过 ServiceManager 获取 AdCampaignService
 * - 使用 res.apiSuccess / res.apiError 统一响应
 * - 审核操作使用 TransactionManager（涉及账单）
 *
 * @see docs/广告系统升级方案.md
 */

const express = require('express')
const router = express.Router()
const { adminAuthMiddleware, asyncHandler } = require('./shared/middleware')
const logger = require('../../../utils/logger').logger

/**
 * GET / - 获取所有广告活动列表
 * @route GET /api/v4/console/ad-campaigns
 * @access Private (Admin)
 * @query {string} [status] - 活动状态筛选
 * @query {string} [billing_mode] - 计费模式筛选（cpc/cpm/cpa）
 * @query {number} [ad_slot_id] - 广告位ID筛选
 * @query {number} [advertiser_user_id] - 广告主用户ID筛选
 * @query {number} [page=1] - 页码
 * @query {number} [limit=20] - 每页数量
 */
router.get(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const {
        status = null,
        billing_mode = null,
        ad_slot_id = null,
        advertiser_user_id = null,
        page = 1,
        limit = 20
      } = req.query

      const pageNum = parseInt(page) || 1
      const pageSize = parseInt(limit) || 20

      const AdCampaignService = req.app.locals.services.getService('ad_campaign')
      const result = await AdCampaignService.getAdminCampaignList({
        status,
        billing_mode,
        ad_slot_id: ad_slot_id ? parseInt(ad_slot_id) : null,
        advertiser_user_id: advertiser_user_id ? parseInt(advertiser_user_id) : null,
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
      logger.error('获取广告活动列表失败', { error: error.message })
      return res.apiInternalError('获取广告活动列表失败', error.message, 'AD_CAMPAIGN_LIST_ERROR')
    }
  })
)

/**
 * GET /statistics - 获取广告活动统计数据
 * 注意：此路由必须定义在 /:id 之前，否则 "statistics" 会被匹配为 :id 参数
 *
 * @route GET /api/v4/console/ad-campaigns/statistics
 * @access Private (Admin)
 * @query {string} [start_date] - 开始日期（YYYY-MM-DD）
 * @query {string} [end_date] - 结束日期（YYYY-MM-DD）
 */
router.get(
  '/statistics',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { start_date, end_date } = req.query

      const AdCampaignService = req.app.locals.services.getService('ad_campaign')
      const statistics = await AdCampaignService.getCampaignStatistics({
        start_date,
        end_date
      })

      return res.apiSuccess(statistics, '获取统计数据成功')
    } catch (error) {
      logger.error('获取广告活动统计数据失败', { error: error.message })
      return res.apiInternalError('获取统计数据失败', error.message, 'AD_CAMPAIGN_STATISTICS_ERROR')
    }
  })
)

/**
 * GET /dashboard - 获取广告概览仪表板
 * 注意：此路由必须定义在 /:id 之前，否则 "dashboard" 会被匹配为 :id 参数
 *
 * @route GET /api/v4/console/ad-campaigns/dashboard
 * @access Private (Admin)
 * @query {string} [start_date] - 开始日期（YYYY-MM-DD）
 * @query {string} [end_date] - 结束日期（YYYY-MM-DD）
 */
router.get(
  '/dashboard',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { start_date, end_date } = req.query

      const AdCampaignService = req.app.locals.services.getService('ad_campaign')
      const dashboard = await AdCampaignService.getAdDashboard({
        start_date,
        end_date
      })

      return res.apiSuccess(dashboard, '获取广告概览成功')
    } catch (error) {
      logger.error('获取广告概览仪表板失败', { error: error.message })
      return res.apiInternalError('获取广告概览失败', error.message, 'AD_DASHBOARD_ERROR')
    }
  })
)

/**
 * GET /popup-banners/:id/show-stats - 获取弹窗横幅展示统计
 * 注意：此路由必须定义在 /:id 之前，因为含有固定前缀路径段
 *
 * @route GET /api/v4/console/ad-campaigns/popup-banners/:id/show-stats
 * @access Private (Admin)
 * @param {number} id - 弹窗横幅ID
 * @query {string} [start_date] - 开始日期（YYYY-MM-DD）
 * @query {string} [end_date] - 结束日期（YYYY-MM-DD）
 */
router.get(
  '/popup-banners/:id/show-stats',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params
      const { start_date, end_date } = req.query

      const PopupShowLogService = req.app.locals.services.getService('popup_show_log')
      const stats = await PopupShowLogService.getShowStats(parseInt(id), {
        start_date,
        end_date
      })

      return res.apiSuccess(stats, '获取弹窗横幅展示统计成功')
    } catch (error) {
      logger.error('获取弹窗横幅展示统计失败', {
        error: error.message,
        popup_banner_id: req.params.id
      })
      return res.apiInternalError('获取展示统计失败', error.message, 'POPUP_SHOW_STATS_ERROR')
    }
  })
)

/**
 * GET /carousel-items/:id/show-stats - 获取轮播图展示统计
 * @route GET /api/v4/console/ad-campaigns/carousel-items/:id/show-stats
 * @access Private (Admin)
 * @param {number} id - 轮播图ID
 * @query {string} [start_date] - 开始日期（YYYY-MM-DD）
 * @query {string} [end_date] - 结束日期（YYYY-MM-DD）
 */
router.get(
  '/carousel-items/:id/show-stats',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params
      const { start_date, end_date } = req.query

      const CarouselShowLogService = req.app.locals.services.getService('carousel_show_log')
      const stats = await CarouselShowLogService.getShowStats(parseInt(id), {
        start_date,
        end_date
      })

      return res.apiSuccess(stats, '获取轮播图展示统计成功')
    } catch (error) {
      logger.error('获取轮播图展示统计失败', {
        error: error.message,
        carousel_item_id: req.params.id
      })
      return res.apiInternalError('获取展示统计失败', error.message, 'CAROUSEL_SHOW_STATS_ERROR')
    }
  })
)

/**
 * GET /:id - 获取广告活动详情（含创意和账单记录）
 * 注意：此路由必须定义在所有固定路径（/statistics, /dashboard 等）之后，
 * 否则固定路径会被 :id 参数捕获导致 404
 *
 * @route GET /api/v4/console/ad-campaigns/:id
 * @access Private (Admin)
 * @param {number} id - 广告活动ID
 */
router.get(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params

      const AdCampaignService = req.app.locals.services.getService('ad_campaign')
      const campaign = await AdCampaignService.getCampaignDetailWithRelations(id)

      if (!campaign) {
        return res.apiError('广告活动不存在', 'CAMPAIGN_NOT_FOUND', null, 404)
      }

      return res.apiSuccess(campaign, '获取广告活动详情成功')
    } catch (error) {
      logger.error('获取广告活动详情失败', {
        error: error.message,
        campaign_id: req.params.id
      })
      return res.apiInternalError('获取广告活动详情失败', error.message, 'AD_CAMPAIGN_DETAIL_ERROR')
    }
  })
)

/**
 * PATCH /:id/review - 审核广告活动（通过/拒绝）
 * @route PATCH /api/v4/console/ad-campaigns/:id/review
 * @access Private (Admin)
 * @param {number} id - 广告活动ID
 * @body {string} action - 审核操作（approve/reject）
 * @body {string} [review_note] - 审核备注
 */
router.patch(
  '/:id/review',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params
      const { action, review_note } = req.body

      if (!action || !['approve', 'reject'].includes(action)) {
        return res.apiBadRequest('action 参数必须为 approve 或 reject')
      }

      const AdCampaignService = req.app.locals.services.getService('ad_campaign')
      const AdBillingService = req.app.locals.services.getService('ad_billing')
      const TransactionManager = req.app.locals.services.getService('transaction_manager')

      const campaign = await TransactionManager.executeTransaction(async transaction => {
        const reviewed = await AdCampaignService.reviewCampaign(
          id,
          req.user.user_id,
          action,
          review_note,
          { transaction }
        )

        if (reviewed.billing_mode === 'fixed_daily') {
          if (action === 'approve') {
            await AdBillingService.deductFrozenDiamonds(reviewed.ad_campaign_id, { transaction })
          } else if (action === 'reject') {
            await AdBillingService.refundDiamonds(reviewed.ad_campaign_id, { transaction })
          }
        }

        return reviewed
      })

      if (!campaign) {
        return res.apiError('广告活动不存在', 'CAMPAIGN_NOT_FOUND', null, 404)
      }

      logger.info('审核广告活动成功', {
        campaign_id: id,
        action,
        reviewer_user_id: req.user.user_id
      })

      return res.apiSuccess(
        campaign,
        `广告活动${action === 'approve' ? '审核通过' : '审核拒绝'}成功`
      )
    } catch (error) {
      logger.error('审核广告活动失败', {
        error: error.message,
        campaign_id: req.params.id,
        reviewer_user_id: req.user.user_id
      })
      return res.apiInternalError('审核广告活动失败', error.message, 'AD_CAMPAIGN_REVIEW_ERROR')
    }
  })
)

module.exports = router
