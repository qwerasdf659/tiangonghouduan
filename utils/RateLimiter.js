/**
 * 请求限流器 V4
 * 统一使用UnifiedRedisClient，提供滑动窗口限流功能
 * 更新时间：2025/01/21
 */

const { getRawClient } = require('./UnifiedRedisClient')

class RateLimiter {
  constructor () {
    // 使用统一Redis客户端，消除重复连接
    this.client = getRawClient()
    console.log('[RateLimiter] 使用统一Redis客户端初始化完成')
  }

  /**
   * 滑动窗口限流算法
   * @param {string} key 限流key
   * @param {number} limit 限制数量
   * @param {number} windowMs 时间窗口(毫秒)
   * @returns {Promise<Object>} 限流结果
   */
  async slidingWindowLimiter (key, limit, windowMs) {
    const now = Date.now()
    const windowStart = now - windowMs

    try {
      const pipeline = this.client.pipeline()

      // 移除过期的记录
      pipeline.zremrangebyscore(key, 0, windowStart)

      // 添加当前请求
      pipeline.zadd(key, now, now)

      // 计算当前窗口内的请求数
      pipeline.zcard(key)

      // 设置过期时间
      pipeline.expire(key, Math.ceil(windowMs / 1000))

      const results = await pipeline.exec()

      if (results.some(result => result[0] !== null)) {
        throw new Error('Redis操作失败')
      }

      const requestCount = results[2][1]

      return {
        allowed: requestCount <= limit,
        count: requestCount,
        limit,
        remaining: Math.max(0, limit - requestCount),
        resetTime: now + windowMs,
        retryAfter: requestCount > limit ? Math.ceil(windowMs / 1000) : 0
      }
    } catch (error) {
      console.error('[RateLimiter] 滑动窗口限流失败:', error)
      // 限流器失败时允许请求通过，避免服务不可用
      return {
        allowed: true,
        count: 0,
        limit,
        remaining: limit,
        resetTime: now + windowMs,
        retryAfter: 0,
        error: error.message
      }
    }
  }

  /**
   * 令牌桶限流算法
   * @param {string} key 限流key
   * @param {number} capacity 桶容量
   * @param {number} refillRate 补充速率(令牌/秒)
   * @param {number} tokens 请求令牌数，默认1
   * @returns {Promise<Object>} 限流结果
   */
  async tokenBucketLimiter (key, capacity, refillRate, tokens = 1) {
    const now = Date.now()

    // Lua脚本实现原子性令牌桶操作
    const luaScript = `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refill_rate = tonumber(ARGV[2])
      local requested_tokens = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])
      
      local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
      local tokens = tonumber(bucket[1]) or capacity
      local last_refill = tonumber(bucket[2]) or now
      
      -- 计算需要补充的令牌数
      local time_passed = (now - last_refill) / 1000
      local tokens_to_add = math.floor(time_passed * refill_rate)
      tokens = math.min(capacity, tokens + tokens_to_add)
      
      local allowed = tokens >= requested_tokens
      if allowed then
        tokens = tokens - requested_tokens
      end
      
      -- 更新桶状态
      redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
      redis.call('EXPIRE', key, 3600) -- 1小时过期
      
      return {allowed and 1 or 0, tokens, capacity - tokens}
    `

    try {
      const result = await this.client.eval(luaScript, 1, key, capacity, refillRate, tokens, now)
      const [allowed, remainingTokens, usedTokens] = result

      return {
        allowed: allowed === 1,
        tokens: remainingTokens,
        capacity,
        used: usedTokens,
        refillRate,
        retryAfter: allowed === 0 ? Math.ceil(tokens / refillRate) : 0
      }
    } catch (error) {
      console.error('[RateLimiter] 令牌桶限流失败:', error)
      // 限流器失败时允许请求通过
      return {
        allowed: true,
        tokens: capacity,
        capacity,
        used: 0,
        refillRate,
        retryAfter: 0,
        error: error.message
      }
    }
  }

  /**
   * 固定窗口限流算法
   * @param {string} key 限流key
   * @param {number} limit 限制数量
   * @param {number} windowMs 时间窗口(毫秒)
   * @returns {Promise<Object>} 限流结果
   */
  async fixedWindowLimiter (key, limit, windowMs) {
    const now = Date.now()
    const windowId = Math.floor(now / windowMs)
    const windowKey = `${key}:${windowId}`

    try {
      const pipeline = this.client.pipeline()

      // 增加计数器
      pipeline.incr(windowKey)
      // 设置过期时间
      pipeline.expire(windowKey, Math.ceil(windowMs / 1000))

      const results = await pipeline.exec()

      if (results.some(result => result[0] !== null)) {
        throw new Error('Redis操作失败')
      }

      const count = results[0][1]
      const windowStart = windowId * windowMs
      const windowEnd = windowStart + windowMs

      return {
        allowed: count <= limit,
        count,
        limit,
        remaining: Math.max(0, limit - count),
        resetTime: windowEnd,
        retryAfter: count > limit ? Math.ceil((windowEnd - now) / 1000) : 0,
        windowStart,
        windowEnd
      }
    } catch (error) {
      console.error('[RateLimiter] 固定窗口限流失败:', error)
      return {
        allowed: true,
        count: 0,
        limit,
        remaining: limit,
        resetTime: now + windowMs,
        retryAfter: 0,
        error: error.message
      }
    }
  }

  /**
   * 创建Express中间件
   * @param {Object} options 配置选项
   * @returns {Function} Express中间件函数
   */
  createMiddleware (options = {}) {
    const {
      algorithm = 'sliding', // sliding, token, fixed
      keyGenerator = req => req.ip,
      ...algorithmOptions
    } = options

    return async (req, res, next) => {
      try {
        const key = `rate_limit:${keyGenerator(req)}`
        let result

        switch (algorithm) {
        case 'sliding':
          result = await this.slidingWindowLimiter(
            key,
            algorithmOptions.limit || 100,
            algorithmOptions.windowMs || 60000
          )
          break
        case 'token':
          result = await this.tokenBucketLimiter(
            key,
            algorithmOptions.capacity || 100,
            algorithmOptions.refillRate || 10
          )
          break
        case 'fixed':
          result = await this.fixedWindowLimiter(
            key,
            algorithmOptions.limit || 100,
            algorithmOptions.windowMs || 60000
          )
          break
        default:
          throw new Error(`未知的限流算法: ${algorithm}`)
        }

        // 设置响应头
        res.set({
          'X-RateLimit-Limit': result.limit || result.capacity,
          'X-RateLimit-Remaining': result.remaining || result.tokens,
          'X-RateLimit-Reset': result.resetTime || Date.now()
        })

        if (!result.allowed) {
          res.set('Retry-After', result.retryAfter)
          return res.status(429).json({
            code: -1,
            msg: '请求过于频繁，请稍后再试',
            data: null,
            rateLimit: result
          })
        }

        next()
      } catch (error) {
        console.error('[RateLimiter] 中间件错误:', error)
        // 限流器错误时允许请求通过
        next()
      }
    }
  }

  /**
   * 重置限流计数器
   * @param {string} key 限流key
   * @returns {Promise<boolean>} 是否成功重置
   */
  async resetLimit (key) {
    try {
      const deletedKeys = await this.client.del(key)
      return deletedKeys > 0
    } catch (error) {
      console.error('[RateLimiter] 重置限流失败:', error)
      return false
    }
  }

  /**
   * 获取限流状态
   * @param {string} key 限流key
   * @returns {Promise<Object|null>} 限流状态
   */
  async getLimitStatus (key) {
    try {
      const exists = await this.client.exists(key)
      if (!exists) {
        return null
      }

      const type = await this.client.type(key)

      if (type === 'zset') {
        // 滑动窗口
        const count = await this.client.zcard(key)
        const ttl = await this.client.ttl(key)
        return {
          type: 'sliding',
          count,
          ttl
        }
      } else if (type === 'hash') {
        // 令牌桶
        const bucket = await this.client.hgetall(key)
        return {
          type: 'token',
          tokens: parseInt(bucket.tokens) || 0,
          lastRefill: parseInt(bucket.last_refill) || 0
        }
      } else if (type === 'string') {
        // 固定窗口
        const count = await this.client.get(key)
        const ttl = await this.client.ttl(key)
        return {
          type: 'fixed',
          count: parseInt(count) || 0,
          ttl
        }
      }

      return null
    } catch (error) {
      console.error('[RateLimiter] 获取限流状态失败:', error)
      return null
    }
  }
}

module.exports = RateLimiter
