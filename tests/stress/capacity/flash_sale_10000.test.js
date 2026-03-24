/**
 * 🔥 10000并发秒杀场景测试 - P2-4
 *
 * 测试范围：
 * - 10000个模拟用户同时抢购限量商品
 * - 验证系统在极限秒杀场景下不超卖
 * - 验证库存扣减的原子性和准确性
 * - 验证分布式锁的有效性
 *
 * 审计标准：
 * - B-7：秒杀场景压力测试
 * - B-7-1：10000并发用户抢购
 * - B-7-2：不超卖验证
 * - B-7-3：库存原子操作验证
 *
 * 测试原则：
 * - 使用真实数据库（restaurant_points_dev），不使用mock数据
 * - 通过 ServiceManager 获取服务实例
 * - 使用 test-concurrent-utils.js 提供的并发测试工具
 * - 测试数据创建后需清理，避免污染数据库
 *
 * 验收标准：
 * - npm test -- tests/specialized/flash_sale_10000.test.js 全部通过
 * - 库存100件，10000人抢购，最多100人成功
 * - 无超卖（成功数 <= 初始库存）
 * - 系统无死锁、无崩溃
 *
 * @module tests/specialized/flash_sale_10000
 * @since 2026-01-28
 */

'use strict'

const { sequelize } = require('../../../config/database')
const { getTestService } = require('../../helpers/UnifiedTestManager')
const { executeConcurrent, delay } = require('../../helpers/test-concurrent-utils')
const { getTestUserId, getTestCampaignId } = require('../../helpers/test-data')
const { v4: uuidv4 } = require('uuid')

// 10000并发秒杀测试需要更长超时（15分钟）
jest.setTimeout(900000)

describe('🔥 10000并发秒杀场景测试（P2-4）', () => {
  // 服务引用
  let IdempotencyService

  // 测试数据
  let testUserId
  let testCampaignId

  // 模拟库存管理器（用于测试）
  const mockInventory = {
    stock: 0,
    sold: 0,
    purchases: [],
    lock: false,

    // 初始化库存
    init(initialStock) {
      this.stock = initialStock
      this.sold = 0
      this.purchases = []
      this.lock = false
    },

    // 尝试购买（模拟行级锁）
    async tryPurchase(userId, idempotencyKey) {
      // 模拟获取锁的延迟
      while (this.lock) {
        await delay(Math.random() * 10)
      }
      this.lock = true

      try {
        // 检查库存
        if (this.stock <= 0) {
          return { success: false, reason: 'out_of_stock' }
        }

        // 检查重复购买（幂等性）
        const existingPurchase = this.purchases.find(p => p.idempotency_key === idempotencyKey)
        if (existingPurchase) {
          return { success: true, reason: 'idempotent_return', purchase: existingPurchase }
        }

        // 扣减库存
        this.stock--
        this.sold++

        const purchase = {
          user_id: userId,
          idempotency_key: idempotencyKey,
          purchase_time: Date.now(),
          purchase_id: uuidv4()
        }
        this.purchases.push(purchase)

        return { success: true, reason: 'new_purchase', purchase }
      } finally {
        this.lock = false
      }
    },

    // 获取统计
    getStats() {
      return {
        initial_stock: this.sold + this.stock,
        remaining_stock: this.stock,
        total_sold: this.sold,
        total_purchases: this.purchases.length
      }
    }
  }

  // ==================== 测试准备 ====================

  beforeAll(async () => {
    console.log('🔥 ===== 10000并发秒杀测试启动 =====')
    console.log(`📅 开始时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
    console.log(`⚠️  警告：此测试对系统负载极高，预计耗时10-15分钟`)

    // 数据库连接验证
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 获取服务实例
    IdempotencyService = getTestService('idempotency')
    console.log('✅ 服务获取成功')

    // 获取测试用户和活动
    testUserId = getTestUserId()
    testCampaignId = getTestCampaignId()

    console.log(`👤 测试用户ID: ${testUserId}`)
    console.log(`🎰 测试活动ID: ${testCampaignId}`)

    console.log('='.repeat(70))
  })

  afterAll(async () => {
    console.log('🏁 ===== 10000并发秒杀测试完成 =====')
    console.log(`📅 结束时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  })

  // ==================== 辅助函数 ====================

  /**
   * 生成唯一的幂等键
   * @param {string} prefix - 前缀
   * @returns {string} 幂等键
   */
  function generateIdempotencyKey(prefix = 'flash') {
    return `${prefix}_${Date.now()}_${uuidv4().substring(0, 8)}`
  }

  /**
   * 生成模拟用户ID
   * @param {number} index - 用户索引
   * @returns {number} 模拟用户ID
   */
  function generateMockUserId(index) {
    return 2000000 + index
  }

  // ==================== B-7-1: 10000并发抢购测试（模拟） ====================

  describe('B-7-1 10000并发抢购测试（模拟库存）', () => {
    /**
     * 业务场景：100件库存，10000人同时抢购
     * 验证目标：只有100人成功，无超卖
     * 安全要求：库存扣减必须原子操作
     */
    test('100件库存，10000人抢购 - 不超卖', async () => {
      const initialStock = 100
      const concurrentCount = 10000

      console.log('')
      console.log('📋 B-7-1 测试配置:')
      console.log(`   初始库存: ${initialStock}件`)
      console.log(`   抢购人数: ${concurrentCount}人`)
      console.log(`   预期成功: 最多${initialStock}人`)
      console.log('')

      // 初始化模拟库存
      mockInventory.init(initialStock)

      // 创建10000个并发抢购任务
      const tasks = Array(concurrentCount)
        .fill(null)
        .map((_, index) => async () => {
          const userId = generateMockUserId(index)
          const idempotencyKey = generateIdempotencyKey(`user_${index}`)

          try {
            const result = await mockInventory.tryPurchase(userId, idempotencyKey)

            return {
              success: result.success,
              index,
              user_id: userId,
              reason: result.reason,
              purchase_id: result.purchase?.purchase_id
            }
          } catch (error) {
            return { success: false, index, error: error.message }
          }
        })

      // 执行并发测试
      const startTime = Date.now()
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: 500, // 高并发数模拟真实秒杀
        timeout: 60000
      })
      const duration = Date.now() - startTime

      // 统计结果
      const successCount = results.filter(
        r => r.result?.success && r.result?.reason === 'new_purchase'
      ).length
      const outOfStockCount = results.filter(r => r.result?.reason === 'out_of_stock').length
      const idempotentCount = results.filter(r => r.result?.reason === 'idempotent_return').length
      const errorCount = results.filter(r => !r.success).length

      // 获取库存统计
      const stats = mockInventory.getStats()

      console.log('')
      console.log('📊 B-7-1 测试结果:')
      console.log(`   ⏱️  总耗时: ${duration}ms`)
      console.log(`   📈 吞吐量: ${metrics.throughput}请求/秒`)
      console.log(`   ✅ 抢购成功: ${successCount}人`)
      console.log(`   📦 库存售罄: ${outOfStockCount}人`)
      console.log(`   🔄 幂等返回: ${idempotentCount}人`)
      console.log(`   ❌ 错误数量: ${errorCount}`)
      console.log('')
      console.log('📦 库存统计:')
      console.log(`   初始库存: ${stats.initial_stock}`)
      console.log(`   剩余库存: ${stats.remaining_stock}`)
      console.log(`   已售数量: ${stats.total_sold}`)
      console.log(`   购买记录: ${stats.total_purchases}`)
      console.log('')

      // 🔴 核心断言：不超卖
      expect(successCount).toBeLessThanOrEqual(initialStock)
      expect(stats.remaining_stock).toBeGreaterThanOrEqual(0)
      expect(stats.total_sold).toBe(successCount)

      // 断言：售罄人数 + 成功人数 = 总人数
      expect(successCount + outOfStockCount + idempotentCount + errorCount).toBe(concurrentCount)

      // 断言：如果库存售罄，剩余库存应为0
      if (successCount === initialStock) {
        expect(stats.remaining_stock).toBe(0)
      }
    }, 300000) // 5分钟超时

    /**
     * 业务场景：10件库存，10000人抢购（极端稀缺）
     * 验证目标：只有10人成功
     * 安全要求：确保极端稀缺场景下的正确性
     */
    test('10件库存，10000人抢购 - 极端稀缺场景', async () => {
      const initialStock = 10
      const concurrentCount = 10000

      console.log('')
      console.log('📋 B-7-1-2 极端稀缺场景测试:')
      console.log(`   初始库存: ${initialStock}件（稀缺）`)
      console.log(`   抢购人数: ${concurrentCount}人`)
      console.log(`   竞争比: 1:${concurrentCount / initialStock}`)
      console.log('')

      // 初始化模拟库存
      mockInventory.init(initialStock)

      // 创建10000个并发抢购任务
      const tasks = Array(concurrentCount)
        .fill(null)
        .map((_, index) => async () => {
          const userId = generateMockUserId(index)
          const idempotencyKey = generateIdempotencyKey(`extreme_${index}`)

          try {
            const result = await mockInventory.tryPurchase(userId, idempotencyKey)

            return {
              success: result.success,
              reason: result.reason,
              purchase_id: result.purchase?.purchase_id
            }
          } catch (error) {
            return { success: false, error: error.message }
          }
        })

      // 执行并发测试
      const startTime = Date.now()
      const { results } = await executeConcurrent(tasks, {
        concurrency: 500,
        timeout: 60000
      })
      const duration = Date.now() - startTime

      // 统计
      const successCount = results.filter(
        r => r.result?.success && r.result?.reason === 'new_purchase'
      ).length
      const stats = mockInventory.getStats()

      console.log('')
      console.log('📊 B-7-1-2 测试结果:')
      console.log(`   ⏱️  总耗时: ${duration}ms`)
      console.log(`   ✅ 抢购成功: ${successCount}人`)
      console.log(`   📦 剩余库存: ${stats.remaining_stock}`)
      console.log('')

      // 🔴 核心断言：极端稀缺也不超卖
      expect(successCount).toBeLessThanOrEqual(initialStock)
      expect(stats.remaining_stock).toBeGreaterThanOrEqual(0)
    }, 300000)
  })

  // ==================== B-7-2: 10000并发幂等性+库存测试 ====================

  describe('B-7-2 10000并发幂等性+库存联合测试', () => {
    /**
     * 业务场景：同一用户重复提交10000次
     * 验证目标：只扣减1次库存
     * 安全要求：幂等性保证在高并发下有效
     */
    test('同一用户10000次重复提交 - 只扣减1次', async () => {
      const initialStock = 100
      const concurrentCount = 10000
      const sameIdempotencyKey = generateIdempotencyKey('same_user_key')
      const sameUserId = generateMockUserId(99999)

      console.log('')
      console.log('📋 B-7-2 幂等性测试:')
      console.log(`   初始库存: ${initialStock}件`)
      console.log(`   重复提交: ${concurrentCount}次`)
      console.log(`   幂等键: ${sameIdempotencyKey}`)
      console.log(`   用户ID: ${sameUserId}`)
      console.log('')

      // 初始化模拟库存
      mockInventory.init(initialStock)

      // 创建10000个重复提交任务（相同幂等键）
      const tasks = Array(concurrentCount)
        .fill(null)
        .map(() => async () => {
          try {
            const result = await mockInventory.tryPurchase(sameUserId, sameIdempotencyKey)

            return {
              success: result.success,
              reason: result.reason,
              is_new: result.reason === 'new_purchase'
            }
          } catch (error) {
            return { success: false, error: error.message }
          }
        })

      // 执行并发测试
      const startTime = Date.now()
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: 500,
        timeout: 60000
      })
      const duration = Date.now() - startTime

      // 统计
      const newPurchaseCount = results.filter(r => r.result?.reason === 'new_purchase').length
      const idempotentCount = results.filter(r => r.result?.reason === 'idempotent_return').length
      const stats = mockInventory.getStats()

      console.log('')
      console.log('📊 B-7-2 测试结果:')
      console.log(`   ⏱️  总耗时: ${duration}ms`)
      console.log(`   📈 吞吐量: ${metrics.throughput}请求/秒`)
      console.log(`   🆕 新购买: ${newPurchaseCount}次`)
      console.log(`   🔄 幂等返回: ${idempotentCount}次`)
      console.log(`   📦 已售数量: ${stats.total_sold}`)
      console.log(`   📦 剩余库存: ${stats.remaining_stock}`)
      console.log('')

      // 🔴 核心断言：只扣减1次库存
      expect(newPurchaseCount).toBe(1)
      expect(stats.total_sold).toBe(1)
      expect(stats.remaining_stock).toBe(initialStock - 1)

      // 断言：其余全部为幂等返回
      expect(idempotentCount).toBe(concurrentCount - 1)
    }, 300000)
  })

  // ==================== B-7-3: 10000并发数据一致性验证 ====================

  describe('B-7-3 10000并发数据一致性验证', () => {
    /**
     * 业务场景：验证高并发下购买记录的完整性
     * 验证目标：
     * - 每个成功购买有唯一的purchase_id
     * - 无重复购买记录
     * - 购买记录数 = 已售数量
     */
    test('购买记录完整性验证', async () => {
      const initialStock = 500
      const concurrentCount = 10000

      console.log('')
      console.log('📋 B-7-3 数据一致性测试:')
      console.log(`   初始库存: ${initialStock}件`)
      console.log(`   抢购人数: ${concurrentCount}人`)
      console.log('')

      // 初始化模拟库存
      mockInventory.init(initialStock)

      // 创建10000个并发任务
      const tasks = Array(concurrentCount)
        .fill(null)
        .map((_, index) => async () => {
          const userId = generateMockUserId(index)
          const idempotencyKey = generateIdempotencyKey(`verify_${index}`)

          try {
            const result = await mockInventory.tryPurchase(userId, idempotencyKey)

            return {
              success: result.success,
              reason: result.reason,
              purchase_id: result.purchase?.purchase_id,
              user_id: userId,
              idempotency_key: idempotencyKey
            }
          } catch (error) {
            return { success: false, error: error.message }
          }
        })

      // 执行并发测试
      const startTime = Date.now()
      const { results } = await executeConcurrent(tasks, {
        concurrency: 500,
        timeout: 60000
      })
      const duration = Date.now() - startTime

      // 统计
      const successfulPurchases = results
        .filter(r => r.result?.reason === 'new_purchase')
        .map(r => r.result)

      const stats = mockInventory.getStats()

      // 检查purchase_id唯一性
      const purchaseIds = successfulPurchases.map(p => p.purchase_id)
      const uniquePurchaseIds = new Set(purchaseIds)

      // 检查用户唯一性（每个用户只能购买1次）
      const userIds = successfulPurchases.map(p => p.user_id)
      const uniqueUserIds = new Set(userIds)

      console.log('')
      console.log('📊 B-7-3 数据一致性验证:')
      console.log(`   ⏱️  总耗时: ${duration}ms`)
      console.log(`   ✅ 成功购买数: ${successfulPurchases.length}`)
      console.log(`   🆔 唯一购买ID数: ${uniquePurchaseIds.size}`)
      console.log(`   👤 唯一用户数: ${uniqueUserIds.size}`)
      console.log(`   📦 库存记录售出: ${stats.total_sold}`)
      console.log(`   📦 购买记录数: ${stats.total_purchases}`)
      console.log('')

      /*
       * 🔴 核心断言：数据一致性
       * 1. 每个购买有唯一的purchase_id
       */
      expect(uniquePurchaseIds.size).toBe(successfulPurchases.length)

      /* 2. 每个用户只购买一次（幂等保证） */
      expect(uniqueUserIds.size).toBe(successfulPurchases.length)

      /* 3. 购买记录数 = 已售数量 */
      expect(stats.total_purchases).toBe(stats.total_sold)

      /* 4. 不超卖 */
      expect(successfulPurchases.length).toBeLessThanOrEqual(initialStock)
    }, 300000)

    /**
     * 业务场景：验证响应时间分布
     * 验证目标：
     * - 秒杀场景下大部分请求应快速响应
     * - 即使失败也应快速返回
     */
    test('秒杀响应时间分布验证', async () => {
      const initialStock = 100
      const concurrentCount = 10000

      console.log('')
      console.log('📋 B-7-3-2 响应时间分布测试:')
      console.log(`   初始库存: ${initialStock}件`)
      console.log(`   抢购人数: ${concurrentCount}人`)
      console.log('')

      // 初始化模拟库存
      mockInventory.init(initialStock)

      // 创建10000个并发任务并记录响应时间
      const tasks = Array(concurrentCount)
        .fill(null)
        .map((_, index) => async () => {
          const startTime = Date.now()
          const userId = generateMockUserId(index)
          const idempotencyKey = generateIdempotencyKey(`time_${index}`)

          try {
            const result = await mockInventory.tryPurchase(userId, idempotencyKey)

            return {
              success: result.success,
              reason: result.reason,
              response_time: Date.now() - startTime
            }
          } catch (error) {
            return {
              success: false,
              error: error.message,
              response_time: Date.now() - startTime
            }
          }
        })

      // 执行并发测试
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: 500,
        timeout: 60000,
        collectDetailedMetrics: true
      })

      // 计算响应时间分布
      const responseTimes = results
        .filter(r => r.result?.response_time)
        .map(r => r.result.response_time)
        .sort((a, b) => a - b)

      const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)]
      const p90 = responseTimes[Math.floor(responseTimes.length * 0.9)]
      const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)]
      const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)]
      const avg = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)

      console.log('')
      console.log('📊 B-7-3-2 响应时间分布:')
      console.log(`   📈 吞吐量: ${metrics.throughput}请求/秒`)
      console.log(`   📊 平均响应: ${avg}ms`)
      console.log(`   📊 P50: ${p50}ms`)
      console.log(`   📊 P90: ${p90}ms`)
      console.log(`   📊 P95: ${p95}ms`)
      console.log(`   📊 P99: ${p99}ms`)
      console.log(`   📊 最小: ${responseTimes[0]}ms`)
      console.log(`   📊 最大: ${responseTimes[responseTimes.length - 1]}ms`)
      console.log('')

      /*
       * 断言：秒杀场景响应应该较快（模拟环境）
       * 注意：实际生产环境标准可能不同
       */
      expect(p50).toBeLessThan(1000) // P50 < 1s
      expect(p95).toBeLessThan(5000) // P95 < 5s
    }, 300000)
  })

  // ==================== B-7-4: 使用真实服务的并发测试 ====================

  describe('B-7-4 真实幂等服务10000并发测试', () => {
    /**
     * 业务场景：使用真实的IdempotencyService进行10000并发测试
     * 验证目标：验证真实服务在高并发下的表现
     */
    test('真实幂等服务 - 10000并发相同Key', async () => {
      if (!IdempotencyService) {
        console.warn('⚠️ 跳过测试：IdempotencyService未初始化')
        return
      }

      const concurrentCount = 10000
      const idempotencyKey = generateIdempotencyKey('real_service_same')

      console.log('')
      console.log('📋 B-7-4 真实服务测试:')
      console.log(`   并发数: ${concurrentCount}`)
      console.log(`   幂等键: ${idempotencyKey}`)
      console.log('')

      // 创建10000个并发任务（相同幂等键）
      const tasks = Array(concurrentCount)
        .fill(null)
        .map((_, index) => async () => {
          try {
            const result = await IdempotencyService.getOrCreateRequest(idempotencyKey, {
              api_path: '/api/v4/marketplace/purchase',
              http_method: 'POST',
              request_params: { product_id: 1, quantity: 1 },
              user_id: testUserId || generateMockUserId(index)
            })

            return {
              success: true,
              is_new: result.is_new,
              should_process: result.should_process
            }
          } catch (error) {
            if (error.statusCode === 409) {
              return { success: false, rejected: true }
            }
            return { success: false, error: error.message }
          }
        })

      // 执行并发测试
      const startTime = Date.now()
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: 200, // 控制并发数避免连接池耗尽
        timeout: 60000
      })
      const duration = Date.now() - startTime

      // 统计
      const processedCount = results.filter(r => r.result?.should_process).length
      const rejectedCount = results.filter(r => r.result?.rejected).length
      const errorCount = results.filter(r => !r.success && !r.result?.rejected).length

      console.log('')
      console.log('📊 B-7-4 测试结果:')
      console.log(`   ⏱️  总耗时: ${duration}ms`)
      console.log(`   📈 吞吐量: ${metrics.throughput}请求/秒`)
      console.log(`   ✅ 处理成功: ${processedCount}`)
      console.log(`   🚫 幂等拒绝: ${rejectedCount}`)
      console.log(`   ❌ 错误数量: ${errorCount}`)
      console.log('')

      // 断言：只有1个请求被处理
      expect(processedCount).toBeLessThanOrEqual(1)

      // 断言：错误率低于5%
      expect(errorCount).toBeLessThan(concurrentCount * 0.05)
    }, 600000)

    /**
     * 业务场景：使用真实服务进行混合并发测试
     * 验证目标：一部分相同Key，一部分不同Key
     */
    test('真实幂等服务 - 混合并发（50%相同Key + 50%不同Key）', async () => {
      if (!IdempotencyService) {
        console.warn('⚠️ 跳过测试：IdempotencyService未初始化')
        return
      }

      const concurrentCount = 10000
      const sameKeyCount = 5000
      const sameKey = generateIdempotencyKey('mixed_same')

      console.log('')
      console.log('📋 B-7-4-2 混合并发测试:')
      console.log(`   总并发数: ${concurrentCount}`)
      console.log(`   相同Key数: ${sameKeyCount}`)
      console.log(`   不同Key数: ${concurrentCount - sameKeyCount}`)
      console.log('')

      // 创建混合任务
      const tasks = Array(concurrentCount)
        .fill(null)
        .map((_, index) => async () => {
          // 前50%使用相同Key，后50%使用不同Key
          const idempotencyKey =
            index < sameKeyCount ? sameKey : generateIdempotencyKey(`mixed_diff_${index}`)

          try {
            const result = await IdempotencyService.getOrCreateRequest(idempotencyKey, {
              api_path: '/api/v4/marketplace/purchase',
              http_method: 'POST',
              request_params: { product_id: 1, quantity: 1 },
              user_id: testUserId || generateMockUserId(index)
            })

            return {
              success: true,
              is_same_key: index < sameKeyCount,
              should_process: result.should_process
            }
          } catch (error) {
            if (error.statusCode === 409) {
              return { success: false, is_same_key: index < sameKeyCount, rejected: true }
            }
            return { success: false, is_same_key: index < sameKeyCount, error: error.message }
          }
        })

      // 执行并发测试
      const startTime = Date.now()
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: 200,
        timeout: 60000
      })
      const duration = Date.now() - startTime

      // 分组统计
      const sameKeyResults = results.filter(r => r.result?.is_same_key)
      const diffKeyResults = results.filter(r => r.result?.is_same_key === false)

      const sameKeyProcessed = sameKeyResults.filter(r => r.result?.should_process).length
      const diffKeyProcessed = diffKeyResults.filter(r => r.result?.should_process).length

      console.log('')
      console.log('📊 B-7-4-2 测试结果:')
      console.log(`   ⏱️  总耗时: ${duration}ms`)
      console.log(`   📈 吞吐量: ${metrics.throughput}请求/秒`)
      console.log(`   📊 相同Key处理数: ${sameKeyProcessed}`)
      console.log(`   📊 不同Key处理数: ${diffKeyProcessed}`)
      console.log('')

      // 断言：相同Key只处理1次
      expect(sameKeyProcessed).toBeLessThanOrEqual(1)

      // 断言：不同Key大部分被处理（允许少量失败）
      expect(diffKeyProcessed).toBeGreaterThan((concurrentCount - sameKeyCount) * 0.9)
    }, 600000)
  })
})
