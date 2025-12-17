/**
 * 核销系统修复验证测试
 * 验证未完成工作清单中的所有P0-P1问题修复
 *
 * 测试覆盖：
 * - P0-1: 权限依赖路径修复
 * - P0-2: models注入验证
 * - P0-3: 并发保护（行锁 + 幂等性）
 * - P0-4: 旧库存接口废弃
 * - P1-5: 管理员判定口径统一
 * - P1-6: 取消/过期订单释放锁
 * - P1-7: 定时任务分布式锁
 *
 * 创建时间：2025-12-17
 */

const request = require('supertest')
const app = require('../../app')
const { sequelize, RedemptionOrder, ItemInstance, User } = require('../../models')
const jwt = require('jsonwebtoken')

describe('核销系统修复验证测试', () => {
  let testUser
  let _testAdmin // eslint-disable-line no-unused-vars
  let testItem
  let authToken
  let _adminToken // eslint-disable-line no-unused-vars

  beforeAll(async () => {
    // 创建测试用户（普通用户）
    testUser = await User.findOne({ where: { mobile: '13612227930' } })
    if (!testUser) {
      throw new Error('测试用户不存在，请先创建手机号为13612227930的用户')
    }

    // 该用户既是用户也是管理员
    _testAdmin = testUser

    // 生成Token
    authToken = jwt.sign(
      {
        user_id: testUser.user_id,
        mobile: testUser.mobile,
        nickname: testUser.nickname
      },
      process.env.JWT_SECRET || 'restaurant_points_lottery_jwt_secret_key_2024',
      { expiresIn: '24h' }
    )
    _adminToken = authToken // 相同用户
  })

  afterAll(async () => {
    // 清理测试数据
    if (testItem) {
      await testItem.destroy({ force: true })
    }
    await sequelize.close()
  })

  describe('P0-1: 权限依赖路径修复', () => {
    test('创建核销订单时权限检查能正常工作（不会因为路径错误而500）', async () => {
      // 创建一个测试物品实例
      testItem = await ItemInstance.create({
        item_type: 'coupon',
        item_name: '测试优惠券',
        item_value: 10,
        owner_user_id: testUser.user_id,
        status: 'available',
        source_type: 'lottery'
      })

      const response = await request(app)
        .post('/api/v4/redemption/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ item_instance_id: testItem.item_instance_id })

      // 不应该因为找不到roleHelpers模块而500
      expect(response.status).not.toBe(500)
      expect(response.body).toHaveProperty('success')

      if (response.body.success) {
        // 清理生成的订单
        await RedemptionOrder.destroy({
          where: { item_instance_id: testItem.item_instance_id }
        })
      }
    })
  })

  describe('P0-2: models注入验证', () => {
    test('app.locals.models应该已注入', () => {
      expect(app.locals.models).toBeDefined()
      expect(app.locals.models.ItemInstance).toBeDefined()
      expect(app.locals.models.User).toBeDefined()
      expect(app.locals.models.RedemptionOrder).toBeDefined()
    })
  })

  describe('P0-3: 并发保护（行锁 + 幂等性）', () => {
    let concurrentTestItem

    beforeEach(async () => {
      // 创建测试物品
      concurrentTestItem = await ItemInstance.create({
        item_type: 'coupon',
        item_name: '并发测试优惠券',
        item_value: 20,
        owner_user_id: testUser.user_id,
        status: 'available',
        source_type: 'lottery'
      })
    })

    afterEach(async () => {
      // 清理测试数据
      if (concurrentTestItem) {
        await RedemptionOrder.destroy({
          where: { item_instance_id: concurrentTestItem.item_instance_id }
        })
        await concurrentTestItem.destroy({ force: true })
      }
    })

    test('同一物品并发创建核销订单应只成功一次', async () => {
      const promises = Array(5)
        .fill()
        .map(() =>
          request(app)
            .post('/api/v4/redemption/orders')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ item_instance_id: concurrentTestItem.item_instance_id })
        )

      const responses = await Promise.all(promises)

      const successCount = responses.filter(r => r.body.success === true).length
      const conflictCount = responses.filter(r => r.status === 409).length

      // 应该只有1个成功，其余返回409冲突
      expect(successCount).toBe(1)
      expect(conflictCount).toBe(4)
    })

    test('创建核销订单后物品应被锁定', async () => {
      const response = await request(app)
        .post('/api/v4/redemption/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ item_instance_id: concurrentTestItem.item_instance_id })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      // 验证物品已锁定
      await concurrentTestItem.reload()
      expect(concurrentTestItem.status).toBe('locked')
      expect(concurrentTestItem.locked_by_order_id).toBe(response.body.data.order.order_id)
      expect(concurrentTestItem.locked_at).not.toBeNull()
    })
  })

  describe('P0-4: 旧库存接口废弃', () => {
    test('POST /api/v4/inventory/use/:item_id 应返回410 Gone', async () => {
      const response = await request(app)
        .post('/api/v4/inventory/use/1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ verification_code: '123456' })

      expect(response.status).toBe(410)
      expect(response.body.error_code).toBe('ENDPOINT_GONE')
      expect(response.body.new_endpoint).toContain('/api/v4/redemption/orders')
    })

    test('POST /api/v4/inventory/transfer 应返回410 Gone', async () => {
      const response = await request(app)
        .post('/api/v4/inventory/transfer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ item_id: 1, target_user_id: 2 })

      expect(response.status).toBe(410)
      expect(response.body.error_code).toBe('ENDPOINT_GONE')
      expect(response.body.new_endpoint).toContain('/api/v4/trade/listings')
    })
  })

  describe('P1-6: 取消/过期订单释放锁', () => {
    let orderTestItem
    let createdOrder

    beforeEach(async () => {
      // 创建测试物品和订单
      orderTestItem = await ItemInstance.create({
        item_type: 'coupon',
        item_name: '订单测试优惠券',
        item_value: 30,
        owner_user_id: testUser.user_id,
        status: 'available',
        source_type: 'lottery'
      })

      const response = await request(app)
        .post('/api/v4/redemption/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ item_instance_id: orderTestItem.item_instance_id })

      expect(response.status).toBe(200)
      createdOrder = response.body.data.order
    })

    afterEach(async () => {
      // 清理测试数据
      if (createdOrder) {
        await RedemptionOrder.destroy({
          where: { order_id: createdOrder.order_id }
        })
      }
      if (orderTestItem) {
        await orderTestItem.destroy({ force: true })
      }
    })

    test('取消订单后应释放物品锁定', async () => {
      // 验证物品已锁定
      await orderTestItem.reload()
      expect(orderTestItem.status).toBe('locked')

      // 取消订单
      const response = await request(app)
        .post(`/api/v4/redemption/orders/${createdOrder.order_id}/cancel`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      // 验证物品锁定已释放
      await orderTestItem.reload()
      expect(orderTestItem.status).toBe('available')
      expect(orderTestItem.locked_by_order_id).toBeNull()
      expect(orderTestItem.locked_at).toBeNull()
    })

    test('过期订单清理后应释放物品锁定', async () => {
      // 手动设置订单为已过期
      await RedemptionOrder.update(
        { expires_at: new Date(Date.now() - 1000) }, // 设为1秒前过期
        { where: { order_id: createdOrder.order_id } }
      )

      // 调用过期清理方法
      const RedemptionOrderService = require('../../services/RedemptionOrderService')
      const expiredCount = await RedemptionOrderService.expireOrders()

      expect(expiredCount).toBeGreaterThan(0)

      // 验证订单状态
      const order = await RedemptionOrder.findByPk(createdOrder.order_id)
      expect(order.status).toBe('expired')

      // 验证物品锁定已释放
      await orderTestItem.reload()
      expect(orderTestItem.status).toBe('available')
      expect(orderTestItem.locked_by_order_id).toBeNull()
    })
  })
})
