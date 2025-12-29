/**
 * ConcurrencyControlMiddleware 中间件测试套件
 * 🔧 V4版本 - 使用真实数据替代mock，测试实际业务逻辑
 * 更新时间：2025年09月23日 22:43:20 UTC
 */

const ConcurrencyControlMiddleware = require('../../middleware/ConcurrencyControlMiddleware.js')

describe('ConcurrencyControlMiddleware 中间件测试 - 真实业务逻辑', () => {
  let middleware
  const testUser = {
    user_id: 31, // 正确的user_id（手机号13612227930对应的用户ID）
    mobile: '13612227930',
    is_admin: false
  }

  beforeEach(() => {
    middleware = new ConcurrencyControlMiddleware()
  })

  afterAll(async () => {
    // 清理测试后的并发状态
    if (middleware && middleware.cleanup) {
      await middleware.cleanup()
    }
  })

  describe('🔐 用户并发控制测试', () => {
    test('✅ 未认证用户应该直接通过', async () => {
      const req = {
        user: null
      }
      const res = {
        statusCode: null,
        jsonData: null,
        status: function (code) {
          this.statusCode = code
          return this
        },
        json: function (data) {
          this.jsonData = data
          return this
        }
      }
      let nextCalled = false
      const next = () => {
        nextCalled = true
      }

      const limitMiddleware = middleware.limitUserConcurrency(5)
      await limitMiddleware(req, res, next)

      expect(nextCalled).toBe(true)
    })

    test('✅ 正常并发数量应该通过', async () => {
      const req = {
        user: testUser
      }
      const res = {
        statusCode: null,
        jsonData: null,
        status: function (code) {
          this.statusCode = code
          return this
        },
        json: function (data) {
          this.jsonData = data
          return this
        },
        on: function (_event, _callback) {
          // Mock EventEmitter方法
          return this
        }
      }
      let nextCalled = false
      const next = () => {
        nextCalled = true
      }

      const limitMiddleware = middleware.limitUserConcurrency(5)
      await limitMiddleware(req, res, next)

      expect(nextCalled).toBe(true)
    })

    test('❌ 超过并发限制应该被拒绝', async () => {
      const req = {
        user: testUser
      }
      const createRes = () => ({
        statusCode: null,
        jsonData: null,
        status: function (code) {
          this.statusCode = code
          return this
        },
        json: function (data) {
          this.jsonData = data
          return this
        },
        on: function (_event, _callback) {
          // Mock EventEmitter方法
          return this
        }
      })

      const limitMiddleware = middleware.limitUserConcurrency(2) // 设置较低的限制

      // 模拟多个并发请求
      const promises = []
      for (let i = 0; i < 3; i++) {
        const res = createRes()
        let nextCalled = false
        const next = () => {
          nextCalled = true
        }

        const executeRequest = async () => {
          await limitMiddleware(req, res, next)
          return {
            nextCalled,
            statusCode: res.statusCode,
            jsonData: res.jsonData
          }
        }
        promises.push(executeRequest())
      }

      const results = await Promise.all(promises)

      // 应该有一些请求被拒绝
      const rejectedRequests = results.filter(r => r.statusCode === 429)
      expect(rejectedRequests.length).toBeGreaterThan(0)
    })
  })

  describe('🔒 分布式锁测试', () => {
    test('✅ 分布式锁应该正常工作', async () => {
      const lockKey = 'test_resource'
      const ttl = 1000 // 1秒

      const lockAcquired = await middleware.lockManager.acquireLock(lockKey, ttl)
      expect(lockAcquired).toBeTruthy()
      expect(lockAcquired.resource).toBe('test_resource')

      // 尝试再次获取相同的锁应该失败
      const secondLock = await middleware.lockManager.acquireLock(lockKey, ttl)
      expect(secondLock).toBeFalsy()

      // 释放锁
      await middleware.lockManager.releaseLock(lockKey)

      // 释放后应该能再次获取
      const thirdLock = await middleware.lockManager.acquireLock(lockKey, ttl)
      expect(thirdLock).toBeTruthy()
      expect(thirdLock.resource).toBe('test_resource')

      // 清理
      await middleware.lockManager.releaseLock(lockKey)
    })

    test('🕐 锁应该在TTL过期后自动释放', async () => {
      const lockKey = 'test_expiry'
      const ttl = 100 // 100ms

      const lockAcquired = await middleware.lockManager.acquireLock(lockKey, ttl)
      expect(lockAcquired).toBeTruthy()
      expect(lockAcquired.resource).toBe('test_expiry')

      // 等待锁过期
      await new Promise(resolve => {
        setTimeout(resolve, 150)
      })

      // 锁过期后应该能再次获取
      const secondLock = await middleware.lockManager.acquireLock(lockKey, ttl)
      expect(secondLock).toBeTruthy()
      expect(secondLock.resource).toBe('test_expiry')

      // 清理
      await middleware.lockManager.releaseLock(lockKey)
    }, 10000) // 设置较长的测试超时时间
  })

  describe('🧹 资源清理测试', () => {
    test('✅ 中间件应该能正确清理资源', async () => {
      // 创建一些并发状态
      const req = {
        user: testUser
      }
      const res = {
        statusCode: null,
        status: function (code) {
          this.statusCode = code
          return this
        },
        json: function (data) {
          this.jsonData = data
          return this
        },
        on: function (_event, _callback) {
          // Mock EventEmitter方法
          return this
        }
      }
      let _nextCalled = false
      const next = () => {
        _nextCalled = true
      }

      const limitMiddleware = middleware.limitUserConcurrency(5)
      await limitMiddleware(req, res, next)

      // 清理资源
      expect(() => middleware.cleanup()).not.toThrow()
    })
  })
})
