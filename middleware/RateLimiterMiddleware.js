/* eslint-disable no-await-in-loop -- 限流统计需要串行扫描Redis keys */

const logger = require('../utils/logger').logger

/**
 * API请求频率限制中间件 V4
 * 基于Redis的滑动窗口限流算法，防止恶意刷接口
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
const crypto = require('crypto')

/**
 * API 请求频率限制中间件（Rate Limiter Middleware）
 *
 * 业务场景：
 * - 防止恶意刷接口（登录、抽奖、聊天等关键接口）
 * - 基于 Redis Sorted Set 实现滑动窗口限流
 *
 * 输出约束：
 * - 达到限流时返回统一 ApiResponse.error 格式
 */
class RateLimiterMiddleware {
  /**
   * 构造函数：初始化 Redis 客户端与限流预设配置
   *
   * @returns {void} 无返回值
   */
  constructor() {
    // 使用统一的Redis客户端
    this.redisClient = getRedisClient()

    /*
     * R13/D8（Redis 不可用内存兜底，2026-05-30）
     * - 进程内滑动窗口存储：key → number[]（请求时间戳数组）
     * - 仅在 Redis 异常时写入；Redis 正常时此 Map 始终为空，零开销
     * - cluster 下每 worker 各自计数（粗粒度），有效阈值 ≈ max × worker 数，
     *   但远好于原 fail-open（Redis 挂=限流全失效、防刷裸奔）
     * - 业务正确性仍由 DB 行锁事务兜底，此处仅防滥用
     */
    this._memoryStore = new Map()
    this._memoryStoreLastSweep = 0

    // 限流配置预设
    this.presets = {
      // 全局API限流（阈值读 .env，唯一真相源；A1/A2：登录按 user、未登录按 ip）
      global: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000, // 默认1分钟窗口
        max: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX, 10) || 600, // 全局兜底，默认600
        keyPrefix: 'rate_limit:global:',
        message: '请求过于频繁，请稍后再试',
        keyGenerator: 'user_or_ip' // 登录按user_id、未登录回退IP
      },
      // 公开只读接口宽松档（campaigns/active + system/config + app-version + price/* + analytics/history）
      public_read: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000,
        max: parseInt(process.env.RATE_LIMIT_PUBLIC_READ_MAX, 10) || 300,
        keyPrefix: 'rate_limit:public_read:',
        message: '请求过于频繁，请稍后再试',
        keyGenerator: 'user_or_ip'
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
  createLimiter(options = {}) {
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
        /*
         * ✅ 测试环境限流开关（Systemic Fix）
         *
         * 业务场景：
         * - Jest/SuperTest 会在短时间内发起大量请求，用于验证业务契约与返回结构
         * - 若不关闭限流，会导致大量 429 干扰测试断言（例如本应返回 200/401 的接口被 429 覆盖）
         *
         * 约束：
         * - 仅在测试环境通过显式开关关闭，不影响生产/开发环境真实限流行为
         */
        if (process.env.DISABLE_RATE_LIMITER === 'true') {
          return next()
        }

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
          logger.warn('[RateLimiter] Redis主限流触发', {
            limiter_type: 'redis_primary',
            redis_status: 'connected',
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
          const resp = ApiResponse.error(
            config.message,
            'RATE_LIMIT_EXCEEDED',
            {
              limit: config.max,
              window_seconds: config.windowMs / 1000,
              retry_after: retryAfter,
              current: requestCount
            },
            429
          )
          resp.request_id = req.id || req.headers['x-request-id'] || `req_${crypto.randomUUID()}`
          // 补标准 HTTP Retry-After 头（秒），兼容标准 HTTP 客户端/SDK 识别
          res.setHeader('Retry-After', retryAfter)
          return res.status(429).json(resp)
        }

        // 4. 记录本次请求
        const requestId = `${now}_${crypto.randomUUID()}`
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
                logger.error('[RateLimiter] 移除请求记录失败:', error)
              }
            }

            return originalSend.call(this, body)
          }.bind(res)
        }

        next()
      } catch (error) {
        /*
         * R13/D8（Redis 不可用降级，2026-05-30）：
         * 原行为是 fail-open（直接 next() 放行）→ Redis 一挂限流全失效 = 防刷裸奔。
         * 改为降级到进程内内存滑动窗口兜底：Redis 异常时仍能粗粒度限流，不裸奔。
         * 仅兜底自身异常时才真正放行（极端情况，避免阻断业务）。
         */
        logger.error('[RateLimiter] Redis限流异常，降级到内存兜底', { error: error.message })

        try {
          const limitKey = this._generateKey(req, config)
          // 无法生成 key（如未登录用户访问用户级限流）→ 与主路径一致跳过限流
          if (!limitKey) {
            return next()
          }

          const now = Date.now()
          const { limited, count } = this._checkMemoryFallback(limitKey, config, now)

          if (limited) {
            if (config.onLimitReached) {
              config.onLimitReached(req, limitKey, count)
            }

            logger.warn('[RateLimiter] 内存兜底限流触发（Redis降级）', {
              limiter_type: 'memory_fallback',
              redis_status: 'unavailable',
              key: limitKey,
              current: count,
              limit: config.max,
              window_ms: config.windowMs,
              ip: req.ip,
              user_id: req.user?.user_id,
              path: req.path,
              method: req.method,
              timestamp: BeijingTimeHelper.now()
            })

            const resp = ApiResponse.error(
              config.message,
              'RATE_LIMIT_EXCEEDED',
              {
                limit: config.max,
                window_seconds: config.windowMs / 1000,
                retry_after: Math.ceil(config.windowMs / 1000),
                current: count,
                degraded: true // 标识：本次为 Redis 降级后的内存兜底限流
              },
              429
            )
            resp.request_id = req.id || req.headers['x-request-id'] || `req_${crypto.randomUUID()}`
            // 兜底路径同样补标准 Retry-After 头（内存兜底无精确最早时间，按整窗口给）
            res.setHeader('Retry-After', Math.ceil(config.windowMs / 1000))
            return res.status(429).json(resp)
          }

          return next()
        } catch (fallbackError) {
          // 兜底逻辑自身异常才放行（极端兜底，避免限流故障阻断正常业务）
          logger.error('[RateLimiter] 内存兜底限流异常，放行请求', {
            error: fallbackError.message,
            original_error: error.message
          })
          return next()
        }
      }
    }
  }

  /**
   * 内存兜底滑动窗口限流检查（R13/D8：Redis 不可用时降级使用）
   *
   * 业务场景：
   * - Redis 异常时，避免限流完全失效（fail-open 裸奔），用进程内 Map 做粗粒度限流
   * - cluster 下每 worker 各自计数，有效阈值 ≈ max × worker 数（粗粒度兜底，非精确）
   *
   * @param {string} limitKey - 限流 key
   * @param {Object} config - 限流配置（含 windowMs、max）
   * @param {number} now - 当前时间戳（毫秒）
   * @returns {{limited: boolean, count: number}} 是否超限及当前窗口内计数
   */
  _checkMemoryFallback(limitKey, config, now) {
    const windowStart = now - config.windowMs

    // 取该 key 的时间戳数组，过滤掉窗口外的旧记录（滑动窗口）
    const existing = this._memoryStore.get(limitKey) || []
    const timestamps = existing.filter(ts => ts > windowStart)
    const count = timestamps.length

    if (count >= config.max) {
      // 超限：写回过滤后的数组（不追加本次请求）
      this._memoryStore.set(limitKey, timestamps)
      this._sweepMemoryStoreIfNeeded(now)
      return { limited: true, count }
    }

    // 未超限：记录本次请求
    timestamps.push(now)
    this._memoryStore.set(limitKey, timestamps)
    this._sweepMemoryStoreIfNeeded(now)
    return { limited: false, count: count + 1 }
  }

  /**
   * 机会式清理内存兜底存储（避免 Map 无限增长）
   *
   * 设计：
   * - 每 60 秒最多扫一次，删除窗口外（2 分钟无活动）的空 key
   * - 仅在 Redis 故障期间会有数据，正常时 Map 为空、几乎零开销
   * - 不引入独立 setInterval/cron，避免增加维护面（随限流调用机会式触发）
   *
   * @param {number} now - 当前时间戳（毫秒）
   * @returns {void}
   */
  _sweepMemoryStoreIfNeeded(now) {
    if (now - this._memoryStoreLastSweep < 60 * 1000) {
      return
    }
    this._memoryStoreLastSweep = now

    // 兜底清理窗口固定 2 分钟（覆盖所有限流预设的最大窗口 1 分钟，留足余量）
    const sweepWindowStart = now - 2 * 60 * 1000
    for (const [key, timestamps] of this._memoryStore.entries()) {
      const fresh = timestamps.filter(ts => ts > sweepWindowStart)
      if (fresh.length === 0) {
        this._memoryStore.delete(key)
      } else if (fresh.length !== timestamps.length) {
        this._memoryStore.set(key, fresh)
      }
    }
  }

  /**
   * 生成限流key
   * @param {Object} req Express请求对象
   * @param {Object} config 限流配置
   * @returns {string|null} 限流key
   */
  _generateKey(req, config) {
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
        logger.debug('[RateLimiter] 未登录用户，跳过用户级限流')
        return null
      }
      return `${keyPrefix}user:${user_id}`
    }

    /*
     * 登录按 user、未登录按 ip（A1/A2 公开只读 + 全局兜底用）
     * 避免同一出口 IP（NAT/校园网/微信网关）下多个真实登录用户互相挤占 IP 桶。
     */
    if (keyGenerator === 'user_or_ip') {
      const user_id = req.user?.user_id
      if (user_id) {
        return `${keyPrefix}user:${user_id}`
      }
      const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'
      return `${keyPrefix}ip:${clientIP}`
    }

    // 按IP限流（默认）
    if (keyGenerator === 'ip') {
      const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'
      return `${keyPrefix}ip:${clientIP}`
    }

    // 未知的keyGenerator类型
    logger.warn(`[RateLimiter] 未知的keyGenerator类型: ${keyGenerator}`)
    return null
  }

  /**
   * 获取最早的请求时间
   * @param {string} key Redis key
   * @returns {Promise<number|null>} 最早请求的时间戳
   */
  async _getOldestRequestTime(key) {
    try {
      const client = await this.redisClient.ensureConnection()
      const result = await client.zrange(key, 0, 0, 'WITHSCORES')
      return result && result.length >= 2 ? parseFloat(result[1]) : null
    } catch (error) {
      logger.error('[RateLimiter] 获取最早请求时间失败:', error)
      return null
    }
  }

  /**
   * 使用SCAN命令迭代查询匹配的keys（替代KEYS命令）
   *
   * 业务场景：
   * - 生产环境中KEYS命令会阻塞Redis，影响所有请求
   * - SCAN命令是游标迭代，不阻塞Redis主线程
   *
   * 技术细节：
   * - COUNT参数只是建议值，实际返回数量可能不同
   * - 需要循环调用直到cursor为0
   * - 自动去重（Set结构）
   *
   * @private
   * @param {Object} client Redis客户端
   * @param {string} pattern 匹配模式（如 'rate_limit:*'）
   * @returns {Promise<Array<string>>} 匹配的keys数组
   */
  async _scanKeys(client, pattern) {
    const keys = new Set() // 使用Set自动去重
    let cursor = '0'

    try {
      do {
        /*
         * SCAN命令参数：cursor MATCH pattern COUNT count
         * 返回格式：[newCursor, [keys]]
         */
        const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100)

        cursor = result[0] // 下一次游标位置
        const matchedKeys = result[1] // 本批次匹配的keys

        // 将匹配的keys添加到Set中
        matchedKeys.forEach(key => keys.add(key))

        // cursor为'0'表示遍历完成
      } while (cursor !== '0')

      return Array.from(keys)
    } catch (error) {
      logger.error('[RateLimiter] SCAN命令执行失败:', error)
      throw error
    }
  }

  /**
   * 获取限流统计信息
   * @param {string} keyPattern key模式（如 'rate_limit:lottery:*'）
   * @returns {Promise<Object>} 统计信息
   */
  async getStats(keyPattern = 'rate_limit:*') {
    try {
      const client = await this.redisClient.ensureConnection()

      // ✅ 使用SCAN替代KEYS命令（避免生产环境阻塞）
      const keys = await this._scanKeys(client, keyPattern)

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
      logger.error('[RateLimiter] 获取统计信息失败:', error)
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
  async resetLimit(key) {
    try {
      await this.redisClient.del(key)
      logger.info(`[RateLimiter] 已重置限流: ${key}`)
      return true
    } catch (error) {
      logger.error('[RateLimiter] 重置限流失败:', error)
      return false
    }
  }

  /**
   * 清理所有限流数据
   * @param {string} keyPattern key模式
   * @returns {Promise<number>} 清理的key数量
   */
  async clearAll(keyPattern = 'rate_limit:*') {
    try {
      const client = await this.redisClient.ensureConnection()

      // ✅ 使用SCAN替代KEYS命令（避免生产环境阻塞）
      const keys = await this._scanKeys(client, keyPattern)

      if (keys.length === 0) {
        return 0
      }

      const pipeline = await this.redisClient.pipeline()
      keys.forEach(key => {
        pipeline.del(key)
      })
      await pipeline.exec()

      logger.info(`[RateLimiter] 已清理 ${keys.length} 个限流key`)
      return keys.length
    } catch (error) {
      logger.error('[RateLimiter] 清理限流数据失败:', error)
      return 0
    }
  }

  /**
   * 清理资源
   *
   * @returns {Promise<void>} 无返回值，用于应用退出时释放资源
   */
  async cleanup() {
    try {
      logger.info('[RateLimiter] 正在清理资源...')
      // Redis客户端由UnifiedRedisClient统一管理，这里不需要关闭
      logger.info('[RateLimiter] 资源清理完成')
    } catch (error) {
      logger.error('[RateLimiter] 资源清理失败:', error)
    }
  }
}

// 导出单例实例
let rateLimiterInstance = null

/**
 * 获取限流器单例实例
 * @returns {RateLimiterMiddleware} 限流器实例
 */
function getRateLimiter() {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiterMiddleware()
  }
  return rateLimiterInstance
}

module.exports = {
  RateLimiterMiddleware,
  getRateLimiter
}
