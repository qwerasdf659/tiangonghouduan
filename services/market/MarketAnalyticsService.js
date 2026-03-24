/**
 * 市场数据分析服务 — MarketAnalyticsService
 *
 * 核心职责：卖家视角的市场分析，提供定价建议和市场总览
 *
 * 定价建议算法：
 *   建议最低价 = 近7天成交均价 × 0.8
 *   建议参考价 = 近7天成交均价
 *   建议最高价 = 近7天成交均价 × 1.5
 *   当前竞争力 = 当前在售同类挂牌的最低价
 *
 * @module services/market/MarketAnalyticsService
 * @version 1.0.0
 * @date 2026-02-23
 */

'use strict'

const { sequelize } = require('../../config/database')
const PriceDiscoveryService = require('./PriceDiscoveryService')

/**
 * 市场数据分析服务类
 * 职责：卖家视角的市场分析，提供定价建议和市场总览
 * 设计模式：查询服务模式 + 复用 PriceDiscoveryService
 */
class MarketAnalyticsService {
  /**
   * 获取定价建议（卖家视角）
   *
   * @param {Object} params - 查询参数
   * @param {string} params.asset_code - 资产代码
   * @param {number} params.template_id - 物品模板ID
   * @returns {Promise<Object>} 定价建议
   */
  static async getPricingAdvice(params = {}) {
    const { asset_code, template_id } = params

    // 获取价格摘要（复用 PriceDiscoveryService）
    const summary = await PriceDiscoveryService.getPriceSummary({ asset_code, template_id })

    // 查询当前在售同类挂牌的最低价
    const lowestOnSale = await this._getLowestOnSalePrice(asset_code, template_id)

    const avg7d = summary.avg_price_7d || 0
    const hasTradeData = summary.trades_7d > 0

    return {
      asset_code: asset_code || null,
      template_id: template_id || null,
      has_trade_data: hasTradeData,
      suggested_min_price: hasTradeData ? Math.round(avg7d * 0.8) : null,
      suggested_price: hasTradeData ? avg7d : null,
      suggested_max_price: hasTradeData ? Math.round(avg7d * 1.5) : null,
      lowest_on_sale: lowestOnSale,
      avg_price_7d: avg7d,
      trades_7d: summary.trades_7d,
      median_price: summary.median_price,
      advice_text: hasTradeData
        ? `近7天均价 ${avg7d}，建议定价 ${Math.round(avg7d * 0.8)}-${Math.round(avg7d * 1.5)} 范围`
        : '暂无近期成交数据，建议参考同类在售价格'
    }
  }

  /**
   * 市场总览（各资产成交量排行）
   *
   * @param {number} [days=7] - 统计天数
   * @returns {Promise<Object>} 市场总览数据
   */
  static async getMarketOverview(days = 7) {
    const safeDays = parseInt(days) || 7

    const assetStats = await sequelize.query(
      `SELECT ml.offer_asset_code AS asset_code, ml.listing_kind,
        COUNT(*) AS trade_count, SUM(t.gross_amount) AS total_diamond_volume,
        ROUND(AVG(t.gross_amount)) AS avg_price, MIN(t.gross_amount) AS min_price, MAX(t.gross_amount) AS max_price
      FROM trade_orders t JOIN market_listings ml ON t.market_listing_id = ml.market_listing_id
      WHERE t.status = 'completed' AND t.completed_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)
      GROUP BY ml.offer_asset_code, ml.listing_kind ORDER BY trade_count DESC`,
      { type: sequelize.QueryTypes.SELECT }
    )

    const onSaleStats = await sequelize.query(
      `SELECT offer_asset_code AS asset_code, listing_kind,
        COUNT(*) AS on_sale_count, MIN(price_amount) AS min_price,
        MAX(price_amount) AS max_price, ROUND(AVG(price_amount)) AS avg_price
      FROM market_listings WHERE status = 'on_sale'
      GROUP BY offer_asset_code, listing_kind ORDER BY on_sale_count DESC`,
      { type: sequelize.QueryTypes.SELECT }
    )

    const [totals] = await sequelize.query(
      `SELECT COUNT(*) AS total_trades, SUM(gross_amount) AS total_volume,
        COUNT(DISTINCT buyer_user_id) AS unique_buyers, COUNT(DISTINCT seller_user_id) AS unique_sellers
      FROM trade_orders WHERE status = 'completed' AND completed_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)`,
      { type: sequelize.QueryTypes.SELECT }
    )

    return {
      period: `${safeDays}d`,
      totals: {
        total_trades: Number(totals?.total_trades) || 0,
        total_volume: Number(totals?.total_volume) || 0,
        unique_buyers: Number(totals?.unique_buyers) || 0,
        unique_sellers: Number(totals?.unique_sellers) || 0
      },
      asset_ranking: assetStats || [],
      on_sale_summary: onSaleStats || []
    }
  }

  /**
   * C2C 交易市场顶线数据（dashboard 跨域概览专用）
   * @param {number} [days=7] - 统计周期天数
   * @returns {Promise<Object>} C2C 顶线指标
   */
  static async getTradingTopline(days = 7) {
    const safeDays = parseInt(days) || 7
    const [[onSaleRow], [tradeRow]] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*) AS on_sale_count FROM market_listings WHERE status = 'on_sale'`,
        { type: sequelize.QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COUNT(*) AS period_trades, COALESCE(SUM(gross_amount), 0) AS period_volume,
          COUNT(DISTINCT buyer_user_id) AS unique_buyers, COUNT(DISTINCT seller_user_id) AS unique_sellers
        FROM trade_orders WHERE status = 'completed' AND completed_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)`,
        { type: sequelize.QueryTypes.SELECT }
      )
    ])
    return {
      on_sale_count: Number(onSaleRow?.on_sale_count) || 0,
      period_trades: Number(tradeRow?.period_trades) || 0,
      period_volume: Number(tradeRow?.period_volume) || 0,
      unique_buyers: Number(tradeRow?.unique_buyers) || 0,
      unique_sellers: Number(tradeRow?.unique_sellers) || 0
    }
  }

  /**
   * 价格历史（按资产查询）
   *
   * @param {Object} params - 查询参数
   * @param {string} params.asset_code - 资产代码
   * @param {number} params.days - 天数（默认30）
   * @returns {Promise<Object>} 价格历史
   */
  static async getAssetPriceHistory(params = {}) {
    const { asset_code, days = 30 } = params

    return await PriceDiscoveryService.getPriceTrend({
      asset_code,
      period: `${days}d`,
      granularity: days <= 7 ? '1h' : '1d'
    })
  }

  // ==================== 内部方法 ====================

  /**
   * 获取当前在售同类最低价
   * @param {string} asset_code - 资产代码
   * @param {number} template_id - 物品模板ID
   * @returns {Promise<number|null>} 最低价或null
   * @private
   */
  static async _getLowestOnSalePrice(asset_code, template_id) {
    let whereClause = "status = 'on_sale'"
    const replacements = {}

    if (asset_code) {
      whereClause += ' AND offer_asset_code = :asset_code'
      replacements.asset_code = asset_code
    }
    if (template_id) {
      whereClause += ' AND offer_item_template_id = :template_id'
      replacements.template_id = parseInt(template_id)
    }

    const [row] = await sequelize.query(
      `SELECT MIN(price_amount) AS lowest_price
       FROM market_listings
       WHERE ${whereClause}`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    )

    return row?.lowest_price ? Number(row.lowest_price) : null
  }
}

module.exports = MarketAnalyticsService
