/**
 * 审核管理核心Bug修复验证测试（简化版）
 *
 * 专注验证：
 * 1. 库存重复创建bug已修复
 * 2. 事务嵌套问题已修复
 *
 * 使用模型：Claude Sonnet 4.5
 * 创建时间：2025-11-08
 */

const models = require('../../models')

describe('审核管理核心Bug修复（简化验证）', () => {
  jest.setTimeout(60000)

  let testUserId
  let testProductId
  let testExchangeId

  beforeAll(async () => {
    // 使用已存在的测试账号
    const adminUser = await models.User.findOne({ where: { mobile: '13612227930' } })
    if (!adminUser) {
      throw new Error('测试管理员账号不存在')
    }
    testUserId = adminUser.user_id

    // 创建测试商品
    const product = await models.Product.create({
      name: '测试审核商品-核心修复验证',
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
        exchange_points: product.exchange_points
      },
      quantity: 3, // 兑换3个，用于验证库存数量
      total_points: 4500,
      exchange_code: `TESTFIX${Date.now()}`,
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
    try {
      if (testExchangeId) {
        await models.UserInventory.destroy({
          where: { source_id: testExchangeId.toString() },
          force: true
        })
        await models.ExchangeRecords.destroy({
          where: { exchange_id: testExchangeId },
          force: true
        })
      }
      if (testProductId) {
        await models.Product.destroy({
          where: { product_id: testProductId },
          force: true
        })
      }
    } catch (error) {
      console.error('清理测试数据失败:', error.message)
    }
  })

  describe('P0-Bug修复验证：库存重复创建', () => {
    test('模型层approve方法应该仅创建quantity个库存', async () => {
      // 清空现有库存
      await models.UserInventory.destroy({
        where: { source_id: testExchangeId.toString() },
        force: true
      })

      // 获取兑换记录
      const exchangeRecord = await models.ExchangeRecords.findByPk(testExchangeId)
      expect(exchangeRecord).toBeTruthy()

      // 🔴 核心测试：调用模型的approve方法
      await exchangeRecord.approve(testUserId, '测试核心修复-库存不重复')

      // 🎯 验证库存数量：应该等于quantity（不是2倍）
      const inventoryCount = await models.UserInventory.count({
        where: {
          source_type: 'exchange',
          source_id: testExchangeId.toString()
        }
      })

      console.log(`✅ 库存数量验证: 预期3个, 实际${inventoryCount}个`)
      expect(inventoryCount).toBe(3) // quantity=3，应该创建3个库存

      // 验证库存记录完整性
      const inventoryItems = await models.UserInventory.findAll({
        where: {
          source_type: 'exchange',
          source_id: testExchangeId.toString()
        }
      })

      inventoryItems.forEach((item, index) => {
        expect(item.verification_code).toBeTruthy()
        expect(item.status).toBe('available')
        expect(item.user_id).toBe(testUserId)
        console.log(`  库存${index + 1}: ID=${item.inventory_id}, 核销码=${item.verification_code}`)
      })
    })
  })

  describe('P0-Bug修复验证：事务嵌套', () => {
    test('approve方法应该支持外部事务（无嵌套）', async () => {
      // 创建新测试订单
      const testRecord = await models.ExchangeRecords.create({
        user_id: testUserId,
        product_id: testProductId,
        product_snapshot: {
          name: '测试商品',
          category: '优惠券',
          exchange_points: 1500
        },
        quantity: 1,
        total_points: 1500,
        exchange_code: `TESTTX${Date.now()}`,
        status: 'pending',
        space: 'lucky',
        requires_audit: true,
        audit_status: 'pending',
        exchange_time: new Date()
      })

      // 🔴 核心测试：使用外部事务调用approve
      const transaction = await models.sequelize.transaction()

      try {
        const startTime = Date.now()

        // 传入外部事务
        await testRecord.approve(testUserId, '测试外部事务', { transaction })

        const executionTime = Date.now() - startTime

        await transaction.commit()

        console.log(`✅ 事务执行时间: ${executionTime}ms (无嵌套事务开销)`)
        expect(executionTime).toBeLessThan(5000) // 应该在5秒内完成

        // 验证审核状态
        await testRecord.reload()
        expect(testRecord.audit_status).toBe('approved')
        expect(testRecord.status).toBe('distributed')
      } catch (error) {
        await transaction.rollback()
        throw error
      } finally {
        // 清理
        await models.UserInventory.destroy({
          where: { source_id: testRecord.exchange_id.toString() },
          force: true
        })
        await models.ExchangeRecords.destroy({
          where: { exchange_id: testRecord.exchange_id },
          force: true
        })
      }
    })
  })

  describe('审核拒绝功能验证', () => {
    test('reject方法应该使用外部事务并正确退回积分', async () => {
      // 创建测试订单
      const testRecord = await models.ExchangeRecords.create({
        user_id: testUserId,
        product_id: testProductId,
        product_snapshot: {
          name: '测试商品',
          category: '优惠券',
          exchange_points: 1500
        },
        quantity: 1,
        total_points: 1500,
        exchange_code: `TESTREJ${Date.now()}`,
        status: 'pending',
        space: 'lucky',
        requires_audit: true,
        audit_status: 'pending',
        exchange_time: new Date()
      })

      // 查询审核前积分
      const userBefore = await models.User.findByPk(testUserId)
      const pointsBefore = userBefore.current_points

      // 执行审核拒绝
      const transaction = await models.sequelize.transaction()

      try {
        await testRecord.reject(testUserId, '测试审核拒绝', { transaction })
        await transaction.commit()

        // 验证积分已退回
        const userAfter = await models.User.findByPk(testUserId)
        const pointsAfter = userAfter.current_points

        console.log(`✅ 积分退回验证: ${pointsBefore} + 1500 = ${pointsAfter}`)
        expect(pointsAfter).toBe(pointsBefore + 1500)

        // 验证审核状态
        await testRecord.reload()
        expect(testRecord.audit_status).toBe('rejected')
        expect(testRecord.status).toBe('cancelled')
      } catch (error) {
        await transaction.rollback()
        throw error
      } finally {
        // 清理
        await models.ExchangeRecords.destroy({
          where: { exchange_id: testRecord.exchange_id },
          force: true
        })
      }
    })
  })
})
