/**
 * 🔗 级联故障测试 - P2-5.1
 *
 * 测试范围：
 * - 服务间依赖故障传播验证
 * - 故障隔离机制验证
 * - 级联恢复能力验证
 * - 超时传播控制验证
 *
 * 审计标准：
 * - C-1：级联故障检测
 * - C-1-1：服务依赖故障传播
 * - C-1-2：故障隔离策略
 * - C-1-3：级联恢复顺序
 * - C-1-4：超时传播控制
 *
 * 业务场景：
 * - 数据库故障导致多服务不可用
 * - Redis缓存故障影响上层服务
 * - 外部API超时传播到内部服务
 * - 核心服务故障时的系统降级
 *
 * 验收标准：
 * - npm test -- tests/chaos/cascade-failure.test.js 全部通过
 * - 故障传播路径可追踪
 * - 故障隔离有效，不影响无关服务
 * - 系统能按正确顺序恢复
 *
 * @module tests/chaos/cascade-failure
 * @since 2026-01-30
 */

'use strict'

const { delay, executeConcurrent } = require('../helpers/test-concurrent-utils')

// 级联故障测试需要较长超时
jest.setTimeout(180000)

describe('🔗 级联故障测试（P2-5.1）', () => {
  // ==================== 测试准备 ====================

  beforeAll(async () => {
    console.log('🔗 ===== 级联故障测试启动 =====')
    console.log(`📅 开始时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
    console.log('='.repeat(70))
  })

  afterAll(async () => {
    console.log('🏁 ===== 级联故障测试完成 =====')
    console.log(`📅 结束时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  })

  // ==================== C-1-1: 服务依赖故障传播 ====================

  describe('C-1-1 服务依赖故障传播', () => {
    /**
     * 业务场景：数据库故障导致多个上层服务不可用
     * 验证目标：故障应正确传播到所有依赖服务
     *
     * 系统架构示意：
     *   [用户服务] ─────┐
     *   [订单服务] ─────┼──→ [数据库层] ─→ [MySQL]
     *   [库存服务] ─────┘
     *
     * 预期结果：数据库故障时，所有依赖服务应返回合适的错误
     */
    test('数据库故障传播到多个上层服务', async () => {
      console.log('')
      console.log('📋 C-1-1-1 数据库故障传播测试:')
      console.log('   模拟场景: 数据库不可用，验证上层服务响应')
      console.log('')

      // 模拟数据库连接层
      const databaseLayer = {
        isHealthy: true,
        connectionPool: { available: 10, used: 0 },

        async query(_sql) {
          if (!this.isHealthy) {
            const error = new Error('ECONNREFUSED: 数据库连接失败')
            error.code = 'ECONNREFUSED'
            error.origin = 'database'
            throw error
          }
          await delay(10) // 模拟查询延迟
          return { rows: [], affectedRows: 0 }
        },

        simulateFault() {
          console.log('   🔴 数据库故障注入')
          this.isHealthy = false
          this.connectionPool.available = 0
        },

        recover() {
          console.log('   🟢 数据库恢复')
          this.isHealthy = true
          this.connectionPool.available = 10
        }
      }

      // 模拟用户服务（依赖数据库）
      const userService = {
        name: 'UserService',

        async getUserById(userId) {
          try {
            await databaseLayer.query(`SELECT * FROM users WHERE user_id = ${userId}`)
            return { success: true, user: { id: userId, name: 'test' } }
          } catch (error) {
            return {
              success: false,
              error: error.message,
              errorCode: 'DATABASE_UNAVAILABLE',
              origin: error.origin,
              service: this.name
            }
          }
        }
      }

      // 模拟订单服务（依赖数据库）
      const orderService = {
        name: 'OrderService',

        async getOrderList(userId) {
          try {
            await databaseLayer.query(`SELECT * FROM orders WHERE user_id = ${userId}`)
            return { success: true, orders: [] }
          } catch (error) {
            return {
              success: false,
              error: error.message,
              errorCode: 'DATABASE_UNAVAILABLE',
              origin: error.origin,
              service: this.name
            }
          }
        }
      }

      // 模拟资产服务（依赖数据库）
      const assetService = {
        name: 'AssetService',

        async getBalance(userId) {
          try {
            await databaseLayer.query(`SELECT balance FROM accounts WHERE user_id = ${userId}`)
            return { success: true, balance: 0 }
          } catch (error) {
            return {
              success: false,
              error: error.message,
              errorCode: 'DATABASE_UNAVAILABLE',
              origin: error.origin,
              service: this.name
            }
          }
        }
      }

      // 1. 正常状态验证
      console.log('   📊 第1阶段：正常状态测试')
      const normalUserResult = await userService.getUserById(1)
      const normalOrderResult = await orderService.getOrderList(1)
      const normalAssetResult = await assetService.getBalance(1)

      expect(normalUserResult.success).toBe(true)
      expect(normalOrderResult.success).toBe(true)
      expect(normalAssetResult.success).toBe(true)
      console.log('   ✅ 正常状态：所有服务运行正常')

      // 2. 注入数据库故障
      console.log('   📊 第2阶段：故障注入测试')
      databaseLayer.simulateFault()

      // 3. 验证故障传播
      const faultUserResult = await userService.getUserById(1)
      const faultOrderResult = await orderService.getOrderList(1)
      const faultAssetResult = await assetService.getBalance(1)

      // 验证所有服务都正确返回数据库不可用错误
      expect(faultUserResult.success).toBe(false)
      expect(faultUserResult.origin).toBe('database')
      expect(faultUserResult.service).toBe('UserService')

      expect(faultOrderResult.success).toBe(false)
      expect(faultOrderResult.origin).toBe('database')
      expect(faultOrderResult.service).toBe('OrderService')

      expect(faultAssetResult.success).toBe(false)
      expect(faultAssetResult.origin).toBe('database')
      expect(faultAssetResult.service).toBe('AssetService')

      console.log('   ✅ 故障传播：所有依赖服务正确感知数据库故障')
      console.log(`      - UserService: ${faultUserResult.errorCode}`)
      console.log(`      - OrderService: ${faultOrderResult.errorCode}`)
      console.log(`      - AssetService: ${faultAssetResult.errorCode}`)

      // 4. 恢复并验证
      console.log('   📊 第3阶段：恢复验证')
      databaseLayer.recover()
      await delay(100) // 等待恢复

      const recoveredUserResult = await userService.getUserById(1)
      const recoveredOrderResult = await orderService.getOrderList(1)
      const recoveredAssetResult = await assetService.getBalance(1)

      expect(recoveredUserResult.success).toBe(true)
      expect(recoveredOrderResult.success).toBe(true)
      expect(recoveredAssetResult.success).toBe(true)

      console.log('   ✅ 恢复验证：所有服务正常恢复')
    })

    /**
     * 业务场景：缓存层故障影响上层服务
     * 验证目标：缓存故障时服务应优雅降级
     *
     * 系统架构示意：
     *   [API层] ──→ [业务服务层] ──→ [缓存层(Redis)] ──→ [数据库层]
     *
     * 预期结果：缓存故障时，服务应降级到直接查询数据库
     */
    test('缓存故障传播与降级', async () => {
      console.log('')
      console.log('📋 C-1-1-2 缓存故障传播测试:')
      console.log('   模拟场景: 缓存不可用，验证服务降级')
      console.log('')

      // 模拟缓存层
      const cacheLayer = {
        isHealthy: true,
        cache: new Map(),

        async get(key) {
          if (!this.isHealthy) {
            throw new Error('REDIS_UNAVAILABLE: 缓存连接失败')
          }
          return this.cache.get(key)
        },

        async set(key, value, _ttl) {
          if (!this.isHealthy) {
            throw new Error('REDIS_UNAVAILABLE: 缓存连接失败')
          }
          this.cache.set(key, value)
          return 'OK'
        },

        simulateFault() {
          console.log('   🔴 缓存故障注入')
          this.isHealthy = false
        },

        recover() {
          console.log('   🟢 缓存恢复')
          this.isHealthy = true
        }
      }

      // 模拟数据库（作为降级目标）
      const database = {
        async queryUser(userId) {
          await delay(50) // 数据库查询较慢
          return { id: userId, name: 'DB_User', source: 'database' }
        }
      }

      // 模拟带缓存的用户服务
      const cachedUserService = {
        cacheHits: 0,
        cacheMisses: 0,
        databaseFallbacks: 0,

        async getUser(userId) {
          const cacheKey = `user:${userId}`

          // 1. 尝试从缓存获取
          try {
            const cached = await cacheLayer.get(cacheKey)
            if (cached) {
              this.cacheHits++
              return { success: true, user: cached, source: 'cache' }
            }
            this.cacheMisses++
          } catch (cacheError) {
            // 缓存故障，记录但不抛出
            console.log(`   ⚠️ 缓存读取失败: ${cacheError.message}`)
            this.databaseFallbacks++
          }

          // 2. 降级到数据库
          const user = await database.queryUser(userId)

          // 3. 尝试回填缓存（失败不影响返回）
          try {
            await cacheLayer.set(cacheKey, user, 3600)
          } catch (cacheError) {
            console.log(`   ⚠️ 缓存写入失败: ${cacheError.message}`)
          }

          return { success: true, user, source: 'database' }
        },

        getStats() {
          return {
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            databaseFallbacks: this.databaseFallbacks
          }
        }
      }

      // 1. 正常状态：第一次查询（缓存未命中）
      console.log('   📊 第1阶段：正常状态测试')
      const result1 = await cachedUserService.getUser(1)
      expect(result1.success).toBe(true)
      expect(result1.source).toBe('database') // 首次查询，缓存未命中
      console.log(`   ✅ 首次查询: 来源=${result1.source}`)

      // 第二次查询（缓存命中）
      const result2 = await cachedUserService.getUser(1)
      expect(result2.success).toBe(true)
      expect(result2.source).toBe('cache') // 缓存命中
      console.log(`   ✅ 二次查询: 来源=${result2.source}`)

      // 2. 注入缓存故障
      console.log('   📊 第2阶段：缓存故障测试')
      cacheLayer.simulateFault()

      // 查询应降级到数据库
      const result3 = await cachedUserService.getUser(2)
      expect(result3.success).toBe(true)
      expect(result3.source).toBe('database') // 降级到数据库
      console.log(`   ✅ 故障期间: 来源=${result3.source} (降级到数据库)`)

      // 3. 恢复缓存
      console.log('   📊 第3阶段：恢复验证')
      cacheLayer.recover()

      const result4 = await cachedUserService.getUser(3)
      expect(result4.success).toBe(true)
      console.log(`   ✅ 恢复后: 来源=${result4.source}`)

      // 统计
      const stats = cachedUserService.getStats()
      console.log(
        `   📈 统计: 缓存命中=${stats.cacheHits}, 缓存未命中=${stats.cacheMisses}, 降级=${stats.databaseFallbacks}`
      )

      expect(stats.databaseFallbacks).toBeGreaterThan(0) // 验证发生了降级
    })
  })

  // ==================== C-1-2: 故障隔离策略 ====================

  describe('C-1-2 故障隔离策略', () => {
    /**
     * 业务场景：服务隔离舱设计
     * 验证目标：一个服务故障不影响其他无关服务
     *
     * 隔离舱设计：
     *   ┌─────────────────┐   ┌─────────────────┐
     *   │ 交易舱          │   │ 非交易舱        │
     *   │ ─ 订单服务      │   │ ─ 通知服务      │
     *   │ ─ 支付服务      │   │ ─ 日志服务      │
     *   │ ─ 库存服务      │   │ ─ 分析服务      │
     *   └─────────────────┘   └─────────────────┘
     *
     * 预期结果：交易舱故障不影响非交易舱服务
     */
    test('服务隔离舱 - 故障不跨舱传播', async () => {
      console.log('')
      console.log('📋 C-1-2-1 服务隔离舱测试:')
      console.log('   模拟场景: 交易舱故障，非交易舱不受影响')
      console.log('')

      // 模拟舱位管理器
      const bulkheadManager = {
        bulkheads: {
          // 交易舱（核心业务）
          trading: {
            name: '交易舱',
            isHealthy: true,
            services: ['OrderService', 'PaymentService', 'InventoryService'],
            maxConcurrency: 100,
            currentConcurrency: 0
          },
          // 非交易舱（非核心业务）
          nonTrading: {
            name: '非交易舱',
            isHealthy: true,
            services: ['NotificationService', 'LogService', 'AnalyticsService'],
            maxConcurrency: 50,
            currentConcurrency: 0
          }
        },

        getBulkheadForService(serviceName) {
          for (const [key, bulkhead] of Object.entries(this.bulkheads)) {
            if (bulkhead.services.includes(serviceName)) {
              return { key, bulkhead }
            }
          }
          return null
        },

        simulateBulkheadFault(bulkheadKey) {
          const bulkhead = this.bulkheads[bulkheadKey]
          if (bulkhead) {
            console.log(`   🔴 ${bulkhead.name}故障注入`)
            bulkhead.isHealthy = false
          }
        },

        recoverBulkhead(bulkheadKey) {
          const bulkhead = this.bulkheads[bulkheadKey]
          if (bulkhead) {
            console.log(`   🟢 ${bulkhead.name}恢复`)
            bulkhead.isHealthy = true
          }
        }
      }

      // 模拟带隔离舱的服务调用
      const serviceInvoker = {
        async invoke(serviceName, operation) {
          const bulkheadInfo = bulkheadManager.getBulkheadForService(serviceName)

          if (!bulkheadInfo) {
            throw new Error(`服务 ${serviceName} 未找到所属隔离舱`)
          }

          const { key, bulkhead } = bulkheadInfo

          // 检查隔离舱健康状态
          if (!bulkhead.isHealthy) {
            return {
              success: false,
              error: `${bulkhead.name}不可用`,
              bulkhead: key,
              service: serviceName
            }
          }

          // 检查并发限制
          if (bulkhead.currentConcurrency >= bulkhead.maxConcurrency) {
            return {
              success: false,
              error: `${bulkhead.name}并发达到上限`,
              bulkhead: key,
              service: serviceName
            }
          }

          bulkhead.currentConcurrency++
          try {
            const result = await operation()
            return {
              success: true,
              result,
              bulkhead: key,
              service: serviceName
            }
          } finally {
            bulkhead.currentConcurrency--
          }
        }
      }

      // 1. 正常状态验证
      console.log('   📊 第1阶段：正常状态测试')

      const tradingResult = await serviceInvoker.invoke('OrderService', async () => {
        await delay(10)
        return { orderId: 'ORD-001' }
      })

      const nonTradingResult = await serviceInvoker.invoke('NotificationService', async () => {
        await delay(10)
        return { notificationId: 'NTF-001' }
      })

      expect(tradingResult.success).toBe(true)
      expect(nonTradingResult.success).toBe(true)
      console.log('   ✅ 正常状态：所有隔离舱服务运行正常')

      // 2. 注入交易舱故障
      console.log('   📊 第2阶段：交易舱故障测试')
      bulkheadManager.simulateBulkheadFault('trading')

      // 交易舱服务应该失败
      const faultTradingResult = await serviceInvoker.invoke('OrderService', async () => {
        return { orderId: 'ORD-002' }
      })
      expect(faultTradingResult.success).toBe(false)
      expect(faultTradingResult.bulkhead).toBe('trading')
      console.log(`   ✅ 交易舱服务: ${faultTradingResult.error}`)

      // 非交易舱服务应该正常
      const isolatedNonTradingResult = await serviceInvoker.invoke(
        'NotificationService',
        async () => {
          await delay(10)
          return { notificationId: 'NTF-002' }
        }
      )
      expect(isolatedNonTradingResult.success).toBe(true)
      expect(isolatedNonTradingResult.bulkhead).toBe('nonTrading')
      console.log(`   ✅ 非交易舱服务: 正常运行，未受影响`)

      // 3. 验证多个服务的隔离效果
      const paymentResult = await serviceInvoker.invoke('PaymentService', async () => {
        return { paymentId: 'PAY-001' }
      })
      const logResult = await serviceInvoker.invoke('LogService', async () => {
        return { logId: 'LOG-001' }
      })

      expect(paymentResult.success).toBe(false) // 同舱服务也受影响
      expect(logResult.success).toBe(true) // 不同舱服务不受影响

      console.log(
        `   ✅ 隔离验证: PaymentService(交易舱)=${paymentResult.success}, LogService(非交易舱)=${logResult.success}`
      )

      // 4. 恢复
      console.log('   📊 第3阶段：恢复验证')
      bulkheadManager.recoverBulkhead('trading')

      const recoveredResult = await serviceInvoker.invoke('OrderService', async () => {
        return { orderId: 'ORD-003' }
      })
      expect(recoveredResult.success).toBe(true)
      console.log('   ✅ 交易舱恢复：服务正常')
    })

    /**
     * 业务场景：故障隔离 - 限制故障传播深度
     * 验证目标：故障不应无限传播，应在指定深度切断
     */
    test('故障传播深度限制', async () => {
      console.log('')
      console.log('📋 C-1-2-2 故障传播深度限制:')
      console.log('   模拟场景: 限制故障传播到最多3层')
      console.log('')

      // 模拟多层服务调用链
      const callChain = {
        maxDepth: 3, // 最大传播深度
        callStack: [],

        createService(name, depth, downstreamService = null) {
          return {
            name,
            depth,
            downstream: downstreamService,
            isHealthy: true,

            async call(faultInjectedAt = null) {
              // 记录调用
              callChain.callStack.push({ name, depth })

              // 检查本服务健康状态
              if (!this.isHealthy) {
                const error = new Error(`${name}故障`)
                error.origin = name
                error.depth = depth
                throw error
              }

              // 如果有下游服务且未超过最大深度
              if (this.downstream && depth < callChain.maxDepth) {
                try {
                  const downstreamResult = await this.downstream.call(faultInjectedAt)
                  return {
                    success: true,
                    service: name,
                    depth,
                    downstream: downstreamResult
                  }
                } catch (downstreamError) {
                  // 故障传播
                  const error = new Error(`${name}因下游服务故障而失败`)
                  error.origin = downstreamError.origin
                  error.depth = depth
                  error.propagationChain = [
                    name,
                    ...(downstreamError.propagationChain || [downstreamError.origin])
                  ]
                  throw error
                }
              } else if (this.downstream && depth >= callChain.maxDepth) {
                // 超过最大深度，切断传播
                console.log(`   🛑 深度${depth}: 到达最大传播深度，切断调用链`)
                return {
                  success: true,
                  service: name,
                  depth,
                  cutOff: true,
                  reason: '达到最大传播深度'
                }
              }

              // 叶子节点
              return {
                success: true,
                service: name,
                depth,
                isLeaf: true
              }
            }
          }
        }
      }

      // 创建5层服务调用链（超过限制的3层）
      const service5 = callChain.createService('Service-5', 5, null)
      const service4 = callChain.createService('Service-4', 4, service5)
      const service3 = callChain.createService('Service-3', 3, service4)
      const service2 = callChain.createService('Service-2', 2, service3)
      const service1 = callChain.createService('Service-1', 1, service2)

      // 1. 正常调用（验证深度切断）
      console.log('   📊 第1阶段：正常调用深度切断测试')
      callChain.callStack = []

      const normalResult = await service1.call()

      expect(normalResult.success).toBe(true)
      // 验证调用只到达第3层
      const maxCalledDepth = Math.max(...callChain.callStack.map(c => c.depth))
      expect(maxCalledDepth).toBeLessThanOrEqual(callChain.maxDepth)
      console.log(`   ✅ 调用深度: ${maxCalledDepth}（最大允许: ${callChain.maxDepth}）`)
      console.log(`   📊 调用链: ${callChain.callStack.map(c => c.name).join(' → ')}`)

      // 2. 故障传播测试
      console.log('   📊 第2阶段：故障传播深度测试')
      callChain.callStack = []

      // 在第3层注入故障
      service3.isHealthy = false

      let propagationError = null
      try {
        await service1.call()
      } catch (error) {
        propagationError = error
      }

      expect(propagationError).not.toBeNull()
      expect(propagationError.origin).toBe('Service-3')
      expect(propagationError.propagationChain).toBeDefined()
      console.log(`   ✅ 故障源: ${propagationError.origin}`)
      console.log(`   📊 传播链: ${propagationError.propagationChain.join(' ← ')}`)

      // 恢复
      service3.isHealthy = true
      console.log('   ✅ 故障传播深度限制验证通过')
    })
  })

  // ==================== C-1-3: 级联恢复顺序 ====================

  describe('C-1-3 级联恢复顺序', () => {
    /**
     * 业务场景：服务按依赖顺序恢复
     * 验证目标：底层服务先恢复，上层服务后恢复
     *
     * 恢复顺序：数据库 → 缓存 → 业务服务 → API层
     */
    test('服务按依赖顺序恢复', async () => {
      console.log('')
      console.log('📋 C-1-3-1 依赖顺序恢复测试:')
      console.log('   模拟场景: 验证服务按正确顺序恢复')
      console.log('')

      // 恢复顺序记录器
      const recoveryRecorder = {
        recoveryOrder: [],
        record(serviceName) {
          const timestamp = Date.now()
          this.recoveryOrder.push({ service: serviceName, timestamp })
          console.log(`   🟢 ${serviceName} 恢复 (顺序: ${this.recoveryOrder.length})`)
        },
        clear() {
          this.recoveryOrder = []
        }
      }

      // 模拟服务依赖图
      const serviceDependencyManager = {
        services: {
          database: {
            name: 'Database',
            isHealthy: false,
            dependencies: [],
            level: 0 // 底层
          },
          cache: {
            name: 'Cache',
            isHealthy: false,
            dependencies: ['database'],
            level: 1
          },
          userService: {
            name: 'UserService',
            isHealthy: false,
            dependencies: ['database', 'cache'],
            level: 2
          },
          orderService: {
            name: 'OrderService',
            isHealthy: false,
            dependencies: ['database', 'cache', 'userService'],
            level: 3
          },
          apiGateway: {
            name: 'APIGateway',
            isHealthy: false,
            dependencies: ['userService', 'orderService'],
            level: 4 // 顶层
          }
        },

        canRecover(serviceName) {
          const service = this.services[serviceName]
          if (!service) return false

          // 检查所有依赖是否已恢复
          return service.dependencies.every(dep => this.services[dep]?.isHealthy)
        },

        async recover(serviceName) {
          const service = this.services[serviceName]
          if (!service) return false

          if (!this.canRecover(serviceName)) {
            console.log(`   ⚠️ ${service.name} 无法恢复：依赖未就绪`)
            return false
          }

          // 模拟恢复过程
          await delay(50)
          service.isHealthy = true
          recoveryRecorder.record(service.name)
          return true
        },

        async cascadeRecover() {
          // 按层级顺序恢复
          const sortedServices = Object.keys(this.services).sort(
            (a, b) => this.services[a].level - this.services[b].level
          )

          for (const serviceName of sortedServices) {
            await this.recover(serviceName)
          }
        }
      }

      // 执行级联恢复
      console.log('   📊 开始级联恢复...')
      recoveryRecorder.clear()

      await serviceDependencyManager.cascadeRecover()

      // 验证恢复顺序
      const recoveryOrder = recoveryRecorder.recoveryOrder
      expect(recoveryOrder.length).toBe(5)

      // 数据库必须最先恢复
      expect(recoveryOrder[0].service).toBe('Database')
      // API网关必须最后恢复
      expect(recoveryOrder[recoveryOrder.length - 1].service).toBe('APIGateway')

      // 验证层级顺序
      const services = serviceDependencyManager.services
      for (let i = 1; i < recoveryOrder.length; i++) {
        const currentServiceKey = Object.keys(services).find(
          k => services[k].name === recoveryOrder[i].service
        )
        const prevServiceKey = Object.keys(services).find(
          k => services[k].name === recoveryOrder[i - 1].service
        )

        expect(services[currentServiceKey].level).toBeGreaterThanOrEqual(
          services[prevServiceKey].level
        )
      }

      console.log('')
      console.log('   📊 恢复顺序验证:')
      recoveryOrder.forEach((r, i) => {
        const serviceKey = Object.keys(services).find(k => services[k].name === r.service)
        console.log(`      ${i + 1}. ${r.service} (层级: ${services[serviceKey].level})`)
      })

      console.log('   ✅ 服务按依赖顺序正确恢复')
    })

    /**
     * 业务场景：恢复超时处理
     * 验证目标：单个服务恢复超时不阻塞整体恢复
     */
    test('恢复超时处理 - 跳过超时服务继续恢复', async () => {
      console.log('')
      console.log('📋 C-1-3-2 恢复超时处理:')
      console.log('   模拟场景: 单个服务恢复超时，不阻塞其他服务')
      console.log('')

      const recoveryManager = {
        recoveryTimeout: 200, // 恢复超时时间
        services: {
          fastService: {
            name: 'FastService',
            isHealthy: false,
            recoveryTime: 50 // 快速恢复
          },
          slowService: {
            name: 'SlowService',
            isHealthy: false,
            recoveryTime: 500 // 超时服务
          },
          mediumService: {
            name: 'MediumService',
            isHealthy: false,
            recoveryTime: 100
          }
        },
        recoveryResults: [],

        async recoverService(serviceName) {
          const service = this.services[serviceName]
          if (!service) return { success: false, error: 'Service not found' }

          const startTime = Date.now()

          // 创建恢复Promise
          const recoveryPromise = (async () => {
            await delay(service.recoveryTime)
            service.isHealthy = true
            return { success: true, service: service.name }
          })()

          // 创建超时Promise
          const timeoutPromise = new Promise(resolve => {
            setTimeout(() => {
              resolve({
                success: false,
                service: service.name,
                error: 'Recovery timeout',
                timedOut: true
              })
            }, this.recoveryTimeout)
          })

          // 竞争
          const result = await Promise.race([recoveryPromise, timeoutPromise])
          result.duration = Date.now() - startTime

          this.recoveryResults.push(result)

          if (result.timedOut) {
            console.log(`   ⚠️ ${service.name} 恢复超时 (${result.duration}ms)`)
          } else {
            console.log(`   ✅ ${service.name} 恢复成功 (${result.duration}ms)`)
          }

          return result
        },

        async recoverAll() {
          this.recoveryResults = []
          const serviceNames = Object.keys(this.services)

          // 并行恢复所有服务（带超时）
          await Promise.all(serviceNames.map(name => this.recoverService(name)))

          return this.recoveryResults
        }
      }

      // 执行恢复
      console.log('   📊 开始并行恢复所有服务...')
      const results = await recoveryManager.recoverAll()

      // 验证结果
      const succeeded = results.filter(r => r.success)
      const timedOut = results.filter(r => r.timedOut)

      expect(succeeded.length).toBe(2) // FastService 和 MediumService
      expect(timedOut.length).toBe(1) // SlowService

      // 验证超时的是SlowService
      expect(timedOut[0].service).toBe('SlowService')

      console.log('')
      console.log(`   📊 恢复统计: 成功=${succeeded.length}, 超时=${timedOut.length}`)
      console.log('   ✅ 超时服务不阻塞其他服务恢复')
    })
  })

  // ==================== C-1-4: 超时传播控制 ====================

  describe('C-1-4 超时传播控制', () => {
    /**
     * 业务场景：超时预算分配
     * 验证目标：整体超时预算在调用链中合理分配
     *
     * 超时预算示例：
     * - 总预算: 1000ms
     * - 网关层: 100ms（解析、路由）
     * - 业务层: 600ms（核心逻辑）
     * - 数据层: 300ms（数据库、缓存）
     */
    test('超时预算分配与控制', async () => {
      console.log('')
      console.log('📋 C-1-4-1 超时预算分配测试:')
      console.log('   模拟场景: 验证超时预算在调用链中的分配')
      console.log('')

      // 超时预算管理器
      const timeoutBudgetManager = {
        createBudget(totalMs) {
          return {
            total: totalMs,
            remaining: totalMs,
            startTime: Date.now(),
            allocations: [],

            allocate(layerName, maxMs) {
              const actualAllocation = Math.min(maxMs, this.remaining)
              this.allocations.push({
                layer: layerName,
                requested: maxMs,
                allocated: actualAllocation
              })
              this.remaining -= actualAllocation
              return actualAllocation
            },

            getRemaining() {
              const elapsed = Date.now() - this.startTime
              return Math.max(0, this.total - elapsed)
            },

            isExpired() {
              return this.getRemaining() <= 0
            }
          }
        }
      }

      // 模拟调用链执行器
      const callChainExecutor = {
        async execute(budget) {
          const results = []

          // 1. 网关层
          const gatewayBudget = budget.allocate('gateway', 100)
          const gatewayStart = Date.now()
          if (!budget.isExpired()) {
            await delay(50) // 模拟网关处理
            results.push({
              layer: 'gateway',
              budget: gatewayBudget,
              actual: Date.now() - gatewayStart,
              success: true
            })
          }

          // 2. 业务层
          const businessBudget = budget.allocate('business', 600)
          const businessStart = Date.now()
          if (!budget.isExpired()) {
            await delay(200) // 模拟业务处理
            results.push({
              layer: 'business',
              budget: businessBudget,
              actual: Date.now() - businessStart,
              success: true
            })
          }

          // 3. 数据层
          const dataBudget = budget.allocate('data', 300)
          const dataStart = Date.now()
          if (!budget.isExpired()) {
            await delay(100) // 模拟数据查询
            results.push({
              layer: 'data',
              budget: dataBudget,
              actual: Date.now() - dataStart,
              success: true
            })
          }

          return {
            totalBudget: budget.total,
            remainingBudget: budget.getRemaining(),
            allocations: budget.allocations,
            layerResults: results
          }
        }
      }

      // 执行测试
      console.log('   📊 执行超时预算分配测试...')
      const budget = timeoutBudgetManager.createBudget(1000) // 1秒总预算
      const result = await callChainExecutor.execute(budget)

      // 验证预算分配
      expect(result.allocations.length).toBe(3)
      expect(result.allocations.reduce((sum, a) => sum + a.allocated, 0)).toBeLessThanOrEqual(1000)

      // 验证所有层都成功执行
      expect(result.layerResults.length).toBe(3)
      expect(result.layerResults.every(r => r.success)).toBe(true)

      console.log('')
      console.log('   📊 超时预算分配:')
      result.allocations.forEach(a => {
        console.log(`      ${a.layer}: 请求=${a.requested}ms, 分配=${a.allocated}ms`)
      })
      console.log('')
      console.log('   📊 实际执行时间:')
      result.layerResults.forEach(r => {
        console.log(`      ${r.layer}: 预算=${r.budget}ms, 实际=${r.actual}ms`)
      })
      console.log(`   📊 剩余预算: ${result.remainingBudget}ms`)

      console.log('   ✅ 超时预算分配验证通过')
    })

    /**
     * 业务场景：超时传播切断
     * 验证目标：下游服务超时不应阻塞上游服务的超时处理
     */
    test('超时传播切断 - 下游超时快速失败', async () => {
      console.log('')
      console.log('📋 C-1-4-2 超时传播切断测试:')
      console.log('   模拟场景: 下游服务超时，上游服务快速失败')
      console.log('')

      // 模拟服务调用器（带超时控制）
      const serviceInvoker = {
        async invokeWithTimeout(serviceFn, timeoutMs, serviceName) {
          const startTime = Date.now()

          const timeoutPromise = new Promise((_resolve, reject) => {
            setTimeout(() => {
              const error = new Error(`${serviceName} 超时`)
              error.code = 'TIMEOUT'
              error.service = serviceName
              error.timeout = timeoutMs
              reject(error)
            }, timeoutMs)
          })

          try {
            const result = await Promise.race([serviceFn(), timeoutPromise])
            return {
              success: true,
              service: serviceName,
              duration: Date.now() - startTime,
              result
            }
          } catch (error) {
            return {
              success: false,
              service: serviceName,
              duration: Date.now() - startTime,
              error: error.message,
              code: error.code
            }
          }
        }
      }

      // 模拟调用链
      const callChain = {
        async executeChain() {
          const timeout = 200 // 每层超时

          // 层1: 网关
          const layer1 = await serviceInvoker.invokeWithTimeout(
            async () => {
              await delay(50)
              return 'gateway ok'
            },
            timeout,
            'Gateway'
          )

          if (!layer1.success) {
            return { layers: [layer1], success: false }
          }

          // 层2: 业务服务
          const layer2 = await serviceInvoker.invokeWithTimeout(
            async () => {
              await delay(100)
              return 'business ok'
            },
            timeout,
            'BusinessService'
          )

          if (!layer2.success) {
            return { layers: [layer1, layer2], success: false }
          }

          // 层3: 数据服务（模拟超时）
          const layer3 = await serviceInvoker.invokeWithTimeout(
            async () => {
              await delay(300) // 超过timeout，会超时
              return 'data ok'
            },
            timeout,
            'DataService'
          )

          return {
            layers: [layer1, layer2, layer3],
            success: layer3.success
          }
        }
      }

      // 执行测试
      console.log('   📊 执行超时传播切断测试...')
      const startTime = Date.now()
      const result = await callChain.executeChain()
      const totalDuration = Date.now() - startTime

      // 验证结果
      expect(result.success).toBe(false)
      expect(result.layers.length).toBe(3)

      // 前两层应该成功
      expect(result.layers[0].success).toBe(true)
      expect(result.layers[1].success).toBe(true)

      // 第三层应该超时
      expect(result.layers[2].success).toBe(false)
      expect(result.layers[2].code).toBe('TIMEOUT')

      // 总时间应该接近各层超时之和，而不是无限等待
      expect(totalDuration).toBeLessThan(500) // 不应该等待DataService的300ms

      console.log('')
      console.log('   📊 执行结果:')
      result.layers.forEach(l => {
        const status = l.success ? '✅' : '⚠️'
        console.log(
          `      ${status} ${l.service}: ${l.success ? '成功' : l.error} (${l.duration}ms)`
        )
      })
      console.log(`   📊 总耗时: ${totalDuration}ms`)

      console.log('   ✅ 超时传播切断验证通过')
    })
  })

  // ==================== 综合测试 ====================

  describe('综合场景测试', () => {
    /**
     * 业务场景：并发请求下的级联故障
     * 验证目标：并发环境下故障传播和恢复正确
     */
    test('并发请求下的级联故障处理', async () => {
      console.log('')
      console.log('📋 综合场景：并发请求下的级联故障')
      console.log('')

      // 模拟系统
      const system = {
        databaseHealthy: true,
        requestCount: 0,
        successCount: 0,
        failureCount: 0,
        degradedCount: 0,

        async handleRequest(requestId) {
          this.requestCount++

          if (!this.databaseHealthy) {
            this.failureCount++
            return {
              success: false,
              requestId,
              error: '数据库不可用',
              degraded: true
            }
          }

          await delay(10 + Math.random() * 20)
          this.successCount++
          return {
            success: true,
            requestId,
            result: 'processed'
          }
        },

        injectFault() {
          this.databaseHealthy = false
        },

        recover() {
          this.databaseHealthy = true
        }
      }

      // 创建并发请求任务
      const createTasks = (count, startId) => {
        return Array(count)
          .fill()
          .map((_, i) => async () => {
            return await system.handleRequest(`req-${startId + i}`)
          })
      }

      // 阶段1：正常并发请求
      console.log('   📊 阶段1：正常并发请求')
      const { metrics: normalMetrics } = await executeConcurrent(createTasks(20, 0), {
        concurrency: 5
      })
      expect(normalMetrics.succeeded).toBe(20)
      console.log(`   ✅ 正常阶段: ${normalMetrics.succeeded}/${normalMetrics.total} 成功`)

      // 阶段2：故障期间并发请求
      console.log('   📊 阶段2：故障期间并发请求')
      system.injectFault()
      const { metrics: faultMetrics, results: faultResults } = await executeConcurrent(
        createTasks(20, 100),
        {
          concurrency: 5
        }
      )

      // 所有请求都应该返回（快速失败），但结果标记为失败
      expect(faultMetrics.succeeded).toBe(20) // 任务本身没有抛异常
      const degradedResponses = faultResults.filter(r => r.result?.degraded)
      expect(degradedResponses.length).toBe(20) // 但业务结果是降级的
      console.log(`   ⚠️ 故障阶段: ${degradedResponses.length}/${faultMetrics.total} 降级响应`)

      // 阶段3：恢复后并发请求
      console.log('   📊 阶段3：恢复后并发请求')
      system.recover()
      await delay(100) // 等待恢复

      const { metrics: recoveredMetrics } = await executeConcurrent(createTasks(20, 200), {
        concurrency: 5
      })
      expect(recoveredMetrics.succeeded).toBe(20)
      console.log(`   ✅ 恢复阶段: ${recoveredMetrics.succeeded}/${recoveredMetrics.total} 成功`)

      // 总统计
      console.log('')
      console.log('   📊 总统计:')
      console.log(`      总请求: ${system.requestCount}`)
      console.log(`      成功: ${system.successCount}`)
      console.log(`      失败(降级): ${system.failureCount}`)
    })
  })
})
