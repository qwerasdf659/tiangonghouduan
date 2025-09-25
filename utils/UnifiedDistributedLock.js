/**
 * 统一分布式锁管理器 V4
 * 整合并优化了原有的分布式锁功能，消除重复代码
 * 统一使用UnifiedRedisClient，提供更好的性能和稳定性
 *
 * 功能特性：
 * - 统一使用 UnifiedRedisClient 客户端（更稳定可靠）
 * - 支持自动重试机制
 * - 支持锁续期功能
 * - 支持安全的临界区执行
 * - 原子性释放锁
 * - 完整的错误处理
 */

const { getRawClient } = require('./UnifiedRedisClient')
const { v4: uuidv4 } = require('uuid')

class UnifiedDistributedLock {
  constructor () {
    // 使用统一Redis客户端，消除重复连接
    this.redis = getRawClient()
    this.lockPrefix = 'lock:'
    this.defaultTTL = 30000 // 30秒默认过期时间

    console.log('[UnifiedDistributedLock] 使用统一Redis客户端初始化完成')
  }

  /**
   * 获取分布式锁 - 支持重试机制
   * @param {string} resource 资源标识
   * @param {number} ttl 锁过期时间(毫秒)，默认30秒
   * @param {number} maxRetries 最大重试次数，默认3次
   * @param {number} retryDelay 重试延迟(毫秒)，默认100ms
   * @returns {Promise<Object>} 包含锁信息的对象或null
   */
  async acquireLock (resource, ttl = this.defaultTTL, maxRetries = 3, retryDelay = 100) {
    const lockKey = `${this.lockPrefix}${resource}`
    const lockValue = uuidv4()

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 使用SET命令的NX和EX选项实现原子性获取锁
        const result = await this.redis.set(lockKey, lockValue, 'PX', ttl, 'NX')

        if (result === 'OK') {
          console.log(`[UnifiedDistributedLock] 成功获取锁: ${resource}, 值: ${lockValue}`)
          return {
            resource,
            lockKey,
            lockValue,
            ttl,
            acquiredAt: Date.now(),
            expiresAt: Date.now() + ttl
          }
        }

        // 获取锁失败，检查是否需要重试
        if (attempt < maxRetries) {
          console.log(`[UnifiedDistributedLock] 获取锁失败，第${attempt + 1}次重试: ${resource}`)
          await this.sleep(retryDelay * Math.pow(2, attempt)) // 指数退避
        }
      } catch (error) {
        console.error(`[UnifiedDistributedLock] 获取锁异常: ${resource}`, error)
        if (attempt === maxRetries) {
          throw error
        }
      }
    }

    console.log(`[UnifiedDistributedLock] 获取锁最终失败: ${resource}`)
    return null
  }

  /**
   * 释放分布式锁 - 使用Lua脚本保证原子性
   * @param {Object} lock 锁对象
   * @returns {Promise<boolean>} 是否成功释放锁
   */
  async releaseLock (lock) {
    if (!lock || !lock.lockKey || !lock.lockValue) {
      console.warn('[UnifiedDistributedLock] 释放锁失败: 无效的锁对象')
      return false
    }

    // Lua脚本确保只有持有锁的客户端才能释放锁
    const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `

    try {
      const result = await this.redis.eval(luaScript, 1, lock.lockKey, lock.lockValue)
      const success = result === 1

      if (success) {
        console.log(`[UnifiedDistributedLock] 成功释放锁: ${lock.resource}`)
      } else {
        console.warn(
          `[UnifiedDistributedLock] 释放锁失败，锁可能已过期或被其他进程释放: ${lock.resource}`
        )
      }

      return success
    } catch (error) {
      console.error(`[UnifiedDistributedLock] 释放锁异常: ${lock.resource}`, error)
      throw error
    }
  }

  /**
   * 续期分布式锁 - 延长锁的过期时间
   * @param {Object} lock 锁对象
   * @param {number} extendTTL 延长时间(毫秒)
   * @returns {Promise<boolean>} 是否成功续期
   */
  async extendLock (lock, extendTTL = this.defaultTTL) {
    if (!lock || !lock.lockKey || !lock.lockValue) {
      console.warn('[UnifiedDistributedLock] 续期锁失败: 无效的锁对象')
      return false
    }

    // Lua脚本确保只有持有锁的客户端才能续期
    const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      else
        return 0
      end
    `

    try {
      const result = await this.redis.eval(luaScript, 1, lock.lockKey, lock.lockValue, extendTTL)
      const success = result === 1

      if (success) {
        lock.expiresAt = Date.now() + extendTTL
        console.log(`[UnifiedDistributedLock] 成功续期锁: ${lock.resource}, 延长${extendTTL}ms`)
      } else {
        console.warn(`[UnifiedDistributedLock] 续期锁失败，锁可能已过期: ${lock.resource}`)
      }

      return success
    } catch (error) {
      console.error(`[UnifiedDistributedLock] 续期锁异常: ${lock.resource}`, error)
      throw error
    }
  }

  /**
   * 安全执行临界区代码 - 自动获取和释放锁
   * @param {string} resource 资源标识
   * @param {Function} criticalSection 临界区执行函数
   * @param {Object} options 配置选项
   * @returns {Promise<any>} 临界区函数的返回值
   */
  async withLock (resource, criticalSection, options = {}) {
    const {
      ttl = this.defaultTTL,
      maxRetries = 3,
      retryDelay = 100,
      autoExtend = false,
      extendInterval = ttl * 0.6 // 在60%时间点自动续期
    } = options

    const lock = await this.acquireLock(resource, ttl, maxRetries, retryDelay)
    if (!lock) {
      throw new Error(`无法获取锁: ${resource}`)
    }

    let extendTimer = null

    try {
      // 如果启用自动续期，设置定时器
      if (autoExtend) {
        extendTimer = setInterval(async () => {
          try {
            await this.extendLock(lock, ttl)
          } catch (error) {
            console.error(`[UnifiedDistributedLock] 自动续期失败: ${resource}`, error)
          }
        }, extendInterval)
      }

      // 执行临界区代码
      console.log(`[UnifiedDistributedLock] 开始执行临界区: ${resource}`)
      const result = await criticalSection()
      console.log(`[UnifiedDistributedLock] 临界区执行完成: ${resource}`)

      return result
    } catch (error) {
      console.error(`[UnifiedDistributedLock] 临界区执行异常: ${resource}`, error)
      throw error
    } finally {
      // 清理自动续期定时器
      if (extendTimer) {
        clearInterval(extendTimer)
      }

      // 确保释放锁
      try {
        await this.releaseLock(lock)
      } catch (error) {
        console.error(`[UnifiedDistributedLock] 释放锁失败: ${resource}`, error)
      }
    }
  }

  /**
   * 批量获取锁 - 原子性获取多个锁
   * @param {Array<string>} resources 资源标识列表
   * @param {number} ttl 锁过期时间
   * @param {number} maxRetries 最大重试次数
   * @returns {Promise<Array<Object>|null>} 锁对象列表或null
   */
  async acquireMultipleLocks (resources, ttl = this.defaultTTL, maxRetries = 3) {
    if (!Array.isArray(resources) || resources.length === 0) {
      throw new Error('资源列表不能为空')
    }

    // 排序资源标识，避免死锁
    const sortedResources = [...resources].sort()
    const locks = []

    try {
      for (const resource of sortedResources) {
        const lock = await this.acquireLock(resource, ttl, maxRetries)
        if (!lock) {
          // 获取锁失败，释放已获取的锁
          await this.releaseMultipleLocks(locks)
          return null
        }
        locks.push(lock)
      }

      console.log(`[UnifiedDistributedLock] 成功获取多个锁: ${sortedResources.join(', ')}`)
      return locks
    } catch (error) {
      // 发生异常，释放已获取的锁
      await this.releaseMultipleLocks(locks)
      throw error
    }
  }

  /**
   * 批量释放锁
   * @param {Array<Object>} locks 锁对象列表
   * @returns {Promise<boolean>} 是否全部成功释放
   */
  async releaseMultipleLocks (locks) {
    if (!Array.isArray(locks) || locks.length === 0) {
      return true
    }

    const results = await Promise.allSettled(locks.map(lock => this.releaseLock(lock)))

    const success = results.every(result => result.status === 'fulfilled' && result.value)

    if (!success) {
      const failures = results.filter(
        result => result.status === 'rejected' || !result.value
      ).length
      console.warn(`[UnifiedDistributedLock] 批量释放锁部分失败: ${failures}/${locks.length}`)
    }

    return success
  }

  /**
   * 检查锁状态
   * @param {string} resource 资源标识
   * @returns {Promise<Object|null>} 锁状态信息
   */
  async getLockStatus (resource) {
    const lockKey = `${this.lockPrefix}${resource}`

    try {
      const [value, ttl] = await Promise.all([this.redis.get(lockKey), this.redis.pttl(lockKey)])

      if (value === null) {
        return null // 锁不存在
      }

      return {
        resource,
        lockKey,
        lockValue: value,
        isLocked: true,
        ttl: ttl > 0 ? ttl : 0,
        expiresAt: ttl > 0 ? Date.now() + ttl : null
      }
    } catch (error) {
      console.error(`[UnifiedDistributedLock] 检查锁状态异常: ${resource}`, error)
      throw error
    }
  }

  /**
   * 强制释放锁（谨慎使用）
   * @param {string} resource 资源标识
   * @returns {Promise<boolean>} 是否成功删除锁
   */
  async forceReleaseLock (resource) {
    const lockKey = `${this.lockPrefix}${resource}`

    try {
      const result = await this.redis.del(lockKey)
      const success = result === 1

      if (success) {
        console.log(`[UnifiedDistributedLock] 强制释放锁成功: ${resource}`)
      } else {
        console.log(`[UnifiedDistributedLock] 锁不存在: ${resource}`)
      }

      return success
    } catch (error) {
      console.error(`[UnifiedDistributedLock] 强制释放锁异常: ${resource}`, error)
      throw error
    }
  }

  /**
   * 清理过期锁（清理工具）
   * @param {string} pattern 锁模式，默认清理所有锁
   * @returns {Promise<number>} 清理的锁数量
   */
  async cleanupExpiredLocks (pattern = `${this.lockPrefix}*`) {
    try {
      const keys = await this.redis.keys(pattern)

      if (keys.length === 0) {
        return 0
      }

      // 检查每个锁的TTL，删除已过期的
      let cleanedCount = 0
      for (const key of keys) {
        const ttl = await this.redis.ttl(key)
        if (ttl === -2) {
          // 键不存在
          cleanedCount++
        } else if (ttl === -1) {
          // 键存在但没有设置过期时间，可能是异常情况
          await this.redis.del(key)
          cleanedCount++
          console.log(`[UnifiedDistributedLock] 清理无过期时间的锁: ${key}`)
        }
      }

      if (cleanedCount > 0) {
        console.log(`[UnifiedDistributedLock] 清理过期锁完成: ${cleanedCount}个`)
      }

      return cleanedCount
    } catch (error) {
      console.error('[UnifiedDistributedLock] 清理过期锁异常:', error)
      throw error
    }
  }

  /**
   * 睡眠函数
   * @param {number} ms 睡眠时间(毫秒)
   * @returns {Promise<void>}
   */
  sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 获取统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStats () {
    try {
      const pattern = `${this.lockPrefix}*`
      const keys = await this.redis.keys(pattern)

      const stats = {
        totalLocks: keys.length,
        activeLocks: 0,
        expiredLocks: 0,
        locksWithoutTTL: 0,
        locks: []
      }

      for (const key of keys) {
        const [ttl, value] = await Promise.all([this.redis.pttl(key), this.redis.get(key)])

        const resource = key.replace(this.lockPrefix, '')
        const lockInfo = {
          resource,
          lockKey: key,
          lockValue: value,
          ttl
        }

        if (ttl === -2) {
          stats.expiredLocks++
        } else if (ttl === -1) {
          stats.locksWithoutTTL++
        } else {
          stats.activeLocks++
        }

        stats.locks.push(lockInfo)
      }

      return stats
    } catch (error) {
      console.error('[UnifiedDistributedLock] 获取统计信息异常:', error)
      throw error
    }
  }
}

module.exports = UnifiedDistributedLock
