/**
 * 餐厅积分抽奖系统 V4.5 - 用户模块 API 契约测试
 *
 * 测试范围（P1-12 API契约测试 - 用户模块）：
 * - 用户登录 API 契约
 * - 用户信息 API 契约
 * - 用户资产查询 API 契约
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

describe('API契约测试 - 用户模块 (/api/v4/auth, /api/v4/assets)', () => {
  beforeAll(async () => {
    app = require('../../app')
    await sequelize.authenticate()

    // 登录获取 Token
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

  // ==================== POST /api/v4/auth/login ====================
  describe('POST /auth/login - 用户登录', () => {
    /**
     * Case 1: 正常登录应该返回成功契约
     * 注意：登录后更新accessToken，避免多设备登录检测导致后续测试失败
     */
    test('正常登录应该返回标准契约格式', async () => {
      const response = await request(app)
        .post('/api/v4/auth/login')
        .send({ mobile: '13612227930', verification_code: '123456' })

      expect(response.status).toBe(200)
      validateApiContract(response.body)

      // 验证登录数据结构
      expect(response.body.data).toHaveProperty('access_token')
      expect(response.body.data).toHaveProperty('user')
      expect(response.body.data).toHaveProperty('expires_in')
      expect(response.body.data.user).toHaveProperty('user_id')
      expect(response.body.data.user).toHaveProperty('mobile')

      /* 更新accessToken，确保后续测试使用最新的有效Token */
      accessToken = response.body.data.access_token
    })

    /**
     * Case 2: 缺少手机号应该返回 400
     */
    test('缺少 mobile 应该返回 400 MOBILE_REQUIRED', async () => {
      const response = await request(app)
        .post('/api/v4/auth/login')
        .send({ verification_code: '123456' })

      expect(response.status).toBe(400)
      validateApiContract(response.body, false)
      expect(response.body.code).toBe('MOBILE_REQUIRED')
    })

    /**
     * Case 3: 缺少验证码应该返回 400
     */
    test('缺少 verification_code 应该返回 400 VERIFICATION_CODE_REQUIRED', async () => {
      const response = await request(app).post('/api/v4/auth/login').send({ mobile: '13612227930' })

      expect(response.status).toBe(400)
      validateApiContract(response.body, false)
      expect(response.body.code).toBe('VERIFICATION_CODE_REQUIRED')
    })

    /**
     * Case 4: 验证码错误应该返回 400/401
     */
    test('验证码错误应该返回错误', async () => {
      const response = await request(app)
        .post('/api/v4/auth/login')
        .send({ mobile: '13612227930', verification_code: '000000' })

      expect([400, 401]).toContain(response.status)
      validateApiContract(response.body, false)
      expect(response.body.code).toBe('INVALID_VERIFICATION_CODE')
    })
  })

  // ==================== GET /api/v4/auth/profile ====================
  describe('GET /auth/profile - 用户信息', () => {
    /**
     * Case 1: 正常获取用户信息
     */
    test('应该返回用户信息契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(response.status).toBe(200)
      validateApiContract(response.body)

      // 验证用户信息结构
      expect(response.body.data).toHaveProperty('user')
      expect(response.body.data.user).toHaveProperty('user_id')
      expect(response.body.data.user).toHaveProperty('mobile')
      expect(response.body.data.user).toHaveProperty('status')
    })

    /**
     * Case 2: 无 Token 应该返回 401
     */
    test('无 Authorization 应该返回 401', async () => {
      const response = await request(app).get('/api/v4/auth/profile')

      expect(response.status).toBe(401)
      validateApiContract(response.body, false)
    })

    /**
     * Case 3: 无效 Token 应该返回 401
     */
    test('无效 Token 应该返回 401', async () => {
      const response = await request(app)
        .get('/api/v4/auth/profile')
        .set('Authorization', 'Bearer invalid_token_here')

      expect(response.status).toBe(401)
      validateApiContract(response.body, false)
    })
  })

  // ==================== GET /api/v4/assets/balances ====================
  describe('GET /assets/balances - 用户资产', () => {
    /**
     * Case 1: 正常获取所有资产余额
     */
    test('应该返回资产余额契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/assets/balances')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(response.status).toBe(200)
      validateApiContract(response.body)

      // 验证资产数据结构
      expect(response.body.data).toHaveProperty('balances')
      expect(Array.isArray(response.body.data.balances)).toBe(true)
    })

    /**
     * Case 2: 无 Token 应该返回 401
     */
    test('无 Authorization 应该返回 401', async () => {
      const response = await request(app).get('/api/v4/assets/balances')

      expect(response.status).toBe(401)
      validateApiContract(response.body, false)
    })
  })
})
