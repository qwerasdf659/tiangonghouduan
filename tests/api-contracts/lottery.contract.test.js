/**
 * 餐厅积分抽奖系统 V4.5 - 抽奖模块 API 契约测试
 *
 * 测试范围（P1-12 API契约测试 - 抽奖模块）：
 * - 抽奖执行 API 请求/响应契约
 * - 活动查询 API 契约
 * - 抽奖历史 API 契约
 *
 * 测试用例数量：5-8 cases
 * 创建时间：2026-01-28
 * 关联文档：docs/测试审计标准.md（P1-12 节）
 *
 * API契约规范：
 * - 所有响应必须包含：success, code, message, data, timestamp, version, request_id
 * - HTTP状态码与业务码分离
 * - 幂等键必须通过 Header Idempotency-Key 传入
 */

const request = require('supertest')
const { sequelize } = require('../../models')

let app
let accessToken
let testCampaignCode

jest.setTimeout(30000)

describe('API契约测试 - 抽奖模块 (/api/v4/lottery)', () => {
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

    // 获取测试活动
    const { LotteryCampaign } = require('../../models')
    const campaign = await LotteryCampaign.findOne({
      where: { status: 'active' }
    })
    if (campaign) {
      testCampaignCode = campaign.campaign_code
    }
  })

  afterAll(async () => {
    await sequelize.close()
  })

  // ==================== 通用响应契约验证 ====================
  /**
   * 验证标准 API 响应格式
   * @param {Object} body - 响应体
   * @param {boolean} expectSuccess - 是否期望成功
   */
  function validateApiContract(body, expectSuccess = true) {
    // 必需字段
    expect(body).toHaveProperty('success')
    expect(body).toHaveProperty('code')
    expect(body).toHaveProperty('message')
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('version')
    expect(body).toHaveProperty('request_id')

    // 类型验证
    expect(typeof body.success).toBe('boolean')
    expect(typeof body.code).toBe('string')
    expect(typeof body.message).toBe('string')
    expect(typeof body.timestamp).toBe('string')
    expect(typeof body.version).toBe('string')
    expect(typeof body.request_id).toBe('string')

    if (expectSuccess) {
      expect(body.success).toBe(true)
    }
  }

  // ==================== POST /api/v4/lottery/draw ====================
  describe('POST /draw - 抽奖执行', () => {
    /**
     * Case 1: 缺少幂等键应该返回 400
     */
    test('缺少 Idempotency-Key 应该返回 400 MISSING_IDEMPOTENCY_KEY', async () => {
      if (!testCampaignCode) {
        console.log('[Lottery Contract] 跳过：没有可用活动')
        return
      }

      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ campaign_code: testCampaignCode, draw_count: 1 })

      expect(response.status).toBe(400)
      validateApiContract(response.body, false)
      expect(response.body.code).toBe('MISSING_IDEMPOTENCY_KEY')
    })

    /**
     * Case 2: 缺少 campaign_code 应该返回 400
     */
    test('缺少 campaign_code 应该返回 400 MISSING_PARAMETER', async () => {
      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', `test_${Date.now()}`)
        .send({ draw_count: 1 })

      expect(response.status).toBe(400)
      validateApiContract(response.body, false)
      expect(response.body.code).toBe('MISSING_PARAMETER')
    })

    /**
     * Case 3: draw_count 超出范围应该返回 400
     */
    test('draw_count > 10 应该返回 400 DRAW_COUNT_OUT_OF_RANGE', async () => {
      if (!testCampaignCode) return

      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', `test_${Date.now()}`)
        .send({ campaign_code: testCampaignCode, draw_count: 11 })

      expect(response.status).toBe(400)
      validateApiContract(response.body, false)
      expect(response.body.code).toBe('DRAW_COUNT_OUT_OF_RANGE')
    })

    /**
     * Case 4: 无效的 draw_count 类型应该返回 400
     */
    test('draw_count 非数字应该返回 400 INVALID_DRAW_COUNT', async () => {
      if (!testCampaignCode) return

      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', `test_${Date.now()}`)
        .send({ campaign_code: testCampaignCode, draw_count: 'abc' })

      expect(response.status).toBe(400)
      validateApiContract(response.body, false)
      expect(response.body.code).toBe('INVALID_DRAW_COUNT')
    })

    /**
     * Case 5: 无 Token 应该返回 401
     */
    test('无 Authorization 应该返回 401', async () => {
      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Idempotency-Key', `test_${Date.now()}`)
        .send({ campaign_code: 'test', draw_count: 1 })

      expect(response.status).toBe(401)
      validateApiContract(response.body, false)
    })
  })

  // ==================== GET /api/v4/lottery/campaigns ====================
  describe('GET /campaigns - 活动列表', () => {
    /**
     * Case 1: 正常获取活动列表
     */
    test('应该返回活动列表契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/lottery/campaigns')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(response.status).toBe(200)
      validateApiContract(response.body)

      // 验证数据结构
      if (response.body.data.campaigns) {
        expect(Array.isArray(response.body.data.campaigns)).toBe(true)
      }
    })
  })

  // ==================== GET /api/v4/lottery/history ====================
  describe('GET /history - 抽奖历史（用户端，从JWT Token取身份）', () => {
    /**
     * Case 1: 正常获取历史记录（路由分离方案 V4.8.0：不含 :user_id，从Token取身份）
     */
    test('应该返回抽奖历史契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/lottery/history')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, page_size: 10 })

      expect(response.status).toBe(200)
      validateApiContract(response.body)

      // 验证分页结构 - 抽奖历史使用 total_records 和 current_page
      if (response.body.data.pagination) {
        expect(response.body.data.pagination).toHaveProperty('total_records')
        expect(response.body.data.pagination).toHaveProperty('current_page')
        expect(response.body.data.pagination).toHaveProperty('page_size')
      }
    })

    /**
     * Case 2: 无 Token 应该返回 401
     */
    test('无 Authorization 应该返回 401', async () => {
      const response = await request(app).get('/api/v4/lottery/history')

      expect(response.status).toBe(401)
      validateApiContract(response.body, false)
    })
  })
})
