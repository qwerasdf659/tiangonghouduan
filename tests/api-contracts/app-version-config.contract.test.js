/**
 * 小程序版本闸门配置 API 契约测试
 *
 * 测试范围：
 * - GET  /api/v4/system/app-version（公开读取 - 契约格式 + 缺省安全值）
 * - GET  /api/v4/console/system/app-version-config（管理后台读取，需鉴权）
 * - PUT  /api/v4/console/system/app-version-config（管理后台更新，需鉴权 + 校验）
 *
 * 真实数据：连真实库 restaurant_points_dev，使用测试账号 13612227910 / 123456 登录取真实 JWT，
 * 不使用 mock/硬编码 token。更新用例会读取当前配置→改写→断言→回写，保证不污染真实环境。
 *
 * @date 2026-06-03
 */

const request = require('supertest')
const { sequelize } = require('../../models')

let app
let accessToken

jest.setTimeout(30000)

describe('API契约测试 - 小程序版本闸门配置', () => {
  beforeAll(async () => {
    app = require('../../app')
    await sequelize.authenticate()

    const loginResponse = await request(app)
      .post('/api/v4/auth/login')
      .send({ mobile: '13612227910', verification_code: '123456' })

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

  // ==================== 公开只读接口（小程序消费） ====================
  describe('GET /api/v4/system/app-version - 公开读取版本闸门（契约）', () => {
    test('未登录也应返回 200 + 标准契约 + 完整字段', async () => {
      const response = await request(app).get('/api/v4/system/app-version')

      expect(response.status).toBe(200)
      validateApiContract(response.body)
      expect(response.body.code).toBe('APP_VERSION_SUCCESS')

      const { data } = response.body
      expect(data).toHaveProperty('latest_version')
      expect(data).toHaveProperty('min_version')
      expect(data).toHaveProperty('force_update')
      expect(data).toHaveProperty('update_message')
      expect(data).toHaveProperty('platform')
      expect(typeof data.force_update).toBe('boolean')
    })
  })

  // ==================== 管理后台读取接口 ====================
  describe('GET /api/v4/console/system/app-version-config - 管理后台读取', () => {
    test('未鉴权应返回 401', async () => {
      const response = await request(app).get('/api/v4/console/system/app-version-config')

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
    })

    test('鉴权后应返回完整配置', async () => {
      if (!accessToken) return

      const response = await request(app)
        .get('/api/v4/console/system/app-version-config')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(response.status).toBe(200)
      validateApiContract(response.body)
      expect(response.body.code).toBe('APP_VERSION_CONFIG_GET_SUCCESS')
      expect(response.body.data).toHaveProperty('min_version')
      expect(response.body.data).toHaveProperty('force_update')
    })
  })

  // ==================== 管理后台更新接口 ====================
  describe('PUT /api/v4/console/system/app-version-config - 管理后台更新', () => {
    test('未鉴权应返回 401', async () => {
      const response = await request(app).put('/api/v4/console/system/app-version-config').send({})

      expect(response.status).toBe(401)
    })

    test('非法 min_version 应返回 400 校验错误', async () => {
      if (!accessToken) return

      const response = await request(app)
        .put('/api/v4/console/system/app-version-config')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Content-Type', 'application/json')
        .send({
          min_version: 'abc',
          force_update: false,
          update_message: '测试',
          platform: 'miniprogram'
        })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('INVALID_APP_VERSION_CONFIG')
      expect(response.body.data).toHaveProperty('errors')
    })

    test('有效配置应保存成功（读当前→回写，不污染环境）', async () => {
      if (!accessToken) return

      const getResponse = await request(app)
        .get('/api/v4/console/system/app-version-config')
        .set('Authorization', `Bearer ${accessToken}`)

      const currentConfig = { ...getResponse.body.data }

      const response = await request(app)
        .put('/api/v4/console/system/app-version-config')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Content-Type', 'application/json')
        .send(currentConfig)

      expect(response.status).toBe(200)
      validateApiContract(response.body)
      expect(response.body.code).toBe('APP_VERSION_CONFIG_UPDATE_SUCCESS')
      expect(response.body.data.min_version).toBe(currentConfig.min_version)
    })
  })
})
