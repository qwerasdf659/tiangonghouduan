/**
 * 门店贡献度服务（StoreContributionService）
 *
 * 业务场景：
 * - 统计各门店/商户的消费贡献度
 * - 提供贡献度排行榜
 * - 分析门店消费趋势
 * - 计算门店健康度评分
 *
 * API 端点：
 * - GET /api/v4/console/stores/contribution
 * - GET /api/v4/console/stores/:store_id/trend
 * - GET /api/v4/console/stores/:store_id/health-score
 * - GET /api/v4/console/stores/:store_id/comparison
 *
 * ServiceManager 键名：store_contribution
 *
 * 关联需求：
 * - 《运营后台优化 - 后端需求文档》§6.2
 *
 * 创建时间：2026-02-03
 * @version 1.0.0
 */

'use strict'

const { Op, fn, col, literal } = require('sequelize')
const { BusinessCacheHelper, KEY_PREFIX } = require('../../utils/BusinessCacheHelper')
const BeijingTimeHelper = require('../../utils/timeHelper')
const logger = require('../../utils/logger').logger

/**
 * 健康度评分权重配置
 * @constant
 */
const HEALTH_SCORE_WEIGHTS = {
  /** 消费金额权重 */
  AMOUNT: 0.4,
  /** 消费频次权重 */
  FREQUENCY: 0.3,
  /** 客单价权重 */
  AVG_AMOUNT: 0.2,
  /** 增长趋势权重 */
  GROWTH: 0.1
}

/**
 * 缓存配置
 * @constant
 */
const CACHE_KEY_PREFIX = 'store_contribution'
const CACHE_TTL = 600 // 10分钟缓存

/**
 * 门店贡献度服务
 *
 * @description 提供门店/商户贡献度统计和分析功能
 */
class StoreContributionService {
  /**
   * 构造函数
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
  }

  /**
   * 获取商户贡献度排行（主方法）
   *
   * @description 统计各商户的消费贡献度，按贡献金额降序排列
   *
   * @param {Object} [options] - 可选参数
   * @param {number} [options.days=30] - 统计天数
   * @param {number} [options.limit=20] - 返回数量限制
   * @param {boolean} [options.use_cache=true] - 是否使用缓存
   *
   * @returns {Promise<Object>} 贡献度排行结果
   */
  async getContributionRanking(options = {}) {
    const { days = 30, limit = 20, use_cache = true } = options
    const cacheKey = `${KEY_PREFIX}${CACHE_KEY_PREFIX}_ranking_${days}d`

    try {
      // 1. 尝试从缓存获取
      if (use_cache) {
        const cached = await BusinessCacheHelper.get(cacheKey)
        if (cached) {
          logger.debug('[门店贡献度] 使用缓存数据')
          return cached
        }
      }

      const startDate = BeijingTimeHelper.daysAgo(days)

      // 2. 获取平台总消费金额（用于计算贡献率）
      const totalAmountResult = await this.models.ConsumptionRecord.sum('consumption_amount', {
        where: {
          created_at: { [Op.gte]: startDate },
          status: 'approved'
        }
      })
      const platformTotal = parseFloat(totalAmountResult || 0)

      // 3. 获取各商户贡献数据
      const rankings = await this.models.ConsumptionRecord.findAll({
        attributes: [
          'merchant_id',
          [fn('COUNT', col('consumption_record_id')), 'order_count'],
          [fn('SUM', col('consumption_amount')), 'total_amount'],
          [fn('AVG', col('consumption_amount')), 'avg_amount']
        ],
        include: [
          {
            model: this.models.User,
            as: 'merchant',
            attributes: ['user_id', 'nickname', 'avatar_url']
          }
        ],
        where: {
          created_at: { [Op.gte]: startDate },
          status: 'approved',
          merchant_id: { [Op.ne]: null }
        },
        group: ['merchant_id'],
        order: [[fn('SUM', col('consumption_amount')), 'DESC']],
        limit,
        raw: true,
        nest: true
      })

      // 4. 格式化结果
      const formattedRankings = rankings.map((row, index) => {
        const totalAmount = parseFloat(row.total_amount || 0)
        const contributionRate = platformTotal > 0 ? totalAmount / platformTotal : 0

        return {
          rank: index + 1,
          merchant_id: row.merchant_id,
          merchant_name: row.merchant?.nickname || '未知商户',
          avatar_url: row.merchant?.avatar_url || null,
          order_count: parseInt(row.order_count || 0, 10),
          total_amount: totalAmount,
          avg_amount: parseFloat(parseFloat(row.avg_amount || 0).toFixed(2)),
          contribution_rate: parseFloat(contributionRate.toFixed(4))
        }
      })

      const result = {
        rankings: formattedRankings,
        platform_total: platformTotal,
        period_days: days,
        updated_at: BeijingTimeHelper.apiTimestamp()
      }

      // 5. 写入缓存
      await BusinessCacheHelper.set(cacheKey, result, CACHE_TTL)

      logger.info('[门店贡献度] 排行统计完成', {
        ranking_count: formattedRankings.length,
        platform_total: platformTotal
      })

      return result
    } catch (error) {
      logger.error('[门店贡献度] 获取排行失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取商户消费趋势
   *
   * @description 获取指定商户近N天的消费趋势数据
   *
   * @param {number} merchantId - 商户ID
   * @param {Object} [options] - 可选参数
   * @param {number} [options.days=30] - 统计天数
   * @returns {Promise<Object>} 消费趋势结果
   */
  async getMerchantTrend(merchantId, options = {}) {
    const { days = 30 } = options
    const startDate = BeijingTimeHelper.daysAgo(days)

    try {
      const results = await this.models.ConsumptionRecord.findAll({
        attributes: [
          [fn('DATE', col('created_at')), 'date'],
          [fn('COUNT', col('consumption_record_id')), 'order_count'],
          [fn('SUM', col('consumption_amount')), 'total_amount']
        ],
        where: {
          merchant_id: merchantId,
          created_at: { [Op.gte]: startDate },
          status: 'approved'
        },
        group: [fn('DATE', col('created_at'))],
        order: [[fn('DATE', col('created_at')), 'ASC']],
        raw: true
      })

      const trend = results.map(row => ({
        date: row.date,
        order_count: parseInt(row.order_count || 0, 10),
        total_amount: parseFloat(row.total_amount || 0)
      }))

      logger.info('[门店贡献度] 趋势数据获取完成', {
        merchant_id: merchantId,
        data_points: trend.length
      })

      return {
        merchant_id: merchantId,
        period_days: days,
        trend,
        updated_at: BeijingTimeHelper.apiTimestamp()
      }
    } catch (error) {
      logger.error('[门店贡献度] 获取趋势失败', { merchant_id: merchantId, error: error.message })
      throw error
    }
  }

  /**
   * 计算商户健康度评分
   *
   * @description 基于消费金额、频次、客单价、增长趋势计算综合健康度
   *
   * @param {number} merchantId - 商户ID
   * @param {Object} [options] - 可选参数
   * @param {number} [options.days=30] - 统计天数
   * @returns {Promise<Object>} 健康度评分结果
   */
  async calculateHealthScore(merchantId, options = {}) {
    const { days = 30 } = options
    const startDate = BeijingTimeHelper.daysAgo(days)
    const prevStartDate = BeijingTimeHelper.daysAgo(days * 2)

    try {
      // 1. 获取商户统计数据
      const merchantStats = await this.models.ConsumptionRecord.findOne({
        attributes: [
          [fn('COUNT', col('consumption_record_id')), 'order_count'],
          [fn('SUM', col('consumption_amount')), 'total_amount'],
          [fn('AVG', col('consumption_amount')), 'avg_amount']
        ],
        where: {
          merchant_id: merchantId,
          created_at: { [Op.gte]: startDate },
          status: 'approved'
        },
        raw: true
      })

      // 2. 获取平台平均数据
      const platformStats = await this.models.ConsumptionRecord.findOne({
        attributes: [
          [fn('AVG', col('consumption_amount')), 'avg_amount'],
          [literal(`SUM(consumption_amount) / COUNT(DISTINCT merchant_id)`), 'avg_merchant_amount']
        ],
        where: {
          created_at: { [Op.gte]: startDate },
          status: 'approved',
          merchant_id: { [Op.ne]: null }
        },
        raw: true
      })

      // 3. 获取上期数据（用于计算增长率）
      const prevStats = await this.models.ConsumptionRecord.findOne({
        attributes: [[fn('SUM', col('consumption_amount')), 'total_amount']],
        where: {
          merchant_id: merchantId,
          created_at: {
            [Op.gte]: prevStartDate,
            [Op.lt]: startDate
          },
          status: 'approved'
        },
        raw: true
      })

      const totalAmount = parseFloat(merchantStats?.total_amount || 0)
      const orderCount = parseInt(merchantStats?.order_count || 0, 10)
      const avgAmount = parseFloat(merchantStats?.avg_amount || 0)
      const platformAvgMerchantAmount = parseFloat(platformStats?.avg_merchant_amount || 1)
      const platformAvgAmount = parseFloat(platformStats?.avg_amount || 1)
      const prevTotalAmount = parseFloat(prevStats?.total_amount || 0)

      // 4. 计算增长率
      const growthRate = prevTotalAmount > 0 ? (totalAmount - prevTotalAmount) / prevTotalAmount : 0

      // 5. 计算各维度得分
      const amountScore =
        Math.min(100, (totalAmount / platformAvgMerchantAmount) * 100) * HEALTH_SCORE_WEIGHTS.AMOUNT
      const frequencyScore =
        Math.min(100, (orderCount / days) * 100) * HEALTH_SCORE_WEIGHTS.FREQUENCY
      const avgAmountScore =
        Math.min(100, (avgAmount / platformAvgAmount) * 100) * HEALTH_SCORE_WEIGHTS.AVG_AMOUNT
      const growthScore = (growthRate > 0 ? 100 : 50) * HEALTH_SCORE_WEIGHTS.GROWTH

      const totalScore = Math.round(amountScore + frequencyScore + avgAmountScore + growthScore)

      // 6. 确定健康状态
      let status
      if (totalScore >= 80) {
        status = 'healthy'
      } else if (totalScore >= 50) {
        status = 'warning'
      } else {
        status = 'critical'
      }

      logger.info('[门店贡献度] 健康度评分完成', {
        merchant_id: merchantId,
        score: totalScore,
        status
      })

      return {
        merchant_id: merchantId,
        score: totalScore,
        status,
        components: {
          amount: {
            score: Math.round(amountScore / HEALTH_SCORE_WEIGHTS.AMOUNT),
            weight: HEALTH_SCORE_WEIGHTS.AMOUNT
          },
          frequency: {
            score: Math.round(frequencyScore / HEALTH_SCORE_WEIGHTS.FREQUENCY),
            weight: HEALTH_SCORE_WEIGHTS.FREQUENCY
          },
          avg_amount: {
            score: Math.round(avgAmountScore / HEALTH_SCORE_WEIGHTS.AVG_AMOUNT),
            weight: HEALTH_SCORE_WEIGHTS.AVG_AMOUNT
          },
          growth: {
            score: Math.round(growthScore / HEALTH_SCORE_WEIGHTS.GROWTH),
            weight: HEALTH_SCORE_WEIGHTS.GROWTH
          }
        },
        raw_data: {
          total_amount: totalAmount,
          order_count: orderCount,
          avg_amount: avgAmount,
          growth_rate: parseFloat(growthRate.toFixed(4))
        },
        updated_at: BeijingTimeHelper.apiTimestamp()
      }
    } catch (error) {
      logger.error('[门店贡献度] 健康度计算失败', { merchant_id: merchantId, error: error.message })
      throw error
    }
  }

  /**
   * 获取商户环比同比对比数据
   *
   * @description 对比本周/上周、本月/上月的消费数据
   *
   * @param {number} merchantId - 商户ID
   * @returns {Promise<Object>} 对比数据结果
   */
  async getComparison(merchantId) {
    try {
      const now = new Date()

      // 计算各时间段
      const thisWeekStart = BeijingTimeHelper.daysAgo(7)
      const lastWeekStart = BeijingTimeHelper.daysAgo(14)
      const thisMonthStart = BeijingTimeHelper.daysAgo(30)
      const lastMonthStart = BeijingTimeHelper.daysAgo(60)

      // 并行获取各时间段数据
      const [thisWeek, lastWeek, thisMonth, lastMonth] = await Promise.all([
        this._getPeriodStats(merchantId, thisWeekStart, now),
        this._getPeriodStats(merchantId, lastWeekStart, thisWeekStart),
        this._getPeriodStats(merchantId, thisMonthStart, now),
        this._getPeriodStats(merchantId, lastMonthStart, thisMonthStart)
      ])

      // 计算变化率
      const weekAmountChange =
        lastWeek.amount > 0 ? (thisWeek.amount - lastWeek.amount) / lastWeek.amount : 0
      const weekOrdersChange =
        lastWeek.orders > 0 ? (thisWeek.orders - lastWeek.orders) / lastWeek.orders : 0
      const monthAmountChange =
        lastMonth.amount > 0 ? (thisMonth.amount - lastMonth.amount) / lastMonth.amount : 0
      const monthOrdersChange =
        lastMonth.orders > 0 ? (thisMonth.orders - lastMonth.orders) / lastMonth.orders : 0

      return {
        merchant_id: merchantId,
        this_week: thisWeek,
        last_week: lastWeek,
        week_change: {
          amount_rate: parseFloat(weekAmountChange.toFixed(4)),
          orders_rate: parseFloat(weekOrdersChange.toFixed(4))
        },
        this_month: thisMonth,
        last_month: lastMonth,
        month_change: {
          amount_rate: parseFloat(monthAmountChange.toFixed(4)),
          orders_rate: parseFloat(monthOrdersChange.toFixed(4))
        },
        updated_at: BeijingTimeHelper.apiTimestamp()
      }
    } catch (error) {
      logger.error('[门店贡献度] 对比数据获取失败', {
        merchant_id: merchantId,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取指定时间段的统计数据
   *
   * @private
   * @param {number} merchantId - 商户ID
   * @param {Date} startDate - 开始日期
   * @param {Date} endDate - 结束日期
   * @returns {Promise<Object>} 时间段统计
   */
  async _getPeriodStats(merchantId, startDate, endDate) {
    try {
      const result = await this.models.ConsumptionRecord.findOne({
        attributes: [
          [fn('SUM', col('consumption_amount')), 'total_amount'],
          [fn('COUNT', col('consumption_record_id')), 'order_count']
        ],
        where: {
          merchant_id: merchantId,
          created_at: {
            [Op.gte]: startDate,
            [Op.lt]: endDate
          },
          status: 'approved'
        },
        raw: true
      })

      return {
        amount: parseFloat(result?.total_amount || 0),
        orders: parseInt(result?.order_count || 0, 10)
      }
    } catch (error) {
      return { amount: 0, orders: 0 }
    }
  }

  /**
   * 手动失效缓存
   *
   * @param {string} reason - 失效原因
   * @returns {Promise<boolean>} 是否成功失效缓存
   */
  async invalidateCache(reason = 'manual_invalidation') {
    const cacheKey = `${KEY_PREFIX}${CACHE_KEY_PREFIX}_ranking_30d`
    return await BusinessCacheHelper.del(cacheKey, reason)
  }
}

module.exports = StoreContributionService
