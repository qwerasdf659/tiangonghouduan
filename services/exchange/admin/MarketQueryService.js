'use strict'
const BusinessError = require('../../../utils/BusinessError')

/**
 * 兑换市场管理 - 市场查询/统计服务
 *
 * 职责范围：
 * - checkTimeoutAndAlert(): 检查超时订单并告警
 * - getAdminMarketItems(): 管理后台获取商品列表
 * - getMarketItemStatistics(): 获取商品统计数据
 * - getExchangeTopline(): B2C 兑换商城顶线数据
 * - getItemDashboard(): 获取单品维度统计数据
 * - getSpaceDistribution(): 获取空间分布统计
 *
 * @module services/exchange/admin/MarketQueryService
 */

const logger = require('../../../utils/logger').logger
const displayNameHelper = require('../../../utils/displayNameHelper')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { Op, QueryTypes } = require('sequelize')

/**
 * 兑换市场管理 - 市场查询/统计服务（实例服务，依赖 models）
 */
class MarketQueryService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.ExchangeRecord = models.ExchangeRecord
    this.User = models.User
    this.Item = models.Item
    this.ExchangeItem = models.ExchangeItem
    this.sequelize = models.sequelize
  }

  /**
   * 检查超时订单并告警（定时任务专用）
   *
   * @param {number} hours - 超时小时数（24或72）
   * @returns {Promise<Object>} 检查结果
   */
  async checkTimeoutAndAlert(hours = 24) {
    try {
      const timeoutThreshold = new Date(Date.now() - hours * 60 * 60 * 1000)

      const timeoutOrders = await this.ExchangeRecord.findAll({
        where: {
          status: 'pending',
          created_at: { [Op.lt]: timeoutThreshold }
        },
        attributes: [
          'exchange_record_id', 'order_no', 'user_id',
          'exchange_item_id', 'pay_amount', 'created_at'
        ],
        order: [['created_at', 'ASC']],
        limit: 100
      })

      const count = timeoutOrders.length

      if (count > 0) {
        logger.warn(`[兑换市场] 发现${count}个超过${hours}小时的待处理订单`, {
          hours,
count,
          oldest_order: timeoutOrders[0]?.order_no,
          oldest_created_at: timeoutOrders[0]?.created_at
        })
      } else {
        logger.info(`[兑换市场] 无超过${hours}小时的待处理订单`)
      }

      return {
        hasTimeout: count > 0,
        count,
        hours,
        orders: timeoutOrders.map(order => ({
          record_id: order.exchange_record_id,
          order_no: order.order_no,
          user_id: order.user_id,
          pay_amount: order.pay_amount,
          created_at: order.created_at,
          timeout_hours: Math.floor(
            (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60)
          )
        })),
        checked_at: BeijingTimeHelper.now()
      }
    } catch (error) {
      logger.error(`[兑换市场] 检查${hours}小时超时订单失败:`, {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 管理后台获取兑换商品列表（Admin Only）
   *
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 商品列表和分页信息
   */
  async getAdminMarketItems(options = {}) {
    const {
      status = null, keyword = null,
      page = 1, page_size = 20,
      sort_by = 'sort_order', sort_order = 'ASC'
    } = options

    try {
      logger.info('[兑换市场-管理] 查询商品列表', { status, keyword, page, page_size })

      const where = {}
      if (status) where.status = status
      if (keyword) where.item_name = { [Op.like]: `%${keyword}%` }

      const offset = (page - 1) * page_size
      const limit = page_size

      const { count, rows } = await this.ExchangeItem.findAndCountAll({
        where,
limit,
offset,
        order: [[sort_by, sort_order]]
      })

      logger.info(`[兑换市场-管理] 找到${count}个商品，返回第${page}页（${rows.length}个）`)

      const itemsWithDisplayNames = await displayNameHelper.attachDisplayNames(
        rows.map(item => item.toJSON()),
        [{ field: 'status', dictType: 'product_status' }]
      )

      return {
        items: itemsWithDisplayNames,
        pagination: {
          total: count,
page,
page_size,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error('[兑换市场-管理] 查询商品列表失败:', error.message)
      throw new BusinessError(`查询商品列表失败: ${error.message}`, 'EXCHANGE_FAILED', 400)
    }
  }

  /**
   * 获取兑换市场统计数据（Admin Only）
   *
   * @param {Object} [options={}] - 可选参数
   * @param {number} [options.trend_days=90] - 订单趋势图查询天数（1–366）
   * @returns {Promise<Object>} 统计数据
   */
  async getMarketItemStatistics(options = {}) {
    try {
      const rawTrend = parseInt(options.trend_days, 10)
      const trend_days = Number.isFinite(rawTrend) ? Math.min(Math.max(rawTrend, 1), 366) : 90
      const item_type = options.item_type ? String(options.item_type).trim() : null
      logger.info('[兑换市场-管理] 查询统计数据', { trend_days, item_type })

      /*
       * 频道筛选（道具商城/星石轨）：exchange_items/exchange_records 自身无 item_type 列，
       * 频道语义在 item_templates.item_type。传 item_type 时用 JOIN item_templates 精确筛选；
       * 不传则统计全兑换市场（行为与原先完全一致）。复用现有表关联，零新表/冗余列。
       * - itemJoin：用于以 exchange_items(别名 ei) 为主表的聚合
       * - recordJoin：用于以 exchange_records(别名 er) 为主表的聚合（经 exchange_items 中转关联模板）
       */
      const itemJoin = item_type
        ? 'JOIN item_templates t ON ei.item_template_id = t.item_template_id'
        : ''
      const itemWhere = item_type ? 'AND t.item_type = :item_type' : ''
      const recordJoin = item_type
        ? `JOIN exchange_items ei ON er.exchange_item_id = ei.exchange_item_id
           JOIN item_templates t ON ei.item_template_id = t.item_template_id`
        : ''
      const recordWhere = item_type ? 'AND t.item_type = :item_type' : ''
      const repl = item_type ? { item_type } : {}

      /*
       * 频道筛选时，商品类计数改走带 JOIN 的原生 SQL（与 itemAgg 同口径）；
       * 不传 item_type 时沿用原 Sequelize count（行为不变）。
       */
      const itemTemplateInclude = item_type
        ? [
            {
              model: this.models.ItemTemplate,
              as: 'itemTemplate',
              required: true,
              attributes: [],
              where: { item_type }
            }
          ]
        : []

      const recordPropInclude = item_type
        ? [
            {
              model: this.ExchangeItem,
              as: 'exchangeItem',
              required: true,
              attributes: [],
              include: [
                {
                  model: this.models.ItemTemplate,
                  as: 'itemTemplate',
                  required: true,
                  attributes: [],
                  where: { item_type }
                }
              ]
            }
          ]
        : []

      const [totalItems, activeItems, lowStockItems, totalExchanges] = await Promise.all([
        this.ExchangeItem.count({ include: itemTemplateInclude, distinct: !!item_type }),
        this.ExchangeItem.count({
          where: { status: 'active' },
          include: itemTemplateInclude,
          distinct: !!item_type
        }),
        this.ExchangeItem.count({
          include: [
            {
              model: this.models.ExchangeItemSku,
              as: 'skus',
              where: { stock: { [Op.lt]: 10 }, status: 'active' },
              required: true
            },
            ...itemTemplateInclude
          ],
          distinct: true
        }),
        this.ExchangeRecord.count({
          where: { status: { [Op.ne]: 'cancelled' } },
          include: recordPropInclude,
          distinct: !!item_type
        })
      ])

      const [orderAgg] = await this.sequelize.query(
        `SELECT
          SUM(CASE WHEN er.status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN er.status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN er.status = 'shipped' THEN 1 ELSE 0 END) AS shipped,
          SUM(CASE WHEN er.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
          COUNT(*) AS total_orders,
          COALESCE(SUM(CASE WHEN er.status <> 'cancelled' THEN er.pay_amount ELSE 0 END), 0) AS total_pay_amount
        FROM exchange_records er
        ${recordJoin}
        WHERE 1 = 1 ${recordWhere}`,
        { type: QueryTypes.SELECT, replacements: repl }
      )

      const [itemAgg] = await this.sequelize.query(
        `SELECT
          SUM(CASE WHEN ei.status = 'active' THEN 1 ELSE 0 END) AS active_count,
          SUM(CASE WHEN ei.status <> 'active' THEN 1 ELSE 0 END) AS inactive_count,
          COALESCE(SUM(CASE WHEN ei.status = 'active' THEN ei.stock ELSE 0 END), 0) AS active_stock,
          COALESCE(SUM(CASE WHEN ei.status <> 'active' THEN ei.stock ELSE 0 END), 0) AS inactive_stock,
          SUM(
            CASE
              WHEN ei.status = 'active' AND ei.stock <= COALESCE(ei.stock_alert_threshold, 5) THEN 1
              ELSE 0
            END
          ) AS low_stock_count
        FROM exchange_items ei
        ${itemJoin}
        WHERE 1 = 1 ${itemWhere}`,
        { type: QueryTypes.SELECT, replacements: repl }
      )

      const [fulfillRow] = await this.sequelize.query(
        `SELECT
          AVG(
            CASE
              WHEN er.status IN ('shipped', 'completed') AND er.updated_at IS NOT NULL
              THEN TIMESTAMPDIFF(HOUR, er.created_at, er.updated_at)
            END
          ) AS avg_fulfillment_hours
        FROM exchange_records er
        ${recordJoin}
        WHERE er.status IN ('shipped', 'completed') ${recordWhere}`,
        { type: QueryTypes.SELECT, replacements: repl }
      )

      const totalOrders = Number(orderAgg?.total_orders) || 0
      const cancelled = Number(orderAgg?.cancelled) || 0
      const shipped = Number(orderAgg?.shipped) || 0
      const completed = Number(orderAgg?.completed) || 0
      const validOrders = totalOrders - cancelled
      const fulfilledOrders = shipped + completed
      const fulfillment_rate =
        validOrders > 0 ? Math.round((fulfilledOrders / validOrders) * 10000) / 100 : 0

      const trendRows = await this.sequelize.query(
        `SELECT DATE(er.created_at) AS day,
          COUNT(*) AS order_count,
          COALESCE(SUM(CASE WHEN er.status <> 'cancelled' THEN er.pay_amount ELSE 0 END), 0) AS revenue
        FROM exchange_records er
        ${recordJoin}
        WHERE er.created_at >= DATE_SUB(CURDATE(), INTERVAL :trend_days DAY) ${recordWhere}
        GROUP BY DATE(er.created_at)
        ORDER BY day ASC`,
        { type: QueryTypes.SELECT, replacements: { trend_days, ...repl } }
      )

      const order_trend_by_day = trendRows.map(r => {
        const raw = r.day
        const dateStr =
          raw instanceof Date ? raw.toISOString().split('T')[0] : String(raw).slice(0, 10)
        return {
          date: dateStr,
          order_count: Number(r.order_count) || 0,
          revenue: Number(r.revenue) || 0
        }
      })

      const statistics = {
        total_items: totalItems,
        active_items: activeItems,
        low_stock_items: lowStockItems,
        total_exchanges: totalExchanges,
        timestamp: BeijingTimeHelper.now(),
        order_trend_by_day,
        orders_summary: {
          total: totalOrders,
          pending: Number(orderAgg?.pending) || 0,
          completed,
shipped,
cancelled,
          total_pay_amount: Number(orderAgg?.total_pay_amount) || 0
        },
        items_summary: {
          active_count: Number(itemAgg?.active_count) || 0,
          inactive_count: Number(itemAgg?.inactive_count) || 0,
          active_stock: Number(itemAgg?.active_stock) || 0,
          inactive_stock: Number(itemAgg?.inactive_stock) || 0,
          low_stock_count: Number(itemAgg?.low_stock_count) || 0
        },
        fulfillment_tracking: {
          total_orders: totalOrders,
          pending_count: Number(orderAgg?.pending) || 0,
          shipped_count: shipped,
          completed_count: completed,
          cancelled_count: cancelled,
          fulfillment_rate,
          avg_fulfillment_time:
            fulfillRow?.avg_fulfillment_hours != null
              ? Math.round(Number(fulfillRow.avg_fulfillment_hours) * 10) / 10
              : 0
        }
      }

      logger.info('[兑换市场-管理] 统计数据查询成功', statistics)

      return statistics
    } catch (error) {
      logger.error('[兑换市场-管理] 查询统计数据失败:', error.message)
      throw new BusinessError(`查询统计数据失败: ${error.message}`, 'EXCHANGE_FAILED', 400)
    }
  }

  /**
   * B2C 兑换商城顶线数据（dashboard 跨域概览专用）
   * @param {number} [days=7] - 统计周期天数
   * @returns {Promise<Object>} B2C 顶线指标
   */
  async getExchangeTopline(days = 7) {
    const safeDays = parseInt(days) || 7
    const [[activeRow], [exchangeRow], [lowStockRow]] = await Promise.all([
      this.sequelize.query(
        `SELECT COUNT(*) AS active_items FROM exchange_items WHERE status = 'active'`,
        { type: QueryTypes.SELECT }
      ),
      this.sequelize.query(
        `SELECT COUNT(*) AS period_exchanges, COALESCE(SUM(pay_amount), 0) AS period_pay_amount FROM exchange_records WHERE status != 'cancelled' AND created_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)`,
        { type: QueryTypes.SELECT }
      ),
      this.sequelize.query(
        `SELECT COUNT(DISTINCT ei.exchange_item_id) AS low_stock_items FROM exchange_items ei JOIN exchange_item_skus eis ON ei.exchange_item_id = eis.exchange_item_id WHERE ei.status = 'active' AND eis.stock <= COALESCE(ei.stock_alert_threshold, 5) AND eis.stock > 0`,
        { type: QueryTypes.SELECT }
      )
    ])
    const [fulfillRow] = await this.sequelize.query(
      `SELECT SUM(CASE WHEN status IN ('shipped','completed') THEN 1 ELSE 0 END) AS fulfilled, SUM(CASE WHEN status != 'cancelled' THEN 1 ELSE 0 END) AS valid_total FROM exchange_records`,
      { type: QueryTypes.SELECT }
    )
    const fulfilled = Number(fulfillRow?.fulfilled) || 0
    const validTotal = Number(fulfillRow?.valid_total) || 0
    return {
      active_items: Number(activeRow?.active_items) || 0,
      period_exchanges: Number(exchangeRow?.period_exchanges) || 0,
      period_pay_amount: Number(exchangeRow?.period_pay_amount) || 0,
      low_stock_items: Number(lowStockRow?.low_stock_items) || 0,
      fulfillment_rate: validTotal > 0 ? Math.round((fulfilled / validTotal) * 10000) / 100 : 0
    }
  }

  /**
   * 获取单品维度统计数据（Admin Only）
   *
   * @param {number} exchangeItemId - 商品ID
   * @returns {Promise<Object>} 单品统计数据
   */
  async getItemDashboard(exchangeItemId) {
    try {
      const item = await this.ExchangeItem.findByPk(exchangeItemId, {
        attributes: [
          'exchange_item_id', 'item_name', 'stock',
          'sold_count', 'min_cost_amount', 'created_at'
        ]
      })
      if (!item) {
        throw new BusinessError('商品不存在', 'EXCHANGE_ITEM_NOT_FOUND', 404)
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      const [recentOrders7d, recentOrders30d, avgRating, statusDistribution] = await Promise.all([
        this.ExchangeRecord.count({
          where: { exchange_item_id: exchangeItemId, created_at: { [Op.gte]: sevenDaysAgo } }
        }),
        this.ExchangeRecord.count({
          where: { exchange_item_id: exchangeItemId, created_at: { [Op.gte]: thirtyDaysAgo } }
        }),
        this.ExchangeRecord.findOne({
          attributes: [[this.sequelize.fn('AVG', this.sequelize.col('rating')), 'avg_rating']],
          where: { exchange_item_id: exchangeItemId, rating: { [Op.ne]: null } },
          raw: true
        }),
        this.ExchangeRecord.findAll({
          attributes: ['status', [this.sequelize.fn('COUNT', '*'), 'count']],
          where: { exchange_item_id: exchangeItemId },
          group: ['status'],
          raw: true
        })
      ])

      const totalOrders = item.sold_count || 0
      const conversionRate =
        totalOrders > 0
          ? ((totalOrders / Math.max(totalOrders + item.stock, 1)) * 100).toFixed(1)
          : 0
      const inventoryTurnover =
        totalOrders > 0 ? (totalOrders / Math.max(item.stock, 1)).toFixed(2) : 0

      return {
        item_name: item.item_name,
        exchange_item_id: item.exchange_item_id,
        current_stock: item.stock,
        total_sold: totalOrders,
        cost_amount: item.min_cost_amount,
        orders_7d: recentOrders7d,
        orders_30d: recentOrders30d,
        avg_rating: avgRating?.avg_rating
          ? parseFloat(parseFloat(avgRating.avg_rating).toFixed(2))
          : null,
        conversion_rate: parseFloat(conversionRate),
        inventory_turnover: parseFloat(inventoryTurnover),
        order_status_distribution: statusDistribution.reduce((acc, row) => {
          acc[row.status] = parseInt(row.count, 10)
          return acc
        }, {})
      }
    } catch (error) {
      logger.error(`[兑换市场-管理] 单品统计查询失败(id:${exchangeItemId}):`, error.message)
      throw error
    }
  }

  /**
   * 获取空间分布统计（管理后台用，Phase 3.8）
   *
   * @returns {Promise<Object>} 空间分布统计
   */
  async getSpaceDistribution() {
    try {
      const distribution = await this.ExchangeItem.findAll({
        attributes: [
          'space',
          [this.sequelize.fn('COUNT', this.sequelize.col('exchange_item_id')), 'count']
        ],
        group: ['space'],
        raw: true
      })

      const result = { lucky: 0, premium: 0, both: 0 }
      distribution.forEach(row => {
        result[row.space] = parseInt(row.count, 10)
      })

      return {
        distribution: result,
        total: Object.values(result).reduce((sum, v) => sum + v, 0)
      }
    } catch (error) {
      logger.error('[兑换市场-管理] 查询空间分布失败:', error.message)
      throw error
    }
  }
}

module.exports = MarketQueryService
