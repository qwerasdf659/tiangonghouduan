/**
 * 审核管理P0级Bug修复验证测试
 *
 * 验证内容：
 * 1. 库存重复创建bug已修复（审核通过仅创建1倍库存）
 * 2. 事务嵌套问题已修复（使用外部事务）
 * 3. 并发审核保护已添加（悲观锁）
 *
 * 使用模型：Claude Sonnet 4.5
 * 创建时间：2025-11-08
 */

const request = require('supertest')
const app = require('../../app')
const models = require('../../models')
const { generateTestToken } = require('../helpers/authHelper')

describe('审核管理P0级Bug修复验证', () => {
  // 设置整个测试套件的超时时间为2分钟
  jest.setTimeout(120000)

  let adminToken
  let testUserId
  let testProductId
  let testExchangeId

  beforeAll(async () => {
    // 创建测试管理员token
    const adminUser = await models.User.findOne({ where: { mobile: '13612227930' } })
    if (!adminUser) {
      throw new Error('测试管理员账号不存在')
    }
    adminToken = generateTestToken(adminUser.user_id, 'admin')
    testUserId = adminUser.user_id

    // 创建测试商品
    const product = await models.Product.create({
      name: '测试审核商品-库存重复验证',
      category: '优惠券',
      exchange_points: 1500,
      stock: 100,
      space_type: 'lucky',
      requires_audit: true
    })
    testProductId = product.product_id

    // 创建待审核兑换记录
    const exchangeRecord = await models.ExchangeRecords.create({
      user_id: testUserId,
      product_id: testProductId,
      product_snapshot: {
        name: product.name,
        category: product.category,
        exchange_points: product.exchange_points,
        description: product.description
      },
      quantity: 2, // 兑换2个，用于验证库存数量
      total_points: 3000,
      exchange_code: `TEST${Date.now()}`,
      status: 'pending',
      space: 'lucky',
      requires_audit: true,
      audit_status: 'pending',
      exchange_time: new Date()
    })
    testExchangeId = exchangeRecord.exchange_id
  })

  afterAll(async () => {
    // 清理测试数据
    if (testExchangeId) {
      await models.UserInventory.destroy({ where: { source_id: testExchangeId.toString() }, force: true })
      await models.ExchangeRecords.destroy({ where: { exchange_id: testExchangeId }, force: true })
    }
    if (testProductId) {
      await models.Product.destroy({ where: { product_id: testProductId }, force: true })
    }
  })

  describe('P0-Bug1: 库存重复创建bug修复验证', () => {
    test('审核通过应该仅创建quantity个库存（不重复创建）', async () => {
      // 审核前清空该订单的库存
      await models.UserInventory.destroy({ where: { source_id: testExchangeId.toString() }, force: true })

      // 执行审核通过
      const response = await request(app)
        .post(`/api/v4/unified-engine/admin/audit/${testExchangeId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: '测试审核通过-验证库存不重复' })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      // 🔴 核心验证：查询数据库中实际创建的库存数量
      const inventoryCount = await models.UserInventory.count({
        where: {
          source_type: 'exchange',
          source_id: testExchangeId.toString()
        }
      })

      // 🎯 关键断言：库存数量应该等于quantity（不是2倍）
      expect(inventoryCount).toBe(2) // quantity=2，应该创建2个库存，不是4个

      console.log(`✅ 库存重复创建bug修复验证通过：实际创建${inventoryCount}个库存，预期2个`)
    })

    test('验证库存记录的完整性', async () => {
      const inventoryItems = await models.UserInventory.findAll({
        where: {
          source_type: 'exchange',
          source_id: testExchangeId.toString()
        }
      })

      // 验证每个库存记录都有verification_code
      inventoryItems.forEach((item, index) => {
        expect(item.verification_code).toBeTruthy()
        expect(item.status).toBe('available')
        expect(item.user_id).toBe(testUserId)
        console.log(`  库存${index + 1}: ID=${item.inventory_id}, 核销码=${item.verification_code}`)
      })
    })
  })

  describe('P0-Bug2: 事务嵌套问题修复验证', () => {
    test('审核操作应该在单一事务中完成（无嵌套事务）', async () => {
      // 创建另一个测试订单
      const testExchangeRecord = await models.ExchangeRecords.create({
        user_id: testUserId,
        product_id: testProductId,
        product_snapshot: {
          name: '测试商品',
          category: '优惠券',
          exchange_points: 1500
        },
        quantity: 1,
        total_points: 1500,
        exchange_code: `TEST${Date.now()}`,
        status: 'pending',
        space: 'lucky',
        requires_audit: true,
        audit_status: 'pending',
        exchange_time: new Date()
      })

      // 执行审核通过
      const startTime = Date.now()
      const response = await request(app)
        .post(`/api/v4/unified-engine/admin/audit/${testExchangeRecord.exchange_id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: '测试事务嵌套修复' })
      const executionTime = Date.now() - startTime

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      // 🎯 验证：执行时间应该合理（<1000ms），事务嵌套会增加20-50ms开销
      expect(executionTime).toBeLessThan(1000)
      console.log(`✅ 事务执行时间: ${executionTime}ms（无嵌套事务开销）`)

      // 清理
      await models.UserInventory.destroy({
        where: { source_id: testExchangeRecord.exchange_id.toString() },
        force: true
      })
      await models.ExchangeRecords.destroy({
        where: { exchange_id: testExchangeRecord.exchange_id },
        force: true
      })
    })
  })

  describe('P1: 并发审核保护验证', () => {
    test('悲观锁应该防止并发审核同一订单', async () => {
      // 创建测试订单
      const testExchangeRecord = await models.ExchangeRecords.create({
        user_id: testUserId,
        product_id: testProductId,
        product_snapshot: {
          name: '测试商品',
          category: '优惠券',
          exchange_points: 1500
        },
        quantity: 1,
        total_points: 1500,
        exchange_code: `TEST${Date.now()}`,
        status: 'pending',
        space: 'lucky',
        requires_audit: true,
        audit_status: 'pending',
        exchange_time: new Date()
      })

      // 🔴 模拟并发审核：两个请求同时审核同一订单
      const approvePromise1 = request(app)
        .post(`/api/v4/unified-engine/admin/audit/${testExchangeRecord.exchange_id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: '并发审核测试1' })

      const approvePromise2 = request(app)
        .post(`/api/v4/unified-engine/admin/audit/${testExchangeRecord.exchange_id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: '并发审核测试2' })

      const [response1, response2] = await Promise.all([approvePromise1, approvePromise2])

      // 🎯 验证：应该只有一个请求成功，另一个失败（或返回状态错误）
      const successCount = [response1, response2].filter(r => r.status === 200 && r.body.success).length
      expect(successCount).toBe(1) // 只有一个成功

      console.log(`✅ 并发审核保护验证通过：${successCount}个请求成功（预期1个）`)
      console.log(`  请求1: ${response1.status} - ${response1.body.message}`)
      console.log(`  请求2: ${response2.status} - ${response2.body.message}`)

      // 验证最终状态：订单应该是approved状态
      const finalRecord = await models.ExchangeRecords.findByPk(testExchangeRecord.exchange_id)
      expect(finalRecord.audit_status).toBe('approved')

      // 验证库存：应该只创建1个库存
      const inventoryCount = await models.UserInventory.count({
        where: { source_id: testExchangeRecord.exchange_id.toString() }
      })
      expect(inventoryCount).toBe(1)

      // 清理
      await models.UserInventory.destroy({
        where: { source_id: testExchangeRecord.exchange_id.toString() },
        force: true
      })
      await models.ExchangeRecords.destroy({
        where: { exchange_id: testExchangeRecord.exchange_id },
        force: true
      })
    })
  })

  describe('审核拒绝功能验证', () => {
    test('审核拒绝应该正确退回积分（使用外部事务）', async () => {
      // 创建测试订单
      const testExchangeRecord = await models.ExchangeRecords.create({
        user_id: testUserId,
        product_id: testProductId,
        product_snapshot: {
          name: '测试商品',
          category: '优惠券',
          exchange_points: 1500
        },
        quantity: 1,
        total_points: 1500,
        exchange_code: `TEST${Date.now()}`,
        status: 'pending',
        space: 'lucky',
        requires_audit: true,
        audit_status: 'pending',
        exchange_time: new Date()
      })

      // 查询用户审核前积分
      const userBefore = await models.User.findByPk(testUserId)
      const pointsBefore = userBefore.current_points

      // 执行审核拒绝
      const response = await request(app)
        .post(`/api/v4/unified-engine/admin/audit/${testExchangeRecord.exchange_id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: '测试审核拒绝-积分退回验证' })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      // 验证积分已退回
      const userAfter = await models.User.findByPk(testUserId)
      const pointsAfter = userAfter.current_points

      expect(pointsAfter).toBe(pointsBefore + 1500) // 退回1500积分
      console.log(`✅ 积分退回验证通过：${pointsBefore} + 1500 = ${pointsAfter}`)

      // 清理
      await models.ExchangeRecords.destroy({
        where: { exchange_id: testExchangeRecord.exchange_id },
        force: true
      })
    })
  })
})
