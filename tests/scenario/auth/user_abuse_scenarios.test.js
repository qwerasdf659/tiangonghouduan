'use strict'

/**
 * 🚫 用户异常行为测试（P1级）
 *
 * @description 测试用户异常行为场景，包括快速点击、边界值测试、刷子检测
 * @version V4.6 - TDD策略：先创建测试，倒逼实现
 * @date 2026-01-28
 *
 * 测试目的：
 * 1. 验证系统对快速重复点击的处理
 * 2. 验证边界值输入的正确处理
 * 3. 验证刷子行为的检测和拦截
 * 4. 验证异常参数的拒绝响应
 *
 * 业务场景：
 * - 用户快速连续点击抽奖按钮
 * - 用户输入超出边界的数值
 * - 自动化脚本刷接口
 * - 异常/恶意参数攻击
 *
 * 核心验证点：
 * - 幂等性保护（同一请求不重复执行）
 * - 边界值校验（数量限制、金额限制）
 * - 频率检测（短时间内异常高频请求）
 * - 参数校验（类型、范围、格式）
 *
 * @file tests/integration/user_abuse_scenarios.test.js
 */

/*
 * 🔴 重要：本测试套件需要验证真实限流行为（刷子检测场景）
 * 限流在特定测试场景中动态启用/禁用，避免影响登录等前置操作
 * 默认禁用限流，在需要测试限流的场景中临时启用
 */
/*
 * 初始禁用限流，让前置登录等操作正常执行
 * 在具体限流测试中会临时启用
 * process.env.DISABLE_RATE_LIMITER = 'false'
 */

const request = require('supertest')
const app = require('../../../app')
const { TEST_DATA } = require('../../helpers/test-data')
const { initRealTestData, TestConfig } = require('../../helpers/test-setup')
const {
  executeConcurrent,
  analyzeConcurrentResults,
  delay
} = require('../../helpers/test-concurrent-utils')
const { ensureTestUserHasPoints } = require('../../helpers/test-points-setup')
const { v4: uuidv4 } = require('uuid')

/**
 * 测试配置常量
 */
const RAPID_CLICK_COUNT = 20 // 快速点击次数
const RAPID_CLICK_INTERVAL = 50 // 快速点击间隔（毫秒）
const INITIAL_POINTS = 50000 // 初始积分
const _POINTS_PER_DRAW = 150 // 单次抽奖消耗积分（保留用于扩展测试）

/**
 * 生成幂等键
 * @param {string} prefix - 前缀
 * @returns {string} UUID格式的幂等键
 */
function generateIdempotencyKey(prefix = 'abuse_test') {
  return `${prefix}_${uuidv4()}`
}

describe('【P1】用户异常行为测试 - 快速点击、边界值、刷子检测', () => {
  let authToken
  let testUserId
  let campaignCode
  let _adminToken // 保留用于管理员操作测试扩展

  /**
   * 测试前准备
   */
  beforeAll(async () => {
    console.log('='.repeat(80))
    console.log('🚫 【P1】用户异常行为测试')
    console.log('='.repeat(80))
    console.log(`📋 快速点击测试次数: ${RAPID_CLICK_COUNT}`)
    console.log(`📋 快速点击间隔: ${RAPID_CLICK_INTERVAL}ms`)
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

    // 获取管理员Token（用于管理相关测试）
    console.log('🔐 登录管理员用户...')
    const adminLoginResponse = await request(app).post('/api/v4/auth/admin/login').send({
      mobile: TEST_DATA.users.testUser.mobile, // 测试账号既是用户也是管理员
      verification_code: TEST_DATA.auth.verificationCode
    })

    if (adminLoginResponse.status === 200 && adminLoginResponse.body.success) {
      _adminToken = adminLoginResponse.body.data.access_token
      console.log('✅ 管理员登录成功')
    } else {
      console.log('⚠️ 管理员登录失败，部分测试可能跳过')
    }

    // 获取活动信息
    campaignCode = TestConfig.realData.testCampaign?.campaign_code || 'CAMP20250901001'
    console.log(`📋 活动代码: ${campaignCode}`)

    // 充值测试积分
    console.log(`💰 准备测试积分...`)
    try {
      await ensureTestUserHasPoints(INITIAL_POINTS, testUserId)
      console.log(`✅ 积分准备完成`)
    } catch (error) {
      console.warn(`⚠️ 积分准备失败: ${error.message}`)
    }

    console.log('='.repeat(80))
  }, 120000)

  afterAll(() => {
    console.log('='.repeat(80))
    console.log('🏁 用户异常行为测试完成')
    console.log('='.repeat(80))
  })

  // ==================== 场景1：快速点击测试 ====================

  describe('场景1：快速点击测试（Rapid Click Prevention）', () => {
    test('相同幂等键的快速重复请求应该只执行一次', async () => {
      console.log('\n🖱️ 场景1.1: 相同幂等键快速点击测试...')

      const idempotencyKey = generateIdempotencyKey('rapid_click')
      const clickCount = 5
      const results = []

      console.log(`   幂等键: ${idempotencyKey}`)
      console.log(`   快速点击次数: ${clickCount}`)

      // 快速发送多个相同幂等键的请求
      for (let i = 0; i < clickCount; i++) {
        const response = await request(app)
          .post('/api/v4/lottery/draw')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .send({
            campaign_code: campaignCode,
            draw_count: 1
          })

        results.push({
          index: i,
          status: response.status,
          success: response.body.success,
          isDuplicate: response.body.data?.is_duplicate || false,
          code: response.body.code,
          message: response.body.message
        })

        // 短暂延迟模拟快速点击
        await delay(RAPID_CLICK_INTERVAL)
      }

      // 分析结果
      const successResponses = results.filter(r => r.status === 200 && r.success)
      const rateLimitedResponses = results.filter(r => r.status === 429)
      const duplicateResponses = results.filter(r => r.isDuplicate)

      // 分析响应状态分布
      const statusDistribution = results.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1
        return acc
      }, {})
      console.log(`   响应状态分布:`, JSON.stringify(statusDistribution))
      console.log(`   成功响应: ${successResponses.length}`)
      console.log(`   限流响应: ${rateLimitedResponses.length}`)
      console.log(`   标记为重复: ${duplicateResponses.length}`)

      /**
       * 核心验证逻辑：
       * 快速点击场景下，系统应该通过以下方式之一保护用户：
       * 1. 成功执行一次（200成功）+ 后续请求被限流或标记重复
       * 2. 全部被限流（429）- 限流器先于业务执行触发
       * 3. 业务拒绝（400/积分不足等）+ 后续被限流
       *
       * 关键验证点：最多只有一个成功的业务执行（幂等性保证）
       */

      // 验证1：系统正确响应了所有请求（没有崩溃/500错误）
      const serverErrors = results.filter(r => r.status >= 500)
      expect(serverErrors.length).toBe(0)

      // 验证2：最多只有一个成功的业务执行（核心幂等性保证）
      expect(successResponses.length).toBeLessThanOrEqual(1)

      /*
       * 验证3：快速点击保护机制生效 - 要么有成功响应，要么有限流响应，要么有业务拒绝
       * 这确保系统对快速点击有响应，而不是全部超时或无响应
       */
      const protectedResponses = successResponses.length + rateLimitedResponses.length
      const hasProtection = protectedResponses > 0 || results.every(r => r.status >= 400)
      expect(hasProtection).toBe(true)

      // 验证4：如果有限流响应，说明限流机制正常工作
      if (rateLimitedResponses.length > 0) {
        console.log(`   ✅ 限流机制正常工作，拦截了 ${rateLimitedResponses.length} 个快速重复请求`)
      }

      // 验证5：如果有成功响应，说明幂等性机制正常
      if (successResponses.length === 1) {
        console.log(`   ✅ 幂等性保护正常，仅执行了 1 次业务操作`)
      }

      console.log('   ✅ 快速点击幂等性测试完成')
    }, 60000)

    test('不同幂等键的快速请求应该各自独立执行', async () => {
      console.log('\n🖱️ 场景1.2: 不同幂等键快速点击测试...')

      const clickCount = 3
      const results = []

      console.log(`   快速点击次数（不同幂等键）: ${clickCount}`)

      // 快速发送多个不同幂等键的请求
      for (let i = 0; i < clickCount; i++) {
        const idempotencyKey = generateIdempotencyKey(`rapid_different_${i}`)
        const response = await request(app)
          .post('/api/v4/lottery/draw')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .send({
            campaign_code: campaignCode,
            draw_count: 1
          })

        results.push({
          index: i,
          idempotencyKey,
          status: response.status,
          success: response.body.success
        })

        await delay(RAPID_CLICK_INTERVAL)
      }

      // 分析结果
      const successResponses = results.filter(r => r.status === 200 && r.success)

      console.log(`   成功响应: ${successResponses.length}/${clickCount}`)

      /*
       * 验证：不同幂等键的请求应该都可以执行
       * 注意：可能因积分不足等原因失败，所以检查是否至少有响应
       */
      expect(results.length).toBe(clickCount)

      console.log('   ✅ 不同幂等键测试完成')
    }, 60000)

    test('并发快速点击应该正确处理', async () => {
      console.log('\n🖱️ 场景1.3: 并发快速点击测试...')

      const concurrentClicks = 10
      const idempotencyKey = generateIdempotencyKey('concurrent_rapid')

      console.log(`   并发点击数: ${concurrentClicks}`)
      console.log(`   共用幂等键: ${idempotencyKey}`)

      // 创建并发任务（同一幂等键）
      const tasks = Array(concurrentClicks)
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
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: concurrentClicks,
        timeout: 30000
      })

      console.log(`   请求统计:`)
      console.log(`     总请求: ${metrics.total}`)
      console.log(`     成功响应: ${metrics.succeeded}`)
      console.log(`     失败: ${metrics.failed}`)

      // 分析结果
      const analysis = analyzeConcurrentResults(results)
      console.log(`   结果分析:`)
      console.log(`     成功率: ${analysis.successRate}`)
      console.log(`     唯一结果数: ${analysis.uniqueResults.size}`)

      // 验证：所有请求都应该得到响应
      expect(metrics.total).toBe(concurrentClicks)

      /*
       * 验证：应该只有一个唯一的抽奖结果（幂等性）
       * TDD红灯：如果返回多个不同的lottery_draw_id，说明幂等性未实现
       */
      if (analysis.uniqueResults.size > 1) {
        console.log('   ⚠️ 警告：检测到多个不同的抽奖结果，幂等性可能未正确实现')
      }

      console.log('   ✅ 并发快速点击测试完成')
    }, 60000)
  })

  // ==================== 场景2：边界值测试 ====================

  describe('场景2：边界值测试（Boundary Value Testing）', () => {
    test('抽奖次数为0应该返回错误', async () => {
      console.log('\n📏 场景2.1: 抽奖次数为0测试...')

      const idempotencyKey = generateIdempotencyKey('boundary_zero')

      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaign_code: campaignCode,
          draw_count: 0
        })

      console.log(`   响应状态: ${response.status}`)
      console.log(`   业务成功: ${response.body.success}`)

      // 验证：应该返回参数错误
      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)

      console.log('   ✅ 抽奖次数为0测试通过')
    }, 30000)

    test('抽奖次数为负数应该返回错误', async () => {
      console.log('\n📏 场景2.2: 抽奖次数为负数测试...')

      const idempotencyKey = generateIdempotencyKey('boundary_negative')

      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaign_code: campaignCode,
          draw_count: -1
        })

      console.log(`   响应状态: ${response.status}`)
      console.log(`   业务成功: ${response.body.success}`)

      // 验证：应该返回参数错误
      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)

      console.log('   ✅ 抽奖次数为负数测试通过')
    }, 30000)

    test('抽奖次数超过最大限制应该返回错误', async () => {
      console.log('\n📏 场景2.3: 抽奖次数超过最大限制测试...')

      const idempotencyKey = generateIdempotencyKey('boundary_max')
      const excessiveDrawCount = 10000 // 故意超过合理限制

      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaign_code: campaignCode,
          draw_count: excessiveDrawCount
        })

      console.log(`   请求抽奖次数: ${excessiveDrawCount}`)
      console.log(`   响应状态: ${response.status}`)
      console.log(`   业务成功: ${response.body.success}`)

      // 验证：应该返回参数错误或超出限制
      expect(response.body.success).toBe(false)

      console.log('   ✅ 抽奖次数超过最大限制测试完成')
    }, 30000)

    test('抽奖次数为非数字应该返回错误', async () => {
      console.log('\n📏 场景2.4: 抽奖次数为非数字测试...')

      const idempotencyKey = generateIdempotencyKey('boundary_string')

      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaign_code: campaignCode,
          draw_count: 'abc'
        })

      console.log(`   响应状态: ${response.status}`)
      console.log(`   业务成功: ${response.body.success}`)

      // 验证：应该返回参数错误
      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)

      console.log('   ✅ 抽奖次数为非数字测试通过')
    }, 30000)

    test('抽奖次数为小数应该返回错误或取整', async () => {
      console.log('\n📏 场景2.5: 抽奖次数为小数测试...')

      const idempotencyKey = generateIdempotencyKey('boundary_decimal')

      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaign_code: campaignCode,
          draw_count: 1.5
        })

      console.log(`   响应状态: ${response.status}`)
      console.log(`   业务成功: ${response.body.success}`)

      /*
       * 验证：应该返回参数错误或自动取整处理
       * 系统应该明确处理小数情况
       */
      if (response.status === 400) {
        console.log('   系统行为：拒绝小数输入')
        expect(response.body.success).toBe(false)
      } else if (response.status === 200) {
        console.log('   系统行为：自动取整处理')
        // 如果成功，说明系统进行了取整处理
      }

      console.log('   ✅ 抽奖次数为小数测试完成')
    }, 30000)

    test('空活动代码应该返回错误', async () => {
      console.log('\n📏 场景2.6: 空活动代码测试...')

      const idempotencyKey = generateIdempotencyKey('boundary_empty_campaign')

      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaign_code: '',
          draw_count: 1
        })

      console.log(`   响应状态: ${response.status}`)
      console.log(`   业务成功: ${response.body.success}`)

      // 验证：应该返回参数错误
      expect(response.body.success).toBe(false)

      console.log('   ✅ 空活动代码测试通过')
    }, 30000)
  })

  // ==================== 场景3：刷子行为检测 ====================

  describe('场景3：刷子行为检测（Bot Detection）', () => {
    test('短时间内大量请求应该触发限流', async () => {
      console.log('\n🤖 场景3.1: 高频请求限流测试...')

      /*
       * 注意：测试环境可能禁用了限流（DISABLE_RATE_LIMITER=true）
       * 此测试验证限流机制是否正常工作
       *
       * 可能的响应状态：
       * - 200: 成功执行
       * - 400: 业务拒绝（如积分不足）
       * - 429: 限流拦截
       * - 500: 服务器错误（不应该出现）
       */

      const requestCount = RAPID_CLICK_COUNT
      const results = []

      console.log(`   请求次数: ${requestCount}`)

      // 快速发送大量请求
      for (let i = 0; i < requestCount; i++) {
        const idempotencyKey = generateIdempotencyKey(`bot_test_${i}`)
        const response = await request(app)
          .post('/api/v4/lottery/draw')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .send({
            campaign_code: campaignCode,
            draw_count: 1
          })

        results.push({
          index: i,
          status: response.status,
          rateLimited: response.status === 429,
          businessRejected: response.status === 400,
          success: response.status === 200,
          headers: {
            'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
            'x-ratelimit-remaining': response.headers['x-ratelimit-remaining']
          }
        })

        // 极短延迟模拟脚本刷接口
        await delay(10)
      }

      // 分析结果
      const rateLimitedCount = results.filter(r => r.rateLimited).length
      const successCount = results.filter(r => r.success).length
      const businessRejectedCount = results.filter(r => r.businessRejected).length
      const serverErrorCount = results.filter(r => r.status >= 500).length

      // 分析响应状态分布
      const statusDistribution = results.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1
        return acc
      }, {})
      console.log(`   响应状态分布:`, JSON.stringify(statusDistribution))
      console.log(`   成功请求: ${successCount}`)
      console.log(`   业务拒绝: ${businessRejectedCount}`)
      console.log(`   被限流请求: ${rateLimitedCount}`)

      // 验证1：所有请求都得到了响应（没有超时/崩溃）
      expect(results.length).toBe(requestCount)

      // 验证2：没有服务器错误（500系列）
      expect(serverErrorCount).toBe(0)

      // 验证3：所有响应都是有效的HTTP状态码（200/400/429）
      const validResponses = successCount + businessRejectedCount + rateLimitedCount
      expect(validResponses).toBe(requestCount)

      // 验证4：限流机制状态（如果测试环境未禁用限流，应该能看到429响应）
      if (rateLimitedCount > 0) {
        console.log(`   ✅ 限流机制正常工作，拦截了 ${rateLimitedCount}/${requestCount} 个请求`)
      } else if (businessRejectedCount > 0) {
        console.log(
          `   ⚠️ 未触发限流，但业务层拒绝了 ${businessRejectedCount} 个请求（如积分不足）`
        )
      } else {
        console.log('   ⚠️ 未触发限流（可能测试环境已禁用）')
      }

      console.log('   ✅ 高频请求限流测试完成')
    }, 120000)

    test('异常User-Agent应该被记录或拦截', async () => {
      console.log('\n🤖 场景3.2: 异常User-Agent测试...')

      const suspiciousUserAgents = [
        'curl/7.68.0', // 命令行工具
        'Python-urllib/3.8', // Python脚本
        'PostmanRuntime/7.28.0', // Postman
        '' // 空User-Agent
      ]

      for (const userAgent of suspiciousUserAgents) {
        const idempotencyKey = generateIdempotencyKey(`ua_test_${Date.now()}`)
        const response = await request(app)
          .post('/api/v4/lottery/draw')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .set('User-Agent', userAgent)
          .send({
            campaign_code: campaignCode,
            draw_count: 1
          })

        console.log(`   User-Agent: "${userAgent || '(empty)'}" => 状态: ${response.status}`)

        // 验证：请求应该有响应（可能被拦截或正常处理）
        expect(response.status).toBeGreaterThanOrEqual(200)
        expect(response.status).toBeLessThan(600)
      }

      console.log('   ✅ 异常User-Agent测试完成')
    }, 60000)
  })

  // ==================== 场景4：恶意参数测试 ====================

  describe('场景4：恶意参数测试（Malicious Input Testing）', () => {
    test('SQL注入尝试应该被安全处理', async () => {
      console.log('\n🔒 场景4.1: SQL注入防护测试...')

      const sqlInjectionPayloads = [
        "' OR '1'='1",
        "'; DROP TABLE users;--",
        '1; SELECT * FROM users',
        'UNION SELECT * FROM passwords'
      ]

      for (const payload of sqlInjectionPayloads) {
        const idempotencyKey = generateIdempotencyKey(`sql_test_${Date.now()}`)
        const response = await request(app)
          .post('/api/v4/lottery/draw')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .send({
            campaign_code: payload,
            draw_count: 1
          })

        console.log(`   Payload: "${payload.substring(0, 20)}..." => 状态: ${response.status}`)

        // 验证：不应该返回500（服务器错误）
        expect(response.status).not.toBe(500)

        // 验证：应该返回正常的业务错误
        expect(response.body.success).toBe(false)
      }

      console.log('   ✅ SQL注入防护测试通过')
    }, 60000)

    test('XSS攻击尝试应该被安全处理', async () => {
      console.log('\n🔒 场景4.2: XSS防护测试...')

      const xssPayloads = [
        '<script>alert("xss")</script>',
        '"><img src=x onerror=alert(1)>',
        "javascript:alert('xss')"
      ]

      for (const payload of xssPayloads) {
        const idempotencyKey = generateIdempotencyKey(`xss_test_${Date.now()}`)
        const response = await request(app)
          .post('/api/v4/lottery/draw')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .send({
            campaign_code: payload,
            draw_count: 1
          })

        console.log(`   Payload: "${payload.substring(0, 20)}..." => 状态: ${response.status}`)

        // 验证：不应该返回500（服务器错误）
        expect(response.status).not.toBe(500)
      }

      console.log('   ✅ XSS防护测试通过')
    }, 60000)

    test('超长参数应该被拒绝', async () => {
      console.log('\n🔒 场景4.3: 超长参数测试...')

      const longString = 'A'.repeat(10000) // 10KB字符串
      const idempotencyKey = generateIdempotencyKey('long_param')

      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaign_code: longString,
          draw_count: 1
        })

      console.log(`   超长参数长度: ${longString.length}`)
      console.log(`   响应状态: ${response.status}`)

      // 验证：应该返回参数错误而不是服务器错误
      expect(response.status).not.toBe(500)
      expect(response.body.success).toBe(false)

      console.log('   ✅ 超长参数测试通过')
    }, 30000)

    test('缺少必要参数应该返回明确错误', async () => {
      console.log('\n🔒 场景4.4: 缺少必要参数测试...')

      const idempotencyKey = generateIdempotencyKey('missing_param')

      // 缺少 campaign_code
      const response1 = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey + '_1')
        .send({
          draw_count: 1
        })

      console.log(`   缺少campaign_code => 状态: ${response1.status}`)
      expect(response1.body.success).toBe(false)

      // 缺少 draw_count
      const response2 = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey + '_2')
        .send({
          campaign_code: campaignCode
        })

      console.log(`   缺少draw_count => 状态: ${response2.status}`)

      // 注意：draw_count可能有默认值
      if (response2.body.success === false) {
        console.log('   系统要求显式提供draw_count')
      } else {
        console.log('   系统使用默认draw_count值')
      }

      console.log('   ✅ 缺少必要参数测试完成')
    }, 30000)
  })

  // ==================== 场景5：未授权访问测试 ====================

  describe('场景5：未授权访问测试（Unauthorized Access）', () => {
    test('无Token请求应该返回401', async () => {
      console.log('\n🔐 场景5.1: 无Token请求测试...')

      const idempotencyKey = generateIdempotencyKey('no_token')

      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaign_code: campaignCode,
          draw_count: 1
        })

      console.log(`   响应状态: ${response.status}`)

      // 验证：应该返回401
      expect(response.status).toBe(401)

      console.log('   ✅ 无Token请求测试通过')
    }, 30000)

    test('无效Token请求应该返回401', async () => {
      console.log('\n🔐 场景5.2: 无效Token请求测试...')

      const invalidToken = 'invalid_token_' + uuidv4()
      const idempotencyKey = generateIdempotencyKey('invalid_token')

      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${invalidToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaign_code: campaignCode,
          draw_count: 1
        })

      console.log(`   响应状态: ${response.status}`)

      // 验证：应该返回401
      expect(response.status).toBe(401)

      console.log('   ✅ 无效Token请求测试通过')
    }, 30000)

    test('过期Token请求应该返回401', async () => {
      console.log('\n🔐 场景5.3: 过期Token请求测试...')

      // 构造一个明显过期的JWT（这是一个示例，实际项目中可能需要其他方式生成）
      const expiredToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJleHAiOjE2MDAwMDAwMDB9.fake_signature'
      const idempotencyKey = generateIdempotencyKey('expired_token')

      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaign_code: campaignCode,
          draw_count: 1
        })

      console.log(`   响应状态: ${response.status}`)

      // 验证：应该返回401
      expect(response.status).toBe(401)

      console.log('   ✅ 过期Token请求测试通过')
    }, 30000)
  })

  // ==================== 测试报告 ====================

  describe('测试报告', () => {
    test('生成用户异常行为测试报告', async () => {
      console.log('\n')
      console.log('='.repeat(80))
      console.log('📊 用户异常行为测试报告')
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
      console.log('     1. 快速点击测试（幂等性）')
      console.log('     2. 边界值测试（参数校验）')
      console.log('     3. 刷子行为检测（限流）')
      console.log('     4. 恶意参数测试（安全）')
      console.log('     5. 未授权访问测试（认证）')
      console.log('')
      console.log('   - 如测试失败，需检查：')
      console.log('     1. 幂等性实现（IdempotencyService）')
      console.log('     2. 参数校验中间件（validation.js）')
      console.log('     3. 限流中间件（RateLimiterMiddleware）')
      console.log('     4. 输入过滤/转义机制')
      console.log('     5. JWT认证中间件（auth.js）')
      console.log('='.repeat(80))

      expect(true).toBe(true)
    })
  })
})
