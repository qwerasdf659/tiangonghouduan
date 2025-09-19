/**
 * Redis专项性能测试 - V4.0统一引擎架构
 * 测试内容：缓存性能、数据一致性测试
 * 创建时间：2025年08月23日 19:30:06
 */

const Redis = require('ioredis')

// Redis客户端配置
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  db: process.env.REDIS_DB || 0,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  connectTimeout: 10000,
  commandTimeout: 5000
})

describe('Redis性能专项测试', () => {
  const testPhoneNumber = '13612227930'
  const testData = {
    user_id: testPhoneNumber,
    test_data: 'performance_test_data',
    timestamp: Date.now()
  }

  beforeAll(async () => {
    // 确保Redis连接正常
    await redis.ping()
  })

  afterAll(async () => {
    // 清理测试数据
    await redis.del('test:*')
    await redis.quit()
  })

  describe('基础性能测试', () => {
    test('Redis连接测试', async () => {
      const result = await redis.ping()
      expect(result).toBe('PONG')
    })

    test('基础读写性能测试', async () => {
      const startTime = Date.now()

      // 写入测试
      await redis.set('test:performance:write', JSON.stringify(testData))

      // 读取测试
      const result = await redis.get('test:performance:write')
      const parsedResult = JSON.parse(result)

      const endTime = Date.now()
      const duration = endTime - startTime

      expect(parsedResult.user_id).toBe(testPhoneNumber)
      expect(duration).toBeLessThan(100) // 应该在100ms内完成
    })

    test('批量操作性能测试', async () => {
      const startTime = Date.now()
      const pipeline = redis.pipeline()

      // 批量写入100条数据
      for (let i = 0; i < 100; i++) {
        pipeline.set(`test:batch:${i}`, JSON.stringify({ ...testData, index: i }))
      }

      await pipeline.exec()

      // 批量读取
      const keys = Array.from({ length: 100 }, (_, i) => `test:batch:${i}`)
      const results = await redis.mget(keys)

      const endTime = Date.now()
      const duration = endTime - startTime

      expect(results.length).toBe(100)
      expect(results.every(r => r !== null)).toBe(true)
      expect(duration).toBeLessThan(1000) // 应该在1秒内完成
    })
  })

  describe('缓存策略性能测试', () => {
    test('TTL过期测试', async () => {
      // 设置1秒过期的键
      await redis.setex('test:ttl:short', 1, JSON.stringify(testData))

      // 立即检查存在
      let result = await redis.get('test:ttl:short')
      expect(result).not.toBeNull()

      // 等待2秒后检查过期
      await new Promise(resolve => setTimeout(resolve, 2000))
      result = await redis.get('test:ttl:short')
      expect(result).toBeNull()
    })
  })
})
