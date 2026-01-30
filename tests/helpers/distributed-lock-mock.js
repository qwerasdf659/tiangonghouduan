'use strict'

/**
 * 🔐 分布式锁 Mock 工具 - 测试专用
 *
 * @description 提供分布式锁的模拟功能，用于测试锁相关的业务逻辑
 * 与项目的 UnifiedDistributedLock 保持 API 一致，支持无缝替换
 *
 * @version V1.0
 * @date 2026-01-30
 *
 * 核心功能：
 * 1. 模拟分布式锁的获取/释放/续期操作
 * 2. 支持锁超时自动释放模拟
 * 3. 支持锁竞争场景模拟
 * 4. 支持批量锁操作
 * 5. 提供锁状态查询和统计
 * 6. 支持故障注入（用于测试异常处理）
 *
 * 使用场景：
 * - 单元测试中隔离 Redis 依赖
 * - 测试锁竞争和死锁场景
 * - 测试锁超时自动释放
 * - 测试业务代码的锁异常处理
 * - 性能测试中的锁行为模拟
 *
 * 设计原则：
 * - API 与 UnifiedDistributedLock 完全一致
 * - 支持 Jest Mock 无缝替换
 * - 提供丰富的测试控制方法
 * - 支持多种故障模拟场景
 *
 * 模块结构：
 * - LOCK_STATUS：锁状态枚举
 * - LOCK_FAULT_TYPE：锁故障类型枚举
 * - MockDistributedLock：分布式锁 Mock 实现
 * - createMockDistributedLock：工厂函数
 * - createJestMockModule：Jest Mock 模块创建函数
 *
 * 使用示例：
 * ```javascript
 * const { MockDistributedLock } = require('../helpers/distributed-lock-mock')
 *
 * const mockLock = new MockDistributedLock()
 *
 * // 获取锁
 * const lockInfo = await mockLock.acquireLock('resource_123')
 *
 * // 执行临界区代码
 * try {
 *   // ... 业务逻辑
 * } finally {
 *   await mockLock.releaseLock(lockInfo)
 * }
 *
 * // 或使用 withLock 自动管理
 * await mockLock.withLock('resource_123', async () => {
 *   // ... 业务逻辑
 * })
 * ```
 *
 * Jest Mock 替换示例：
 * ```javascript
 * const { createMockDistributedLock, createJestMockModule } = require('../helpers/distributed-lock-mock')
 *
 * const mockLock = createMockDistributedLock()
 * jest.mock('../../utils/UnifiedDistributedLock', () => createJestMockModule(mockLock))
 *
 * // 测试代码中 new UnifiedDistributedLock() 将返回 mockLock
 * ```
 *
 * @file tests/helpers/distributed-lock-mock.js
 */

const { v4: uuidv4 } = require('uuid')

// ==================== 状态枚举 ====================

/**
 * 锁状态枚举
 * @readonly
 * @enum {string}
 */
const LOCK_STATUS = {
  /** 锁可用（未被持有） */
  AVAILABLE: 'available',
  /** 锁被持有 */
  HELD: 'held',
  /** 锁已过期 */
  EXPIRED: 'expired'
}

/**
 * 锁故障类型枚举
 * @readonly
 * @enum {string}
 */
const LOCK_FAULT_TYPE = {
  /** 无故障 */
  NONE: 'none',
  /** 获取锁超时 */
  ACQUIRE_TIMEOUT: 'acquire_timeout',
  /** 释放锁失败 */
  RELEASE_FAILED: 'release_failed',
  /** 续期失败 */
  EXTEND_FAILED: 'extend_failed',
  /** Redis 连接失败 */
  REDIS_ERROR: 'redis_error',
  /** 锁已被其他进程持有 */
  LOCK_HELD: 'lock_held',
  /** 随机故障（用于混沌测试） */
  RANDOM: 'random'
}

/**
 * 故障错误消息映射
 * @constant
 */
const LOCK_FAULT_MESSAGES = {
  [LOCK_FAULT_TYPE.ACQUIRE_TIMEOUT]: '获取锁超时：资源被其他进程锁定',
  [LOCK_FAULT_TYPE.RELEASE_FAILED]: '释放锁失败：锁可能已过期或被其他进程释放',
  [LOCK_FAULT_TYPE.EXTEND_FAILED]: '续期锁失败：锁可能已过期',
  [LOCK_FAULT_TYPE.REDIS_ERROR]: 'Redis 连接错误：无法执行锁操作',
  [LOCK_FAULT_TYPE.LOCK_HELD]: '锁已被其他进程持有',
  [LOCK_FAULT_TYPE.RANDOM]: '随机故障：锁操作失败'
}

// ==================== Mock Distributed Lock ====================

/**
 * Mock 分布式锁
 *
 * @description 模拟 UnifiedDistributedLock，用于测试锁相关的业务逻辑
 *
 * @example
 * const mockLock = new MockDistributedLock()
 *
 * // 模拟获取锁成功
 * const lockInfo = await mockLock.acquireLock('resource_123')
 *
 * // 模拟锁竞争（获取锁失败）
 * mockLock.simulateLockHeld('resource_456')
 * const result = await mockLock.acquireLock('resource_456', 1000, 0) // 不重试
 * // result === null
 *
 * // 模拟故障
 * mockLock.simulateError(LOCK_FAULT_TYPE.REDIS_ERROR)
 * await mockLock.acquireLock('resource') // 抛出 Redis 错误
 */
class MockDistributedLock {
  /**
   * 创建 Mock 分布式锁实例
   *
   * @param {Object} options - 配置选项
   * @param {number} options.default_ttl - 默认锁 TTL（毫秒），默认 30000
   * @param {string} options.lock_prefix - 锁键前缀，默认 'lock:'
   * @param {boolean} options.enable_auto_expire - 是否启用自动过期，默认 true
   */
  constructor(options = {}) {
    this._options = {
      default_ttl: 30000,
      lock_prefix: 'lock:',
      enable_auto_expire: true,
      ...options
    }

    // 锁存储：resource -> lockInfo
    this._locks = new Map()

    // 过期定时器存储：resource -> timerId
    this._expire_timers = new Map()

    // 故障注入
    this._fault_type = LOCK_FAULT_TYPE.NONE
    this._fault_rate = 0 // 随机故障率（0-1）

    // 预设被锁定的资源（用于模拟锁竞争）
    this._held_resources = new Set()

    // 调用历史记录
    this._call_history = []

    // 统计数据
    this._stats = {
      acquire_attempts: 0,
      acquire_successes: 0,
      acquire_failures: 0,
      release_attempts: 0,
      release_successes: 0,
      extend_attempts: 0,
      extend_successes: 0,
      simulated_faults: 0
    }
  }

  // ==================== 核心锁操作 ====================

  /**
   * 获取分布式锁 - 支持重试机制
   *
   * @param {string} resource - 资源标识
   * @param {number} ttl - 锁过期时间（毫秒），默认 30秒
   * @param {number} max_retries - 最大重试次数，默认 3次
   * @param {number} retry_delay - 重试延迟（毫秒），默认 100ms
   * @returns {Promise<Object|null>} 锁信息对象或 null（获取失败）
   *
   * @example
   * const lockInfo = await mockLock.acquireLock('prize_123', 5000, 3, 100)
   * if (lockInfo) {
   *   console.log('获取锁成功:', lockInfo.lockValue)
   * } else {
   *   console.log('获取锁失败')
   * }
   */
  async acquireLock(resource, ttl = this._options.default_ttl, max_retries = 3, retry_delay = 100) {
    this._stats.acquire_attempts++
    this._recordCall('acquireLock', { resource, ttl, max_retries, retry_delay })

    // 检查故障注入
    if (await this._checkFault('acquireLock')) {
      this._stats.acquire_failures++
      return null
    }

    const lock_key = `${this._options.lock_prefix}${resource}`

    for (let attempt = 0; attempt <= max_retries; attempt++) {
      // 检查资源是否被预设为锁定状态
      if (this._held_resources.has(resource)) {
        if (attempt < max_retries) {
          await this._sleep(retry_delay * Math.pow(2, attempt))
          continue
        }
        this._stats.acquire_failures++
        return null
      }

      // 检查锁是否已被持有
      const existing_lock = this._locks.get(resource)
      if (existing_lock && existing_lock.expiresAt > Date.now()) {
        if (attempt < max_retries) {
          await this._sleep(retry_delay * Math.pow(2, attempt))
          continue
        }
        this._stats.acquire_failures++
        return null
      }

      // 创建新锁
      const lock_value = uuidv4()
      const lock_info = {
        resource,
        lockKey: lock_key,
        lockValue: lock_value,
        ttl,
        acquiredAt: Date.now(),
        expiresAt: Date.now() + ttl
      }

      // 存储锁
      this._locks.set(resource, lock_info)

      // 设置自动过期定时器
      if (this._options.enable_auto_expire) {
        this._setExpireTimer(resource, ttl)
      }

      this._stats.acquire_successes++
      console.log(`[MockDistributedLock] 成功获取锁: ${resource}, 值: ${lock_value}`)
      return lock_info
    }

    this._stats.acquire_failures++
    console.log(`[MockDistributedLock] 获取锁最终失败: ${resource}`)
    return null
  }

  /**
   * 释放分布式锁
   *
   * @param {Object} lock - 锁信息对象
   * @returns {Promise<boolean>} 是否成功释放锁
   *
   * @example
   * const success = await mockLock.releaseLock(lockInfo)
   * console.log(success ? '释放成功' : '释放失败')
   */
  async releaseLock(lock) {
    this._stats.release_attempts++
    this._recordCall('releaseLock', { lock })

    if (!lock || !lock.lockKey || !lock.lockValue) {
      console.warn('[MockDistributedLock] 释放锁失败: 无效的锁对象')
      return false
    }

    // 检查故障注入
    if (await this._checkFault('releaseLock')) {
      return false
    }

    const existing_lock = this._locks.get(lock.resource)

    // 验证锁值是否匹配（只有持有者可以释放锁）
    if (!existing_lock || existing_lock.lockValue !== lock.lockValue) {
      console.warn(
        `[MockDistributedLock] 释放锁失败，锁可能已过期或被其他进程释放: ${lock.resource}`
      )
      return false
    }

    // 清除锁
    this._locks.delete(lock.resource)
    this._clearExpireTimer(lock.resource)

    this._stats.release_successes++
    console.log(`[MockDistributedLock] 成功释放锁: ${lock.resource}`)
    return true
  }

  /**
   * 续期分布式锁
   *
   * @param {Object} lock - 锁信息对象
   * @param {number} extend_ttl - 延长时间（毫秒）
   * @returns {Promise<boolean>} 是否成功续期
   *
   * @example
   * const success = await mockLock.extendLock(lockInfo, 10000)
   */
  async extendLock(lock, extend_ttl = this._options.default_ttl) {
    this._stats.extend_attempts++
    this._recordCall('extendLock', { lock, extend_ttl })

    if (!lock || !lock.lockKey || !lock.lockValue) {
      console.warn('[MockDistributedLock] 续期锁失败: 无效的锁对象')
      return false
    }

    // 检查故障注入
    if (await this._checkFault('extendLock')) {
      return false
    }

    const existing_lock = this._locks.get(lock.resource)

    // 验证锁值是否匹配
    if (!existing_lock || existing_lock.lockValue !== lock.lockValue) {
      console.warn(`[MockDistributedLock] 续期锁失败，锁可能已过期: ${lock.resource}`)
      return false
    }

    // 更新过期时间
    const new_expires_at = Date.now() + extend_ttl
    existing_lock.expiresAt = new_expires_at
    lock.expiresAt = new_expires_at

    // 重置过期定时器
    this._clearExpireTimer(lock.resource)
    if (this._options.enable_auto_expire) {
      this._setExpireTimer(lock.resource, extend_ttl)
    }

    this._stats.extend_successes++
    console.log(`[MockDistributedLock] 成功续期锁: ${lock.resource}, 延长${extend_ttl}ms`)
    return true
  }

  /**
   * 安全执行临界区代码 - 自动获取和释放锁
   *
   * @param {string} resource - 资源标识
   * @param {Function} critical_section - 临界区执行函数
   * @param {Object} options - 配置选项
   * @returns {Promise<any>} 临界区函数的返回值
   *
   * @example
   * const result = await mockLock.withLock('resource', async () => {
   *   return await doSomethingCritical()
   * })
   */
  async withLock(resource, critical_section, options = {}) {
    const {
      ttl = this._options.default_ttl,
      maxRetries = 3,
      retryDelay = 100,
      autoExtend = false,
      extendInterval = ttl * 0.6
    } = options

    const lock = await this.acquireLock(resource, ttl, maxRetries, retryDelay)
    if (!lock) {
      throw new Error(`无法获取锁: ${resource}`)
    }

    let extend_timer = null

    try {
      // 如果启用自动续期，设置定时器
      if (autoExtend) {
        extend_timer = setInterval(async () => {
          try {
            await this.extendLock(lock, ttl)
          } catch (error) {
            console.error(`[MockDistributedLock] 自动续期失败: ${resource}`, error)
          }
        }, extendInterval)
      }

      // 执行临界区代码
      console.log(`[MockDistributedLock] 开始执行临界区: ${resource}`)
      const result = await critical_section()
      console.log(`[MockDistributedLock] 临界区执行完成: ${resource}`)

      return result
    } catch (error) {
      console.error(`[MockDistributedLock] 临界区执行异常: ${resource}`, error)
      throw error
    } finally {
      // 清理自动续期定时器
      if (extend_timer) {
        clearInterval(extend_timer)
      }

      // 确保释放锁
      try {
        await this.releaseLock(lock)
      } catch (error) {
        console.error(`[MockDistributedLock] 释放锁失败: ${resource}`, error)
      }
    }
  }

  // ==================== 批量锁操作 ====================

  /**
   * 批量获取锁
   *
   * @param {Array<string>} resources - 资源标识列表
   * @param {number} ttl - 锁过期时间
   * @param {number} max_retries - 最大重试次数
   * @returns {Promise<Array<Object>|null>} 锁对象列表或 null
   */
  async acquireMultipleLocks(resources, ttl = this._options.default_ttl, max_retries = 3) {
    this._recordCall('acquireMultipleLocks', { resources, ttl, max_retries })

    if (!Array.isArray(resources) || resources.length === 0) {
      throw new Error('资源列表不能为空')
    }

    // 排序资源标识，避免死锁
    const sorted_resources = [...resources].sort()
    const locks = []

    try {
      for (const resource of sorted_resources) {
        const lock = await this.acquireLock(resource, ttl, max_retries)
        if (!lock) {
          // 获取锁失败，释放已获取的锁
          await this.releaseMultipleLocks(locks)
          return null
        }
        locks.push(lock)
      }

      console.log(`[MockDistributedLock] 成功获取多个锁: ${sorted_resources.join(', ')}`)
      return locks
    } catch (error) {
      // 发生异常，释放已获取的锁
      await this.releaseMultipleLocks(locks)
      throw error
    }
  }

  /**
   * 批量释放锁
   *
   * @param {Array<Object>} locks - 锁对象列表
   * @returns {Promise<boolean>} 是否全部成功释放
   */
  async releaseMultipleLocks(locks) {
    this._recordCall('releaseMultipleLocks', { locks })

    if (!Array.isArray(locks) || locks.length === 0) {
      return true
    }

    const results = await Promise.allSettled(locks.map(lock => this.releaseLock(lock)))

    const success = results.every(result => result.status === 'fulfilled' && result.value)

    if (!success) {
      const failures = results.filter(
        result => result.status === 'rejected' || !result.value
      ).length
      console.warn(`[MockDistributedLock] 批量释放锁部分失败: ${failures}/${locks.length}`)
    }

    return success
  }

  // ==================== 锁状态查询 ====================

  /**
   * 获取锁状态
   *
   * @param {string} resource - 资源标识
   * @returns {Promise<Object|null>} 锁状态信息
   */
  async getLockStatus(resource) {
    this._recordCall('getLockStatus', { resource })

    const lock = this._locks.get(resource)

    if (!lock) {
      return null
    }

    const ttl = lock.expiresAt - Date.now()
    return {
      resource,
      lockKey: lock.lockKey,
      lockValue: lock.lockValue,
      isLocked: ttl > 0,
      ttl: ttl > 0 ? ttl : 0,
      expiresAt: lock.expiresAt
    }
  }

  /**
   * 强制释放锁（谨慎使用）
   *
   * @param {string} resource - 资源标识
   * @returns {Promise<boolean>} 是否成功删除锁
   */
  async forceReleaseLock(resource) {
    this._recordCall('forceReleaseLock', { resource })

    const lock = this._locks.get(resource)
    if (lock) {
      this._locks.delete(resource)
      this._clearExpireTimer(resource)
      this._held_resources.delete(resource)
      console.log(`[MockDistributedLock] 强制释放锁成功: ${resource}`)
      return true
    }

    // 同时清除预设的锁定状态
    if (this._held_resources.has(resource)) {
      this._held_resources.delete(resource)
      console.log(`[MockDistributedLock] 清除预设锁定状态: ${resource}`)
      return true
    }

    console.log(`[MockDistributedLock] 锁不存在: ${resource}`)
    return false
  }

  /**
   * 获取统计信息
   *
   * @returns {Promise<Object>} 统计信息
   */
  async getStats() {
    return {
      totalLocks: this._locks.size,
      activeLocks: Array.from(this._locks.values()).filter(l => l.expiresAt > Date.now()).length,
      heldResources: this._held_resources.size,
      locks: Array.from(this._locks.entries()).map(([resource, lock]) => ({
        resource,
        lockKey: lock.lockKey,
        lockValue: lock.lockValue,
        ttl: Math.max(0, lock.expiresAt - Date.now())
      })),
      ...this._stats
    }
  }

  // ==================== 测试控制方法 ====================

  /**
   * 模拟资源被锁定（用于测试锁竞争）
   *
   * @param {string} resource - 资源标识
   * @returns {MockDistributedLock} 返回自身以支持链式调用
   *
   * @example
   * mockLock.simulateLockHeld('resource_123')
   * const result = await mockLock.acquireLock('resource_123', 1000, 0)
   * // result === null
   */
  simulateLockHeld(resource) {
    this._held_resources.add(resource)
    console.log(`[MockDistributedLock] 模拟资源锁定: ${resource}`)
    return this
  }

  /**
   * 清除模拟的锁定状态
   *
   * @param {string} resource - 资源标识
   * @returns {MockDistributedLock} 返回自身以支持链式调用
   */
  clearSimulatedLock(resource) {
    this._held_resources.delete(resource)
    console.log(`[MockDistributedLock] 清除模拟锁定: ${resource}`)
    return this
  }

  /**
   * 模拟故障
   *
   * @param {string} fault_type - 故障类型
   * @returns {MockDistributedLock} 返回自身以支持链式调用
   *
   * @example
   * mockLock.simulateError(LOCK_FAULT_TYPE.REDIS_ERROR)
   * await mockLock.acquireLock('resource') // 抛出 Redis 错误
   */
  simulateError(fault_type = LOCK_FAULT_TYPE.REDIS_ERROR) {
    this._fault_type = fault_type
    console.log(`[MockDistributedLock] 设置故障模拟: ${fault_type}`)
    return this
  }

  /**
   * 设置随机故障率
   *
   * @param {number} rate - 故障率（0-1）
   * @returns {MockDistributedLock} 返回自身以支持链式调用
   */
  setFaultRate(rate) {
    this._fault_rate = Math.min(1, Math.max(0, rate))
    return this
  }

  /**
   * 清除故障模拟
   *
   * @returns {MockDistributedLock} 返回自身以支持链式调用
   */
  clearFault() {
    this._fault_type = LOCK_FAULT_TYPE.NONE
    this._fault_rate = 0
    return this
  }

  /**
   * 重置所有状态
   *
   * @returns {MockDistributedLock} 返回自身以支持链式调用
   */
  reset() {
    // 清除所有锁
    this._locks.clear()

    // 清除所有过期定时器
    this._expire_timers.forEach(timer_id => clearTimeout(timer_id))
    this._expire_timers.clear()

    // 清除预设锁定状态
    this._held_resources.clear()

    // 重置故障注入
    this._fault_type = LOCK_FAULT_TYPE.NONE
    this._fault_rate = 0

    // 重置调用历史
    this._call_history = []

    // 重置统计数据
    this._stats = {
      acquire_attempts: 0,
      acquire_successes: 0,
      acquire_failures: 0,
      release_attempts: 0,
      release_successes: 0,
      extend_attempts: 0,
      extend_successes: 0,
      simulated_faults: 0
    }

    console.log('[MockDistributedLock] 状态已重置')
    return this
  }

  /**
   * 获取调用历史
   *
   * @returns {Array} 调用历史记录
   */
  getCallHistory() {
    return [...this._call_history]
  }

  /**
   * 断言方法被调用
   *
   * @param {string} method - 方法名称
   * @param {number} times - 期望调用次数（可选）
   * @returns {boolean} 是否满足断言
   */
  assertMethodCalled(method, times = null) {
    const calls = this._call_history.filter(call => call.method === method)
    if (times !== null) {
      return calls.length === times
    }
    return calls.length > 0
  }

  /**
   * 断开连接（兼容 UnifiedDistributedLock API）
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    // 清理所有定时器
    this._expire_timers.forEach(timer_id => clearTimeout(timer_id))
    this._expire_timers.clear()
    console.log('[MockDistributedLock] 连接已断开')
  }

  // ==================== 内部方法 ====================

  /**
   * 检查故障注入
   * @private
   */
  async _checkFault(operation) {
    // 检查固定故障类型
    if (this._fault_type !== LOCK_FAULT_TYPE.NONE) {
      this._stats.simulated_faults++
      const message = LOCK_FAULT_MESSAGES[this._fault_type] || `锁操作失败: ${this._fault_type}`
      throw new Error(message)
    }

    // 检查随机故障
    if (this._fault_rate > 0 && Math.random() < this._fault_rate) {
      this._stats.simulated_faults++
      throw new Error(LOCK_FAULT_MESSAGES[LOCK_FAULT_TYPE.RANDOM])
    }

    return false
  }

  /**
   * 记录调用历史
   * @private
   */
  _recordCall(method, args) {
    this._call_history.push({
      method,
      args,
      timestamp: Date.now()
    })
  }

  /**
   * 设置过期定时器
   * @private
   */
  _setExpireTimer(resource, ttl) {
    const timer_id = setTimeout(() => {
      const lock = this._locks.get(resource)
      if (lock && lock.expiresAt <= Date.now()) {
        this._locks.delete(resource)
        console.log(`[MockDistributedLock] 锁自动过期: ${resource}`)
      }
    }, ttl)

    this._expire_timers.set(resource, timer_id)
  }

  /**
   * 清除过期定时器
   * @private
   */
  _clearExpireTimer(resource) {
    const timer_id = this._expire_timers.get(resource)
    if (timer_id) {
      clearTimeout(timer_id)
      this._expire_timers.delete(resource)
    }
  }

  /**
   * 睡眠函数
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// ==================== 工厂函数 ====================

/**
 * 创建 Mock 分布式锁实例
 *
 * @param {Object} options - 配置选项
 * @returns {MockDistributedLock} Mock 实例
 *
 * @example
 * const mockLock = createMockDistributedLock({ default_ttl: 5000 })
 */
function createMockDistributedLock(options = {}) {
  return new MockDistributedLock(options)
}

/**
 * 创建用于 Jest Mock 的模块
 *
 * @description 返回可直接用于 jest.mock() 的模块替换对象
 * @param {MockDistributedLock} mock_lock - Mock 锁实例
 * @returns {Function} Mock 类构造函数
 *
 * @example
 * const mockLock = createMockDistributedLock()
 * jest.mock('../../utils/UnifiedDistributedLock', () => createJestMockModule(mockLock))
 */
function createJestMockModule(mock_lock) {
  return function MockedUnifiedDistributedLock() {
    return mock_lock
  }
}

// ==================== 模块导出 ====================

module.exports = {
  // 状态枚举
  LOCK_STATUS,
  LOCK_FAULT_TYPE,
  LOCK_FAULT_MESSAGES,

  // 核心类
  MockDistributedLock,

  // 工厂函数
  createMockDistributedLock,
  createJestMockModule
}
