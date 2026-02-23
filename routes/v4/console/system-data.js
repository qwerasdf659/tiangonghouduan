'use strict'

/**
 * 餐厅积分抽奖系统 V4 - 系统数据查询路由（Console域）
 *
 * 功能说明：
 * - 提供系统级数据的只读查询接口
 * - 包括：账户表、用户角色、市场挂牌列表、抽奖活动等
 *
 * 涵盖表：
 * - accounts（账户表）
 * - user_roles（用户角色表）
 * - market_listings（市场挂牌表）
 * - lottery_campaigns（抽奖活动表）
 * - lottery_user_daily_draw_quota（用户每日抽奖配额表）
 *
 * API 路径前缀：/api/v4/console/system-data
 * 访问权限：admin（role_level >= 100）
 *
 * 架构规范（2026-02-02 确定）：
 * - 路由层通过 ServiceManager 获取服务
 * - 读操作通过 SystemDataQueryService 执行
 * - 写操作通过 LotteryCampaignCRUDService 执行
 * - 事务边界：路由层使用 TransactionManager.execute() 管理
 * - 采用模式A：外部传入事务（跨服务事务支持、事务边界清晰）
 *
 * 创建时间：2026-01-21
 * 最后更新：2026-02-02（事务管理模式A确定）
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { PERMISSION_LEVELS } = require('../../../shared/permission-constants')
const logger = require('../../../utils/logger').logger
const TransactionManager = require('../../../utils/TransactionManager')

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
 * 账户表查询接口
 * =================================================================
 */

/**
 * GET /api/v4/console/system-data/accounts
 * @desc 查询账户列表
 * @access Admin only (role_level >= 100)
 *
 * @query {string} [account_type] - 账户类型（user/system）
 * @query {number} [user_id] - 用户ID（user类型账户）
 * @query {string} [system_code] - 系统账户代码（system类型账户）
 * @query {string} [status] - 账户状态（active/disabled）
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get(
  '/accounts',
  authenticateToken,
  requireRoleLevel(PERMISSION_LEVELS.OPS),
  async (req, res) => {
    try {
      // 通过 ServiceManager 获取查询服务
      const SystemDataQueryService = req.app.locals.services.getService('console_system_data_query')

      const result = await SystemDataQueryService.getAccounts(req.query)

      logger.info('查询账户列表成功', {
        admin_id: req.user.user_id,
        total: result.pagination.total,
        page: result.pagination.page
      })

      return res.apiSuccess(result, '获取账户列表成功')
    } catch (error) {
      return handleServiceError(error, res, '查询账户列表')
    }
  }
)

/**
 * GET /api/v4/console/system-data/accounts/:account_id
 * @desc 获取账户详情
 * @access Admin only (role_level >= 100)
 */
router.get(
  '/accounts/:account_id',
  authenticateToken,
  requireRoleLevel(PERMISSION_LEVELS.OPS),
  async (req, res) => {
    try {
      const { account_id } = req.params
      const SystemDataQueryService = req.app.locals.services.getService('console_system_data_query')

      const account = await SystemDataQueryService.getAccountById(account_id)

      if (!account) {
        return res.apiError('账户不存在', 'NOT_FOUND', null, 404)
      }

      return res.apiSuccess(account, '获取账户详情成功')
    } catch (error) {
      return handleServiceError(error, res, '获取账户详情')
    }
  }
)

/*
 * =================================================================
 * 用户角色表查询接口
 * =================================================================
 */

/**
 * GET /api/v4/console/system-data/user-roles
 * @desc 查询用户角色列表
 * @access Admin only (role_level >= 100)
 *
 * @query {number} [user_id] - 用户ID
 * @query {string} [role_name] - 角色名称
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get(
  '/user-roles',
  authenticateToken,
  requireRoleLevel(PERMISSION_LEVELS.OPS),
  async (req, res) => {
    try {
      const SystemDataQueryService = req.app.locals.services.getService('console_system_data_query')

      const result = await SystemDataQueryService.getUserRoles(req.query)

      logger.info('查询用户角色列表成功', {
        admin_id: req.user.user_id,
        total: result.pagination.total,
        page: result.pagination.page
      })

      return res.apiSuccess(result, '获取用户角色列表成功')
    } catch (error) {
      return handleServiceError(error, res, '查询用户角色列表')
    }
  }
)

/*
 * =================================================================
 * 市场挂牌表查询接口
 * =================================================================
 */

/**
 * GET /api/v4/console/system-data/market-listings
 * @desc 查询市场挂牌列表（管理员视角）
 * @access Admin only (role_level >= 100)
 *
 * @query {number} [seller_user_id] - 卖家用户ID
 * @query {string} [status] - 挂牌状态（active/withdrawn/sold/expired/cancelled）
 * @query {string} [listing_kind] - 挂牌类型（item/fungible_asset）
 * @query {string} [asset_code] - 资产代码（fungible_asset类型）
 * @query {string} [start_date] - 开始日期
 * @query {string} [end_date] - 结束日期
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get(
  '/market-listings',
  authenticateToken,
  requireRoleLevel(PERMISSION_LEVELS.OPS),
  async (req, res) => {
    try {
      const SystemDataQueryService = req.app.locals.services.getService('console_system_data_query')

      const result = await SystemDataQueryService.getMarketListings(req.query)

      logger.info('查询市场挂牌列表成功', {
        admin_id: req.user.user_id,
        total: result.pagination.total,
        page: result.pagination.page
      })

      return res.apiSuccess(result, '获取市场挂牌列表成功')
    } catch (error) {
      return handleServiceError(error, res, '查询市场挂牌列表')
    }
  }
)

/**
 * GET /api/v4/console/system-data/market-listings/statistics/summary
 * @desc 获取市场挂牌统计摘要
 * @access Admin only (role_level >= 100)
 */
router.get(
  '/market-listings/statistics/summary',
  authenticateToken,
  requireRoleLevel(PERMISSION_LEVELS.OPS),
  async (req, res) => {
    try {
      const SystemDataQueryService = req.app.locals.services.getService('console_system_data_query')

      const result = await SystemDataQueryService.getMarketListingStats()

      logger.info('查询市场挂牌统计成功', {
        admin_id: req.user.user_id,
        total: result.total_listings
      })

      return res.apiSuccess(result, '获取市场挂牌统计成功')
    } catch (error) {
      return handleServiceError(error, res, '查询市场挂牌统计')
    }
  }
)

/**
 * GET /api/v4/console/system-data/market-listings/:market_listing_id
 * @desc 获取市场挂牌详情
 * @access Admin only (role_level >= 100)
 */
router.get(
  '/market-listings/:market_listing_id',
  authenticateToken,
  requireRoleLevel(PERMISSION_LEVELS.OPS),
  async (req, res) => {
    try {
      const { market_listing_id } = req.params
      const SystemDataQueryService = req.app.locals.services.getService('console_system_data_query')

      const listing = await SystemDataQueryService.getMarketListingById(market_listing_id)

      if (!listing) {
        return res.apiError('挂牌不存在', 'NOT_FOUND', null, 404)
      }

      return res.apiSuccess(listing, '获取市场挂牌详情成功')
    } catch (error) {
      return handleServiceError(error, res, '获取市场挂牌详情')
    }
  }
)

/*
 * =================================================================
 * 抽奖活动表查询接口
 * =================================================================
 */

/**
 * GET /api/v4/console/system-data/lottery-campaigns
 * @desc 查询抽奖活动列表
 * @access Admin only (role_level >= 100)
 *
 * @query {string} [status] - 活动状态（draft/active/paused/ended）
 * @query {string} [budget_mode] - 预算模式（user/pool/none）
 * @query {string} [start_date] - 开始日期
 * @query {string} [end_date] - 结束日期
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get(
  '/lottery-campaigns',
  authenticateToken,
  requireRoleLevel(PERMISSION_LEVELS.OPS),
  async (req, res) => {
    try {
      const SystemDataQueryService = req.app.locals.services.getService('console_system_data_query')

      const result = await SystemDataQueryService.getLotteryCampaigns(req.query)

      logger.info('查询抽奖活动列表成功', {
        admin_id: req.user.user_id,
        total: result.pagination.total,
        page: result.pagination.page
      })

      return res.apiSuccess(result, '获取抽奖活动列表成功')
    } catch (error) {
      return handleServiceError(error, res, '查询抽奖活动列表')
    }
  }
)

/**
 * GET /api/v4/console/system-data/lottery-campaigns/:lottery_campaign_id
 * @desc 获取抽奖活动详情
 * @access Admin only (role_level >= 100)
 */
router.get(
  '/lottery-campaigns/:lottery_campaign_id',
  authenticateToken,
  requireRoleLevel(PERMISSION_LEVELS.OPS),
  async (req, res) => {
    try {
      const { lottery_campaign_id } = req.params
      const SystemDataQueryService = req.app.locals.services.getService('console_system_data_query')

      const campaign = await SystemDataQueryService.getLotteryCampaignById(lottery_campaign_id)

      if (!campaign) {
        return res.apiError('活动不存在', 'NOT_FOUND', null, 404)
      }

      return res.apiSuccess(campaign, '获取抽奖活动详情成功')
    } catch (error) {
      return handleServiceError(error, res, '获取抽奖活动详情')
    }
  }
)

/**
 * POST /api/v4/console/system-data/lottery-campaigns
 * @desc 创建抽奖活动
 * @access Admin only (role_level >= 100)
 *
 * 事务管理：路由层使用 TransactionManager.execute() 管理事务边界
 */
router.post(
  '/lottery-campaigns',
  authenticateToken,
  requireRoleLevel(PERMISSION_LEVELS.OPS),
  async (req, res) => {
    try {
      const campaignData = req.body

      /*
       * 验证必填字段（路由层基础校验，快速失败）
       * campaign_code 由后端 CRUDService 自动生成，前端不传
       */
      if (!campaignData.campaign_name) {
        return res.apiError('活动名称不能为空', 'VALIDATION_ERROR', null, 400)
      }
      if (!campaignData.campaign_type) {
        return res.apiError('活动类型不能为空', 'VALIDATION_ERROR', null, 400)
      }

      // 通过 ServiceManager 获取服务
      const LotteryCampaignCRUDService = req.app.locals.services.getService('lottery_campaign_crud')

      // 模式A：路由层使用 TransactionManager.execute() 管理事务边界
      const campaign = await TransactionManager.execute(
        async transaction => {
          return await LotteryCampaignCRUDService.createCampaign(campaignData, {
            transaction,
            operator_user_id: req.user.user_id
          })
        },
        { description: 'POST /lottery-campaigns - createCampaign' }
      )

      return res.apiSuccess(campaign, '创建抽奖活动成功')
    } catch (error) {
      return handleServiceError(error, res, '创建抽奖活动')
    }
  }
)

/**
 * PUT /api/v4/console/system-data/lottery-campaigns/:lottery_campaign_id
 * @desc 更新抽奖活动
 * @access Admin only (role_level >= 100)
 *
 * 事务管理：路由层使用 TransactionManager.execute() 管理事务边界
 */
router.put(
  '/lottery-campaigns/:lottery_campaign_id',
  authenticateToken,
  requireRoleLevel(PERMISSION_LEVELS.OPS),
  async (req, res) => {
    try {
      const { lottery_campaign_id } = req.params
      const {
        campaign_name,
        campaign_type,
        description,
        start_time,
        end_time,
        status,
        rules_text,
        budget_mode,
        max_draws_per_user_daily,
        max_draws_per_user_total,
        total_prize_pool,
        remaining_prize_pool,
        prize_distribution_config,
        // 前端展示配置字段（多活动抽奖系统）
        display_mode,
        grid_cols,
        effect_theme,
        rarity_effects_enabled,
        win_animation,
        background_image_url,
        // 固定间隔保底配置
        guarantee_enabled,
        guarantee_threshold,
        guarantee_prize_id
      } = req.body

      // 构建更新数据（campaign_code 不可修改）
      const updateData = {}
      if (campaign_name !== undefined) updateData.campaign_name = campaign_name
      if (campaign_type !== undefined) updateData.campaign_type = campaign_type
      if (description !== undefined) updateData.description = description
      if (start_time !== undefined) updateData.start_time = start_time
      if (end_time !== undefined) updateData.end_time = end_time
      if (status !== undefined) updateData.status = status
      if (rules_text !== undefined) updateData.rules_text = rules_text
      if (budget_mode !== undefined) updateData.budget_mode = budget_mode
      if (max_draws_per_user_daily !== undefined) {
        updateData.max_draws_per_user_daily = max_draws_per_user_daily
      }
      if (max_draws_per_user_total !== undefined) {
        updateData.max_draws_per_user_total = max_draws_per_user_total
      }
      if (total_prize_pool !== undefined) updateData.total_prize_pool = total_prize_pool
      if (remaining_prize_pool !== undefined) updateData.remaining_prize_pool = remaining_prize_pool
      if (prize_distribution_config !== undefined) {
        updateData.prize_distribution_config = prize_distribution_config
      }
      // 前端展示配置字段（多活动抽奖系统）
      if (display_mode !== undefined) updateData.display_mode = display_mode
      if (grid_cols !== undefined) updateData.grid_cols = grid_cols
      if (effect_theme !== undefined) updateData.effect_theme = effect_theme
      if (rarity_effects_enabled !== undefined) {
        updateData.rarity_effects_enabled = rarity_effects_enabled
      }
      if (win_animation !== undefined) updateData.win_animation = win_animation
      if (background_image_url !== undefined) updateData.background_image_url = background_image_url
      // 固定间隔保底配置
      if (guarantee_enabled !== undefined) updateData.guarantee_enabled = guarantee_enabled
      if (guarantee_threshold !== undefined) updateData.guarantee_threshold = guarantee_threshold
      if (guarantee_prize_id !== undefined) updateData.guarantee_prize_id = guarantee_prize_id

      // 通过 ServiceManager 获取服务
      const LotteryCampaignCRUDService = req.app.locals.services.getService('lottery_campaign_crud')

      // 模式A：路由层使用 TransactionManager.execute() 管理事务边界
      const campaign = await TransactionManager.execute(
        async transaction => {
          return await LotteryCampaignCRUDService.updateCampaign(
            parseInt(lottery_campaign_id),
            updateData,
            { transaction, operator_user_id: req.user.user_id }
          )
        },
        { description: `PUT /lottery-campaigns/${lottery_campaign_id} - updateCampaign` }
      )

      return res.apiSuccess(campaign, '更新抽奖活动成功')
    } catch (error) {
      return handleServiceError(error, res, '更新抽奖活动')
    }
  }
)

/**
 * PUT /api/v4/console/system-data/lottery-campaigns/:lottery_campaign_id/status
 * @desc 更新抽奖活动状态
 * @access Admin only (role_level >= 100)
 *
 * 事务管理：路由层使用 TransactionManager.execute() 管理事务边界
 */
router.put(
  '/lottery-campaigns/:lottery_campaign_id/status',
  authenticateToken,
  requireRoleLevel(PERMISSION_LEVELS.OPS),
  async (req, res) => {
    try {
      const { lottery_campaign_id } = req.params
      const { status } = req.body

      if (!status || !['draft', 'active', 'paused', 'ended'].includes(status)) {
        return res.apiError('无效的状态值', 'VALIDATION_ERROR', null, 400)
      }

      // 通过 ServiceManager 获取服务
      const LotteryCampaignCRUDService = req.app.locals.services.getService('lottery_campaign_crud')

      // 模式A：路由层使用 TransactionManager.execute() 管理事务边界
      const campaign = await TransactionManager.execute(
        async transaction => {
          return await LotteryCampaignCRUDService.updateCampaignStatus(
            parseInt(lottery_campaign_id),
            status,
            { transaction, operator_user_id: req.user.user_id }
          )
        },
        {
          description: `PUT /lottery-campaigns/${lottery_campaign_id}/status - updateCampaignStatus`
        }
      )

      return res.apiSuccess(campaign, '更新活动状态成功')
    } catch (error) {
      return handleServiceError(error, res, '更新抽奖活动状态')
    }
  }
)

/**
 * DELETE /api/v4/console/system-data/lottery-campaigns/:lottery_campaign_id
 * @desc 删除抽奖活动
 * @access Admin only (role_level >= 100)
 *
 * 事务管理：路由层使用 TransactionManager.execute() 管理事务边界
 */
router.delete(
  '/lottery-campaigns/:lottery_campaign_id',
  authenticateToken,
  requireRoleLevel(PERMISSION_LEVELS.OPS),
  async (req, res) => {
    try {
      const { lottery_campaign_id } = req.params

      // 通过 ServiceManager 获取服务
      const LotteryCampaignCRUDService = req.app.locals.services.getService('lottery_campaign_crud')

      // 模式A：路由层使用 TransactionManager.execute() 管理事务边界
      const result = await TransactionManager.execute(
        async transaction => {
          return await LotteryCampaignCRUDService.deleteCampaign(parseInt(lottery_campaign_id), {
            transaction,
            operator_user_id: req.user.user_id
          })
        },
        { description: `DELETE /lottery-campaigns/${lottery_campaign_id} - deleteCampaign` }
      )

      return res.apiSuccess(
        {
          lottery_campaign_id: result.lottery_campaign_id,
          campaign_name: result.campaign_name,
          deleted: result.deleted
        },
        '删除抽奖活动成功'
      )
    } catch (error) {
      return handleServiceError(error, res, '删除抽奖活动')
    }
  }
)

/*
 * =================================================================
 * 用户每日抽奖配额表查询接口
 * =================================================================
 */

/**
 * GET /api/v4/console/system-data/lottery-daily-quotas
 * @desc 查询用户每日抽奖配额列表
 * @access Admin only (role_level >= 100)
 *
 * @query {number} [user_id] - 用户ID
 * @query {number} [lottery_campaign_id] - 活动ID
 * @query {string} [quota_date] - 配额日期（YYYY-MM-DD）
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get(
  '/lottery-daily-quotas',
  authenticateToken,
  requireRoleLevel(PERMISSION_LEVELS.OPS),
  async (req, res) => {
    try {
      const SystemDataQueryService = req.app.locals.services.getService('console_system_data_query')

      const result = await SystemDataQueryService.getLotteryDailyQuotas(req.query)

      logger.info('查询用户每日抽奖配额列表成功', {
        admin_id: req.user.user_id,
        total: result.pagination.total,
        page: result.pagination.page
      })

      return res.apiSuccess(result, '获取用户每日抽奖配额列表成功')
    } catch (error) {
      return handleServiceError(error, res, '查询用户每日抽奖配额列表')
    }
  }
)

/**
 * GET /api/v4/console/system-data/lottery-daily-quotas/:quota_id
 * @desc 获取用户每日抽奖配额详情
 * @access Admin only (role_level >= 100)
 */
router.get(
  '/lottery-daily-quotas/:quota_id',
  authenticateToken,
  requireRoleLevel(PERMISSION_LEVELS.OPS),
  async (req, res) => {
    try {
      const { quota_id } = req.params
      const SystemDataQueryService = req.app.locals.services.getService('console_system_data_query')

      const quota = await SystemDataQueryService.getLotteryDailyQuotaById(quota_id)

      if (!quota) {
        return res.apiError('配额记录不存在', 'NOT_FOUND', null, 404)
      }

      return res.apiSuccess(quota, '获取用户每日抽奖配额详情成功')
    } catch (error) {
      return handleServiceError(error, res, '获取用户每日抽奖配额详情')
    }
  }
)

module.exports = router
