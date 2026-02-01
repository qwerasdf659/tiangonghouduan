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
 * 架构规范：
 * - 路由层不直连 models（通过 Service 层）
 * - 只读查询可直接查库（符合决策7）
 *
 * 创建时间：2026-01-21
 * 依据文档：docs/数据库表API覆盖率分析报告.md
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { PERMISSION_LEVELS } = require('../../../shared/permission-constants')
const logger = require('../../../utils/logger').logger
const { Op } = require('sequelize')
const LotteryCampaignCRUDService = require('../../../services/admin-lottery/CRUDService')

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

/**
 * 构建分页和排序选项
 *
 * @param {Object} query - 请求查询参数
 * @param {string} defaultSortBy - 默认排序字段
 * @returns {Object} 分页和排序选项
 */
function buildPaginationOptions(query, defaultSortBy = 'created_at') {
  const page = Math.max(1, parseInt(query.page) || 1)
  const page_size = Math.min(100, Math.max(1, parseInt(query.page_size) || 20))
  const sort_by = query.sort_by || defaultSortBy
  const sort_order = (query.sort_order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

  return {
    page,
    page_size,
    offset: (page - 1) * page_size,
    limit: page_size,
    order: [[sort_by, sort_order]]
  }
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
      const { account_type, user_id, system_code, status } = req.query
      const pagination = buildPaginationOptions(req.query)

      const { Account, User } = require('../../../models')

      // 构建查询条件
      const where = {}
      if (account_type) where.account_type = account_type
      if (user_id) where.user_id = parseInt(user_id)
      if (system_code) where.system_code = system_code
      if (status) where.status = status

      const { count, rows } = await Account.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile'],
            required: false
          }
        ],
        ...pagination
      })

      logger.info('查询账户列表成功', {
        admin_id: req.user.user_id,
        total: count,
        page: pagination.page
      })

      return res.apiSuccess(
        {
          accounts: rows,
          pagination: {
            total: count,
            page: pagination.page,
            page_size: pagination.page_size,
            total_pages: Math.ceil(count / pagination.page_size)
          }
        },
        '获取账户列表成功'
      )
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
      const { Account, User, AccountAssetBalance } = require('../../../models')

      const account = await Account.findByPk(parseInt(account_id), {
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile'],
            required: false
          },
          { model: AccountAssetBalance, as: 'balances', required: false }
        ]
      })

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
      const { user_id, role_name } = req.query
      const pagination = buildPaginationOptions(req.query)

      const { UserRole, User, Role } = require('../../../models')

      // 构建查询条件
      const where = {}
      if (user_id) where.user_id = parseInt(user_id)
      if (role_name) where.role_name = role_name

      const { count, rows } = await UserRole.findAndCountAll({
        where,
        include: [
          { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
          { model: Role, as: 'role', required: false }
        ],
        ...pagination
      })

      logger.info('查询用户角色列表成功', {
        admin_id: req.user.user_id,
        total: count,
        page: pagination.page
      })

      return res.apiSuccess(
        {
          user_roles: rows,
          pagination: {
            total: count,
            page: pagination.page,
            page_size: pagination.page_size,
            total_pages: Math.ceil(count / pagination.page_size)
          }
        },
        '获取用户角色列表成功'
      )
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
 * @query {string} [listing_kind] - 挂牌类型（item_instance/fungible_asset）
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
      const { seller_user_id, status, listing_kind, asset_code, start_date, end_date } = req.query
      const pagination = buildPaginationOptions(req.query)

      const { MarketListing, User, ItemInstance } = require('../../../models')

      // 构建查询条件
      const where = {}
      if (seller_user_id) where.seller_user_id = parseInt(seller_user_id)
      if (status) where.status = status
      if (listing_kind) where.listing_kind = listing_kind
      if (asset_code) where.offer_asset_code = asset_code
      if (start_date || end_date) {
        where.created_at = {}
        if (start_date) where.created_at[Op.gte] = new Date(start_date)
        if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
      }

      const { count, rows } = await MarketListing.findAndCountAll({
        where,
        include: [
          { model: User, as: 'seller', attributes: ['user_id', 'nickname', 'mobile'] },
          { model: ItemInstance, as: 'offerItem', required: false }
        ],
        ...pagination
      })

      logger.info('查询市场挂牌列表成功', {
        admin_id: req.user.user_id,
        total: count,
        page: pagination.page
      })

      return res.apiSuccess(
        {
          listings: rows,
          pagination: {
            total: count,
            page: pagination.page,
            page_size: pagination.page_size,
            total_pages: Math.ceil(count / pagination.page_size)
          }
        },
        '获取市场挂牌列表成功'
      )
    } catch (error) {
      return handleServiceError(error, res, '查询市场挂牌列表')
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
      const { MarketListing, User, ItemInstance } = require('../../../models')

      const listing = await MarketListing.findByPk(parseInt(market_listing_id), {
        include: [
          { model: User, as: 'seller', attributes: ['user_id', 'nickname', 'mobile'] },
          { model: ItemInstance, as: 'offerItem' }
        ]
      })

      if (!listing) {
        return res.apiError('挂牌不存在', 'NOT_FOUND', null, 404)
      }

      return res.apiSuccess(listing, '获取市场挂牌详情成功')
    } catch (error) {
      return handleServiceError(error, res, '获取市场挂牌详情')
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
      const { MarketListing } = require('../../../models')
      const { fn, col } = require('sequelize')

      // 按状态统计挂牌数量
      const statusStats = await MarketListing.findAll({
        attributes: ['status', [fn('COUNT', col('market_listing_id')), 'count']],
        group: ['status'],
        raw: true
      })

      // 按类型统计挂牌数量
      const typeStats = await MarketListing.findAll({
        attributes: ['listing_kind', [fn('COUNT', col('market_listing_id')), 'count']],
        group: ['listing_kind'],
        raw: true
      })

      // 总挂牌数
      const totalCount = await MarketListing.count()

      // 今日新增挂牌数
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayCount = await MarketListing.count({
        where: {
          created_at: { [Op.gte]: today }
        }
      })

      logger.info('查询市场挂牌统计成功', {
        admin_id: req.user.user_id,
        total: totalCount
      })

      return res.apiSuccess(
        {
          total_listings: totalCount,
          today_new_listings: todayCount,
          by_status: statusStats,
          by_type: typeStats
        },
        '获取市场挂牌统计成功'
      )
    } catch (error) {
      return handleServiceError(error, res, '查询市场挂牌统计')
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
      const { status, budget_mode, start_date, end_date } = req.query
      const pagination = buildPaginationOptions(req.query)

      const { LotteryCampaign, LotteryPrize } = require('../../../models')

      // 构建查询条件
      const where = {}
      if (status) where.status = status
      if (budget_mode) where.budget_mode = budget_mode
      if (start_date || end_date) {
        where.created_at = {}
        if (start_date) where.created_at[Op.gte] = new Date(start_date)
        if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
      }

      const { count, rows } = await LotteryCampaign.findAndCountAll({
        where,
        include: [
          {
            model: LotteryPrize,
            as: 'prizes',
            required: false,
            attributes: [
              'lottery_prize_id',
              'prize_name',
              'prize_type',
              'reward_tier',
              'win_probability',
              'stock_quantity',
              'total_win_count'
            ]
          }
        ],
        distinct: true, // 避免LEFT JOIN导致的count重复计算
        ...pagination
      })

      logger.info('查询抽奖活动列表成功', {
        admin_id: req.user.user_id,
        total: count,
        page: pagination.page
      })

      return res.apiSuccess(
        {
          campaigns: rows,
          pagination: {
            total: count,
            page: pagination.page,
            page_size: pagination.page_size,
            total_pages: Math.ceil(count / pagination.page_size)
          }
        },
        '获取抽奖活动列表成功'
      )
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
      const { LotteryCampaign, LotteryPrize } = require('../../../models')

      const campaign = await LotteryCampaign.findByPk(parseInt(lottery_campaign_id), {
        include: [{ model: LotteryPrize, as: 'prizes', required: false }]
      })

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
 */
router.post(
  '/lottery-campaigns',
  authenticateToken,
  requireRoleLevel(PERMISSION_LEVELS.OPS),
  async (req, res) => {
    try {
      const campaignData = req.body

      // 验证必填字段（路由层基础校验）
      if (!campaignData.campaign_name) {
        return res.apiError('活动名称不能为空', 'VALIDATION_ERROR', null, 400)
      }
      if (!campaignData.campaign_code) {
        return res.apiError('活动代码不能为空', 'VALIDATION_ERROR', null, 400)
      }
      if (!campaignData.campaign_type) {
        return res.apiError('活动类型不能为空', 'VALIDATION_ERROR', null, 400)
      }

      const { sequelize } = require('../../../models')

      // 开启事务（入口层管理事务边界）
      const transaction = await sequelize.transaction()

      try {
        // 通过服务层执行创建操作
        const campaign = await LotteryCampaignCRUDService.createCampaign(campaignData, {
          transaction,
          operator_user_id: req.user.user_id
        })

        await transaction.commit()

        return res.apiSuccess(campaign, '创建抽奖活动成功')
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    } catch (error) {
      return handleServiceError(error, res, '创建抽奖活动')
    }
  }
)

/**
 * PUT /api/v4/console/system-data/lottery-campaigns/:lottery_campaign_id
 * @desc 更新抽奖活动
 * @access Admin only (role_level >= 100)
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
        cost_per_draw,
        max_draws_per_user_daily,
        max_draws_per_user_total,
        total_prize_pool,
        remaining_prize_pool,
        prize_distribution_config
      } = req.body

      const { sequelize } = require('../../../models')

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
      if (cost_per_draw !== undefined) updateData.cost_per_draw = cost_per_draw
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

      // 开启事务（入口层管理事务边界）
      const transaction = await sequelize.transaction()

      try {
        // 通过服务层执行更新操作
        const campaign = await LotteryCampaignCRUDService.updateCampaign(
          parseInt(lottery_campaign_id),
          updateData,
          { transaction, operator_user_id: req.user.user_id }
        )

        await transaction.commit()

        return res.apiSuccess(campaign, '更新抽奖活动成功')
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    } catch (error) {
      return handleServiceError(error, res, '更新抽奖活动')
    }
  }
)

/**
 * PUT /api/v4/console/system-data/lottery-campaigns/:lottery_campaign_id/status
 * @desc 更新抽奖活动状态
 * @access Admin only (role_level >= 100)
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

      const { sequelize } = require('../../../models')

      // 开启事务（入口层管理事务边界）
      const transaction = await sequelize.transaction()

      try {
        // 通过服务层执行状态更新操作
        const campaign = await LotteryCampaignCRUDService.updateCampaignStatus(
          parseInt(lottery_campaign_id),
          status,
          { transaction, operator_user_id: req.user.user_id }
        )

        await transaction.commit()

        return res.apiSuccess(campaign, '更新活动状态成功')
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    } catch (error) {
      return handleServiceError(error, res, '更新抽奖活动状态')
    }
  }
)

/**
 * DELETE /api/v4/console/system-data/lottery-campaigns/:lottery_campaign_id
 * @desc 删除抽奖活动
 * @access Admin only (role_level >= 100)
 */
router.delete(
  '/lottery-campaigns/:lottery_campaign_id',
  authenticateToken,
  requireRoleLevel(PERMISSION_LEVELS.OPS),
  async (req, res) => {
    try {
      const { lottery_campaign_id } = req.params
      const { sequelize } = require('../../../models')

      // 开启事务（入口层管理事务边界）
      const transaction = await sequelize.transaction()

      try {
        // 通过服务层执行删除操作
        const result = await LotteryCampaignCRUDService.deleteCampaign(
          parseInt(lottery_campaign_id),
          {
            transaction,
            operator_user_id: req.user.user_id
          }
        )

        await transaction.commit()

        return res.apiSuccess(
          {
            lottery_campaign_id: result.lottery_campaign_id,
            campaign_name: result.campaign_name,
            deleted: result.deleted
          },
          '删除抽奖活动成功'
        )
      } catch (error) {
        await transaction.rollback()
        throw error
      }
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
      const { user_id, lottery_campaign_id, quota_date } = req.query
      const pagination = buildPaginationOptions(req.query, 'quota_date')

      const { LotteryUserDailyDrawQuota } = require('../../../models')

      // 构建查询条件
      const where = {}
      if (user_id) where.user_id = parseInt(user_id)
      if (lottery_campaign_id) where.lottery_campaign_id = parseInt(lottery_campaign_id)
      if (quota_date) where.quota_date = quota_date

      const { count, rows } = await LotteryUserDailyDrawQuota.findAndCountAll({
        where,
        ...pagination
      })

      logger.info('查询用户每日抽奖配额列表成功', {
        admin_id: req.user.user_id,
        total: count,
        page: pagination.page
      })

      return res.apiSuccess(
        {
          quotas: rows,
          pagination: {
            total: count,
            page: pagination.page,
            page_size: pagination.page_size,
            total_pages: Math.ceil(count / pagination.page_size)
          }
        },
        '获取用户每日抽奖配额列表成功'
      )
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
      const { LotteryUserDailyDrawQuota } = require('../../../models')

      const quota = await LotteryUserDailyDrawQuota.findByPk(parseInt(quota_id))

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
