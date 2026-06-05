/**
 * API契约测试 - 市场模块 (Market Module / C2C 交易市场)
 *
 * 🔴 合规整改后契约变更（2026-06-04）：
 * - C2C 用户间交易市场（/api/v4/marketplace）已下线，改为「用户↔官方 B2C 单向道具商城」（exchange 域）
 * - 由 feature_flag `c2c_marketplace_enabled` 控制，默认关闭 → 整域返回 410 Gone
 * - 业务码统一为 MARKETPLACE_DEPRECATED，前端据此隐藏入口
 *
 * 本契约测试验证「新契约」（C2C 已废弃）：
 * - 所有 /api/v4/marketplace/* 端点返回 HTTP 410
 * - 响应符合统一契约格式（success/code/message/data/timestamp/version/request_id）
 * - 业务码为 MARKETPLACE_DEPRECATED，并提供迁移引导（new_domain=/api/v4/exchange）
 * - 下线判定先于鉴权（410 不受是否登录影响，整域不可达）
 *
 * 测试原则：
 * - 不依赖 mock 数据，使用真实数据库状态与真实路由
 * - 使用 snake_case 命名规范
 * - 测试验证业务需求（C2C 已合规下线），而非适配旧实现
 *
 * 创建时间：2026-01-30
 * 重写时间：2026-06-04（合规整改：C2C 下线 410 契约）
 * @module tests/api-contracts/market.contract.test
 */

'use strict'

const request = require('supertest')
const { sequelize } = require('../../models')

/** Express应用实例 */
let app
/** 用户认证令牌（用于验证 410 判定先于鉴权） */
let access_token

/** Jest测试超时设置（毫秒） */
jest.setTimeout(30000)

describe('API契约测试 - 市场模块 C2C 已下线 (/api/v4/marketplace → 410)', () => {
  /**
   * 测试套件初始化
   * - 加载应用
   * - 验证数据库连接
   * - 获取用户认证令牌（用于验证已登录用户访问也返回 410）
   */
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

    // 使用测试账号登录获取Token（验证 410 判定不受登录态影响）
    const login_response = await request(app).post('/api/v4/auth/login').send({
      mobile: '13612227930',
      verification_code: '123456'
    })

    if (login_response.body.success) {
      access_token = login_response.body.data.access_token
    } else {
      console.warn(
        '⚠️ [Market Test] 登录失败:',
        login_response.body.code,
        login_response.body.message
      )
    }
  })

  /**
   * 测试套件清理
   * - 关闭数据库连接
   */
  afterAll(async () => {
    await sequelize.close()
  })

  // ==================== 通用契约验证函数 ====================

  /**
   * 验证 API 响应契约格式（统一响应壳）
   *
   * @param {Object} body - API响应体
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
    expect(typeof body.message).toBe('string')
  }

  /**
   * 验证「C2C 已下线」响应（410 + MARKETPLACE_DEPRECATED + 迁移引导）
   *
   * @param {Object} response - supertest 响应对象
   */
  function validateDeprecated410(response) {
    expect(response.status).toBe(410)
    validateApiContract(response.body)
    expect(response.body.success).toBe(false)
    expect(response.body.code).toBe('MARKETPLACE_DEPRECATED')
    // 迁移引导：指向 exchange 域（B2C 单向道具商城）
    expect(response.body.data).toHaveProperty('new_domain', '/api/v4/exchange')
  }

  // ==================== C2C 整域下线契约（410）====================

  describe('C2C 整域已下线，所有端点返回 410 Gone', () => {
    /**
     * 挂牌查询类（GET）下线
     */
    test('GET /listings 返回 410（C2C 已下线）', async () => {
      const response = await request(app)
        .get('/api/v4/marketplace/listings')
        .set('Authorization', `Bearer ${access_token}`)
      validateDeprecated410(response)
    })

    test('GET /listings/:id 返回 410（C2C 已下线）', async () => {
      const response = await request(app)
        .get('/api/v4/marketplace/listings/999999999')
        .set('Authorization', `Bearer ${access_token}`)
      validateDeprecated410(response)
    })

    test('GET /listing-status 返回 410（C2C 已下线）', async () => {
      const response = await request(app)
        .get('/api/v4/marketplace/listing-status')
        .set('Authorization', `Bearer ${access_token}`)
      validateDeprecated410(response)
    })

    /**
     * 挂牌写操作类（POST）下线
     */
    test('POST /list（物品挂牌）返回 410（C2C 已下线）', async () => {
      const response = await request(app)
        .post('/api/v4/marketplace/list')
        .set('Authorization', `Bearer ${access_token}`)
        .set('Idempotency-Key', `test_list_${Date.now()}`)
        .send({ item_id: 1, price_amount: 100, price_asset_code: 'star_stone' })
      validateDeprecated410(response)
    })

    test('POST /fungible-assets/list（资产挂牌）返回 410（C2C 已下线）', async () => {
      const response = await request(app)
        .post('/api/v4/marketplace/fungible-assets/list')
        .set('Authorization', `Bearer ${access_token}`)
        .set('Idempotency-Key', `test_fungible_${Date.now()}`)
        .send({
          offer_asset_code: 'red_core_shard',
          offer_amount: 100,
          price_amount: 50,
          price_asset_code: 'star_stone'
        })
      validateDeprecated410(response)
    })

    /**
     * 购买/撤回/结算类下线
     */
    test('POST /listings/:id/purchase（购买）返回 410（C2C 已下线）', async () => {
      const response = await request(app)
        .post('/api/v4/marketplace/listings/1/purchase')
        .set('Authorization', `Bearer ${access_token}`)
        .set('Idempotency-Key', `test_purchase_${Date.now()}`)
      validateDeprecated410(response)
    })

    test('POST /listings/:id/withdraw（撤回）返回 410（C2C 已下线）', async () => {
      const response = await request(app)
        .post('/api/v4/marketplace/listings/1/withdraw')
        .set('Authorization', `Bearer ${access_token}`)
        .set('Idempotency-Key', `test_withdraw_${Date.now()}`)
      validateDeprecated410(response)
    })

    /**
     * C2C 拍卖类下线
     */
    test('GET /auctions（C2C 拍卖列表）返回 410（C2C 已下线）', async () => {
      const response = await request(app)
        .get('/api/v4/marketplace/auctions')
        .set('Authorization', `Bearer ${access_token}`)
      validateDeprecated410(response)
    })
  })

  // ==================== 下线判定先于鉴权 ====================

  describe('410 判定先于鉴权（整域不可达，不受登录态影响）', () => {
    /**
     * 未认证访问也返回 410（而非 401）：总开关下线整域不可达
     */
    test('未认证访问 GET /listings 仍返回 410（而非 401）', async () => {
      const response = await request(app).get('/api/v4/marketplace/listings')
      validateDeprecated410(response)
    })

    test('未认证访问 POST /list 仍返回 410（而非 401）', async () => {
      const response = await request(app)
        .post('/api/v4/marketplace/list')
        .set('Idempotency-Key', `test_unauth_${Date.now()}`)
        .send({ item_id: 1 })
      validateDeprecated410(response)
    })
  })
})
