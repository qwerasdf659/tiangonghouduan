/**
 * 商品兑换审核流程完整测试（V4架构迁移版本）
 *
 * **原文件**: tests/api/exchange-audit-workflow.test.js
 * **迁移日期**: 2025年11月12日 北京时间
 * **业务域**: 兑换审核 - 完整工作流
 * **优先级**: P1 (核心业务功能)
 *
 * **测试场景**:
 * 1. 用户兑换商品（积分预扣，创建pending订单）
 * 2. 管理员审核通过（发放库存，积分已扣）
 * 3. 管理员审核拒绝（退回积分，恢复库存）
 * 4. 用户取消兑换（pending状态可取消）
 * 5. 批量审核功能
 * 6. 超时订单告警
 * 7. 数据一致性检查
 *
 * **创建时间**: 2025-10-10
 */

const request = require('supertest')
const app = require('../../../app')
const {
  sequelize,
  User,
  Product,
  ExchangeRecords,
  UserPointsAccount,
  PointsTransaction,
  UserInventory
} = require('../../../models')
const { TEST_DATA } = require('../../helpers/test-data')
const PointsService = require('../../../services/PointsService')
// 服务重命名（2025-10-12）：AuditManagementService → ExchangeOperationService
const ExchangeOperationService = require('../../../services/ExchangeOperationService')
// const DataConsistencyChecker = require('../../../scripts/archived/data-consistency-check') // 已归档，暂时不测试

describe('商品兑换审核流程完整测试（V4架构）', () => {
  let testUser, adminUser, testProduct, authToken, adminToken

  beforeAll(async () => {
    // 清理测试数据
    await ExchangeRecords.destroy({ where: {}, force: true })
    await UserInventory.destroy({ where: {}, force: true })
    await PointsTransaction.destroy({ where: {}, force: true })
    await UserPointsAccount.destroy({ where: {}, force: true })

    // 创建测试用户（使用统一测试数据）
    testUser = await User.findOne({ where: { mobile: TEST_DATA.users.testUser.mobile } })
    if (!testUser) {
      throw new Error(`测试用户${TEST_DATA.users.testUser.mobile}不存在`)
    }

    // 确保测试用户是管理员
    adminUser = testUser

    // 创建测试商品
    testProduct = await Product.create({
      name: '测试商品-审核流程',
      description: '用于测试审核流程的商品',
      category: '实物商品',
      exchange_points: 100,
      stock: 10,
      space: 'lucky',
      status: 'active',
      requires_audit: true
    })

    // 给测试用户充值积分
    await PointsService.addPoints(testUser.user_id, 1000, {
      business_type: 'test',
      source_type: 'test',
      title: '测试充值'
    })

    // 获取认证token（模拟登录）
    const loginRes = await request(app).post('/api/v4/auth/login').send({
      mobile: TEST_DATA.users.testUser.mobile,
      verification_code: TEST_DATA.auth.verificationCode
    })

    // 添加调试输出
    if (!loginRes.body.success) {
      console.error('登录失败:', JSON.stringify(loginRes.body, null, 2))
      throw new Error(`登录失败: ${loginRes.body.message || '未知错误'}`)
    }

    console.log('登录成功, Token:', loginRes.body.data.access_token.substring(0, 50) + '...')

    authToken = loginRes.body.data.access_token
    adminToken = authToken
  })

  afterAll(async () => {
    // 清理测试数据
    if (testProduct) {
      await testProduct.destroy()
    }
    await sequelize.close()
  })

  describe('场景1: 用户兑换商品（严格人工审核模式）', () => {
    let exchangeId

    test('用户发起兑换，应立即扣除积分并创建pending订单', async () => {
      // 获取兑换前积分
      const beforePoints = await PointsService.getPointsBalance(testUser.user_id)

      // 发起兑换
      const res = await request(app)
        .post('/api/v4/inventory/exchange')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          product_id: testProduct.product_id,
          quantity: 1
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('exchange_id')
      expect(res.body.data.needs_audit).toBe(true)
      expect(res.body.data.audit_status).toBe('pending')

      exchangeId = res.body.data.exchange_id

      // 验证积分已扣除
      const afterPoints = await PointsService.getPointsBalance(testUser.user_id)
      expect(afterPoints.available_points).toBe(beforePoints.available_points - 100)

      // 验证订单状态
      const exchangeRecord = await ExchangeRecords.findByPk(exchangeId)
      expect(exchangeRecord).toBeTruthy()
      expect(exchangeRecord.status).toBe('pending')
      expect(exchangeRecord.audit_status).toBe('pending')
      expect(exchangeRecord.requires_audit).toBe(true)
    })

    test('pending状态订单不应发放库存', async () => {
      const inventory = await UserInventory.findOne({
        where: {
          user_id: testUser.user_id,
          source_id: exchangeId.toString()
        }
      })

      expect(inventory).toBeNull()
    })
  })

  describe('场景2: 管理员审核通过', () => {
    let exchangeId

    beforeAll(async () => {
      // 创建一个待审核订单
      const res = await request(app)
        .post('/api/v4/inventory/exchange')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          product_id: testProduct.product_id,
          quantity: 1
        })

      exchangeId = res.body.data.exchange_id
    })

    test('管理员审核通过，应发放库存', async () => {
      // 获取兑换记录
      const exchangeRecord = await ExchangeRecords.findByPk(exchangeId)

      // 审核通过
      await exchangeRecord.approve(adminUser.user_id, '审核通过')

      // 验证订单状态
      const updatedRecord = await ExchangeRecords.findByPk(exchangeId)
      expect(updatedRecord.status).toBe('distributed')
      expect(updatedRecord.audit_status).toBe('approved')
      expect(updatedRecord.auditor_id).toBe(adminUser.user_id)

      // 验证库存已发放
      const inventory = await UserInventory.findAll({
        where: {
          user_id: testUser.user_id,
          source_id: exchangeId.toString()
        }
      })

      expect(inventory.length).toBe(1)
      expect(inventory[0].status).toBe('available')
    })
  })

  describe('场景3: 管理员审核拒绝', () => {
    let exchangeId, beforePoints

    beforeAll(async () => {
      // 获取当前积分
      beforePoints = await PointsService.getPointsBalance(testUser.user_id)

      // 创建一个待审核订单
      const res = await request(app)
        .post('/api/v4/inventory/exchange')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          product_id: testProduct.product_id,
          quantity: 1
        })

      exchangeId = res.body.data.exchange_id
    })

    test('管理员审核拒绝，应退回积分并恢复库存', async () => {
      // 获取商品当前库存
      const beforeStock = testProduct.stock

      // 获取兑换记录
      const exchangeRecord = await ExchangeRecords.findByPk(exchangeId)

      // 审核拒绝
      await exchangeRecord.reject(adminUser.user_id, '测试拒绝原因')

      // 验证订单状态
      const updatedRecord = await ExchangeRecords.findByPk(exchangeId)
      expect(updatedRecord.status).toBe('cancelled')
      expect(updatedRecord.audit_status).toBe('rejected')
      expect(updatedRecord.audit_reason).toBe('测试拒绝原因')

      // 验证积分已退回
      const afterPoints = await PointsService.getPointsBalance(testUser.user_id)
      expect(afterPoints.available_points).toBeGreaterThanOrEqual(beforePoints.available_points)

      // 验证库存已恢复
      await testProduct.reload()
      expect(testProduct.stock).toBe(beforeStock + 1)

      // 验证未发放库存
      const inventory = await UserInventory.findAll({
        where: {
          user_id: testUser.user_id,
          source_id: exchangeId.toString()
        }
      })

      expect(inventory.length).toBe(0)
    })
  })

  describe('场景4: 用户取消兑换（pending状态）', () => {
    let exchangeId, beforePoints

    beforeAll(async () => {
      // 获取当前积分
      beforePoints = await PointsService.getPointsBalance(testUser.user_id)

      // 创建一个待审核订单
      const res = await request(app)
        .post('/api/v4/inventory/exchange')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          product_id: testProduct.product_id,
          quantity: 1
        })

      // 添加调试输出
      if (!res.body.success) {
        console.error('场景4 - 兑换创建失败:', JSON.stringify(res.body, null, 2))
        console.error('商品ID:', testProduct.product_id)
        console.error('用户积分:', beforePoints)
        throw new Error(`兑换创建失败: ${res.body.message || '未知错误'}`)
      }

      exchangeId = res.body.data.exchange_id
    })

    test('用户可以取消pending状态的订单', async () => {
      const res = await request(app)
        .post(`/api/v4/inventory/exchange-records/${exchangeId}/cancel`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reason: '用户测试取消'
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.status).toBe('cancelled')

      // 验证积分已退回
      const afterPoints = await PointsService.getPointsBalance(testUser.user_id)
      expect(afterPoints.available_points).toBeGreaterThanOrEqual(beforePoints.available_points)
    })

    test('已审核通过的订单不能取消', async () => {
      // 创建并审核通过一个订单
      const res1 = await request(app)
        .post('/api/v4/inventory/exchange')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          product_id: testProduct.product_id,
          quantity: 1
        })

      const approvedExchangeId = res1.body.data.exchange_id
      const exchangeRecord = await ExchangeRecords.findByPk(approvedExchangeId)
      await exchangeRecord.approve(adminUser.user_id, '审核通过')

      // 尝试取消
      const res2 = await request(app)
        .post(`/api/v4/inventory/exchange-records/${approvedExchangeId}/cancel`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reason: '尝试取消已审核订单'
        })

      expect(res2.status).toBe(400)
      expect(res2.body.success).toBe(false)
    })
  })

  describe('场景5: 批量审核功能', () => {
    const exchangeIds = []

    beforeAll(async () => {
      // 创建3个待审核订单
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/api/v4/inventory/exchange')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            product_id: testProduct.product_id,
            quantity: 1
          })

        exchangeIds.push(res.body.data.exchange_id)
      }
    })

    test('批量审核通过多个订单', async () => {
      const res = await request(app)
        .post('/api/v4/audit-management/batch-approve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          exchange_ids: exchangeIds,
          reason: '批量审核通过测试'
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.success.length).toBe(3)
      expect(res.body.data.failed.length).toBe(0)

      // 验证所有订单都已通过
      for (const exchangeId of exchangeIds) {
        const record = await ExchangeRecords.findByPk(exchangeId)
        expect(record.audit_status).toBe('approved')
        expect(record.status).toBe('distributed')
      }
    })
  })

  describe('场景6: 超时订单检查', () => {
    test('检查超时待审核订单', async () => {
      const result = await ExchangeOperationService.checkTimeoutAndAlert(24)

      expect(result).toHaveProperty('hasTimeout')
      expect(result).toHaveProperty('count')
      expect(result).toHaveProperty('orders')

      if (result.hasTimeout) {
        console.log(`发现${result.count}个超时订单`)
      }
    })

    test('获取待审核订单统计', async () => {
      const statistics = await ExchangeOperationService.getPendingOrdersStatistics()

      expect(statistics).toHaveProperty('total')
      expect(statistics).toHaveProperty('over24h')
      expect(statistics).toHaveProperty('over72h')

      console.log('待审核订单统计:', statistics)
    })
  })

  /*
   * describe('场景7: 数据一致性检查', () => {
   *   test('执行数据一致性检查', async () => {
   *     const results = await DataConsistencyChecker.performFullCheck()
   */

  /*
   *     expect(results).toHaveProperty('checks')
   *     expect(results).toHaveProperty('fixes')
   *     expect(results).toHaveProperty('errors')
   */

  /*
   *     console.log('数据一致性检查结果:', {
   *       checks: results.checks.length,
   *       fixes: results.fixes.length,
   *       errors: results.errors.length
   *     })
   *   })
   * })
   */
})
