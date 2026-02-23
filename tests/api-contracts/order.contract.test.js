/**
 * 餐厅积分抽奖系统 V4.5 - 订单模块 API 契约测试
 *
 * 测试范围（P1-12 API契约测试 - 订单模块）：
 * - 核销订单 API 契约
 * - 交易订单 API 契约
 * - 背包查询 API 契约
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

describe('API契约测试 - 订单模块 (/api/v4/shop/redemption, /api/v4/backpack)', () => {
  beforeAll(async () => {
    app = require('../../app')
    await sequelize.authenticate()

    // 等待 ServiceManager 异步初始化完成
    const { initializeTestServiceManager } = require('../helpers/UnifiedTestManager')
    const sm = await initializeTestServiceManager()
    app.locals.services = app.locals.services || {
      getService: key => sm.getService(key),
      getAllServices: () => sm._services,
      models: require('../../models')
    }

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

  /*
   * ==================== POST /api/v4/shop/redemption/orders ====================
   * 注意：核销订单API位于shop域，需要商家域访问权限（merchant_staff/merchant_manager角色）
   * 普通用户会收到 403 MERCHANT_DOMAIN_ACCESS_DENIED 响应
   */
  describe('POST /shop/redemption/orders - 生成核销订单', () => {
    /**
     * Case 1: 缺少 item_id 应该返回 400 或 403 (无商家权限)
     */
    test('缺少 item_id 应该返回 400 或 403', async () => {
      const response = await request(app)
        .post('/api/v4/shop/redemption/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})

      // 可能返回 400（参数校验失败）或 403（无商家域访问权限）
      expect([400, 403]).toContain(response.status)
      validateApiContract(response.body, false)
    })

    /**
     * Case 2: 无效的 item_id 应该返回 400 或 403 (无商家权限)
     */
    test('item_id 非正整数应该返回 400 或 403', async () => {
      const response = await request(app)
        .post('/api/v4/shop/redemption/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ item_id: -1 })

      // 可能返回 400（参数校验失败）或 403（无商家域访问权限）
      expect([400, 403]).toContain(response.status)
      validateApiContract(response.body, false)
    })

    /**
     * Case 3: 不存在的物品应该返回 403 或 404
     */
    test('不存在的物品应该返回 403 或 404', async () => {
      const response = await request(app)
        .post('/api/v4/shop/redemption/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ item_id: 999999999 })

      expect([403, 404]).toContain(response.status)
      validateApiContract(response.body, false)
    })

    /**
     * Case 4: 无 Token 应该返回 401
     */
    test('无 Authorization 应该返回 401', async () => {
      const response = await request(app)
        .post('/api/v4/shop/redemption/orders')
        .send({ item_id: 1 })

      expect(response.status).toBe(401)
      validateApiContract(response.body, false)
    })
  })

  // ==================== GET /api/v4/backpack ====================
  describe('GET /backpack - 用户背包', () => {
    /**
     * Case 1: 正常获取背包内容
     */
    test('应该返回背包契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/backpack')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(response.status).toBe(200)
      validateApiContract(response.body)

      // 验证背包数据结构
      expect(response.body.data).toHaveProperty('assets')
      expect(response.body.data).toHaveProperty('items')
      expect(Array.isArray(response.body.data.assets)).toBe(true)
      expect(Array.isArray(response.body.data.items)).toBe(true)
    })

    /**
     * Case 2: 无 Token 应该返回 401
     */
    test('无 Authorization 应该返回 401', async () => {
      const response = await request(app).get('/api/v4/backpack')

      expect(response.status).toBe(401)
      validateApiContract(response.body, false)
    })
  })

  // ==================== GET /api/v4/backpack/stats ====================
  describe('GET /backpack/stats - 背包统计', () => {
    /**
     * Case 1: 正常获取背包统计
     */
    test('应该返回背包统计契约格式', async () => {
      const response = await request(app)
        .get('/api/v4/backpack/stats')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(response.status).toBe(200)
      validateApiContract(response.body)
    })
  })
})
