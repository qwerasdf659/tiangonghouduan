/**
 * ⚡ 限流降级测试 - P2-5.2
 *
 * 测试范围：
 * - 高负载限流触发验证
 * - 服务降级行为验证
 * - 限流恢复机制验证
 * - 分级限流策略验证
 *
 * 审计标准：
 * - C-2：限流降级测试
 * - C-2-1：高负载限流触发
 * - C-2-2：降级响应验证
 * - C-2-3：限流恢复机制
 * - C-2-4：分级限流策略
 *
 * 业务场景：
 * - 秒杀活动高并发请求限流
 * - API网关流量控制
 * - 服务过载保护
 * - 用户级别差异化限流
 *
 * 验收标准：
 * - npm test -- tests/chaos/rate-limit-degradation.test.js 全部通过
 * - 限流触发时返回正确的429状态
 * - 降级响应包含必要信息
 * - 限流解除后服务自动恢复
 *
 * @module tests/chaos/rate-limit-degradation
 * @since 2026-01-30
 */

'use strict'

const { delay, executeConcurrent } = require('../helpers/test-concurrent-utils')

// 限流降级测试需要较长超时
jest.setTimeout(180000)

describe('⚡ 限流降级测试（P2-5.2）', () => {
  // ==================== 测试准备 ====================

  beforeAll(async () => {
    console.log('⚡ ===== 限流降级测试启动 =====')
    console.log(`📅 开始时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
    console.log('='.repeat(70))
  })

  afterAll(async () => {
    console.log('🏁 ===== 限流降级测试完成 =====')
    console.log(`📅 结束时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  })

  // ==================== C-2-1: 高负载限流触发 ====================

  describe('C-2-1 高负载限流触发', () => {
    /**
     * 业务场景：固定窗口限流算法
     * 验证目标：超过阈值时正确触发限流
     *
     * 限流算法：固定窗口计数器
     * - 窗口大小：1秒
     * - 阈值：10次请求/窗口
     */
    test('固定窗口限流 - 超过阈值触发429', async () => {
      console.log('')
      console.log('📋 C-2-1-1 固定窗口限流测试:')
      console.log('   模拟场景: 每秒最多10次请求')
      console.log('')

      // 固定窗口限流器
      const fixedWindowLimiter = {
        windowMs: 1000, // 1秒窗口
        maxRequests: 10, // 每窗口最多10次请求
        windows: new Map(), // 窗口计数器

        getCurrentWindow() {
          return Math.floor(Date.now() / this.windowMs)
        },

        check(clientId) {
          const currentWindow = this.getCurrentWindow()
          const key = `${clientId}:${currentWindow}`

          // 获取当前窗口计数
          const count = this.windows.get(key) || 0

          // 清理过期窗口
          const prevWindow = currentWindow - 1
          this.windows.forEach((_, k) => {
            if (!k.endsWith(`:${currentWindow}`) && !k.endsWith(`:${prevWindow}`)) {
              this.windows.delete(k)
            }
          })

          if (count >= this.maxRequests) {
            return {
              allowed: false,
              limit: this.maxRequests,
              current: count,
              retryAfter: Math.ceil((this.windowMs - (Date.now() % this.windowMs)) / 1000)
            }
          }

          // 增加计数
          this.windows.set(key, count + 1)

          return {
            allowed: true,
            limit: this.maxRequests,
            current: count + 1,
            remaining: this.maxRequests - count - 1
          }
        },

        reset() {
          this.windows.clear()
        }
      }

      // 模拟请求处理器
      const requestHandler = {
        successCount: 0,
        limitedCount: 0,

        async handleRequest(clientId, requestId) {
          const limitResult = fixedWindowLimiter.check(clientId)

          if (!limitResult.allowed) {
            this.limitedCount++
            return {
              success: false,
              status: 429,
              requestId,
              message: '请求过于频繁，请稍后再试',
              retryAfter: limitResult.retryAfter,
              limit: limitResult.limit,
              current: limitResult.current
            }
          }

          // 模拟处理
          await delay(5)
          this.successCount++

          return {
            success: true,
            status: 200,
            requestId,
            remaining: limitResult.remaining
          }
        },

        reset() {
          this.successCount = 0
          this.limitedCount = 0
        }
      }

      // 重置状态
      fixedWindowLimiter.reset()
      requestHandler.reset()

      // 发送15个请求（超过限制10个）
      console.log('   📊 发送15个连续请求（限制10个/秒）')
      const results = []

      for (let i = 0; i < 15; i++) {
        const result = await requestHandler.handleRequest('client-1', `req-${i}`)
        results.push(result)

        if (i < 10) {
          console.log(`   ✅ 请求 ${i + 1}: 成功 (剩余: ${result.remaining})`)
        } else if (result.status === 429) {
          console.log(`   🚫 请求 ${i + 1}: 被限流 (重试: ${result.retryAfter}秒)`)
        }
      }

      // 验证结果
      const successful = results.filter(r => r.status === 200)
      const limited = results.filter(r => r.status === 429)

      expect(successful.length).toBe(10)
      expect(limited.length).toBe(5)

      // 验证限流响应包含必要信息
      limited.forEach(r => {
        expect(r.status).toBe(429)
        expect(r.retryAfter).toBeDefined()
        expect(r.limit).toBe(10)
      })

      console.log('')
      console.log(`   📊 统计: 成功=${successful.length}, 限流=${limited.length}`)
      console.log('   ✅ 固定窗口限流验证通过')
    })

    /**
     * 业务场景：滑动窗口限流算法
     * 验证目标：更精确的流量控制
     *
     * 滑动窗口优势：避免固定窗口边界突发问题
     */
    test('滑动窗口限流 - 平滑流量控制', async () => {
      console.log('')
      console.log('📋 C-2-1-2 滑动窗口限流测试:')
      console.log('   模拟场景: 滑动窗口平滑限流')
      console.log('')

      // 滑动窗口限流器
      const slidingWindowLimiter = {
        windowMs: 1000, // 1秒窗口
        maxRequests: 10, // 每窗口最多10次请求
        requests: new Map(), // 请求时间戳记录

        check(clientId) {
          const now = Date.now()
          const windowStart = now - this.windowMs

          // 获取客户端请求记录
          const clientRequests = this.requests.get(clientId) || []

          // 过滤窗口内的请求
          const windowRequests = clientRequests.filter(ts => ts > windowStart)

          if (windowRequests.length >= this.maxRequests) {
            // 计算最早请求到期时间
            const oldestRequest = Math.min(...windowRequests)
            const retryAfter = Math.ceil((oldestRequest + this.windowMs - now) / 1000)

            return {
              allowed: false,
              limit: this.maxRequests,
              current: windowRequests.length,
              retryAfter: Math.max(retryAfter, 1)
            }
          }

          // 记录新请求
          windowRequests.push(now)
          this.requests.set(clientId, windowRequests)

          return {
            allowed: true,
            limit: this.maxRequests,
            current: windowRequests.length,
            remaining: this.maxRequests - windowRequests.length
          }
        },

        reset() {
          this.requests.clear()
        }
      }

      // 重置
      slidingWindowLimiter.reset()

      // 测试滑动窗口的平滑特性
      console.log('   📊 测试滑动窗口平滑限流...')

      // 第一批：发送10个请求
      const batch1Results = []
      for (let i = 0; i < 10; i++) {
        const result = slidingWindowLimiter.check('client-1')
        batch1Results.push(result)
      }

      expect(batch1Results.filter(r => r.allowed).length).toBe(10)
      console.log(`   ✅ 第一批: ${batch1Results.filter(r => r.allowed).length}/10 允许`)

      // 第二批：立即发送，应该被限流
      const batch2Results = []
      for (let i = 0; i < 5; i++) {
        const result = slidingWindowLimiter.check('client-1')
        batch2Results.push(result)
      }

      expect(batch2Results.filter(r => r.allowed).length).toBe(0)
      console.log(
        `   🚫 第二批: ${batch2Results.filter(r => r.allowed).length}/5 允许 (立即请求被限流)`
      )

      // 等待窗口滑动（等待超过窗口时间，让旧请求过期）
      console.log('   ⏳ 等待窗口滑动 (1100ms)...')
      await delay(1100) // 等待超过windowMs(1000ms)

      // 第三批：所有请求应该被允许（旧窗口内请求已过期）
      const batch3Results = []
      for (let i = 0; i < 5; i++) {
        const result = slidingWindowLimiter.check('client-1')
        batch3Results.push(result)
        await delay(50) // 每50ms一个请求
      }

      const batch3Allowed = batch3Results.filter(r => r.allowed).length
      console.log(`   📊 第三批: ${batch3Allowed}/5 允许 (窗口滑动后)`)

      // 滑动窗口过期后应该允许所有请求
      expect(batch3Allowed).toBe(5)

      console.log('   ✅ 滑动窗口限流验证通过')
    })

    /**
     * 业务场景：令牌桶限流算法
     * 验证目标：支持突发流量同时控制平均速率
     */
    test('令牌桶限流 - 允许突发同时控制平均速率', async () => {
      console.log('')
      console.log('📋 C-2-1-3 令牌桶限流测试:')
      console.log('   模拟场景: 允许短时突发，控制长期平均')
      console.log('')

      // 令牌桶限流器
      const tokenBucketLimiter = {
        buckets: new Map(),
        maxTokens: 10, // 桶容量
        refillRate: 5, // 每秒补充5个令牌

        getBucket(clientId) {
          if (!this.buckets.has(clientId)) {
            this.buckets.set(clientId, {
              tokens: this.maxTokens,
              lastRefill: Date.now()
            })
          }
          return this.buckets.get(clientId)
        },

        refillBucket(bucket) {
          const now = Date.now()
          const timePassed = (now - bucket.lastRefill) / 1000
          const tokensToAdd = timePassed * this.refillRate

          bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd)
          bucket.lastRefill = now
        },

        acquire(clientId, tokensNeeded = 1) {
          const bucket = this.getBucket(clientId)

          // 先补充令牌
          this.refillBucket(bucket)

          if (bucket.tokens >= tokensNeeded) {
            bucket.tokens -= tokensNeeded
            return {
              allowed: true,
              tokensRemaining: Math.floor(bucket.tokens),
              maxTokens: this.maxTokens
            }
          }

          // 计算需要等待的时间
          const tokensNeededMore = tokensNeeded - bucket.tokens
          const waitTime = tokensNeededMore / this.refillRate

          return {
            allowed: false,
            tokensRemaining: Math.floor(bucket.tokens),
            maxTokens: this.maxTokens,
            waitTime: Math.ceil(waitTime * 1000)
          }
        },

        reset() {
          this.buckets.clear()
        }
      }

      // 重置
      tokenBucketLimiter.reset()

      // 测试突发流量
      console.log('   📊 测试突发流量处理...')

      // 突发：连续发送12个请求
      const burstResults = []
      for (let i = 0; i < 12; i++) {
        const result = tokenBucketLimiter.acquire('client-1')
        burstResults.push(result)
      }

      const burstAllowed = burstResults.filter(r => r.allowed).length
      const burstDenied = burstResults.filter(r => !r.allowed).length

      console.log(`   📊 突发请求: ${burstAllowed}允许, ${burstDenied}拒绝`)
      expect(burstAllowed).toBe(10) // 桶容量
      expect(burstDenied).toBe(2) // 超出容量

      // 等待令牌补充
      console.log('   ⏳ 等待令牌补充 (1秒)...')
      await delay(1000)

      // 再次请求
      const afterRefillResults = []
      for (let i = 0; i < 5; i++) {
        const result = tokenBucketLimiter.acquire('client-1')
        afterRefillResults.push(result)
      }

      const afterAllowed = afterRefillResults.filter(r => r.allowed).length
      console.log(`   📊 补充后请求: ${afterAllowed}/5 允许`)
      expect(afterAllowed).toBe(5) // 1秒补充5个令牌

      console.log('   ✅ 令牌桶限流验证通过')
    })
  })

  // ==================== C-2-2: 降级响应验证 ====================

  describe('C-2-2 降级响应验证', () => {
    /**
     * 业务场景：服务过载时返回缓存数据
     * 验证目标：降级响应包含正确的缓存数据和标记
     */
    test('服务过载降级 - 返回缓存数据', async () => {
      console.log('')
      console.log('📋 C-2-2-1 缓存降级测试:')
      console.log('   模拟场景: 服务过载时返回缓存数据')
      console.log('')

      // 模拟缓存存储
      const cacheStore = {
        data: new Map(),

        set(key, value, ttl = 3600) {
          this.data.set(key, {
            value,
            expireAt: Date.now() + ttl * 1000
          })
        },

        get(key) {
          const item = this.data.get(key)
          if (!item) return null
          if (Date.now() > item.expireAt) {
            this.data.delete(key)
            return null
          }
          return item.value
        }
      }

      // 模拟带降级的服务
      const degradableService = {
        isOverloaded: false,
        loadThreshold: 100,
        currentLoad: 0,
        requestsProcessed: 0,
        degradedResponses: 0,

        simulateOverload() {
          this.isOverloaded = true
          this.currentLoad = 150
          console.log('   🔴 服务过载注入')
        },

        recover() {
          this.isOverloaded = false
          this.currentLoad = 50
          console.log('   🟢 服务恢复正常')
        },

        async getData(key) {
          // 检查是否过载
          if (this.isOverloaded || this.currentLoad > this.loadThreshold) {
            // 尝试返回缓存数据
            const cached = cacheStore.get(key)

            if (cached) {
              this.degradedResponses++
              return {
                success: true,
                data: cached,
                degraded: true,
                source: 'cache',
                message: '服务繁忙，返回缓存数据',
                headers: {
                  'X-Degraded': 'true',
                  'X-Cache-Hit': 'true'
                }
              }
            }

            // 无缓存时返回默认数据
            this.degradedResponses++
            return {
              success: true,
              data: { defaultData: true },
              degraded: true,
              source: 'default',
              message: '服务繁忙，返回默认数据',
              headers: {
                'X-Degraded': 'true',
                'X-Default-Response': 'true'
              }
            }
          }

          // 正常处理
          await delay(50)
          this.requestsProcessed++

          const data = { id: key, timestamp: Date.now(), source: 'live' }

          // 更新缓存
          cacheStore.set(key, data, 300)

          return {
            success: true,
            data,
            degraded: false,
            source: 'live',
            headers: {}
          }
        }
      }

      // 1. 正常状态：填充缓存
      console.log('   📊 阶段1：正常状态填充缓存')
      const normalResult = await degradableService.getData('user:123')
      expect(normalResult.degraded).toBe(false)
      expect(normalResult.source).toBe('live')
      console.log(`   ✅ 正常响应: 来源=${normalResult.source}`)

      // 2. 触发过载
      console.log('   📊 阶段2：服务过载降级')
      degradableService.simulateOverload()

      // 有缓存的key
      const degradedWithCache = await degradableService.getData('user:123')
      expect(degradedWithCache.degraded).toBe(true)
      expect(degradedWithCache.source).toBe('cache')
      expect(degradedWithCache.headers['X-Degraded']).toBe('true')
      expect(degradedWithCache.headers['X-Cache-Hit']).toBe('true')
      console.log(`   ✅ 降级响应(有缓存): 来源=${degradedWithCache.source}`)

      // 无缓存的key
      const degradedWithoutCache = await degradableService.getData('user:456')
      expect(degradedWithoutCache.degraded).toBe(true)
      expect(degradedWithoutCache.source).toBe('default')
      expect(degradedWithoutCache.headers['X-Default-Response']).toBe('true')
      console.log(`   ✅ 降级响应(无缓存): 来源=${degradedWithoutCache.source}`)

      // 3. 恢复
      console.log('   📊 阶段3：服务恢复')
      degradableService.recover()

      const recoveredResult = await degradableService.getData('user:789')
      expect(recoveredResult.degraded).toBe(false)
      expect(recoveredResult.source).toBe('live')
      console.log(`   ✅ 恢复响应: 来源=${recoveredResult.source}`)

      // 统计
      console.log('')
      console.log(
        `   📊 统计: 正常处理=${degradableService.requestsProcessed}, 降级响应=${degradableService.degradedResponses}`
      )
      console.log('   ✅ 缓存降级验证通过')
    })

    /**
     * 业务场景：功能降级 - 禁用非核心功能
     * 验证目标：过载时正确禁用非核心功能
     */
    test('功能降级 - 禁用非核心功能', async () => {
      console.log('')
      console.log('📋 C-2-2-2 功能降级测试:')
      console.log('   模拟场景: 过载时禁用非核心功能')
      console.log('')

      // 功能降级管理器
      const featureDegradationManager = {
        loadLevel: 'normal', // normal, high, critical
        features: {
          // 核心功能（始终开启）
          authentication: { enabled: true, critical: true },
          payment: { enabled: true, critical: true },
          order_create: { enabled: true, critical: true },

          // 非核心功能（可降级）
          recommendations: { enabled: true, critical: false },
          analytics: { enabled: true, critical: false },
          notifications: { enabled: true, critical: false },
          search_history: { enabled: true, critical: false }
        },

        setLoadLevel(level) {
          this.loadLevel = level
          console.log(`   🔄 负载级别: ${level}`)

          switch (level) {
            case 'critical':
              // 只保留核心功能
              Object.keys(this.features).forEach(key => {
                if (!this.features[key].critical) {
                  this.features[key].enabled = false
                }
              })
              break

            case 'high':
              // 禁用部分非核心功能
              this.features.analytics.enabled = false
              this.features.search_history.enabled = false
              // 保留推荐和通知
              this.features.recommendations.enabled = true
              this.features.notifications.enabled = true
              break

            case 'normal':
              // 所有功能开启
              Object.keys(this.features).forEach(key => {
                this.features[key].enabled = true
              })
              break
          }
        },

        isFeatureEnabled(featureName) {
          return this.features[featureName]?.enabled ?? false
        },

        getEnabledFeatures() {
          return Object.entries(this.features)
            .filter(([_, v]) => v.enabled)
            .map(([k, _]) => k)
        },

        getDisabledFeatures() {
          return Object.entries(this.features)
            .filter(([_, v]) => !v.enabled)
            .map(([k, _]) => k)
        }
      }

      // 1. 正常负载
      console.log('   📊 阶段1：正常负载')
      featureDegradationManager.setLoadLevel('normal')

      let enabledFeatures = featureDegradationManager.getEnabledFeatures()
      expect(enabledFeatures.length).toBe(7) // 所有功能开启
      console.log(`   ✅ 启用功能: ${enabledFeatures.join(', ')}`)

      // 2. 高负载
      console.log('   📊 阶段2：高负载')
      featureDegradationManager.setLoadLevel('high')

      enabledFeatures = featureDegradationManager.getEnabledFeatures()
      const disabledFeatures = featureDegradationManager.getDisabledFeatures()

      expect(featureDegradationManager.isFeatureEnabled('authentication')).toBe(true)
      expect(featureDegradationManager.isFeatureEnabled('payment')).toBe(true)
      expect(featureDegradationManager.isFeatureEnabled('analytics')).toBe(false)

      console.log(`   ✅ 启用功能: ${enabledFeatures.join(', ')}`)
      console.log(`   🚫 禁用功能: ${disabledFeatures.join(', ')}`)

      // 3. 临界负载
      console.log('   📊 阶段3：临界负载')
      featureDegradationManager.setLoadLevel('critical')

      const criticalEnabled = featureDegradationManager.getEnabledFeatures()
      const criticalDisabled = featureDegradationManager.getDisabledFeatures()

      // 核心功能必须开启
      expect(featureDegradationManager.isFeatureEnabled('authentication')).toBe(true)
      expect(featureDegradationManager.isFeatureEnabled('payment')).toBe(true)
      expect(featureDegradationManager.isFeatureEnabled('order_create')).toBe(true)

      // 非核心功能必须关闭
      expect(featureDegradationManager.isFeatureEnabled('recommendations')).toBe(false)
      expect(featureDegradationManager.isFeatureEnabled('analytics')).toBe(false)

      console.log(`   ✅ 启用功能: ${criticalEnabled.join(', ')}`)
      console.log(`   🚫 禁用功能: ${criticalDisabled.join(', ')}`)

      // 4. 恢复
      console.log('   📊 阶段4：恢复')
      featureDegradationManager.setLoadLevel('normal')

      const recoveredEnabled = featureDegradationManager.getEnabledFeatures()
      expect(recoveredEnabled.length).toBe(7)
      console.log(`   ✅ 恢复功能: ${recoveredEnabled.join(', ')}`)

      console.log('   ✅ 功能降级验证通过')
    })

    /**
     * 业务场景：降级响应格式标准化
     * 验证目标：降级响应包含所有必要字段
     */
    test('降级响应格式标准化', async () => {
      console.log('')
      console.log('📋 C-2-2-3 降级响应格式测试:')
      console.log('   验证: 降级响应包含所有必要字段')
      console.log('')

      // 标准化降级响应构建器
      const degradationResponseBuilder = {
        build(options) {
          const {
            originalRequest,
            degradationType,
            fallbackData = null,
            retryAfter = 60,
            reason = '服务暂时不可用'
          } = options

          return {
            // 基本字段
            success: true, // 降级也是一种成功响应
            code: 'DEGRADED_RESPONSE',
            message: reason,

            // 降级标识
            degraded: true,
            degradation_type: degradationType,
            degradation_level: this.getDegradationLevel(degradationType),

            // 数据
            data: fallbackData,

            // 元信息
            metadata: {
              original_request: originalRequest,
              fallback_source: fallbackData ? 'cache' : 'default',
              timestamp: new Date().toISOString()
            },

            // 重试信息
            retry: {
              retry_after: retryAfter,
              retry_after_ms: retryAfter * 1000
            },

            // HTTP头建议
            suggested_headers: {
              'X-Degraded': 'true',
              'X-Degradation-Type': degradationType,
              'Retry-After': retryAfter.toString()
            }
          }
        },

        getDegradationLevel(type) {
          const levels = {
            cache_fallback: 1, // 轻微：使用缓存
            default_response: 2, // 中等：使用默认值
            feature_disabled: 3, // 较重：功能禁用
            service_unavailable: 4 // 严重：服务不可用
          }
          return levels[type] || 0
        }
      }

      // 测试不同类型的降级响应
      const testCases = [
        {
          name: '缓存降级',
          degradationType: 'cache_fallback',
          fallbackData: { id: 1, name: 'cached user' },
          retryAfter: 30
        },
        {
          name: '默认值降级',
          degradationType: 'default_response',
          fallbackData: null,
          retryAfter: 60
        },
        {
          name: '功能禁用',
          degradationType: 'feature_disabled',
          fallbackData: null,
          reason: '推荐功能暂时不可用',
          retryAfter: 300
        },
        {
          name: '服务不可用',
          degradationType: 'service_unavailable',
          fallbackData: null,
          reason: '服务维护中',
          retryAfter: 600
        }
      ]

      console.log('   📊 验证降级响应格式:')

      for (const testCase of testCases) {
        const response = degradationResponseBuilder.build({
          originalRequest: '/api/v4/test',
          ...testCase
        })

        // 验证必要字段存在
        expect(response.success).toBeDefined()
        expect(response.code).toBe('DEGRADED_RESPONSE')
        expect(response.degraded).toBe(true)
        expect(response.degradation_type).toBe(testCase.degradationType)
        expect(response.degradation_level).toBeGreaterThan(0)
        expect(response.retry).toBeDefined()
        expect(response.retry.retry_after).toBe(testCase.retryAfter)
        expect(response.suggested_headers).toBeDefined()
        expect(response.metadata.timestamp).toBeDefined()

        console.log(
          `   ✅ ${testCase.name}: 级别=${response.degradation_level}, 重试=${response.retry.retry_after}秒`
        )
      }

      console.log('   ✅ 降级响应格式验证通过')
    })
  })

  // ==================== C-2-3: 限流恢复机制 ====================

  describe('C-2-3 限流恢复机制', () => {
    /**
     * 业务场景：限流自动解除
     * 验证目标：限流窗口过期后自动恢复
     */
    test('限流窗口过期后自动恢复', async () => {
      console.log('')
      console.log('📋 C-2-3-1 限流自动恢复测试:')
      console.log('   模拟场景: 限流窗口过期后请求可以通过')
      console.log('')

      // 短窗口限流器（用于测试）
      const shortWindowLimiter = {
        windowMs: 500, // 500ms窗口
        maxRequests: 5,
        windows: new Map(),

        getCurrentWindow() {
          return Math.floor(Date.now() / this.windowMs)
        },

        check(clientId) {
          const currentWindow = this.getCurrentWindow()
          const key = `${clientId}:${currentWindow}`

          const count = this.windows.get(key) || 0

          // 清理旧窗口
          this.windows.forEach((_, k) => {
            const windowId = parseInt(k.split(':')[1])
            if (windowId < currentWindow - 1) {
              this.windows.delete(k)
            }
          })

          if (count >= this.maxRequests) {
            return { allowed: false, window: currentWindow }
          }

          this.windows.set(key, count + 1)
          return { allowed: true, window: currentWindow, count: count + 1 }
        }
      }

      // 阶段1：耗尽限流配额
      console.log('   📊 阶段1：耗尽限流配额')
      const phase1Results = []
      for (let i = 0; i < 7; i++) {
        const result = shortWindowLimiter.check('client-1')
        phase1Results.push(result)
      }

      const phase1Allowed = phase1Results.filter(r => r.allowed).length
      const phase1Denied = phase1Results.filter(r => !r.allowed).length
      console.log(`   📊 阶段1: ${phase1Allowed}允许, ${phase1Denied}拒绝`)
      expect(phase1Allowed).toBe(5)
      expect(phase1Denied).toBe(2)

      // 阶段2：等待窗口过期
      console.log('   ⏳ 等待窗口过期 (600ms)...')
      await delay(600)

      // 阶段3：验证恢复
      console.log('   📊 阶段2：验证恢复')
      const phase2Results = []
      for (let i = 0; i < 5; i++) {
        const result = shortWindowLimiter.check('client-1')
        phase2Results.push(result)
      }

      const phase2Allowed = phase2Results.filter(r => r.allowed).length
      console.log(`   📊 阶段2: ${phase2Allowed}/5 允许 (新窗口)`)
      expect(phase2Allowed).toBe(5)

      // 验证窗口确实变了
      const phase1Window = phase1Results[0].window
      const phase2Window = phase2Results[0].window
      expect(phase2Window).toBeGreaterThan(phase1Window)
      console.log(`   📊 窗口变化: ${phase1Window} → ${phase2Window}`)

      console.log('   ✅ 限流自动恢复验证通过')
    })

    /**
     * 业务场景：渐进式恢复
     * 验证目标：限流解除后逐步恢复到正常流量
     */
    test('渐进式恢复 - 逐步恢复正常流量', async () => {
      console.log('')
      console.log('📋 C-2-3-2 渐进式恢复测试:')
      console.log('   模拟场景: 限流解除后逐步增加允许流量')
      console.log('')

      // 渐进式恢复限流器
      const progressiveRecoveryLimiter = {
        normalLimit: 100, // 正常限制
        recoverySteps: [25, 50, 75, 100], // 恢复阶段百分比
        recoveryStepDuration: 200, // 每阶段持续时间(ms)

        currentState: 'normal', // normal, limiting, recovering
        currentRecoveryStep: 0,
        recoveryStartTime: null,
        requestCount: 0,
        allowedCount: 0,

        enterLimitingState() {
          this.currentState = 'limiting'
          console.log('   🔴 进入限流状态')
        },

        startRecovery() {
          this.currentState = 'recovering'
          this.currentRecoveryStep = 0
          this.recoveryStartTime = Date.now()
          console.log('   🟡 开始渐进恢复')
        },

        updateRecoveryStep() {
          if (this.currentState !== 'recovering') return

          const elapsed = Date.now() - this.recoveryStartTime
          const stepIndex = Math.min(
            Math.floor(elapsed / this.recoveryStepDuration),
            this.recoverySteps.length - 1
          )

          if (stepIndex !== this.currentRecoveryStep) {
            this.currentRecoveryStep = stepIndex
            console.log(`   🔄 恢复阶段 ${stepIndex + 1}: ${this.recoverySteps[stepIndex]}%`)
          }

          // 完全恢复
          if (stepIndex >= this.recoverySteps.length - 1) {
            this.currentState = 'normal'
            console.log('   🟢 完全恢复')
          }
        },

        getCurrentLimit() {
          if (this.currentState === 'normal') {
            return this.normalLimit
          }

          if (this.currentState === 'limiting') {
            return 0
          }

          // 恢复中
          this.updateRecoveryStep()
          const percentage = this.recoverySteps[this.currentRecoveryStep]
          return Math.floor((this.normalLimit * percentage) / 100)
        },

        check() {
          this.requestCount++
          const currentLimit = this.getCurrentLimit()

          if (this.requestCount <= currentLimit) {
            this.allowedCount++
            return { allowed: true, limit: currentLimit, state: this.currentState }
          }

          return { allowed: false, limit: currentLimit, state: this.currentState }
        },

        reset() {
          this.requestCount = 0
          this.allowedCount = 0
        }
      }

      // 测试渐进恢复
      console.log('   📊 测试渐进恢复过程...')

      // 1. 正常状态
      progressiveRecoveryLimiter.reset()
      const normalResult = progressiveRecoveryLimiter.check()
      expect(normalResult.limit).toBe(100)
      console.log(`   ✅ 正常状态: 限制=${normalResult.limit}`)

      // 2. 进入限流
      progressiveRecoveryLimiter.enterLimitingState()
      progressiveRecoveryLimiter.reset()
      const limitingResult = progressiveRecoveryLimiter.check()
      expect(limitingResult.limit).toBe(0)
      console.log(`   ✅ 限流状态: 限制=${limitingResult.limit}`)

      // 3. 开始恢复
      progressiveRecoveryLimiter.startRecovery()
      progressiveRecoveryLimiter.reset()

      // 记录恢复过程中的限制变化
      const recoveryHistory = []

      for (let i = 0; i < 8; i++) {
        const result = progressiveRecoveryLimiter.check()
        recoveryHistory.push({
          step: i,
          limit: result.limit,
          state: result.state
        })

        if (i < 7) {
          await delay(200) // 等待下一个恢复阶段
          progressiveRecoveryLimiter.reset()
        }
      }

      // 验证限制是递增的
      const limits = recoveryHistory.map(h => h.limit)
      for (let i = 1; i < limits.length - 1; i++) {
        expect(limits[i]).toBeGreaterThanOrEqual(limits[i - 1])
      }

      console.log('   📊 恢复历史:')
      recoveryHistory.forEach(h => {
        console.log(`      阶段${h.step}: 限制=${h.limit}, 状态=${h.state}`)
      })

      // 最终应该完全恢复
      expect(recoveryHistory[recoveryHistory.length - 1].state).toBe('normal')

      console.log('   ✅ 渐进式恢复验证通过')
    })
  })

  // ==================== C-2-4: 分级限流策略 ====================

  describe('C-2-4 分级限流策略', () => {
    /**
     * 业务场景：用户级别差异化限流
     * 验证目标：不同用户级别有不同的限流配额
     */
    test('用户级别差异化限流', async () => {
      console.log('')
      console.log('📋 C-2-4-1 用户级别限流测试:')
      console.log('   模拟场景: VIP用户比普通用户有更高配额')
      console.log('')

      // 分级限流器
      const tieredRateLimiter = {
        tiers: {
          // 普通用户
          normal: {
            requestsPerMinute: 60,
            requestsPerSecond: 5
          },
          // VIP用户
          vip: {
            requestsPerMinute: 300,
            requestsPerSecond: 20
          },
          // 企业用户
          enterprise: {
            requestsPerMinute: 1000,
            requestsPerSecond: 50
          }
        },

        userTierMap: new Map(), // userId -> tier
        userCounters: new Map(), // userId -> { count, windowStart }

        setUserTier(userId, tier) {
          this.userTierMap.set(userId, tier)
        },

        getUserTier(userId) {
          return this.userTierMap.get(userId) || 'normal'
        },

        check(userId) {
          const tier = this.getUserTier(userId)
          const config = this.tiers[tier]
          const now = Date.now()

          // 获取或创建计数器
          let counter = this.userCounters.get(userId)
          if (!counter || now - counter.windowStart >= 1000) {
            counter = { count: 0, windowStart: now }
            this.userCounters.set(userId, counter)
          }

          // 检查秒级限流
          if (counter.count >= config.requestsPerSecond) {
            return {
              allowed: false,
              tier,
              limit: config.requestsPerSecond,
              current: counter.count,
              retryAfter: Math.ceil((counter.windowStart + 1000 - now) / 1000)
            }
          }

          counter.count++

          return {
            allowed: true,
            tier,
            limit: config.requestsPerSecond,
            current: counter.count,
            remaining: config.requestsPerSecond - counter.count
          }
        },

        reset() {
          this.userCounters.clear()
        }
      }

      // 设置用户级别
      tieredRateLimiter.setUserTier('user-normal', 'normal')
      tieredRateLimiter.setUserTier('user-vip', 'vip')
      tieredRateLimiter.setUserTier('user-enterprise', 'enterprise')

      // 测试不同用户级别
      console.log('   📊 测试不同用户级别限流配额...')

      const testUser = (userId, expectedLimit) => {
        tieredRateLimiter.reset()
        const results = []

        for (let i = 0; i < expectedLimit + 3; i++) {
          results.push(tieredRateLimiter.check(userId))
        }

        const allowed = results.filter(r => r.allowed).length
        const denied = results.filter(r => !r.allowed).length
        const tier = results[0].tier

        return { userId, tier, allowed, denied, limit: expectedLimit }
      }

      // 普通用户
      const normalResult = testUser('user-normal', 5)
      expect(normalResult.allowed).toBe(5)
      expect(normalResult.denied).toBe(3)
      console.log(
        `   ✅ 普通用户: ${normalResult.allowed}允许, ${normalResult.denied}拒绝 (限制: ${normalResult.limit}/秒)`
      )

      // VIP用户
      const vipResult = testUser('user-vip', 20)
      expect(vipResult.allowed).toBe(20)
      expect(vipResult.denied).toBe(3)
      console.log(
        `   ✅ VIP用户: ${vipResult.allowed}允许, ${vipResult.denied}拒绝 (限制: ${vipResult.limit}/秒)`
      )

      // 企业用户
      const enterpriseResult = testUser('user-enterprise', 50)
      expect(enterpriseResult.allowed).toBe(50)
      expect(enterpriseResult.denied).toBe(3)
      console.log(
        `   ✅ 企业用户: ${enterpriseResult.allowed}允许, ${enterpriseResult.denied}拒绝 (限制: ${enterpriseResult.limit}/秒)`
      )

      console.log('   ✅ 用户级别差异化限流验证通过')
    })

    /**
     * 业务场景：API优先级限流
     * 验证目标：核心API比非核心API有更高的可用性
     */
    test('API优先级限流', async () => {
      console.log('')
      console.log('📋 C-2-4-2 API优先级限流测试:')
      console.log('   模拟场景: 过载时优先保证核心API')
      console.log('')

      // API优先级限流器
      const apiPriorityLimiter = {
        totalCapacity: 100, // 总容量
        currentLoad: 0,
        apiPriorities: {
          // 优先级1：核心API（保证60%容量）
          '/api/v4/auth/login': { priority: 1, reserved: 60 },
          '/api/v4/order/create': { priority: 1, reserved: 60 },
          '/api/v4/payment/process': { priority: 1, reserved: 60 },

          // 优先级2：重要API（保证40%容量）
          '/api/v4/user/profile': { priority: 2, reserved: 40 },
          '/api/v4/inventory/list': { priority: 2, reserved: 40 },

          // 优先级3：普通API（剩余容量）
          '/api/v4/recommendations': { priority: 3, reserved: 0 },
          '/api/v4/analytics': { priority: 3, reserved: 0 }
        },

        setLoad(load) {
          this.currentLoad = load
        },

        check(apiPath) {
          const apiConfig = this.apiPriorities[apiPath] || { priority: 3, reserved: 0 }
          const availableCapacity = this.totalCapacity - this.currentLoad

          // 高优先级API在负载高时仍可通过
          const effectiveCapacity = Math.max(availableCapacity, apiConfig.reserved)

          // 简化：优先级越高，越容易通过
          const threshold = (4 - apiConfig.priority) * 25 // P1=75, P2=50, P3=25

          if (effectiveCapacity >= threshold || apiConfig.priority === 1) {
            return {
              allowed: true,
              priority: apiConfig.priority,
              api: apiPath,
              availableCapacity,
              reserved: apiConfig.reserved
            }
          }

          return {
            allowed: false,
            priority: apiConfig.priority,
            api: apiPath,
            availableCapacity,
            reserved: apiConfig.reserved,
            reason: '系统繁忙，优先保证核心功能'
          }
        }
      }

      // 测试不同负载下的API可用性
      console.log('   📊 测试不同负载下的API可用性...')

      const testLoadLevel = loadLevel => {
        apiPriorityLimiter.setLoad(loadLevel)
        const results = {}

        for (const api of Object.keys(apiPriorityLimiter.apiPriorities)) {
          const result = apiPriorityLimiter.check(api)
          results[api] = result
        }

        return results
      }

      // 低负载（50%）
      console.log('   📊 低负载 (50%):')
      const lowLoadResults = testLoadLevel(50)
      const lowAllowed = Object.values(lowLoadResults).filter(r => r.allowed).length
      console.log(`      允许: ${lowAllowed}/${Object.keys(lowLoadResults).length} API`)
      expect(lowAllowed).toBe(7) // 所有API都应该允许

      // 高负载（80%）
      console.log('   📊 高负载 (80%):')
      const highLoadResults = testLoadLevel(80)
      const highAllowed = Object.values(highLoadResults).filter(r => r.allowed).length
      console.log(`      允许: ${highAllowed}/${Object.keys(highLoadResults).length} API`)

      // 核心API必须允许
      expect(highLoadResults['/api/v4/auth/login'].allowed).toBe(true)
      expect(highLoadResults['/api/v4/order/create'].allowed).toBe(true)
      console.log('      ✅ 核心API保证可用')

      // 极高负载（95%）
      console.log('   📊 极高负载 (95%):')
      const extremeLoadResults = testLoadLevel(95)
      const extremeAllowed = Object.values(extremeLoadResults).filter(r => r.allowed).length
      console.log(`      允许: ${extremeAllowed}/${Object.keys(extremeLoadResults).length} API`)

      // 即使极高负载，核心API也必须可用
      expect(extremeLoadResults['/api/v4/auth/login'].allowed).toBe(true)
      expect(extremeLoadResults['/api/v4/payment/process'].allowed).toBe(true)
      console.log('      ✅ 极高负载下核心API仍然可用')

      console.log('   ✅ API优先级限流验证通过')
    })

    /**
     * 业务场景：自适应限流
     * 验证目标：根据系统负载自动调整限流阈值
     */
    test('自适应限流 - 根据负载自动调整', async () => {
      console.log('')
      console.log('📋 C-2-4-3 自适应限流测试:')
      console.log('   模拟场景: 根据系统负载自动调整限流阈值')
      console.log('')

      // 自适应限流器
      const adaptiveRateLimiter = {
        baseLimit: 100, // 基准限制
        minLimit: 10, // 最小限制
        maxLimit: 200, // 最大限制

        metrics: {
          cpuUsage: 50,
          memoryUsage: 60,
          responseTime: 100, // ms
          errorRate: 0.01 // 1%
        },

        thresholds: {
          cpuHigh: 80,
          memoryHigh: 85,
          responseTimeSlow: 500,
          errorRateHigh: 0.05
        },

        updateMetrics(metrics) {
          this.metrics = { ...this.metrics, ...metrics }
        },

        calculateAdjustedLimit() {
          let adjustmentFactor = 1.0

          // CPU使用率调整
          if (this.metrics.cpuUsage > this.thresholds.cpuHigh) {
            const cpuOverload = (this.metrics.cpuUsage - this.thresholds.cpuHigh) / 20
            adjustmentFactor *= 1 - cpuOverload * 0.2
          } else if (this.metrics.cpuUsage < 50) {
            adjustmentFactor *= 1.2 // 低负载时可以增加
          }

          // 响应时间调整
          if (this.metrics.responseTime > this.thresholds.responseTimeSlow) {
            const slowFactor = this.metrics.responseTime / this.thresholds.responseTimeSlow
            adjustmentFactor *= 1 / slowFactor
          }

          // 错误率调整
          if (this.metrics.errorRate > this.thresholds.errorRateHigh) {
            adjustmentFactor *= 0.5 // 高错误率时大幅降低
          }

          // 计算调整后的限制
          let adjustedLimit = Math.round(this.baseLimit * adjustmentFactor)

          // 限制在允许范围内
          adjustedLimit = Math.max(this.minLimit, Math.min(this.maxLimit, adjustedLimit))

          return {
            adjustedLimit,
            adjustmentFactor,
            metrics: { ...this.metrics },
            reason: this.getAdjustmentReason(adjustmentFactor)
          }
        },

        getAdjustmentReason(factor) {
          if (factor < 0.5) return '系统严重过载，大幅降低限制'
          if (factor < 0.8) return '系统负载较高，降低限制'
          if (factor > 1.1) return '系统负载较低，增加限制'
          return '正常运行'
        }
      }

      // 测试不同系统状态
      console.log('   📊 测试不同系统状态下的限流调整...')

      // 正常状态
      adaptiveRateLimiter.updateMetrics({
        cpuUsage: 50,
        memoryUsage: 60,
        responseTime: 100,
        errorRate: 0.01
      })
      const normalLimit = adaptiveRateLimiter.calculateAdjustedLimit()
      console.log(`   ✅ 正常状态: 限制=${normalLimit.adjustedLimit} (${normalLimit.reason})`)
      expect(normalLimit.adjustedLimit).toBeGreaterThanOrEqual(100)

      // 高CPU状态
      adaptiveRateLimiter.updateMetrics({ cpuUsage: 90 })
      const highCpuLimit = adaptiveRateLimiter.calculateAdjustedLimit()
      console.log(`   ⚠️ 高CPU状态: 限制=${highCpuLimit.adjustedLimit} (${highCpuLimit.reason})`)
      expect(highCpuLimit.adjustedLimit).toBeLessThan(normalLimit.adjustedLimit)

      // 慢响应状态
      adaptiveRateLimiter.updateMetrics({ cpuUsage: 60, responseTime: 800 })
      const slowResponseLimit = adaptiveRateLimiter.calculateAdjustedLimit()
      console.log(
        `   ⚠️ 慢响应状态: 限制=${slowResponseLimit.adjustedLimit} (${slowResponseLimit.reason})`
      )
      expect(slowResponseLimit.adjustedLimit).toBeLessThan(normalLimit.adjustedLimit)

      // 高错误率状态
      adaptiveRateLimiter.updateMetrics({ responseTime: 100, errorRate: 0.1 })
      const highErrorLimit = adaptiveRateLimiter.calculateAdjustedLimit()
      console.log(
        `   🔴 高错误率状态: 限制=${highErrorLimit.adjustedLimit} (${highErrorLimit.reason})`
      )
      expect(highErrorLimit.adjustedLimit).toBeLessThan(slowResponseLimit.adjustedLimit)

      // 低负载状态
      adaptiveRateLimiter.updateMetrics({
        cpuUsage: 30,
        memoryUsage: 40,
        responseTime: 50,
        errorRate: 0.001
      })
      const lowLoadLimit = adaptiveRateLimiter.calculateAdjustedLimit()
      console.log(`   🟢 低负载状态: 限制=${lowLoadLimit.adjustedLimit} (${lowLoadLimit.reason})`)
      expect(lowLoadLimit.adjustedLimit).toBeGreaterThan(normalLimit.adjustedLimit)

      console.log('   ✅ 自适应限流验证通过')
    })
  })

  // ==================== 综合场景测试 ====================

  describe('综合场景测试', () => {
    /**
     * 业务场景：并发请求限流测试
     * 验证目标：高并发下限流器正确工作
     */
    test('高并发下限流器压力测试', async () => {
      console.log('')
      console.log('📋 综合场景：高并发限流压力测试')
      console.log('')

      // 并发安全的限流器
      const concurrentSafeLimiter = {
        limit: 50,
        counter: 0,
        successCount: 0,
        limitedCount: 0,
        lock: false,

        async acquire() {
          // 简单的锁机制
          while (this.lock) {
            await delay(1)
          }
          this.lock = true

          try {
            this.counter++

            if (this.counter <= this.limit) {
              this.successCount++
              return { allowed: true, position: this.counter }
            }

            this.limitedCount++
            return { allowed: false, position: this.counter }
          } finally {
            this.lock = false
          }
        },

        reset() {
          this.counter = 0
          this.successCount = 0
          this.limitedCount = 0
        }
      }

      // 并发请求
      console.log('   📊 发送100个并发请求（限制50个）...')
      concurrentSafeLimiter.reset()

      const tasks = Array(100)
        .fill()
        .map(() => async () => {
          const result = await concurrentSafeLimiter.acquire()
          await delay(10) // 模拟处理时间
          return result
        })

      const { results } = await executeConcurrent(tasks, {
        concurrency: 20
      })

      const allowed = results.filter(r => r.result?.allowed).length
      const limited = results.filter(r => r.result && !r.result.allowed).length

      console.log(`   📊 结果: ${allowed}允许, ${limited}限流`)
      console.log(
        `   📊 计数器: 成功=${concurrentSafeLimiter.successCount}, 限流=${concurrentSafeLimiter.limitedCount}`
      )

      // 验证限流正确
      expect(allowed).toBe(50)
      expect(limited).toBe(50)
      expect(concurrentSafeLimiter.successCount).toBe(50)
      expect(concurrentSafeLimiter.limitedCount).toBe(50)

      console.log('   ✅ 高并发限流压力测试通过')
    })

    /**
     * 业务场景：限流与降级组合测试
     * 验证目标：限流触发后正确执行降级策略
     */
    test('限流与降级组合', async () => {
      console.log('')
      console.log('📋 综合场景：限流与降级组合测试')
      console.log('')

      // 组合服务
      const combinedService = {
        requestLimit: 10,
        requestCount: 0,
        stats: {
          normal: 0,
          limited: 0,
          degraded: 0
        },

        async handleRequest(requestId) {
          this.requestCount++

          // 检查限流
          if (this.requestCount > this.requestLimit) {
            this.stats.limited++

            // 执行降级
            return this.getDegradedResponse(requestId)
          }

          // 正常处理
          await delay(20)
          this.stats.normal++

          return {
            success: true,
            requestId,
            data: { id: requestId, timestamp: Date.now() },
            degraded: false
          }
        },

        getDegradedResponse(requestId) {
          this.stats.degraded++

          return {
            success: true, // 降级也是成功
            requestId,
            data: { cached: true, requestId },
            degraded: true,
            degradationType: 'rate_limited',
            retryAfter: 60
          }
        },

        reset() {
          this.requestCount = 0
          this.stats = { normal: 0, limited: 0, degraded: 0 }
        }
      }

      // 测试
      combinedService.reset()

      console.log('   📊 发送20个请求（限制10个）...')
      const results = []

      for (let i = 0; i < 20; i++) {
        const result = await combinedService.handleRequest(`req-${i}`)
        results.push(result)
      }

      // 统计
      const normalResponses = results.filter(r => !r.degraded)
      const degradedResponses = results.filter(r => r.degraded)

      console.log(`   📊 正常响应: ${normalResponses.length}`)
      console.log(`   📊 降级响应: ${degradedResponses.length}`)
      console.log(
        `   📊 服务统计: 正常=${combinedService.stats.normal}, 限流=${combinedService.stats.limited}, 降级=${combinedService.stats.degraded}`
      )

      expect(normalResponses.length).toBe(10)
      expect(degradedResponses.length).toBe(10)

      // 验证降级响应格式
      degradedResponses.forEach(r => {
        expect(r.success).toBe(true)
        expect(r.degraded).toBe(true)
        expect(r.degradationType).toBe('rate_limited')
        expect(r.retryAfter).toBeDefined()
      })

      console.log('   ✅ 限流与降级组合测试通过')
    })
  })
})
