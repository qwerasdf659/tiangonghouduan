'use strict'

/**
 * 🔧 Redis 模拟工具 - 熔断测试专用（完整版）
 *
 * @description 提供完整的 Redis 模拟功能，用于测试系统在 Redis 不可用时的降级行为
 * @version V4.7 - 完整 UnifiedRedisClient 兼容 + 事务/管道支持
 * @date 2026-01-28
 *
 * 核心功能：
 * 1. 模拟 Redis 连接状态（connected/disconnected/error/connecting/reconnecting）
 * 2. 模拟各种 Redis 操作失败场景（超时/连接拒绝/认证失败/内存不足/只读模式等）
 * 3. 支持熔断测试场景（服务降级验证）
 * 4. **完整兼容项目 UnifiedRedisClient 架构**（V4.7新增）
 * 5. **支持 multi/pipeline 事务和管道操作**（V4.7新增）
 * 6. **支持有序集合操作 zadd/zremrangebyscore/zcard/zcount**（V4.7新增）
 *
 * 使用场景：
 * - 测试 Redis 不可用时系统的降级行为（熔断测试）
 * - 验证熔断器（Circuit Breaker）逻辑
 * - 验证缓存失效时的回退查库逻辑
 * - 测试 Redis 超时/连接错误处理
 * - 测试限流器、分布式锁等高级功能在 Redis 故障时的行为
 * - **通过 Jest Mock 替换真实 UnifiedRedisClient 进行集成测试**（V4.7新增）
 *
 * 设计原则：
 * - 不修改实际 Redis 连接，仅在测试层面进行模拟
 * - 支持运行时切换模拟状态（连接/断开/错误）
 * - 提供丰富的故障注入场景（超时/间歇性故障/只读模式等）
 * - 自动清理，不影响其他测试
 * - **API 与 UnifiedRedisClient 保持一致，支持无缝替换**（V4.7新增）
 *
 * 模块结构：
 * - REDIS_STATUS：Redis 连接状态枚举
 * - REDIS_FAULT_TYPE：Redis 故障类型枚举
 * - MockRedisClient：模拟 ioredis 客户端（底层）
 * - MockMulti：模拟 Redis 事务（multi）
 * - MockPipeline：模拟 Redis 管道（pipeline）
 * - MockUnifiedRedisClient：模拟项目 UnifiedRedisClient（高层封装）
 * - CircuitBreakerTestController：熔断测试控制器
 * - CIRCUIT_BREAKER_SCENARIOS：预定义测试场景
 *
 * 使用示例（基础）：
 * ```javascript
 * const { MockRedisClient, REDIS_STATUS } = require('../helpers/test-mock-redis')
 *
 * const mockClient = new MockRedisClient()
 * await mockClient.set('key', 'value')
 * mockClient.simulateDisconnect()
 * await mockClient.get('key') // 抛出连接错误
 * ```
 *
 * 使用示例（Jest Mock 替换）：
 * ```javascript
 * const { createMockUnifiedRedisClient, createJestMockModule } = require('../helpers/test-mock-redis')
 *
 * const mockClient = createMockUnifiedRedisClient()
 * jest.mock('../../utils/UnifiedRedisClient', () => createJestMockModule(mockClient))
 *
 * // 测试代码中使用的 getRedisClient() 将返回 mockClient
 * mockClient.simulateDisconnect()
 * // 测试服务降级逻辑...
 * ```
 *
 * @file tests/helpers/test-mock-redis.js
 */

const EventEmitter = require('events')

// ==================== 模拟状态枚举 ====================

/**
 * Redis 连接状态枚举
 * @readonly
 * @enum {string}
 */
const REDIS_STATUS = {
  /** 正常连接状态 */
  CONNECTED: 'connected',
  /** 断开连接状态 */
  DISCONNECTED: 'disconnected',
  /** 连接错误状态 */
  ERROR: 'error',
  /** 连接中状态 */
  CONNECTING: 'connecting',
  /** 重连中状态 */
  RECONNECTING: 'reconnecting'
}

/**
 * Redis 故障类型枚举
 * @readonly
 * @enum {string}
 */
const REDIS_FAULT_TYPE = {
  /** 无故障 */
  NONE: 'none',
  /** 连接超时 */
  TIMEOUT: 'timeout',
  /** 连接拒绝 */
  CONNECTION_REFUSED: 'connection_refused',
  /** 连接重置 */
  CONNECTION_RESET: 'connection_reset',
  /** 认证失败 */
  AUTH_FAILED: 'auth_failed',
  /** 内存不足 */
  OUT_OF_MEMORY: 'out_of_memory',
  /** 只读模式 */
  READONLY: 'readonly',
  /** 集群故障 */
  CLUSTER_DOWN: 'cluster_down',
  /** 操作超时 */
  OPERATION_TIMEOUT: 'operation_timeout',
  /** 随机故障（用于混沌测试） */
  RANDOM: 'random'
}

/**
 * Redis 故障错误消息映射
 * @constant
 */
const FAULT_ERROR_MESSAGES = {
  [REDIS_FAULT_TYPE.TIMEOUT]: 'Redis connection timed out',
  [REDIS_FAULT_TYPE.CONNECTION_REFUSED]: 'Redis connection refused: ECONNREFUSED',
  [REDIS_FAULT_TYPE.CONNECTION_RESET]: 'Redis connection reset: ECONNRESET',
  [REDIS_FAULT_TYPE.AUTH_FAILED]: 'Redis authentication failed: NOAUTH',
  [REDIS_FAULT_TYPE.OUT_OF_MEMORY]: 'Redis OOM: out of memory',
  [REDIS_FAULT_TYPE.READONLY]: 'Redis READONLY: You can\'t write against a read only replica',
  [REDIS_FAULT_TYPE.CLUSTER_DOWN]: 'Redis CLUSTERDOWN: The cluster is down',
  [REDIS_FAULT_TYPE.OPERATION_TIMEOUT]: 'Redis operation timed out'
}

// ==================== Mock Multi (事务) ====================

/**
 * Mock Multi 类 - 模拟 Redis 事务
 *
 * @description 模拟 ioredis 的 multi() 返回的对象
 * @example
 * const multi = await mockClient.multi()
 * multi.set('key1', 'value1')
 * multi.set('key2', 'value2')
 * const results = await multi.exec()
 */
class MockMulti {
  /**
   * 创建 Mock Multi 实例
   * @param {MockRedisClient} client - 父 Mock Redis 客户端
   */
  constructor(client) {
    this._client = client
    this._commands = []
  }

  /**
   * 添加 SET 命令到事务队列
   * @param {string} key - 键名
   * @param {string} value - 键值
   * @returns {MockMulti} 返回自身以支持链式调用
   */
  set(key, value) {
    this._commands.push({ cmd: 'set', args: [key, value] })
    return this
  }

  /**
   * 添加 GET 命令到事务队列
   * @param {string} key - 键名
   * @returns {MockMulti} 返回自身以支持链式调用
   */
  get(key) {
    this._commands.push({ cmd: 'get', args: [key] })
    return this
  }

  /**
   * 添加 DEL 命令到事务队列
   * @param {string} key - 键名
   * @returns {MockMulti} 返回自身以支持链式调用
   */
  del(key) {
    this._commands.push({ cmd: 'del', args: [key] })
    return this
  }

  /**
   * 添加 INCR 命令到事务队列
   * @param {string} key - 键名
   * @returns {MockMulti} 返回自身以支持链式调用
   */
  incr(key) {
    this._commands.push({ cmd: 'incr', args: [key] })
    return this
  }

  /**
   * 添加 INCRBY 命令到事务队列
   * @param {string} key - 键名
   * @param {number} increment - 增量
   * @returns {MockMulti} 返回自身以支持链式调用
   */
  incrby(key, increment) {
    this._commands.push({ cmd: 'incrby', args: [key, increment] })
    return this
  }

  /**
   * 添加 EXPIRE 命令到事务队列
   * @param {string} key - 键名
   * @param {number} seconds - 过期时间（秒）
   * @returns {MockMulti} 返回自身以支持链式调用
   */
  expire(key, seconds) {
    this._commands.push({ cmd: 'expire', args: [key, seconds] })
    return this
  }

  /**
   * 执行事务队列中的所有命令
   * @returns {Promise<Array>} 每个命令的执行结果数组
   */
  async exec() {
    const results = []
    for (const { cmd, args } of this._commands) {
      try {
        const result = await this._client[cmd](...args)
        results.push([null, result])
      } catch (error) {
        results.push([error, null])
      }
    }
    return results
  }
}

// ==================== Mock Pipeline (管道) ====================

/**
 * Mock Pipeline 类 - 模拟 Redis 管道
 *
 * @description 模拟 ioredis 的 pipeline() 返回的对象
 * @example
 * const pipeline = await mockClient.pipeline()
 * pipeline.set('key1', 'value1')
 * pipeline.get('key1')
 * const results = await pipeline.exec()
 */
class MockPipeline {
  /**
   * 创建 Mock Pipeline 实例
   * @param {MockRedisClient} client - 父 Mock Redis 客户端
   */
  constructor(client) {
    this._client = client
    this._commands = []
  }

  /**
   * 添加 SET 命令到管道队列
   * @param {string} key - 键名
   * @param {string} value - 键值
   * @returns {MockPipeline} 返回自身以支持链式调用
   */
  set(key, value) {
    this._commands.push({ cmd: 'set', args: [key, value] })
    return this
  }

  /**
   * 添加 GET 命令到管道队列
   * @param {string} key - 键名
   * @returns {MockPipeline} 返回自身以支持链式调用
   */
  get(key) {
    this._commands.push({ cmd: 'get', args: [key] })
    return this
  }

  /**
   * 添加 DEL 命令到管道队列
   * @param {string} key - 键名
   * @returns {MockPipeline} 返回自身以支持链式调用
   */
  del(key) {
    this._commands.push({ cmd: 'del', args: [key] })
    return this
  }

  /**
   * 添加 INCR 命令到管道队列
   * @param {string} key - 键名
   * @returns {MockPipeline} 返回自身以支持链式调用
   */
  incr(key) {
    this._commands.push({ cmd: 'incr', args: [key] })
    return this
  }

  /**
   * 添加 EXPIRE 命令到管道队列
   * @param {string} key - 键名
   * @param {number} seconds - 过期时间（秒）
   * @returns {MockPipeline} 返回自身以支持链式调用
   */
  expire(key, seconds) {
    this._commands.push({ cmd: 'expire', args: [key, seconds] })
    return this
  }

  /**
   * 执行管道队列中的所有命令
   * @returns {Promise<Array>} 每个命令的执行结果数组
   */
  async exec() {
    const results = []
    for (const { cmd, args } of this._commands) {
      try {
        const result = await this._client[cmd](...args)
        results.push([null, result])
      } catch (error) {
        results.push([error, null])
      }
    }
    return results
  }
}

// ==================== Mock Redis Client ====================

/**
 * Mock Redis 客户端
 *
 * @description 模拟 ioredis 客户端，用于测试 Redis 不可用场景
 * @extends EventEmitter
 *
 * @example
 * const mockClient = new MockRedisClient()
 *
 * // 模拟断开连接
 * mockClient.simulateDisconnect()
 *
 * // 验证降级逻辑
 * const result = await mockClient.get('some_key')
 * // 结果：抛出连接错误或返回 null（取决于模拟配置）
 */
class MockRedisClient extends EventEmitter {
  /**
   * 创建 Mock Redis 客户端实例
   *
   * @param {Object} options - 配置选项
   * @param {string} options.initial_status - 初始连接状态，默认 CONNECTED
   * @param {string} options.fault_type - 初始故障类型，默认 NONE
   * @param {number} options.latency_ms - 模拟延迟（毫秒），默认 0
   * @param {number} options.fault_rate - 随机故障概率（0-1），默认 0
   */
  constructor(options = {}) {
    super()

    this._options = {
      initial_status: REDIS_STATUS.CONNECTED,
      fault_type: REDIS_FAULT_TYPE.NONE,
      latency_ms: 0,
      fault_rate: 0,
      ...options
    }

    // 内部状态
    this._status = this._options.initial_status
    this._fault_type = this._options.fault_type
    this._latency_ms = this._options.latency_ms
    this._fault_rate = this._options.fault_rate
    this._call_history = []
    this._store = new Map() // 内存存储（模拟 Redis 数据）

    // 统计数据
    this._stats = {
      total_calls: 0,
      successful_calls: 0,
      failed_calls: 0,
      simulated_faults: 0
    }
  }

  // ==================== 状态控制方法 ====================

  /**
   * 获取当前连接状态
   * @returns {string} 连接状态
   */
  get status() {
    return this._status
  }

  /**
   * 模拟 Redis 连接
   *
   * @description 将状态切换为已连接，并发出 'connect' 和 'ready' 事件
   * @returns {MockRedisClient} 返回自身以支持链式调用
   */
  simulateConnect() {
    this._status = REDIS_STATUS.CONNECTED
    this._fault_type = REDIS_FAULT_TYPE.NONE
    this.emit('connect')
    this.emit('ready')
    return this
  }

  /**
   * 模拟 Redis 断开连接
   *
   * @description 将状态切换为断开，并发出 'close' 事件
   * @returns {MockRedisClient} 返回自身以支持链式调用
   */
  simulateDisconnect() {
    this._status = REDIS_STATUS.DISCONNECTED
    this._fault_type = REDIS_FAULT_TYPE.CONNECTION_REFUSED
    this.emit('close')
    return this
  }

  /**
   * 模拟 Redis 连接错误
   *
   * @description 将状态切换为错误状态，并发出 'error' 事件（如果有监听器）
   * @param {string} fault_type - 故障类型
   * @returns {MockRedisClient} 返回自身以支持链式调用
   */
  simulateError(fault_type = REDIS_FAULT_TYPE.CONNECTION_REFUSED) {
    this._status = REDIS_STATUS.ERROR
    this._fault_type = fault_type
    // 仅在有 error 监听器时发射错误事件，避免 Node.js 抛出未捕获异常
    if (this.listenerCount('error') > 0) {
      this.emit('error', this._createError(fault_type))
    }
    return this
  }

  /**
   * 设置模拟延迟
   *
   * @description 所有操作将在指定延迟后执行
   * @param {number} latency_ms - 延迟时间（毫秒）
   * @returns {MockRedisClient} 返回自身以支持链式调用
   */
  setLatency(latency_ms) {
    this._latency_ms = latency_ms
    return this
  }

  /**
   * 设置随机故障率
   *
   * @description 设置操作失败的概率（用于混沌测试）
   * @param {number} rate - 故障概率（0-1）
   * @returns {MockRedisClient} 返回自身以支持链式调用
   */
  setFaultRate(rate) {
    this._fault_rate = Math.min(1, Math.max(0, rate))
    return this
  }

  /**
   * 设置故障类型
   *
   * @param {string} fault_type - 故障类型
   * @returns {MockRedisClient} 返回自身以支持链式调用
   */
  setFaultType(fault_type) {
    this._fault_type = fault_type
    return this
  }

  /**
   * 重置所有模拟状态
   *
   * @description 重置为默认的健康状态，清空内存存储
   * @returns {MockRedisClient} 返回自身以支持链式调用
   */
  reset() {
    this._status = REDIS_STATUS.CONNECTED
    this._fault_type = REDIS_FAULT_TYPE.NONE
    this._latency_ms = 0
    this._fault_rate = 0
    this._call_history = []
    this._store.clear()
    this._stats = {
      total_calls: 0,
      successful_calls: 0,
      failed_calls: 0,
      simulated_faults: 0
    }
    return this
  }

  // ==================== ioredis 兼容方法 ====================

  /**
   * GET 操作
   *
   * @param {string} key - 键名
   * @returns {Promise<string|null>} 键值或 null
   */
  async get(key) {
    return this._executeOperation('get', [key], () => {
      return this._store.get(key) || null
    })
  }

  /**
   * SET 操作
   *
   * @param {string} key - 键名
   * @param {string} value - 键值
   * @returns {Promise<string>} 'OK'
   */
  async set(key, value) {
    return this._executeOperation('set', [key, value], () => {
      this._store.set(key, value)
      return 'OK'
    })
  }

  /**
   * SETEX 操作（带过期时间的 SET）
   *
   * @param {string} key - 键名
   * @param {number} seconds - 过期时间（秒）
   * @param {string} value - 键值
   * @returns {Promise<string>} 'OK'
   */
  async setex(key, seconds, value) {
    return this._executeOperation('setex', [key, seconds, value], () => {
      this._store.set(key, value)
      // 模拟过期（实际测试中通常不需要真正的过期）
      return 'OK'
    })
  }

  /**
   * DEL 操作
   *
   * @param {...string} keys - 要删除的键名
   * @returns {Promise<number>} 删除的键数量
   */
  async del(...keys) {
    return this._executeOperation('del', keys, () => {
      let deleted = 0
      keys.forEach(key => {
        if (this._store.has(key)) {
          this._store.delete(key)
          deleted++
        }
      })
      return deleted
    })
  }

  /**
   * EXISTS 操作
   *
   * @param {string} key - 键名
   * @returns {Promise<number>} 存在返回 1，不存在返回 0
   */
  async exists(key) {
    return this._executeOperation('exists', [key], () => {
      return this._store.has(key) ? 1 : 0
    })
  }

  /**
   * KEYS 操作（模式匹配）
   *
   * @param {string} pattern - 匹配模式
   * @returns {Promise<string[]>} 匹配的键数组
   */
  async keys(pattern) {
    return this._executeOperation('keys', [pattern], () => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
      return Array.from(this._store.keys()).filter(key => regex.test(key))
    })
  }

  /**
   * SCAN 操作（游标遍历）
   *
   * @param {string} cursor - 游标位置
   * @param {string} matchArg - 'MATCH' 参数
   * @param {string} pattern - 匹配模式
   * @param {string} countArg - 'COUNT' 参数
   * @param {number} count - 返回数量
   * @returns {Promise<[string, string[]]>} [新游标, 匹配的键数组]
   */
  async scan(cursor, matchArg, pattern, countArg, count) {
    return this._executeOperation('scan', [cursor, matchArg, pattern, countArg, count], () => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
      const matchedKeys = Array.from(this._store.keys()).filter(key => regex.test(key))

      // 简化实现：一次返回所有匹配的键
      return ['0', matchedKeys]
    })
  }

  /**
   * INCR 操作
   *
   * @param {string} key - 键名
   * @returns {Promise<number>} 增加后的值
   */
  async incr(key) {
    return this._executeOperation('incr', [key], () => {
      const current = parseInt(this._store.get(key) || '0', 10)
      const newValue = current + 1
      this._store.set(key, String(newValue))
      return newValue
    })
  }

  /**
   * INCRBY 操作
   *
   * @param {string} key - 键名
   * @param {number} increment - 增量
   * @returns {Promise<number>} 增加后的值
   */
  async incrby(key, increment) {
    return this._executeOperation('incrby', [key, increment], () => {
      const current = parseInt(this._store.get(key) || '0', 10)
      const newValue = current + increment
      this._store.set(key, String(newValue))
      return newValue
    })
  }

  /**
   * EXPIRE 操作
   *
   * @param {string} key - 键名
   * @param {number} seconds - 过期时间（秒）
   * @returns {Promise<number>} 成功返回 1，键不存在返回 0
   */
  async expire(key, seconds) {
    return this._executeOperation('expire', [key, seconds], () => {
      return this._store.has(key) ? 1 : 0
    })
  }

  /**
   * TTL 操作
   *
   * @param {string} key - 键名
   * @returns {Promise<number>} 剩余过期时间（秒），键不存在返回 -2，无过期时间返回 -1
   */
  async ttl(key) {
    return this._executeOperation('ttl', [key], () => {
      return this._store.has(key) ? -1 : -2
    })
  }

  /**
   * SETNX 操作（仅在键不存在时设置）
   *
   * @param {string} key - 键名
   * @param {string} value - 键值
   * @returns {Promise<number>} 成功返回 1，键已存在返回 0
   */
  async setnx(key, value) {
    return this._executeOperation('setnx', [key, value], () => {
      if (this._store.has(key)) {
        return 0
      }
      this._store.set(key, value)
      return 1
    })
  }

  /**
   * HGET 操作
   *
   * @param {string} key - Hash 键名
   * @param {string} field - 字段名
   * @returns {Promise<string|null>} 字段值或 null
   */
  async hget(key, field) {
    return this._executeOperation('hget', [key, field], () => {
      const hash = this._store.get(key)
      if (hash && typeof hash === 'object') {
        return hash[field] || null
      }
      return null
    })
  }

  /**
   * HSET 操作
   *
   * @param {string} key - Hash 键名
   * @param {string} field - 字段名
   * @param {string} value - 字段值
   * @returns {Promise<number>} 新字段返回 1，已存在字段返回 0
   */
  async hset(key, field, value) {
    return this._executeOperation('hset', [key, field, value], () => {
      let hash = this._store.get(key)
      if (!hash || typeof hash !== 'object') {
        hash = {}
        this._store.set(key, hash)
      }
      const isNew = !(field in hash)
      hash[field] = value
      return isNew ? 1 : 0
    })
  }

  /**
   * HGETALL 操作
   *
   * @param {string} key - Hash 键名
   * @returns {Promise<Object>} Hash 对象或空对象
   */
  async hgetall(key) {
    return this._executeOperation('hgetall', [key], () => {
      const hash = this._store.get(key)
      return hash && typeof hash === 'object' ? { ...hash } : {}
    })
  }

  /**
   * HDEL 操作
   *
   * @param {string} key - Hash 键名
   * @param {string} field - 字段名
   * @returns {Promise<number>} 删除的字段数量
   */
  async hdel(key, field) {
    return this._executeOperation('hdel', [key, field], () => {
      const hash = this._store.get(key)
      if (hash && typeof hash === 'object' && field in hash) {
        delete hash[field]
        return 1
      }
      return 0
    })
  }

  /**
   * ZADD 操作（有序集合添加成员）
   *
   * @param {string} key - 键名
   * @param {number} score - 分数
   * @param {string} member - 成员值
   * @returns {Promise<number>} 新添加的成员数量
   */
  async zadd(key, score, member) {
    return this._executeOperation('zadd', [key, score, member], () => {
      let zset = this._store.get(key)
      if (!zset || !(zset instanceof Map)) {
        zset = new Map()
        this._store.set(key, zset)
      }
      const isNew = !zset.has(member)
      zset.set(member, score)
      return isNew ? 1 : 0
    })
  }

  /**
   * ZREMRANGEBYSCORE 操作（删除有序集合指定分数范围的成员）
   *
   * @param {string} key - 键名
   * @param {number} min - 最小分数
   * @param {number} max - 最大分数
   * @returns {Promise<number>} 删除的成员数量
   */
  async zremrangebyscore(key, min, max) {
    return this._executeOperation('zremrangebyscore', [key, min, max], () => {
      const zset = this._store.get(key)
      if (!zset || !(zset instanceof Map)) {
        return 0
      }
      let deleted = 0
      for (const [member, score] of zset.entries()) {
        if (score >= min && score <= max) {
          zset.delete(member)
          deleted++
        }
      }
      return deleted
    })
  }

  /**
   * ZCARD 操作（获取有序集合成员数量）
   *
   * @param {string} key - 键名
   * @returns {Promise<number>} 成员数量
   */
  async zcard(key) {
    return this._executeOperation('zcard', [key], () => {
      const zset = this._store.get(key)
      if (!zset || !(zset instanceof Map)) {
        return 0
      }
      return zset.size
    })
  }

  /**
   * ZCOUNT 操作（获取有序集合指定分数范围的成员数量）
   *
   * @param {string} key - 键名
   * @param {number} min - 最小分数
   * @param {number} max - 最大分数
   * @returns {Promise<number>} 成员数量
   */
  async zcount(key, min, max) {
    return this._executeOperation('zcount', [key, min, max], () => {
      const zset = this._store.get(key)
      if (!zset || !(zset instanceof Map)) {
        return 0
      }
      let count = 0
      for (const score of zset.values()) {
        if (score >= min && score <= max) {
          count++
        }
      }
      return count
    })
  }

  /**
   * MULTI 操作（创建事务）
   *
   * @returns {Promise<MockMulti>} Mock Multi 对象
   */
  async multi() {
    return this._executeOperation('multi', [], () => {
      return new MockMulti(this)
    })
  }

  /**
   * PIPELINE 操作（创建管道）
   *
   * @returns {Promise<MockPipeline>} Mock Pipeline 对象
   */
  async pipeline() {
    return this._executeOperation('pipeline', [], () => {
      return new MockPipeline(this)
    })
  }

  /**
   * EVAL 操作（执行 Lua 脚本）
   *
   * @param {string} script - Lua 脚本内容
   * @param {number} numKeys - 键的数量
   * @param {...any} args - 脚本参数
   * @returns {Promise<any>} 脚本执行结果（Mock 实现返回 null）
   */
  async eval(script, numKeys, ...args) {
    return this._executeOperation('eval', [script, numKeys, ...args], () => {
      /*
       * Mock 实现：简化处理，返回 null
       * 实际 Lua 脚本逻辑需要根据具体业务场景定制
       */
      return null
    })
  }

  /**
   * PING 操作
   *
   * @returns {Promise<string>} 'PONG'
   */
  async ping() {
    return this._executeOperation('ping', [], () => 'PONG')
  }

  /**
   * INFO 操作
   *
   * @param {string} section - 信息分区
   * @returns {Promise<string>} Redis 服务器信息
   */
  async info(section) {
    return this._executeOperation('info', [section], () => {
      return `# Mock Redis Info\nredis_version:6.0.0-mock\nconnected_clients:1`
    })
  }

  /**
   * 断开连接
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    this._status = REDIS_STATUS.DISCONNECTED
    this.emit('close')
  }

  /**
   * 退出连接
   *
   * @returns {Promise<void>}
   */
  async quit() {
    await this.disconnect()
  }

  // ==================== 内部方法 ====================

  /**
   * 执行操作（带故障注入和延迟模拟）
   *
   * @private
   * @param {string} operation - 操作名称
   * @param {Array} args - 操作参数
   * @param {Function} executor - 实际执行函数
   * @returns {Promise<any>} 操作结果
   */
  async _executeOperation(operation, args, executor) {
    this._stats.total_calls++
    this._call_history.push({
      operation,
      args,
      timestamp: Date.now()
    })

    // 模拟延迟
    if (this._latency_ms > 0) {
      await this._delay(this._latency_ms)
    }

    // 检查连接状态
    if (this._status !== REDIS_STATUS.CONNECTED) {
      this._stats.failed_calls++
      this._stats.simulated_faults++
      throw this._createError(this._fault_type)
    }

    // 检查故障类型
    if (this._fault_type !== REDIS_FAULT_TYPE.NONE) {
      this._stats.failed_calls++
      this._stats.simulated_faults++
      throw this._createError(this._fault_type)
    }

    // 随机故障检查
    if (this._fault_rate > 0 && Math.random() < this._fault_rate) {
      this._stats.failed_calls++
      this._stats.simulated_faults++
      const randomFaultTypes = [
        REDIS_FAULT_TYPE.TIMEOUT,
        REDIS_FAULT_TYPE.CONNECTION_RESET,
        REDIS_FAULT_TYPE.OPERATION_TIMEOUT
      ]
      const randomFault = randomFaultTypes[Math.floor(Math.random() * randomFaultTypes.length)]
      throw this._createError(randomFault)
    }

    // 正常执行
    try {
      const result = await executor()
      this._stats.successful_calls++
      return result
    } catch (error) {
      this._stats.failed_calls++
      throw error
    }
  }

  /**
   * 创建 Redis 错误对象
   *
   * @private
   * @param {string} fault_type - 故障类型
   * @returns {Error} Redis 错误对象
   */
  _createError(fault_type) {
    const message = FAULT_ERROR_MESSAGES[fault_type] || `Redis error: ${fault_type}`
    const error = new Error(message)
    error.code = fault_type === REDIS_FAULT_TYPE.CONNECTION_REFUSED ? 'ECONNREFUSED' : 'REDIS_ERROR'
    error.fault_type = fault_type
    return error
  }

  /**
   * 延迟执行
   *
   * @private
   * @param {number} ms - 延迟毫秒数
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ==================== 测试辅助方法 ====================

  /**
   * 获取调用历史
   *
   * @returns {Array} 调用历史记录
   */
  getCallHistory() {
    return [...this._call_history]
  }

  /**
   * 获取统计数据
   *
   * @returns {Object} 统计数据
   */
  getStats() {
    return { ...this._stats }
  }

  /**
   * 获取存储的所有数据
   *
   * @returns {Object} 存储数据对象
   */
  getStoredData() {
    const data = {}
    this._store.forEach((value, key) => {
      data[key] = value
    })
    return data
  }

  /**
   * 预设存储数据
   *
   * @param {Object} data - 要预设的数据
   * @returns {MockRedisClient} 返回自身以支持链式调用
   */
  presetData(data) {
    Object.entries(data).forEach(([key, value]) => {
      this._store.set(key, value)
    })
    return this
  }

  /**
   * 断言操作被调用
   *
   * @param {string} operation - 操作名称
   * @param {number} times - 期望调用次数（可选）
   * @returns {boolean} 是否满足断言
   */
  assertOperationCalled(operation, times = null) {
    const calls = this._call_history.filter(call => call.operation === operation)
    if (times !== null) {
      return calls.length === times
    }
    return calls.length > 0
  }
}

// ==================== 熔断测试控制器 ====================

/**
 * 熔断测试控制器
 *
 * @description 提供高层次的熔断测试控制接口
 *
 * @example
 * const controller = new CircuitBreakerTestController()
 *
 * // 测试场景 1：Redis 完全不可用
 * controller.simulateRedisDown()
 * await testDegradedBehavior()
 * controller.restoreRedis()
 *
 * // 测试场景 2：Redis 间歇性故障（50% 故障率）
 * controller.simulateIntermittentFaults(0.5)
 * await testRetryBehavior()
 * controller.restoreRedis()
 */
class CircuitBreakerTestController {
  constructor() {
    this._mock_client = null
    this._original_client = null
    this._is_mock_active = false
  }

  /**
   * 创建 Mock Redis 客户端
   *
   * @param {Object} options - Mock 客户端配置
   * @returns {MockRedisClient} Mock 客户端实例
   */
  createMockClient(options = {}) {
    this._mock_client = new MockRedisClient(options)
    return this._mock_client
  }

  /**
   * 获取当前 Mock 客户端
   *
   * @returns {MockRedisClient|null} Mock 客户端实例或 null
   */
  getMockClient() {
    return this._mock_client
  }

  /**
   * 模拟 Redis 完全不可用
   *
   * @description 用于测试系统在 Redis 完全不可用时的降级行为
   * @returns {CircuitBreakerTestController} 返回自身以支持链式调用
   */
  simulateRedisDown() {
    if (!this._mock_client) {
      this.createMockClient()
    }
    this._mock_client.simulateDisconnect()
    this._is_mock_active = true
    return this
  }

  /**
   * 模拟 Redis 超时
   *
   * @description 用于测试系统处理超时的能力
   * @param {number} latency_ms - 模拟延迟（毫秒），默认 5000
   * @returns {CircuitBreakerTestController} 返回自身以支持链式调用
   */
  simulateRedisTimeout(latency_ms = 5000) {
    if (!this._mock_client) {
      this.createMockClient()
    }
    this._mock_client.simulateConnect()
    this._mock_client.setLatency(latency_ms)
    this._mock_client.setFaultType(REDIS_FAULT_TYPE.OPERATION_TIMEOUT)
    this._is_mock_active = true
    return this
  }

  /**
   * 模拟间歇性故障
   *
   * @description 用于测试系统的重试和熔断机制
   * @param {number} fault_rate - 故障率（0-1），默认 0.5
   * @returns {CircuitBreakerTestController} 返回自身以支持链式调用
   */
  simulateIntermittentFaults(fault_rate = 0.5) {
    if (!this._mock_client) {
      this.createMockClient()
    }
    this._mock_client.simulateConnect()
    this._mock_client.setFaultRate(fault_rate)
    this._is_mock_active = true
    return this
  }

  /**
   * 模拟只读模式（主从切换场景）
   *
   * @description 用于测试系统处理只读 Redis 的能力
   * @returns {CircuitBreakerTestController} 返回自身以支持链式调用
   */
  simulateReadonlyMode() {
    if (!this._mock_client) {
      this.createMockClient()
    }
    this._mock_client.simulateConnect()
    this._mock_client.setFaultType(REDIS_FAULT_TYPE.READONLY)
    this._is_mock_active = true
    return this
  }

  /**
   * 恢复 Redis 正常状态
   *
   * @returns {CircuitBreakerTestController} 返回自身以支持链式调用
   */
  restoreRedis() {
    if (this._mock_client) {
      this._mock_client.reset()
      this._mock_client.simulateConnect()
    }
    return this
  }

  /**
   * 清理并重置控制器
   *
   * @returns {CircuitBreakerTestController} 返回自身以支持链式调用
   */
  cleanup() {
    if (this._mock_client) {
      this._mock_client.reset()
    }
    this._is_mock_active = false
    return this
  }

  /**
   * 检查 Mock 是否处于活动状态
   *
   * @returns {boolean} Mock 是否活动
   */
  isMockActive() {
    return this._is_mock_active
  }

  /**
   * 获取测试统计
   *
   * @returns {Object|null} 统计数据或 null
   */
  getTestStats() {
    return this._mock_client ? this._mock_client.getStats() : null
  }
}

// ==================== 测试场景预设 ====================

/**
 * 预定义的熔断测试场景
 * @constant
 */
const CIRCUIT_BREAKER_SCENARIOS = {
  /**
   * 场景 1：Redis 完全不可用
   *
   * @description 测试系统在 Redis 服务完全宕机时的降级行为
   * 预期：
   * - 缓存读取应该返回 null 并降级查库
   * - 缓存写入应该静默失败（不阻塞业务）
   * - 系统应该继续正常运行
   */
  REDIS_COMPLETELY_DOWN: {
    name: 'Redis完全不可用',
    description: '模拟 Redis 服务完全宕机，所有操作都失败',
    setup: controller => {
      controller.simulateRedisDown()
    },
    expected_behaviors: [
      '缓存读取返回 null',
      '缓存写入静默失败',
      '业务降级到数据库查询',
      '系统正常响应请求'
    ]
  },

  /**
   * 场景 2：Redis 超时
   *
   * @description 测试系统在 Redis 响应缓慢时的超时处理
   * 预期：
   * - 超过超时阈值的请求应该失败
   * - 系统应该快速失败而不是无限等待
   * - 触发熔断器打开
   */
  REDIS_TIMEOUT: {
    name: 'Redis超时',
    description: '模拟 Redis 响应极其缓慢，触发超时',
    setup: controller => {
      controller.simulateRedisTimeout(10000) // 10秒超时
    },
    expected_behaviors: ['请求超时失败', '触发熔断器', '快速失败而非等待', '降级到备用逻辑']
  },

  /**
   * 场景 3：间歇性故障（混沌测试）
   *
   * @description 测试系统在 Redis 不稳定时的重试和恢复能力
   * 预期：
   * - 部分请求成功，部分失败
   * - 系统应该有重试机制
   * - 统计成功率
   */
  INTERMITTENT_FAILURES: {
    name: '间歇性故障',
    description: '模拟 50% 的请求随机失败',
    setup: controller => {
      controller.simulateIntermittentFaults(0.5)
    },
    expected_behaviors: ['部分请求成功', '部分请求失败', '重试机制生效', '最终成功率 > 50%']
  },

  /**
   * 场景 4：只读模式
   *
   * @description 测试系统在 Redis 处于只读模式时的行为
   * 预期：
   * - 读操作正常
   * - 写操作失败
   * - 缓存写入降级处理
   */
  READONLY_MODE: {
    name: '只读模式',
    description: '模拟 Redis 主从切换，临时处于只读状态',
    setup: controller => {
      controller.simulateReadonlyMode()
    },
    expected_behaviors: ['读操作正常（如果已缓存）', '写操作失败', '写入降级静默处理', '系统继续服务']
  }
}

// ==================== 辅助函数 ====================

/**
 * 创建 Redis 健康检查函数（用于测试）
 *
 * @description 返回一个检查函数，根据 Mock 客户端状态返回健康状态
 * @param {MockRedisClient} mock_client - Mock 客户端实例
 * @returns {Function} 健康检查函数
 *
 * @example
 * const checkHealth = createHealthChecker(mockClient)
 * const isHealthy = await checkHealth()
 * // 返回 true（连接正常）或 false（连接异常）
 */
function createHealthChecker(mock_client) {
  return async function isRedisHealthy() {
    if (!mock_client) {
      return false
    }

    try {
      const result = await mock_client.ping()
      return result === 'PONG'
    } catch (error) {
      return false
    }
  }
}

/**
 * 运行熔断测试场景
 *
 * @description 执行预定义的熔断测试场景并返回测试结果
 * @param {string} scenario_name - 场景名称
 * @param {Function} test_fn - 测试函数，接收 mock_client 和 controller 参数
 * @returns {Promise<Object>} 测试结果对象
 *
 * @example
 * const result = await runCircuitBreakerScenario('REDIS_COMPLETELY_DOWN', async (mockClient, controller) => {
 *   const response = await someServiceThatUsesRedis()
 *   return { success: response.success, degraded: response.from_cache === false }
 * })
 *
 * console.log(result.passed, result.stats)
 */
async function runCircuitBreakerScenario(scenario_name, test_fn) {
  const scenario = CIRCUIT_BREAKER_SCENARIOS[scenario_name]
  if (!scenario) {
    throw new Error(`未知的熔断测试场景: ${scenario_name}`)
  }

  const controller = new CircuitBreakerTestController()
  const mock_client = controller.createMockClient()

  const result = {
    scenario_name,
    scenario_description: scenario.description,
    expected_behaviors: scenario.expected_behaviors,
    passed: false,
    test_result: null,
    stats: null,
    error: null
  }

  try {
    // 设置场景
    scenario.setup(controller)

    // 执行测试
    result.test_result = await test_fn(mock_client, controller)
    result.passed = true
  } catch (error) {
    result.error = error.message
  } finally {
    // 获取统计并清理
    result.stats = controller.getTestStats()
    controller.cleanup()
  }

  return result
}

/**
 * 延迟执行（测试工具）
 *
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ==================== UnifiedRedisClient 模拟包装器 ====================

/**
 * Mock UnifiedRedisClient 包装器
 *
 * @description 模拟项目中的 UnifiedRedisClient，用于熔断测试时替换真实客户端
 * @example
 * const { createMockUnifiedRedisClient } = require('./test-mock-redis')
 *
 * // 创建Mock客户端
 * const mockUnified = createMockUnifiedRedisClient()
 *
 * // 模拟故障
 * mockUnified.simulateDisconnect()
 *
 * // 注入到服务层
 * jest.mock('../../utils/UnifiedRedisClient', () => ({
 *   getRedisClient: () => mockUnified,
 *   getRawClient: () => mockUnified.getClient(),
 *   isRedisHealthy: async () => mockUnified.healthCheck()
 * }))
 */
class MockUnifiedRedisClient {
  /**
   * 创建 Mock UnifiedRedisClient 实例
   *
   * @param {Object} options - 配置选项
   * @param {string} options.initial_status - 初始连接状态
   * @param {string} options.fault_type - 初始故障类型
   */
  constructor(options = {}) {
    this._mockClient = new MockRedisClient(options)
    this._config = {
      url: 'redis://mock:6379',
      host: 'mock',
      port: 6379,
      db: 0
    }
    this.isConnected = this._mockClient.status === REDIS_STATUS.CONNECTED
  }

  /**
   * 获取 Mock 主客户端
   * @returns {MockRedisClient} Mock 客户端实例
   */
  getClient() {
    return this._mockClient
  }

  /**
   * 获取 Mock 发布客户端（返回同一个Mock客户端）
   * @returns {MockRedisClient} Mock 客户端实例
   */
  getPubClient() {
    return this._mockClient
  }

  /**
   * 获取 Mock 订阅客户端（返回同一个Mock客户端）
   * @returns {MockRedisClient} Mock 客户端实例
   */
  getSubClient() {
    return this._mockClient
  }

  /**
   * 确保连接（模拟）
   * @returns {Promise<MockRedisClient>} Mock 客户端实例
   */
  async ensureConnection() {
    if (this._mockClient.status !== REDIS_STATUS.CONNECTED) {
      throw this._mockClient._createError(this._mockClient._fault_type)
    }
    return this._mockClient
  }

  /**
   * 健康检查
   * @returns {Promise<boolean>} 连接是否健康
   */
  async healthCheck() {
    try {
      const result = await this._mockClient.ping()
      return result === 'PONG'
    } catch {
      return false
    }
  }

  // 代理所有 Redis 操作到底层 MockRedisClient
  async set(key, value, ttl = null) {
    if (ttl) {
      return await this._mockClient.setex(key, ttl, value)
    }
    return await this._mockClient.set(key, value)
  }

  async get(key) {
    return await this._mockClient.get(key)
  }

  async del(key) {
    return await this._mockClient.del(key)
  }

  async exists(key) {
    return await this._mockClient.exists(key)
  }

  async expire(key, ttl) {
    return await this._mockClient.expire(key, ttl)
  }

  async hset(key, field, value) {
    return await this._mockClient.hset(key, field, value)
  }

  async hget(key, field) {
    return await this._mockClient.hget(key, field)
  }

  async hgetall(key) {
    return await this._mockClient.hgetall(key)
  }

  async hdel(key, field) {
    return await this._mockClient.hdel(key, field)
  }

  async zadd(key, score, member) {
    return await this._mockClient.zadd(key, score, member)
  }

  async zremrangebyscore(key, min, max) {
    return await this._mockClient.zremrangebyscore(key, min, max)
  }

  async zcard(key) {
    return await this._mockClient.zcard(key)
  }

  async zcount(key, min, max) {
    return await this._mockClient.zcount(key, min, max)
  }

  async multi() {
    return await this._mockClient.multi()
  }

  async pipeline() {
    return await this._mockClient.pipeline()
  }

  async eval(script, numKeys, ...args) {
    return await this._mockClient.eval(script, numKeys, ...args)
  }

  async scan(cursor, matchPattern, pattern, countKeyword, count) {
    return await this._mockClient.scan(cursor, matchPattern, pattern, countKeyword, count)
  }

  async disconnect() {
    await this._mockClient.disconnect()
    this.isConnected = false
  }

  /**
   * 获取连接状态
   * @returns {Object} 连接状态对象
   */
  getStatus() {
    return {
      isConnected: this._mockClient.status === REDIS_STATUS.CONNECTED,
      config: this._config,
      clients: {
        main: this._mockClient.status,
        pub: this._mockClient.status,
        sub: this._mockClient.status
      }
    }
  }

  // ========== Mock 控制方法（继承自 MockRedisClient） ==========

  /**
   * 模拟连接
   * @returns {MockUnifiedRedisClient} 返回自身以支持链式调用
   */
  simulateConnect() {
    this._mockClient.simulateConnect()
    this.isConnected = true
    return this
  }

  /**
   * 模拟断开连接
   * @returns {MockUnifiedRedisClient} 返回自身以支持链式调用
   */
  simulateDisconnect() {
    this._mockClient.simulateDisconnect()
    this.isConnected = false
    return this
  }

  /**
   * 模拟错误
   * @param {string} fault_type - 故障类型
   * @returns {MockUnifiedRedisClient} 返回自身以支持链式调用
   */
  simulateError(fault_type = REDIS_FAULT_TYPE.CONNECTION_REFUSED) {
    this._mockClient.simulateError(fault_type)
    this.isConnected = false
    return this
  }

  /**
   * 设置模拟延迟
   * @param {number} latency_ms - 延迟毫秒数
   * @returns {MockUnifiedRedisClient} 返回自身以支持链式调用
   */
  setLatency(latency_ms) {
    this._mockClient.setLatency(latency_ms)
    return this
  }

  /**
   * 设置故障率
   * @param {number} rate - 故障率（0-1）
   * @returns {MockUnifiedRedisClient} 返回自身以支持链式调用
   */
  setFaultRate(rate) {
    this._mockClient.setFaultRate(rate)
    return this
  }

  /**
   * 重置所有模拟状态
   * @returns {MockUnifiedRedisClient} 返回自身以支持链式调用
   */
  reset() {
    this._mockClient.reset()
    this.isConnected = true
    return this
  }

  /**
   * 获取调用历史
   * @returns {Array} 调用历史记录
   */
  getCallHistory() {
    return this._mockClient.getCallHistory()
  }

  /**
   * 获取统计数据
   * @returns {Object} 统计数据
   */
  getStats() {
    return this._mockClient.getStats()
  }

  /**
   * 预设存储数据
   * @param {Object} data - 要预设的数据
   * @returns {MockUnifiedRedisClient} 返回自身以支持链式调用
   */
  presetData(data) {
    this._mockClient.presetData(data)
    return this
  }
}

/**
 * 创建 Mock UnifiedRedisClient 实例
 *
 * @param {Object} options - 配置选项
 * @returns {MockUnifiedRedisClient} Mock 实例
 *
 * @example
 * const mockRedis = createMockUnifiedRedisClient({ initial_status: REDIS_STATUS.CONNECTED })
 * mockRedis.simulateDisconnect()
 * await mockRedis.get('key') // 抛出连接错误
 */
function createMockUnifiedRedisClient(options = {}) {
  return new MockUnifiedRedisClient(options)
}

/**
 * 创建用于 Jest Mock 的对象
 *
 * @description 返回可直接用于 jest.mock() 的模块替换对象
 * @param {MockUnifiedRedisClient} mockClient - Mock 客户端实例
 * @returns {Object} Jest mock 对象
 *
 * @example
 * const mockClient = createMockUnifiedRedisClient()
 * const mockModule = createJestMockModule(mockClient)
 *
 * jest.mock('../../utils/UnifiedRedisClient', () => mockModule)
 */
function createJestMockModule(mockClient) {
  return {
    UnifiedRedisClient: class MockedUnifiedRedisClient {
      constructor() {
        return mockClient
      }
    },
    getRedisClient: () => mockClient,
    getRawClient: () => mockClient.getClient(),
    isRedisHealthy: async () => mockClient.healthCheck()
  }
}

// ==================== 模块导出 ====================

module.exports = {
  // 状态枚举
  REDIS_STATUS,
  REDIS_FAULT_TYPE,
  FAULT_ERROR_MESSAGES,

  // 核心类
  MockRedisClient,
  MockMulti,
  MockPipeline,
  MockUnifiedRedisClient,
  CircuitBreakerTestController,

  // 测试场景
  CIRCUIT_BREAKER_SCENARIOS,

  // 辅助函数
  createHealthChecker,
  runCircuitBreakerScenario,
  delay,

  // UnifiedRedisClient 模拟工具
  createMockUnifiedRedisClient,
  createJestMockModule
}
