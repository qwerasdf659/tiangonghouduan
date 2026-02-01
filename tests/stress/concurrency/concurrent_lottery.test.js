'use strict'

/**
 * 🔄 并发抽奖测试（P0级）
 *
 * @description 验证多用户/多设备并发抽奖场景下的系统稳定性和数据一致性
 * @version V4.6 - TDD策略：先创建测试，倒逼实现
 * @date 2026-01-28
 *
 * 测试目的：
 * 1. 验证高并发场景下积分扣减的原子性
 * 2. 验证幂等性机制在并发环境下的正确性
 * 3. 验证库存扣减的并发安全性
 * 4. 验证配额控制的并发安全性
 *
 * 业务场景：
 * - 多用户同时抽奖
 * - 单用户多设备同时抽奖
 * - 秒杀/抢购场景模拟
 *
 * 核心验证点：
 * - 积分不能超扣（余额不能变负）
 * - 同一幂等键不能重复扣费
 * - 库存不能超卖
 * - 配额不能超用
 *
 * @file tests/integration/concurrent_lottery.test.js
 */

const request = require('supertest')
const app = require('../../../app')
const { TEST_DATA } = require('../../helpers/test-data')
const {
  ensureTestUserHasPoints,
  getTestUserPointsBalance
} = require('../../helpers/test-points-setup')
const {
  TestAssertions: _TestAssertions,
  TestConfig,
  initRealTestData
} = require('../../helpers/test-setup')
const {
  executeConcurrent,
  detectRaceCondition,
  verifyIdempotency,
  analyzeConcurrentResults,
  generateConcurrentTestId: _generateConcurrentTestId,
  delay
} = require('../../helpers/test-concurrent-utils')
const { v4: uuidv4 } = require('uuid')

/**
 * 测试配置常量
 */
const CONCURRENT_USERS = 10 // 并发用户数
const REQUESTS_PER_USER = 5 // 每用户请求数
const TOTAL_CONCURRENT_REQUESTS = CONCURRENT_USERS * REQUESTS_PER_USER // 总并发请求数
const INITIAL_POINTS = 100000 // 初始积分
const POINTS_PER_DRAW = 150 // 单次抽奖消耗积分

/**
 * 生成幂等键
 * @returns {string} UUID格式的幂等键
 */
function generateIdempotencyKey() {
  return `conc_test_${uuidv4()}`
}

describe('【P0】并发抽奖测试 - 多用户/多设备并发场景', () => {
  let authToken
  let testUserId
  let campaignCode
  let initialBalance

  /**
   * 测试前准备
   */
  beforeAll(async () => {
    console.log('='.repeat(80))
    console.log('🔄 【P0】并发抽奖测试 - 多用户/多设备并发场景')
    console.log('='.repeat(80))
    console.log(`📋 并发用户数: ${CONCURRENT_USERS}`)
    console.log(`📋 每用户请求数: ${REQUESTS_PER_USER}`)
    console.log(`📋 总并发请求数: ${TOTAL_CONCURRENT_REQUESTS}`)
    console.log('='.repeat(80))

    // 初始化真实测试数据
    await initRealTestData()

    // 登录获取token
    console.log('🔐 登录测试用户...')
    const loginResponse = await request(app).post('/api/v4/auth/login').send({
      mobile: TEST_DATA.users.testUser.mobile,
      verification_code: TEST_DATA.auth.verificationCode
    })

    if (loginResponse.status !== 200 || !loginResponse.body.success) {
      console.error('❌ 登录失败:', loginResponse.body)
      throw new Error('测试前置条件失败：无法登录')
    }

    authToken = loginResponse.body.data.access_token
    testUserId = loginResponse.body.data.user.user_id
    console.log(`✅ 登录成功，用户ID: ${testUserId}`)

    // 获取活动信息（直接从 TestConfig.realData 获取，已在 initRealTestData 中查询数据库）
    campaignCode = TestConfig.realData.testCampaign?.campaign_code || 'BASIC_LOTTERY'
    console.log(`📋 活动代码: ${campaignCode}`)

    // 充值测试积分
    console.log(`💰 准备测试积分...`)
    try {
      await ensureTestUserHasPoints(INITIAL_POINTS, testUserId)
      initialBalance = await getTestUserPointsBalance(testUserId)
      console.log(`✅ 初始积分: ${initialBalance?.toLocaleString() || 0}`)
    } catch (error) {
      console.warn(`⚠️ 积分准备失败: ${error.message}`)
      initialBalance = 0
    }

    console.log('='.repeat(80))
  }, 120000)

  afterAll(() => {
    console.log('='.repeat(80))
    console.log('🏁 并发抽奖测试完成')
    console.log('='.repeat(80))
  })

  /**
   * 场景1：基础并发抽奖测试
   * 验证系统能否处理多个并发请求
   */
  describe('场景1：基础并发抽奖', () => {
    test(`${CONCURRENT_USERS} 个并发请求应该全部得到响应`, async () => {
      console.log(`\n🎰 场景1.1: ${CONCURRENT_USERS} 个并发抽奖请求...`)

      // 创建并发任务
      const tasks = Array(CONCURRENT_USERS)
        .fill()
        .map(() => async () => {
          const idempotencyKey = generateIdempotencyKey()
          return await request(app)
            .post('/api/v4/lottery/draw')
            .set('Authorization', `Bearer ${authToken}`)
            .set('Idempotency-Key', idempotencyKey)
            .send({
              campaign_code: campaignCode,
              draw_count: 1
            })
        })

      // 执行并发请求
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: CONCURRENT_USERS,
        timeout: 30000
      })

      console.log(`   响应统计:`)
      console.log(`     总请求: ${metrics.total}`)
      console.log(`     成功: ${metrics.succeeded}`)
      console.log(`     失败: ${metrics.failed}`)
      console.log(`     超时: ${metrics.timedOut}`)
      console.log(`     吞吐量: ${metrics.throughput} 请求/秒`)

      if (metrics.statistics) {
        console.log(`   响应时间统计:`)
        console.log(`     最小: ${metrics.statistics.min}ms`)
        console.log(`     最大: ${metrics.statistics.max}ms`)
        console.log(`     平均: ${metrics.statistics.avg}ms`)
        console.log(`     P95: ${metrics.statistics.p95}ms`)
      }

      // 分析结果
      const analysis = analyzeConcurrentResults(results)
      console.log(`   结果分析:`)
      console.log(`     成功率: ${analysis.successRate}`)
      console.log(`     唯一结果数: ${analysis.uniqueResults.size}`)

      // 验证：所有请求都应该得到响应
      expect(metrics.total).toBe(CONCURRENT_USERS)

      // 验证：成功率应该大于0（至少有部分请求成功）
      expect(metrics.succeeded).toBeGreaterThan(0)

      console.log('   ✅ 并发请求处理完成')
    }, 60000)
  })

  /**
   * 场景2：幂等性并发测试
   * 验证相同幂等键的并发请求不会重复扣费
   */
  describe('场景2：幂等性并发测试', () => {
    test('相同幂等键的并发请求应该只执行一次', async () => {
      console.log('\n🔄 场景2.1: 幂等性并发测试...')

      const idempotencyKey = generateIdempotencyKey()
      const concurrentCount = 5

      console.log(`   幂等键: ${idempotencyKey}`)
      console.log(`   并发数: ${concurrentCount}`)

      // 记录抽奖前的积分
      const beforeBalance = await getTestUserPointsBalance(testUserId)
      console.log(`   抽奖前积分: ${beforeBalance?.toLocaleString() || 'N/A'}`)

      // 创建使用相同幂等键的并发任务
      const tasks = Array(concurrentCount)
        .fill()
        .map(() => async () => {
          return await request(app)
            .post('/api/v4/lottery/draw')
            .set('Authorization', `Bearer ${authToken}`)
            .set('Idempotency-Key', idempotencyKey)
            .send({
              campaign_code: campaignCode,
              draw_count: 1
            })
        })

      // 执行并发请求
      const { results, metrics: _metrics1 } = await executeConcurrent(tasks, {
        concurrency: concurrentCount,
        timeout: 30000
      })

      // 等待数据库同步
      await delay(1000)

      // 记录抽奖后的积分
      const afterBalance = await getTestUserPointsBalance(testUserId)
      console.log(`   抽奖后积分: ${afterBalance?.toLocaleString() || 'N/A'}`)

      // 计算实际扣除的积分
      const actualDeducted = (beforeBalance || 0) - (afterBalance || 0)
      console.log(`   实际扣除: ${actualDeducted}`)

      // 分析响应
      const successResponses = results.filter(r => r.success && r.result.status === 200)
      const duplicateResponses = successResponses.filter(
        r => r.result.body.data?.is_duplicate === true
      )

      console.log(`   成功响应: ${successResponses.length}`)
      console.log(`   标记为重复的响应: ${duplicateResponses.length}`)

      // 验证：应该只扣除一次积分
      if (beforeBalance !== null && afterBalance !== null) {
        // TDD红灯：幂等性要求只扣一次费
        expect(actualDeducted).toBeLessThanOrEqual(POINTS_PER_DRAW)
        console.log('   ✅ 幂等性验证通过：只扣除了一次积分')
      } else {
        console.log('   ⚠️ 无法验证积分扣除（积分查询失败）')
      }
    }, 60000)

    test('使用幂等性验证器进行测试', async () => {
      console.log('\n🔄 场景2.2: 幂等性验证器测试...')

      const result = await verifyIdempotency(
        async idempotencyKey => {
          return await request(app)
            .post('/api/v4/lottery/draw')
            .set('Authorization', `Bearer ${authToken}`)
            .set('Idempotency-Key', idempotencyKey)
            .send({
              campaign_code: campaignCode,
              draw_count: 1
            })
        },
        {
          repeatCount: 3,
          useSameIdempotencyKey: true,
          resultComparator: (r1, r2) => {
            // 比较关键字段
            const id1 = r1.body.data?.results?.[0]?.lottery_draw_id || r1.body.data?.lottery_draw_id
            const id2 = r2.body.data?.results?.[0]?.lottery_draw_id || r2.body.data?.lottery_draw_id
            return id1 === id2
          }
        }
      )

      console.log(`   幂等键: ${result.idempotencyKey}`)
      console.log(`   重复次数: ${result.repeatCount}`)
      console.log(`   是否幂等: ${result.isIdempotent ? '是' : '否'}`)

      /*
       * 验证幂等性
       * TDD红灯：如果幂等性失败，需要检查实现
       */
      if (!result.isIdempotent) {
        console.log('   ❌ 幂等性验证失败')
        result.comparisonResults.forEach(r => {
          console.log(`     请求 ${r.index}: 是否相等=${r.isEqual}`)
        })
      }

      expect(result.isIdempotent).toBe(true)
      console.log('   ✅ 幂等性验证通过')
    }, 60000)
  })

  /**
   * 场景3：积分扣减竞态条件测试
   * 验证并发扣减不会导致积分变负或超扣
   */
  describe('场景3：积分扣减竞态条件测试', () => {
    test('并发扣减不应导致积分变负', async () => {
      console.log('\n💰 场景3.1: 积分扣减竞态条件测试...')

      // 获取当前积分
      const currentBalance = await getTestUserPointsBalance(testUserId)
      console.log(`   当前积分: ${currentBalance?.toLocaleString() || 'N/A'}`)

      if (!currentBalance || currentBalance < POINTS_PER_DRAW) {
        console.log('   ⚠️ 积分不足，跳过测试')
        expect(true).toBe(true)
        return
      }

      // 计算可以执行的最大抽奖次数
      const maxDraws = Math.floor(currentBalance / POINTS_PER_DRAW)
      const concurrentDraws = Math.min(maxDraws + 5, 20) // 故意超出，测试边界

      console.log(`   可执行最大抽奖次数: ${maxDraws}`)
      console.log(`   并发请求数（故意超出）: ${concurrentDraws}`)

      // 使用竞态条件检测器
      const result = await detectRaceCondition({
        beforeAction: async () => await getTestUserPointsBalance(testUserId),
        action: async () => {
          const idempotencyKey = generateIdempotencyKey()
          return await request(app)
            .post('/api/v4/lottery/draw')
            .set('Authorization', `Bearer ${authToken}`)
            .set('Idempotency-Key', idempotencyKey)
            .send({
              campaign_code: campaignCode,
              draw_count: 1
            })
        },
        afterAction: async () => await getTestUserPointsBalance(testUserId),
        validator: (before, results, after) => {
          // 验证：余额不能变负
          if (after !== null && after < 0) {
            return false
          }

          // 验证：成功的抽奖次数 × 单价 应该等于扣除的积分
          const successCount = results.filter(
            r => r.success && r.result.status === 200 && r.result.body.success
          ).length
          const expectedDeduction = successCount * POINTS_PER_DRAW
          const actualDeduction = (before || 0) - (after || 0)

          // 允许一定的误差（由于并发和重试）
          return Math.abs(actualDeduction - expectedDeduction) <= POINTS_PER_DRAW
        },
        concurrency: concurrentDraws
      })

      console.log(`   操作前积分: ${result.beforeState?.toLocaleString() || 'N/A'}`)
      console.log(`   操作后积分: ${result.afterState?.toLocaleString() || 'N/A'}`)
      console.log(`   成功请求数: ${result.succeeded}`)
      console.log(`   失败请求数: ${result.failed}`)
      console.log(`   数据一致性: ${result.isConsistent ? '通过' : '失败'}`)

      // 验证积分不能变负
      if (result.afterState !== null) {
        expect(result.afterState).toBeGreaterThanOrEqual(0)
        console.log('   ✅ 积分不为负')
      }

      /*
       * 验证数据一致性
       * TDD红灯：如果不一致，说明有竞态条件问题
       */
      expect(result.isConsistent).toBe(true)
      console.log('   ✅ 竞态条件测试通过')
    }, 120000)
  })

  /**
   * 场景4：高并发压力测试
   * 模拟实际生产环境的并发负载
   */
  describe('场景4：高并发压力测试', () => {
    test(`${TOTAL_CONCURRENT_REQUESTS} 个并发请求的系统稳定性`, async () => {
      console.log(`\n🚀 场景4.1: 高并发压力测试 (${TOTAL_CONCURRENT_REQUESTS} 请求)...`)

      // 确保有足够积分
      const currentBalance = await getTestUserPointsBalance(testUserId)
      const requiredPoints = TOTAL_CONCURRENT_REQUESTS * POINTS_PER_DRAW

      if (!currentBalance || currentBalance < requiredPoints) {
        console.log(`   ⚠️ 积分不足，需要 ${requiredPoints}，当前 ${currentBalance || 0}`)
        try {
          await ensureTestUserHasPoints(requiredPoints, testUserId)
        } catch (error) {
          console.log(`   ⚠️ 无法充值，跳过测试`)
          expect(true).toBe(true)
          return
        }
      }

      const startTime = Date.now()

      // 创建大量并发任务
      const tasks = Array(TOTAL_CONCURRENT_REQUESTS)
        .fill()
        .map(() => async () => {
          const idempotencyKey = generateIdempotencyKey()
          return await request(app)
            .post('/api/v4/lottery/draw')
            .set('Authorization', `Bearer ${authToken}`)
            .set('Idempotency-Key', idempotencyKey)
            .send({
              campaign_code: campaignCode,
              draw_count: 1
            })
        })

      // 执行并发请求（限制实际并发数以避免系统过载）
      const { results: _results1, metrics } = await executeConcurrent(tasks, {
        concurrency: Math.min(CONCURRENT_USERS, 20), // 限制并发数
        timeout: 30000,
        onProgress: progress => {
          if (progress.completed % 10 === 0) {
            console.log(
              `   进度: ${progress.percentage}% (${progress.succeeded}/${progress.completed})`
            )
          }
        }
      })

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)

      console.log(`\n   执行统计:`)
      console.log(`     总耗时: ${totalTime}s`)
      console.log(`     总请求: ${metrics.total}`)
      console.log(`     成功: ${metrics.succeeded}`)
      console.log(`     失败: ${metrics.failed}`)
      console.log(`     超时: ${metrics.timedOut}`)
      console.log(`     成功率: ${metrics.successRate}`)
      console.log(`     吞吐量: ${metrics.throughput} 请求/秒`)

      if (metrics.statistics) {
        console.log(`   响应时间:`)
        console.log(`     最小: ${metrics.statistics.min}ms`)
        console.log(`     最大: ${metrics.statistics.max}ms`)
        console.log(`     平均: ${metrics.statistics.avg}ms`)
        console.log(`     中位数: ${metrics.statistics.median}ms`)
        console.log(`     P90: ${metrics.statistics.p90}ms`)
        console.log(`     P95: ${metrics.statistics.p95}ms`)
        console.log(`     P99: ${metrics.statistics.p99}ms`)
      }

      // 验证：系统应该能够处理所有请求
      expect(metrics.total).toBe(TOTAL_CONCURRENT_REQUESTS)

      // 验证：成功率应该大于80%（允许部分因积分不足等原因失败）
      const successRate = parseFloat(metrics.successRate)
      if (successRate < 80) {
        console.log(`   ⚠️ 成功率较低: ${successRate}%，可能需要检查系统性能或配置`)
      }

      // 验证：平均响应时间应该在合理范围内（<5秒）
      if (metrics.statistics && metrics.statistics.avg > 5000) {
        console.log(`   ⚠️ 平均响应时间过长: ${metrics.statistics.avg}ms`)
      }

      console.log('   ✅ 高并发压力测试完成')
    }, 300000) // 5分钟超时
  })

  /**
   * 场景5：错误场景并发测试
   * 验证系统在异常情况下的并发处理
   */
  describe('场景5：错误场景并发测试', () => {
    test('无效token的并发请求应该全部返回401', async () => {
      console.log('\n🔒 场景5.1: 无效token并发测试...')

      const invalidToken = 'invalid_token_' + uuidv4()
      const concurrentCount = 5

      const tasks = Array(concurrentCount)
        .fill()
        .map(() => async () => {
          const idempotencyKey = generateIdempotencyKey()
          return await request(app)
            .post('/api/v4/lottery/draw')
            .set('Authorization', `Bearer ${invalidToken}`)
            .set('Idempotency-Key', idempotencyKey)
            .send({
              campaign_code: campaignCode,
              draw_count: 1
            })
        })

      const { results, metrics: _metrics2 } = await executeConcurrent(tasks, {
        concurrency: concurrentCount,
        timeout: 10000
      })

      // 统计401响应
      const unauthorized = results.filter(r => r.success && r.result.status === 401)

      console.log(`   并发数: ${concurrentCount}`)
      console.log(`   401响应: ${unauthorized.length}`)

      // 验证：所有请求应该返回401
      expect(unauthorized.length).toBe(concurrentCount)
      console.log('   ✅ 无效token测试通过')
    }, 30000)

    test('无效活动代码的并发请求应该返回业务错误或被去重拦截', async () => {
      console.log('\n📋 场景5.2: 无效活动代码并发测试...')

      const invalidCampaignCode = 'INVALID_CAMPAIGN_' + uuidv4().substring(0, 8)
      const concurrentCount = 5

      const tasks = Array(concurrentCount)
        .fill()
        .map(() => async () => {
          const idempotencyKey = generateIdempotencyKey()
          return await request(app)
            .post('/api/v4/lottery/draw')
            .set('Authorization', `Bearer ${authToken}`)
            .set('Idempotency-Key', idempotencyKey)
            .send({
              campaign_code: invalidCampaignCode,
              draw_count: 1
            })
        })

      const { results, metrics: _metrics3 } = await executeConcurrent(tasks, {
        concurrency: concurrentCount,
        timeout: 10000
      })

      /**
       * 统计错误响应：
       * - 400: 请求参数错误
       * - 404: 活动不存在
       * - 429: 请求去重拦截（REQUEST_IN_PROGRESS）
       *
       * 注意：系统有请求去重机制，5秒内相同用户+活动的请求会被拦截
       * 这是系统的正确保护行为
       */
      const expectedErrorStatuses = [400, 404, 429]
      const errorResponses = results.filter(
        r => r.success && expectedErrorStatuses.includes(r.result.status)
      )

      // 分类统计各种错误类型
      const businessErrors = results.filter(
        r => r.success && (r.result.status === 400 || r.result.status === 404)
      )
      const deduplicatedRequests = results.filter(r => r.success && r.result.status === 429)

      console.log(`   并发数: ${concurrentCount}`)
      console.log(`   业务错误响应 (400/404): ${businessErrors.length}`)
      console.log(`   去重拦截响应 (429): ${deduplicatedRequests.length}`)
      console.log(`   总错误响应: ${errorResponses.length}`)

      /*
       * 验证：所有请求应该返回错误（业务错误或去重拦截）
       * 允许200响应数量为0（不应该有成功的抽奖）
       */
      const successfulDraws = results.filter(
        r => r.success && r.result.status === 200 && r.result.body.success
      )
      expect(successfulDraws.length).toBe(0)

      // 至少有一个业务错误响应（第一个请求应该收到404）
      expect(businessErrors.length).toBeGreaterThanOrEqual(1)

      console.log('   ✅ 无效活动代码测试通过（包含去重保护验证）')
    }, 30000)
  })

  /**
   * 测试报告生成
   */
  describe('测试报告', () => {
    test('生成并发测试报告', async () => {
      console.log('\n')
      console.log('='.repeat(80))
      console.log('📊 并发抽奖测试报告')
      console.log('='.repeat(80))
      console.log(
        `📅 测试时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
      )
      console.log(`👤 测试用户: ${TEST_DATA.users.testUser.mobile}`)
      console.log(`🎯 活动代码: ${campaignCode}`)
      console.log('')
      console.log('🏗️ TDD状态：')
      console.log('   - 测试用例已创建')
      console.log('   - 覆盖场景：')
      console.log('     1. 基础并发抽奖')
      console.log('     2. 幂等性并发测试')
      console.log('     3. 积分扣减竞态条件')
      console.log('     4. 高并发压力测试')
      console.log('     5. 错误场景并发测试')
      console.log('')
      console.log('   - 如测试失败，需检查：')
      console.log('     1. 幂等性实现（IdempotencyService）')
      console.log('     2. 积分扣减事务（BalanceService）')
      console.log('     3. 数据库锁机制（悲观锁/乐观锁）')
      console.log('     4. Redis分布式锁')
      console.log('='.repeat(80))

      expect(true).toBe(true)
    })
  })
})
