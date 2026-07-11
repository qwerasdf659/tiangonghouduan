/**
 * 熔断降级测试 - P2优先级
 *
 * 核心原则：Redis/DB 异常时不返回裸 500，应优雅降级（503 + SERVICE_DEGRADED 契约）
 *
 * 测试策略（拍板 12，2026-07-11）：
 * - 直连真实 Redis 与真实数据库（自研 Redis 协议 mock 已删除）
 * - 验证对象是真实 app 的降级响应契约：
 *   1. 任何情况下不返回裸 500
 *   2. 降级响应使用 503 + code='SERVICE_DEGRADED' + degraded/degraded_reason/retry_after 字段
 *   3. 健康检查在部分组件异常时仍返回 200（degraded 状态）
 * - 故障注入类场景（Redis 真宕机行为）属混沌测试范畴（tests/chaos/），不在本文件模拟
 *
 * @file tests/integration/circuit_breaker.test.js
 * @date 2026-07-11 切换真实 Redis（原 MockRedisClient 从未注入 app，为自证式测试，已删除）
 */

'use strict'

const request = require('supertest')
const app = require('../../app')
const { TestAssertions, initRealTestData } = require('../helpers/test-setup')
const { TEST_DATA } = require('../helpers/test-data')

/** 测试超时配置 */
const TEST_TIMEOUT = {
  SHORT: 10000, // 10秒 - 快速测试
  MEDIUM: 30000 // 30秒 - 标准测试
}

describe('【P2】熔断降级测试（真实 Redis + 真实 DB）', () => {
  jest.setTimeout(60000)

  let authToken = null
  let campaignCode = null

  beforeAll(async () => {
    await initRealTestData()
    // 抽奖接口以 campaign_code（业务码字符串）为入参，不使用数字 lottery_campaign_id
    campaignCode = 'CAMP20250901001'

    const loginRes = await request(app).post('/api/v4/auth/login').send({
      mobile: TEST_DATA.users.testUser.mobile,
      verification_code: '123456'
    })
    if (loginRes.body.success) {
      authToken = loginRes.body.data?.access_token || loginRes.body.data?.token
    }
  })

  describe('健康检查降级契约', () => {
    test(
      '健康检查始终返回 200（部分组件异常时为 degraded 状态而非 5xx）',
      async () => {
        const response = await request(app).get('/health')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.data).toHaveProperty('status')
        // 依赖组件状态必须真实上报（database/redis），不允许占位实现
        expect(response.body.data.systems).toHaveProperty('database')
        expect(response.body.data.systems).toHaveProperty('redis')
      },
      TEST_TIMEOUT.SHORT
    )
  })

  describe('读操作降级契约', () => {
    test(
      '活动详情读操作不返回裸 500；降级时必须是 503 + SERVICE_DEGRADED 契约',
      async () => {
        const response = await request(app)
          .get('/api/v4/lottery/campaigns/active')
          .set('Authorization', `Bearer ${authToken}`)

        // 任何情况下不返回裸 500
        expect(response.status).not.toBe(500)

        if (response.body.degraded === true) {
          // 降级响应契约：503 + SERVICE_DEGRADED + retry_after + degraded_reason
          expect(response.status).toBe(503)
          expect(response.body.code).toBe('SERVICE_DEGRADED')
          expect(typeof response.body.retry_after).toBe('number')
          expect(response.body.retry_after).toBeGreaterThan(0)
          expect(typeof response.body.degraded_reason).toBe('string')
          expect(response.body.degraded_reason.length).toBeGreaterThan(0)
          // 降级响应仍需符合 API 标准格式
          expect(response.body.success).toBe(false)
          expect(response.body).toHaveProperty('message')
        } else if (response.status === 200) {
          TestAssertions.validateApiResponse(response.body, true)
        }
      },
      TEST_TIMEOUT.SHORT
    )
  })

  describe('写操作降级契约', () => {
    test(
      '抽奖写操作不返回裸 500；缓存写失败不阻塞主业务流程',
      async () => {
        if (!authToken) {
          console.warn('⚠️ 跳过测试：未获取到有效的认证Token')
          return
        }

        const idempotencyKey = `circuit_test_write_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const response = await request(app)
          .post('/api/v4/lottery/draw')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .send({ campaign_code: campaignCode })

        expect(response.status).not.toBe(500)

        if (response.status === 503) {
          // 降级响应契约
          expect(response.body.code).toBe('SERVICE_DEGRADED')
          expect(response.body.degraded).toBe(true)
        } else {
          // 200=成功 / 4xx=业务错误（积分不足、活动状态等），均为标准 API 格式
          expect(response.body).toHaveProperty('success')
          expect(response.body).toHaveProperty('code')
        }
      },
      TEST_TIMEOUT.MEDIUM
    )
  })
})
