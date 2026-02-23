'use strict'

/**
 * 系统数据查询服务 - Console 域
 *
 * @description 提供管理后台系统数据的只读查询功能
 *
 * 收口来源：routes/v4/console/system-data.js 的读操作
 * 遵循架构规范：读写分层策略 Phase 3
 *
 * 涵盖查询：
 * - 账户表 (accounts)
 * - 用户角色表 (user_roles)
 * - 市场挂牌表 (market_listings)
 * - 抽奖活动表 (lottery_campaigns)
 * - 用户每日抽奖配额表 (lottery_user_daily_draw_quota)
 *
 * @module services/console/SystemDataQueryService
 * @version 1.0.0
 * @date 2026-02-01
 */

const { Op, fn, col } = require('sequelize')
const logger = require('../../utils/logger').logger
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

/**
 * 缓存配置
 * @constant
 */
const CACHE_CONFIG = {
  /** 账户列表缓存 TTL (60秒) */
  ACCOUNTS_LIST: 60,
  /** 市场统计缓存 TTL (120秒) */
  MARKET_STATS: 120,
  /** 活动列表缓存 TTL (60秒) */
  CAMPAIGNS_LIST: 60
}

/**
 * 系统数据查询服务类
 * 提供管理后台系统数据的只读查询功能
 *
 * @class SystemDataQueryService
 */
class SystemDataQueryService {
  /**
   * 查询账户列表
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.account_type] - 账户类型 (user/system)
   * @param {number} [options.user_id] - 用户ID
   * @param {string} [options.system_code] - 系统账户代码
   * @param {string} [options.status] - 账户状态 (active/disabled)
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.sort_by='created_at'] - 排序字段
   * @param {string} [options.sort_order='DESC'] - 排序方向
   * @returns {Promise<Object>} 账户列表和分页信息
   */
  static async getAccounts(options = {}) {
    // 延迟加载模型，避免循环依赖
    const { Account, User } = require('../../models')

    const {
      account_type,
      user_id,
      system_code,
      status,
      page = 1,
      page_size = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = options

    // 构建查询条件
    const where = {}
    if (account_type) where.account_type = account_type
    if (user_id) where.user_id = parseInt(user_id)
    if (system_code) where.system_code = system_code
    if (status) where.status = status

    // 分页参数
    const pageNum = Math.max(1, parseInt(page))
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size)))
    const offset = (pageNum - 1) * pageSizeNum
    const order = [[sort_by, sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']]

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
      order,
      limit: pageSizeNum,
      offset
    })

    logger.info('查询账户列表成功', { total: count, page: pageNum })

    return {
      accounts: rows,
      pagination: {
        total: count,
        page: pageNum,
        page_size: pageSizeNum,
        total_pages: Math.ceil(count / pageSizeNum)
      }
    }
  }

  /**
   * 获取账户详情
   *
   * @param {number} account_id - 账户ID
   * @returns {Promise<Object|null>} 账户详情
   */
  static async getAccountById(account_id) {
    const { Account, User, AccountAssetBalance } = require('../../models')

    const account = await Account.findByPk(parseInt(account_id), {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile'],
          required: false
        },
        {
          model: AccountAssetBalance,
          as: 'balances',
          required: false
        }
      ]
    })

    return account
  }

  /**
   * 查询用户角色列表
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.user_id] - 用户ID
   * @param {string} [options.role_name] - 角色名称
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.sort_by='created_at'] - 排序字段
   * @param {string} [options.sort_order='DESC'] - 排序方向
   * @returns {Promise<Object>} 用户角色列表和分页信息
   */
  static async getUserRoles(options = {}) {
    const { UserRole, User, Role } = require('../../models')

    const {
      user_id,
      role_name,
      page = 1,
      page_size = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = options

    // 构建查询条件
    const where = {}
    if (user_id) where.user_id = parseInt(user_id)
    if (role_name) where.role_name = role_name

    // 分页参数
    const pageNum = Math.max(1, parseInt(page))
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size)))
    const offset = (pageNum - 1) * pageSizeNum
    const order = [[sort_by, sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']]

    const { count, rows } = await UserRole.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: Role, as: 'role', required: false }
      ],
      order,
      limit: pageSizeNum,
      offset
    })

    logger.info('查询用户角色列表成功', { total: count, page: pageNum })

    return {
      user_roles: rows,
      pagination: {
        total: count,
        page: pageNum,
        page_size: pageSizeNum,
        total_pages: Math.ceil(count / pageSizeNum)
      }
    }
  }

  /**
   * 查询市场挂牌列表
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.seller_user_id] - 卖家用户ID
   * @param {string} [options.status] - 挂牌状态
   * @param {string} [options.listing_kind] - 挂牌类型
   * @param {string} [options.asset_code] - 资产代码
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.sort_by='created_at'] - 排序字段
   * @param {string} [options.sort_order='DESC'] - 排序方向
   * @returns {Promise<Object>} 市场挂牌列表和分页信息
   */
  static async getMarketListings(options = {}) {
    const { MarketListing, User, Item } = require('../../models')

    const {
      seller_user_id,
      status,
      listing_kind,
      asset_code,
      start_date,
      end_date,
      page = 1,
      page_size = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = options

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

    // 分页参数
    const pageNum = Math.max(1, parseInt(page))
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size)))
    const offset = (pageNum - 1) * pageSizeNum
    const order = [[sort_by, sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']]

    const { count, rows } = await MarketListing.findAndCountAll({
      where,
      include: [
        { model: User, as: 'seller', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: Item, as: 'offerItem', required: false }
      ],
      order,
      limit: pageSizeNum,
      offset
    })

    logger.info('查询市场挂牌列表成功', { total: count, page: pageNum })

    return {
      listings: rows,
      pagination: {
        total: count,
        page: pageNum,
        page_size: pageSizeNum,
        total_pages: Math.ceil(count / pageSizeNum)
      }
    }
  }

  /**
   * 获取市场挂牌详情
   *
   * @param {number} market_listing_id - 市场挂牌ID
   * @returns {Promise<Object|null>} 市场挂牌详情
   */
  static async getMarketListingById(market_listing_id) {
    const { MarketListing, User, Item } = require('../../models')

    const listing = await MarketListing.findByPk(parseInt(market_listing_id), {
      include: [
        { model: User, as: 'seller', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: Item, as: 'offerItem' }
      ]
    })

    return listing
  }

  /**
   * 获取市场挂牌统计摘要
   * 热点查询 - 启用缓存
   *
   * @returns {Promise<Object>} 市场挂牌统计摘要
   */
  static async getMarketListingStats() {
    const cacheKey = 'system_data:market_listing_stats'

    // 尝试从缓存获取
    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      logger.debug('市场统计命中缓存', { cacheKey })
      return cached
    }

    const { MarketListing } = require('../../models')

    // 并行查询统计数据
    const [statusStats, typeStats, totalCount, todayCount] = await Promise.all([
      // 按状态统计挂牌数量
      MarketListing.findAll({
        attributes: ['status', [fn('COUNT', col('market_listing_id')), 'count']],
        group: ['status'],
        raw: true
      }),
      // 按类型统计挂牌数量
      MarketListing.findAll({
        attributes: ['listing_kind', [fn('COUNT', col('market_listing_id')), 'count']],
        group: ['listing_kind'],
        raw: true
      }),
      // 总挂牌数
      MarketListing.count(),
      // 今日新增挂牌数
      (async () => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return MarketListing.count({
          where: { created_at: { [Op.gte]: today } }
        })
      })()
    ])

    const result = {
      total_listings: totalCount,
      today_new_listings: todayCount,
      by_status: statusStats,
      by_type: typeStats
    }

    // 写入缓存
    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.MARKET_STATS)
    logger.info('市场统计已缓存', { cacheKey, ttl: CACHE_CONFIG.MARKET_STATS })

    return result
  }

  /**
   * 查询抽奖活动列表
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.status] - 活动状态
   * @param {string} [options.budget_mode] - 预算模式
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.sort_by='created_at'] - 排序字段
   * @param {string} [options.sort_order='DESC'] - 排序方向
   * @returns {Promise<Object>} 抽奖活动列表和分页信息
   */
  static async getLotteryCampaigns(options = {}) {
    const { LotteryCampaign, LotteryPrize } = require('../../models')

    const {
      status,
      budget_mode,
      start_date,
      end_date,
      page = 1,
      page_size = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = options

    // 构建查询条件
    const where = {}
    if (status) where.status = status
    if (budget_mode) where.budget_mode = budget_mode
    if (start_date || end_date) {
      where.created_at = {}
      if (start_date) where.created_at[Op.gte] = new Date(start_date)
      if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
    }

    // 分页参数
    const pageNum = Math.max(1, parseInt(page))
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size)))
    const offset = (pageNum - 1) * pageSizeNum
    const order = [[sort_by, sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']]

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
      order,
      limit: pageSizeNum,
      offset
    })

    logger.info('查询抽奖活动列表成功', { total: count, page: pageNum })

    return {
      campaigns: rows,
      pagination: {
        total: count,
        page: pageNum,
        page_size: pageSizeNum,
        total_pages: Math.ceil(count / pageSizeNum)
      }
    }
  }

  /**
   * 获取抽奖活动详情
   *
   * @param {number} lottery_campaign_id - 抽奖活动ID
   * @returns {Promise<Object|null>} 抽奖活动详情
   */
  static async getLotteryCampaignById(lottery_campaign_id) {
    const { LotteryCampaign, LotteryPrize } = require('../../models')

    const campaign = await LotteryCampaign.findByPk(parseInt(lottery_campaign_id), {
      include: [{ model: LotteryPrize, as: 'prizes', required: false }]
    })

    return campaign
  }

  /**
   * 查询用户每日抽奖配额列表
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.user_id] - 用户ID
   * @param {number} [options.lottery_campaign_id] - 活动ID
   * @param {string} [options.quota_date] - 配额日期（YYYY-MM-DD）
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.sort_by='quota_date'] - 排序字段
   * @param {string} [options.sort_order='DESC'] - 排序方向
   * @returns {Promise<Object>} 配额列表和分页信息
   */
  static async getLotteryDailyQuotas(options = {}) {
    const { LotteryUserDailyDrawQuota } = require('../../models')

    const {
      user_id,
      lottery_campaign_id,
      quota_date,
      page = 1,
      page_size = 20,
      sort_by = 'quota_date',
      sort_order = 'DESC'
    } = options

    // 构建查询条件
    const where = {}
    if (user_id) where.user_id = parseInt(user_id)
    if (lottery_campaign_id) where.lottery_campaign_id = parseInt(lottery_campaign_id)
    if (quota_date) where.quota_date = quota_date

    // 分页参数
    const pageNum = Math.max(1, parseInt(page))
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size)))
    const offset = (pageNum - 1) * pageSizeNum
    const order = [[sort_by, sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']]

    const { count, rows } = await LotteryUserDailyDrawQuota.findAndCountAll({
      where,
      order,
      limit: pageSizeNum,
      offset
    })

    logger.info('查询用户每日抽奖配额列表成功', { total: count, page: pageNum })

    return {
      quotas: rows,
      pagination: {
        total: count,
        page: pageNum,
        page_size: pageSizeNum,
        total_pages: Math.ceil(count / pageSizeNum)
      }
    }
  }

  /**
   * 获取用户每日抽奖配额详情
   *
   * @param {number} quota_id - 配额记录ID
   * @returns {Promise<Object|null>} 配额详情
   */
  static async getLotteryDailyQuotaById(quota_id) {
    const { LotteryUserDailyDrawQuota } = require('../../models')

    const quota = await LotteryUserDailyDrawQuota.findByPk(parseInt(quota_id))

    return quota
  }
}

module.exports = SystemDataQueryService
