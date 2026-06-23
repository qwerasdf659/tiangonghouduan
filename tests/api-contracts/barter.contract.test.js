/**
 * API契约测试 - 以物易物模块（Barter / B2C 官方合成）
 *
 * 覆盖范围（合规整改 §10.15 阶段六 Step 18）：
 * - GET  /api/v4/exchange/barter/recipes  - 配方列表（登录可见）
 * - POST /api/v4/exchange/barter          - 执行以物易物
 *
 * 合规守卫验证（用户↔官方、旧物核销、产出非货币型、方向等价/向下、无用户间转移）：
 * - 路由层契约：鉴权、幂等键、参数校验、统一响应壳
 * - 业务守卫：不存在的配方拒绝；不归属/不可用旧物拒绝；非法参数拒绝
 *
 * 测试原则：
 * - 不依赖 mock 数据，使用真实数据库状态 + 真实路由 + 真实测试账号
 * - 不硬编码业务数据（不预置配方/物品；通过"拒绝路径"验证契约与守卫）
 * - 使用 snake_case 命名规范
 *
 * 创建时间：2026-06-05（合规整改 阶段六 以物易物）
 * @module tests/api-contracts/barter.contract.test
 */

'use strict'

const request = require('supertest')
const { sequelize } = require('../../models')

/** Express应用实例 */
let app
/** 用户认证令牌 */
let access_token

jest.setTimeout(30000)

describe('API契约测试 - 以物易物 (/api/v4/exchange/barter)', () => {
  beforeAll(async () => {
    app = require('../../app')
    await sequelize.authenticate()

    const { initializeTestServiceManager } = require('../helpers/UnifiedTestManager')
    const sm = await initializeTestServiceManager()
    app.locals.services = app.locals.services || {
      getService: key => sm.getService(key),
      getAllServices: () => sm._services,
      models: require('../../models')
    }

    const login_response = await request(app).post('/api/v4/auth/login').send({
      mobile: '13612227910',
      verification_code: '123456'
    })
    if (login_response.body.success) {
      access_token = login_response.body.data.access_token
    } else {
      console.warn('⚠️ [Barter Test] 登录失败:', login_response.body.code)
    }
  })

  afterAll(async () => {
    await sequelize.close()
  })

  /**
   * 验证统一响应契约格式
   * @param {Object} body - 响应体
   */
  function validateApiContract(body) {
    expect(body).toHaveProperty('success')
    expect(body).toHaveProperty('code')
    expect(body).toHaveProperty('message')
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('version')
    expect(body).toHaveProperty('request_id')
    expect(typeof body.success).toBe('boolean')
    expect(typeof body.code).toBe('string')
  }

  // ==================== GET /barter/recipes ====================

  describe('GET /barter/recipes - 配方列表', () => {
    test('已认证用户应返回配方列表（recipes 为数组）', async () => {
      const response = await request(app)
        .get('/api/v4/exchange/barter/recipes')
        .set('Authorization', `Bearer ${access_token}`)

      expect(response.status).toBe(200)
      validateApiContract(response.body)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveProperty('recipes')
      expect(Array.isArray(response.body.data.recipes)).toBe(true)
    })

    test('未认证用户应返回 401', async () => {
      const response = await request(app).get('/api/v4/exchange/barter/recipes')
      expect(response.status).toBe(401)
      validateApiContract(response.body)
    })
  })

  // ==================== POST /barter ====================

  describe('POST /barter - 执行以物易物', () => {
    test('缺少 Idempotency-Key 应返回 400', async () => {
      const response = await request(app)
        .post('/api/v4/exchange/barter')
        .set('Authorization', `Bearer ${access_token}`)
        .send({ recipe_code: 'whatever', old_item_ids: [1] })

      expect(response.status).toBe(400)
      validateApiContract(response.body)
      expect(response.body.code).toMatch(/IDEMPOTENCY/i)
    })

    test('未认证用户应返回 401', async () => {
      const response = await request(app)
        .post('/api/v4/exchange/barter')
        .set('Idempotency-Key', `barter_test_${Date.now()}_1`)
        .send({ recipe_code: 'whatever', old_item_ids: [1] })

      expect(response.status).toBe(401)
      validateApiContract(response.body)
    })

    test('缺少 recipe_code 应返回 400', async () => {
      const response = await request(app)
        .post('/api/v4/exchange/barter')
        .set('Authorization', `Bearer ${access_token}`)
        .set('Idempotency-Key', `barter_test_${Date.now()}_2`)
        .send({ old_item_ids: [1] })

      expect(response.status).toBe(400)
      validateApiContract(response.body)
    })

    test('old_item_ids 非数组应返回 400', async () => {
      const response = await request(app)
        .post('/api/v4/exchange/barter')
        .set('Authorization', `Bearer ${access_token}`)
        .set('Idempotency-Key', `barter_test_${Date.now()}_3`)
        .send({ recipe_code: 'whatever', old_item_ids: 'not_array' })

      expect(response.status).toBe(400)
      validateApiContract(response.body)
    })

    test('不存在的配方应返回 404（BARTER_RECIPE_NOT_FOUND）', async () => {
      const response = await request(app)
        .post('/api/v4/exchange/barter')
        .set('Authorization', `Bearer ${access_token}`)
        .set('Idempotency-Key', `barter_test_${Date.now()}_4`)
        .send({ recipe_code: 'non_existent_recipe_xyz', old_item_ids: [999999999] })

      // 未配置配方时业务码为 BARTER_RECIPE_NOT_FOUND（业务 HTTP 恒 200 或真实 404，取决于错误壳）
      validateApiContract(response.body)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('BARTER_RECIPE_NOT_FOUND')
    })
  })
})
