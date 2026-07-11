/**
 * 天工商户营销平台 V4.7.0 - 兑换市场统计查询子服务
 * Exchange Stats Query Service（技术债务方案 7.4-2：QueryService 拆分）
 *
 * 职责范围：统计类查询（管理后台 + 空间统计）
 * - getMarketStatistics(): 获取兑换市场统计数据（管理员）
 * - getSpaceStats(): 获取空间统计数据（臻选空间/幸运空间）
 * - getExchangeItemStats(): 获取统一商品统计数据
 * - getExchangeTrend(): 获取兑换趋势数据（按日统计）
 * - getItemRanking(): 获取商品排行榜
 *
 * 设计原则：
 * - 查询操作不需要事务
 * - 不独立注册服务键，经 QueryService Facade 持有（防单例状态分裂）
 *
 * 全部方法纯搬移自原 services/exchange/QueryService.js（2026-01-31 版），逻辑不变。
 *
 * @module services/exchange/query/StatsQueryService
 * @created 2026-07-11（技术债务方案 7.4-2 拆分）
 */

const BusinessError = require('../../../utils/BusinessError')
const logger = require('../../../utils/logger').logger
const { Op } = require('sequelize')

/**
 * 兑换市场统计查询子服务类
 *
 * @class StatsQueryService
 */
class StatsQueryService {
  /**
   * 构造函数
   *
   * @param {Object} models - Sequelize 模型对象
   */
  constructor(models) {
    this.models = models
    this.ExchangeItem = models.ExchangeItem
    this.ExchangeRecord = models.ExchangeRecord
    this.ExchangeOrderEvent = models.ExchangeOrderEvent
    this.ExchangeItemSku = models.ExchangeItemSku
    this.ExchangeChannelPrice = models.ExchangeChannelPrice
    this.Category = models.Category
    this.sequelize = models.sequelize
  }

  /**
   * 获取兑换市场统计数据（管理员使用）
   *
   * @returns {Promise<Object>} 统计数据
   */
  async getMarketStatistics() {
    try {
      logger.info('[兑换市场] 查询统计数据')

      // 查询各状态订单数量
      const [totalOrders, pendingOrders, completedOrders, shippedOrders, cancelledOrders] =
        await Promise.all([
          this.ExchangeRecord.count(),
          this.ExchangeRecord.count({ where: { status: 'pending' } }),
          this.ExchangeRecord.count({ where: { status: 'completed' } }),
          this.ExchangeRecord.count({ where: { status: 'shipped' } }),
          this.ExchangeRecord.count({ where: { status: 'cancelled' } })
        ])

      // 查询材料资产消耗统计
      const totalMaterialCost = await this.ExchangeRecord.sum('pay_amount', {
        where: { pay_asset_code: { [Op.ne]: null } }
      })

      // 查询商品统计（ExchangeItem SPU 维度）
      const itemStats = await this.ExchangeItem.findAll({
        attributes: [
          'status',
          [this.sequelize.fn('COUNT', this.sequelize.col('exchange_item_id')), 'count']
        ],
        group: ['status']
      })

      return {
        statistics: {
          orders: {
            total: totalOrders,
            pending: pendingOrders,
            completed: completedOrders,
            shipped: shippedOrders,
            cancelled: cancelledOrders
          },
          material_consumption: {
            total_amount: totalMaterialCost || 0
          },
          items: itemStats
        }
      }
    } catch (error) {
      logger.error('[兑换市场] 查询统计数据失败:', error.message)
      throw new BusinessError(`查询统计数据失败: ${error.message}`, 'EXCHANGE_QUERY_FAILED', 500)
    }
  }

  /**
   * 获取空间统计数据（臻选空间/幸运空间）
   *
   * @param {string} space - 空间类型（lucky / premium）
   * @returns {Promise<Object>} 空间统计数据
   * @returns {string} returns.space - 空间类型
   * @returns {number} returns.total_items - 商品总数
   * @returns {number} returns.new_count - 新品数量
   * @returns {number} returns.hot_count - 热门数量
   * @returns {Object} returns.asset_code_distribution - 资产类型分布
   */
  async getSpaceStats(space) {
    try {
      logger.info('[兑换市场] 查询空间统计', { space })

      // 空间筛选条件：space='lucky' 查 lucky+both；space='premium' 查 premium+both
      const spaceCondition = { [Op.in]: [space, 'both'] }

      const [totalItems, newCount, hotCount] = await Promise.all([
        this.ExchangeItem.count({
          where: { space: spaceCondition, status: 'active' }
        }),
        this.ExchangeItem.count({
          where: { space: spaceCondition, status: 'active', is_new: true }
        }),
        this.ExchangeItem.count({
          where: { space: spaceCondition, status: 'active', is_hot: true }
        })
      ])

      const assetCodeDistribution = {}

      logger.info('[兑换市场] 空间统计完成', {
        space,
        total_items: totalItems,
        new_count: newCount,
        hot_count: hotCount
      })

      return {
        space,
        total_items: totalItems,
        new_count: newCount,
        hot_count: hotCount,
        asset_code_distribution: assetCodeDistribution
      }
    } catch (error) {
      logger.error(`[兑换市场] 查询空间统计失败(space:${space}):`, error.message)
      throw error
    }
  }

  /**
   * 获取统一商品统计数据（替代 getMarketStatistics 中的商品统计部分）
   *
   * 统计维度：商品状态分布、SKU 库存/销量汇总、空间分布
   *
   * @returns {Promise<Object>} { statistics: { items, skus, spaces } }
   */
  async getExchangeItemStats() {
    try {
      if (!this.ExchangeItem) {
        throw new BusinessError(
          'ExchangeItem 模型未注册，请检查 models 配置',
          'EXCHANGE_CONFIG_ERROR',
          500
        )
      }

      logger.info('[商品中心] 查询商品统计数据')

      const [productStatusRows, skuStatusRows, spaceRows] = await Promise.all([
        // 商品按状态分组计数
        this.ExchangeItem.findAll({
          attributes: [
            'status',
            [this.sequelize.fn('COUNT', this.sequelize.col('exchange_item_id')), 'count']
          ],
          group: ['status'],
          raw: true
        }),
        // SKU 按状态分组计数、库存/销量合计
        this.ExchangeItemSku.findAll({
          attributes: [
            'status',
            [this.sequelize.fn('COUNT', this.sequelize.col('sku_id')), 'sku_count'],
            [this.sequelize.fn('SUM', this.sequelize.col('stock')), 'total_stock'],
            [this.sequelize.fn('SUM', this.sequelize.col('sold_count')), 'total_sold']
          ],
          group: ['status'],
          raw: true
        }),
        // 在售商品按空间分组计数
        this.ExchangeItem.findAll({
          attributes: [
            'space',
            [this.sequelize.fn('COUNT', this.sequelize.col('exchange_item_id')), 'count']
          ],
          where: { status: 'active' },
          group: ['space'],
          raw: true
        })
      ])

      const byStatus = {}
      productStatusRows.forEach(row => {
        byStatus[row.status] = parseInt(row.count, 10)
      })

      const skuByStatus = {}
      let totalStock = 0
      let totalSold = 0
      skuStatusRows.forEach(row => {
        const stock = parseInt(row.total_stock || 0, 10)
        const sold = parseInt(row.total_sold || 0, 10)
        skuByStatus[row.status] = {
          count: parseInt(row.sku_count, 10),
          stock,
          sold
        }
        totalStock += stock
        totalSold += sold
      })

      const spaces = {}
      spaceRows.forEach(row => {
        spaces[row.space] = parseInt(row.count, 10)
      })

      return {
        statistics: {
          items: {
            by_status: byStatus,
            total: Object.values(byStatus).reduce((s, v) => s + v, 0)
          },
          skus: {
            by_status: skuByStatus,
            total_stock: totalStock,
            total_sold: totalSold
          },
          spaces
        }
      }
    } catch (error) {
      logger.error('[商品中心] 查询商品统计失败:', error.message)
      throw new BusinessError(`查询商品统计失败: ${error.message}`, 'EXCHANGE_QUERY_FAILED', 500)
    }
  }

  /**
   * 获取兑换趋势数据（按日统计）
   *
   * 业务场景：管理后台「统计分析」Tab 的兑换趋势图，展示每日兑换量变化
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.days=7] - 统计天数（7/14/30）
   * @returns {Promise<Object>} 趋势数据
   * @returns {Array<Object>} returns.trend - 每日兑换量数组
   * @returns {string} returns.trend[].date - 日期（YYYY-MM-DD）
   * @returns {number} returns.trend[].order_count - 当日兑换订单数
   * @returns {number} returns.trend[].completed_count - 当日完成订单数
   * @returns {number} returns.trend[].total_amount - 当日材料消耗总量
   */
  async getExchangeTrend({ days = 7 } = {}) {
    try {
      const validDays = [7, 14, 30].includes(days) ? days : 7
      logger.info('[兑换市场] 查询兑换趋势', { days: validDays })

      const startDate = new Date()
      startDate.setDate(startDate.getDate() - validDays)
      startDate.setHours(0, 0, 0, 0)

      const results = await this.sequelize.query(
        `SELECT
          DATE(created_at) AS date,
          COUNT(*) AS order_count,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
          COALESCE(SUM(pay_amount), 0) AS total_amount
        FROM exchange_records
        WHERE created_at >= :start_date
        GROUP BY DATE(created_at)
        ORDER BY date ASC`,
        {
          replacements: { start_date: startDate },
          type: this.sequelize.QueryTypes.SELECT
        }
      )

      // 补齐无数据的日期（确保前端图表连续）
      const trend = []
      const resultMap = new Map()
      results.forEach(r => {
        const dateStr =
          typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().slice(0, 10)
        resultMap.set(dateStr, r)
      })

      for (let i = 0; i < validDays; i++) {
        const d = new Date(startDate)
        d.setDate(d.getDate() + i)
        const dateStr = d.toISOString().slice(0, 10)
        const row = resultMap.get(dateStr)
        trend.push({
          date: dateStr,
          order_count: parseInt(row?.order_count || 0, 10),
          completed_count: parseInt(row?.completed_count || 0, 10),
          total_amount: parseInt(row?.total_amount || 0, 10)
        })
      }

      return { days: validDays, trend }
    } catch (error) {
      logger.error('[兑换市场] 查询兑换趋势失败:', error.message)
      throw new BusinessError(`查询兑换趋势失败: ${error.message}`, 'EXCHANGE_QUERY_FAILED', 500)
    }
  }

  /**
   * 获取商品排行榜（按兑换量/库存周转排序）
   *
   * 业务场景：管理后台「统计分析」Tab 的商品排行，展示兑换量 Top N 商品
   *
   * @param {Object} options - 查询参数
   * @param {string} [options.sort_by='sold_count'] - 排序字段（sold_count / stock_turnover / avg_rating）
   * @param {number} [options.limit=10] - 返回数量
   * @returns {Promise<Object>} 排行数据
   * @returns {Array<Object>} returns.ranking - 排行列表
   * @returns {number} returns.ranking[].exchange_item_id - 商品ID
   * @returns {string} returns.ranking[].item_name - 商品名称
   * @returns {number} returns.ranking[].sold_count - 总销量
   * @returns {number} returns.ranking[].stock - 当前库存
   * @returns {number} returns.ranking[].stock_turnover - 库存周转率（sold_count / (stock + sold_count)）
   * @returns {number|null} returns.ranking[].avg_rating - 平均评分
   */
  async getItemRanking({ sort_by = 'sold_count', limit = 10 } = {}) {
    try {
      const validLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50)
      const validSortBy = ['sold_count', 'stock_turnover', 'avg_rating'].includes(sort_by)
        ? sort_by
        : 'sold_count'

      logger.info('[兑换市场] 查询商品排行', { sort_by: validSortBy, limit: validLimit })

      // 基础查询：商品信息 + 平均评分
      const rows = await this.sequelize.query(
        `SELECT
          p.exchange_item_id,
          p.item_name,
          COALESCE(SUM(ps.sold_count), 0) AS sold_count,
          COALESCE(SUM(ps.stock), 0) AS stock,
          MIN(ecp.cost_amount) AS cost_amount,
          p.status,
          ROUND(COALESCE(SUM(ps.sold_count), 0) / GREATEST(COALESCE(SUM(ps.stock), 0) + COALESCE(SUM(ps.sold_count), 0), 1), 4) AS stock_turnover,
          AVG(er.rating) AS avg_rating,
          COUNT(DISTINCT er.exchange_record_id) AS total_orders
        FROM exchange_items p
        LEFT JOIN exchange_item_skus ps ON ps.exchange_item_id = p.exchange_item_id AND ps.status = 'active'
        LEFT JOIN exchange_channel_prices ecp ON ecp.sku_id = ps.sku_id
        LEFT JOIN exchange_records er
          ON er.exchange_item_id = p.exchange_item_id
          AND er.rating IS NOT NULL
        GROUP BY p.exchange_item_id
        ORDER BY ${validSortBy === 'stock_turnover' ? 'stock_turnover' : validSortBy === 'avg_rating' ? 'avg_rating' : 'sold_count'} DESC
        LIMIT :limit`,
        {
          replacements: { limit: validLimit },
          type: this.sequelize.QueryTypes.SELECT
        }
      )

      const ranking = rows.map((r, index) => ({
        rank: index + 1,
        exchange_item_id: r.exchange_item_id,
        item_name: r.item_name,
        sold_count: parseInt(r.sold_count || 0, 10),
        stock: parseInt(r.stock || 0, 10),
        cost_amount: r.cost_amount,
        status: r.status,
        stock_turnover: parseFloat(r.stock_turnover || 0),
        avg_rating: r.avg_rating ? parseFloat(parseFloat(r.avg_rating).toFixed(2)) : null,
        total_orders: parseInt(r.total_orders || 0, 10)
      }))

      return { sort_by: validSortBy, limit: validLimit, ranking }
    } catch (error) {
      logger.error('[兑换市场] 查询商品排行失败:', error.message)
      throw new BusinessError(`查询商品排行失败: ${error.message}`, 'EXCHANGE_QUERY_FAILED', 500)
    }
  }
}

module.exports = StatsQueryService
