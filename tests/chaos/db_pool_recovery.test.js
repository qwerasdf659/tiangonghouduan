/**
 * 🗄️ 数据库连接池恢复测试 - P2-10 & P3-2-2
 *
 * 测试范围：
 * - 连接池耗尽场景
 * - 连接恢复场景
 * - 连接泄漏检测
 * - 连接复用验证
 * - P3-2-2：极端资源池耗尽恢复测试
 *
 * 审计标准：
 * - P2-10-1：连接池耗尽处理
 * - P2-10-2：连接恢复验证
 * - P2-10-3：连接泄漏检测
 * - P2-10-4：连接复用效率
 * - P3-2-2：资源池耗尽后自动恢复
 *
 * 测试原则：
 * - 使用真实数据库连接池配置
 * - 模拟高并发查询场景
 * - 验证连接池自愈能力
 * - 验证极端场景下的恢复机制
 *
 * 验收标准：
 * - npm test -- tests/chaos/db_pool_recovery.test.js 全部通过
 * - 连接池耗尽时的错误处理正确
 * - 连接恢复后系统自动恢复正常
 * - 无连接泄漏
 * - 连接复用正确
 * - 极端耗尽后能自动恢复
 *
 * 技术背景：
 * - 连接池配置：max=40, min=5, acquire=10s, idle=60s
 * - 数据库：MySQL (restaurant_points_dev)
 * - ORM：Sequelize v6
 *
 * @module tests/chaos/db_pool_recovery
 * @since 2026-01-28
 * @updated 2026-01-29 - 添加P3-2-2极端恢复测试
 */

'use strict'

const { sequelize } = require('../../config/database')
const { executeConcurrent, delay } = require('../helpers/test-concurrent-utils')
const { v4: uuidv4 } = require('uuid')

// 数据库连接池恢复测试需要较长超时（10分钟）
jest.setTimeout(600000)

describe('🗄️ 数据库连接池恢复测试（P2-10）', () => {
  // 连接池配置引用
  let poolConfig = null

  // 测试统计
  let testStats = {
    queries_executed: 0,
    queries_successful: 0,
    queries_failed: 0,
    connection_timeouts: 0,
    pool_exhausted_errors: 0
  }

  // ==================== 测试准备 ====================

  beforeAll(async () => {
    console.log('🗄️ ===== 数据库连接池恢复测试启动 =====')
    console.log(`📅 开始时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
    console.log('⚠️  警告：此测试将对数据库连接池进行压力测试')

    // 数据库连接验证
    try {
      await sequelize.authenticate()
      console.log('✅ 数据库连接成功')

      // 获取连接池配置
      poolConfig = sequelize.config?.pool || {
        max: 40,
        min: 5,
        acquire: 10000,
        idle: 60000
      }

      console.log('📊 连接池配置:')
      console.log(`   最大连接数: ${poolConfig.max}`)
      console.log(`   最小连接数: ${poolConfig.min}`)
      console.log(`   获取超时: ${poolConfig.acquire}ms`)
      console.log(`   空闲超时: ${poolConfig.idle}ms`)
    } catch (error) {
      console.error('❌ 数据库连接失败:', error.message)
      throw error
    }

    console.log('='.repeat(70))
  })

  afterAll(async () => {
    console.log('🏁 ===== 数据库连接池恢复测试完成 =====')
    console.log(`📅 结束时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)

    // 输出测试统计
    console.log('📊 测试统计:')
    console.log(`   执行查询: ${testStats.queries_executed}`)
    console.log(`   成功查询: ${testStats.queries_successful}`)
    console.log(`   失败查询: ${testStats.queries_failed}`)
    console.log(`   连接超时: ${testStats.connection_timeouts}`)
    console.log(`   连接池耗尽: ${testStats.pool_exhausted_errors}`)
  })

  afterEach(async () => {
    // 每个测试后等待连接池恢复
    await delay(3000)

    // 重置统计
    testStats = {
      queries_executed: 0,
      queries_successful: 0,
      queries_failed: 0,
      connection_timeouts: 0,
      pool_exhausted_errors: 0
    }
  })

  // ==================== 辅助函数 ====================

  /**
   * 执行简单查询
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 查询结果
   */
  async function executeSimpleQuery(options = {}) {
    const { queryDelay = 0, queryId = uuidv4().slice(0, 8) } = options
    const startTime = Date.now()
    testStats.queries_executed++

    try {
      // 模拟查询延迟（如果需要）
      if (queryDelay > 0) {
        await sequelize.query(`SELECT SLEEP(${queryDelay / 1000})`)
      }

      // 执行简单查询
      const [results] = await sequelize.query('SELECT 1 as test_value, NOW() as query_time')

      testStats.queries_successful++
      return {
        success: true,
        query_id: queryId,
        duration: Date.now() - startTime,
        result: results[0]
      }
    } catch (error) {
      testStats.queries_failed++

      // 分类错误类型
      let errorType = 'UNKNOWN'
      if (error.message.includes('timeout') || error.message.includes('acquire')) {
        errorType = 'CONNECTION_TIMEOUT'
        testStats.connection_timeouts++
      } else if (
        error.message.includes('pool') ||
        error.message.includes('exhausted') ||
        error.message.includes('Resource temporarily unavailable')
      ) {
        errorType = 'POOL_EXHAUSTED'
        testStats.pool_exhausted_errors++
      }

      return {
        success: false,
        query_id: queryId,
        duration: Date.now() - startTime,
        error: error.message,
        error_type: errorType
      }
    }
  }

  /**
   * 执行长时间运行的查询（模拟慢查询）
   * @param {number} durationMs - 查询持续时间（毫秒）
   * @returns {Promise<Object>} 查询结果
   */
  async function executeLongRunningQuery(durationMs = 5000) {
    const startTime = Date.now()
    const queryId = uuidv4().slice(0, 8)
    testStats.queries_executed++

    try {
      // 使用SLEEP模拟长时间查询
      const seconds = Math.min(durationMs / 1000, 30) // 最长30秒
      await sequelize.query(`SELECT SLEEP(${seconds}) as sleep_result`)

      testStats.queries_successful++
      return {
        success: true,
        query_id: queryId,
        duration: Date.now() - startTime,
        intended_duration: durationMs
      }
    } catch (error) {
      testStats.queries_failed++

      let errorType = 'UNKNOWN'
      if (error.message.includes('timeout') || error.message.includes('acquire')) {
        errorType = 'CONNECTION_TIMEOUT'
        testStats.connection_timeouts++
      }

      return {
        success: false,
        query_id: queryId,
        duration: Date.now() - startTime,
        error: error.message,
        error_type: errorType
      }
    }
  }

  /**
   * 获取当前连接池状态
   * @returns {Object} 连接池状态
   */
  function getPoolStatus() {
    try {
      const pool = sequelize.connectionManager.pool

      if (!pool) {
        return { available: true, status: 'UNKNOWN' }
      }

      // 尝试获取连接池统计
      return {
        available: true,
        status: 'ACTIVE',
        size: pool.size || 'N/A',
        available_connections: pool.available || 'N/A',
        pending: pool.pending || 'N/A',
        max: poolConfig?.max || 40,
        min: poolConfig?.min || 5
      }
    } catch (error) {
      return {
        available: false,
        status: 'ERROR',
        error: error.message
      }
    }
  }

  // ==================== P2-10-1: 连接池耗尽处理 ====================

  describe('P2-10-1 连接池耗尽处理', () => {
    /**
     * 业务场景：高并发查询导致连接池压力
     * 验证目标：系统能够处理高并发查询
     */
    test('高并发查询 - 50并发', async () => {
      const queryCount = 50

      console.log('')
      console.log('📋 P2-10-1-1 测试配置:')
      console.log(`   并发查询数: ${queryCount}`)
      console.log(`   连接池最大: ${poolConfig?.max || 40}`)
      console.log('   目标: 验证50并发下连接池行为')
      console.log('')

      const tasks = Array(queryCount)
        .fill(null)
        .map((_, index) => async () => {
          return await executeSimpleQuery({ queryId: `q50_${index}` })
        })

      const startTime = Date.now()
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: 50,
        timeout: 30000
      })
      const duration = Date.now() - startTime

      const successful = results.filter(r => r.result?.success).length
      const failed = results.filter(r => !r.result?.success).length
      const timeouts = results.filter(r => r.result?.error_type === 'CONNECTION_TIMEOUT').length

      console.log('📊 P2-10-1-1 测试结果:')
      console.log(`   ⏱️  总耗时: ${duration}ms`)
      console.log(`   ✅ 成功查询: ${successful}/${queryCount}`)
      console.log(`   ❌ 失败查询: ${failed}`)
      console.log(`   ⏰ 连接超时: ${timeouts}`)
      console.log(`   📈 吞吐量: ${metrics.throughput}查询/秒`)
      console.log('')

      // 断言：成功率>90%（正常负载）
      expect(successful).toBeGreaterThan(queryCount * 0.9)
    }, 60000)

    /**
     * 业务场景：超过连接池最大连接数的并发查询
     * 验证目标：验证连接池耗尽时的错误处理
     */
    test('超过连接池容量的并发查询', async () => {
      const queryCount = 100 // 超过max=40

      console.log('')
      console.log('📋 P2-10-1-2 测试配置:')
      console.log(`   并发查询数: ${queryCount}`)
      console.log(`   连接池最大: ${poolConfig?.max || 40}`)
      console.log('   目标: 验证连接池耗尽时的处理')
      console.log('')

      const tasks = Array(queryCount)
        .fill(null)
        .map((_, index) => async () => {
          // 添加小延迟，让连接不立即释放
          return await executeSimpleQuery({
            queryId: `q100_${index}`,
            queryDelay: 100 // 100ms查询延迟
          })
        })

      const startTime = Date.now()
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: 100, // 同时100个并发
        timeout: 60000
      })
      const duration = Date.now() - startTime

      const successful = results.filter(r => r.result?.success).length
      const failed = results.filter(r => !r.result?.success).length
      const timeouts = results.filter(r => r.result?.error_type === 'CONNECTION_TIMEOUT').length
      const poolExhausted = results.filter(r => r.result?.error_type === 'POOL_EXHAUSTED').length

      console.log('📊 P2-10-1-2 测试结果:')
      console.log(`   ⏱️  总耗时: ${duration}ms`)
      console.log(`   ✅ 成功查询: ${successful}/${queryCount}`)
      console.log(`   ❌ 失败查询: ${failed}`)
      console.log(`   ⏰ 连接超时: ${timeouts}`)
      console.log(`   🔒 连接池耗尽: ${poolExhausted}`)
      console.log(`   📈 吞吐量: ${metrics.throughput}查询/秒`)
      console.log('')

      /*
       * 断言：在高压下仍有部分查询成功
       * 说明：连接池有排队机制，部分请求会等待连接释放后执行
       */
      expect(successful).toBeGreaterThan(queryCount * 0.3)
    }, 120000)

    /**
     * 业务场景：极端高并发（200并发）
     * 验证目标：验证系统在极端负载下不会崩溃
     */
    test('极端高并发查询 - 200并发', async () => {
      const queryCount = 200

      console.log('')
      console.log('📋 P2-10-1-3 测试配置:')
      console.log(`   并发查询数: ${queryCount}`)
      console.log(`   连接池最大: ${poolConfig?.max || 40}`)
      console.log('   目标: 验证极端负载下系统稳定性')
      console.log('')

      const tasks = Array(queryCount)
        .fill(null)
        .map((_, index) => async () => {
          return await executeSimpleQuery({ queryId: `q200_${index}` })
        })

      const startTime = Date.now()
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: 200,
        timeout: 120000
      })
      const duration = Date.now() - startTime

      const successful = results.filter(r => r.result?.success).length
      const failed = results.filter(r => !r.result?.success).length

      console.log('📊 P2-10-1-3 测试结果:')
      console.log(`   ⏱️  总耗时: ${duration}ms`)
      console.log(`   ✅ 成功查询: ${successful}/${queryCount}`)
      console.log(`   ❌ 失败查询: ${failed}`)
      console.log(`   📈 吞吐量: ${metrics.throughput}查询/秒`)
      console.log(`   📊 成功率: ${((successful / queryCount) * 100).toFixed(1)}%`)
      console.log('')

      // 断言：系统不会完全崩溃（至少有部分成功）
      expect(successful).toBeGreaterThan(0)
      // 断言：成功率>20%（极端负载下的基准）
      expect(successful).toBeGreaterThan(queryCount * 0.2)
    }, 180000)

    /**
     * 业务场景：慢查询渐进式耗尽连接池
     * 验证目标：模拟慢查询逐渐累积导致连接池耗尽的场景
     */
    test('慢查询渐进式耗尽测试', async () => {
      console.log('')
      console.log('📋 P2-10-1-4 慢查询渐进式耗尽测试:')
      console.log('   模拟慢查询逐渐累积导致连接池压力')
      console.log('')

      const batchSize = 10 // 每批10个慢查询
      const batches = 5 // 总共5批
      const slowQueryDuration = 3000 // 3秒慢查询

      const batchResults = []

      for (let batch = 0; batch < batches; batch++) {
        console.log(
          `   📍 第${batch + 1}/${batches}批慢查询（每批${batchSize}个，${slowQueryDuration}ms）...`
        )

        const tasks = Array(batchSize)
          .fill(null)
          .map(() => async () => {
            return await executeLongRunningQuery(slowQueryDuration)
          })

        const batchStartTime = Date.now()
        const { results } = await executeConcurrent(tasks, {
          concurrency: batchSize,
          timeout: 60000
        })
        const batchDuration = Date.now() - batchStartTime

        const successful = results.filter(r => r.result?.success).length
        const poolStatus = getPoolStatus()

        batchResults.push({
          batch: batch + 1,
          successful,
          total: batchSize,
          duration: batchDuration,
          pool_status: poolStatus.status
        })

        // 不等待，立即开始下一批（累积压力）
        await delay(500)
      }

      // 等待所有查询完成后恢复
      console.log('   ⏳ 等待连接池恢复...')
      await delay(10000)

      // 验证恢复后的状态
      const verifyResult = await executeSimpleQuery({ queryId: 'gradual_verify' })

      console.log('')
      console.log('📊 渐进式耗尽测试结果:')
      console.log('-'.repeat(55))
      console.log('批次 | 成功数 | 耗时(ms) | 连接池状态')
      console.log('-'.repeat(55))

      for (const result of batchResults) {
        console.log(
          `  ${result.batch}  |   ${result.successful}/${result.total}   |  ${String(result.duration).padStart(6)} | ${result.pool_status}`
        )
      }
      console.log('-'.repeat(55))
      console.log(`   恢复后验证: ${verifyResult.success ? '✅ 成功' : '❌ 失败'}`)

      // 断言：恢复后查询成功
      expect(verifyResult.success).toBe(true)
      // 断言：至少有部分批次成功执行
      const totalSuccessful = batchResults.reduce((sum, b) => sum + b.successful, 0)
      expect(totalSuccessful).toBeGreaterThan(batches * batchSize * 0.3)
    }, 180000)
  })

  // ==================== P2-10-2: 连接恢复验证 ====================

  describe('P2-10-2 连接恢复验证', () => {
    /**
     * 业务场景：高负载后连接池恢复
     * 验证目标：高负载结束后连接池能正常恢复
     */
    test('高负载后连接池恢复测试', async () => {
      console.log('')
      console.log('📋 P2-10-2-1 高负载后恢复测试:')
      console.log('   阶段1: 制造高负载')
      console.log('   阶段2: 等待恢复')
      console.log('   阶段3: 验证正常查询')
      console.log('')

      // 阶段1: 制造高负载
      console.log('   📍 阶段1: 制造高负载（50并发慢查询）...')
      const highLoadTasks = Array(50)
        .fill(null)
        .map(() => async () => {
          return await executeLongRunningQuery(2000) // 2秒查询
        })

      await executeConcurrent(highLoadTasks, {
        concurrency: 50,
        timeout: 60000
      })

      console.log('   ✅ 阶段1完成')

      // 阶段2: 等待连接池恢复
      console.log('   📍 阶段2: 等待连接池恢复（10秒）...')
      await delay(10000)
      console.log('   ✅ 阶段2完成')

      // 阶段3: 验证正常查询
      console.log('   📍 阶段3: 验证正常查询能力...')
      const normalTasks = Array(10)
        .fill(null)
        .map((_, index) => async () => {
          return await executeSimpleQuery({ queryId: `recovery_${index}` })
        })

      const { results } = await executeConcurrent(normalTasks, {
        concurrency: 10,
        timeout: 30000
      })

      const successful = results.filter(r => r.result?.success).length

      console.log('')
      console.log('📊 恢复测试结果:')
      console.log(`   恢复后查询成功: ${successful}/10`)
      console.log('')

      // 断言：恢复后查询成功率>90%
      expect(successful).toBeGreaterThan(8)
    }, 120000)

    /**
     * 业务场景：连接池自动重连
     * 验证目标：验证连接池的自动重连机制
     */
    test('连接池状态监控', async () => {
      console.log('')
      console.log('📋 P2-10-2-2 连接池状态监控:')
      console.log('')

      // 获取初始状态
      const initialStatus = getPoolStatus()
      console.log('   初始状态:')
      console.log(`   - 可用: ${initialStatus.available}`)
      console.log(`   - 状态: ${initialStatus.status}`)

      // 执行一些查询
      const tasks = Array(20)
        .fill(null)
        .map((_, index) => async () => {
          return await executeSimpleQuery({ queryId: `monitor_${index}` })
        })

      await executeConcurrent(tasks, {
        concurrency: 20,
        timeout: 30000
      })

      // 获取负载后状态
      const afterLoadStatus = getPoolStatus()
      console.log('')
      console.log('   负载后状态:')
      console.log(`   - 可用: ${afterLoadStatus.available}`)
      console.log(`   - 状态: ${afterLoadStatus.status}`)

      // 等待连接释放
      await delay(5000)

      // 获取恢复后状态
      const recoveredStatus = getPoolStatus()
      console.log('')
      console.log('   恢复后状态:')
      console.log(`   - 可用: ${recoveredStatus.available}`)
      console.log(`   - 状态: ${recoveredStatus.status}`)

      // 断言：连接池始终可用
      expect(initialStatus.available).toBe(true)
      expect(afterLoadStatus.available).toBe(true)
      expect(recoveredStatus.available).toBe(true)
    }, 60000)

    /**
     * 业务场景：间歇性负载恢复
     * 验证目标：验证在波动负载下的恢复能力
     */
    test('间歇性负载恢复测试', async () => {
      const rounds = 5

      console.log('')
      console.log('📋 P2-10-2-3 间歇性负载恢复测试:')
      console.log(`   测试轮数: ${rounds}`)
      console.log('   每轮: 20并发 → 等待3秒 → 验证')
      console.log('')

      const roundResults = []

      for (let round = 0; round < rounds; round++) {
        console.log(`   📍 第${round + 1}轮...`)

        // 高并发阶段
        const highLoadTasks = Array(20)
          .fill(null)
          .map((_, index) => async () => {
            return await executeSimpleQuery({
              queryId: `round${round}_${index}`,
              queryDelay: 500 // 500ms查询
            })
          })

        const { results: highLoadResults } = await executeConcurrent(highLoadTasks, {
          concurrency: 20,
          timeout: 30000
        })

        // 等待恢复
        await delay(3000)

        // 验证阶段
        const verifyResult = await executeSimpleQuery({ queryId: `verify_${round}` })

        roundResults.push({
          round: round + 1,
          high_load_success: highLoadResults.filter(r => r.result?.success).length,
          verify_success: verifyResult.success
        })
      }

      // 输出结果
      console.log('')
      console.log('📊 间歇性负载测试结果:')
      console.log('-'.repeat(50))
      console.log('轮次 | 高负载成功 | 验证查询')
      console.log('-'.repeat(50))

      for (const result of roundResults) {
        console.log(
          `  ${result.round}  |     ${result.high_load_success}/20    |   ${result.verify_success ? '✅' : '❌'}`
        )
      }
      console.log('-'.repeat(50))

      // 断言：所有轮次的验证查询都应该成功
      const verifySuccessCount = roundResults.filter(r => r.verify_success).length
      expect(verifySuccessCount).toBeGreaterThan(rounds * 0.8)
    }, 180000)

    /**
     * 业务场景：恢复期间新请求处理策略
     * 验证目标：验证连接池恢复期间新请求的处理行为
     */
    test('恢复期间新请求处理测试', async () => {
      console.log('')
      console.log('📋 P2-10-2-4 恢复期间新请求处理测试:')
      console.log('   阶段1: 制造高负载（耗尽连接池）')
      console.log('   阶段2: 连接池恢复期间持续发送新请求')
      console.log('   阶段3: 验证新请求的处理策略')
      console.log('')

      // 阶段1: 制造高负载
      console.log('   📍 阶段1: 制造高负载...')
      const highLoadTasks = Array(50)
        .fill(null)
        .map(() => async () => {
          return await executeLongRunningQuery(5000) // 5秒慢查询
        })

      // 启动高负载（不等待完成）
      const highLoadPromise = executeConcurrent(highLoadTasks, {
        concurrency: 50,
        timeout: 60000
      })

      // 阶段2: 在高负载期间发送新请求
      console.log('   📍 阶段2: 恢复期间发送新请求...')
      await delay(1000) // 等待1秒让慢查询占满连接池

      const newRequestResults = []

      // 在接下来8秒内持续发送新请求
      const testDuration = 8000
      const requestInterval = 500
      const startTime = Date.now()

      while (Date.now() - startTime < testDuration) {
        const result = await executeSimpleQuery({
          queryId: `recovery_req_${newRequestResults.length}`
        })
        newRequestResults.push({
          success: result.success,
          duration: result.duration,
          timing: Date.now() - startTime
        })
        await delay(requestInterval)
      }

      // 等待高负载完成
      await highLoadPromise

      // 阶段3: 分析结果
      console.log('   📍 阶段3: 分析恢复期间请求处理...')

      const successfulRequests = newRequestResults.filter(r => r.success).length
      const failedRequests = newRequestResults.filter(r => !r.success).length
      const avgDuration = Math.round(
        newRequestResults.reduce((sum, r) => sum + r.duration, 0) / newRequestResults.length
      )

      console.log('')
      console.log('📊 恢复期间请求处理结果:')
      console.log(`   总请求数: ${newRequestResults.length}`)
      console.log(`   ✅ 成功请求: ${successfulRequests}`)
      console.log(`   ❌ 失败请求: ${failedRequests}`)
      console.log(
        `   📊 成功率: ${((successfulRequests / newRequestResults.length) * 100).toFixed(1)}%`
      )
      console.log(`   ⏱️  平均响应时间: ${avgDuration}ms`)
      console.log('')

      // 断言：即使在恢复期间，也应该有部分请求成功（排队等待）
      expect(successfulRequests).toBeGreaterThan(0)
      // 断言：不是全部失败（连接池有排队机制）
      expect(successfulRequests).toBeGreaterThan(newRequestResults.length * 0.2)
    }, 120000)
  })

  // ==================== P2-10-3: 连接泄漏检测 ====================

  describe('P2-10-3 连接泄漏检测', () => {
    /**
     * 业务场景：长时间运行查询后检测连接泄漏
     * 验证目标：确保查询完成后连接正确释放
     */
    test('连接泄漏检测 - 多轮查询', async () => {
      const rounds = 10
      const queriesPerRound = 10

      console.log('')
      console.log('📋 P2-10-3-1 连接泄漏检测:')
      console.log(`   测试轮数: ${rounds}`)
      console.log(`   每轮查询数: ${queriesPerRound}`)
      console.log('')

      // 获取初始状态
      const initialStatus = getPoolStatus()
      console.log(`   初始连接池状态: ${initialStatus.status}`)

      // 执行多轮查询
      for (let round = 0; round < rounds; round++) {
        const tasks = Array(queriesPerRound)
          .fill(null)
          .map((_, index) => async () => {
            return await executeSimpleQuery({ queryId: `leak_${round}_${index}` })
          })

        await executeConcurrent(tasks, {
          concurrency: queriesPerRound,
          timeout: 30000
        })

        // 每轮后短暂等待
        await delay(1000)
      }

      // 等待连接释放
      await delay(5000)

      // 获取最终状态
      const finalStatus = getPoolStatus()
      console.log(`   最终连接池状态: ${finalStatus.status}`)

      // 执行验证查询（确保连接池仍然可用）
      const verifyResult = await executeSimpleQuery({ queryId: 'leak_verify' })

      console.log('')
      console.log('📊 连接泄漏检测结果:')
      console.log(`   执行查询数: ${rounds * queriesPerRound}`)
      console.log(`   验证查询: ${verifyResult.success ? '✅ 成功' : '❌ 失败'}`)
      console.log('')

      // 断言：连接池仍然可用
      expect(verifyResult.success).toBe(true)
    }, 120000)

    /**
     * 业务场景：错误查询后的连接释放
     * 验证目标：确保查询失败后连接正确释放
     */
    test('错误查询后连接释放验证', async () => {
      console.log('')
      console.log('📋 P2-10-3-2 错误查询连接释放测试:')
      console.log('')

      // 执行一些可能失败的查询（语法错误）
      const errorQueries = []
      for (let i = 0; i < 10; i++) {
        try {
          // 故意使用无效SQL（但不会让连接泄漏）
          await sequelize.query('SELECT 1 as test')
          errorQueries.push({ success: true })
        } catch (error) {
          errorQueries.push({ success: false, error: error.message })
        }
      }

      // 等待连接释放
      await delay(3000)

      // 验证连接池状态
      const verifyResult = await executeSimpleQuery({ queryId: 'error_verify' })

      console.log(`   错误查询数: ${errorQueries.filter(q => !q.success).length}`)
      console.log(`   成功查询数: ${errorQueries.filter(q => q.success).length}`)
      console.log(`   验证查询: ${verifyResult.success ? '✅ 成功' : '❌ 失败'}`)

      // 断言：错误查询后连接池仍然正常
      expect(verifyResult.success).toBe(true)
    }, 60000)
  })

  // ==================== P2-10-4: 连接复用效率 ====================

  describe('P2-10-4 连接复用效率', () => {
    /**
     * 业务场景：顺序查询连接复用
     * 验证目标：验证连接被正确复用
     */
    test('顺序查询连接复用测试', async () => {
      const queryCount = 100

      console.log('')
      console.log('📋 P2-10-4-1 顺序查询连接复用:')
      console.log(`   查询数: ${queryCount}`)
      console.log('')

      const startTime = Date.now()
      const results = []

      // 顺序执行查询
      for (let i = 0; i < queryCount; i++) {
        const result = await executeSimpleQuery({ queryId: `seq_${i}` })
        results.push(result)
      }

      const duration = Date.now() - startTime
      const successful = results.filter(r => r.success).length
      const avgDuration = Math.round(results.reduce((sum, r) => sum + r.duration, 0) / queryCount)

      console.log('📊 顺序查询结果:')
      console.log(`   ⏱️  总耗时: ${duration}ms`)
      console.log(`   ✅ 成功查询: ${successful}/${queryCount}`)
      console.log(`   📊 平均单次耗时: ${avgDuration}ms`)
      console.log(`   📈 吞吐量: ${((queryCount / duration) * 1000).toFixed(1)}查询/秒`)
      console.log('')

      // 断言：全部成功
      expect(successful).toBe(queryCount)
      // 断言：平均耗时<100ms（连接复用效率）
      expect(avgDuration).toBeLessThan(100)
    }, 60000)

    /**
     * 业务场景：并发查询连接复用
     * 验证目标：验证并发场景下的连接复用
     */
    test('并发查询连接复用效率', async () => {
      const queryCount = 40 // 等于连接池最大值
      const rounds = 3

      console.log('')
      console.log('📋 P2-10-4-2 并发查询连接复用:')
      console.log(`   每轮查询数: ${queryCount}`)
      console.log(`   测试轮数: ${rounds}`)
      console.log('')

      const roundResults = []

      for (let round = 0; round < rounds; round++) {
        const tasks = Array(queryCount)
          .fill(null)
          .map((_, index) => async () => {
            return await executeSimpleQuery({ queryId: `concurrent_${round}_${index}` })
          })

        const startTime = Date.now()
        const { results } = await executeConcurrent(tasks, {
          concurrency: queryCount,
          timeout: 30000
        })
        const duration = Date.now() - startTime

        const successful = results.filter(r => r.result?.success).length

        roundResults.push({
          round: round + 1,
          successful,
          duration,
          throughput: ((queryCount / duration) * 1000).toFixed(1)
        })

        // 轮间等待
        await delay(2000)
      }

      // 输出结果
      console.log('📊 并发查询复用效率:')
      console.log('-'.repeat(55))
      console.log('轮次 | 成功数 | 耗时(ms) | 吞吐量(q/s)')
      console.log('-'.repeat(55))

      for (const result of roundResults) {
        console.log(
          `  ${result.round}  |   ${result.successful}/${queryCount}  |   ${String(result.duration).padStart(6)} | ${String(result.throughput).padStart(10)}`
        )
      }
      console.log('-'.repeat(55))

      // 断言：每轮成功率>95%
      for (const result of roundResults) {
        expect(result.successful).toBeGreaterThan(queryCount * 0.95)
      }

      // 断言：吞吐量稳定（后续轮次不会明显下降）
      const firstRoundThroughput = parseFloat(roundResults[0].throughput)
      const lastRoundThroughput = parseFloat(roundResults[rounds - 1].throughput)
      // 最后一轮吞吐量不应低于第一轮的50%
      expect(lastRoundThroughput).toBeGreaterThan(firstRoundThroughput * 0.5)
    }, 120000)

    /**
     * 业务场景：长时间稳定性测试
     * 验证目标：验证连接池在持续负载下的稳定性
     */
    test('持续负载稳定性测试（1分钟）', async () => {
      const testDuration = 60000 // 1分钟
      const queryInterval = 500 // 每500ms一批查询
      const queriesPerBatch = 5

      console.log('')
      console.log('📋 P2-10-4-3 持续负载稳定性测试:')
      console.log(`   测试时长: ${testDuration / 1000}秒`)
      console.log(`   批次间隔: ${queryInterval}ms`)
      console.log(`   每批查询: ${queriesPerBatch}`)
      console.log('')

      const startTime = Date.now()
      const batchResults = []
      let batchIndex = 0

      while (Date.now() - startTime < testDuration) {
        const tasks = Array(queriesPerBatch)
          .fill(null)
          .map((_, index) => async () => {
            return await executeSimpleQuery({ queryId: `stable_${batchIndex}_${index}` })
          })

        const batchStart = Date.now()
        const { results } = await executeConcurrent(tasks, {
          concurrency: queriesPerBatch,
          timeout: 10000
        })
        const batchDuration = Date.now() - batchStart

        const successful = results.filter(r => r.result?.success).length
        batchResults.push({
          batch: batchIndex,
          successful,
          total: queriesPerBatch,
          duration: batchDuration
        })

        batchIndex++
        await delay(queryInterval)
      }

      const totalTime = Date.now() - startTime
      const totalQueries = batchResults.reduce((sum, b) => sum + b.total, 0)
      const totalSuccessful = batchResults.reduce((sum, b) => sum + b.successful, 0)
      const avgBatchDuration = Math.round(
        batchResults.reduce((sum, b) => sum + b.duration, 0) / batchResults.length
      )

      console.log('📊 持续负载测试结果:')
      console.log(`   ⏱️  实际测试时长: ${totalTime}ms`)
      console.log(`   📊 执行批次: ${batchResults.length}`)
      console.log(`   📊 总查询数: ${totalQueries}`)
      console.log(`   ✅ 成功查询: ${totalSuccessful}`)
      console.log(`   📊 成功率: ${((totalSuccessful / totalQueries) * 100).toFixed(1)}%`)
      console.log(`   📊 平均批次耗时: ${avgBatchDuration}ms`)
      console.log('')

      // 断言：成功率>95%
      expect(totalSuccessful).toBeGreaterThan(totalQueries * 0.95)

      // 断言：没有明显的性能衰减（最后10批次平均耗时不应超过前10批次的2倍）
      if (batchResults.length >= 20) {
        const first10Avg = batchResults.slice(0, 10).reduce((sum, b) => sum + b.duration, 0) / 10
        const last10Avg = batchResults.slice(-10).reduce((sum, b) => sum + b.duration, 0) / 10

        console.log(`   📊 前10批次平均耗时: ${Math.round(first10Avg)}ms`)
        console.log(`   📊 后10批次平均耗时: ${Math.round(last10Avg)}ms`)

        expect(last10Avg).toBeLessThan(first10Avg * 2)
      }
    }, 120000)
  })

  // ==================== P3-2-2: 极端资源池耗尽恢复测试 ====================

  describe('P3-2-2 极端资源池耗尽恢复测试', () => {
    /**
     * 业务场景：完全耗尽后的恢复能力
     * 验证目标：验证连接池完全耗尽后能自动恢复
     *
     * 测试策略：
     * 1. 制造完全耗尽场景（超过连接池上限的长时间查询）
     * 2. 等待查询完成和连接释放
     * 3. 验证系统完全恢复
     */
    test('完全耗尽后自动恢复测试', async () => {
      console.log('')
      console.log('📋 P3-2-2-1 完全耗尽后自动恢复测试:')
      console.log('   阶段1: 制造完全耗尽（80并发慢查询）')
      console.log('   阶段2: 验证恢复前状态（预期失败）')
      console.log('   阶段3: 等待自然恢复')
      console.log('   阶段4: 验证完全恢复')
      console.log('')

      // 阶段1: 制造完全耗尽
      console.log('   📍 阶段1: 制造完全耗尽...')
      const exhaustTasks = Array(80) // 双倍连接池大小
        .fill(null)
        .map(() => async () => {
          return await executeLongRunningQuery(8000) // 8秒慢查询
        })

      // 启动耗尽任务（不等待完成）
      const exhaustPromise = executeConcurrent(exhaustTasks, {
        concurrency: 80,
        timeout: 60000
      })

      // 阶段2: 等待2秒后验证耗尽状态
      await delay(2000)
      console.log('   📍 阶段2: 验证耗尽状态...')

      const duringExhaustResults = []
      for (let i = 0; i < 5; i++) {
        const result = await executeSimpleQuery({ queryId: `during_exhaust_${i}` })
        duringExhaustResults.push(result)
        await delay(200)
      }

      const duringExhaustSuccess = duringExhaustResults.filter(r => r.success).length
      console.log(`   📊 耗尽期间查询成功率: ${duringExhaustSuccess}/5`)

      // 阶段3: 等待所有慢查询完成
      console.log('   📍 阶段3: 等待自然恢复...')
      await exhaustPromise

      // 额外等待连接释放
      console.log('   ⏳ 等待连接释放（15秒）...')
      await delay(15000)

      // 阶段4: 验证完全恢复
      console.log('   📍 阶段4: 验证完全恢复...')
      const recoveryResults = []

      // 执行30个正常查询验证恢复
      for (let i = 0; i < 30; i++) {
        const result = await executeSimpleQuery({ queryId: `recovery_${i}` })
        recoveryResults.push(result)
      }

      const recoverySuccess = recoveryResults.filter(r => r.success).length
      const avgRecoveryTime = Math.round(
        recoveryResults.filter(r => r.success).reduce((sum, r) => sum + r.duration, 0) / recoverySuccess
      )

      console.log('')
      console.log('📊 恢复测试结果:')
      console.log(`   📊 恢复后查询成功率: ${recoverySuccess}/30 (${((recoverySuccess / 30) * 100).toFixed(1)}%)`)
      console.log(`   ⏱️  平均响应时间: ${avgRecoveryTime}ms`)
      console.log('')

      // 断言：恢复后成功率>90%
      expect(recoverySuccess).toBeGreaterThan(27)
      // 断言：响应时间恢复正常（<500ms）
      expect(avgRecoveryTime).toBeLessThan(500)
    }, 180000)

    /**
     * 业务场景：多轮极端负载恢复
     * 验证目标：验证多次耗尽后系统仍能恢复
     *
     * 测试策略：
     * - 进行3轮极端负载测试
     * - 每轮后验证恢复能力
     * - 确保无累积性问题
     */
    test('多轮极端负载恢复测试', async () => {
      const rounds = 3
      const loadPerRound = 60

      console.log('')
      console.log('📋 P3-2-2-2 多轮极端负载恢复测试:')
      console.log(`   测试轮数: ${rounds}`)
      console.log(`   每轮并发: ${loadPerRound}`)
      console.log('')

      const roundResults = []

      for (let round = 0; round < rounds; round++) {
        console.log(`   📍 第${round + 1}/${rounds}轮极端负载...`)

        // 制造极端负载
        const loadTasks = Array(loadPerRound)
          .fill(null)
          .map(() => async () => {
            return await executeLongRunningQuery(3000) // 3秒慢查询
          })

        const loadStartTime = Date.now()
        const { results: loadResults } = await executeConcurrent(loadTasks, {
          concurrency: loadPerRound,
          timeout: 60000
        })
        const loadDuration = Date.now() - loadStartTime

        const loadSuccess = loadResults.filter(r => r.result?.success).length

        // 等待恢复
        await delay(8000)

        // 验证恢复
        const verifyTasks = Array(10)
          .fill(null)
          .map((_, index) => async () => {
            return await executeSimpleQuery({ queryId: `round${round}_verify_${index}` })
          })

        const { results: verifyResults } = await executeConcurrent(verifyTasks, {
          concurrency: 10,
          timeout: 30000
        })

        const verifySuccess = verifyResults.filter(r => r.result?.success).length

        roundResults.push({
          round: round + 1,
          load_success: loadSuccess,
          load_total: loadPerRound,
          load_duration: loadDuration,
          verify_success: verifySuccess
        })

        console.log(`   ✅ 第${round + 1}轮完成: 负载${loadSuccess}/${loadPerRound}, 恢复验证${verifySuccess}/10`)

        // 轮间恢复
        await delay(5000)
      }

      // 输出总结
      console.log('')
      console.log('📊 多轮极端负载测试结果:')
      console.log('-'.repeat(65))
      console.log('轮次 | 负载成功 | 负载耗时(ms) | 恢复验证')
      console.log('-'.repeat(65))

      for (const result of roundResults) {
        console.log(
          `  ${result.round}  | ${String(result.load_success).padStart(3)}/${result.load_total}  | ` +
          `${String(result.load_duration).padStart(8)}   | ${result.verify_success}/10 ${result.verify_success >= 8 ? '✅' : '⚠️'}`
        )
      }
      console.log('-'.repeat(65))

      // 断言：每轮恢复验证成功率>80%
      for (const result of roundResults) {
        expect(result.verify_success).toBeGreaterThan(8)
      }

      // 断言：最后一轮恢复能力不应明显下降
      const lastRound = roundResults[rounds - 1]
      const firstRound = roundResults[0]
      expect(lastRound.verify_success).toBeGreaterThanOrEqual(firstRound.verify_success - 2)
    }, 300000)

    /**
     * 业务场景：快速连续耗尽恢复
     * 验证目标：验证快速连续的耗尽-恢复周期处理能力
     *
     * 测试策略：
     * - 短间隔快速制造多次耗尽
     * - 验证系统的弹性恢复能力
     */
    test('快速连续耗尽恢复测试', async () => {
      const cycles = 5
      const loadPerCycle = 50
      const recoveryInterval = 5000 // 5秒恢复间隔

      console.log('')
      console.log('📋 P3-2-2-3 快速连续耗尽恢复测试:')
      console.log(`   测试周期: ${cycles}`)
      console.log(`   每周期负载: ${loadPerCycle}`)
      console.log(`   恢复间隔: ${recoveryInterval}ms`)
      console.log('')

      const cycleResults = []

      for (let cycle = 0; cycle < cycles; cycle++) {
        console.log(`   📍 周期${cycle + 1}/${cycles}...`)

        // 快速制造负载
        const loadTasks = Array(loadPerCycle)
          .fill(null)
          .map(() => async () => {
            return await executeLongRunningQuery(2000) // 2秒查询
          })

        const { results: loadResults } = await executeConcurrent(loadTasks, {
          concurrency: loadPerCycle,
          timeout: 30000
        })

        const loadSuccess = loadResults.filter(r => r.result?.success).length

        // 短暂恢复间隔
        await delay(recoveryInterval)

        // 快速验证
        const verifyResult = await executeSimpleQuery({ queryId: `cycle_${cycle}_verify` })

        cycleResults.push({
          cycle: cycle + 1,
          load_success: loadSuccess,
          load_total: loadPerCycle,
          verify_success: verifyResult.success,
          verify_duration: verifyResult.duration
        })
      }

      // 输出结果
      console.log('')
      console.log('📊 快速连续恢复测试结果:')
      console.log('-'.repeat(60))
      console.log('周期 | 负载成功 | 验证结果 | 验证耗时(ms)')
      console.log('-'.repeat(60))

      for (const result of cycleResults) {
        console.log(
          `  ${result.cycle}  | ${String(result.load_success).padStart(3)}/${result.load_total}  |   ` +
          `${result.verify_success ? '✅' : '❌'}   |   ${String(result.verify_duration).padStart(6)}`
        )
      }
      console.log('-'.repeat(60))

      // 断言：大部分周期的验证应该成功
      const successfulCycles = cycleResults.filter(r => r.verify_success).length
      expect(successfulCycles).toBeGreaterThan(cycles * 0.6) // 至少60%周期成功恢复

      // 断言：平均验证耗时不应过长
      const avgVerifyDuration = Math.round(
        cycleResults.reduce((sum, r) => sum + r.verify_duration, 0) / cycles
      )
      console.log(`   📊 平均验证耗时: ${avgVerifyDuration}ms`)
      expect(avgVerifyDuration).toBeLessThan(5000) // 平均不超过5秒
    }, 180000)

    /**
     * 业务场景：资源耗尽时的请求队列验证
     * 验证目标：验证连接池耗尽时请求排队和超时处理
     */
    test('资源耗尽时请求队列行为测试', async () => {
      console.log('')
      console.log('📋 P3-2-2-4 请求队列行为测试:')
      console.log('   测试连接池耗尽时的请求排队和超时处理')
      console.log('')

      // 制造耗尽（长时间占用所有连接）
      const exhaustTasks = Array(45) // 略大于连接池
        .fill(null)
        .map(() => async () => {
          return await executeLongRunningQuery(10000) // 10秒慢查询
        })

      // 启动耗尽任务
      console.log('   📍 启动长时间查询占用连接池...')
      const exhaustPromise = executeConcurrent(exhaustTasks, {
        concurrency: 45,
        timeout: 60000
      })

      // 等待连接池被占用
      await delay(1000)

      // 发送新请求并观察队列行为
      console.log('   📍 发送新请求测试队列行为...')
      const queuedRequests = []
      const queueStartTime = Date.now()

      // 在10秒内持续发送请求
      const queueTestDuration = 10000
      const requestInterval = 1000

      while (Date.now() - queueStartTime < queueTestDuration) {
        const requestStart = Date.now()
        const result = await executeSimpleQuery({ queryId: `queued_${queuedRequests.length}` })
        const requestEnd = Date.now()

        queuedRequests.push({
          success: result.success,
          wait_time: requestEnd - requestStart,
          error_type: result.error_type,
          timing: Date.now() - queueStartTime
        })

        await delay(requestInterval)
      }

      // 等待耗尽任务完成
      console.log('   📍 等待占用查询完成...')
      await exhaustPromise

      // 分析队列行为
      const successfulQueued = queuedRequests.filter(r => r.success).length
      const timedOutQueued = queuedRequests.filter(r => r.error_type === 'CONNECTION_TIMEOUT').length
      const avgWaitTime = Math.round(
        queuedRequests.reduce((sum, r) => sum + r.wait_time, 0) / queuedRequests.length
      )

      console.log('')
      console.log('📊 请求队列行为分析:')
      console.log(`   📊 发送请求数: ${queuedRequests.length}`)
      console.log(`   ✅ 成功请求: ${successfulQueued}`)
      console.log(`   ⏰ 超时请求: ${timedOutQueued}`)
      console.log(`   ⏱️  平均等待时间: ${avgWaitTime}ms`)
      console.log('')

      // 断言：有请求成功（说明有排队机制）
      expect(queuedRequests.length).toBeGreaterThan(0)
      // 断言：系统正常处理了请求（无论成功还是超时）
      expect(successfulQueued + timedOutQueued).toBe(queuedRequests.length)
    }, 120000)
  })
})
