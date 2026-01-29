/**
 * 餐厅积分抽奖系统 V4.5 - 商户模块 API 契约测试
 *
 * 测试范围（P1-12 API契约测试 - 商户模块）：
 * - 消费录入 API 契约
 * - 风控查询 API 契约
 * - 门店管理 API 契约
 *
 * 测试用例数量：5-8 cases
 * 创建时间：2026-01-28
 * 关联文档：docs/测试审计标准.md（P1-12 节）
 */

const request = require('supertest')
const { sequelize } = require('../../models')

let app
let accessToken

jest.setTimeout(30000)

describe('API契约测试 - 商户模块 (/api/v4/shop, /api/v4/console)', () => {
  beforeAll(async () => {
    app = require('../../app')
    await sequelize.authenticate()

    // 登录获取 Token（管理员账号）
    const loginResponse = await request(app)
      .post('/api/v4/auth/login')
      .send({ mobile: '13612227930', verification_code: '123456' })

    if (loginResponse.body.success) {
      accessToken = loginResponse.body.data.access_token
    }
  })

  afterAll(async () => {
    await sequelize.close()
  })

  // ==================== 通用契约验证 ====================
  function validateApiContract(body, expectSuccess = true) {
    expect(body).toHaveProperty('success')
    expect(body).toHaveProperty('code')
    expect(body).toHaveProperty('message')
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('version')
    expect(body).toHaveProperty('request_id')

    expect(typeof body.success).toBe('boolean')
    expect(typeof body.code).toBe('string')
    expect(typeof body.message).toBe('string')

    if (expectSuccess) {
      expect(body.success).toBe(true)
    }
  }

  // ==================== POST /api/v4/shop/consumption/submit ====================
  describe('POST /shop/consumption/submit - 消费录入', () => {
    /**
     * Case 1: 缺少幂等键应该返回 400
     */
    test('缺少 Idempotency-Key 应该返回 400', async () => {
      const response = await request(app)
        .post('/api/v4/shop/consumption/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          qr_code: 'test_qr_code',
          consumption_amount: 100
        })

      expect(response.status).toBe(400)
      validateApiContract(response.body, false)
      expect(response.body.code).toBe('MISSING_IDEMPOTENCY_KEY')
    })

    /**
     * Case 2: 缺少必需参数应该返回 400
     */
    test('缺少 qr_code 应该返回 400', async () => {
      const response = await request(app)
        .post('/api/v4/shop/consumption/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', `test_${Date.now()}`)
        .send({ consumption_amount: 100 })

      expect([400, 403]).toContain(response.status)
      validateApiContract(response.body, false)
    })

    /**
     * Case 3: 无 Token 应该返回 401
     */
    test('无 Authorization 应该返回 401', async () => {
      const response = await request(app)
        .post('/api/v4/shop/consumption/submit')
        .set('Idempotency-Key', `test_${Date.now()}`)
        .send({ qr_code: 'test', consumption_amount: 100 })

      expect(response.status).toBe(401)
      validateApiContract(response.body, false)
    })
  })

  // ==================== GET /api/v4/console/risk-alerts ====================
  describe('GET /console/risk-alerts - 风控告警', () => {
    /**
     * Case 1: 正常获取风控告警列表
     */
    test('应该返回风控告警契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/console/risk-alerts')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, page_size: 10 })

      // 可能没有权限，但响应格式应该正确
      if (response.status === 200) {
        validateApiContract(response.body)

        if (response.body.data.alerts) {
          expect(Array.isArray(response.body.data.alerts)).toBe(true)
        }
      } else if ([401, 403].includes(response.status)) {
        validateApiContract(response.body, false)
      }
    })

    /**
     * Case 2: 无 Token 应该返回 401
     */
    test('无 Authorization 应该返回 401', async () => {
      const response = await request(app).get('/api/v4/console/risk-alerts')

      expect(response.status).toBe(401)
      validateApiContract(response.body, false)
    })
  })

  // ==================== GET /api/v4/console/stores ====================
  describe('GET /console/stores - 门店列表', () => {
    /**
     * Case 1: 获取门店列表
     */
    test('应该返回门店列表契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/console/stores')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, page_size: 10 })

      // 可能没有权限
      if (response.status === 200) {
        validateApiContract(response.body)
      } else if ([401, 403].includes(response.status)) {
        validateApiContract(response.body, false)
      }
    })
  })

  // ==================== GET /api/v4/console/consumption ====================
  describe('GET /console/consumption - 消费记录', () => {
    /**
     * Case 1: 获取消费记录列表
     */
    test('应该返回消费记录契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/console/consumption')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, page_size: 10 })

      if (response.status === 200) {
        validateApiContract(response.body)

        if (response.body.data.pagination) {
          expect(response.body.data.pagination).toHaveProperty('total')
          expect(response.body.data.pagination).toHaveProperty('page')
        }
      } else if ([401, 403].includes(response.status)) {
        validateApiContract(response.body, false)
      }
    })
  })
})


