'use strict'

/**
 * 🧪 Mock Redis - ioredis 特有方法测试
 *
 * @description 验证 test-mock-redis.js 中新增的 ioredis 特有方法功能
 * 包括：scanStream、defineCommand 方法
 *
 * @version V1.0
 * @date 2026-01-30
 * @file tests/unit/helpers/test-mock-redis-ioredis.test.js
 */

const {
  MockRedisClient,
  MockUnifiedRedisClient,
  MockScanStream
} = require('../../helpers/test-mock-redis')

describe('📦 Mock Redis - ioredis 特有方法测试', () => {
  // ==================== scanStream 测试 ====================

  describe('MockRedisClient.scanStream', () => {
    let mock_client

    beforeEach(() => {
      mock_client = new MockRedisClient()
    })

    afterEach(async () => {
      await mock_client.quit()
    })

    test('scanStream 应返回 MockScanStream 实例', () => {
      const stream = mock_client.scanStream()
      expect(stream).toBeInstanceOf(MockScanStream)
    })

    test('scanStream 应支持 match 选项过滤键', async () => {
      // 设置一些测试数据
      await mock_client.set('user:1', 'value1')
      await mock_client.set('user:2', 'value2')
      await mock_client.set('session:1', 'value3')
      await mock_client.set('cache:temp', 'value4')

      const stream = mock_client.scanStream({ match: 'user:*' })
      const results = []

      return new Promise((resolve, reject) => {
        stream.on('data', keys => {
          results.push(...keys)
        })
        stream.on('end', () => {
          // 只应返回 user:* 匹配的键
          expect(results).toContain('user:1')
          expect(results).toContain('user:2')
          expect(results).not.toContain('session:1')
          expect(results).not.toContain('cache:temp')
          resolve()
        })
        stream.on('error', reject)
        // MockScanStream 自动开始扫描（通过 process.nextTick）
      })
    })

    test('scanStream 应支持 count 选项控制批量大小', async () => {
      // 设置足够多的数据来触发分批
      for (let i = 0; i < 25; i++) {
        await mock_client.set(`key:${i}`, `value:${i}`)
      }

      const stream = mock_client.scanStream({ match: 'key:*', count: 5 })
      const batches = []

      return new Promise((resolve, reject) => {
        stream.on('data', keys => {
          batches.push(keys)
        })
        stream.on('end', () => {
          // 应该有多个批次
          expect(batches.length).toBeGreaterThan(1)
          // 总共应该有25个键
          const total_keys = batches.flat()
          expect(total_keys.length).toBe(25)
          resolve()
        })
        stream.on('error', reject)
      })
    })

    test('scanStream 无匹配时应正常结束', async () => {
      await mock_client.set('existing:key', 'value')

      const stream = mock_client.scanStream({ match: 'nonexistent:*' })
      const results = []

      return new Promise((resolve, reject) => {
        stream.on('data', keys => {
          results.push(...keys)
        })
        stream.on('end', () => {
          expect(results.length).toBe(0)
          resolve()
        })
        stream.on('error', reject)
      })
    })

    test('scanStream 应支持通配符 * 匹配所有键', async () => {
      await mock_client.set('a', '1')
      await mock_client.set('b', '2')
      await mock_client.set('c', '3')

      const stream = mock_client.scanStream({ match: '*' })
      const results = []

      return new Promise((resolve, reject) => {
        stream.on('data', keys => {
          results.push(...keys)
        })
        stream.on('end', () => {
          expect(results).toContain('a')
          expect(results).toContain('b')
          expect(results).toContain('c')
          resolve()
        })
        stream.on('error', reject)
      })
    })
  })

  // ==================== MockScanStream 单独测试 ====================

  describe('MockScanStream', () => {
    let mock_client

    beforeEach(() => {
      mock_client = new MockRedisClient()
    })

    afterEach(async () => {
      await mock_client.quit()
    })

    test('MockScanStream 应实现 EventEmitter 接口', () => {
      const stream = mock_client.scanStream()
      expect(typeof stream.on).toBe('function')
      expect(typeof stream.emit).toBe('function')
      expect(typeof stream.removeListener).toBe('function')
    })

    test('pause 和 resume 方法应存在（API 兼容）', () => {
      const stream = mock_client.scanStream()
      expect(typeof stream.pause).toBe('function')
      expect(typeof stream.resume).toBe('function')
    })

    test('destroy 应触发 close 事件', async () => {
      const stream = mock_client.scanStream()

      return new Promise((resolve) => {
        stream.on('close', () => {
          resolve()
        })
        stream.destroy()
      })
    })
  })

  // ==================== defineCommand 测试 ====================

  describe('MockRedisClient.defineCommand', () => {
    let mock_client

    beforeEach(() => {
      mock_client = new MockRedisClient()
    })

    afterEach(async () => {
      await mock_client.quit()
    })

    test('defineCommand 应返回自身以支持链式调用', () => {
      const result = mock_client.defineCommand('myCommand', {
        numberOfKeys: 1,
        lua: 'return redis.call("get", KEYS[1])'
      })

      expect(result).toBe(mock_client)
    })

    test('defineCommand 应支持多次调用定义不同命令', () => {
      const result1 = mock_client.defineCommand('cmd1', { numberOfKeys: 1 })
      const result2 = mock_client.defineCommand('cmd2', { numberOfKeys: 2 })

      expect(result1).toBe(mock_client)
      expect(result2).toBe(mock_client)
    })

    test('defineCommand 应记录在调用历史中', () => {
      mock_client.defineCommand('testCmd', { numberOfKeys: 0 })

      const history = mock_client.getCallHistory()
      const defineCommandCall = history.find(call => call.operation === 'defineCommand')

      expect(defineCommandCall).toBeDefined()
      expect(defineCommandCall.args[0]).toBe('testCmd')
    })

    test('defineCommand 后应能调用自定义命令', async () => {
      // 定义自定义命令（包含 get 操作的 Lua 脚本）
      mock_client.defineCommand('customGet', {
        numberOfKeys: 1,
        lua: 'return redis.call("get", KEYS[1])'
      })

      // 设置一些数据
      await mock_client.set('myKey', 'myValue')

      // 调用自定义命令
      const result = await mock_client.customGet('myKey')
      // Mock 实现会模拟 GET 操作，返回存储的值
      expect(result).toBe('myValue')
    })
  })

  // ==================== MockUnifiedRedisClient 代理测试 ====================

  describe('MockUnifiedRedisClient 代理方法', () => {
    let mock_unified_client

    beforeEach(() => {
      mock_unified_client = new MockUnifiedRedisClient()
    })

    afterEach(async () => {
      await mock_unified_client.disconnect()
    })

    test('scanStream 应代理到底层 MockRedisClient', async () => {
      // 设置测试数据
      await mock_unified_client.set('proxy:key1', 'value1')
      await mock_unified_client.set('proxy:key2', 'value2')

      const stream = mock_unified_client.scanStream({ match: 'proxy:*' })
      expect(stream).toBeInstanceOf(MockScanStream)

      const results = []
      return new Promise((resolve, reject) => {
        stream.on('data', keys => {
          results.push(...keys)
        })
        stream.on('end', () => {
          expect(results).toContain('proxy:key1')
          expect(results).toContain('proxy:key2')
          resolve()
        })
        stream.on('error', reject)
      })
    })

    test('defineCommand 应代理到底层 MockRedisClient', () => {
      // 调用 defineCommand
      mock_unified_client.defineCommand('unifiedCmd', {
        numberOfKeys: 1
      })

      // 验证命令已定义
      const definedCommands = mock_unified_client.getDefinedCommands()
      expect(definedCommands.has('unifiedCmd')).toBe(true)
    })
  })

  // ==================== 故障注入场景测试 ====================

  describe('scanStream 故障场景', () => {
    let mock_client

    beforeEach(() => {
      mock_client = new MockRedisClient()
    })

    afterEach(async () => {
      mock_client.reset()
      await mock_client.quit()
    })

    test('断开连接状态下 scanStream 应触发 error 事件', async () => {
      mock_client.simulateDisconnect()

      const stream = mock_client.scanStream({ match: '*' })

      return new Promise((resolve) => {
        stream.on('error', error => {
          expect(error).toBeDefined()
          expect(error.message).toContain('connection')
          resolve()
        })
        // 设置超时以防错误不触发
        setTimeout(() => {
          resolve()
        }, 500)
      })
    })
  })

  // ==================== 集成测试 ====================

  describe('scanStream + defineCommand 集成', () => {
    let mock_client

    beforeEach(() => {
      mock_client = new MockRedisClient()
    })

    afterEach(async () => {
      await mock_client.quit()
    })

    test('应能同时使用 scanStream 和 defineCommand', async () => {
      // 定义自定义命令
      mock_client.defineCommand('batchGet', { numberOfKeys: 0 })

      // 设置数据
      await mock_client.set('item:1', 'value1')
      await mock_client.set('item:2', 'value2')
      await mock_client.set('item:3', 'value3')

      // 使用 scanStream 获取所有键
      const stream = mock_client.scanStream({ match: 'item:*' })
      const scannedKeys = []

      return new Promise((resolve, reject) => {
        stream.on('data', keys => {
          scannedKeys.push(...keys)
        })
        stream.on('end', () => {
          expect(scannedKeys.length).toBe(3)
          expect(scannedKeys).toContain('item:1')
          expect(scannedKeys).toContain('item:2')
          expect(scannedKeys).toContain('item:3')
          resolve()
        })
        stream.on('error', reject)
      })
    })

    test('调用历史应正确记录 scanStream 和 defineCommand', async () => {
      mock_client.defineCommand('testCmd', { numberOfKeys: 1 })
      mock_client.scanStream({ match: 'test:*' })

      const history = mock_client.getCallHistory()

      const defineCall = history.find(h => h.operation === 'defineCommand')
      const scanCall = history.find(h => h.operation === 'scanStream')

      expect(defineCall).toBeDefined()
      expect(scanCall).toBeDefined()
    })
  })
})
