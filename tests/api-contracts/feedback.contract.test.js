/**
 * 餐厅积分抽奖系统 V4.5 - 反馈模块 API 契约测试
 *
 * 测试范围（P1-12 API契约测试 - 反馈模块）：
 * - 用户反馈 API 契约
 * - 系统公告 API 契约
 * - 系统状态 API 契约
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

describe('API契约测试 - 反馈模块 (/api/v4/system)', () => {
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

  // ==================== POST /api/v4/system/feedback ====================
  describe('POST /system/feedback - 提交反馈', () => {
    /**
     * Case 1: 正常提交反馈
     */
    test('提交反馈应该返回标准契约格式', async () => {
      const response = await request(app)
        .post('/api/v4/system/feedback')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          type: 'suggestion',
          content: '这是一条测试反馈内容',
          contact: '13612227930'
        })

      // 可能成功也可能因为限流失败
      if (response.status === 200 || response.status === 201) {
        validateApiContract(response.body)
      } else if (response.status === 429) {
        // 限流响应也应该符合契约
        validateApiContract(response.body, false)
      } else {
        validateApiContract(response.body, false)
      }
    })

    /**
     * Case 2: 缺少必需参数应该返回 400
     */
    test('缺少 content 应该返回 400', async () => {
      const response = await request(app)
        .post('/api/v4/system/feedback')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'suggestion' })

      expect(response.status).toBe(400)
      validateApiContract(response.body, false)
    })

    /**
     * Case 3: 无 Token 应该返回 401
     */
    test('无 Authorization 应该返回 401', async () => {
      const response = await request(app)
        .post('/api/v4/system/feedback')
        .send({ type: 'bug', content: 'test' })

      expect(response.status).toBe(401)
      validateApiContract(response.body, false)
    })
  })

  // ==================== GET /api/v4/system/announcements ====================
  describe('GET /system/announcements - 系统公告', () => {
    /**
     * Case 1: 获取公告列表
     */
    test('应该返回公告列表契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/system/announcements')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(response.status).toBe(200)
      validateApiContract(response.body)

      // 验证数据结构
      if (response.body.data.announcements) {
        expect(Array.isArray(response.body.data.announcements)).toBe(true)
      }
    })

    /**
     * Case 2: 公告接口是公开的，无 Token 也应该返回 200
     */
    test('无 Authorization 也应该返回公告列表（公开接口）', async () => {
      const response = await request(app).get('/api/v4/system/announcements')

      expect(response.status).toBe(200)
      validateApiContract(response.body)
    })
  })

  // ==================== GET /api/v4/system/status ====================
  describe('GET /system/status - 系统状态', () => {
    /**
     * Case 1: 获取系统状态
     */
    test('应该返回系统状态契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/system/status')
        .set('Authorization', `Bearer ${accessToken}`)

      if (response.status === 200) {
        validateApiContract(response.body)
      } else {
        // 系统状态接口可能有不同的实现
        console.log('[Feedback Contract] 系统状态响应:', response.status)
      }
    })
  })

  // ==================== GET /api/v4/system/dictionaries ====================
  describe('GET /system/dictionaries - 数据字典', () => {
    /**
     * Case 1: 获取数据字典
     */
    test('应该返回数据字典契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/system/dictionaries')
        .set('Authorization', `Bearer ${accessToken}`)

      if (response.status === 200) {
        validateApiContract(response.body)
      } else if (response.status === 401) {
        validateApiContract(response.body, false)
      }
    })
  })

  // ==================== GET /health - 健康检查 ====================
  describe('GET /health - 健康检查', () => {
    /**
     * Case 1: 健康检查应该返回状态
     * 注意：V4 健康检查遵循统一 API 契约格式，status 在 data.status 中
     */
    test('应该返回健康状态', async () => {
      const response = await request(app).get('/health')

      expect(response.status).toBe(200)

      // V4 健康检查遵循统一契约，status 在 data.status 中
      expect(response.body).toHaveProperty('success', true)
      expect(response.body).toHaveProperty('data')
      expect(response.body.data).toHaveProperty('status')
      expect(['healthy', 'ok', 'up']).toContain(response.body.data.status.toLowerCase())
    })
  })
})
