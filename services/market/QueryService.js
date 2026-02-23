'use strict'

/**
 * 市场查询服务
 *
 * @description 提供市场挂牌相关的只读查询功能
 *
 * 遵循架构规范：读写分层策略 Phase 3
 * 热点查询启用缓存，提高查询效率
 *
 * 涵盖查询：
 * - 可用市场挂牌列表（热点查询）
 * - 挂牌详情查询
 * - 挂牌统计摘要
 * - 用户挂牌历史
 *
 * @module services/market/QueryService
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
  /** 可用挂牌列表缓存 TTL (30秒) */
  AVAILABLE_LISTINGS: 30,
  /** 挂牌统计缓存 TTL (120秒) */
  LISTING_STATS: 120,
  /** 挂牌详情缓存 TTL (60秒) */
  LISTING_DETAIL: 60
}

/**
 * 市场查询服务类
 * 提供市场挂牌相关的只读查询功能
 *
 * @class MarketQueryService
 */
class MarketQueryService {
  /**
   * 获取可用市场挂牌列表
   * 热点查询 - 启用缓存
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.listing_kind] - 挂牌类型
   * @param {string} [options.asset_code] - 资产代码
   * @param {number} [options.min_price] - 最低价格
   * @param {number} [options.max_price] - 最高价格
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.sort_by='created_at'] - 排序字段
   * @param {string} [options.sort_order='DESC'] - 排序方向
   * @returns {Promise<Object>} 挂牌列表和分页信息
   */
  static async getAvailableListings(options = {}) {
    const {
      listing_kind,
      asset_code,
      min_price,
      max_price,
      page = 1,
      page_size = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = options

    // 构建缓存键
    const cacheKey = `market:available:${JSON.stringify({
      listing_kind,
      asset_code,
      min_price,
      max_price,
      page,
      page_size,
      sort_by,
      sort_order
    })}`

    // 尝试从缓存获取
    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      logger.debug('可用挂牌列表命中缓存', { cacheKey })
      return cached
    }

    // 延迟加载模型
    const { MarketListing, User, Item } = require('../../models')

    // 构建查询条件
    const where = { status: 'available' }
    if (listing_kind) where.listing_kind = listing_kind
    if (asset_code) where.offer_asset_code = asset_code
    if (min_price !== undefined || max_price !== undefined) {
      where.asking_asset_amount = {}
      if (min_price !== undefined) where.asking_asset_amount[Op.gte] = parseFloat(min_price)
      if (max_price !== undefined) where.asking_asset_amount[Op.lte] = parseFloat(max_price)
    }

    // 分页参数
    const pageNum = Math.max(1, parseInt(page))
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size)))
    const offset = (pageNum - 1) * pageSizeNum
    const order = [[sort_by, sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']]

    const { count, rows } = await MarketListing.findAndCountAll({
      where,
      include: [
        { model: User, as: 'seller', attributes: ['user_id', 'nickname'] },
        { model: Item, as: 'offerItem', required: false }
      ],
      order,
      limit: pageSizeNum,
      offset
    })

    const result = {
      listings: rows,
      pagination: {
        total: count,
        page: pageNum,
        page_size: pageSizeNum,
        total_pages: Math.ceil(count / pageSizeNum)
      }
    }

    // 写入缓存
    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.AVAILABLE_LISTINGS)
    logger.info('可用挂牌列表已缓存', { cacheKey, ttl: CACHE_CONFIG.AVAILABLE_LISTINGS })

    return result
  }

  /**
   * 获取市场挂牌详情
   *
   * @param {number} market_listing_id - 市场挂牌ID
   * @returns {Promise<Object|null>} 挂牌详情
   */
  static async getListingById(market_listing_id) {
    const { MarketListing, User, Item } = require('../../models')

    const listing = await MarketListing.findByPk(parseInt(market_listing_id), {
      include: [
        { model: User, as: 'seller', attributes: ['user_id', 'nickname'] },
        { model: User, as: 'buyer', attributes: ['user_id', 'nickname'], required: false },
        { model: Item, as: 'offerItem', required: false }
      ]
    })

    return listing
  }

  /**
   * 获取市场挂牌统计摘要
   * 热点查询 - 启用缓存
   *
   * @returns {Promise<Object>} 市场统计摘要
   */
  static async getMarketStats() {
    const cacheKey = 'market:stats'

    // 尝试从缓存获取
    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      logger.debug('市场统计命中缓存', { cacheKey })
      return cached
    }

    const { MarketListing } = require('../../models')

    // 并行查询统计数据
    const [statusStats, typeStats, totalCount, availableCount, todayCount] = await Promise.all([
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
      // 可用挂牌数
      MarketListing.count({ where: { status: 'available' } }),
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
      available_listings: availableCount,
      today_new_listings: todayCount,
      by_status: statusStats.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count)
        return acc
      }, {}),
      by_type: typeStats.reduce((acc, item) => {
        acc[item.listing_kind] = parseInt(item.count)
        return acc
      }, {})
    }

    // 写入缓存
    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.LISTING_STATS)
    logger.info('市场统计已缓存', { cacheKey, ttl: CACHE_CONFIG.LISTING_STATS })

    return result
  }

  /**
   * 获取用户挂牌历史
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @param {string} [options.status] - 挂牌状态
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 挂牌历史和分页信息
   */
  static async getUserListingHistory(user_id, options = {}) {
    const { MarketListing, Item } = require('../../models')

    const { status, page = 1, page_size = 20 } = options

    // 构建查询条件
    const where = { seller_user_id: parseInt(user_id) }
    if (status) where.status = status

    // 分页参数
    const pageNum = Math.max(1, parseInt(page))
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size)))
    const offset = (pageNum - 1) * pageSizeNum

    const { count, rows } = await MarketListing.findAndCountAll({
      where,
      include: [{ model: Item, as: 'offerItem', required: false }],
      order: [['created_at', 'DESC']],
      limit: pageSizeNum,
      offset
    })

    logger.info('查询用户挂牌历史成功', { user_id, total: count })

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
   * 获取用户购买历史
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 购买历史和分页信息
   */
  static async getUserPurchaseHistory(user_id, options = {}) {
    const { MarketListing, User, Item } = require('../../models')

    const { page = 1, page_size = 20 } = options

    // 查询已购买的挂牌
    const where = {
      buyer_user_id: parseInt(user_id),
      status: 'sold'
    }

    // 分页参数
    const pageNum = Math.max(1, parseInt(page))
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size)))
    const offset = (pageNum - 1) * pageSizeNum

    const { count, rows } = await MarketListing.findAndCountAll({
      where,
      include: [
        { model: User, as: 'seller', attributes: ['user_id', 'nickname'] },
        { model: Item, as: 'offerItem', required: false }
      ],
      order: [['sold_at', 'DESC']],
      limit: pageSizeNum,
      offset
    })

    logger.info('查询用户购买历史成功', { user_id, total: count })

    return {
      purchases: rows,
      pagination: {
        total: count,
        page: pageNum,
        page_size: pageSizeNum,
        total_pages: Math.ceil(count / pageSizeNum)
      }
    }
  }
}

module.exports = MarketQueryService
