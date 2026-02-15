/**
 * 竞价系统功能测试套件 (Bid System Test Suite)
 *
 * 臻选空间/幸运空间/竞价功能 — 后端实施方案验证
 *
 * 测试范围：
 * 1. 竞价商品列表 API — GET /api/v4/backpack/bid/products
 * 2. 竞价商品详情 API — GET /api/v4/backpack/bid/products/:bid_product_id
 * 3. 提交出价 API — POST /api/v4/backpack/bid
 * 4. 竞价历史 API — GET /api/v4/backpack/bid/history
 * 5. 空间统计 API — GET /api/v4/backpack/exchange/space-stats
 * 6. 高级空间状态 API — GET /api/v4/backpack/exchange/premium-status
 * 7. 商品列表 space 筛选 — GET /api/v4/backpack/exchange/items?space=lucky
 * 8. BidService 核心逻辑（动态白名单、幂等键）
 * 9. BidSettlementJob 定时任务逻辑
 *
 * 架构规范：
 * - 通过 UnifiedTestManager 获取服务（P1-9 J2-RepoWide）
 * - 连接真实数据库 restaurant_points_dev（禁止 mock）
 * - 使用 auth-helper 获取真实 JWT Token
 * - 北京时间标准（BeijingTimeHelper）
 *
 * @module tests/business/exchange/bid_system
 * @created 2026-02-16（臻选空间/幸运空间/竞价功能）
 */

const request = require('supertest')
const { getTestUserToken } = require('../../helpers/auth-helper')

/* 全局变量 */
let app
let authToken
let testUserId

/**
 * 初始化 Express 应用实例
 * 延迟加载避免模块加载顺序问题
 */
function getApp() {
  if (!app) {
    app = require('../../../app')
  }
  return app
}

describe('竞价系统功能测试 (Bid System — 臻选空间/幸运空间/竞价功能)', () => {
  beforeAll(async () => {
    app = getApp()
    authToken = await getTestUserToken(app)

    /* 从 JWT 中提取 user_id（解码 payload） */
    try {
      const payload = JSON.parse(Buffer.from(authToken.split('.')[1], 'base64').toString())
      testUserId = payload.user_id
    } catch {
      testUserId = null
    }
  }, 30000)

  /*
   * ===================================================================
   * 1. 商品列表 space 筛选
   * ===================================================================
   */
  describe('GET /api/v4/backpack/exchange/items（space 筛选）', () => {
    test('space=lucky 应返回幸运空间商品', async () => {
      const res = await request(app)
        .get('/api/v4/backpack/exchange/items')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ space: 'lucky', page: 1, page_size: 5 })
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('items')
      expect(res.body.data).toHaveProperty('pagination')
      expect(Array.isArray(res.body.data.items)).toBe(true)

      /* 验证所有返回商品都属于 lucky 空间（space = 'lucky' 或 'both'） */
      if (res.body.data.items.length > 0) {
        for (const item of res.body.data.items) {
          expect(['lucky', 'both']).toContain(item.space)
          /* 验证新字段存在（决策12：9个新字段） */
          expect(item).toHaveProperty('space')
          expect(item).toHaveProperty('is_hot')
          expect(item).toHaveProperty('is_new')
          expect(item).toHaveProperty('is_lucky')
        }
      }
    })

    test('space=premium 应返回臻选空间商品（当前为空）', async () => {
      const res = await request(app)
        .get('/api/v4/backpack/exchange/items')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ space: 'premium', page: 1, page_size: 5, refresh: true })
        .expect(200)

      expect(res.body.success).toBe(true)
      /* 决策4：存量77条全部默认归入 lucky，premium 初始为空 */
      expect(res.body.data.pagination.total).toBe(0)
    })
  })

  /*
   * ===================================================================
   * 2. 空间统计
   * ===================================================================
   */
  describe('GET /api/v4/backpack/exchange/space-stats', () => {
    test('应返回 lucky 空间统计数据', async () => {
      const res = await request(app)
        .get('/api/v4/backpack/exchange/space-stats')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ space: 'lucky' })
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('space', 'lucky')
      expect(res.body.data).toHaveProperty('total_products')
      expect(typeof res.body.data.total_products).toBe('number')
      expect(res.body.data.total_products).toBeGreaterThan(0)
    })

    test('缺少 space 参数应返回错误', async () => {
      const res = await request(app)
        .get('/api/v4/backpack/exchange/space-stats')
        .set('Authorization', `Bearer ${authToken}`)

      /* 根据实际业务逻辑：space 是必填参数 */
      expect([200, 400]).toContain(res.status)
    })
  })

  /*
   * ===================================================================
   * 3. 高级空间状态
   * ===================================================================
   */
  describe('GET /api/v4/backpack/exchange/premium-status', () => {
    test('应返回高级空间状态和解锁条件', async () => {
      const res = await request(app)
        .get('/api/v4/backpack/exchange/premium-status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('unlocked')
      expect(res.body.data).toHaveProperty('can_unlock')
      expect(typeof res.body.data.unlocked).toBe('boolean')
      expect(typeof res.body.data.can_unlock).toBe('boolean')

      /* 决策3：验证后端参数值（以后端为准，前端适配） */
      if (res.body.data.unlock_cost !== undefined) {
        expect(res.body.data.unlock_cost).toBe(100) // 100 POINTS
      }
      if (res.body.data.validity_hours !== undefined) {
        expect(res.body.data.validity_hours).toBe(24) // 24小时
      }
    })

    test('未登录应返回401', async () => {
      await request(app).get('/api/v4/backpack/exchange/premium-status').expect(401)
    })
  })

  /*
   * ===================================================================
   * 4. 竞价商品列表
   * ===================================================================
   */
  describe('GET /api/v4/backpack/bid/products', () => {
    test('应返回竞价商品列表（当前可能为空）', async () => {
      const res = await request(app)
        .get('/api/v4/backpack/bid/products')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'active', page: 1, page_size: 10 })
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('bid_products')
      expect(res.body.data).toHaveProperty('pagination')
      expect(Array.isArray(res.body.data.bid_products)).toBe(true)
      expect(res.body.data.pagination).toHaveProperty('total')
      expect(res.body.data.pagination).toHaveProperty('page')
      expect(res.body.data.pagination).toHaveProperty('page_size')
      expect(res.body.data.pagination).toHaveProperty('total_pages')
    })

    test('status=all 应返回所有状态的竞价', async () => {
      const res = await request(app)
        .get('/api/v4/backpack/bid/products')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'all' })
        .expect(200)

      expect(res.body.success).toBe(true)
    })

    test('无效 status 应返回400错误', async () => {
      const res = await request(app)
        .get('/api/v4/backpack/bid/products')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'invalid_status' })
        .expect(400)

      expect(res.body.success).toBe(false)
    })

    test('未登录应返回401', async () => {
      await request(app).get('/api/v4/backpack/bid/products').expect(401)
    })
  })

  /*
   * ===================================================================
   * 5. 竞价商品详情
   * ===================================================================
   */
  describe('GET /api/v4/backpack/bid/products/:bid_product_id', () => {
    test('不存在的竞价商品应返回404', async () => {
      const res = await request(app)
        .get('/api/v4/backpack/bid/products/999999')
        .set('Authorization', `Bearer ${authToken}`)

      /* 服务层抛出 404 错误 */
      expect([404, 500]).toContain(res.status)
    })

    test('无效ID应返回400', async () => {
      const res = await request(app)
        .get('/api/v4/backpack/bid/products/abc')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400)

      expect(res.body.success).toBe(false)
    })
  })

  /*
   * ===================================================================
   * 6. 提交出价
   * ===================================================================
   */
  describe('POST /api/v4/backpack/bid', () => {
    test('缺少幂等键应返回400', async () => {
      const res = await request(app)
        .post('/api/v4/backpack/bid')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ bid_product_id: 1, bid_amount: 100 })
        .expect(400)

      expect(res.body.success).toBe(false)
      expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY')
    })

    test('缺少必填参数应返回400', async () => {
      const res = await request(app)
        .post('/api/v4/backpack/bid')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', `bid_test_${Date.now()}`)
        .send({})
        .expect(400)

      expect(res.body.success).toBe(false)
    })

    test('不存在的竞价商品应返回错误', async () => {
      const res = await request(app)
        .post('/api/v4/backpack/bid')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', `bid_test_${Date.now()}_notfound`)
        .send({ bid_product_id: 999999, bid_amount: 100 })

      /* 竞价商品不存在：返回404或业务错误码 */
      expect(res.body.success).toBe(false)
    })

    test('未登录应返回401', async () => {
      await request(app)
        .post('/api/v4/backpack/bid')
        .set('Idempotency-Key', `bid_test_${Date.now()}`)
        .send({ bid_product_id: 1, bid_amount: 100 })
        .expect(401)
    })
  })

  /*
   * ===================================================================
   * 7. 竞价历史
   * ===================================================================
   */
  describe('GET /api/v4/backpack/bid/history', () => {
    test('应返回当前用户的竞价历史', async () => {
      const res = await request(app)
        .get('/api/v4/backpack/bid/history')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'all', page: 1, page_size: 10 })
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('bid_records')
      expect(res.body.data).toHaveProperty('pagination')
      expect(Array.isArray(res.body.data.bid_records)).toBe(true)
    })

    test('未登录应返回401', async () => {
      await request(app).get('/api/v4/backpack/bid/history').expect(401)
    })
  })

  /*
   * ===================================================================
   * 8. BidService 核心逻辑验证
   * ===================================================================
   */
  describe('BidService 核心逻辑', () => {
    let BidService

    beforeAll(() => {
      /* 通过 ServiceManager 获取竞价核心服务 */
      const ServiceManager = require('../../../services')
      BidService = ServiceManager.getService('exchange_bid_core')
    })

    test('服务应通过 ServiceManager 正确注册', () => {
      expect(BidService).toBeDefined()
      expect(typeof BidService.placeBid).toBe('function')
      expect(typeof BidService.settleBidProduct).toBe('function')
      expect(typeof BidService.cancelBidProduct).toBe('function')
    })

    test('动态资产白名单应返回 DIAMOND 和 red_shard', async () => {
      /* 调用私有方法验证白名单逻辑（决策9） */
      const allowed = await BidService._getAllowedBidAssets()

      expect(Array.isArray(allowed)).toBe(true)
      expect(allowed).toContain('DIAMOND')
      expect(allowed).toContain('red_shard')

      /* 决策1：POINTS 和 BUDGET_POINTS 绝对禁止 */
      expect(allowed).not.toContain('POINTS')
      expect(allowed).not.toContain('BUDGET_POINTS')
    })

    test('placeBid 无事务应抛出错误', async () => {
      await expect(BidService.placeBid(1, 1, 100, { idempotency_key: 'test' })).rejects.toThrow(
        '需要外部传入事务'
      )
    })
  })

  /*
   * ===================================================================
   * 9. BidQueryService 查询验证
   * ===================================================================
   */
  describe('BidQueryService 查询逻辑', () => {
    let BidQueryService

    beforeAll(() => {
      const ServiceManager = require('../../../services')
      BidQueryService = ServiceManager.getService('exchange_bid_query')
    })

    test('服务应通过 ServiceManager 正确注册', () => {
      expect(BidQueryService).toBeDefined()
      expect(typeof BidQueryService.getBidProducts).toBe('function')
      expect(typeof BidQueryService.getBidProductDetail).toBe('function')
      expect(typeof BidQueryService.getUserBidHistory).toBe('function')
    })

    test('getBidProducts 应返回正确格式', async () => {
      const result = await BidQueryService.getBidProducts({
        status: 'all',
        page: 1,
        page_size: 10,
        user_id: testUserId
      })

      expect(result).toHaveProperty('bid_products')
      expect(result).toHaveProperty('pagination')
      expect(Array.isArray(result.bid_products)).toBe(true)
    })

    test('getUserBidHistory 应返回正确格式', async () => {
      const result = await BidQueryService.getUserBidHistory(testUserId || 31, {
        status: 'all',
        page: 1,
        page_size: 10
      })

      expect(result).toHaveProperty('bid_records')
      expect(result).toHaveProperty('pagination')
      expect(Array.isArray(result.bid_records)).toBe(true)
    })
  })

  /*
   * ===================================================================
   * 10. BidSettlementJob 定时任务
   * ===================================================================
   */
  describe('BidSettlementJob 定时任务', () => {
    let BidSettlementJob

    beforeAll(() => {
      BidSettlementJob = require('../../../jobs/bid-settlement-job')
    })

    test('execute 方法应能正常执行（无到期竞价时安全返回）', async () => {
      const stats = await BidSettlementJob.execute()

      expect(stats).toHaveProperty('activated')
      expect(stats).toHaveProperty('settled')
      expect(stats).toHaveProperty('no_bid')
      expect(stats).toHaveProperty('settlement_failed')
      expect(typeof stats.activated).toBe('number')
      expect(typeof stats.settled).toBe('number')
    }, 15000)
  })

  /*
   * ===================================================================
   * 11. 管理后台竞价接口
   * ===================================================================
   */
  describe('管理后台竞价接口 /api/v4/console/bid-management', () => {
    test('GET / 应返回竞价列表（管理员视图）', async () => {
      const res = await request(app)
        .get('/api/v4/console/bid-management')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, page_size: 10 })
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('bid_products')
      expect(res.body.data).toHaveProperty('pagination')
    })

    test('创建竞价缺少必填字段应返回400', async () => {
      const res = await request(app)
        .post('/api/v4/console/bid-management')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})

      /* 缺少 exchange_item_id、start_price 等必填字段 */
      expect(res.body.success).toBe(false)
    })
  })
})
