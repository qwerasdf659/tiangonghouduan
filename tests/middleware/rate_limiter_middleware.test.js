/**
 * RateLimiterMiddleware 中间件测试套件
 * 🔧 V4版本 - 测试API请求频率限制功能
 * 创建时间：2025年10月12日 北京时间
 * 🔴 P0-1修复（2026-01-08）：移除硬编码 user_id=31，从 global.testData 动态获取
 */

// 🔧 本套件需要真实验证 429 行为，必须显式开启限流（全局测试环境会默认关闭以避免干扰其他业务测试）
process.env.DISABLE_RATE_LIMITER = 'false'

const { getRateLimiter } = require('../../middleware/RateLimiterMiddleware')
const { getRedisClient } = require('../../utils/UnifiedRedisClient')

describe('RateLimiterMiddleware 中间件测试 - 请求频率限制', () => {
  let rateLimiter
  let redisClient
  // 🔴 P0-1修复：testUser 在 beforeAll 中初始化
  let testUser

  beforeAll(async () => {
    rateLimiter = getRateLimiter()
    redisClient = getRedisClient()
    await redisClient.ensureConnection()
    // 🔴 P0-1修复：从 global.testData 获取动态测试用户ID
    testUser = {
      user_id: global.testData?.testUser?.user_id, // 🔴 P0-1修复：动态获取
      mobile: '13612227930'
    }
    if (!testUser.user_id) {
      console.warn('⚠️ [rate_limiter_middleware.test.js] testUser.user_id 未初始化')
    }
  })

  beforeEach(async () => {
    // 清理测试数据
    await rateLimiter.clearAll('rate_limit:test:*')
  })

  afterAll(async () => {
    // 清理所有测试数据
    await rateLimiter.clearAll('rate_limit:test:*')
    await rateLimiter.cleanup()
  })

  // 创建Mock请求和响应对象的辅助函数
  function createMockReqRes(options = {}) {
    const req = {
      user: options.user || null,
      ip: options.ip || '127.0.0.1',
      path: options.path || '/test',
      method: options.method || 'GET',
      connection: { remoteAddress: '127.0.0.1' },
      headers: options.headers || {}, // 添加 headers 属性防止 undefined 访问错误
      id: options.id || null // 添加 id 属性
    }

    const res = {
      statusCode: null,
      jsonData: null,
      headers: {},
      status: function (code) {
        this.statusCode = code
        return this
      },
      json: function (data) {
        this.jsonData = data
        return this
      },
      setHeader: function (name, value) {
        this.headers[name] = value
      },
      send: function (_body) {
        return this
      }
    }

    const mockState = { nextCalled: false }
    const next = () => {
      mockState.nextCalled = true
    }

    return { req, res, next, mockState }
  }

  describe('🔐 基础限流功能测试', () => {
    test('✅ 请求数未达到限制应该通过', async () => {
      const limiter = rateLimiter.createLimiter({
        windowMs: 60 * 1000,
        max: 5,
        keyPrefix: 'rate_limit:test:basic:',
        keyGenerator: 'ip'
      })

      const { req, res, next, mockState } = createMockReqRes()
      await limiter(req, res, next)

      expect(mockState.nextCalled).toBe(true)
      expect(res.statusCode).toBeNull()
      expect(res.headers['X-RateLimit-Limit']).toBe(5)
      expect(res.headers['X-RateLimit-Remaining']).toBeGreaterThanOrEqual(0)
    })

    test('❌ 请求数达到限制应该被拒绝', async () => {
      const limiter = rateLimiter.createLimiter({
        windowMs: 60 * 1000,
        max: 3,
        keyPrefix: 'rate_limit:test:limit:',
        keyGenerator: 'ip'
      })

      // 连续发送4个请求
      for (let i = 0; i < 4; i++) {
        const { req: r, res: s, next: n } = createMockReqRes()
        await limiter(r, s, n)

        if (i < 3) {
          // 前3个请求应该通过
          expect(s.statusCode).toBeNull()
        } else {
          // 第4个请求应该被拒绝
          expect(s.statusCode).toBe(429)
          expect(s.jsonData).toBeTruthy()
          // ApiResponse.error 返回的格式中使用 error_code 字段
          expect(s.jsonData.error_code || s.jsonData.code).toBe('RATE_LIMIT_EXCEEDED')
          expect(s.jsonData.data.limit).toBe(3)
        }
      }
    })

    test('✅ 限流响应头应该包含正确信息', async () => {
      const limiter = rateLimiter.createLimiter({
        windowMs: 60 * 1000,
        max: 10,
        keyPrefix: 'rate_limit:test:headers:',
        keyGenerator: 'ip'
      })

      const { req, res, next } = createMockReqRes()
      await limiter(req, res, next)

      expect(res.headers['X-RateLimit-Limit']).toBe(10)
      expect(res.headers['X-RateLimit-Remaining']).toBe(9)
      expect(res.headers['X-RateLimit-Reset']).toBeTruthy()
    })
  })

  describe('🔐 按用户限流测试', () => {
    test('✅ 按用户ID限流应该正确工作', async () => {
      const limiter = rateLimiter.createLimiter({
        windowMs: 60 * 1000,
        max: 3,
        keyPrefix: 'rate_limit:test:user:',
        keyGenerator: 'user'
      })

      // 用户1发送3个请求
      for (let i = 0; i < 3; i++) {
        const { req, res, next } = createMockReqRes({ user: testUser })
        await limiter(req, res, next)
        expect(res.statusCode).toBeNull() // 前3个应该通过
      }

      // 用户1的第4个请求应该被拒绝
      const { req: req4, res: res4, next: next4 } = createMockReqRes({ user: testUser })
      await limiter(req4, res4, next4)
      expect(res4.statusCode).toBe(429)
    })

    test('✅ 未登录用户应该跳过用户级限流', async () => {
      const limiter = rateLimiter.createLimiter({
        windowMs: 60 * 1000,
        max: 2,
        keyPrefix: 'rate_limit:test:user_skip:',
        keyGenerator: 'user'
      })

      const { req, res, next, mockState } = createMockReqRes({ user: null })
      await limiter(req, res, next)

      expect(mockState.nextCalled).toBe(true)
      expect(res.statusCode).toBeNull() // 应该跳过限流
    })

    test('✅ 不同用户应该有独立的限流计数', async () => {
      const limiter = rateLimiter.createLimiter({
        windowMs: 60 * 1000,
        max: 2,
        keyPrefix: 'rate_limit:test:multi_user:',
        keyGenerator: 'user'
      })

      // 🔴 P0-1修复：user1 使用动态测试用户ID
      const user1 = { user_id: testUser.user_id, mobile: '13612227930' }
      // user2 使用虚拟用户ID（仅测试隔离性，无需真实数据库记录）
      const user2 = { user_id: (testUser.user_id || 31) + 1, mobile: '13612227931' }

      // 用户1发送2个请求
      for (let i = 0; i < 2; i++) {
        const { req, res, next } = createMockReqRes({ user: user1 })
        await limiter(req, res, next)
        expect(res.statusCode).toBeNull()
      }

      // 用户2应该仍然可以发送请求
      const { req: reqU2, res: resU2, next: nextU2 } = createMockReqRes({ user: user2 })
      await limiter(reqU2, resU2, nextU2)
      expect(resU2.statusCode).toBeNull()
    })
  })

  describe('🔐 按IP限流测试', () => {
    test('✅ 按IP限流应该正确工作', async () => {
      const limiter = rateLimiter.createLimiter({
        windowMs: 60 * 1000,
        max: 3,
        keyPrefix: 'rate_limit:test:ip:',
        keyGenerator: 'ip'
      })

      // 同一IP发送3个请求
      for (let i = 0; i < 3; i++) {
        const { req, res, next } = createMockReqRes({ ip: '192.168.1.100' })
        await limiter(req, res, next)
        expect(res.statusCode).toBeNull()
      }

      // 第4个请求应该被拒绝
      const { req: req4, res: res4, next: next4 } = createMockReqRes({ ip: '192.168.1.100' })
      await limiter(req4, res4, next4)
      expect(res4.statusCode).toBe(429)
    })

    test('✅ 不同IP应该有独立的限流计数', async () => {
      const limiter = rateLimiter.createLimiter({
        windowMs: 60 * 1000,
        max: 2,
        keyPrefix: 'rate_limit:test:multi_ip:',
        keyGenerator: 'ip'
      })

      // IP1发送2个请求
      for (let i = 0; i < 2; i++) {
        const { req, res, next } = createMockReqRes({ ip: '192.168.1.100' })
        await limiter(req, res, next)
        expect(res.statusCode).toBeNull()
      }

      // IP2应该仍然可以发送请求
      const { req: reqIP2, res: resIP2, next: nextIP2 } = createMockReqRes({ ip: '192.168.1.101' })
      await limiter(reqIP2, resIP2, nextIP2)
      expect(resIP2.statusCode).toBeNull()
    })
  })

  describe('🔐 滑动窗口测试', () => {
    test('✅ 滑动窗口应该正确清理过期请求', async () => {
      const limiter = rateLimiter.createLimiter({
        windowMs: 2000, // 2秒窗口（测试用）
        max: 2,
        keyPrefix: 'rate_limit:test:window:',
        keyGenerator: 'ip'
      })

      // 发送2个请求
      for (let i = 0; i < 2; i++) {
        const { req, res, next } = createMockReqRes()
        await limiter(req, res, next)
        expect(res.statusCode).toBeNull()
      }

      // 第3个请求应该被拒绝
      const { req: req3, res: res3, next: next3 } = createMockReqRes()
      await limiter(req3, res3, next3)
      expect(res3.statusCode).toBe(429)

      // 等待窗口过期（2.5秒）
      await new Promise(resolve => setTimeout(resolve, 2500))

      // 现在应该可以再次请求
      const { req: req4, res: res4, next: next4 } = createMockReqRes()
      await limiter(req4, res4, next4)
      expect(res4.statusCode).toBeNull()
    }, 10000) // 增加超时时间到10秒
  })

  describe('🔐 抽奖限流预设配置测试', () => {
    test('✅ 抽奖限流预设应该正确工作', async () => {
      // 使用抽奖预设配置
      const limiter = rateLimiter.createLimiter('lottery')

      // 发送20个请求（限制是20次/分钟）
      for (let i = 0; i < 20; i++) {
        const { req, res, next } = createMockReqRes({ user: testUser })
        await limiter(req, res, next)
        expect(res.statusCode).toBeNull()
      }

      // 第21个请求应该被拒绝
      const { req: req21, res: res21, next: next21 } = createMockReqRes({ user: testUser })
      await limiter(req21, res21, next21)
      expect(res21.statusCode).toBe(429)
      expect(res21.jsonData.message).toContain('抽奖过于频繁')
    })
  })

  describe('🔐 限流统计功能测试', () => {
    test('✅ 应该能获取限流统计信息', async () => {
      const limiter = rateLimiter.createLimiter({
        windowMs: 60 * 1000,
        max: 10,
        keyPrefix: 'rate_limit:test:stats:',
        keyGenerator: 'ip'
      })

      // 发送几个请求
      for (let i = 0; i < 3; i++) {
        const { req, res, next } = createMockReqRes()
        await limiter(req, res, next)
      }

      // 获取统计信息
      const stats = await rateLimiter.getStats('rate_limit:test:stats:*')

      expect(stats).toBeTruthy()
      expect(stats.total_keys).toBeGreaterThan(0)
      expect(stats.keys.length).toBeGreaterThan(0)
      expect(stats.keys[0]).toHaveProperty('key')
      expect(stats.keys[0]).toHaveProperty('request_count')
      expect(stats.keys[0]).toHaveProperty('ttl_seconds')
    })

    test('✅ 应该能重置特定key的限流', async () => {
      const limiter = rateLimiter.createLimiter({
        windowMs: 60 * 1000,
        max: 2,
        keyPrefix: 'rate_limit:test:reset:',
        keyGenerator: 'ip'
      })

      const testIP = '192.168.1.200'

      // 发送2个请求
      for (let i = 0; i < 2; i++) {
        const { req, res, next } = createMockReqRes({ ip: testIP })
        await limiter(req, res, next)
      }

      // 第3个请求应该被拒绝
      const { req: req3, res: res3, next: next3 } = createMockReqRes({ ip: testIP })
      await limiter(req3, res3, next3)
      expect(res3.statusCode).toBe(429)

      // 重置限流
      const resetKey = `rate_limit:test:reset:ip:${testIP}`
      const resetResult = await rateLimiter.resetLimit(resetKey)
      expect(resetResult).toBe(true)

      // 现在应该可以再次请求
      const { req: req4, res: res4, next: next4 } = createMockReqRes({ ip: testIP })
      await limiter(req4, res4, next4)
      expect(res4.statusCode).toBeNull()
    })
  })

  describe('🔐 自定义key生成器测试', () => {
    test('✅ 自定义key生成器应该正确工作', async () => {
      const limiter = rateLimiter.createLimiter({
        windowMs: 60 * 1000,
        max: 2,
        keyPrefix: 'rate_limit:test:custom:',
        keyGenerator: req => {
          // 按路径限流
          return `path:${req.path}`
        }
      })

      // 同一路径发送2个请求
      for (let i = 0; i < 2; i++) {
        const { req, res, next } = createMockReqRes({ path: '/test/api' })
        await limiter(req, res, next)
        expect(res.statusCode).toBeNull()
      }

      // 第3个请求应该被拒绝
      const { req: req3, res: res3, next: next3 } = createMockReqRes({ path: '/test/api' })
      await limiter(req3, res3, next3)
      expect(res3.statusCode).toBe(429)

      // 不同路径应该可以请求
      const {
        req: reqOther,
        res: resOther,
        next: nextOther
      } = createMockReqRes({ path: '/other/api' })
      await limiter(reqOther, resOther, nextOther)
      expect(resOther.statusCode).toBeNull()
    })
  })
})
