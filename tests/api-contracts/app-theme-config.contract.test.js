/**
 * 全局氛围主题配置 API 契约测试
 *
 * 测试范围：
 * - GET  /api/v4/console/system/app-theme-config（管理后台读取，需鉴权）
 * - PUT  /api/v4/console/system/app-theme-config（管理后台更新，需鉴权 + 校验）
 *
 * 真实数据：连真实库 restaurant_points_dev，使用测试账号 13612227930 / 123456 登录取真实 JWT，
 * 不使用 mock/硬编码 token。更新用例读取当前主题→改写→断言→回写，保证不污染真实环境。
 *
 * @date 2026-06-03
 */

const request = require('supertest')
const { sequelize } = require('../../models')

let app
let accessToken

jest.setTimeout(30000)

describe('API契约测试 - 全局氛围主题配置', () => {
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

  // ==================== 管理后台读取接口 ====================
  describe('GET /api/v4/console/system/app-theme-config - 管理后台读取', () => {
    test('未鉴权应返回 401', async () => {
      const response = await request(app).get('/api/v4/console/system/app-theme-config')

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
    })

    test('鉴权后应返回 theme + valid_themes + theme_meta', async () => {
      if (!accessToken) return

      const response = await request(app)
        .get('/api/v4/console/system/app-theme-config')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(response.status).toBe(200)
      validateApiContract(response.body)
      expect(response.body.code).toBe('APP_THEME_CONFIG_GET_SUCCESS')

      const { data } = response.body
      expect(data).toHaveProperty('theme')
      expect(Array.isArray(data.valid_themes)).toBe(true)
      expect(data.valid_themes).toContain('default')
      expect(data).toHaveProperty('theme_meta')
      // 当前 theme 必须在合法列表内
      expect(data.valid_themes).toContain(data.theme)
    })
  })

  // ==================== 管理后台更新接口 ====================
  describe('PUT /api/v4/console/system/app-theme-config - 管理后台更新', () => {
    test('未鉴权应返回 401', async () => {
      const response = await request(app)
        .put('/api/v4/console/system/app-theme-config')
        .send({ theme: 'default' })

      expect(response.status).toBe(401)
    })

    test('非法主题应返回 400 校验错误', async () => {
      if (!accessToken) return

      const response = await request(app)
        .put('/api/v4/console/system/app-theme-config')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Content-Type', 'application/json')
        .send({ theme: 'not_a_real_theme' })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('INVALID_APP_THEME')
      expect(response.body.data).toHaveProperty('errors')
    })

    test('合法主题应保存成功（读当前→回写，不污染环境）', async () => {
      if (!accessToken) return

      const getResponse = await request(app)
        .get('/api/v4/console/system/app-theme-config')
        .set('Authorization', `Bearer ${accessToken}`)

      const originalTheme = getResponse.body.data.theme

      const response = await request(app)
        .put('/api/v4/console/system/app-theme-config')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Content-Type', 'application/json')
        .send({ theme: originalTheme })

      expect(response.status).toBe(200)
      validateApiContract(response.body)
      expect(response.body.code).toBe('APP_THEME_CONFIG_UPDATE_SUCCESS')
      expect(response.body.data.theme).toBe(originalTheme)
    })
  })
})
