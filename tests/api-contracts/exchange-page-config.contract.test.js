/**
 * 兑换页面配置 API 契约测试
 *
 * 测试范围：
 * - GET /api/v4/system/config/exchange-page（公开读取 - 仅契约格式，详测见 tests/business/system/）
 * - GET /api/v4/console/system/exchange-page-config（管理后台读取）
 * - PUT /api/v4/console/system/exchange-page-config（管理后台更新）
 *
 * @date 2026-02-19
 * @see docs/exchange-config-implementation.md
 */

const request = require('supertest')
const { sequelize } = require('../../models')

let app
let accessToken

jest.setTimeout(30000)

describe('API契约测试 - 兑换页面配置', () => {
  beforeAll(async () => {
    app = require('../../app')
    await sequelize.authenticate()

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

  // ==================== 公开读取接口（契约格式验证，数据结构详测见 tests/business/system/） ====================
  describe('GET /api/v4/system/config/exchange-page - 公开读取配置（契约）', () => {
    test('应返回标准 ApiResponse 契约格式', async () => {
      const response = await request(app).get('/api/v4/system/config/exchange-page')

      expect(response.status).toBe(200)
      validateApiContract(response.body)

      const { data } = response.body
      expect(data).toHaveProperty('tabs')
      expect(data).toHaveProperty('shop_filters')
      expect(data).toHaveProperty('card_display')
      expect(data).toHaveProperty('version')
    })
  })

  // ==================== 管理后台读取接口 ====================
  describe('GET /api/v4/console/system/exchange-page-config - 管理后台读取', () => {
    test('未鉴权应返回 401', async () => {
      const response = await request(app).get('/api/v4/console/system/exchange-page-config')

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
    })

    test('鉴权后应返回完整配置', async () => {
      if (!accessToken) return

      const response = await request(app)
        .get('/api/v4/console/system/exchange-page-config')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(response.status).toBe(200)
      validateApiContract(response.body)
      expect(response.body.data).toHaveProperty('tabs')
      expect(response.body.data).toHaveProperty('card_display')
    })
  })

  // ==================== 管理后台更新接口 ====================
  describe('PUT /api/v4/console/system/exchange-page-config - 管理后台更新', () => {
    test('未鉴权应返回 401', async () => {
      const response = await request(app)
        .put('/api/v4/console/system/exchange-page-config')
        .send({})

      expect(response.status).toBe(401)
    })

    test('无效配置应返回 400 校验错误', async () => {
      if (!accessToken) return

      const response = await request(app)
        .put('/api/v4/console/system/exchange-page-config')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Content-Type', 'application/json')
        .send({ tabs: 'not_array' })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('INVALID_EXCHANGE_PAGE_CONFIG')
      expect(response.body.data).toHaveProperty('errors')
    })

    test('有效配置应保存成功', async () => {
      if (!accessToken) return

      const getResponse = await request(app)
        .get('/api/v4/console/system/exchange-page-config')
        .set('Authorization', `Bearer ${accessToken}`)

      const currentConfig = getResponse.body.data
      delete currentConfig.version
      delete currentConfig.updated_at

      const response = await request(app)
        .put('/api/v4/console/system/exchange-page-config')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Content-Type', 'application/json')
        .send(currentConfig)

      expect(response.status).toBe(200)
      validateApiContract(response.body)
      expect(response.body.code).toBe('EXCHANGE_PAGE_CONFIG_UPDATE_SUCCESS')
    })
  })
})
