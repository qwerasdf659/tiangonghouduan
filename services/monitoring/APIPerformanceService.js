/**
 * API性能监控服务（APIPerformanceService）
 *
 * 业务场景：
 * - 收集和统计API响应时间指标
 * - 识别慢API和高错误率API
 * - 提供性能监控数据用于运维优化
 *
 * 实现方式：
 * - 使用 Redis 时序数据存储响应时间
 * - 提供中间件收集响应时间
 * - 聚合计算平均值、P95、P99等指标
 *
 * API 端点：
 * - GET /api/v4/console/system/api-performance
 *
 * ServiceManager 键名：api_performance
 *
 * 关联需求：
 * - 《运营后台优化 - 后端需求文档》§4.6
 *
 * 创建时间：2026-02-03
 * @version 1.0.0
 */

'use strict'

const { getRedisClient } = require('../../utils/UnifiedRedisClient')
const BeijingTimeHelper = require('../../utils/timeHelper')
const logger = require('../../utils/logger').logger

/**
 * Redis键前缀配置
 * @constant
 */
const REDIS_PREFIX = {
  /** 响应时间列表前缀 */
  PERF: 'api:perf:',
  /** 错误计数前缀 */
  ERROR: 'api:error:',
  /** 请求计数前缀 */
  COUNT: 'api:count:',
  /** 监控端点集合 */
  ENDPOINTS: 'api:monitored_endpoints'
}

/**
 * 性能配置常量
 * @constant
 */
const PERF_CONFIG = {
  /** 响应时间数据保留时长（秒） */
  DATA_TTL: 3600, // 1小时
  /** 最大保留样本数 */
  MAX_SAMPLES: 1000,
  /** 慢API阈值（毫秒） */
  SLOW_THRESHOLD_MS: 500,
  /** 高错误率阈值 */
  HIGH_ERROR_RATE: 0.05
}

/**
 * API性能监控服务
 *
 * @description 提供API性能统计和监控功能
 */
class APIPerformanceService {
  /**
   * 记录API响应时间
   *
   * @description 由中间件调用，记录单次请求的响应时间
   *
   * @param {string} endpoint - API端点（如 "GET /api/v4/users"）
   * @param {number} duration - 响应时间（毫秒）
   * @param {number} statusCode - HTTP状态码
   * @returns {Promise<void>} 无返回值
   */
  static async recordResponseTime(endpoint, duration, statusCode) {
    try {
      const redis = getRedisClient()
      const normalizedEndpoint = this._normalizeEndpoint(endpoint)
      const perfKey = `${REDIS_PREFIX.PERF}${normalizedEndpoint}`
      const countKey = `${REDIS_PREFIX.COUNT}${normalizedEndpoint}`

      // 1. 记录响应时间
      await redis.lpush(perfKey, duration)
      await redis.ltrim(perfKey, 0, PERF_CONFIG.MAX_SAMPLES - 1)
      await redis.expire(perfKey, PERF_CONFIG.DATA_TTL)

      // 2. 增加请求计数
      await redis.incr(countKey)
      await redis.expire(countKey, PERF_CONFIG.DATA_TTL)

      // 3. 记录监控端点
      await redis.sadd(REDIS_PREFIX.ENDPOINTS, normalizedEndpoint)

      // 4. 如果是错误响应，记录错误
      if (statusCode >= 400) {
        const errorKey = `${REDIS_PREFIX.ERROR}${normalizedEndpoint}`
        await redis.incr(errorKey)
        await redis.expire(errorKey, PERF_CONFIG.DATA_TTL)
      }
    } catch (error) {
      // 性能监控不应影响正常请求，仅记录错误
      logger.debug('[API性能监控] 记录失败', { endpoint, error: error.message })
    }
  }

  /**
   * 获取API性能统计（主方法）
   *
   * @description 获取汇总统计、慢API列表、错误API列表
   *
   * @param {Object} [_options] - 可选参数（保留扩展）
   * @param {string} [_options.time_range='1h'] - 时间范围（保留扩展）
   * @returns {Promise<Object>} 性能统计结果
   */
  static async getPerformanceStats(_options = {}) {
    try {
      const redis = getRedisClient()

      // 1. 获取所有监控端点
      const endpoints = await redis.smembers(REDIS_PREFIX.ENDPOINTS)

      if (!endpoints || endpoints.length === 0) {
        return this._getEmptyStats()
      }

      // 2. 并行获取各端点统计
      const endpointStats = await Promise.all(
        endpoints.map(endpoint => this._getEndpointStats(endpoint))
      )

      // 3. 过滤有效数据
      const validStats = endpointStats.filter(stat => stat.request_count > 0)

      // 4. 计算汇总数据
      const summary = this._calculateSummary(validStats)

      // 5. 识别慢API
      const slowApis = validStats
        .filter(stat => stat.avg_ms >= PERF_CONFIG.SLOW_THRESHOLD_MS)
        .sort((a, b) => b.avg_ms - a.avg_ms)
        .slice(0, 10)
        .map(stat => ({
          endpoint: stat.endpoint,
          avg_ms: stat.avg_ms,
          p95_ms: stat.p95_ms,
          request_count: stat.request_count,
          status: stat.avg_ms >= 1000 ? 'critical' : 'warning'
        }))

      // 6. 识别高错误率API
      const errorApis = validStats
        .filter(stat => stat.error_rate >= PERF_CONFIG.HIGH_ERROR_RATE)
        .sort((a, b) => b.error_rate - a.error_rate)
        .slice(0, 10)
        .map(stat => ({
          endpoint: stat.endpoint,
          error_rate: stat.error_rate,
          error_count: stat.error_count,
          common_error: 'UNKNOWN' // 需要进一步实现错误类型统计
        }))

      const result = {
        summary,
        slow_apis: slowApis,
        error_apis: errorApis,
        updated_at: BeijingTimeHelper.apiTimestamp()
      }

      logger.info('[API性能监控] 统计获取完成', {
        endpoints_count: endpoints.length,
        slow_count: slowApis.length,
        error_count: errorApis.length
      })

      return result
    } catch (error) {
      logger.error('[API性能监控] 获取统计失败', { error: error.message })
      return this._getEmptyStats()
    }
  }

  /**
   * 获取单个端点的统计数据
   *
   * @private
   * @param {string} endpoint - 端点标识
   * @returns {Promise<Object>} 端点统计
   */
  static async _getEndpointStats(endpoint) {
    try {
      const redis = getRedisClient()
      const perfKey = `${REDIS_PREFIX.PERF}${endpoint}`
      const countKey = `${REDIS_PREFIX.COUNT}${endpoint}`
      const errorKey = `${REDIS_PREFIX.ERROR}${endpoint}`

      // 获取响应时间列表
      const times = await redis.lrange(perfKey, 0, -1)
      const requestCount = parseInt((await redis.get(countKey)) || '0', 10)
      const errorCount = parseInt((await redis.get(errorKey)) || '0', 10)

      if (times.length === 0) {
        return {
          endpoint,
          avg_ms: 0,
          p95_ms: 0,
          p99_ms: 0,
          request_count: requestCount,
          error_count: errorCount,
          error_rate: 0
        }
      }

      // 转换为数字并排序
      const numericTimes = times.map(t => parseInt(t, 10)).sort((a, b) => a - b)

      // 计算统计值
      const avg = Math.round(numericTimes.reduce((sum, t) => sum + t, 0) / numericTimes.length)
      const p95 = this._calculatePercentile(numericTimes, 0.95)
      const p99 = this._calculatePercentile(numericTimes, 0.99)
      const errorRate = requestCount > 0 ? errorCount / requestCount : 0

      return {
        endpoint,
        avg_ms: avg,
        p95_ms: p95,
        p99_ms: p99,
        request_count: requestCount,
        error_count: errorCount,
        error_rate: parseFloat(errorRate.toFixed(4))
      }
    } catch (error) {
      logger.debug('[API性能监控] 端点统计获取失败', { endpoint, error: error.message })
      return {
        endpoint,
        avg_ms: 0,
        p95_ms: 0,
        p99_ms: 0,
        request_count: 0,
        error_count: 0,
        error_rate: 0
      }
    }
  }

  /**
   * 计算百分位数
   *
   * @private
   * @param {Array<number>} sortedArray - 已排序的数组
   * @param {number} percentile - 百分位（0-1）
   * @returns {number} 百分位值
   */
  static _calculatePercentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0
    const index = Math.ceil(sortedArray.length * percentile) - 1
    return sortedArray[Math.max(0, index)]
  }

  /**
   * 计算汇总统计
   *
   * @private
   * @param {Array<Object>} endpointStats - 各端点统计列表
   * @returns {Object} 汇总统计
   */
  static _calculateSummary(endpointStats) {
    if (endpointStats.length === 0) {
      return {
        avg_response_time: 0,
        p95_response_time: 0,
        error_rate: 0,
        total_requests: 0
      }
    }

    const totalRequests = endpointStats.reduce((sum, s) => sum + s.request_count, 0)
    const totalErrors = endpointStats.reduce((sum, s) => sum + s.error_count, 0)

    // 加权平均响应时间
    const weightedAvg =
      totalRequests > 0
        ? endpointStats.reduce((sum, s) => sum + s.avg_ms * s.request_count, 0) / totalRequests
        : 0

    // P95 取各端点 P95 的最大值（粗略估算）
    const maxP95 = Math.max(...endpointStats.map(s => s.p95_ms))

    return {
      avg_response_time: Math.round(weightedAvg),
      p95_response_time: maxP95,
      error_rate: totalRequests > 0 ? parseFloat((totalErrors / totalRequests).toFixed(4)) : 0,
      total_requests: totalRequests
    }
  }

  /**
   * 标准化端点路径
   *
   * @description 将动态路径参数替换为 :id 占位符
   *
   * @private
   * @param {string} endpoint - 原始端点
   * @returns {string} 标准化后的端点
   */
  static _normalizeEndpoint(endpoint) {
    // 替换数字ID为 :id
    return endpoint.replace(/\/\d+/g, '/:id')
  }

  /**
   * 获取空统计结果
   *
   * @private
   * @returns {Object} 空统计结果
   */
  static _getEmptyStats() {
    return {
      summary: {
        avg_response_time: 0,
        p95_response_time: 0,
        error_rate: 0,
        total_requests: 0
      },
      slow_apis: [],
      error_apis: [],
      updated_at: BeijingTimeHelper.apiTimestamp()
    }
  }

  /**
   * 创建性能监控中间件
   *
   * @description 返回 Express 中间件函数，用于收集 API 响应时间
   *
   * @returns {Function} Express 中间件函数
   *
   * @example
   * // 在 app.js 中使用
   * const APIPerformanceService = require('./services/monitoring/APIPerformanceService')
   * app.use(APIPerformanceService.createMiddleware())
   */
  static createMiddleware() {
    return (req, res, next) => {
      const start = Date.now()

      res.on('finish', () => {
        const duration = Date.now() - start
        const endpoint = `${req.method} ${req.route?.path || req.path}`

        // 异步记录，不阻塞响应
        APIPerformanceService.recordResponseTime(endpoint, duration, res.statusCode).catch(() => {
          // 静默处理错误
        })
      })

      next()
    }
  }

  /**
   * 清理过期数据
   *
   * @description 清理过期的监控数据（通常由定时任务调用）
   *
   * @returns {Promise<number>} 清理的端点数量
   */
  static async cleanupStaleData() {
    try {
      const redis = getRedisClient()
      const endpoints = await redis.smembers(REDIS_PREFIX.ENDPOINTS)
      let cleanedCount = 0

      for (const endpoint of endpoints) {
        const perfKey = `${REDIS_PREFIX.PERF}${endpoint}`
        const exists = await redis.exists(perfKey)

        if (!exists) {
          await redis.srem(REDIS_PREFIX.ENDPOINTS, endpoint)
          cleanedCount++
        }
      }

      logger.info('[API性能监控] 清理过期数据', { cleaned_count: cleanedCount })
      return cleanedCount
    } catch (error) {
      logger.error('[API性能监控] 清理失败', { error: error.message })
      return 0
    }
  }
}

module.exports = APIPerformanceService
