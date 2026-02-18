/**
 * 管理后台 - 广告活动管理模块
 *
 * 业务范围：
 * - 广告活动列表查询（分页+多维度筛选）
 * - 广告活动详情查看（含创意和账单记录）
 * - 广告活动审核（通过/拒绝）
 * - 活动统计数据
 * - 广告概览仪表板
 * - 弹窗队列配置管理
 * - 竞价日志查询（Phase 4）
 * - 用户标签浏览（Phase 5 DMP）
 * - 反作弊日志查询（Phase 5）
 * - 归因追踪日志查询（Phase 6）
 * - 管理员创建广告活动
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

/** 计费模式枚举（管理员创建广告活动用） */
const VALID_BILLING_MODES = ['fixed_daily', 'bidding']

/** 管理员创建广告活动允许的字段白名单 */
const ALLOWED_ADMIN_CREATE_FIELDS = [
  'campaign_name',
  'ad_slot_id',
  'billing_mode',
  'daily_bid_diamond',
  'budget_total_diamond',
  'fixed_days',
  'start_date',
  'end_date',
  'targeting_rules',
  'priority'
]

/**
 * POST / - 管理员创建广告活动
 *
 * 管理员可直接创建广告活动（草稿状态），支持为指定用户代创建。
 * 创建后需通过 PATCH /:id/review 审核流程进入投放状态。
 *
 * @route POST /api/v4/console/ad-campaigns
 * @access Private (Admin)
 * @body {string} campaign_name - 活动名称
 * @body {number} ad_slot_id - 广告位ID
 * @body {string} billing_mode - 计费模式（fixed_daily=固定包天 / bidding=竞价排名）
 * @body {number} [advertiser_user_id] - 广告主用户ID（不传则默认为当前管理员）
 * @body {number} [daily_bid_diamond] - 竞价日出价（钻石，bidding 模式必填）
 * @body {number} [budget_total_diamond] - 总预算（钻石，bidding 模式必填）
 * @body {number} [fixed_days] - 固定包天天数（fixed_daily 模式必填）
 * @body {string} [start_date] - 投放开始日期（YYYY-MM-DD）
 * @body {string} [end_date] - 投放结束日期（YYYY-MM-DD）
 * @body {Object} [targeting_rules] - 定向规则 JSON（Phase 5 启用）
 * @body {number} [priority] - 展示优先级（1~99，默认50）
 */
router.post(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { campaign_name, ad_slot_id, billing_mode, advertiser_user_id } = req.body

      if (!campaign_name || !ad_slot_id || !billing_mode) {
        return res.apiBadRequest('缺少必需参数：campaign_name, ad_slot_id, billing_mode')
      }

      if (!VALID_BILLING_MODES.includes(billing_mode)) {
        return res.apiBadRequest(`billing_mode 必须是以下之一：${VALID_BILLING_MODES.join(', ')}`)
      }

      // 白名单字段提取，advertiser_user_id 默认为当前管理员
      const createData = {
        advertiser_user_id: advertiser_user_id ? parseInt(advertiser_user_id) : req.user.user_id
      }
      ALLOWED_ADMIN_CREATE_FIELDS.forEach(field => {
        if (req.body[field] !== undefined) {
          createData[field] = req.body[field]
        }
      })

      // 数值类型转换
      if (createData.ad_slot_id) {
        createData.ad_slot_id = parseInt(createData.ad_slot_id)
      }
      if (createData.daily_bid_diamond) {
        createData.daily_bid_diamond = parseInt(createData.daily_bid_diamond)
      }
      if (createData.budget_total_diamond) {
        createData.budget_total_diamond = parseInt(createData.budget_total_diamond)
      }
      if (createData.fixed_days) {
        createData.fixed_days = parseInt(createData.fixed_days)
      }
      if (createData.priority) {
        createData.priority = parseInt(createData.priority)
      }

      const AdCampaignService = req.app.locals.services.getService('ad_campaign')
      const campaign = await AdCampaignService.createCampaign(createData)

      logger.info('管理员创建广告活动成功', {
        campaign_id: campaign.ad_campaign_id,
        operator_user_id: req.user.user_id,
        advertiser_user_id: createData.advertiser_user_id
      })

      return res.apiSuccess(campaign, '创建广告活动成功')
    } catch (error) {
      logger.error('管理员创建广告活动失败', {
        error: error.message,
        operator_user_id: req.user.user_id
      })
      return res.apiInternalError('创建广告活动失败', error.message, 'AD_CAMPAIGN_CREATE_ERROR')
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
 * GET /popup-queue-config - 获取弹窗队列配置
 *
 * @route GET /api/v4/console/ad-campaigns/popup-queue-config
 * @access Private (Admin)
 */
router.get(
  '/popup-queue-config',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { SystemConfig } = req.app.locals.models
      const config = await SystemConfig.findOne({
        where: { config_key: 'popup_queue_max_count' }
      })
      return res.apiSuccess({
        config_key: 'popup_queue_max_count',
        config_value: config ? parseInt(config.config_value, 10) : 5,
        description: config?.description || '弹窗队列最大数量'
      })
    } catch (error) {
      logger.error('获取弹窗队列配置失败', { error: error.message })
      return res.apiInternalError('获取弹窗队列配置失败', error.message)
    }
  })
)

/**
 * PUT /popup-queue-config - 更新弹窗队列配置
 *
 * @route PUT /api/v4/console/ad-campaigns/popup-queue-config
 * @access Private (Admin)
 * @body {number} popup_queue_max_count - 弹窗队列最大数量（1~20）
 */
router.put(
  '/popup-queue-config',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { popup_queue_max_count } = req.body
      const value = parseInt(popup_queue_max_count, 10)

      if (isNaN(value) || value < 1 || value > 20) {
        return res.apiError('弹窗队列最大数量必须为 1~20 的整数', 'INVALID_PARAM', null, 400)
      }

      const { SystemConfig } = req.app.locals.models
      await SystemConfig.upsert('popup_queue_max_count', String(value), {
        description: '弹窗队列最大数量（每次用户打开页面最多弹出的弹窗个数）',
        config_category: 'ad_system',
        is_active: true
      })

      logger.info('更新弹窗队列配置', {
        popup_queue_max_count: value,
        operator_user_id: req.user.user_id
      })

      return res.apiSuccess(
        { config_key: 'popup_queue_max_count', config_value: value },
        '弹窗队列配置已更新'
      )
    } catch (error) {
      logger.error('更新弹窗队列配置失败', { error: error.message })
      return res.apiInternalError('更新弹窗队列配置失败', error.message)
    }
  })
)

/**
 * GET /bid-logs - 竞价日志查询（Phase 4）
 *
 * @route GET /api/v4/console/ad-campaigns/bid-logs
 * @access Private (Admin)
 * @query {number} [ad_slot_id] - 广告位ID筛选
 * @query {number} [ad_campaign_id] - 广告活动ID筛选
 * @query {string} [is_winner] - 是否胜出（true/false）
 * @query {number} [page=1] - 页码
 * @query {number} [limit=20] - 每页数量
 */
router.get(
  '/bid-logs',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { ad_slot_id, ad_campaign_id, is_winner, page = 1, limit = 20 } = req.query
      const { AdBidLog } = req.app.locals.models
      const where = {}
      if (ad_slot_id) where.ad_slot_id = parseInt(ad_slot_id)
      if (ad_campaign_id) where.ad_campaign_id = parseInt(ad_campaign_id)
      if (is_winner !== undefined && is_winner !== '') where.is_winner = is_winner === 'true'
      const offset = (parseInt(page) - 1) * parseInt(limit)
      const { count, rows } = await AdBidLog.findAndCountAll({
        where,
        order: [['bid_at', 'DESC']],
        limit: parseInt(limit),
        offset
      })
      return res.apiSuccess({
        bid_logs: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(count / parseInt(limit))
        }
      })
    } catch (error) {
      logger.error('获取竞价日志失败', { error: error.message })
      return res.apiInternalError('获取竞价日志失败', error.message)
    }
  })
)

/**
 * GET /user-ad-tags - 用户广告标签查询（Phase 5 DMP）
 *
 * @route GET /api/v4/console/ad-campaigns/user-ad-tags
 * @access Private (Admin)
 * @query {number} [user_id] - 用户ID筛选
 * @query {string} [tag_key] - 标签键筛选
 * @query {number} [page=1] - 页码
 * @query {number} [limit=50] - 每页数量
 */
router.get(
  '/user-ad-tags',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { user_id, tag_key, page = 1, limit = 50 } = req.query
      const { UserAdTag } = req.app.locals.models
      const where = {}
      if (user_id) where.user_id = parseInt(user_id)
      if (tag_key) where.tag_key = tag_key
      const offset = (parseInt(page) - 1) * parseInt(limit)
      const { count, rows } = await UserAdTag.findAndCountAll({
        where,
        order: [['calculated_at', 'DESC']],
        limit: parseInt(limit),
        offset
      })
      return res.apiSuccess({
        user_ad_tags: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(count / parseInt(limit))
        }
      })
    } catch (error) {
      logger.error('获取用户标签失败', { error: error.message })
      return res.apiInternalError('获取用户标签失败', error.message)
    }
  })
)

/**
 * GET /antifraud-logs - 反作弊日志查询（Phase 5）
 *
 * @route GET /api/v4/console/ad-campaigns/antifraud-logs
 * @access Private (Admin)
 * @query {number} [ad_campaign_id] - 广告活动ID筛选
 * @query {string} [verdict] - 判定结果筛选（valid/invalid/suspicious）
 * @query {string} [event_type] - 事件类型（impression/click）
 * @query {number} [page=1] - 页码
 * @query {number} [limit=20] - 每页数量
 */
router.get(
  '/antifraud-logs',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { ad_campaign_id, verdict, event_type, page = 1, limit = 20 } = req.query
      const { AdAntifraudLog } = req.app.locals.models
      const where = {}
      if (ad_campaign_id) where.ad_campaign_id = parseInt(ad_campaign_id)
      if (verdict) where.verdict = verdict
      if (event_type) where.event_type = event_type
      const offset = (parseInt(page) - 1) * parseInt(limit)
      const { count, rows } = await AdAntifraudLog.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset
      })
      return res.apiSuccess({
        antifraud_logs: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(count / parseInt(limit))
        }
      })
    } catch (error) {
      logger.error('获取反作弊日志失败', { error: error.message })
      return res.apiInternalError('获取反作弊日志失败', error.message)
    }
  })
)

/**
 * GET /attribution-logs - 归因追踪日志查询（Phase 6）
 *
 * @route GET /api/v4/console/ad-campaigns/attribution-logs
 * @access Private (Admin)
 * @query {number} [ad_campaign_id] - 广告活动ID筛选
 * @query {string} [conversion_type] - 转化类型（lottery_draw/exchange/market_buy/page_view）
 * @query {number} [page=1] - 页码
 * @query {number} [limit=20] - 每页数量
 */
router.get(
  '/attribution-logs',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { ad_campaign_id, conversion_type, page = 1, limit = 20 } = req.query
      const { AdAttributionLog } = req.app.locals.models
      const where = {}
      if (ad_campaign_id) where.ad_campaign_id = parseInt(ad_campaign_id)
      if (conversion_type) where.conversion_type = conversion_type
      const offset = (parseInt(page) - 1) * parseInt(limit)
      const { count, rows } = await AdAttributionLog.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset
      })
      return res.apiSuccess({
        attribution_logs: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(count / parseInt(limit))
        }
      })
    } catch (error) {
      logger.error('获取归因日志失败', { error: error.message })
      return res.apiInternalError('获取归因日志失败', error.message)
    }
  })
)

/**
 * GET /:id - 获取广告活动详情（含创意和账单记录）
 * 注意：此路由必须定义在所有固定路径之后，
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
