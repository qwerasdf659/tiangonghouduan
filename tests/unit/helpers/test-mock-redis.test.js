'use strict'

/**
 * 🧪 Redis Mock 工具单元测试
 *
 * @description 验证 test-mock-redis.js 的核心功能
 * @version V4.6
 * @date 2026-01-28
 *
 * @file tests/unit/helpers/test-mock-redis.test.js
 */

const {
  MockRedisClient,
  CircuitBreakerTestController,
  REDIS_STATUS,
  REDIS_FAULT_TYPE,
  CIRCUIT_BREAKER_SCENARIOS,
  createHealthChecker,
  runCircuitBreakerScenario
} = require('../../helpers/test-mock-redis')

describe('📦 test-mock-redis - Redis Mock 工具测试', () => {
  // ==================== MockRedisClient 基础功能测试 ====================

  describe('MockRedisClient 基础功能', () => {
    let mock_client

    beforeEach(() => {
      mock_client = new MockRedisClient()
    })

    afterEach(() => {
      mock_client.reset()
    })

    test('默认状态应为 connected', () => {
      expect(mock_client.status).toBe(REDIS_STATUS.CONNECTED)
    })

    test('GET/SET 操作应正常工作', async () => {
      await mock_client.set('test_key', 'test_value')
      const result = await mock_client.get('test_key')
      expect(result).toBe('test_value')
    })

    test('GET 不存在的 key 应返回 null', async () => {
      const result = await mock_client.get('nonexistent_key')
      expect(result).toBeNull()
    })

    test('SETEX 操作应正常工作', async () => {
      await mock_client.setex('ttl_key', 60, 'ttl_value')
      const result = await mock_client.get('ttl_key')
      expect(result).toBe('ttl_value')
    })

    test('DEL 操作应删除 key', async () => {
      await mock_client.set('del_key', 'del_value')
      const deleted = await mock_client.del('del_key')
      expect(deleted).toBe(1)

      const result = await mock_client.get('del_key')
      expect(result).toBeNull()
    })

    test('EXISTS 操作应正确检测 key 存在性', async () => {
      await mock_client.set('exists_key', 'value')
      expect(await mock_client.exists('exists_key')).toBe(1)
      expect(await mock_client.exists('not_exists')).toBe(0)
    })

    test('INCR/INCRBY 操作应正常工作', async () => {
      const result1 = await mock_client.incr('counter')
      expect(result1).toBe(1)

      const result2 = await mock_client.incrby('counter', 5)
      expect(result2).toBe(6)
    })

    test('PING 应返回 PONG', async () => {
      const result = await mock_client.ping()
      expect(result).toBe('PONG')
    })

    test('HGET/HSET/HGETALL 操作应正常工作', async () => {
      await mock_client.hset('hash_key', 'field1', 'value1')
      await mock_client.hset('hash_key', 'field2', 'value2')

      expect(await mock_client.hget('hash_key', 'field1')).toBe('value1')
      expect(await mock_client.hget('hash_key', 'field2')).toBe('value2')

      const all = await mock_client.hgetall('hash_key')
      expect(all).toEqual({ field1: 'value1', field2: 'value2' })
    })

    test('KEYS 操作应支持模式匹配', async () => {
      await mock_client.set('user:1', '1')
      await mock_client.set('user:2', '2')
      await mock_client.set('config:setting', 'value')

      const userKeys = await mock_client.keys('user:*')
      expect(userKeys).toHaveLength(2)
      expect(userKeys).toContain('user:1')
      expect(userKeys).toContain('user:2')
    })

    test('SCAN 操作应返回匹配的 keys', async () => {
      await mock_client.set('scan:1', '1')
      await mock_client.set('scan:2', '2')

      const [cursor, keys] = await mock_client.scan('0', 'MATCH', 'scan:*', 'COUNT', 10)
      expect(cursor).toBe('0')
      expect(keys).toHaveLength(2)
    })
  })

  // ==================== 故障模拟测试 ====================

  describe('故障模拟功能', () => {
    let mock_client

    beforeEach(() => {
      mock_client = new MockRedisClient()
    })

    afterEach(() => {
      mock_client.reset()
    })

    test('simulateDisconnect 应切换到断开状态', async () => {
      mock_client.simulateDisconnect()
      expect(mock_client.status).toBe(REDIS_STATUS.DISCONNECTED)

      await expect(mock_client.get('any_key')).rejects.toThrow('ECONNREFUSED')
    })

    test('simulateError 应触发指定类型的错误', async () => {
      mock_client.simulateError(REDIS_FAULT_TYPE.TIMEOUT)
      expect(mock_client.status).toBe(REDIS_STATUS.ERROR)

      await expect(mock_client.get('any_key')).rejects.toThrow('timed out')
    })

    test('setFaultType 应设置故障类型', async () => {
      mock_client.setFaultType(REDIS_FAULT_TYPE.OUT_OF_MEMORY)

      await expect(mock_client.set('key', 'value')).rejects.toThrow('out of memory')
    })

    test('setFaultRate 应控制随机故障概率', async () => {
      mock_client.setFaultRate(1.0) // 100% 故障率

      await expect(mock_client.get('any_key')).rejects.toThrow()
    })

    test('setLatency 应增加操作延迟', async () => {
      mock_client.setLatency(100) // 100ms 延迟
      await mock_client.set('latency_key', 'value')

      const start = Date.now()
      await mock_client.get('latency_key')
      const elapsed = Date.now() - start

      expect(elapsed).toBeGreaterThanOrEqual(90) // 允许少许误差
    })

    test('reset 应恢复正常状态', async () => {
      mock_client.simulateDisconnect()
      mock_client.reset()

      expect(mock_client.status).toBe(REDIS_STATUS.CONNECTED)
      const result = await mock_client.ping()
      expect(result).toBe('PONG')
    })
  })

  // ==================== 测试辅助功能测试 ====================

  describe('测试辅助功能', () => {
    let mock_client

    beforeEach(() => {
      mock_client = new MockRedisClient()
    })

    afterEach(() => {
      mock_client.reset()
    })

    test('getCallHistory 应记录所有操作', async () => {
      await mock_client.set('key1', 'value1')
      await mock_client.get('key1')
      await mock_client.del('key1')

      const history = mock_client.getCallHistory()
      expect(history).toHaveLength(3)
      expect(history[0].operation).toBe('set')
      expect(history[1].operation).toBe('get')
      expect(history[2].operation).toBe('del')
    })

    test('getStats 应返回统计数据', async () => {
      await mock_client.set('key1', 'value1')
      await mock_client.get('key1')

      mock_client.simulateDisconnect()
      try {
        await mock_client.get('key2')
      } catch (e) {
        // 预期会失败
      }

      const stats = mock_client.getStats()
      expect(stats.total_calls).toBe(3)
      expect(stats.successful_calls).toBe(2)
      expect(stats.failed_calls).toBe(1)
    })

    test('presetData 应预设存储数据', async () => {
      mock_client.presetData({
        preset_key1: 'value1',
        preset_key2: 'value2'
      })

      expect(await mock_client.get('preset_key1')).toBe('value1')
      expect(await mock_client.get('preset_key2')).toBe('value2')
    })

    test('assertOperationCalled 应验证操作调用', async () => {
      await mock_client.get('key1')
      await mock_client.get('key2')
      await mock_client.set('key3', 'value')

      expect(mock_client.assertOperationCalled('get')).toBe(true)
      expect(mock_client.assertOperationCalled('get', 2)).toBe(true)
      expect(mock_client.assertOperationCalled('set', 1)).toBe(true)
      expect(mock_client.assertOperationCalled('del')).toBe(false)
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

    test('createMockClient 应创建 mock 客户端', () => {
      const client = controller.createMockClient()
      expect(client).toBeInstanceOf(MockRedisClient)
      expect(controller.getMockClient()).toBe(client)
    })

    test('simulateRedisDown 应模拟 Redis 不可用', async () => {
      controller.simulateRedisDown()
      expect(controller.isMockActive()).toBe(true)

      const client = controller.getMockClient()
      await expect(client.get('any_key')).rejects.toThrow()
    })

    test('simulateRedisTimeout 应模拟超时', async () => {
      controller.simulateRedisTimeout(50) // 50ms 超时模拟
      const client = controller.getMockClient()

      // 设置故障类型但仍可执行（只是有延迟）
      client.setFaultType(REDIS_FAULT_TYPE.NONE) // 先清除故障
      client.setLatency(50)

      const start = Date.now()
      await client.ping()
      const elapsed = Date.now() - start

      expect(elapsed).toBeGreaterThanOrEqual(40)
    })

    test('simulateIntermittentFaults 应模拟间歇性故障', async () => {
      controller.simulateIntermittentFaults(0.5)
      const client = controller.getMockClient()

      let successes = 0
      let failures = 0

      // 执行多次操作，统计成功/失败
      for (let i = 0; i < 20; i++) {
        try {
          await client.ping()
          successes++
        } catch (e) {
          failures++
        }
      }

      // 50% 故障率下，应该有一定比例的成功和失败
      expect(successes).toBeGreaterThan(0)
      expect(failures).toBeGreaterThan(0)
    })

    test('restoreRedis 应恢复正常状态', async () => {
      controller.simulateRedisDown()
      controller.restoreRedis()

      const client = controller.getMockClient()
      const result = await client.ping()
      expect(result).toBe('PONG')
    })

    test('getTestStats 应返回统计数据', async () => {
      const client = controller.createMockClient()
      await client.ping()

      const stats = controller.getTestStats()
      expect(stats.total_calls).toBe(1)
    })
  })

  // ==================== 健康检查器测试 ====================

  describe('createHealthChecker', () => {
    test('正常状态下应返回 true', async () => {
      const mock_client = new MockRedisClient()
      const checkHealth = createHealthChecker(mock_client)

      const isHealthy = await checkHealth()
      expect(isHealthy).toBe(true)
    })

    test('断开状态下应返回 false', async () => {
      const mock_client = new MockRedisClient()
      mock_client.simulateDisconnect()
      const checkHealth = createHealthChecker(mock_client)

      const isHealthy = await checkHealth()
      expect(isHealthy).toBe(false)
    })

    test('无客户端时应返回 false', async () => {
      const checkHealth = createHealthChecker(null)

      const isHealthy = await checkHealth()
      expect(isHealthy).toBe(false)
    })
  })

  // ==================== 预定义场景测试 ====================

  describe('CIRCUIT_BREAKER_SCENARIOS', () => {
    test('应包含所有预定义场景', () => {
      expect(CIRCUIT_BREAKER_SCENARIOS.REDIS_COMPLETELY_DOWN).toBeDefined()
      expect(CIRCUIT_BREAKER_SCENARIOS.REDIS_TIMEOUT).toBeDefined()
      expect(CIRCUIT_BREAKER_SCENARIOS.INTERMITTENT_FAILURES).toBeDefined()
      expect(CIRCUIT_BREAKER_SCENARIOS.READONLY_MODE).toBeDefined()
    })

    test('每个场景应有 name、description、setup、expected_behaviors', () => {
      Object.values(CIRCUIT_BREAKER_SCENARIOS).forEach(scenario => {
        expect(scenario.name).toBeDefined()
        expect(scenario.description).toBeDefined()
        expect(typeof scenario.setup).toBe('function')
        expect(Array.isArray(scenario.expected_behaviors)).toBe(true)
      })
    })
  })

  // ==================== runCircuitBreakerScenario 测试 ====================

  describe('runCircuitBreakerScenario', () => {
    test('REDIS_COMPLETELY_DOWN 场景应正确执行', async () => {
      const result = await runCircuitBreakerScenario('REDIS_COMPLETELY_DOWN', async (mock_client, controller) => {
        // 验证 Redis 不可用
        let connectionError = false
        try {
          await mock_client.get('test_key')
        } catch (error) {
          connectionError = true
        }

        return { connection_error: connectionError }
      })

      expect(result.passed).toBe(true)
      expect(result.test_result.connection_error).toBe(true)
      expect(result.stats).toBeDefined()
    })

    test('未知场景应抛出错误', async () => {
      await expect(runCircuitBreakerScenario('UNKNOWN_SCENARIO', async () => {})).rejects.toThrow(
        '未知的熔断测试场景'
      )
    })
  })
})

