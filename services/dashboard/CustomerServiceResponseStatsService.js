/**
 * 客服响应时长统计服务（CustomerServiceResponseStatsService）
 *
 * 业务场景：
 * - 统计客服响应时长指标
 * - 计算平均响应时间、最大响应时间
 * - 统计1分钟内响应率
 * - 提供7日趋势数据
 *
 * 依赖表：customer_service_sessions
 * 依赖字段：first_response_at（需通过 DB-1 迁移添加）
 *
 * API 端点：
 * - GET /api/v4/console/customer-service/response-stats
 *
 * ServiceManager 键名：cs_response_stats
 *
 * 关联需求：
 * - 《运营后台优化 - 后端需求文档》§4.15
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
 * 响应时长基准配置
 * @constant
 */
const BENCHMARK_CONFIG = {
  /** 目标响应时间（秒） */
  TARGET_SECONDS: 60,
  /** 目标响应率（1分钟内响应的比例） */
  TARGET_RATE: 0.9
}

/**
 * 缓存配置
 * @constant
 */
const CACHE_KEY = 'cs_response_stats'
const CACHE_TTL = 300 // 5分钟缓存

/**
 * 客服响应时长统计服务
 *
 * @description 提供客服响应时长统计功能
 */
class CustomerServiceResponseStatsService {
  /**
   * 构造函数
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
  }

  /**
   * 获取客服响应统计数据（主方法）
   *
   * @description 获取今日响应统计和7日趋势数据
   *
   * @param {Object} [options] - 可选参数
   * @param {number} [options.days=7] - 趋势数据天数
   * @param {boolean} [options.use_cache=true] - 是否使用缓存
   *
   * @returns {Promise<Object>} 响应统计结果
   * @returns {Object} return.today - 今日统计
   * @returns {Array<Object>} return.trend_7d - 7日趋势
   * @returns {Object} return.benchmark - 基准配置
   * @returns {string} return.updated_at - 更新时间
   *
   * @example
   * const stats = await csResponseStatsService.getResponseStats()
   * // { today: { avg_response_seconds: 45, ... }, trend_7d: [...], benchmark: {...} }
   */
  async getResponseStats(options = {}) {
    const { days = 7, use_cache = true } = options
    const cacheKey = `${KEY_PREFIX}${CACHE_KEY}`

    try {
      // 1. 尝试从缓存获取
      if (use_cache) {
        const cached = await BusinessCacheHelper.get(cacheKey)
        if (cached) {
          logger.debug('[客服响应统计] 使用缓存数据')
          return cached
        }
      }

      // 2. 并行获取今日统计和趋势数据
      const [todayStats, trendData] = await Promise.all([
        this._getTodayStats(),
        this._getTrendData(days)
      ])

      const result = {
        today: todayStats,
        trend_7d: trendData,
        benchmark: {
          target_seconds: BENCHMARK_CONFIG.TARGET_SECONDS,
          target_rate: BENCHMARK_CONFIG.TARGET_RATE
        },
        updated_at: BeijingTimeHelper.apiTimestamp()
      }

      // 3. 写入缓存
      await BusinessCacheHelper.set(cacheKey, result, CACHE_TTL)

      logger.info('[客服响应统计] 统计计算完成', {
        today_avg: todayStats.avg_response_seconds,
        today_rate: todayStats.within_1min_rate
      })

      return result
    } catch (error) {
      logger.error('[客服响应统计] 获取统计失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取今日响应统计
   *
   * @private
   * @returns {Promise<Object>} 今日统计结果
   */
  async _getTodayStats() {
    try {
      const todayRange = BeijingTimeHelper.todayRange()

      const result = await this.models.CustomerServiceSession.findOne({
        attributes: [
          [fn('COUNT', col('customer_service_session_id')), 'session_count'],
          [
            fn('AVG', literal('TIMESTAMPDIFF(SECOND, created_at, first_response_at)')),
            'avg_response_seconds'
          ],
          [
            fn('MAX', literal('TIMESTAMPDIFF(SECOND, created_at, first_response_at)')),
            'max_response_seconds'
          ],
          [
            literal(
              `SUM(CASE WHEN TIMESTAMPDIFF(SECOND, created_at, first_response_at) <= 60 THEN 1 ELSE 0 END) / COUNT(*)`
            ),
            'within_1min_rate'
          ]
        ],
        where: {
          created_at: {
            [Op.gte]: todayRange.start,
            [Op.lte]: todayRange.end
          },
          first_response_at: {
            [Op.ne]: null
          }
        },
        raw: true
      })

      return {
        avg_response_seconds: Math.round(parseFloat(result?.avg_response_seconds || 0)),
        max_response_seconds: Math.round(parseFloat(result?.max_response_seconds || 0)),
        within_1min_rate: parseFloat(parseFloat(result?.within_1min_rate || 0).toFixed(2)),
        session_count: parseInt(result?.session_count || 0, 10)
      }
    } catch (error) {
      logger.error('[客服响应统计] 今日统计计算失败', { error: error.message })
      return {
        avg_response_seconds: 0,
        max_response_seconds: 0,
        within_1min_rate: 0,
        session_count: 0
      }
    }
  }

  /**
   * 获取趋势数据
   *
   * @private
   * @param {number} days - 天数
   * @returns {Promise<Array<Object>>} 趋势数据列表
   */
  async _getTrendData(days) {
    try {
      const startDate = BeijingTimeHelper.daysAgo(days)

      const results = await this.models.CustomerServiceSession.findAll({
        attributes: [
          [fn('DATE', col('created_at')), 'date'],
          [fn('COUNT', col('customer_service_session_id')), 'session_count'],
          [
            fn('AVG', literal('TIMESTAMPDIFF(SECOND, created_at, first_response_at)')),
            'avg_seconds'
          ],
          [
            literal(
              `SUM(CASE WHEN TIMESTAMPDIFF(SECOND, created_at, first_response_at) <= 60 THEN 1 ELSE 0 END) / COUNT(*)`
            ),
            'within_1min_rate'
          ]
        ],
        where: {
          created_at: {
            [Op.gte]: startDate
          },
          first_response_at: {
            [Op.ne]: null
          }
        },
        group: [fn('DATE', col('created_at'))],
        order: [[fn('DATE', col('created_at')), 'DESC']],
        raw: true
      })

      return results.map(row => ({
        date: row.date,
        avg_seconds: Math.round(parseFloat(row.avg_seconds || 0)),
        within_1min_rate: parseFloat(parseFloat(row.within_1min_rate || 0).toFixed(2)),
        session_count: parseInt(row.session_count || 0, 10)
      }))
    } catch (error) {
      logger.error('[客服响应统计] 趋势数据计算失败', { error: error.message })
      return []
    }
  }

  /**
   * 记录首次响应时间
   *
   * @description 当客服首次响应用户消息时调用，更新会话的 first_response_at 字段
   *
   * @param {number} sessionId - 会话ID
   * @param {Object} [options] - 可选参数
   * @param {Object} [options.transaction] - Sequelize 事务对象
   * @returns {Promise<boolean>} 是否更新成功
   */
  async recordFirstResponse(sessionId, options = {}) {
    try {
      const session = await this.models.CustomerServiceSession.findByPk(sessionId, {
        transaction: options.transaction
      })

      if (!session) {
        logger.warn('[客服响应统计] 会话不存在', { session_id: sessionId })
        return false
      }

      // 只在首次响应时更新
      if (session.first_response_at) {
        logger.debug('[客服响应统计] 会话已有首次响应记录，跳过', { session_id: sessionId })
        return true
      }

      await session.update({ first_response_at: new Date() }, { transaction: options.transaction })

      logger.info('[客服响应统计] 记录首次响应时间', { session_id: sessionId })

      // 失效缓存
      await this.invalidateCache('first_response_recorded')

      return true
    } catch (error) {
      logger.error('[客服响应统计] 记录首次响应失败', {
        session_id: sessionId,
        error: error.message
      })
      return false
    }
  }

  /**
   * 手动失效缓存
   *
   * @param {string} reason - 失效原因
   * @returns {Promise<boolean>} 是否成功失效缓存
   */
  async invalidateCache(reason = 'manual_invalidation') {
    const cacheKey = `${KEY_PREFIX}${CACHE_KEY}`
    return await BusinessCacheHelper.del(cacheKey, reason)
  }
}

module.exports = CustomerServiceResponseStatsService
