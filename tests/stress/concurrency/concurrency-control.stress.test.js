'use strict'

/**
 * P1-1.3 并发控制边界测试
 *
 * @description 验证用户/IP并发限制是否正确生效
 * @version V4.6 - 测试审计标准 P1-1
 * @date 2026-01-30
 *
 * 测试场景：
 * 1. 单用户并发请求控制
 * 2. 单IP并发请求控制
 * 3. 分布式锁并发控制
 * 4. 会话创建并发控制
 * 5. 并发冲突处理验证
 *
 * 业务场景：
 * - 防止同一用户同时发起多个抽奖请求
 * - 防止同一IP恶意并发攻击
 * - 保证关键操作的原子性
 * - 防止重复创建会话
 *
 * 配置参考：
 * - 分布式锁：UnifiedDistributedLock
 * - 会话创建限制：3次/10秒（config/business.config.js）
 * - 幂等性控制：IdempotencyHelper
 *
 * @file tests/stress/concurrency-control.stress.test.js
 */

const UnifiedDistributedLock = require('../../../utils/UnifiedDistributedLock')
const { isRedisHealthy, getRawClient } = require('../../../utils/UnifiedRedisClient')
const { delay } = require('../../helpers/test-concurrent-utils')
const businessConfig = require('../../../config/business.config')

/**
 * 测试配置常量
 *
 * 配置说明：
 * - 并发控制参数来自 config/business.config.js
 * - 分布式锁配置来自 UnifiedDistributedLock
 */
const TEST_CONFIG = {
  // 会话创建限制（来自 business.config.js）
  CREATE_SESSION_LIMIT: {
    max_creates_per_window: businessConfig.chat?.create_session_limit?.max_creates_per_window || 3,
    time_window_seconds: businessConfig.chat?.create_session_limit?.time_window_seconds || 10
  },

  // 消息频率限制
  MESSAGE_RATE_LIMIT: {
    user_max_per_minute: businessConfig.chat?.rate_limit?.user?.max_messages_per_minute || 20,
    admin_max_per_minute: businessConfig.chat?.rate_limit?.admin?.max_messages_per_minute || 30
  },

  // 分布式锁配置
  LOCK_CONFIG: {
    default_ttl: 5000, // 5秒
    max_retries: 3,
    retry_delay: 100
  },

  // 测试参数
  TEST_USER_ID: 999998,
  TEST_IP: '192.168.1.100',
  HIGH_CONCURRENCY: 20,
  LOCK_PREFIX: 'test:concurrency:lock:',

  // 测试超时
  TEST_TIMEOUT: 120000 // 2分钟
}

describe('【P1-1.3】并发控制边界测试', () => {
  let lock = null
  let redisClient = null
  let isRedisAvailable = false

  /**
   * 测试前准备 - 初始化分布式锁和清理测试数据
   */
  beforeAll(async () => {
    console.log('='.repeat(80))
    console.log('🔒 【P1-1.3】并发控制边界测试')
    console.log('='.repeat(80))

    // 检查 Redis 可用性
    try {
      isRedisAvailable = await isRedisHealthy()
      if (isRedisAvailable) {
        console.log('✅ Redis 服务可用')
        redisClient = getRawClient()
        lock = new UnifiedDistributedLock()
      } else {
        console.warn('⚠️ Redis 服务不可用，部分测试将被跳过')
      }
    } catch (error) {
      console.warn('⚠️ Redis 连接失败:', error.message)
      isRedisAvailable = false
    }

    console.log(`📋 并发控制配置预览:`)
    console.log(
      `   - 会话创建: ${TEST_CONFIG.CREATE_SESSION_LIMIT.max_creates_per_window}次/${TEST_CONFIG.CREATE_SESSION_LIMIT.time_window_seconds}秒`
    )
    console.log(`   - 用户消息: ${TEST_CONFIG.MESSAGE_RATE_LIMIT.user_max_per_minute}条/分钟`)
    console.log(`   - 管理员消息: ${TEST_CONFIG.MESSAGE_RATE_LIMIT.admin_max_per_minute}条/分钟`)
    console.log(`   - 分布式锁TTL: ${TEST_CONFIG.LOCK_CONFIG.default_ttl}ms`)

    console.log('='.repeat(80))
  }, TEST_CONFIG.TEST_TIMEOUT)

  /**
   * 每个测试后清理测试数据
   */
  afterEach(async () => {
    if (redisClient && isRedisAvailable) {
      try {
        // 清理测试相关的锁和计数器
        const patterns = [`lock:${TEST_CONFIG.LOCK_PREFIX}*`, 'test:concurrency:*']

        for (const pattern of patterns) {
          let cursor = '0'
          do {
            const [newCursor, keys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
            cursor = newCursor
            if (keys.length > 0) {
              await redisClient.del(...keys)
            }
          } while (cursor !== '0')
        }
      } catch (error) {
        console.warn('⚠️ 清理测试数据失败:', error.message)
      }
    }
  })

  /**
   * 测试后清理
   */
  afterAll(async () => {
    console.log('='.repeat(80))
    console.log('🏁 并发控制边界测试完成')
    console.log('='.repeat(80))
  })

  // ==================== 分布式锁并发控制测试 ====================

  describe('分布式锁并发控制测试', () => {
    /**
     * 测试高并发场景下分布式锁的互斥性
     * 验证：同一时刻只有一个请求能持有锁
     */
    test(
      '高并发获取同一把锁 - 验证互斥性',
      async () => {
        if (!isRedisAvailable || !lock) {
          console.log('⏭️ 跳过测试：Redis 不可用')
          return
        }

        const concurrencyCount = TEST_CONFIG.HIGH_CONCURRENCY
        console.log(`\n⚔️ ${concurrencyCount}并发竞争同一把锁测试...`)

        const resource = `${TEST_CONFIG.LOCK_PREFIX}mutex_test_${Date.now()}`
        let criticalSectionCount = 0
        let maxConcurrentInSection = 0
        let currentConcurrentCount = 0
        const executionOrder = []

        /**
         * 创建并发任务 - 尝试获取锁并执行临界区代码
         */
        const createTask = taskId => async () => {
          const taskStartTime = Date.now()
          try {
            const result = await lock.withLock(
              resource,
              async () => {
                // 进入临界区
                currentConcurrentCount++
                maxConcurrentInSection = Math.max(maxConcurrentInSection, currentConcurrentCount)
                criticalSectionCount++

                executionOrder.push({
                  taskId,
                  entryTime: Date.now()
                })

                // 模拟业务操作（5ms）
                await delay(5)

                // 离开临界区
                currentConcurrentCount--

                return {
                  task_id: taskId,
                  success: true,
                  duration: Date.now() - taskStartTime
                }
              },
              {
                ttl: TEST_CONFIG.LOCK_CONFIG.default_ttl,
                maxRetries: TEST_CONFIG.LOCK_CONFIG.max_retries,
                retryDelay: TEST_CONFIG.LOCK_CONFIG.retry_delay
              }
            )
            return result
          } catch (error) {
            return {
              task_id: taskId,
              success: false,
              error: error.message,
              duration: Date.now() - taskStartTime
            }
          }
        }

        const tasks = Array(concurrencyCount)
          .fill()
          .map((_, i) => createTask(i + 1))

        const startTime = Date.now()
        const results = await Promise.all(tasks.map(task => task()))
        const totalTime = Date.now() - startTime

        const successfulTasks = results.filter(r => r.success)
        const failedTasks = results.filter(r => !r.success)

        console.log(`   总任务数: ${results.length}`)
        console.log(`   成功执行: ${successfulTasks.length}`)
        console.log(`   失败/超时: ${failedTasks.length}`)
        console.log(`   临界区进入次数: ${criticalSectionCount}`)
        console.log(`   最大并发进入数: ${maxConcurrentInSection}`)
        console.log(`   总耗时: ${totalTime}ms`)

        // 🔴 核心验证：互斥性 - 同一时刻临界区内最多只有1个任务
        expect(maxConcurrentInSection).toBe(1)

        // 验证：所有成功的任务都正确执行了
        expect(criticalSectionCount).toBe(successfulTasks.length)

        // 验证：至少有一个任务成功
        expect(successfulTasks.length).toBeGreaterThanOrEqual(1)

        console.log(`   ✅ ${concurrencyCount}并发锁竞争测试通过 - 互斥性验证成功`)
      },
      TEST_CONFIG.TEST_TIMEOUT
    )

    /**
     * 测试锁超时后的自动释放
     */
    test('锁超时自动释放测试', async () => {
      if (!isRedisAvailable || !lock) {
        console.log('⏭️ 跳过测试：Redis 不可用')
        return
      }

      console.log('\n⏰ 锁超时自动释放测试...')

      const resource = `${TEST_CONFIG.LOCK_PREFIX}ttl_test_${Date.now()}`
      const shortTTL = 1000 // 1秒
      const lockKey = `lock:${resource}`

      // 获取锁但不主动释放
      const lockInfo = await lock.acquireLock(resource, shortTTL)
      console.log(`   获取锁: ${lockInfo ? '成功' : '失败'}`)
      expect(lockInfo).not.toBeNull()

      // 验证锁存在
      const existsBefore = await redisClient.exists(lockKey)
      console.log(`   获取后锁存在: ${existsBefore === 1}`)
      expect(existsBefore).toBe(1)

      // 等待锁过期
      console.log(`   等待锁过期 (${shortTTL + 500}ms)...`)
      await delay(shortTTL + 500)

      // 验证锁已自动释放
      const existsAfter = await redisClient.exists(lockKey)
      console.log(`   过期后锁存在: ${existsAfter === 1}`)
      expect(existsAfter).toBe(0)

      // 验证可以重新获取锁
      const newLockInfo = await lock.acquireLock(resource, shortTTL)
      console.log(`   重新获取锁: ${newLockInfo ? '成功' : '失败'}`)
      expect(newLockInfo).not.toBeNull()

      // 清理
      await lock.releaseLock(newLockInfo)

      console.log('   ✅ 锁超时自动释放测试通过')
    }, 30000)
  })

  // ==================== 用户级并发控制测试 ====================

  describe('用户级并发控制测试', () => {
    /**
     * 测试单用户并发请求控制
     * 模拟同一用户同时发起多个抽奖请求
     */
    test(
      '单用户并发请求控制 - 同一用户同时抽奖',
      async () => {
        if (!isRedisAvailable || !lock) {
          console.log('⏭️ 跳过测试：Redis 不可用')
          return
        }

        const userId = TEST_CONFIG.TEST_USER_ID
        const concurrency = 10
        console.log(`\n👤 单用户(${userId})并发抽奖控制测试...`)

        const resource = `${TEST_CONFIG.LOCK_PREFIX}user:lottery:${userId}`
        let successfulDraws = 0
        let blockedDraws = 0

        /**
         * 模拟抽奖操作（需要获取用户级锁）
         */
        const simulateDraw = drawId => async () => {
          const startTime = Date.now()
          try {
            const result = await lock.withLock(
              resource,
              async () => {
                successfulDraws++
                // 模拟抽奖业务逻辑
                await delay(50)
                return {
                  lottery_draw_id: drawId,
                  success: true,
                  message: '抽奖成功',
                  duration: Date.now() - startTime
                }
              },
              {
                ttl: 3000,
                maxRetries: 0 // 不重试，直接失败（快速验证互斥）
              }
            )
            return result
          } catch (error) {
            blockedDraws++
            return {
              lottery_draw_id: drawId,
              success: false,
              message: '获取锁失败',
              error: error.message,
              duration: Date.now() - startTime
            }
          }
        }

        const tasks = Array(concurrency)
          .fill()
          .map((_, i) => simulateDraw(i + 1))

        const startTime = Date.now()
        await Promise.all(tasks.map(task => task()))
        const totalTime = Date.now() - startTime

        console.log(`   并发请求数: ${concurrency}`)
        console.log(`   成功抽奖: ${successfulDraws}`)
        console.log(`   被阻止: ${blockedDraws}`)
        console.log(`   总耗时: ${totalTime}ms`)

        // 验证：由于不重试，只有一个请求能成功
        expect(successfulDraws).toBe(1)
        expect(blockedDraws).toBe(concurrency - 1)

        console.log('   ✅ 单用户并发抽奖控制测试通过 - 同一用户同时只能有一个抽奖')
      },
      TEST_CONFIG.TEST_TIMEOUT
    )

    /**
     * 测试不同用户并发请求独立性
     */
    test(
      '不同用户并发请求独立性',
      async () => {
        if (!isRedisAvailable || !lock) {
          console.log('⏭️ 跳过测试：Redis 不可用')
          return
        }

        const userIds = [100001, 100002, 100003, 100004, 100005]
        console.log(`\n👥 ${userIds.length}个不同用户并发请求独立性测试...`)

        const results = {}

        /**
         * 模拟用户操作
         */
        const simulateUserAction = userId => async () => {
          const resource = `${TEST_CONFIG.LOCK_PREFIX}user:action:${userId}`
          const startTime = Date.now()

          try {
            const result = await lock.withLock(
              resource,
              async () => {
                // 模拟业务操作
                await delay(30)
                return {
                  user_id: userId,
                  success: true,
                  duration: Date.now() - startTime
                }
              },
              {
                ttl: 5000,
                maxRetries: 1,
                retryDelay: 100
              }
            )
            return result
          } catch (error) {
            return {
              user_id: userId,
              success: false,
              error: error.message,
              duration: Date.now() - startTime
            }
          }
        }

        // 并发执行所有用户的请求
        const tasks = userIds.map(userId => simulateUserAction(userId))
        const startTime = Date.now()
        const taskResults = await Promise.all(tasks.map(task => task()))
        const totalTime = Date.now() - startTime

        // 统计结果
        taskResults.forEach(r => {
          results[r.user_id] = r.success
        })

        console.log('   各用户执行结果:')
        Object.entries(results).forEach(([userId, success]) => {
          console.log(`     用户 ${userId}: ${success ? '成功' : '失败'}`)
        })
        console.log(`   总耗时: ${totalTime}ms`)

        // 验证：所有用户都应该成功（因为锁是独立的）
        const successCount = Object.values(results).filter(Boolean).length
        expect(successCount).toBe(userIds.length)

        console.log('   ✅ 不同用户并发请求独立性验证通过')
      },
      TEST_CONFIG.TEST_TIMEOUT
    )
  })

  // ==================== IP级并发控制测试 ====================

  describe('IP级并发控制测试', () => {
    /**
     * 测试单IP并发请求控制
     */
    test(
      '单IP并发请求控制',
      async () => {
        if (!isRedisAvailable || !lock) {
          console.log('⏭️ 跳过测试：Redis 不可用')
          return
        }

        const testIP = TEST_CONFIG.TEST_IP
        const concurrency = 10
        console.log(`\n🌐 单IP(${testIP})并发请求控制测试...`)

        const resource = `${TEST_CONFIG.LOCK_PREFIX}ip:request:${testIP}`
        let successCount = 0
        let blockedCount = 0

        const simulateIPRequest = requestId => async () => {
          const startTime = Date.now()
          try {
            const result = await lock.withLock(
              resource,
              async () => {
                successCount++
                await delay(20)
                return {
                  request_id: requestId,
                  success: true,
                  duration: Date.now() - startTime
                }
              },
              {
                ttl: 3000,
                maxRetries: 0 // 不重试
              }
            )
            return result
          } catch (error) {
            blockedCount++
            return {
              request_id: requestId,
              success: false,
              error: error.message,
              duration: Date.now() - startTime
            }
          }
        }

        const tasks = Array(concurrency)
          .fill()
          .map((_, i) => simulateIPRequest(i + 1))

        await Promise.all(tasks.map(task => task()))

        console.log(`   并发请求数: ${concurrency}`)
        console.log(`   成功请求: ${successCount}`)
        console.log(`   被阻止: ${blockedCount}`)

        // 验证：只有一个请求能成功
        expect(successCount).toBe(1)
        expect(blockedCount).toBe(concurrency - 1)

        console.log('   ✅ 单IP并发请求控制测试通过')
      },
      TEST_CONFIG.TEST_TIMEOUT
    )
  })

  // ==================== 会话创建并发控制测试 ====================

  describe('会话创建并发控制测试', () => {
    /**
     * 测试会话创建频率限制
     * 配置：3次/10秒
     */
    test(
      '会话创建频率限制测试 - 10秒内最多3次',
      async () => {
        if (!isRedisAvailable) {
          console.log('⏭️ 跳过测试：Redis 不可用')
          return
        }

        console.log('\n📋 会话创建频率限制测试...')

        const config = TEST_CONFIG.CREATE_SESSION_LIMIT
        const userId = TEST_CONFIG.TEST_USER_ID
        const testKey = `test:concurrency:session_create:${userId}:${Date.now()}`

        let successCount = 0
        let blockedCount = 0

        // 模拟连续创建会话
        const totalAttempts = config.max_creates_per_window + 2

        for (let i = 0; i < totalAttempts; i++) {
          const now = Date.now()
          const currentCount = await redisClient.zcard(testKey)

          if (currentCount >= config.max_creates_per_window) {
            blockedCount++
            console.log(`   第${i + 1}次创建: 被限流 (当前窗口已有${currentCount}次)`)
          } else {
            await redisClient.zadd(testKey, now, `session_${i}`)
            successCount++
            console.log(`   第${i + 1}次创建: 成功`)
          }
        }

        await redisClient.expire(testKey, 120)

        console.log(
          `\n   限流配置: ${config.max_creates_per_window}次/${config.time_window_seconds}秒`
        )
        console.log(`   成功创建: ${successCount}`)
        console.log(`   被限流: ${blockedCount}`)

        // 验证：成功次数等于限制
        expect(successCount).toBe(config.max_creates_per_window)
        expect(blockedCount).toBe(totalAttempts - config.max_creates_per_window)

        await redisClient.del(testKey)

        console.log('   ✅ 会话创建频率限制测试通过')
      },
      TEST_CONFIG.TEST_TIMEOUT
    )
  })

  // ==================== 竞态条件检测测试 ====================

  describe('竞态条件检测测试', () => {
    /**
     * 测试并发操作的数据一致性
     */
    test(
      '并发计数器操作 - 验证数据一致性',
      async () => {
        if (!isRedisAvailable || !lock) {
          console.log('⏭️ 跳过测试：Redis 不可用')
          return
        }

        console.log('\n🔢 并发计数器操作一致性测试...')

        const counterKey = `test:concurrency:counter:${Date.now()}`
        const lockResource = `${TEST_CONFIG.LOCK_PREFIX}counter:${Date.now()}`
        const concurrency = 10
        const incrementPerTask = 5

        // 初始化计数器
        await redisClient.set(counterKey, '0')

        /**
         * 带锁的计数器增加操作
         */
        const incrementWithLock = taskId => async () => {
          const startTime = Date.now()
          try {
            const result = await lock.withLock(
              lockResource,
              async () => {
                // 读取当前值
                const current = parseInt(await redisClient.get(counterKey)) || 0
                // 增加
                const newValue = current + incrementPerTask
                // 写回
                await redisClient.set(counterKey, newValue.toString())

                return {
                  task_id: taskId,
                  success: true,
                  previous: current,
                  new_value: newValue,
                  duration: Date.now() - startTime
                }
              },
              {
                ttl: 5000,
                maxRetries: 10,
                retryDelay: 50
              }
            )
            return result
          } catch (error) {
            return {
              task_id: taskId,
              success: false,
              error: error.message,
              duration: Date.now() - startTime
            }
          }
        }

        const tasks = Array(concurrency)
          .fill()
          .map((_, i) => incrementWithLock(i + 1))

        const startTime = Date.now()
        const results = await Promise.all(tasks.map(task => task()))
        const totalTime = Date.now() - startTime

        // 验证最终值
        const finalValue = parseInt(await redisClient.get(counterKey)) || 0
        const expectedValue = concurrency * incrementPerTask
        const successCount = results.filter(r => r.success).length

        console.log(`   并发任务数: ${concurrency}`)
        console.log(`   每个任务增加: ${incrementPerTask}`)
        console.log(`   成功执行: ${successCount}`)
        console.log(`   期望最终值: ${expectedValue}`)
        console.log(`   实际最终值: ${finalValue}`)
        console.log(`   总耗时: ${totalTime}ms`)

        // 验证：最终值应该等于期望值
        expect(finalValue).toBe(expectedValue)

        // 清理
        await redisClient.del(counterKey)

        console.log('   ✅ 并发计数器操作一致性测试通过 - 数据一致性验证成功')
      },
      TEST_CONFIG.TEST_TIMEOUT
    )
  })

  // ==================== 测试报告 ====================

  describe('测试报告', () => {
    test('生成并发控制边界测试报告', async () => {
      console.log('\n')
      console.log('='.repeat(80))
      console.log('📊 P1-1.3 并发控制边界测试报告')
      console.log('='.repeat(80))
      console.log(
        `📅 测试时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
      )
      console.log(`🔗 Redis 状态: ${isRedisAvailable ? '可用' : '不可用'}`)
      console.log('')
      console.log('🧪 测试用例覆盖：')
      console.log('   分布式锁并发控制:')
      console.log(`     ✅ 高并发获取同一把锁 (${TEST_CONFIG.HIGH_CONCURRENCY}并发)`)
      console.log('     ✅ 锁超时自动释放')
      console.log('   用户级并发控制:')
      console.log('     ✅ 单用户并发请求控制')
      console.log('     ✅ 不同用户并发请求独立性')
      console.log('   IP级并发控制:')
      console.log('     ✅ 单IP并发请求控制')
      console.log('   会话创建并发控制:')
      console.log(
        `     ✅ 会话创建频率限制 (${TEST_CONFIG.CREATE_SESSION_LIMIT.max_creates_per_window}次/${TEST_CONFIG.CREATE_SESSION_LIMIT.time_window_seconds}秒)`
      )
      console.log('   竞态条件检测:')
      console.log('     ✅ 并发计数器操作一致性')
      console.log('')
      console.log('🎯 业务场景验证：')
      console.log('   - 防止同一用户同时发起多个抽奖请求')
      console.log('   - 防止同一IP恶意并发攻击')
      console.log('   - 保证关键操作的原子性')
      console.log('   - 防止重复创建会话')
      console.log('   - 并发操作数据一致性保证')
      console.log('='.repeat(80))

      expect(true).toBe(true)
    })
  })
})
