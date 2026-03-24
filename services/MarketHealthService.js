/**
 * 市场健康看板服务
 *
 * @description 交易市场运营健康指标：完成率/取消率趋势、平均成交时间、活跃用户 Top N
 * @module services/MarketHealthService
 */

/**
 * 市场健康看板服务 - 交易市场运营健康指标
 */
class MarketHealthService {
  /** Creates a new MarketHealthService instance */
  constructor() {
    this.models = null
    this.sequelize = null
  }

  /**
   * @private
   * @returns {void}
   */
  _ensureModels() {
    if (!this.models) {
      this.models = require('../models')
      this.sequelize = this.models.sequelize
    }
  }

  /**
   * 获取订单状态趋势（完成率/取消率按日统计）
   *
   * @param {Object} [filters] - 筛选条件
   * @param {number} [filters.days=30] - 统计天数
   * @returns {Promise<Array>} [{date, total, completed, cancelled, failed, completion_rate, cancel_rate}]
   */
  async getOrderStatusTrend(filters = {}) {
    this._ensureModels()
    const { days = 30 } = filters
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const [rows] = await this.sequelize.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'disputed' THEN 1 ELSE 0 END) as disputed
       FROM trade_orders
       WHERE created_at >= ?
       GROUP BY date ORDER BY date ASC`,
      { replacements: [startDate] }
    )

    return rows.map(r => ({
      date: r.date,
      total: Number(r.total),
      completed: Number(r.completed),
      cancelled: Number(r.cancelled),
      failed: Number(r.failed),
      disputed: Number(r.disputed),
      completion_rate: r.total > 0 ? parseFloat(((r.completed / r.total) * 100).toFixed(1)) : 0,
      cancel_rate: r.total > 0 ? parseFloat(((r.cancelled / r.total) * 100).toFixed(1)) : 0
    }))
  }

  /**
   * 获取平均成交时间（从 created 到 completed 的平均耗时）
   *
   * @param {Object} [filters] - 筛选条件
   * @param {number} [filters.days=30] - 统计天数
   * @returns {Promise<Object>} { avg_minutes, median_minutes, total_completed }
   */
  async getAvgSettlementTime(filters = {}) {
    this._ensureModels()
    const { days = 30 } = filters
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const [rows] = await this.sequelize.query(
      `SELECT
        AVG(TIMESTAMPDIFF(MINUTE, created_at, updated_at)) as avg_minutes,
        COUNT(*) as total_completed
       FROM trade_orders
       WHERE status = 'completed' AND created_at >= ?`,
      { replacements: [startDate] }
    )

    const result = rows[0] || {}
    return {
      avg_minutes: result.avg_minutes ? parseFloat(parseFloat(result.avg_minutes).toFixed(1)) : 0,
      total_completed: Number(result.total_completed) || 0
    }
  }

  /**
   * 获取活跃买家 Top N
   *
   * @param {Object} [filters] - 筛选条件
   * @param {number} [filters.days=30] - 统计天数
   * @param {number} [filters.page_size=10] - Top N
   * @param {number} [filters.limit] - 兼容旧参数名
   * @returns {Promise<Array>} [{user_id, nickname, buy_count, total_amount}]
   */
  async getTopBuyers(filters = {}) {
    this._ensureModels()
    const { days = 30, page_size = 10, limit: legacyLimit } = filters
    const limit = legacyLimit !== undefined ? legacyLimit : page_size
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const [rows] = await this.sequelize.query(
      `SELECT t.buyer_user_id as user_id, u.nickname,
        COUNT(*) as buy_count,
        SUM(t.gross_amount) as total_amount
       FROM trade_orders t
       LEFT JOIN users u ON t.buyer_user_id = u.user_id
       WHERE t.status = 'completed' AND t.created_at >= ?
       GROUP BY t.buyer_user_id, u.nickname
       ORDER BY buy_count DESC
       LIMIT ?`,
      { replacements: [startDate, limit] }
    )

    return rows.map(r => ({
      user_id: r.user_id,
      nickname: r.nickname || '未知用户',
      buy_count: Number(r.buy_count),
      total_amount: Number(r.total_amount)
    }))
  }

  /**
   * 获取活跃卖家 Top N
   *
   * @param {Object} [filters] - 筛选条件
   * @param {number} [filters.days=30] - 统计天数
   * @param {number} [filters.page_size=10] - Top N
   * @param {number} [filters.limit] - 兼容旧参数名
   * @returns {Promise<Array>} [{user_id, nickname, sell_count, total_amount}]
   */
  async getTopSellers(filters = {}) {
    this._ensureModels()
    const { days = 30, page_size = 10, limit: legacyLimit } = filters
    const limit = legacyLimit !== undefined ? legacyLimit : page_size
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const [rows] = await this.sequelize.query(
      `SELECT t.seller_user_id as user_id, u.nickname,
        COUNT(*) as sell_count,
        SUM(t.net_amount) as total_amount
       FROM trade_orders t
       LEFT JOIN users u ON t.seller_user_id = u.user_id
       WHERE t.status = 'completed' AND t.created_at >= ?
       GROUP BY t.seller_user_id, u.nickname
       ORDER BY sell_count DESC
       LIMIT ?`,
      { replacements: [startDate, limit] }
    )

    return rows.map(r => ({
      user_id: r.user_id,
      nickname: r.nickname || '未知用户',
      sell_count: Number(r.sell_count),
      total_amount: Number(r.total_amount)
    }))
  }

  /**
   * 获取市场健康综合数据（一次性返回所有指标）
   *
   * @param {Object} [filters] - 筛选条件
   * @param {number} [filters.days=30] - 统计天数
   * @returns {Promise<Object>} 综合健康数据
   */
  async getMarketHealthSummary(filters = {}) {
    const [statusTrend, avgTime, topBuyers, topSellers] = await Promise.all([
      this.getOrderStatusTrend(filters),
      this.getAvgSettlementTime(filters),
      this.getTopBuyers({ ...filters, limit: 10 }),
      this.getTopSellers({ ...filters, limit: 10 })
    ])

    return {
      order_status_trend: statusTrend,
      avg_settlement_time: avgTime,
      top_buyers: topBuyers,
      top_sellers: topSellers
    }
  }
}

module.exports = MarketHealthService
