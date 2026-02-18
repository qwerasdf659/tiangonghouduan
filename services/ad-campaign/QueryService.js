/**
 * 广告活动查询服务（AdCampaignQueryService）
 *
 * 职责：
 * - 竞价日志分页查询（Phase 4）
 * - 用户广告标签分页查询（Phase 5 DMP）
 * - 反作弊日志分页查询（Phase 5）
 * - 归因追踪日志分页查询（Phase 6）
 *
 * 架构定位：
 * - 路由层通过 ServiceManager.getService('ad_campaign_query') 获取
 * - 读操作收口层，路由禁止直连 models
 * - 静态类，无状态
 *
 * @module services/ad-campaign/QueryService
 */

const { AdBidLog, UserAdTag, AdAntifraudLog, AdAttributionLog } = require('../../models')

/**
 * 广告活动查询服务类
 *
 * @class AdCampaignQueryService
 * @description 广告域日志查询读操作收口
 */
class AdCampaignQueryService {
  /**
   * 竞价日志分页查询
   *
   * @param {Object} params - 查询参数
   * @param {number} [params.ad_slot_id] - 广告位ID筛选
   * @param {number} [params.ad_campaign_id] - 广告活动ID筛选
   * @param {boolean} [params.is_winner] - 是否胜出筛选
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.pageSize=20] - 每页数量
   * @returns {Promise<Object>} { bid_logs, pagination }
   */
  static async getBidLogs(params = {}) {
    const { ad_slot_id, ad_campaign_id, is_winner, page = 1, pageSize = 20 } = params

    const where = {}
    if (ad_slot_id) where.ad_slot_id = parseInt(ad_slot_id)
    if (ad_campaign_id) where.ad_campaign_id = parseInt(ad_campaign_id)
    if (is_winner !== undefined && is_winner !== null && is_winner !== '') {
      where.is_winner = is_winner === true || is_winner === 'true'
    }

    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    const { count, rows } = await AdBidLog.findAndCountAll({
      where,
      order: [['bid_at', 'DESC']],
      limit: parseInt(pageSize),
      offset
    })

    return {
      bid_logs: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(pageSize),
        total_pages: Math.ceil(count / parseInt(pageSize))
      }
    }
  }

  /**
   * 用户广告标签分页查询（DMP 标签浏览）
   *
   * @param {Object} params - 查询参数
   * @param {number} [params.user_id] - 用户ID筛选
   * @param {string} [params.tag_key] - 标签键筛选
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.pageSize=50] - 每页数量
   * @returns {Promise<Object>} { user_ad_tags, pagination }
   */
  static async getUserAdTags(params = {}) {
    const { user_id, tag_key, page = 1, pageSize = 50 } = params

    const where = {}
    if (user_id) where.user_id = parseInt(user_id)
    if (tag_key) where.tag_key = tag_key

    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    const { count, rows } = await UserAdTag.findAndCountAll({
      where,
      order: [['calculated_at', 'DESC']],
      limit: parseInt(pageSize),
      offset
    })

    return {
      user_ad_tags: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(pageSize),
        total_pages: Math.ceil(count / parseInt(pageSize))
      }
    }
  }

  /**
   * 反作弊日志分页查询
   *
   * @param {Object} params - 查询参数
   * @param {number} [params.ad_campaign_id] - 广告活动ID筛选
   * @param {string} [params.verdict] - 判定结果筛选（valid/invalid/suspicious）
   * @param {string} [params.event_type] - 事件类型筛选（impression/click）
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.pageSize=20] - 每页数量
   * @returns {Promise<Object>} { antifraud_logs, pagination }
   */
  static async getAntifraudLogs(params = {}) {
    const { ad_campaign_id, verdict, event_type, page = 1, pageSize = 20 } = params

    const where = {}
    if (ad_campaign_id) where.ad_campaign_id = parseInt(ad_campaign_id)
    if (verdict) where.verdict = verdict
    if (event_type) where.event_type = event_type

    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    const { count, rows } = await AdAntifraudLog.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(pageSize),
      offset
    })

    return {
      antifraud_logs: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(pageSize),
        total_pages: Math.ceil(count / parseInt(pageSize))
      }
    }
  }

  /**
   * 归因追踪日志分页查询
   *
   * @param {Object} params - 查询参数
   * @param {number} [params.ad_campaign_id] - 广告活动ID筛选
   * @param {string} [params.conversion_type] - 转化类型筛选（lottery_draw/exchange/market_buy/page_view）
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.pageSize=20] - 每页数量
   * @returns {Promise<Object>} { attribution_logs, pagination }
   */
  static async getAttributionLogs(params = {}) {
    const { ad_campaign_id, conversion_type, page = 1, pageSize = 20 } = params

    const where = {}
    if (ad_campaign_id) where.ad_campaign_id = parseInt(ad_campaign_id)
    if (conversion_type) where.conversion_type = conversion_type

    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    const { count, rows } = await AdAttributionLog.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(pageSize),
      offset
    })

    return {
      attribution_logs: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(pageSize),
        total_pages: Math.ceil(count / parseInt(pageSize))
      }
    }
  }
}

module.exports = AdCampaignQueryService
