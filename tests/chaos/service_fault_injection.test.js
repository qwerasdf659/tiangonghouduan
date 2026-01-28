/**
 * 🔧 服务故障注入测试 - P2-5
 *
 * 测试范围：
 * - 服务重启场景
 * - 服务降级场景
 * - 熔断器测试
 * - 优雅关闭测试
 *
 * 审计标准：
 * - B-11：服务故障注入测试
 * - B-11-1：服务重启处理
 * - B-11-2：服务降级策略
 * - B-11-3：熔断器机制
 * - B-11-4：优雅关闭
 *
 * 测试原则：
 * - 模拟服务级别的故障
 * - 验证服务容错能力
 * - 验证熔断和降级机制
 *
 * 验收标准：
 * - npm test -- tests/chaos/service_fault_injection.test.js 全部通过
 * - 服务重启时请求有合适的处理
 * - 熔断器能正确工作
 *
 * @module tests/chaos/service_fault_injection
 * @since 2026-01-28
 */

'use strict'

const { delay } = require('../helpers/test-concurrent-utils')

// 故障注入测试需要较长超时
jest.setTimeout(120000)

describe('🔧 服务故障注入测试（P2-5-4）', () => {
  // ==================== 测试准备 ====================

  beforeAll(async () => {
    console.log('🔧 ===== 服务故障注入测试启动 =====')
    console.log(`📅 开始时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
    console.log('='.repeat(70))
  })

  afterAll(async () => {
    console.log('🏁 ===== 服务故障注入测试完成 =====')
    console.log(`📅 结束时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  })

  // ==================== B-11-1: 服务重启处理 ====================

  describe('B-11-1 服务重启处理', () => {
    /**
     * 业务场景：服务重启期间的请求处理
     * 验证目标：重启期间请求应有合适的响应
     */
    test('模拟服务重启 - 请求排队或快速失败', async () => {
      console.log('')
      console.log('📋 B-11-1-1 服务重启模拟:')
      console.log('   模拟场景: 服务重启期间的请求处理')
      console.log('')

      // 模拟可重启的服务
      const restartableService = {
        isRunning: true,
        requestQueue: [],
        restartDuration: 200,

        async handleRequest(requestId) {
          if (!this.isRunning) {
            // 服务重启中，快速失败
            return { success: false, error: 'Service restarting', code: 503 }
          }

          await delay(50)
          return { success: true, requestId, result: 'processed' }
        },

        async restart() {
          console.log('   🔄 服务开始重启...')
          this.isRunning = false

          await delay(this.restartDuration)

          this.isRunning = true
          console.log('   ✅ 服务重启完成')
        }
      }

      // 发起请求（服务正常）
      const result1 = await restartableService.handleRequest('req-1')
      expect(result1.success).toBe(true)

      // 开始重启
      const restartPromise = restartableService.restart()

      // 等待服务进入重启状态
      await delay(50)

      // 发起请求（服务重启中）
      const result2 = await restartableService.handleRequest('req-2')
      expect(result2.success).toBe(false)
      expect(result2.code).toBe(503)

      // 等待重启完成
      await restartPromise

      // 发起请求（服务恢复）
      const result3 = await restartableService.handleRequest('req-3')
      expect(result3.success).toBe(true)

      console.log('✅ 服务重启期间请求处理验证通过')
    })

    /**
     * 业务场景：滚动重启
     * 验证目标：多实例时滚动重启不应中断服务
     */
    test('模拟滚动重启 - 零停机时间', async () => {
      console.log('')
      console.log('📋 B-11-1-2 滚动重启模拟:')
      console.log('   模拟场景: 多实例滚动重启')
      console.log('')

      // 模拟服务实例池
      const instancePool = {
        instances: [
          { id: 1, running: true },
          { id: 2, running: true },
          { id: 3, running: true }
        ],
        currentIndex: 0,

        // 负载均衡获取健康实例
        getHealthyInstance() {
          const runningInstances = this.instances.filter(i => i.running)
          if (runningInstances.length === 0) {
            return null
          }

          // 简单轮询
          const instance = runningInstances[this.currentIndex % runningInstances.length]
          this.currentIndex++
          return instance
        },

        async handleRequest(requestId) {
          const instance = this.getHealthyInstance()
          if (!instance) {
            return { success: false, error: 'No healthy instance' }
          }

          await delay(30)
          return { success: true, requestId, instanceId: instance.id }
        },

        async rollingRestart() {
          for (let i = 0; i < this.instances.length; i++) {
            const instance = this.instances[i]
            console.log(`   🔄 重启实例 ${instance.id}`)

            // 标记为不健康
            instance.running = false

            // 模拟重启时间
            await delay(100)

            // 恢复健康
            instance.running = true
            console.log(`   ✅ 实例 ${instance.id} 恢复`)
          }
        }
      }

      // 在滚动重启期间持续发送请求
      const rollingRestartPromise = instancePool.rollingRestart()

      const results = []
      for (let i = 0; i < 15; i++) {
        const result = await instancePool.handleRequest(`req-${i}`)
        results.push(result)
        await delay(30)
      }

      await rollingRestartPromise

      // 所有请求都应成功（因为总有健康实例）
      const allSuccessful = results.every(r => r.success)
      expect(allSuccessful).toBe(true)

      console.log(`✅ 滚动重启零停机验证通过`)
      console.log(`   总请求: ${results.length}, 成功: ${results.filter(r => r.success).length}`)
    })
  })

  // ==================== B-11-2: 服务降级策略 ====================

  describe('B-11-2 服务降级策略', () => {
    /**
     * 业务场景：非核心功能降级
     * 验证目标：非核心功能失败不影响核心功能
     */
    test('非核心功能降级 - 核心功能不受影响', async () => {
      console.log('')
      console.log('📋 B-11-2-1 功能降级模拟:')
      console.log('   模拟场景: 非核心服务降级')
      console.log('')

      // 模拟服务组合
      const compositeService = {
        coreServiceAvailable: true,
        recommendationServiceAvailable: false, // 推荐服务不可用

        async getCoreData(userId) {
          if (!this.coreServiceAvailable) {
            throw new Error('Core service unavailable')
          }
          return { userId, balance: 1000, status: 'active' }
        },

        async getRecommendations(_userId) {
          if (!this.recommendationServiceAvailable) {
            console.log('   ⚠️ 推荐服务不可用，返回默认推荐')
            return { degraded: true, recommendations: ['default-item-1', 'default-item-2'] }
          }
          return { recommendations: ['personalized-item-1'] }
        },

        async getUserProfile(userId) {
          // 核心数据必须成功
          const coreData = await this.getCoreData(userId)

          // 非核心数据可以降级
          let recommendations
          try {
            recommendations = await this.getRecommendations(userId)
          } catch (error) {
            recommendations = { degraded: true, recommendations: [] }
          }

          return {
            ...coreData,
            ...recommendations
          }
        }
      }

      const profile = await compositeService.getUserProfile('user-123')

      expect(profile.userId).toBe('user-123')
      expect(profile.balance).toBe(1000)
      expect(profile.degraded).toBe(true) // 推荐被降级
      expect(profile.recommendations.length).toBeGreaterThan(0) // 有默认推荐

      console.log('✅ 非核心功能降级验证通过')
    })

    /**
     * 业务场景：根据负载自动降级
     * 验证目标：高负载时自动禁用非必要功能
     */
    test('根据负载自动降级', async () => {
      console.log('')
      console.log('📋 B-11-2-2 负载自动降级:')
      console.log('   模拟场景: 高负载时自动降级')
      console.log('')

      const loadBasedDegradation = {
        currentLoad: 0,
        loadThreshold: 80, // 80%负载开始降级
        criticalThreshold: 95, // 95%只保留核心功能

        featureStatus: {
          core: true, // 始终开启
          analytics: true, // 可降级
          recommendations: true // 可降级
        },

        setLoad(load) {
          this.currentLoad = load

          if (load >= this.criticalThreshold) {
            // 只保留核心功能
            this.featureStatus.analytics = false
            this.featureStatus.recommendations = false
            console.log(`   🔴 负载${load}%: 仅保留核心功能`)
          } else if (load >= this.loadThreshold) {
            // 禁用分析功能
            this.featureStatus.analytics = false
            this.featureStatus.recommendations = true
            console.log(`   🟡 负载${load}%: 禁用分析功能`)
          } else {
            // 全功能开启
            this.featureStatus.analytics = true
            this.featureStatus.recommendations = true
            console.log(`   🟢 负载${load}%: 全功能开启`)
          }
        },

        isFeatureEnabled(feature) {
          return this.featureStatus[feature]
        }
      }

      // 低负载
      loadBasedDegradation.setLoad(50)
      expect(loadBasedDegradation.isFeatureEnabled('analytics')).toBe(true)
      expect(loadBasedDegradation.isFeatureEnabled('recommendations')).toBe(true)

      // 高负载
      loadBasedDegradation.setLoad(85)
      expect(loadBasedDegradation.isFeatureEnabled('analytics')).toBe(false)
      expect(loadBasedDegradation.isFeatureEnabled('recommendations')).toBe(true)

      // 极高负载
      loadBasedDegradation.setLoad(98)
      expect(loadBasedDegradation.isFeatureEnabled('analytics')).toBe(false)
      expect(loadBasedDegradation.isFeatureEnabled('recommendations')).toBe(false)
      expect(loadBasedDegradation.isFeatureEnabled('core')).toBe(true) // 核心始终开启

      console.log('✅ 负载自动降级验证通过')
    })
  })

  // ==================== B-11-3: 熔断器机制 ====================

  describe('B-11-3 熔断器机制', () => {
    /**
     * 业务场景：熔断器状态转换
     * 验证目标：CLOSED -> OPEN -> HALF-OPEN -> CLOSED
     */
    test('熔断器状态转换', async () => {
      console.log('')
      console.log('📋 B-11-3-1 熔断器状态转换:')
      console.log('   模拟场景: 熔断器三种状态的转换')
      console.log('')

      // 简化的熔断器实现
      const circuitBreaker = {
        state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
        failureCount: 0,
        successCount: 0,
        failureThreshold: 3,
        successThreshold: 2,
        openTimeout: 200, // 熔断打开后的等待时间
        lastFailureTime: null,

        async call(operation) {
          // OPEN状态：快速失败
          if (this.state === 'OPEN') {
            // 检查是否可以进入HALF_OPEN
            if (Date.now() - this.lastFailureTime >= this.openTimeout) {
              this.state = 'HALF_OPEN'
              console.log('   🟡 熔断器进入HALF_OPEN状态')
            } else {
              return { success: false, error: 'Circuit breaker is OPEN' }
            }
          }

          try {
            const result = await operation()

            // 成功：HALF_OPEN下检查是否可以关闭
            if (this.state === 'HALF_OPEN') {
              this.successCount++
              if (this.successCount >= this.successThreshold) {
                this.state = 'CLOSED'
                this.successCount = 0
                this.failureCount = 0
                console.log('   🟢 熔断器恢复CLOSED状态')
              }
            } else {
              this.failureCount = 0 // 成功重置失败计数
            }

            return { success: true, result }
          } catch (error) {
            this.failureCount++
            this.lastFailureTime = Date.now()

            // HALF_OPEN下失败：立即打开
            if (this.state === 'HALF_OPEN') {
              this.state = 'OPEN'
              this.successCount = 0
              console.log('   🔴 HALF_OPEN失败，熔断器恢复OPEN状态')
            } else if (this.failureCount >= this.failureThreshold) {
              // CLOSED下达到阈值：打开
              this.state = 'OPEN'
              console.log(`   🔴 失败${this.failureCount}次，熔断器进入OPEN状态`)
            }

            return { success: false, error: error.message }
          }
        }
      }

      // 模拟会失败的操作
      const failingOperation = async () => {
        throw new Error('Service failure')
      }

      // 模拟成功的操作
      const successfulOperation = async () => {
        return 'success'
      }

      // 1. 初始状态：CLOSED
      expect(circuitBreaker.state).toBe('CLOSED')

      // 2. 连续失败，触发熔断
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.call(failingOperation)
      }
      expect(circuitBreaker.state).toBe('OPEN')

      // 3. OPEN状态下快速失败
      const openResult = await circuitBreaker.call(successfulOperation)
      expect(openResult.success).toBe(false)
      expect(openResult.error).toContain('Circuit breaker is OPEN')

      // 4. 等待超时后进入HALF_OPEN
      await delay(250)
      await circuitBreaker.call(successfulOperation)
      // 此时应该已经进入HALF_OPEN并有一次成功

      // 5. 再次成功，恢复CLOSED
      await circuitBreaker.call(successfulOperation)
      expect(circuitBreaker.state).toBe('CLOSED')

      console.log('✅ 熔断器状态转换验证通过')
    })

    /**
     * 业务场景：熔断器指标监控
     * 验证目标：能正确统计失败率
     */
    test('熔断器指标监控', async () => {
      console.log('')
      console.log('📋 B-11-3-2 熔断器指标监控:')
      console.log('   模拟场景: 统计请求成功率和失败率')
      console.log('')

      const circuitBreakerWithMetrics = {
        metrics: {
          totalRequests: 0,
          successCount: 0,
          failureCount: 0,
          lastMinuteRequests: []
        },

        recordRequest(success) {
          this.metrics.totalRequests++
          if (success) {
            this.metrics.successCount++
          } else {
            this.metrics.failureCount++
          }

          // 记录时间戳
          this.metrics.lastMinuteRequests.push({
            timestamp: Date.now(),
            success
          })

          // 清理超过1分钟的记录
          const oneMinuteAgo = Date.now() - 60000
          this.metrics.lastMinuteRequests = this.metrics.lastMinuteRequests.filter(
            r => r.timestamp >= oneMinuteAgo
          )
        },

        getFailureRate() {
          if (this.metrics.totalRequests === 0) return 0
          return this.metrics.failureCount / this.metrics.totalRequests
        },

        getLastMinuteStats() {
          const recent = this.metrics.lastMinuteRequests
          const successes = recent.filter(r => r.success).length
          const failures = recent.filter(r => !r.success).length
          return {
            total: recent.length,
            successes,
            failures,
            failureRate: recent.length > 0 ? failures / recent.length : 0
          }
        }
      }

      // 模拟一些请求
      for (let i = 0; i < 10; i++) {
        circuitBreakerWithMetrics.recordRequest(true) // 成功
      }
      for (let i = 0; i < 5; i++) {
        circuitBreakerWithMetrics.recordRequest(false) // 失败
      }

      const failureRate = circuitBreakerWithMetrics.getFailureRate()
      const lastMinuteStats = circuitBreakerWithMetrics.getLastMinuteStats()

      expect(failureRate).toBeCloseTo(5 / 15, 2)
      expect(lastMinuteStats.total).toBe(15)
      expect(lastMinuteStats.successes).toBe(10)
      expect(lastMinuteStats.failures).toBe(5)

      console.log(`✅ 熔断器指标监控验证通过`)
      console.log(`   总失败率: ${(failureRate * 100).toFixed(1)}%`)
      console.log(
        `   最近一分钟: ${lastMinuteStats.successes}成功, ${lastMinuteStats.failures}失败`
      )
    })
  })

  // ==================== B-11-4: 优雅关闭 ====================

  describe('B-11-4 优雅关闭', () => {
    /**
     * 业务场景：服务优雅关闭
     * 验证目标：关闭前完成进行中的请求
     */
    test('服务优雅关闭 - 完成进行中请求', async () => {
      console.log('')
      console.log('📋 B-11-4-1 优雅关闭模拟:')
      console.log('   模拟场景: 关闭前完成进行中的请求')
      console.log('')

      const gracefulShutdownService = {
        isShuttingDown: false,
        activeRequests: new Set(),
        completedDuringShutdown: [],

        async handleRequest(requestId) {
          if (this.isShuttingDown) {
            return { success: false, error: 'Service is shutting down' }
          }

          // 注册请求
          this.activeRequests.add(requestId)
          console.log(`   📥 开始处理请求: ${requestId}`)

          // 模拟处理时间
          await delay(100)

          // 完成请求
          this.activeRequests.delete(requestId)
          if (this.isShuttingDown) {
            this.completedDuringShutdown.push(requestId)
          }
          console.log(`   ✅ 完成请求: ${requestId}`)

          return { success: true, requestId }
        },

        async shutdown(timeout = 1000) {
          console.log('   🛑 开始优雅关闭...')
          this.isShuttingDown = true

          // 等待进行中的请求完成
          const startTime = Date.now()
          while (this.activeRequests.size > 0 && Date.now() - startTime < timeout) {
            console.log(`   ⏳ 等待 ${this.activeRequests.size} 个请求完成...`)
            await delay(50)
          }

          if (this.activeRequests.size > 0) {
            console.log(`   ⚠️ 超时，强制关闭，剩余 ${this.activeRequests.size} 个请求`)
          } else {
            console.log('   ✅ 所有请求已完成，优雅关闭成功')
          }

          return {
            completedDuringShutdown: this.completedDuringShutdown,
            forceClosed: this.activeRequests.size
          }
        }
      }

      // 发起一些请求
      const requestPromises = []
      for (let i = 0; i < 3; i++) {
        requestPromises.push(gracefulShutdownService.handleRequest(`req-${i}`))
      }

      // 立即开始关闭
      await delay(20) // 确保请求已经开始
      const shutdownPromise = gracefulShutdownService.shutdown(500)

      // 等待所有请求和关闭完成
      const results = await Promise.all(requestPromises)
      const shutdownResult = await shutdownPromise

      // 验证所有请求都成功完成
      const allSuccessful = results.every(r => r.success)
      expect(allSuccessful).toBe(true)
      expect(shutdownResult.forceClosed).toBe(0)

      console.log(`✅ 优雅关闭验证通过`)
      console.log(`   关闭期间完成: ${shutdownResult.completedDuringShutdown.length} 个请求`)
    })

    /**
     * 业务场景：关闭超时强制终止
     * 验证目标：超时后强制关闭
     */
    test('关闭超时 - 强制终止', async () => {
      console.log('')
      console.log('📋 B-11-4-2 强制终止模拟:')
      console.log('   模拟场景: 超时后强制关闭')
      console.log('')

      const serviceWithForcedShutdown = {
        isShuttingDown: false,
        activeRequests: new Set(),

        async handleRequest(requestId) {
          if (this.isShuttingDown) {
            return { success: false, error: 'Service is shutting down' }
          }

          this.activeRequests.add(requestId)

          // 模拟很长的处理时间
          await delay(500)

          this.activeRequests.delete(requestId)
          return { success: true, requestId }
        },

        async forceShutdown(gracePeriod = 100) {
          console.log('   🛑 开始强制关闭...')
          this.isShuttingDown = true

          // 等待优雅期
          await delay(gracePeriod)

          // 强制终止
          const abortedRequests = Array.from(this.activeRequests)
          if (abortedRequests.length > 0) {
            console.log(`   ⚠️ 强制终止 ${abortedRequests.length} 个请求`)
          }

          this.activeRequests.clear()

          return {
            abortedRequests
          }
        }
      }

      // 发起长时间请求（不等待它完成）
      serviceWithForcedShutdown.handleRequest('long-req')

      // 等待请求开始
      await delay(20)

      // 强制关闭（短超时）
      const shutdownResult = await serviceWithForcedShutdown.forceShutdown(100)

      expect(shutdownResult.abortedRequests).toContain('long-req')

      console.log(`✅ 强制终止验证通过`)
      console.log(`   被终止的请求: ${shutdownResult.abortedRequests.join(', ')}`)
    })
  })
})
