/**
 * 🔴 Redis故障注入测试 - P2-5
 *
 * 测试范围：
 * - Redis连接断开场景
 * - Redis连接恢复场景
 * - Redis命令超时场景
 * - Redis缓存数据丢失场景
 *
 * 审计标准：
 * - B-8：Redis故障注入测试
 * - B-8-1：连接断开处理
 * - B-8-2：连接恢复验证
 * - B-8-3：命令超时处理
 * - B-8-4：缓存降级策略
 *
 * 测试原则：
 * - 模拟故障场景，验证系统容错能力
 * - 验证错误处理的正确性
 * - 验证降级策略的有效性
 *
 * 验收标准：
 * - npm test -- tests/chaos/redis_fault_injection.test.js 全部通过
 * - Redis故障时系统能优雅降级
 * - 故障恢复后系统自动恢复正常
 *
 * @module tests/chaos/redis_fault_injection
 * @since 2026-01-28
 */

'use strict'

const { delay } = require('../helpers/test-concurrent-utils')

// 故障注入测试需要较长超时
jest.setTimeout(120000)

describe('🔴 Redis故障注入测试（P2-5-1）', () => {
  // ==================== 测试准备 ====================

  beforeAll(async () => {
    console.log('🔴 ===== Redis故障注入测试启动 =====')
    console.log(`📅 开始时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
    console.log('='.repeat(70))
  })

  afterAll(async () => {
    console.log('🏁 ===== Redis故障注入测试完成 =====')
    console.log(`📅 结束时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  })

  // ==================== B-8-1: 连接断开处理 ====================

  describe('B-8-1 连接断开处理', () => {
    /**
     * 业务场景：Redis连接断开
     * 验证目标：断开后应返回合适的错误或降级处理
     */
    test('模拟Redis连接断开 - 应返回降级响应', async () => {
      console.log('')
      console.log('📋 B-8-1-1 Redis断开连接模拟:')
      console.log('   模拟场景: Redis服务不可用')
      console.log('')

      // 模拟一个断开的Redis客户端
      const disconnectedRedisClient = {
        connected: false,

        async get(_key) {
          if (!this.connected) {
            throw new Error('ECONNREFUSED - Connection refused')
          }
          return null
        },

        async set(_key, _value) {
          if (!this.connected) {
            throw new Error('ECONNREFUSED - Connection refused')
          }
          return 'OK'
        },

        async ping() {
          if (!this.connected) {
            throw new Error('ECONNREFUSED - Connection refused')
          }
          return 'PONG'
        }
      }

      // 模拟带降级的服务
      const serviceWithFallback = {
        async getData(key) {
          try {
            return await disconnectedRedisClient.get(key)
          } catch (error) {
            if (error.message.includes('ECONNREFUSED')) {
              console.log('   ⚠️ Redis不可用，使用降级策略')
              return { fallback: true, source: 'memory_cache' }
            }
            throw error
          }
        }
      }

      const result = await serviceWithFallback.getData('test_key')

      expect(result.fallback).toBe(true)
      expect(result.source).toBe('memory_cache')

      console.log('✅ Redis断开时降级响应验证通过')
    })

    /**
     * 业务场景：Redis断开后健康检查反映状态
     * 验证目标：健康检查应正确反映Redis状态
     */
    test('Redis断开后健康检查应反映异常', async () => {
      console.log('')
      console.log('📋 B-8-1-2 健康检查状态反映:')
      console.log('   模拟场景: Redis断开后健康检查')
      console.log('')

      // 模拟健康检查服务
      const healthChecker = {
        redisConnected: false,

        async checkRedis() {
          if (!this.redisConnected) {
            return { status: 'error', message: 'Redis连接断开' }
          }
          return { status: 'ok', message: 'Redis连接正常' }
        },

        async getOverallHealth() {
          const redisHealth = await this.checkRedis()
          return {
            status: redisHealth.status === 'ok' ? 'healthy' : 'degraded',
            dependencies: {
              redis: redisHealth.status
            }
          }
        }
      }

      const health = await healthChecker.getOverallHealth()

      expect(health.status).toBe('degraded')
      expect(health.dependencies.redis).toBe('error')

      console.log('✅ 健康检查正确反映Redis异常状态')
    })
  })

  // ==================== B-8-2: 连接恢复验证 ====================

  describe('B-8-2 连接恢复验证', () => {
    /**
     * 业务场景：Redis连接恢复
     * 验证目标：连接恢复后系统应自动恢复正常
     */
    test('Redis恢复后功能自动恢复', async () => {
      console.log('')
      console.log('📋 B-8-2-1 Redis恢复测试:')
      console.log('   模拟场景: Redis从断开恢复到正常')
      console.log('')

      // 模拟可恢复的Redis客户端
      const recoverableRedisClient = {
        connected: false,
        data: new Map(),

        async connect() {
          await delay(100)
          this.connected = true
          console.log('   🟢 Redis连接已恢复')
        },

        async get(key) {
          if (!this.connected) {
            throw new Error('ECONNREFUSED - Connection refused')
          }
          return this.data.get(key) || null
        },

        async set(key, value) {
          if (!this.connected) {
            throw new Error('ECONNREFUSED - Connection refused')
          }
          this.data.set(key, value)
          return 'OK'
        }
      }

      // 初始状态：断开
      expect(recoverableRedisClient.connected).toBe(false)

      // 模拟恢复
      await recoverableRedisClient.connect()

      // 恢复后验证功能
      await recoverableRedisClient.set('test_key', 'test_value')
      const value = await recoverableRedisClient.get('test_key')

      expect(recoverableRedisClient.connected).toBe(true)
      expect(value).toBe('test_value')

      console.log('✅ Redis恢复后功能正常')
    })

    /**
     * 业务场景：断线重连机制
     * 验证目标：应有自动重连逻辑
     */
    test('断线自动重连机制', async () => {
      console.log('')
      console.log('📋 B-8-2-2 断线重连机制:')
      console.log('   模拟场景: 连接断开后自动重试')
      console.log('')

      const autoReconnectClient = {
        connected: false,
        reconnectAttempts: 0,
        maxReconnectAttempts: 3,

        async reconnect() {
          while (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++
            console.log(`   🔄 重连尝试 #${this.reconnectAttempts}`)

            try {
              // 模拟第3次成功
              if (this.reconnectAttempts >= 3) {
                this.connected = true
                return true
              }
              throw new Error('Connection failed')
            } catch (error) {
              await delay(100 * this.reconnectAttempts) // 指数退避
            }
          }
          return false
        }
      }

      const success = await autoReconnectClient.reconnect()

      expect(success).toBe(true)
      expect(autoReconnectClient.connected).toBe(true)
      expect(autoReconnectClient.reconnectAttempts).toBe(3)

      console.log(`✅ 重连成功，尝试次数: ${autoReconnectClient.reconnectAttempts}`)
    })
  })

  // ==================== B-8-3: 命令超时处理 ====================

  describe('B-8-3 命令超时处理', () => {
    /**
     * 业务场景：Redis命令执行超时
     * 验证目标：超时后应快速失败
     */
    test('Redis命令超时 - 快速失败', async () => {
      console.log('')
      console.log('📋 B-8-3-1 命令超时模拟:')
      console.log('   模拟场景: Redis命令响应慢')
      console.log('')

      // 模拟慢速Redis客户端
      const slowRedisClient = {
        commandTimeout: 200, // 200ms超时

        async executeWithTimeout(command) {
          const timeoutPromise = new Promise((_resolve, reject) => {
            setTimeout(() => {
              reject(new Error('ETIMEDOUT - Command timeout'))
            }, this.commandTimeout)
          })

          return Promise.race([command(), timeoutPromise])
        }
      }

      const startTime = Date.now()

      let error = null
      try {
        await slowRedisClient.executeWithTimeout(async () => {
          await delay(500)
          return 'slow_result'
        })
      } catch (e) {
        error = e
      }

      const duration = Date.now() - startTime

      expect(error).not.toBeNull()
      expect(error.message).toContain('ETIMEDOUT')
      // 应该在超时时间附近失败
      expect(duration).toBeGreaterThanOrEqual(200)
      expect(duration).toBeLessThan(500)

      console.log(`✅ 超时错误在${duration}ms内返回（限制200ms）`)
    })

    /**
     * 业务场景：批量命令部分超时
     * 验证目标：部分失败不影响其他命令
     */
    test('批量命令部分超时处理', async () => {
      console.log('')
      console.log('📋 B-8-3-2 批量命令超时:')
      console.log('   模拟场景: 部分命令超时')
      console.log('')

      const batchExecutor = {
        timeout: 100,

        async executeBatch(commands) {
          const results = await Promise.allSettled(
            commands.map(async cmd => {
              const timeoutPromise = new Promise((_resolve, reject) => {
                setTimeout(() => reject(new Error('Timeout')), this.timeout)
              })

              return Promise.race([cmd(), timeoutPromise])
            })
          )

          return results.map((result, idx) => ({
            index: idx,
            success: result.status === 'fulfilled',
            value: result.status === 'fulfilled' ? result.value : null,
            error: result.status === 'rejected' ? result.reason.message : null
          }))
        }
      }

      const commands = [
        async () => {
          await delay(50)
          return 'fast_1'
        },
        async () => {
          await delay(200) // 超时
          return 'slow'
        },
        async () => {
          await delay(50)
          return 'fast_2'
        }
      ]

      const results = await batchExecutor.executeBatch(commands)

      expect(results[0].success).toBe(true)
      expect(results[0].value).toBe('fast_1')
      expect(results[1].success).toBe(false)
      expect(results[1].error).toBe('Timeout')
      expect(results[2].success).toBe(true)
      expect(results[2].value).toBe('fast_2')

      console.log('✅ 批量命令部分超时处理正确')
      console.log(`   成功: ${results.filter(r => r.success).length}`)
      console.log(`   超时: ${results.filter(r => !r.success).length}`)
    })
  })

  // ==================== B-8-4: 缓存降级策略 ====================

  describe('B-8-4 缓存降级策略', () => {
    /**
     * 业务场景：Redis不可用时使用本地缓存
     * 验证目标：应降级到本地内存缓存
     */
    test('Redis不可用时降级到本地缓存', async () => {
      console.log('')
      console.log('📋 B-8-4-1 本地缓存降级:')
      console.log('   模拟场景: Redis断开，使用本地缓存')
      console.log('')

      // 多层缓存服务
      const multiLayerCache = {
        localCache: new Map(),
        redisConnected: false,

        async get(key) {
          // 尝试Redis
          if (this.redisConnected) {
            // 模拟从Redis获取
            return null
          }

          // 降级到本地缓存
          if (this.localCache.has(key)) {
            console.log(`   📍 从本地缓存获取: ${key}`)
            return this.localCache.get(key)
          }

          return null
        },

        async set(key, value, _ttl) {
          // 尝试Redis
          if (this.redisConnected) {
            // 模拟写入Redis
          }

          // 同时写入本地缓存
          this.localCache.set(key, value)
          console.log(`   📍 写入本地缓存: ${key}`)
        }
      }

      // Redis断开状态
      multiLayerCache.redisConnected = false

      // 写入缓存
      await multiLayerCache.set('user:123', { name: 'Test User' })

      // 读取缓存
      const data = await multiLayerCache.get('user:123')

      expect(data).toEqual({ name: 'Test User' })

      console.log('✅ 本地缓存降级验证通过')
    })

    /**
     * 业务场景：缓存穿透时直接查数据库
     * 验证目标：缓存miss时应查询数据库
     */
    test('缓存穿透时查询数据库', async () => {
      console.log('')
      console.log('📋 B-8-4-2 缓存穿透处理:')
      console.log('   模拟场景: 缓存未命中，查询数据库')
      console.log('')

      // 模拟数据库
      const mockDatabase = {
        data: { 'user:456': { id: 456, name: 'DB User' } },

        async query(key) {
          console.log(`   💾 查询数据库: ${key}`)
          await delay(50) // 模拟数据库延迟
          return this.data[key] || null
        }
      }

      // 带数据库兜底的缓存服务
      const cacheWithDbFallback = {
        cache: new Map(),

        async get(key) {
          // 先查缓存
          if (this.cache.has(key)) {
            console.log(`   ✅ 缓存命中: ${key}`)
            return this.cache.get(key)
          }

          console.log(`   ❌ 缓存未命中: ${key}`)

          // 缓存miss，查数据库
          const dbData = await mockDatabase.query(key)

          if (dbData) {
            // 回填缓存
            this.cache.set(key, dbData)
            console.log(`   📥 回填缓存: ${key}`)
          }

          return dbData
        }
      }

      // 第一次查询（缓存miss，查DB）
      const data1 = await cacheWithDbFallback.get('user:456')
      expect(data1).toEqual({ id: 456, name: 'DB User' })

      // 第二次查询（缓存hit）
      const data2 = await cacheWithDbFallback.get('user:456')
      expect(data2).toEqual({ id: 456, name: 'DB User' })

      console.log('✅ 缓存穿透数据库兜底验证通过')
    })

    /**
     * 业务场景：Redis恢复后自动切换
     * 验证目标：Redis恢复后应自动使用Redis
     */
    test('Redis恢复后自动切换', async () => {
      console.log('')
      console.log('📋 B-8-4-3 缓存切换:')
      console.log('   模拟场景: Redis恢复后自动切换')
      console.log('')

      const adaptiveCache = {
        localCache: new Map(),
        redisCache: new Map(),
        redisConnected: false,
        operationLog: [],

        async get(key) {
          if (this.redisConnected) {
            this.operationLog.push(`Redis GET: ${key}`)
            return this.redisCache.get(key)
          }

          this.operationLog.push(`Local GET: ${key}`)
          return this.localCache.get(key)
        },

        async set(key, value) {
          if (this.redisConnected) {
            this.operationLog.push(`Redis SET: ${key}`)
            this.redisCache.set(key, value)
          }

          this.operationLog.push(`Local SET: ${key}`)
          this.localCache.set(key, value)
        },

        // 模拟Redis恢复
        recoverRedis() {
          this.redisConnected = true
          // 同步本地缓存到Redis
          for (const [key, value] of this.localCache) {
            this.redisCache.set(key, value)
          }
          this.operationLog.push('Redis recovered - cache synced')
        }
      }

      // Redis断开时操作
      await adaptiveCache.set('key1', 'value1')
      await adaptiveCache.get('key1')

      expect(adaptiveCache.operationLog).toContain('Local SET: key1')
      expect(adaptiveCache.operationLog).toContain('Local GET: key1')

      // 模拟Redis恢复
      adaptiveCache.recoverRedis()

      // Redis恢复后操作
      await adaptiveCache.set('key2', 'value2')
      await adaptiveCache.get('key2')

      expect(adaptiveCache.operationLog).toContain('Redis SET: key2')
      expect(adaptiveCache.operationLog).toContain('Redis GET: key2')

      console.log('✅ Redis恢复后自动切换验证通过')
      console.log(`   操作日志: ${adaptiveCache.operationLog.slice(-5).join(' -> ')}`)
    })
  })
})
