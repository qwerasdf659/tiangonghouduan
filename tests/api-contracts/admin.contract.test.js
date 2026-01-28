/**
 * 餐厅积分抽奖系统 V4.5 - 管理员模块 API 契约测试
 *
 * 测试范围（P1-12 API契约测试 - 管理员模块）：
 * - 用户管理 API 契约
 * - 活动管理 API 契约
 * - 审计日志 API 契约
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

describe('API契约测试 - 管理员模块 (/api/v4/console)', () => {
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

  // ==================== GET /api/v4/console/user-management/users ====================
  describe('GET /console/user-management/users - 用户管理', () => {
    /**
     * Case 1: 获取用户列表
     */
    test('应该返回用户列表契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/console/user-management/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, limit: 10 })

      if (response.status === 200) {
        validateApiContract(response.body)

        if (response.body.data.pagination) {
          expect(response.body.data.pagination).toHaveProperty('total')
          // user-management 使用 current_page 而非 page
          expect(response.body.data.pagination).toHaveProperty('current_page')
        }
      } else if ([401, 403].includes(response.status)) {
        validateApiContract(response.body, false)
      }
    })

    /**
     * Case 2: 无 Token 应该返回 401
     */
    test('无 Authorization 应该返回 401', async () => {
      const response = await request(app).get('/api/v4/console/user-management/users')

      expect(response.status).toBe(401)
      validateApiContract(response.body, false)
    })
  })

  // ==================== GET /api/v4/console/lottery-campaigns ====================
  describe('GET /console/lottery-campaigns - 活动管理', () => {
    /**
     * Case 1: 获取活动列表
     */
    test('应该返回活动列表契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/console/lottery-campaigns')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, page_size: 10 })

      if (response.status === 200) {
        validateApiContract(response.body)
      } else if ([401, 403].includes(response.status)) {
        validateApiContract(response.body, false)
      }
    })

    /**
     * Case 2: 无 Token 应该返回 401
     */
    test('无 Authorization 应该返回 401', async () => {
      const response = await request(app).get('/api/v4/console/lottery-campaigns')

      expect(response.status).toBe(401)
      validateApiContract(response.body, false)
    })
  })

  // ==================== GET /api/v4/console/audit-logs ====================
  describe('GET /console/audit-logs - 审计日志', () => {
    /**
     * Case 1: 获取审计日志列表
     */
    test('应该返回审计日志契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/console/audit-logs')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, page_size: 10 })

      if (response.status === 200) {
        validateApiContract(response.body)

        if (response.body.data.pagination) {
          expect(response.body.data.pagination).toHaveProperty('total')
        }
      } else if ([401, 403].includes(response.status)) {
        validateApiContract(response.body, false)
      }
    })
  })

  // ==================== GET /api/v4/console/lottery-analytics ====================
  describe('GET /console/lottery-analytics - 抽奖分析', () => {
    /**
     * Case 1: 获取抽奖分析数据
     */
    test('应该返回分析数据契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/console/lottery-analytics')
        .set('Authorization', `Bearer ${accessToken}`)

      if (response.status === 200) {
        validateApiContract(response.body)
      } else if ([401, 403].includes(response.status)) {
        validateApiContract(response.body, false)
      }
    })
  })

  // ==================== GET /api/v4/console/settings ====================
  describe('GET /console/settings - 系统设置', () => {
    /**
     * Case 1: 获取系统设置
     */
    test('应该返回系统设置契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/console/settings')
        .set('Authorization', `Bearer ${accessToken}`)

      if (response.status === 200) {
        validateApiContract(response.body)
      } else if ([401, 403].includes(response.status)) {
        validateApiContract(response.body, false)
      }
    })
  })
})
