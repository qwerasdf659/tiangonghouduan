/**
 * 集成测试 - 客服工单订单关联（order_type + order_id 多态字段）
 *
 * 测试目标：
 * - 验证工单创建时可正确关联订单（order_type + order_id）
 * - 验证工单列表可按 order_type/order_id 筛选
 * - 验证用户订单聚合查询 API 正常工作
 * - 验证纠纷创建使用新的多态字段
 *
 * 技术规范：
 * - 使用真实数据库数据（禁止mock）
 * - 通过 ServiceManager 获取服务
 * - 使用 snake_case 命名约定
 * - 符合 ApiResponse 标准格式
 *
 * @date 2026-05-27
 */

const request = require('supertest')
const app = require('../../app')
const { sequelize } = require('../../models')
const { testCleaner, cleanupAfterEach } = require('../helpers/TestDataCleaner')

/** 测试用户：13612227930，user_id=31 */
const TEST_USER_MOBILE = '13612227930'
const TEST_USER_ID = 31
const TEST_VERIFICATION_CODE = '123456'

let authToken = null

beforeAll(async () => {
  const res = await request(app)
    .post('/api/v4/auth/login')
    .send({ mobile: TEST_USER_MOBILE, verification_code: TEST_VERIFICATION_CODE })

  expect(res.body.success).toBe(true)
  authToken = res.body.data.access_token
})

afterEach(async () => {
  await cleanupAfterEach()
})

afterAll(async () => {
  await sequelize.query("DELETE FROM customer_service_issues WHERE title LIKE '%集成测试%'", {
    type: sequelize.QueryTypes.DELETE
  })
})

describe('客服工单 - 订单多态关联', () => {
  describe('POST /api/v4/console/customer-service/issues（带订单关联）', () => {
    it('创建工单时可关联交易订单', async () => {
      const res = await request(app)
        .post('/api/v4/console/customer-service/issues')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          user_id: TEST_USER_ID,
          issue_type: 'asset',
          title: '集成测试-交易订单关联',
          description: '验证 order_type=trade 关联',
          priority: 'medium',
          order_type: 'trade',
          order_id: '9348'
        })

      expect(res.body.success).toBe(true)
      expect(res.body.data.order_type).toBe('trade')
      expect(res.body.data.order_id).toBe('9348')
      expect(res.body.data.issue_id).toBeGreaterThan(0)
    })

    it('创建工单时可关联兑换订单', async () => {
      const res = await request(app)
        .post('/api/v4/console/customer-service/issues')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          user_id: TEST_USER_ID,
          issue_type: 'item',
          title: '集成测试-兑换订单关联',
          priority: 'low',
          order_type: 'redemption',
          order_id: 'test-uuid-1234'
        })

      expect(res.body.success).toBe(true)
      expect(res.body.data.order_type).toBe('redemption')
      expect(res.body.data.order_id).toBe('test-uuid-1234')
    })

    it('创建工单时不关联订单也正常工作', async () => {
      const res = await request(app)
        .post('/api/v4/console/customer-service/issues')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          user_id: TEST_USER_ID,
          issue_type: 'other',
          title: '集成测试-无订单关联',
          priority: 'low'
        })

      expect(res.body.success).toBe(true)
      expect(res.body.data.order_type).toBeNull()
      expect(res.body.data.order_id).toBeNull()
    })
  })

  describe('GET /api/v4/console/customer-service/issues（按订单筛选）', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v4/console/customer-service/issues')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          user_id: TEST_USER_ID,
          issue_type: 'asset',
          title: '集成测试-筛选用',
          order_type: 'trade',
          order_id: '8888'
        })
    })

    it('可按 order_type 筛选工单', async () => {
      const res = await request(app)
        .get('/api/v4/console/customer-service/issues?order_type=trade')
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.body.success).toBe(true)
      expect(res.body.data.rows.length).toBeGreaterThan(0)
      res.body.data.rows.forEach(row => {
        expect(row.order_type).toBe('trade')
      })
    })

    it('可按 order_type + order_id 精确筛选', async () => {
      const res = await request(app)
        .get('/api/v4/console/customer-service/issues?order_type=trade&order_id=8888')
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.body.success).toBe(true)
      expect(res.body.data.count).toBeGreaterThanOrEqual(1)
      expect(res.body.data.rows[0].order_id).toBe('8888')
    })
  })
})

describe('客服工作台 - 用户订单聚合查询', () => {
  describe('GET /api/v4/console/customer-service/user-orders/:user_id', () => {
    it('返回用户的聚合订单列表', async () => {
      const res = await request(app)
        .get(`/api/v4/console/customer-service/user-orders/${TEST_USER_ID}`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.body.success).toBe(true)
      expect(res.body.data.total).toBeGreaterThan(0)
      expect(res.body.data.page).toBe(1)
      expect(Array.isArray(res.body.data.orders)).toBe(true)

      const order = res.body.data.orders[0]
      expect(order).toHaveProperty('order_type')
      expect(order).toHaveProperty('order_id')
      expect(order).toHaveProperty('order_no')
      expect(order).toHaveProperty('status')
      expect(order).toHaveProperty('created_at')
      expect(order).toHaveProperty('issue_count')
      expect(['trade', 'redemption', 'consumption']).toContain(order.order_type)
    })

    it('支持分页参数', async () => {
      const res = await request(app)
        .get(`/api/v4/console/customer-service/user-orders/${TEST_USER_ID}?page=1&page_size=5`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.body.success).toBe(true)
      expect(res.body.data.orders.length).toBeLessThanOrEqual(5)
      expect(res.body.data.page_size).toBe(5)
    })

    it('无效用户ID返回错误', async () => {
      const res = await request(app)
        .get('/api/v4/console/customer-service/user-orders/0')
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.body.success).toBe(false)
    })

    it('订单按时间倒序排列', async () => {
      const res = await request(app)
        .get(`/api/v4/console/customer-service/user-orders/${TEST_USER_ID}?page_size=10`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.body.success).toBe(true)
      const orders = res.body.data.orders
      for (let i = 1; i < orders.length; i++) {
        expect(new Date(orders[i - 1].created_at).getTime()).toBeGreaterThanOrEqual(
          new Date(orders[i].created_at).getTime()
        )
      }
    })
  })
})
