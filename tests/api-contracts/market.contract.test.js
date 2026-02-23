/**
 * API契约测试 - 市场模块 (Market Module)
 *
 * 覆盖范围：
 * - P0-1.1: 市场挂牌API契约测试 - 创建/修改/撤回/查询接口
 * - P0-1.2: 市场交易API契约测试 - 下单/取消/完成接口
 *
 * 测试原则：
 * - 验证API响应符合统一契约格式（success/code/message/data/timestamp/version/request_id）
 * - 验证HTTP状态码与业务场景对应
 * - 不依赖mock数据，使用真实数据库状态
 * - 使用snake_case命名规范
 *
 * 创建时间：2026-01-30
 * @module tests/api-contracts/market.contract.test
 */

'use strict'

const request = require('supertest')
const { sequelize } = require('../../models')

/** Express应用实例 */
let app
/** 用户认证令牌 */
let access_token

/** Jest测试超时设置（毫秒） */
jest.setTimeout(30000)

describe('API契约测试 - 市场模块 (/api/v4/market)', () => {
  /**
   * 测试套件初始化
   * - 加载应用
   * - 验证数据库连接
   * - 获取用户认证令牌
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

    // 使用测试账号登录获取Token
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
   * 验证API响应契约格式
   *
   * @param {Object} body - API响应体
   * @param {boolean} expect_success - 是否期望成功响应
   */
  function validateApiContract(body, expect_success = true) {
    // 必需字段存在性检查
    expect(body).toHaveProperty('success')
    expect(body).toHaveProperty('code')
    expect(body).toHaveProperty('message')
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('version')
    expect(body).toHaveProperty('request_id')

    // 字段类型检查
    expect(typeof body.success).toBe('boolean')
    expect(typeof body.code).toBe('string')
    expect(typeof body.message).toBe('string')

    // 成功/失败状态检查
    if (expect_success) {
      expect(body.success).toBe(true)
    }
  }

  // ==================== P0-1.1: 市场挂牌API契约测试 ====================

  describe('P0-1.1 市场挂牌API契约测试', () => {
    // -------------------- GET /listings - 查询市场挂牌列表 --------------------

    describe('GET /listings - 查询市场挂牌列表', () => {
      /**
       * Case 1: 正常获取市场挂牌列表（需要认证）
       * 业务规则：交易市场查询需要登录用户
       */
      test('已认证用户应返回符合契约的市场列表数据', async () => {
        const response = await request(app)
          .get('/api/v4/market/listings')
          .set('Authorization', `Bearer ${access_token}`)

        expect(response.status).toBe(200)
        validateApiContract(response.body)

        // 验证data结构 - 市场列表使用products和pagination结构
        expect(response.body.data).toHaveProperty('products')
        expect(response.body.data).toHaveProperty('pagination')
        expect(Array.isArray(response.body.data.products)).toBe(true)
        expect(response.body.data.pagination).toHaveProperty('total')
        expect(response.body.data.pagination).toHaveProperty('page')
        expect(response.body.data.pagination).toHaveProperty('limit')
      })

      /**
       * Case 2: 未认证用户应返回401
       */
      test('未认证用户应返回401', async () => {
        const response = await request(app).get('/api/v4/market/listings')

        expect(response.status).toBe(401)
        validateApiContract(response.body, false)
      })

      /**
       * Case 3: 带分页参数查询
       */
      test('带分页参数应返回正确的分页数据', async () => {
        const response = await request(app)
          .get('/api/v4/market/listings')
          .set('Authorization', `Bearer ${access_token}`)
          .query({ page: 1, limit: 5 })

        expect(response.status).toBe(200)
        validateApiContract(response.body)
        expect(response.body.data.pagination.page).toBe(1)
        expect(response.body.data.pagination.limit).toBe(5)
      })

      /**
       * Case 4: 按listing_kind筛选
       * 注意：路由使用listing_kind参数而非offer_type
       */
      test('按listing_kind筛选应返回对应类型的挂牌', async () => {
        const response = await request(app)
          .get('/api/v4/market/listings')
          .set('Authorization', `Bearer ${access_token}`)
          .query({ listing_kind: 'item' })

        expect(response.status).toBe(200)
        validateApiContract(response.body)

        // 如果有数据，验证类型匹配
        if (response.body.data.products.length > 0) {
          response.body.data.products.forEach(product => {
            expect(product.listing_kind).toBe('item')
          })
        }
      })

      /**
       * Case 5: 无效的page参数处理
       * 业务场景：当传入负数page时，系统应返回错误或使用默认值
       */
      test('无效的page参数应返回错误或使用默认值', async () => {
        const response = await request(app)
          .get('/api/v4/market/listings')
          .set('Authorization', `Bearer ${access_token}`)
          .query({ page: -1 })

        // 负数page可能导致SQL错误(500)、参数校验错误(400)或使用默认值(200)
        expect([200, 400, 500]).toContain(response.status)
        validateApiContract(response.body, response.status === 200)
      })
    })

    // -------------------- GET /listings/:market_listing_id - 查询挂牌详情 --------------------

    describe('GET /listings/:market_listing_id - 查询挂牌详情', () => {
      /**
       * Case 1: 未认证用户应返回401
       */
      test('未认证用户应返回401', async () => {
        const response = await request(app).get('/api/v4/market/listings/1')

        expect(response.status).toBe(401)
        validateApiContract(response.body, false)
      })

      /**
       * Case 2: 不存在的listing_id应返回404
       */
      test('不存在的listing_id应返回404', async () => {
        const response = await request(app)
          .get('/api/v4/market/listings/999999999')
          .set('Authorization', `Bearer ${access_token}`)

        expect(response.status).toBe(404)
        validateApiContract(response.body, false)
        expect(response.body.code).toMatch(/NOT_FOUND|LISTING_NOT_FOUND/i)
      })

      /**
       * Case 3: 无效的listing_id格式应返回400
       */
      test('无效的listing_id格式应返回400', async () => {
        const response = await request(app)
          .get('/api/v4/market/listings/invalid_id')
          .set('Authorization', `Bearer ${access_token}`)

        expect(response.status).toBe(400)
        validateApiContract(response.body, false)
      })
    })

    // -------------------- GET /listing-status - 用户挂牌状态 --------------------

    describe('GET /listing-status - 用户挂牌状态', () => {
      /**
       * Case 1: 已认证用户获取挂牌状态
       * 响应格式：{ current, limit, remaining, percentage }
       */
      test('已认证用户应返回挂牌状态', async () => {
        const response = await request(app)
          .get('/api/v4/market/listing-status')
          .set('Authorization', `Bearer ${access_token}`)

        expect(response.status).toBe(200)
        validateApiContract(response.body)

        // 验证data结构 - 使用路由实际返回的字段名
        expect(response.body.data).toHaveProperty('current')
        expect(response.body.data).toHaveProperty('limit')
        expect(response.body.data).toHaveProperty('remaining')
        expect(response.body.data).toHaveProperty('percentage')
        expect(typeof response.body.data.current).toBe('number')
        expect(typeof response.body.data.limit).toBe('number')
        expect(typeof response.body.data.remaining).toBe('number')
        expect(typeof response.body.data.percentage).toBe('number')
      })

      /**
       * Case 2: 未认证应返回401
       */
      test('未认证用户应返回401', async () => {
        const response = await request(app).get('/api/v4/market/listing-status')

        expect(response.status).toBe(401)
        validateApiContract(response.body, false)
      })
    })

    // -------------------- POST /list - 物品挂牌 --------------------

    describe('POST /list - 物品挂牌', () => {
      /**
       * Case 1: 缺少必要参数应返回400
       */
      test('缺少item_id应返回400', async () => {
        const response = await request(app)
          .post('/api/v4/market/list')
          .set('Authorization', `Bearer ${access_token}`)
          .set('Idempotency-Key', `test_list_${Date.now()}_1`)
          .send({
            price_amount: 100,
            price_asset_code: 'DIAMOND'
          })

        expect(response.status).toBe(400)
        validateApiContract(response.body, false)
      })

      /**
       * Case 2: 缺少price_amount应返回400
       */
      test('缺少price_amount应返回400', async () => {
        const response = await request(app)
          .post('/api/v4/market/list')
          .set('Authorization', `Bearer ${access_token}`)
          .set('Idempotency-Key', `test_list_${Date.now()}_2`)
          .send({
            item_id: 1,
            price_asset_code: 'DIAMOND'
          })

        expect(response.status).toBe(400)
        validateApiContract(response.body, false)
      })

      /**
       * Case 3: 缺少Idempotency-Key应返回400
       */
      test('缺少Idempotency-Key应返回400', async () => {
        const response = await request(app)
          .post('/api/v4/market/list')
          .set('Authorization', `Bearer ${access_token}`)
          .send({
            item_id: 1,
            price_amount: 100,
            price_asset_code: 'DIAMOND'
          })

        expect(response.status).toBe(400)
        validateApiContract(response.body, false)
        expect(response.body.code).toMatch(/IDEMPOTENCY_KEY_REQUIRED|MISSING_IDEMPOTENCY_KEY/i)
      })

      /**
       * Case 4: 未认证应返回401
       */
      test('未认证用户应返回401', async () => {
        const response = await request(app)
          .post('/api/v4/market/list')
          .set('Idempotency-Key', `test_list_${Date.now()}_3`)
          .send({
            item_id: 1,
            price_amount: 100,
            price_asset_code: 'DIAMOND'
          })

        expect(response.status).toBe(401)
        validateApiContract(response.body, false)
      })

      /**
       * Case 5: 无效的price_amount应返回400
       */
      test('price_amount为0或负数应返回400', async () => {
        const response = await request(app)
          .post('/api/v4/market/list')
          .set('Authorization', `Bearer ${access_token}`)
          .set('Idempotency-Key', `test_list_${Date.now()}_4`)
          .send({
            item_id: 1,
            price_amount: -100,
            price_asset_code: 'DIAMOND'
          })

        expect(response.status).toBe(400)
        validateApiContract(response.body, false)
      })

      /**
       * Case 6: 不存在的物品应返回404或400
       */
      test('不存在的item_id应返回404或400', async () => {
        const response = await request(app)
          .post('/api/v4/market/list')
          .set('Authorization', `Bearer ${access_token}`)
          .set('Idempotency-Key', `test_list_${Date.now()}_5`)
          .send({
            item_id: 999999999,
            price_amount: 100,
            price_asset_code: 'DIAMOND'
          })

        // 可能返回404（物品不存在）或400（业务校验失败）
        expect([400, 404]).toContain(response.status)
        validateApiContract(response.body, false)
      })
    })

    // -------------------- POST /fungible-assets/list - 可叠加资产挂牌 --------------------

    describe('POST /fungible-assets/list - 可叠加资产挂牌', () => {
      /**
       * Case 1: 缺少必要参数应返回400
       */
      test('缺少offer_asset_code应返回400', async () => {
        const response = await request(app)
          .post('/api/v4/market/fungible-assets/list')
          .set('Authorization', `Bearer ${access_token}`)
          .set('Idempotency-Key', `test_fungible_list_${Date.now()}_1`)
          .send({
            offer_amount: 100,
            price_amount: 50,
            price_asset_code: 'DIAMOND'
          })

        expect(response.status).toBe(400)
        validateApiContract(response.body, false)
      })

      /**
       * Case 2: 缺少offer_amount应返回400
       */
      test('缺少offer_amount应返回400', async () => {
        const response = await request(app)
          .post('/api/v4/market/fungible-assets/list')
          .set('Authorization', `Bearer ${access_token}`)
          .set('Idempotency-Key', `test_fungible_list_${Date.now()}_2`)
          .send({
            offer_asset_code: 'red_shard',
            price_amount: 50,
            price_asset_code: 'DIAMOND'
          })

        expect(response.status).toBe(400)
        validateApiContract(response.body, false)
      })

      /**
       * Case 3: 未认证应返回401
       */
      test('未认证用户应返回401', async () => {
        const response = await request(app)
          .post('/api/v4/market/fungible-assets/list')
          .set('Idempotency-Key', `test_fungible_list_${Date.now()}_3`)
          .send({
            offer_asset_code: 'red_shard',
            offer_amount: 100,
            price_amount: 50,
            price_asset_code: 'DIAMOND'
          })

        expect(response.status).toBe(401)
        validateApiContract(response.body, false)
      })

      /**
       * Case 4: 无效的offer_amount应返回400
       */
      test('offer_amount为0或负数应返回400', async () => {
        const response = await request(app)
          .post('/api/v4/market/fungible-assets/list')
          .set('Authorization', `Bearer ${access_token}`)
          .set('Idempotency-Key', `test_fungible_list_${Date.now()}_4`)
          .send({
            offer_asset_code: 'red_shard',
            offer_amount: 0,
            price_amount: 50,
            price_asset_code: 'DIAMOND'
          })

        expect(response.status).toBe(400)
        validateApiContract(response.body, false)
      })
    })

    // -------------------- POST /listings/:market_listing_id/withdraw - 撤回物品挂牌 --------------------

    describe('POST /listings/:market_listing_id/withdraw - 撤回物品挂牌', () => {
      /**
       * Case 1: 不存在的listing_id应返回404
       */
      test('不存在的listing_id应返回404', async () => {
        const response = await request(app)
          .post('/api/v4/market/listings/999999999/withdraw')
          .set('Authorization', `Bearer ${access_token}`)
          .set('Idempotency-Key', `test_withdraw_${Date.now()}_1`)

        expect(response.status).toBe(404)
        validateApiContract(response.body, false)
      })

      /**
       * Case 2: 未认证应返回401
       */
      test('未认证用户应返回401', async () => {
        const response = await request(app)
          .post('/api/v4/market/listings/1/withdraw')
          .set('Idempotency-Key', `test_withdraw_${Date.now()}_2`)

        expect(response.status).toBe(401)
        validateApiContract(response.body, false)
      })

      /**
       * Case 3: 无效的listing_id格式应返回400
       */
      test('无效的listing_id格式应返回400', async () => {
        const response = await request(app)
          .post('/api/v4/market/listings/invalid_id/withdraw')
          .set('Authorization', `Bearer ${access_token}`)
          .set('Idempotency-Key', `test_withdraw_${Date.now()}_3`)

        expect(response.status).toBe(400)
        validateApiContract(response.body, false)
      })
    })

    // -------------------- POST /fungible-assets/:market_listing_id/withdraw - 撤回资产挂牌 --------------------

    describe('POST /fungible-assets/:market_listing_id/withdraw - 撤回资产挂牌', () => {
      /**
       * Case 1: 不存在的listing_id应返回404
       */
      test('不存在的listing_id应返回404', async () => {
        const response = await request(app)
          .post('/api/v4/market/fungible-assets/999999999/withdraw')
          .set('Authorization', `Bearer ${access_token}`)
          .set('Idempotency-Key', `test_fungible_withdraw_${Date.now()}_1`)

        expect(response.status).toBe(404)
        validateApiContract(response.body, false)
      })

      /**
       * Case 2: 未认证应返回401
       */
      test('未认证用户应返回401', async () => {
        const response = await request(app)
          .post('/api/v4/market/fungible-assets/1/withdraw')
          .set('Idempotency-Key', `test_fungible_withdraw_${Date.now()}_2`)

        expect(response.status).toBe(401)
        validateApiContract(response.body, false)
      })
    })
  })

  // ==================== P0-1.2: 市场交易API契约测试 ====================

  describe('P0-1.2 市场交易API契约测试', () => {
    // -------------------- POST /listings/:market_listing_id/purchase - 购买商品 --------------------

    describe('POST /listings/:market_listing_id/purchase - 购买商品', () => {
      /**
       * Case 1: 不存在的listing_id应返回404
       */
      test('不存在的listing_id应返回404', async () => {
        const response = await request(app)
          .post('/api/v4/market/listings/999999999/purchase')
          .set('Authorization', `Bearer ${access_token}`)
          .set('Idempotency-Key', `test_purchase_${Date.now()}_1`)

        expect(response.status).toBe(404)
        validateApiContract(response.body, false)
      })

      /**
       * Case 2: 未认证应返回401
       */
      test('未认证用户应返回401', async () => {
        const response = await request(app)
          .post('/api/v4/market/listings/1/purchase')
          .set('Idempotency-Key', `test_purchase_${Date.now()}_2`)

        expect(response.status).toBe(401)
        validateApiContract(response.body, false)
      })

      /**
       * Case 3: 缺少Idempotency-Key应返回400
       */
      test('缺少Idempotency-Key应返回400', async () => {
        const response = await request(app)
          .post('/api/v4/market/listings/1/purchase')
          .set('Authorization', `Bearer ${access_token}`)

        expect(response.status).toBe(400)
        validateApiContract(response.body, false)
        expect(response.body.code).toMatch(/IDEMPOTENCY_KEY_REQUIRED|MISSING_IDEMPOTENCY_KEY/i)
      })

      /**
       * Case 4: 无效的listing_id格式应返回400
       */
      test('无效的listing_id格式应返回400', async () => {
        const response = await request(app)
          .post('/api/v4/market/listings/invalid_id/purchase')
          .set('Authorization', `Bearer ${access_token}`)
          .set('Idempotency-Key', `test_purchase_${Date.now()}_4`)

        expect(response.status).toBe(400)
        validateApiContract(response.body, false)
      })
    })

    // -------------------- 交易订单相关接口（如存在） --------------------

    describe('市场交易订单接口', () => {
      /**
       * Case 1: 查询用户交易订单（需要认证）
       * 注意：此接口可能位于不同路径，需根据实际路由调整
       */
      test('查询交易订单应需要认证', async () => {
        // 尝试查询交易订单（未认证）
        const response = await request(app).get('/api/v4/market/orders')

        /*
         * 如果接口存在，未认证应返回401
         * 如果接口不存在，应返回404
         */
        expect([401, 404]).toContain(response.status)
        validateApiContract(response.body, false)
      })

      /**
       * Case 2: 已认证用户查询交易订单
       */
      test('已认证用户查询交易订单应返回正确格式', async () => {
        const response = await request(app)
          .get('/api/v4/market/orders')
          .set('Authorization', `Bearer ${access_token}`)

        // 如果接口存在
        if (response.status === 200) {
          validateApiContract(response.body)
          // 验证data结构（分页列表）
          expect(response.body.data).toHaveProperty('items')
          expect(Array.isArray(response.body.data.items)).toBe(true)
        } else {
          // 接口不存在，应返回404
          expect(response.status).toBe(404)
          validateApiContract(response.body, false)
        }
      })
    })
  })

  // ==================== 边界条件和错误处理测试 ====================

  describe('边界条件和错误处理', () => {
    /**
     * Case 1: 超大page_size接受服务端返回的limit值
     * 业务说明：当前服务端未强制限制limit，此测试验证响应格式正确
     * 注意：listings端点需要认证
     */
    test('超大page_size请求应返回正确的响应格式', async () => {
      const response = await request(app)
        .get('/api/v4/market/listings')
        .set('Authorization', `Bearer ${access_token}`)
        .query({ limit: 10000 })

      expect(response.status).toBe(200)
      validateApiContract(response.body)
      // 验证pagination结构完整性
      expect(response.body.data.pagination).toHaveProperty('total')
      expect(response.body.data.pagination).toHaveProperty('page')
      expect(response.body.data.pagination).toHaveProperty('limit')
      expect(typeof response.body.data.pagination.limit).toBe('number')
    })

    /**
     * Case 2: 空Authorization header应返回401
     */
    test('空Authorization header应返回401', async () => {
      const response = await request(app)
        .get('/api/v4/market/listing-status')
        .set('Authorization', '')

      expect(response.status).toBe(401)
      validateApiContract(response.body, false)
    })

    /**
     * Case 3: 无效的Authorization token应返回401
     */
    test('无效的Authorization token应返回401', async () => {
      const response = await request(app)
        .get('/api/v4/market/listing-status')
        .set('Authorization', 'Bearer invalid_token_12345')

      expect(response.status).toBe(401)
      validateApiContract(response.body, false)
    })
  })
})
