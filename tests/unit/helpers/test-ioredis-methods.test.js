'use strict'

/**
 * 🧪 ioredis 特有方法单元测试
 *
 * @description 验证 test-mock-redis.js 中新增的 ioredis 特有方法
 * 包括：scanStream、defineCommand、pttl
 *
 * @version V1.0
 * @date 2026-01-30
 * @file tests/unit/helpers/test-ioredis-methods.test.js
 */

const {
  MockRedisClient,
  MockScanStream,
  REDIS_STATUS,
  createMockUnifiedRedisClient
} = require('../../helpers/test-mock-redis')

describe('📦 ioredis 特有方法测试', () => {
  // ==================== scanStream 测试 ====================

  describe('scanStream 方法', () => {
    let mock_client

    beforeEach(() => {
      mock_client = new MockRedisClient()
    })

    afterEach(() => {
      mock_client.reset()
    })

    test('scanStream 应返回 MockScanStream 实例', () => {
      const stream = mock_client.scanStream({ match: '*', count: 10 })
      expect(stream).toBeInstanceOf(MockScanStream)
    })

    test('scanStream 应正确遍历匹配的键', done => {
      // 预设数据
      mock_client.presetData({
        'user:1': 'data1',
        'user:2': 'data2',
        'user:3': 'data3',
        'other:1': 'other_data'
      })

      const found_keys = []
      const stream = mock_client.scanStream({ match: 'user:*', count: 10 })

      stream.on('data', keys => {
        found_keys.push(...keys)
      })

      stream.on('end', () => {
        expect(found_keys).toContain('user:1')
        expect(found_keys).toContain('user:2')
        expect(found_keys).toContain('user:3')
        expect(found_keys).not.toContain('other:1')
        done()
      })
    })

    test('scanStream 在断开连接时应发出错误', done => {
      mock_client.simulateDisconnect()

      const stream = mock_client.scanStream({ match: '*' })

      stream.on('error', err => {
        expect(err.message).toContain('connection not available')
        done()
      })
    })

    test('scanStream 应支持 pause/resume 操作', done => {
      mock_client.presetData({
        'key:1': 'value1',
        'key:2': 'value2',
        'key:3': 'value3',
        'key:4': 'value4',
        'key:5': 'value5'
      })

      const stream = mock_client.scanStream({ match: 'key:*', count: 2 })
      let data_count = 0

      stream.on('data', () => {
        data_count++
        // 在第一批数据后暂停
        if (data_count === 1) {
          stream.pause()
          // 稍后恢复
          setTimeout(() => {
            stream.resume()
          }, 50)
        }
      })

      stream.on('end', () => {
        expect(data_count).toBeGreaterThan(0)
        done()
      })
    })

    test('scanStream 应支持 destroy 操作', done => {
      mock_client.presetData({
        'key:1': 'value1',
        'key:2': 'value2'
      })

      const stream = mock_client.scanStream({ match: 'key:*', count: 1 })
      let destroyed = false

      stream.on('data', () => {
        stream.destroy()
      })

      stream.on('close', () => {
        destroyed = true
      })

      // 等待一小段时间确认销毁
      setTimeout(() => {
        expect(destroyed || stream.finished).toBe(true)
        done()
      }, 100)
    })

    test('scanStream 默认匹配所有键', done => {
      mock_client.presetData({
        'a': 'value_a',
        'b': 'value_b',
        'c': 'value_c'
      })

      const found_keys = []
      const stream = mock_client.scanStream() // 默认 match: '*'

      stream.on('data', keys => {
        found_keys.push(...keys)
      })

      stream.on('end', () => {
        expect(found_keys.length).toBe(3)
        expect(found_keys).toContain('a')
        expect(found_keys).toContain('b')
        expect(found_keys).toContain('c')
        done()
      })
    })
  })

  // ==================== defineCommand 测试 ====================

  describe('defineCommand 方法', () => {
    let mock_client

    beforeEach(() => {
      mock_client = new MockRedisClient()
    })

    afterEach(() => {
      mock_client.reset()
    })

    test('defineCommand 应正确注册自定义命令', () => {
      mock_client.defineCommand('myCommand', {
        numberOfKeys: 1,
        lua: `return redis.call('get', KEYS[1])`
      })

      expect(typeof mock_client.myCommand).toBe('function')
      expect(typeof mock_client.myCommandBuffer).toBe('function')
    })

    test('自定义 GET 命令应正确工作', async () => {
      // 预设数据
      await mock_client.set('test_key', 'test_value')

      // 定义自定义命令
      mock_client.defineCommand('customGet', {
        numberOfKeys: 1,
        lua: `return redis.call('get', KEYS[1])`
      })

      // 执行自定义命令
      const result = await mock_client.customGet('test_key')
      expect(result).toBe('test_value')
    })

    test('自定义 SET 命令应正确工作', async () => {
      // 定义自定义命令
      mock_client.defineCommand('customSet', {
        numberOfKeys: 1,
        lua: `return redis.call('set', KEYS[1], ARGV[1])`
      })

      // 执行自定义命令
      const result = await mock_client.customSet('my_key', 'my_value')
      expect(result).toBe('OK')

      // 验证值已设置
      const value = await mock_client.get('my_key')
      expect(value).toBe('my_value')
    })

    test('getDefinedCommands 应返回已定义的命令', () => {
      mock_client.defineCommand('cmd1', { numberOfKeys: 1, lua: 'script1' })
      mock_client.defineCommand('cmd2', { numberOfKeys: 2, lua: 'script2' })

      const commands = mock_client.getDefinedCommands()
      expect(commands.size).toBe(2)
      expect(commands.has('cmd1')).toBe(true)
      expect(commands.has('cmd2')).toBe(true)
      expect(commands.get('cmd1').numberOfKeys).toBe(1)
      expect(commands.get('cmd2').numberOfKeys).toBe(2)
    })

    test('自定义命令应记录调用历史', async () => {
      mock_client.defineCommand('trackedCmd', {
        numberOfKeys: 1,
        lua: `return redis.call('get', KEYS[1])`
      })

      await mock_client.trackedCmd('some_key')

      const history = mock_client.getCallHistory()
      const tracked_calls = history.filter(call => call.operation === 'trackedCmd')
      expect(tracked_calls.length).toBe(1)
      expect(tracked_calls[0].args).toContain('some_key')
    })
  })

  // ==================== pttl 测试 ====================

  describe('pttl 方法', () => {
    let mock_client

    beforeEach(() => {
      mock_client = new MockRedisClient()
    })

    afterEach(() => {
      mock_client.reset()
    })

    test('pttl 对不存在的键应返回 -2', async () => {
      const result = await mock_client.pttl('non_existent_key')
      expect(result).toBe(-2)
    })

    test('pttl 对存在但无过期时间的键应返回 -1', async () => {
      await mock_client.set('persistent_key', 'value')
      const result = await mock_client.pttl('persistent_key')
      expect(result).toBe(-1)
    })
  })

  // ==================== MockUnifiedRedisClient 兼容性测试 ====================

  describe('MockUnifiedRedisClient ioredis 方法', () => {
    let mock_unified

    beforeEach(() => {
      mock_unified = createMockUnifiedRedisClient()
    })

    afterEach(() => {
      mock_unified.reset()
    })

    test('scanStream 应通过 MockUnifiedRedisClient 可用', () => {
      const stream = mock_unified.scanStream({ match: 'test:*' })
      expect(stream).toBeInstanceOf(MockScanStream)
    })

    test('defineCommand 应通过 MockUnifiedRedisClient 可用', () => {
      mock_unified.defineCommand('unifiedCmd', {
        numberOfKeys: 1,
        lua: `return redis.call('get', KEYS[1])`
      })

      // 自定义命令应通过底层客户端调用
      const commands = mock_unified.getDefinedCommands()
      expect(commands.has('unifiedCmd')).toBe(true)
    })

    test('pttl 应通过 MockUnifiedRedisClient 可用', async () => {
      const result = await mock_unified.pttl('non_existent')
      expect(result).toBe(-2)
    })
  })
})


