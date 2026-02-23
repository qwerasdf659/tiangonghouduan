/**
 * 价格发现服务 — PriceDiscoveryService
 *
 * 核心职责：基于已完成的交易数据（trade_orders + market_listings），
 * 提供价格走势、成交量、价格摘要、最近成交等聚合查询
 *
 * 数据来源（零新建表）：
 * - trade_orders.gross_amount, .fee_amount, .net_amount, .completed_at, .status
 * - market_listings.listing_kind, .offer_asset_code, .offer_item_template_id, .offer_amount
 *
 * 缓存策略：
 * - 价格走势：10分钟 TTL（BusinessCacheHelper.setPriceTrend）
 * - 价格摘要：5分钟 TTL（BusinessCacheHelper.setPriceSummary）
 * - 最近成交：30秒 TTL
 *
 * @module services/market/PriceDiscoveryService
 * @version 1.0.0
 * @date 2026-02-23
 */

'use strict'

const { sequelize } = require('../../config/database')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

/**
 * 价格发现服务类
 * 职责：基于已完成交易数据提供价格走势、成交量、价格摘要等聚合查询
 * 设计模式：查询服务模式 + 缓存策略
 */
class PriceDiscoveryService {
  /**
   * 获取价格走势（按时间粒度聚合）
   *
   * @param {Object} params - 查询参数
   * @param {string} params.asset_code - 资产代码（fungible_asset类型）
   * @param {number} params.template_id - 物品模板ID（item类型）
   * @param {string} params.period - 时间范围（1d/7d/30d/90d）
   * @param {string} params.granularity - 聚合粒度（1h/1d/1w）
   * @returns {Promise<Object>} 价格走势数据
   */
  static async getPriceTrend(params = {}) {
    const { asset_code, template_id, period = '7d', granularity = '1d' } = params
    const cacheKey = `${asset_code || template_id}:${period}:${granularity}`

    const cached = await BusinessCacheHelper.getPriceTrend(cacheKey)
    if (cached) return cached

    const days = this._periodToDays(period)
    const dateFormat = this._granularityToFormat(granularity)
    const { whereClause, replacements } = this._buildAssetFilter(asset_code, template_id)

    const rows = await sequelize.query(
      `SELECT
        DATE_FORMAT(t.completed_at, '${dateFormat}') AS time_bucket,
        COUNT(*) AS trade_count,
        MIN(t.gross_amount) AS min_price,
        MAX(t.gross_amount) AS max_price,
        ROUND(AVG(t.gross_amount)) AS avg_price,
        SUM(t.fee_amount) AS total_fees,
        SUM(COALESCE(ml.offer_amount, 1)) AS total_volume
      FROM trade_orders t
      JOIN market_listings ml ON t.market_listing_id = ml.market_listing_id
      WHERE t.status = 'completed'
        AND t.completed_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
        ${whereClause}
      GROUP BY time_bucket
      ORDER BY time_bucket ASC`,
      { replacements: { ...replacements, days }, type: sequelize.QueryTypes.SELECT }
    )

    const result = {
      asset_code: asset_code || null,
      template_id: template_id || null,
      period,
      granularity,
      data_points: rows || []
    }

    await BusinessCacheHelper.setPriceTrend(cacheKey, result)
    return result
  }

  /**
   * 获取成交量走势
   *
   * @param {Object} params - 查询参数（同 getPriceTrend）
   * @returns {Promise<Object>} 成交量走势数据
   */
  static async getVolumeTrend(params = {}) {
    const { asset_code, template_id, period = '7d', granularity = '1d' } = params
    const days = this._periodToDays(period)
    const dateFormat = this._granularityToFormat(granularity)
    const { whereClause, replacements } = this._buildAssetFilter(asset_code, template_id)

    const rows = await sequelize.query(
      `SELECT
        DATE_FORMAT(t.completed_at, '${dateFormat}') AS time_bucket,
        COUNT(*) AS trade_count,
        SUM(t.gross_amount) AS total_diamond_volume,
        SUM(COALESCE(ml.offer_amount, 1)) AS total_item_volume
      FROM trade_orders t
      JOIN market_listings ml ON t.market_listing_id = ml.market_listing_id
      WHERE t.status = 'completed'
        AND t.completed_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
        ${whereClause}
      GROUP BY time_bucket
      ORDER BY time_bucket ASC`,
      { replacements: { ...replacements, days }, type: sequelize.QueryTypes.SELECT }
    )

    return {
      asset_code: asset_code || null,
      template_id: template_id || null,
      period,
      granularity,
      data_points: rows || []
    }
  }

  /**
   * 获取价格摘要（中位数、极值、均值、总成交数）
   *
   * @param {Object} params - 查询参数
   * @param {string} params.asset_code - 资产代码
   * @param {number} params.template_id - 物品模板ID
   * @returns {Promise<Object>} 价格摘要
   */
  static async getPriceSummary(params = {}) {
    const { asset_code, template_id } = params
    const summaryKey = asset_code || `tpl_${template_id}`

    const cached = await BusinessCacheHelper.getPriceSummary(summaryKey)
    if (cached) return cached

    const { whereClause, replacements } = this._buildAssetFilter(asset_code, template_id)

    // 全量统计（单行聚合，解构取首行）
    const [allTime] = await sequelize.query(
      `SELECT
        COUNT(*) AS total_trades,
        MIN(t.gross_amount) AS lowest_ever,
        MAX(t.gross_amount) AS highest_ever,
        ROUND(AVG(t.gross_amount)) AS avg_price_all
      FROM trade_orders t
      JOIN market_listings ml ON t.market_listing_id = ml.market_listing_id
      WHERE t.status = 'completed' ${whereClause}`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    )

    // 近7天统计（单行聚合，解构取首行）
    const [recent] = await sequelize.query(
      `SELECT
        COUNT(*) AS trades_7d,
        ROUND(AVG(t.gross_amount)) AS avg_price_7d,
        MIN(t.gross_amount) AS min_price_7d,
        MAX(t.gross_amount) AS max_price_7d
      FROM trade_orders t
      JOIN market_listings ml ON t.market_listing_id = ml.market_listing_id
      WHERE t.status = 'completed'
        AND t.completed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ${whereClause}`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    )

    // 中位数计算（多行结果，不解构）
    const medianRows = await sequelize.query(
      `SELECT t.gross_amount
      FROM trade_orders t
      JOIN market_listings ml ON t.market_listing_id = ml.market_listing_id
      WHERE t.status = 'completed' ${whereClause}
      ORDER BY t.gross_amount ASC`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    )

    let median_price = 0
    if (medianRows && medianRows.length > 0) {
      const mid = Math.floor(medianRows.length / 2)
      median_price =
        medianRows.length % 2 === 0
          ? Math.round(
              (Number(medianRows[mid - 1].gross_amount) + Number(medianRows[mid].gross_amount)) / 2
            )
          : Number(medianRows[mid].gross_amount)
    }

    const summary = {
      asset_code: asset_code || null,
      template_id: template_id || null,
      total_trades: Number(allTime?.total_trades) || 0,
      lowest_ever: Number(allTime?.lowest_ever) || 0,
      highest_ever: Number(allTime?.highest_ever) || 0,
      avg_price_all: Number(allTime?.avg_price_all) || 0,
      median_price,
      trades_7d: Number(recent?.trades_7d) || 0,
      avg_price_7d: Number(recent?.avg_price_7d) || 0,
      min_price_7d: Number(recent?.min_price_7d) || 0,
      max_price_7d: Number(recent?.max_price_7d) || 0
    }

    await BusinessCacheHelper.setPriceSummary(summaryKey, summary)
    return summary
  }

  /**
   * 获取最近成交列表
   *
   * @param {Object} params - 查询参数
   * @param {string} params.asset_code - 资产代码
   * @param {number} params.template_id - 物品模板ID
   * @param {number} params.limit - 数量限制（默认10）
   * @returns {Promise<Array>} 最近成交列表
   */
  static async getLatestTrades(params = {}) {
    const { asset_code, template_id, limit = 10 } = params
    const { whereClause, replacements } = this._buildAssetFilter(asset_code, template_id)

    const rows = await sequelize.query(
      `SELECT
        t.trade_order_id,
        t.gross_amount,
        t.fee_amount,
        t.net_amount,
        t.asset_code AS settlement_asset,
        t.completed_at,
        ml.listing_kind,
        ml.offer_asset_code,
        ml.offer_amount,
        ml.offer_item_template_id
      FROM trade_orders t
      JOIN market_listings ml ON t.market_listing_id = ml.market_listing_id
      WHERE t.status = 'completed' ${whereClause}
      ORDER BY t.completed_at DESC
      LIMIT :limit`,
      {
        replacements: { ...replacements, limit: parseInt(limit) },
        type: sequelize.QueryTypes.SELECT
      }
    )

    return rows || []
  }

  // ==================== 内部工具方法 ====================

  /**
   * 构建资产筛选条件
   * @param {string} asset_code - 资产代码
   * @param {number} template_id - 模板ID
   * @returns {{ whereClause: string, replacements: Object }} SQL片段和参数
   * @private
   */
  static _buildAssetFilter(asset_code, template_id) {
    let whereClause = ''
    const replacements = {}

    if (asset_code) {
      whereClause += ' AND ml.offer_asset_code = :asset_code'
      replacements.asset_code = asset_code
    }
    if (template_id) {
      whereClause += ' AND ml.offer_item_template_id = :template_id'
      replacements.template_id = parseInt(template_id)
    }

    return { whereClause, replacements }
  }

  /**
   * 时间范围转天数
   * @param {string} period - 时间范围标识（1d/7d/30d/90d）
   * @returns {number} 天数
   * @private
   */
  static _periodToDays(period) {
    const map = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 }
    return map[period] || 7
  }

  /**
   * 聚合粒度转 MySQL DATE_FORMAT
   * @param {string} granularity - 聚合粒度标识（1h/1d/1w）
   * @returns {string} MySQL DATE_FORMAT 格式字符串
   * @private
   */
  static _granularityToFormat(granularity) {
    const map = {
      '1h': '%Y-%m-%d %H:00',
      '1d': '%Y-%m-%d',
      '1w': '%Y-%u'
    }
    return map[granularity] || '%Y-%m-%d'
  }
}

module.exports = PriceDiscoveryService
