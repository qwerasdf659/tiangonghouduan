'use strict'

/**
 * 🧪 分布式锁 Mock 单元测试
 *
 * @description 验证 distributed-lock-mock.js 的核心功能
 * 包括：锁获取、释放、超时、竞争、故障模拟
 *
 * @version V1.0
 * @date 2026-01-30
 * @file tests/unit/helpers/test-distributed-lock-mock.test.js
 */

const {
  MockDistributedLock,
  LOCK_STATUS,
  LOCK_FAULT_TYPE,
  createMockDistributedLock,
  createJestMockModule
} = require('../../helpers/distributed-lock-mock')

describe('📦 分布式锁 Mock 测试', () => {
  // ==================== 基础锁操作测试 ====================

  describe('基础锁操作', () => {
    let mock_lock

    beforeEach(() => {
      mock_lock = new MockDistributedLock()
    })

    afterEach(async () => {
      await mock_lock.disconnect()
    })

    test('acquireLock 应成功获取锁', async () => {
      const lock_info = await mock_lock.acquireLock('test_resource')

      expect(lock_info).not.toBeNull()
      expect(lock_info.resource).toBe('test_resource')
      expect(lock_info.lockKey).toBe('lock:test_resource')
      expect(lock_info.lockValue).toBeTruthy()
      expect(lock_info.ttl).toBe(30000) // 默认 TTL
      expect(lock_info.acquiredAt).toBeLessThanOrEqual(Date.now())
      expect(lock_info.expiresAt).toBeGreaterThan(Date.now())
    })

    test('acquireLock 应支持自定义 TTL', async () => {
      const custom_ttl = 5000
      const lock_info = await mock_lock.acquireLock('test_resource', custom_ttl)

      expect(lock_info.ttl).toBe(custom_ttl)
    })

    test('releaseLock 应成功释放锁', async () => {
      const lock_info = await mock_lock.acquireLock('test_resource')
      const result = await mock_lock.releaseLock(lock_info)

      expect(result).toBe(true)

      // 验证锁已释放
      const status = await mock_lock.getLockStatus('test_resource')
      expect(status).toBeNull()
    })

    test('releaseLock 对无效锁应返回 false', async () => {
      const result = await mock_lock.releaseLock(null)
      expect(result).toBe(false)

      const result2 = await mock_lock.releaseLock({ lockKey: 'fake', lockValue: 'fake' })
      expect(result2).toBe(false)
    })

    test('extendLock 应成功续期锁', async () => {
      const lock_info = await mock_lock.acquireLock('test_resource', 5000)
      const original_expires = lock_info.expiresAt

      await new Promise(resolve => setTimeout(resolve, 100))

      const result = await mock_lock.extendLock(lock_info, 10000)

      expect(result).toBe(true)
      expect(lock_info.expiresAt).toBeGreaterThan(original_expires)
    })
  })

  // ==================== 锁竞争测试 ====================

  describe('锁竞争', () => {
    let mock_lock

    beforeEach(() => {
      mock_lock = new MockDistributedLock()
    })

    afterEach(async () => {
      await mock_lock.disconnect()
    })

    test('同一资源不能被重复获取', async () => {
      const lock1 = await mock_lock.acquireLock('shared_resource')
      expect(lock1).not.toBeNull()

      // 尝试再次获取同一资源（不重试）
      const lock2 = await mock_lock.acquireLock('shared_resource', 5000, 0)
      expect(lock2).toBeNull()

      // 释放后可以重新获取
      await mock_lock.releaseLock(lock1)
      const lock3 = await mock_lock.acquireLock('shared_resource', 5000, 0)
      expect(lock3).not.toBeNull()
    })

    test('simulateLockHeld 应模拟资源被锁定', async () => {
      mock_lock.simulateLockHeld('contested_resource')

      // 即使重试也无法获取
      const lock = await mock_lock.acquireLock('contested_resource', 5000, 2, 10)
      expect(lock).toBeNull()

      // 清除模拟后可以获取
      mock_lock.clearSimulatedLock('contested_resource')
      const lock2 = await mock_lock.acquireLock('contested_resource', 5000, 0)
      expect(lock2).not.toBeNull()
    })

    test('锁应该只能被持有者释放', async () => {
      const lock1 = await mock_lock.acquireLock('protected_resource')

      // 尝试用错误的锁值释放
      const fake_lock = {
        ...lock1,
        lockValue: 'wrong_value'
      }
      const result = await mock_lock.releaseLock(fake_lock)
      expect(result).toBe(false)

      // 用正确的锁值释放
      const result2 = await mock_lock.releaseLock(lock1)
      expect(result2).toBe(true)
    })
  })

  // ==================== 锁超时测试 ====================

  describe('锁超时', () => {
    let mock_lock

    beforeEach(() => {
      mock_lock = new MockDistributedLock({ enable_auto_expire: true })
    })

    afterEach(async () => {
      await mock_lock.disconnect()
    })

    test('锁应该在 TTL 后自动过期', async () => {
      const short_ttl = 100 // 100ms
      const lock = await mock_lock.acquireLock('expiring_resource', short_ttl)
      expect(lock).not.toBeNull()

      // 等待锁过期
      await new Promise(resolve => setTimeout(resolve, 150))

      // 锁应该已过期，可以重新获取
      const new_lock = await mock_lock.acquireLock('expiring_resource', 5000, 0)
      expect(new_lock).not.toBeNull()
      expect(new_lock.lockValue).not.toBe(lock.lockValue)
    })

    test('续期应该延长过期时间', async () => {
      const short_ttl = 100
      const lock = await mock_lock.acquireLock('extending_resource', short_ttl)

      // 在过期前续期
      await new Promise(resolve => setTimeout(resolve, 50))
      const extended = await mock_lock.extendLock(lock, 200)
      expect(extended).toBe(true)

      // 原本的过期时间已过
      await new Promise(resolve => setTimeout(resolve, 60))

      // 但锁仍然有效（因为续期了）
      const status = await mock_lock.getLockStatus('extending_resource')
      expect(status).not.toBeNull()
      expect(status.isLocked).toBe(true)
    })
  })

  // ==================== withLock 临界区测试 ====================

  describe('withLock 临界区', () => {
    let mock_lock

    beforeEach(() => {
      mock_lock = new MockDistributedLock()
    })

    afterEach(async () => {
      await mock_lock.disconnect()
    })

    test('withLock 应自动获取和释放锁', async () => {
      let executed = false

      await mock_lock.withLock('critical_resource', async () => {
        executed = true
        // 验证锁已获取
        const status = await mock_lock.getLockStatus('critical_resource')
        expect(status).not.toBeNull()
        expect(status.isLocked).toBe(true)
      })

      expect(executed).toBe(true)

      // 验证锁已释放
      const status = await mock_lock.getLockStatus('critical_resource')
      expect(status).toBeNull()
    })

    test('withLock 应返回临界区的返回值', async () => {
      const result = await mock_lock.withLock('resource', async () => {
        return 'critical_result'
      })

      expect(result).toBe('critical_result')
    })

    test('withLock 在临界区异常时应释放锁', async () => {
      await expect(
        mock_lock.withLock('error_resource', async () => {
          throw new Error('临界区错误')
        })
      ).rejects.toThrow('临界区错误')

      // 验证锁已释放
      const status = await mock_lock.getLockStatus('error_resource')
      expect(status).toBeNull()
    })

    test('withLock 获取锁失败时应抛出异常', async () => {
      mock_lock.simulateLockHeld('blocked_resource')

      await expect(
        mock_lock.withLock('blocked_resource', async () => {
          return 'should not execute'
        }, { maxRetries: 0 })
      ).rejects.toThrow('无法获取锁')
    })
  })

  // ==================== 批量锁操作测试 ====================

  describe('批量锁操作', () => {
    let mock_lock

    beforeEach(() => {
      mock_lock = new MockDistributedLock()
    })

    afterEach(async () => {
      await mock_lock.disconnect()
    })

    test('acquireMultipleLocks 应获取多个锁', async () => {
      const resources = ['resource_a', 'resource_b', 'resource_c']
      const locks = await mock_lock.acquireMultipleLocks(resources)

      expect(locks).not.toBeNull()
      expect(locks.length).toBe(3)

      // 验证所有锁都已获取
      for (const resource of resources) {
        const status = await mock_lock.getLockStatus(resource)
        expect(status).not.toBeNull()
        expect(status.isLocked).toBe(true)
      }
    })

    test('acquireMultipleLocks 部分失败时应回滚', async () => {
      // 预先锁定其中一个资源
      mock_lock.simulateLockHeld('resource_b')

      const resources = ['resource_a', 'resource_b', 'resource_c']
      const locks = await mock_lock.acquireMultipleLocks(resources, 5000, 0)

      expect(locks).toBeNull()

      // 验证 resource_a 也被释放了（回滚）
      const status_a = await mock_lock.getLockStatus('resource_a')
      expect(status_a).toBeNull()
    })

    test('releaseMultipleLocks 应释放多个锁', async () => {
      const resources = ['r1', 'r2', 'r3']
      const locks = await mock_lock.acquireMultipleLocks(resources)

      const result = await mock_lock.releaseMultipleLocks(locks)
      expect(result).toBe(true)

      // 验证所有锁都已释放
      for (const resource of resources) {
        const status = await mock_lock.getLockStatus(resource)
        expect(status).toBeNull()
      }
    })
  })

  // ==================== 故障注入测试 ====================

  describe('故障注入', () => {
    let mock_lock

    beforeEach(() => {
      mock_lock = new MockDistributedLock()
    })

    afterEach(async () => {
      mock_lock.clearFault()
      await mock_lock.disconnect()
    })

    test('simulateError 应导致操作失败', async () => {
      mock_lock.simulateError(LOCK_FAULT_TYPE.REDIS_ERROR)

      await expect(mock_lock.acquireLock('resource')).rejects.toThrow('Redis 连接错误')
    })

    test('setFaultRate 应产生随机故障', async () => {
      mock_lock.setFaultRate(1.0) // 100% 故障率

      await expect(mock_lock.acquireLock('resource')).rejects.toThrow('随机故障')
    })

    test('clearFault 应清除故障模拟', async () => {
      mock_lock.simulateError(LOCK_FAULT_TYPE.REDIS_ERROR)
      mock_lock.clearFault()

      const lock = await mock_lock.acquireLock('resource')
      expect(lock).not.toBeNull()
    })
  })

  // ==================== 统计和历史测试 ====================

  describe('统计和历史', () => {
    let mock_lock

    beforeEach(() => {
      mock_lock = new MockDistributedLock()
    })

    afterEach(async () => {
      await mock_lock.disconnect()
    })

    test('getStats 应返回正确的统计数据', async () => {
      await mock_lock.acquireLock('r1')
      await mock_lock.acquireLock('r2')
      mock_lock.simulateLockHeld('r3')
      await mock_lock.acquireLock('r3', 5000, 0) // 失败

      const stats = await mock_lock.getStats()

      expect(stats.acquire_attempts).toBe(3)
      expect(stats.acquire_successes).toBe(2)
      expect(stats.acquire_failures).toBe(1)
      expect(stats.totalLocks).toBe(2)
      expect(stats.heldResources).toBe(1)
    })

    test('getCallHistory 应记录所有调用', async () => {
      await mock_lock.acquireLock('resource')
      await mock_lock.getLockStatus('resource')

      const history = mock_lock.getCallHistory()

      expect(history.length).toBe(2)
      expect(history[0].method).toBe('acquireLock')
      expect(history[1].method).toBe('getLockStatus')
    })

    test('assertMethodCalled 应正确断言调用', async () => {
      await mock_lock.acquireLock('resource')
      await mock_lock.acquireLock('resource2')

      expect(mock_lock.assertMethodCalled('acquireLock')).toBe(true)
      expect(mock_lock.assertMethodCalled('acquireLock', 2)).toBe(true)
      expect(mock_lock.assertMethodCalled('acquireLock', 3)).toBe(false)
      expect(mock_lock.assertMethodCalled('releaseLock')).toBe(false)
    })
  })

  // ==================== 工厂函数和 Jest Mock 测试 ====================

  describe('工厂函数和 Jest Mock', () => {
    test('createMockDistributedLock 应创建实例', () => {
      const mock = createMockDistributedLock({ default_ttl: 10000 })
      expect(mock).toBeInstanceOf(MockDistributedLock)
    })

    test('createJestMockModule 应创建可用于 Jest Mock 的模块', () => {
      const mock_lock = createMockDistributedLock()
      const MockModule = createJestMockModule(mock_lock)

      const instance = new MockModule()
      expect(instance).toBe(mock_lock)
    })

    test('reset 应清除所有状态', async () => {
      const mock = createMockDistributedLock()

      await mock.acquireLock('r1')
      await mock.acquireLock('r2')
      mock.simulateLockHeld('r3')
      mock.simulateError(LOCK_FAULT_TYPE.REDIS_ERROR)

      mock.reset()

      const stats = await mock.getStats()
      expect(stats.totalLocks).toBe(0)
      expect(stats.heldResources).toBe(0)
      expect(stats.acquire_attempts).toBe(0)
      expect(mock.getCallHistory().length).toBe(0)

      // 故障已清除，可以正常获取锁
      const lock = await mock.acquireLock('resource')
      expect(lock).not.toBeNull()
    })
  })
})


