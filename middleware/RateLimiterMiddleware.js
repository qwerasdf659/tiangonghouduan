/**
 * API请求频率限制中间件 V4
 * 基于Redis的滑动窗口限流算法，防止恶意刷接口
 * 创建时间：2025年10月12日 北京时间
 *
 * 功能特性：
 * 1. 滑动窗口限流（精确控制请求频率）
 * 2. 支持按用户ID和IP地址限流
 * 3. 使用统一Redis客户端
 * 4. 自动清理过期记录
 * 5. 统一ApiResponse错误格式
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const { getRedisClient } = require('../utils/UnifiedRedisClient')
const ApiResponse = require('../utils/ApiResponse')

class RateLimiterMiddleware {
  constructor () {
    // 使用统一的Redis客户端
    this.redisClient = getRedisClient()

    // 限流配置预设
    this.presets = {
      // 全局API限流
      global: {
        windowMs: 60 * 1000, // 1分钟窗口
        max: 100, // 最多100个请求
        keyPrefix: 'rate_limit:global:',
        message: '请求过于频繁，请稍后再试'
      },
      // 抽奖接口限流
      lottery: {
        windowMs: 60 * 1000, // 1分钟窗口
        max: 20, // 最多20次抽奖
        keyPrefix: 'rate_limit:lottery:',
        message: '抽奖过于频繁，请稍后再试',
        keyGenerator: 'user' // 按用户限流
      },
      // 登录接口限流
      login: {
        windowMs: 60 * 1000, // 1分钟窗口
        max: 10, // 最多10次登录尝试
        keyPrefix: 'rate_limit:login:',
        message: '登录尝试次数过多，请稍后再试',
        keyGenerator: 'ip' // 按IP限流
      },
      /*
       * 聊天消息发送限流（Chat Message Sending Rate Limit）
       * 防止用户恶意刷屏，保护系统稳定性
       */
      chat: {
        windowMs: 60 * 1000, // 1分钟窗口
        max: 10, // 最多10条消息/分钟
        keyPrefix: 'rate_limit:chat:',
        message: '发送消息过于频繁，请稍后重试',
        keyGenerator: 'user' // 按用户ID限流
      }
    }

    // 监听应用退出事件，清理资源
    process.on('SIGINT', () => {
      this.cleanup()
    })

    process.on('SIGTERM', () => {
      this.cleanup()
    })
  }

  /**
   * 创建限流中间件
   * @param {Object|string} options 限流配置或预设名称
   * @returns {Function} Express中间件函数
   */
  createLimiter (options = {}) {
    // 如果传入字符串，使用预设配置
    if (typeof options === 'string') {
      const presetName = options
      if (!this.presets[presetName]) {
        throw new Error(`未找到预设配置: ${presetName}`)
      }
      options = this.presets[presetName]
    }

    // 合并默认配置
    const config = {
      windowMs: options.windowMs || 60 * 1000, // 默认1分钟
      max: options.max || 100, // 默认100次
      keyPrefix: options.keyPrefix || 'rate_limit:',
      message: options.message || '请求过于频繁，请稍后再试',
      keyGenerator: options.keyGenerator || 'ip', // 'ip' | 'user' | Function
      skipSuccessfulRequests: options.skipSuccessfulRequests || false, // 是否跳过成功请求
      skipFailedRequests: options.skipFailedRequests || false, // 是否跳过失败请求
      onLimitReached: options.onLimitReached || null // 达到限流时的回调
    }

    return async (req, res, next) => {
      try {
        // 生成限流key
        const limitKey = this._generateKey(req, config)

        if (!limitKey) {
          // 无法生成key（如未登录用户访问需要用户ID的限流），跳过限流
          return next()
        }

        // 当前时间戳（毫秒）
        const now = Date.now()
        const windowStart = now - config.windowMs

        /*
         * 使用Redis Sorted Set实现滑动窗口
         * 1. 清理窗口外的旧记录
         */
        await this.redisClient.zremrangebyscore(limitKey, 0, windowStart)

        // 2. 统计当前窗口内的请求数
        const requestCount = await this.redisClient.zcard(limitKey)

        // 3. 检查是否超过限制
        if (requestCount >= config.max) {
          // 获取最早的请求时间，计算重试时间
          const oldestRequestScore = await this._getOldestRequestTime(limitKey)
          const retryAfter = oldestRequestScore
            ? Math.ceil((oldestRequestScore + config.windowMs - now) / 1000)
            : Math.ceil(config.windowMs / 1000)

          // 触发限流回调
          if (config.onLimitReached) {
            config.onLimitReached(req, limitKey, requestCount)
          }

          // 记录限流日志
          console.warn('[RateLimiter] 限流触发', {
            key: limitKey,
            current: requestCount,
            limit: config.max,
            window_ms: config.windowMs,
            ip: req.ip,
            user_id: req.user?.user_id,
            path: req.path,
            method: req.method,
            timestamp: BeijingTimeHelper.now()
          })

          // 返回429错误
          return res.status(429).json(
            ApiResponse.error(
              config.message,
              'RATE_LIMIT_EXCEEDED',
              {
                limit: config.max,
                window_seconds: config.windowMs / 1000,
                retry_after: retryAfter,
                current: requestCount
              },
              -429
            )
          )
        }

        // 4. 记录本次请求
        const requestId = `${now}_${Math.random().toString(36).substr(2, 9)}`
        await this.redisClient.zadd(limitKey, now, requestId)

        // 5. 设置key过期时间（窗口大小的2倍，防止内存泄漏）
        await this.redisClient.expire(limitKey, Math.ceil((config.windowMs * 2) / 1000))

        // 6. 在响应头中添加限流信息
        res.setHeader('X-RateLimit-Limit', config.max)
        res.setHeader('X-RateLimit-Remaining', Math.max(0, config.max - requestCount - 1))
        res.setHeader('X-RateLimit-Reset', new Date(windowStart + config.windowMs).toISOString())

        // 7. 如果配置了跳过成功/失败请求，需要在响应后清理
        if (config.skipSuccessfulRequests || config.skipFailedRequests) {
          const originalSend = res.send
          res.send = async function (body) {
            const statusCode = res.statusCode
            const shouldRemove =
              (config.skipSuccessfulRequests && statusCode >= 200 && statusCode < 300) ||
              (config.skipFailedRequests && (statusCode < 200 || statusCode >= 400))

            if (shouldRemove) {
              try {
                // 移除本次请求记录
                await this.redisClient.getClient().zrem(limitKey, requestId)
              } catch (error) {
                console.error('[RateLimiter] 移除请求记录失败:', error)
              }
            }

            return originalSend.call(this, body)
          }.bind(res)
        }

        next()
      } catch (error) {
        console.error('[RateLimiter] 限流中间件错误:', error)
        // 发生错误时不阻塞请求，继续处理
        next()
      }
    }
  }

  /**
   * 生成限流key
   * @param {Object} req Express请求对象
   * @param {Object} config 限流配置
   * @returns {string|null} 限流key
   */
  _generateKey (req, config) {
    const { keyPrefix, keyGenerator } = config

    // 自定义key生成函数
    if (typeof keyGenerator === 'function') {
      const customKey = keyGenerator(req)
      return customKey ? `${keyPrefix}${customKey}` : null
    }

    // 按用户ID限流
    if (keyGenerator === 'user') {
      const user_id = req.user?.user_id
      if (!user_id) {
        // 未登录用户，跳过限流或降级为IP限流
        console.debug('[RateLimiter] 未登录用户，跳过用户级限流')
        return null
      }
      return `${keyPrefix}user:${user_id}`
    }

    // 按IP限流（默认）
    if (keyGenerator === 'ip') {
      const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'
      return `${keyPrefix}ip:${clientIP}`
    }

    // 未知的keyGenerator类型
    console.warn(`[RateLimiter] 未知的keyGenerator类型: ${keyGenerator}`)
    return null
  }

  /**
   * 获取最早的请求时间
   * @param {string} key Redis key
   * @returns {Promise<number|null>} 最早请求的时间戳
   */
  async _getOldestRequestTime (key) {
    try {
      const client = await this.redisClient.ensureConnection()
      const result = await client.zrange(key, 0, 0, 'WITHSCORES')
      return result && result.length >= 2 ? parseFloat(result[1]) : null
    } catch (error) {
      console.error('[RateLimiter] 获取最早请求时间失败:', error)
      return null
    }
  }

  /**
   * 获取限流统计信息
   * @param {string} keyPattern key模式（如 'rate_limit:lottery:*'）
   * @returns {Promise<Object>} 统计信息
   */
  async getStats (keyPattern = 'rate_limit:*') {
    try {
      const client = await this.redisClient.ensureConnection()
      const keys = await client.keys(keyPattern)

      const stats = {
        total_keys: keys.length,
        keys: [],
        timestamp: BeijingTimeHelper.formatForAPI(new Date()).iso
      }

      for (const key of keys.slice(0, 100)) {
        // 最多返回100个key的统计
        const count = await this.redisClient.zcard(key)
        const ttl = await client.ttl(key)

        stats.keys.push({
          key,
          request_count: count,
          ttl_seconds: ttl
        })
      }

      return stats
    } catch (error) {
      console.error('[RateLimiter] 获取统计信息失败:', error)
      return {
        error: error.message,
        timestamp: BeijingTimeHelper.formatForAPI(new Date()).iso
      }
    }
  }

  /**
   * 重置指定key的限流计数
   * @param {string} key 限流key
   * @returns {Promise<boolean>} 是否成功
   */
  async resetLimit (key) {
    try {
      await this.redisClient.del(key)
      console.log(`[RateLimiter] 已重置限流: ${key}`)
      return true
    } catch (error) {
      console.error('[RateLimiter] 重置限流失败:', error)
      return false
    }
  }

  /**
   * 清理所有限流数据
   * @param {string} keyPattern key模式
   * @returns {Promise<number>} 清理的key数量
   */
  async clearAll (keyPattern = 'rate_limit:*') {
    try {
      const client = await this.redisClient.ensureConnection()
      const keys = await client.keys(keyPattern)

      if (keys.length === 0) {
        return 0
      }

      const pipeline = await this.redisClient.pipeline()
      keys.forEach(key => {
        pipeline.del(key)
      })
      await pipeline.exec()

      console.log(`[RateLimiter] 已清理 ${keys.length} 个限流key`)
      return keys.length
    } catch (error) {
      console.error('[RateLimiter] 清理限流数据失败:', error)
      return 0
    }
  }

  /**
   * 清理资源
   */
  async cleanup () {
    try {
      console.log('[RateLimiter] 正在清理资源...')
      // Redis客户端由UnifiedRedisClient统一管理，这里不需要关闭
      console.log('[RateLimiter] 资源清理完成')
    } catch (error) {
      console.error('[RateLimiter] 资源清理失败:', error)
    }
  }
}

// 导出单例实例
let rateLimiterInstance = null

/**
 * 获取限流器单例实例
 * @returns {RateLimiterMiddleware} 限流器实例
 */
function getRateLimiter () {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiterMiddleware()
  }
  return rateLimiterInstance
}

module.exports = {
  RateLimiterMiddleware,
  getRateLimiter
}
