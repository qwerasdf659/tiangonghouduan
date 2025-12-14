/**
 * 兑换市场幂等性测试套件 (Exchange Market Idempotency Test Suite)
 *
 * 业务场景：测试兑换市场的幂等性保护机制，确保不会产生重复订单
 *
 * P1-1待办任务：兑换市场 `/api/v4/exchange_market/exchange` 的 business_id 策略
 *
 * 核心功能测试：
 * 1. 强制幂等键验证 - 缺少business_id和Idempotency-Key时返回400
 * 2. 幂等性保护 - 相同business_id重复请求只创建一笔订单
 * 3. 虚拟价值防重复扣除 - 幂等请求不会重复扣除虚拟奖品
 * 4. 冲突保护 - 同一幂等键但不同参数返回409
 * 5. 外部事务支持 - Service支持外部事务传入
 *
 * 设计原则：
 * - 强制幂等键：必须提供business_id或Idempotency-Key
 * - 缺失即拒绝：两者都未提供时直接返回400
 * - 禁止后端兜底生成：不自动生成business_id
 * - 冲突保护：同一幂等键但参数不同时返回409
 * - 幂等返回：同一幂等键返回原结果（标记is_duplicate）
 *
 * 创建时间：2025年12月12日
 * 符合规范：docs/架构重构待办清单.md - P1-1
 * 使用模型：Claude Sonnet 4.5
 */

const request = require('supertest')
const { sequelize, ExchangeItem, ExchangeMarketRecord, UserInventory, UserPointsAccount } = require('../../../models')
const ExchangeMarketService = require('../../../services/ExchangeMarketService')
const BeijingTimeHelper = require('../../../utils/timeHelper')

describe('兑换市场幂等性测试 (Exchange Market Idempotency)', () => {
  let app
  let testUser
  let testToken
  let testItem
  let testInventoryItem

  /**
   * 测试前置准备
   * 1. 初始化app和数据库连接
   * 2. 创建测试用户和积分账户
   * 3. 创建测试商品
   * 4. 清理旧的测试虚拟奖品
   * 5. 创建测试用户的虚拟奖品（用于支付）
   */
  beforeAll(async () => {
    // 初始化Express应用
    app = require('../../../app')

    // 创建测试用户（使用统一的测试账号）
    const { User } = require('../../../models')
    testUser = await User.findOne({
      where: { mobile: '13612227930' }
    })

    if (!testUser) {
      throw new Error('测试用户不存在，请先创建测试用户：13612227930')
    }

    // 生成测试token
    const jwt = require('jsonwebtoken')
    testToken = jwt.sign(
      {
        user_id: testUser.user_id,
        mobile: testUser.mobile,
        nickname: testUser.nickname
      },
      process.env.JWT_SECRET || 'restaurant_points_lottery_jwt_secret_key_2024',
      { expiresIn: '24h' }
    )

    // 确保测试用户有积分账户
    let pointsAccount = await UserPointsAccount.findOne({
      where: { user_id: testUser.user_id }
    })

    if (!pointsAccount) {
      pointsAccount = await UserPointsAccount.create({
        user_id: testUser.user_id,
        available_points: 0,
        total_earned_points: 0,
        total_consumed_points: 0
      })
    }

    // 清理测试用户的所有旧虚拟奖品（aggressive cleanup）
    console.log('🧹 清理所有旧虚拟奖品...')
    const deleted = await UserInventory.destroy({
      where: {
        user_id: testUser.user_id,
        source_type: 'lottery'
        // 不再限制名称，清理所有lottery类型的虚拟奖品
      }
    })
    console.log(`   - 已删除 ${deleted} 个旧虚拟奖品`)

    // 创建测试商品
    testItem = await ExchangeItem.create({
      name: '【测试】幂等性测试商品',
      description: '用于测试兑换市场幂等性的测试商品',
      price_type: 'virtual',
      virtual_value_price: 100,
      points_price: 0,
      cost_price: 50,
      stock: 1000,
      sort_order: 1,
      status: 'active',
      created_at: BeijingTimeHelper.createDatabaseTime(),
      updated_at: BeijingTimeHelper.createDatabaseTime()
    })

    // 创建测试用户的虚拟奖品（用于支付）
    // 创建多个小额虚拟奖品（value=100），正好等于商品价格，方便完全消耗
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await UserInventory.create({
        user_id: testUser.user_id,
        name: `【测试】虚拟奖品-${i + 1}`,
        description: '用于测试兑换市场幂等性的虚拟奖品',
        type: 'product', // 必填：产品类型
        value: 100, // 价值100，正好等于商品价格
        status: 'available',
        source_type: 'lottery', // 必填：来源于抽奖（识别为虚拟奖品）
        source_id: `test_lottery_${Date.now()}_${i}`,
        acquired_at: BeijingTimeHelper.createDatabaseTime(),
        can_transfer: true,
        can_use: true,
        is_available: true,
        transfer_count: 0,
        withdraw_count: 0
      })
    }

    // 记录最后一个创建的虚拟奖品
    testInventoryItem = await UserInventory.findOne({
      where: { user_id: testUser.user_id, source_type: 'lottery', status: 'available' },
      order: [['inventory_id', 'DESC']]
    })

    console.log('✅ 测试环境初始化完成')
    console.log(`   - 测试用户ID: ${testUser.user_id}`)
    console.log(`   - 测试商品ID: ${testItem.item_id}`)
    console.log(`   - 创建了5个虚拟奖品，每个价值: 100`)
  }, 30000)

  /**
   * 每个测试前的准备
   * 确保每个测试开始时都有足够的虚拟奖品
   */
  beforeEach(async () => {
    // 查询用户当前虚拟价值总和（只统计 status='available' 的虚拟奖品）
    const currentVirtualValue = await ExchangeMarketService._getUserTotalVirtualValue(
      testUser.user_id
    )

    console.log(`🔍 测试前检查虚拟价值: ${currentVirtualValue}`)

    // 如果虚拟价值不足500，创建新的虚拟奖品
    if (currentVirtualValue < 500) {
      console.log(`⚠️ 虚拟价值不足(${currentVirtualValue} < 500)，创建新虚拟奖品`)

      // 创建5个小额虚拟奖品（value=100）
      for (let i = 0; i < 5; i++) {
        // eslint-disable-next-line no-await-in-loop
        await UserInventory.create({
          user_id: testUser.user_id,
          name: `【测试】虚拟奖品-补充-${i + 1}`,
          description: '用于测试兑换市场幂等性的虚拟奖品',
          type: 'product', // 必填：产品类型
          value: 100, // 价值100，正好等于商品价格
          status: 'available',
          source_type: 'lottery', // 必填：来源于抽奖（识别为虚拟奖品）
          source_id: `test_lottery_refill_${Date.now()}_${i}`,
          acquired_at: BeijingTimeHelper.createDatabaseTime(),
          can_transfer: true,
          can_use: true,
          is_available: true,
          transfer_count: 0,
          withdraw_count: 0
        })
      }

      console.log('✅ 已创建5个新虚拟奖品（每个价值100）')

      // 重新查询虚拟价值总和，验证是否能查到
      const verifyVirtualValue = await ExchangeMarketService._getUserTotalVirtualValue(
        testUser.user_id
      )
      console.log(`🔍 创建后重新查询虚拟价值: ${verifyVirtualValue}`)
    } else {
      console.log(`✅ 虚拟价值充足(${currentVirtualValue})，无需创建`)
    }
  })

  /**
   * 测试后清理
   * 删除测试创建的数据
   */
  afterAll(async () => {
    // 清理测试数据
    if (testItem) {
      await ExchangeMarketRecord.destroy({
        where: { item_id: testItem.item_id }
      })
      await testItem.destroy()
    }

    if (testInventoryItem) {
      await testInventoryItem.destroy()
    }

    console.log('✅ 测试数据清理完成')
  }, 30000)

  /**
   * 测试1：强制幂等键验证
   * 验证：缺少business_id且缺少Idempotency-Key时返回400错误
   */
  describe('P1-1-1: 强制幂等键验证', () => {
    test('缺少business_id且缺少Idempotency-Key时应返回400', async () => {
      const response = await request(app)
        .post('/api/v4/exchange_market/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          item_id: testItem.item_id,
          quantity: 1
          // 🔴 故意不提供 business_id 和 Idempotency-Key
        })
        .expect(400)

      expect(response.body).toMatchObject({
        success: false,
        code: 'BAD_REQUEST'
      })

      expect(response.body.message).toContain('缺少幂等键')
      expect(response.body.message).toContain('business_id')
      expect(response.body.message).toContain('Idempotency-Key')

      console.log('✅ 强制幂等键验证通过：缺失时正确拒绝')
    })

    test('提供business_id时应正常处理', async () => {
      const business_id = `test_idempotency_body_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      const response = await request(app)
        .post('/api/v4/exchange_market/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          item_id: testItem.item_id,
          quantity: 1,
          business_id // ✅ 通过Body提供business_id
        })
        .expect(200)

      expect(response.body).toMatchObject({
        success: true,
        data: {
          business_id, // 应该回传business_id
          order: expect.objectContaining({
            order_no: expect.any(String),
            item_name: expect.any(String),
            status: 'pending'
          })
        }
      })

      console.log('✅ Body中的business_id验证通过')
      console.log(`   - business_id: ${business_id}`)
      console.log(`   - order_no: ${response.body.data.order.order_no}`)
    })

    test('提供Idempotency-Key时应正常处理', async () => {
      const idempotencyKey = `test_idempotency_header_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      const response = await request(app)
        .post('/api/v4/exchange_market/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .set('Idempotency-Key', idempotencyKey) // ✅ 通过Header提供Idempotency-Key
        .send({
          item_id: testItem.item_id,
          quantity: 1
        })
        .expect(200)

      expect(response.body).toMatchObject({
        success: true,
        data: {
          business_id: idempotencyKey, // 应该使用Idempotency-Key作为business_id
          order: expect.objectContaining({
            order_no: expect.any(String),
            status: 'pending'
          })
        }
      })

      console.log('✅ Header中的Idempotency-Key验证通过')
      console.log(`   - idempotency_key: ${idempotencyKey}`)
      console.log(`   - order_no: ${response.body.data.order.order_no}`)
    })
  })

  /**
   * 测试2：幂等性保护
   * 验证：相同business_id重复请求只创建一笔订单
   */
  describe('P1-1-2: 幂等性保护（相同business_id只创建一笔订单）', () => {
    test('相同business_id重复请求应返回相同结果', async () => {
      const business_id = `test_same_business_id_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      // 第一次请求
      const response1 = await request(app)
        .post('/api/v4/exchange_market/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          item_id: testItem.item_id,
          quantity: 1,
          business_id
        })
        .expect(200)

      expect(response1.body.success).toBe(true)
      expect(response1.body.data.is_duplicate).toBeUndefined() // 第一次不应该标记为重复
      const firstOrderNo = response1.body.data.order.order_no

      console.log('✅ 第一次请求成功')
      console.log(`   - order_no: ${firstOrderNo}`)
      console.log(`   - is_duplicate: ${response1.body.data.is_duplicate || false}`)

      // 第二次请求（相同business_id）
      const response2 = await request(app)
        .post('/api/v4/exchange_market/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          item_id: testItem.item_id,
          quantity: 1,
          business_id // 🔄 相同的business_id
        })
        .expect(200)

      expect(response2.body.success).toBe(true)
      expect(response2.body.data.is_duplicate).toBe(true) // ✅ 应该标记为重复请求
      expect(response2.body.data.order.order_no).toBe(firstOrderNo) // ✅ 应该返回相同的订单号

      console.log('✅ 第二次请求成功（幂等返回）')
      console.log(`   - order_no: ${response2.body.data.order.order_no}`)
      console.log(`   - is_duplicate: ${response2.body.data.is_duplicate}`)
      console.log(`   - 订单号匹配: ${response2.body.data.order.order_no === firstOrderNo}`)

      // 验证数据库中只有一条订单记录
      const orderCount = await ExchangeMarketRecord.count({
        where: { business_id }
      })

      expect(orderCount).toBe(1) // ✅ 数据库中只有一条记录

      console.log('✅ 幂等性验证通过：数据库中只有1条记录')
    })

    test('虚拟奖品价值应该只扣除一次', async () => {
      const business_id = `test_virtual_value_deduct_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      // 获取初始虚拟价值
      const virtualValueBefore = await ExchangeMarketService._getUserTotalVirtualValue(testUser.user_id)
      console.log(`🔍 初始虚拟价值: ${virtualValueBefore}`)

      // 第一次兑换
      const _response1 = await request(app)
        .post('/api/v4/exchange_market/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          item_id: testItem.item_id,
          quantity: 1,
          business_id
        })
        .expect(200)

      const virtualValueAfterFirst = await ExchangeMarketService._getUserTotalVirtualValue(testUser.user_id)
      const deducted = virtualValueBefore - virtualValueAfterFirst

      console.log(`✅ 第一次兑换完成，扣除虚拟价值: ${deducted}`)
      console.log(`   - order_no: ${_response1.body.data.order.order_no}`)
      expect(deducted).toBe(testItem.virtual_value_price) // 应该扣除商品价格

      // 第二次兑换（相同business_id）
      const response2 = await request(app)
        .post('/api/v4/exchange_market/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          item_id: testItem.item_id,
          quantity: 1,
          business_id // 🔄 相同的business_id
        })
        .expect(200)

      const virtualValueAfterSecond = await ExchangeMarketService._getUserTotalVirtualValue(testUser.user_id)

      console.log('✅ 第二次兑换完成（幂等）')
      expect(virtualValueAfterSecond).toBe(virtualValueAfterFirst) // ✅ 虚拟价值不应该再次扣除
      expect(response2.body.data.is_duplicate).toBe(true)

      console.log('✅ 虚拟价值防重复扣除验证通过')
      console.log(`   - 扣除前: ${virtualValueBefore}`)
      console.log(`   - 第一次后: ${virtualValueAfterFirst}`)
      console.log(`   - 第二次后: ${virtualValueAfterSecond}`)
      console.log(`   - 只扣除一次: ${virtualValueAfterSecond === virtualValueAfterFirst}`)
    })
  })

  /**
   * 测试3：冲突保护
   * 验证：同一幂等键但不同参数时返回409错误
   */
  describe('P1-1-3: 冲突保护（同一幂等键但不同参数返回409）', () => {
    test('同一business_id但不同item_id应返回409', async () => {
      const business_id = `test_conflict_item_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      // 第一次请求
      const _response1 = await request(app)
        .post('/api/v4/exchange_market/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          item_id: testItem.item_id,
          quantity: 1,
          business_id
        })
        .expect(200)

      console.log('✅ 第一次请求成功')
      console.log(`   - item_id: ${testItem.item_id}`)
      console.log(`   - order_no: ${_response1.body.data.order.order_no}`)

      // 创建另一个测试商品
      const anotherItem = await ExchangeItem.create({
        name: '【测试】另一个商品',
        description: '用于测试冲突保护',
        price_type: 'virtual',
        virtual_value_price: 100,
        points_price: 0,
        cost_price: 50,
        stock: 1000,
        sort_order: 1,
        status: 'active',
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      })

      // 第二次请求（相同business_id，但不同item_id）
      const response2 = await request(app)
        .post('/api/v4/exchange_market/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          item_id: anotherItem.item_id, // 🔴 不同的item_id
          quantity: 1,
          business_id // 🔄 相同的business_id
        })
        .expect(409) // ✅ 应该返回409冲突

      expect(response2.body.success).toBe(false)
      expect(response2.body.message).toContain('幂等键冲突')
      expect(response2.body.message).toContain(business_id)

      console.log('✅ 冲突保护验证通过：不同item_id返回409')
      console.log(`   - 错误码: ${response2.body.code}`)
      console.log(`   - 错误信息: ${response2.body.message}`)

      // 清理测试数据
      await anotherItem.destroy()
    })

    test('同一business_id但不同quantity应返回409', async () => {
      const business_id = `test_conflict_quantity_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      // 第一次请求
      const _response1 = await request(app)
        .post('/api/v4/exchange_market/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          item_id: testItem.item_id,
          quantity: 1,
          business_id
        })
        .expect(200)

      console.log('✅ 第一次请求成功')
      console.log('   - quantity: 1')
      console.log(`   - order_no: ${_response1.body.data.order.order_no}`)

      // 第二次请求（相同business_id，但不同quantity）
      const response2 = await request(app)
        .post('/api/v4/exchange_market/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          item_id: testItem.item_id,
          quantity: 2, // 🔴 不同的quantity
          business_id // 🔄 相同的business_id
        })
        .expect(409) // ✅ 应该返回409冲突

      expect(response2.body.success).toBe(false)
      expect(response2.body.message).toContain('幂等键冲突')

      console.log('✅ 冲突保护验证通过：不同quantity返回409')
    })
  })

  /**
   * 测试4：外部事务支持
   * 验证：Service支持外部事务传入，不会二次commit
   */
  describe('P1-1-4: 外部事务支持', () => {
    test('Service应支持外部事务传入', async () => {
      const business_id = `test_external_transaction_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      // 创建外部事务
      const externalTransaction = await sequelize.transaction()

      try {
        console.log('🔄 创建外部事务')

        // 调用Service时传入外部事务
        const result = await ExchangeMarketService.exchangeItem(
          testUser.user_id,
          testItem.item_id,
          1,
          {
            business_id,
            transaction: externalTransaction // ✅ 传入外部事务
          }
        )

        expect(result.success).toBe(true)
        expect(result.order.order_no).toBeDefined()

        console.log('✅ Service成功使用外部事务')
        console.log(`   - order_no: ${result.order.order_no}`)

        // 手动提交外部事务
        await externalTransaction.commit()
        console.log('✅ 外部事务手动提交成功')

        // 验证订单已创建
        const order = await ExchangeMarketRecord.findOne({
          where: { business_id }
        })

        expect(order).not.toBeNull()
        expect(order.order_no).toBe(result.order.order_no)

        console.log('✅ 订单已正确创建（事务已提交）')
      } catch (error) {
        // 回滚外部事务
        if (!externalTransaction.finished) {
          await externalTransaction.rollback()
        }
        throw error
      }
    })

    test('Service不应该二次commit外部事务', async () => {
      const business_id = `test_no_double_commit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      // 创建外部事务
      const externalTransaction = await sequelize.transaction()

      try {
        // 调用Service
        await ExchangeMarketService.exchangeItem(
          testUser.user_id,
          testItem.item_id,
          1,
          {
            business_id,
            transaction: externalTransaction
          }
        )

        // 🔴 验证外部事务仍未完成（通过尝试commit来验证）
        // 如果Service已经commit，这里会抛出错误
        let canCommit = false
        try {
          await externalTransaction.commit()
          canCommit = true
          console.log('✅ Service未提交外部事务（正确行为）')
        } catch (error) {
          // 如果这里捕获到错误，说明Service错误地提交了事务
          console.error('❌ Service错误地提交了外部事务:', error.message)
          throw new Error('Service不应该提交外部事务')
        }

        expect(canCommit).toBe(true)
      } catch (error) {
        // 只在需要时回滚（避免二次回滚错误）
        try {
          await externalTransaction.rollback()
        } catch (rollbackError) {
          // 忽略已完成事务的回滚错误
        }
        throw error
      }
    })
  })

  /**
   * 测试5：并发幂等性保护
   * 验证：高并发下相同business_id只创建一笔订单
   */
  describe('P1-1-5: 并发幂等性保护', () => {
    test('并发请求相同business_id应只创建一笔订单', async () => {
      const business_id = `test_concurrent_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      console.log('🔄 开始并发幂等性测试（5个并发请求）')

      // 并发发送5个相同的请求
      const promises = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/v4/exchange_market/exchange')
          .set('Authorization', `Bearer ${testToken}`)
          .send({
            item_id: testItem.item_id,
            quantity: 1,
            business_id // 🔄 相同的business_id
          })
      )

      const responses = await Promise.all(promises)

      // 验证所有请求都成功
      responses.forEach((response, index) => {
        expect(response.status).toBe(200)
        console.log(`   - 请求${index + 1}: ${response.body.data.is_duplicate ? '幂等返回' : '首次创建'}`)
      })

      // 验证数据库中只有一条订单记录
      const orderCount = await ExchangeMarketRecord.count({
        where: { business_id }
      })

      expect(orderCount).toBe(1) // ✅ 只有一条记录

      console.log('✅ 并发幂等性保护验证通过')
      console.log('   - 并发请求数: 5')
      console.log(`   - 数据库订单数: ${orderCount}`)
    })
  })
})
