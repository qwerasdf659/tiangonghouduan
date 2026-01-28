/**
 * Mock Redis 工具单元测试
 *
 * @description 验证 test-mock-redis.js 中所有新增功能的正确性
 * @version V4.7 - 完整 UnifiedRedisClient 兼容测试
 * @date 2026-01-28
 *
 * @file tests/unit/mock-redis.test.js
 */

'use strict'

const {
  MockRedisClient,
  MockMulti: _MockMulti, // 通过 mockClient.multi() 创建，间接测试
  MockPipeline: _MockPipeline, // 通过 mockClient.pipeline() 创建，间接测试
  MockUnifiedRedisClient: _MockUnifiedRedisClient, // 通过 createMockUnifiedRedisClient() 创建
  CircuitBreakerTestController,
  REDIS_STATUS,
  REDIS_FAULT_TYPE,
  createMockUnifiedRedisClient,
  createJestMockModule,
  createHealthChecker
} = require('../helpers/test-mock-redis')

describe('【单元测试】Mock Redis 工具', () => {
  // ==================== MockRedisClient 基础测试 ====================
  describe('MockRedisClient 基础操作', () => {
    let mockClient

    beforeEach(() => {
      mockClient = new MockRedisClient()
    })

    afterEach(() => {
      mockClient.reset()
    })

    test('初始状态应为 CONNECTED', () => {
      expect(mockClient.status).toBe(REDIS_STATUS.CONNECTED)
    })

    test('set/get 操作正常工作', async () => {
      await mockClient.set('test_key', 'test_value')
      const value = await mockClient.get('test_key')
      expect(value).toBe('test_value')
    })

    test('del 操作正常工作', async () => {
      await mockClient.set('key1', 'value1')
      await mockClient.set('key2', 'value2')
      const deleted = await mockClient.del('key1', 'key2')
      expect(deleted).toBe(2)
      expect(await mockClient.get('key1')).toBeNull()
    })

    test('exists 操作正常工作', async () => {
      await mockClient.set('exists_key', 'value')
      expect(await mockClient.exists('exists_key')).toBe(1)
      expect(await mockClient.exists('nonexistent_key')).toBe(0)
    })

    test('setex 操作正常工作', async () => {
      const result = await mockClient.setex('ttl_key', 60, 'ttl_value')
      expect(result).toBe('OK')
      expect(await mockClient.get('ttl_key')).toBe('ttl_value')
    })

    test('setnx 操作正常工作', async () => {
      // 键不存在时设置成功
      const result1 = await mockClient.setnx('nx_key', 'value1')
      expect(result1).toBe(1)
      expect(await mockClient.get('nx_key')).toBe('value1')

      // 键已存在时设置失败
      const result2 = await mockClient.setnx('nx_key', 'value2')
      expect(result2).toBe(0)
      expect(await mockClient.get('nx_key')).toBe('value1')
    })

    test('incr/incrby 操作正常工作', async () => {
      // incr 从 0 开始
      const incr1 = await mockClient.incr('counter')
      expect(incr1).toBe(1)

      // incrby
      const incr2 = await mockClient.incrby('counter', 5)
      expect(incr2).toBe(6)
    })

    test('ping 操作返回 PONG', async () => {
      const result = await mockClient.ping()
      expect(result).toBe('PONG')
    })
  })

  // ==================== Hash 操作测试 ====================
  describe('MockRedisClient Hash 操作', () => {
    let mockClient

    beforeEach(() => {
      mockClient = new MockRedisClient()
    })

    test('hset/hget 操作正常工作', async () => {
      const result = await mockClient.hset('hash_key', 'field1', 'value1')
      expect(result).toBe(1) // 新字段

      const value = await mockClient.hget('hash_key', 'field1')
      expect(value).toBe('value1')

      // 更新已存在字段
      const result2 = await mockClient.hset('hash_key', 'field1', 'value2')
      expect(result2).toBe(0) // 已存在字段
    })

    test('hgetall 操作正常工作', async () => {
      await mockClient.hset('hash_key', 'field1', 'value1')
      await mockClient.hset('hash_key', 'field2', 'value2')

      const hash = await mockClient.hgetall('hash_key')
      expect(hash).toEqual({ field1: 'value1', field2: 'value2' })
    })

    test('hdel 操作正常工作', async () => {
      await mockClient.hset('hash_key', 'field1', 'value1')
      const deleted = await mockClient.hdel('hash_key', 'field1')
      expect(deleted).toBe(1)

      const value = await mockClient.hget('hash_key', 'field1')
      expect(value).toBeNull()
    })
  })

  // ==================== 有序集合操作测试 ====================
  describe('MockRedisClient 有序集合操作', () => {
    let mockClient

    beforeEach(() => {
      mockClient = new MockRedisClient()
    })

    test('zadd 操作正常工作', async () => {
      const result1 = await mockClient.zadd('zset_key', 100, 'member1')
      expect(result1).toBe(1) // 新成员

      const result2 = await mockClient.zadd('zset_key', 200, 'member1')
      expect(result2).toBe(0) // 已存在成员（更新分数）
    })

    test('zcard 操作正常工作', async () => {
      await mockClient.zadd('zset_key', 100, 'member1')
      await mockClient.zadd('zset_key', 200, 'member2')

      const count = await mockClient.zcard('zset_key')
      expect(count).toBe(2)
    })

    test('zcount 操作正常工作', async () => {
      await mockClient.zadd('zset_key', 50, 'member1')
      await mockClient.zadd('zset_key', 100, 'member2')
      await mockClient.zadd('zset_key', 150, 'member3')
      await mockClient.zadd('zset_key', 200, 'member4')

      const count = await mockClient.zcount('zset_key', 100, 200)
      expect(count).toBe(3) // member2, member3, member4
    })

    test('zremrangebyscore 操作正常工作', async () => {
      await mockClient.zadd('zset_key', 50, 'member1')
      await mockClient.zadd('zset_key', 100, 'member2')
      await mockClient.zadd('zset_key', 150, 'member3')

      const removed = await mockClient.zremrangebyscore('zset_key', 0, 100)
      expect(removed).toBe(2) // member1, member2

      const remaining = await mockClient.zcard('zset_key')
      expect(remaining).toBe(1) // member3
    })
  })

  // ==================== Multi/Pipeline 测试 ====================
  describe('MockMulti 事务操作', () => {
    let mockClient

    beforeEach(() => {
      mockClient = new MockRedisClient()
    })

    test('multi().set().get().exec() 链式调用', async () => {
      const multi = await mockClient.multi()
      multi.set('key1', 'value1')
      multi.set('key2', 'value2')
      multi.get('key1')

      const results = await multi.exec()
      expect(results).toHaveLength(3)
      expect(results[0]).toEqual([null, 'OK'])
      expect(results[1]).toEqual([null, 'OK'])
      expect(results[2]).toEqual([null, 'value1'])
    })

    test('multi().incr().incrby().exec() 链式调用', async () => {
      await mockClient.set('counter', '10')

      const multi = await mockClient.multi()
      multi.incr('counter')
      multi.incrby('counter', 5)

      const results = await multi.exec()
      expect(results[0]).toEqual([null, 11])
      expect(results[1]).toEqual([null, 16])
    })
  })

  describe('MockPipeline 管道操作', () => {
    let mockClient

    beforeEach(() => {
      mockClient = new MockRedisClient()
    })

    test('pipeline().set().get().exec() 链式调用', async () => {
      const pipeline = await mockClient.pipeline()
      pipeline.set('pipe_key', 'pipe_value')
      pipeline.get('pipe_key')

      const results = await pipeline.exec()
      expect(results).toHaveLength(2)
      expect(results[0]).toEqual([null, 'OK'])
      expect(results[1]).toEqual([null, 'pipe_value'])
    })
  })

  // ==================== 故障模拟测试 ====================
  describe('MockRedisClient 故障模拟', () => {
    let mockClient

    beforeEach(() => {
      mockClient = new MockRedisClient()
    })

    test('simulateDisconnect 后操作应抛出错误', async () => {
      mockClient.simulateDisconnect()
      expect(mockClient.status).toBe(REDIS_STATUS.DISCONNECTED)

      await expect(mockClient.get('key')).rejects.toThrow()
    })

    test('simulateError 后操作应抛出指定类型错误', async () => {
      mockClient.simulateError(REDIS_FAULT_TYPE.TIMEOUT)
      expect(mockClient.status).toBe(REDIS_STATUS.ERROR)

      await expect(mockClient.get('key')).rejects.toThrow('Redis connection timed out')
    })

    test('setFaultRate 应产生随机故障', async () => {
      mockClient.setFaultRate(1.0) // 100% 故障率

      await expect(mockClient.get('key')).rejects.toThrow()
    })

    test('simulateConnect 应恢复正常', async () => {
      mockClient.simulateDisconnect()
      mockClient.simulateConnect()

      expect(mockClient.status).toBe(REDIS_STATUS.CONNECTED)
      const result = await mockClient.ping()
      expect(result).toBe('PONG')
    })

    test('reset 应重置所有状态', async () => {
      mockClient.simulateDisconnect()
      mockClient.setLatency(1000)
      mockClient.setFaultRate(0.5)

      mockClient.reset()

      expect(mockClient.status).toBe(REDIS_STATUS.CONNECTED)
      expect(mockClient._latency_ms).toBe(0)
      expect(mockClient._fault_rate).toBe(0)
    })
  })

  // ==================== MockUnifiedRedisClient 测试 ====================
  describe('MockUnifiedRedisClient 完整兼容性', () => {
    let mockUnified

    beforeEach(() => {
      mockUnified = createMockUnifiedRedisClient()
    })

    afterEach(() => {
      mockUnified.reset()
    })

    test('getClient/getPubClient/getSubClient 应返回 MockRedisClient', () => {
      const client = mockUnified.getClient()
      expect(client).toBeInstanceOf(MockRedisClient)

      const pubClient = mockUnified.getPubClient()
      expect(pubClient).toBeInstanceOf(MockRedisClient)

      const subClient = mockUnified.getSubClient()
      expect(subClient).toBeInstanceOf(MockRedisClient)
    })

    test('set/get 操作（带 TTL）', async () => {
      await mockUnified.set('key', 'value', 60)
      const value = await mockUnified.get('key')
      expect(value).toBe('value')
    })

    test('healthCheck 应返回正确状态', async () => {
      expect(await mockUnified.healthCheck()).toBe(true)

      mockUnified.simulateDisconnect()
      expect(await mockUnified.healthCheck()).toBe(false)
    })

    test('getStatus 应返回完整状态对象', () => {
      const status = mockUnified.getStatus()
      expect(status).toHaveProperty('isConnected')
      expect(status).toHaveProperty('config')
      expect(status).toHaveProperty('clients')
      expect(status.config).toHaveProperty('host')
      expect(status.config).toHaveProperty('port')
    })

    test('所有代理方法应正常工作', async () => {
      // 基础操作
      await mockUnified.set('key', 'value')
      expect(await mockUnified.get('key')).toBe('value')
      expect(await mockUnified.exists('key')).toBe(1)
      await mockUnified.del('key')
      expect(await mockUnified.exists('key')).toBe(0)

      // Hash 操作
      await mockUnified.hset('hash', 'field', 'value')
      expect(await mockUnified.hget('hash', 'field')).toBe('value')
      expect(await mockUnified.hgetall('hash')).toEqual({ field: 'value' })
      await mockUnified.hdel('hash', 'field')
      expect(await mockUnified.hget('hash', 'field')).toBeNull()

      // 有序集合操作
      await mockUnified.zadd('zset', 100, 'member1')
      expect(await mockUnified.zcard('zset')).toBe(1)
      expect(await mockUnified.zcount('zset', 0, 200)).toBe(1)
      await mockUnified.zremrangebyscore('zset', 0, 200)
      expect(await mockUnified.zcard('zset')).toBe(0)
    })
  })

  // ==================== Jest Mock 模块测试 ====================
  describe('createJestMockModule', () => {
    test('应返回符合 UnifiedRedisClient 导出接口的对象', () => {
      const mockClient = createMockUnifiedRedisClient()
      const mockModule = createJestMockModule(mockClient)

      expect(mockModule).toHaveProperty('UnifiedRedisClient')
      expect(mockModule).toHaveProperty('getRedisClient')
      expect(mockModule).toHaveProperty('getRawClient')
      expect(mockModule).toHaveProperty('isRedisHealthy')

      // 验证函数返回正确的实例
      expect(mockModule.getRedisClient()).toBe(mockClient)
      expect(mockModule.getRawClient()).toBeInstanceOf(MockRedisClient)
    })

    test('isRedisHealthy 应正确反映 Mock 状态', async () => {
      const mockClient = createMockUnifiedRedisClient()
      const mockModule = createJestMockModule(mockClient)

      expect(await mockModule.isRedisHealthy()).toBe(true)

      mockClient.simulateDisconnect()
      expect(await mockModule.isRedisHealthy()).toBe(false)
    })
  })

  // ==================== CircuitBreakerTestController 测试 ====================
  describe('CircuitBreakerTestController', () => {
    let controller

    beforeEach(() => {
      controller = new CircuitBreakerTestController()
    })

    afterEach(() => {
      controller.cleanup()
    })

    test('createMockClient 应创建 Mock 客户端', () => {
      const client = controller.createMockClient()
      expect(client).toBeInstanceOf(MockRedisClient)
      expect(controller.getMockClient()).toBe(client)
    })

    test('simulateRedisDown 应模拟 Redis 不可用', () => {
      controller.simulateRedisDown()
      const client = controller.getMockClient()

      expect(controller.isMockActive()).toBe(true)
      expect(client.status).toBe(REDIS_STATUS.DISCONNECTED)
    })

    test('simulateRedisTimeout 应模拟超时', () => {
      controller.simulateRedisTimeout(5000)
      const client = controller.getMockClient()

      expect(client._latency_ms).toBe(5000)
    })

    test('simulateIntermittentFaults 应设置故障率', () => {
      controller.simulateIntermittentFaults(0.5)
      const client = controller.getMockClient()

      expect(client._fault_rate).toBe(0.5)
    })

    test('restoreRedis 应恢复正常状态', () => {
      controller.simulateRedisDown()
      controller.restoreRedis()
      const client = controller.getMockClient()

      expect(client.status).toBe(REDIS_STATUS.CONNECTED)
    })

    test('getTestStats 应返回统计数据', async () => {
      const client = controller.createMockClient()
      await client.set('key', 'value')
      await client.get('key')

      const stats = controller.getTestStats()
      expect(stats).toHaveProperty('total_calls')
      expect(stats).toHaveProperty('successful_calls')
      expect(stats.total_calls).toBe(2)
      expect(stats.successful_calls).toBe(2)
    })
  })

  // ==================== 健康检查器测试 ====================
  describe('createHealthChecker', () => {
    test('健康的客户端应返回 true', async () => {
      const client = new MockRedisClient()
      const checker = createHealthChecker(client)

      expect(await checker()).toBe(true)
    })

    test('断开的客户端应返回 false', async () => {
      const client = new MockRedisClient()
      client.simulateDisconnect()
      const checker = createHealthChecker(client)

      expect(await checker()).toBe(false)
    })

    test('null 客户端应返回 false', async () => {
      const checker = createHealthChecker(null)
      expect(await checker()).toBe(false)
    })
  })

  // ==================== 统计和历史记录测试 ====================
  describe('调用历史和统计', () => {
    test('getCallHistory 应记录所有操作', async () => {
      const client = new MockRedisClient()
      await client.set('key1', 'value1')
      await client.get('key1')
      await client.del('key1')

      const history = client.getCallHistory()
      expect(history).toHaveLength(3)
      expect(history[0].operation).toBe('set')
      expect(history[1].operation).toBe('get')
      expect(history[2].operation).toBe('del')
    })

    test('getStats 应统计成功和失败', async () => {
      const client = new MockRedisClient()
      await client.set('key', 'value')
      await client.get('key')

      // 模拟故障
      client.simulateDisconnect()
      try {
        await client.get('key')
      } catch {
        // 预期错误
      }

      const stats = client.getStats()
      expect(stats.total_calls).toBe(3)
      expect(stats.successful_calls).toBe(2)
      expect(stats.failed_calls).toBe(1)
      expect(stats.simulated_faults).toBe(1)
    })

    test('presetData 应预设存储数据', async () => {
      const client = new MockRedisClient()
      client.presetData({
        preset_key1: 'preset_value1',
        preset_key2: 'preset_value2'
      })

      expect(await client.get('preset_key1')).toBe('preset_value1')
      expect(await client.get('preset_key2')).toBe('preset_value2')
    })

    test('getStoredData 应返回所有存储数据', async () => {
      const client = new MockRedisClient()
      await client.set('key1', 'value1')
      await client.set('key2', 'value2')

      const data = client.getStoredData()
      expect(data).toEqual({
        key1: 'value1',
        key2: 'value2'
      })
    })
  })
})
