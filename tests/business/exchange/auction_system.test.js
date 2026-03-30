/**
 * C2C 拍卖系统功能测试套件 (Auction System Test Suite)
 *
 * C2C用户间竞拍功能 — 完整业务流程验证
 *
 * 测试范围：
 * 1. 拍卖列表 API — GET /api/v4/marketplace/auctions
 * 2. 创建拍卖 API — POST /api/v4/marketplace/auctions
 * 3. 拍卖详情 API — GET /api/v4/marketplace/auctions/:id
 * 4. 我的拍卖 API — GET /api/v4/marketplace/auctions/my
 * 5. 卖方取消 API — POST /api/v4/marketplace/auctions/:id/cancel
 * 6. AuctionService 核心方法验证
 * 7. AuctionSettlementJob 定时任务逻辑
 *
 * 架构规范：
 * - 连接真实数据库 restaurant_points_dev（禁止 mock）
 * - 使用 auth-helper 获取真实 JWT Token
 * - 测试账号：13612227930（user_id=31，管理员+用户）
 *
 * @module tests/business/exchange/auction_system
 * @created 2026-03-24（C2C用户间竞拍功能）
 */

const request = require('supertest')
const { getTestUserToken } = require('../../helpers/auth-helper')

let app
let authToken

function getApp() {
  if (!app) {
    app = require('../../../app')
  }
  return app
}

describe('C2C拍卖系统功能测试 (Auction System)', () => {
  beforeAll(async () => {
    app = getApp()
    authToken = await getTestUserToken(app)
  }, 30000)

  // ====== 1. 拍卖列表 API ======
  describe('GET /api/v4/marketplace/auctions - 拍卖列表', () => {
    it('应返回拍卖列表和分页信息', async () => {
      const res = await request(app)
        .get('/api/v4/marketplace/auctions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('auction_listings')
      expect(res.body.data).toHaveProperty('pagination')
      expect(Array.isArray(res.body.data.auction_listings)).toBe(true)
      expect(res.body.data.pagination).toHaveProperty('page')
      expect(res.body.data.pagination).toHaveProperty('total')
    })

    it('应支持状态筛选', async () => {
      const res = await request(app)
        .get('/api/v4/marketplace/auctions?status=active')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(res.body.success).toBe(true)
    })
  })

  // ====== 2. 我的拍卖 / 我的出价 ======
  describe('GET /api/v4/marketplace/auctions/my - 我的拍卖', () => {
    it('应返回当前用户发起的拍卖', async () => {
      const res = await request(app)
        .get('/api/v4/marketplace/auctions/my')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('auction_listings')
    })
  })

  describe('GET /api/v4/marketplace/auctions/my-bids - 我的出价', () => {
    it('应返回当前用户的出价记录', async () => {
      const res = await request(app)
        .get('/api/v4/marketplace/auctions/my-bids')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('auction_bids')
    })
  })

  // ====== 3. 创建拍卖 API ======
  describe('POST /api/v4/marketplace/auctions - 创建拍卖', () => {
    it('缺少 item_id 应返回400', async () => {
      const res = await request(app)
        .post('/api/v4/marketplace/auctions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', `test_auction_${Date.now()}_missing_item`)
        .send({
          start_price: 100,
          start_time: new Date(Date.now() + 60000).toISOString(),
          end_time: new Date(Date.now() + 3 * 3600000).toISOString()
        })
        .expect(400)

      expect(res.body.success).toBe(false)
    })

    it('缺少 start_price 应返回400', async () => {
      const res = await request(app)
        .post('/api/v4/marketplace/auctions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', `test_auction_${Date.now()}_missing_price`)
        .send({
          item_id: 6138,
          start_time: new Date(Date.now() + 60000).toISOString(),
          end_time: new Date(Date.now() + 3 * 3600000).toISOString()
        })
        .expect(400)

      expect(res.body.success).toBe(false)
    })

    it('未认证请求应返回401', async () => {
      const res = await request(app)
        .post('/api/v4/marketplace/auctions')
        .set('Idempotency-Key', `test_auction_${Date.now()}_noauth`)
        .send({
          item_id: 6138,
          start_price: 100,
          start_time: new Date(Date.now() + 60000).toISOString(),
          end_time: new Date(Date.now() + 3 * 3600000).toISOString()
        })
        .expect(401)

      expect(res.body.success).toBe(false)
    })
  })

  // ====== 4. 拍卖详情 ======
  describe('GET /api/v4/marketplace/auctions/:id - 拍卖详情', () => {
    it('不存在的拍卖应返回404', async () => {
      const res = await request(app)
        .get('/api/v4/marketplace/auctions/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404)

      expect(res.body.success).toBe(false)
    })
  })

  // ====== 5. AuctionService 核心逻辑验证 ======
  describe('AuctionService 核心方法', () => {
    it('auction_core 服务应已注册在 ServiceManager 中', () => {
      const services = app.locals.services
      const auctionService = services.getService('auction_core')
      expect(auctionService).toBeDefined()
      expect(typeof auctionService.createAuction).toBe('function')
      expect(typeof auctionService.placeBid).toBe('function')
      expect(typeof auctionService.settleAuction).toBe('function')
      expect(typeof auctionService.cancelAuction).toBe('function')
      expect(typeof auctionService.handleNoBid).toBe('function')
    })

    it('auction_query 服务应已注册在 ServiceManager 中', () => {
      const services = app.locals.services
      const queryService = services.getService('auction_query')
      expect(queryService).toBeDefined()
      expect(typeof queryService.getAuctionListings).toBe('function')
      expect(typeof queryService.getAuctionDetail).toBe('function')
      expect(typeof queryService.getUserAuctions).toBe('function')
      expect(typeof queryService.getUserBidHistory).toBe('function')
    })
  })

  // ====== 6. AuctionSettlementJob ======
  describe('AuctionSettlementJob 定时任务', () => {
    it('execute() 应正常返回统计结果', async () => {
      const AuctionSettlementJob = require('../../../jobs/auction-settlement-job')
      const stats = await AuctionSettlementJob.execute()

      expect(stats).toHaveProperty('activated')
      expect(stats).toHaveProperty('settled')
      expect(stats).toHaveProperty('no_bid')
      expect(stats).toHaveProperty('settlement_failed')
      expect(stats).toHaveProperty('retried')
      expect(stats).toHaveProperty('retry_exhausted')
      expect(typeof stats.activated).toBe('number')
    })
  })

  // ====== 7. 数据库表结构验证 ======
  describe('数据库表结构验证', () => {
    it('auction_listings 表应存在且结构正确', async () => {
      const { sequelize } = require('../../../models')
      const [columns] = await sequelize.query('DESCRIBE auction_listings')
      const columnNames = columns.map(c => c.Field)

      expect(columnNames).toContain('auction_listing_id')
      expect(columnNames).toContain('seller_user_id')
      expect(columnNames).toContain('item_id')
      expect(columnNames).toContain('price_asset_code')
      expect(columnNames).toContain('start_price')
      expect(columnNames).toContain('current_price')
      expect(columnNames).toContain('buyout_price')
      expect(columnNames).toContain('status')
      expect(columnNames).toContain('fee_rate')
      expect(columnNames).toContain('gross_amount')
      expect(columnNames).toContain('fee_amount')
      expect(columnNames).toContain('net_amount')
      expect(columnNames).toContain('item_snapshot')
      expect(columnNames).toContain('retry_count')
    })

    it('auction_bids 表应存在且结构正确', async () => {
      const { sequelize } = require('../../../models')
      const [columns] = await sequelize.query('DESCRIBE auction_bids')
      const columnNames = columns.map(c => c.Field)

      expect(columnNames).toContain('auction_bid_id')
      expect(columnNames).toContain('auction_listing_id')
      expect(columnNames).toContain('user_id')
      expect(columnNames).toContain('bid_amount')
      expect(columnNames).toContain('is_winning')
      expect(columnNames).toContain('is_final_winner')
      expect(columnNames).toContain('idempotency_key')
    })
  })
})
