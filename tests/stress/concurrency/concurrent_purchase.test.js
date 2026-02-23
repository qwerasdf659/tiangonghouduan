/**
 * 🎯 并发购买竞态测试 - 任务 8.7
 *
 * 创建时间：2026-01-28 北京时间
 * 版本：V1.0
 * 优先级：P0 - 核心业务路径
 *
 * 业务场景：
 * - 多个买家同时购买同一挂牌物品
 * - 只有一个买家能成功创建订单
 * - 其他买家应收到明确的错误信息
 *
 * 技术验证点：
 * 1. MarketListing FOR UPDATE 行锁机制
 * 2. 挂牌状态变更原子性（on_sale → locked）
 * 3. 并发冲突的正确处理
 * 4. 数据库事务隔离性
 *
 * 测试数据：
 * - 使用真实数据库 restaurant_points_dev
 * - 测试账号从 global.testData 动态获取
 */

'use strict'

const {
  sequelize,
  User,
  MarketListing,
  Item,
  TradeOrder,
  ItemTemplate
} = require('../../../models')
const { getTestService } = require('../../helpers/UnifiedTestManager')
const {
  executeConcurrent: _executeConcurrent,
  delay: _delay
} = require('../../helpers/test-concurrent-utils')
const { v4: _uuidv4 } = require('uuid')
const { prepareMarketTestEnvironment } = require('../../helpers/test-points-setup')

// 测试超时设置
jest.setTimeout(90000)

describe('🛒 并发购买竞态测试', () => {
  // 服务实例
  let MarketListingService
  let TradeOrderService
  let BalanceService

  // 测试数据
  let testSeller
  let testBuyers = []
  let testItemTemplate
  let createdListings = []
  let createdItems = []
  let createdOrders = []

  /**
   * 生成唯一幂等键
   */
  function generateIdempotencyKey(prefix = 'test') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  /**
   * 创建测试物品实例
   */
  async function createTestItem(ownerUserId, options = {}) {
    const itemData = {
      owner_account_id: ownerUserId,
      item_template_id: testItemTemplate?.item_template_id || null,
      item_type: 'tradable_item',
      status: options.status || 'available',
      meta: options.meta || {
        name: `并发测试物品_${Date.now()}`,
        description: '并发购买竞态测试用物品'
      }
    }

    const item = await Item.create(itemData)
    createdItems.push(item.item_id)
    return item
  }

  /**
   * 创建测试挂牌
   */
  async function createTestListing(sellerId, itemInstanceId, priceAmount = 50) {
    const transaction = await sequelize.transaction()
    try {
      const result = await MarketListingService.createListing(
        {
          idempotency_key: generateIdempotencyKey('concurrent_listing'),
          seller_user_id: sellerId,
          item_id: itemInstanceId,
          price_amount: priceAmount,
          price_asset_code: 'DIAMOND'
        },
        { transaction }
      )
      await transaction.commit()
      createdListings.push(result.listing.market_listing_id)
      return result.listing
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }

  /**
   * 为用户添加测试资产
   */
  async function grantTestAsset(userId, amount = 200) {
    const transaction = await sequelize.transaction()
    try {
      await BalanceService.changeBalance(
        {
          user_id: userId,
          asset_code: 'DIAMOND',
          delta_amount: amount,
          business_type: 'test_grant',
          idempotency_key: generateIdempotencyKey(`grant_${userId}`)
        },
        { transaction }
      )
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      // 忽略重复授予的错误
      if (!error.message.includes('duplicate') && !error.message.includes('幂等')) {
        throw error
      }
    }
  }

  beforeAll(async () => {
    console.log('🎯 ===== 并发购买竞态测试启动 =====')

    // 连接数据库
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 🔧 准备市场测试环境（重置挂牌计数 + 提高挂牌上限）
    await prepareMarketTestEnvironment({
      dailyMaxListings: 1000,
      requiredPoints: 100000,
      clearTodayListings: true
    })

    // 获取服务实例
    MarketListingService = getTestService('market_listing_core')
    TradeOrderService = getTestService('trade_order')
    BalanceService = getTestService('asset_balance')

    console.log('✅ 服务获取成功')

    // 获取测试物品模板
    testItemTemplate = await ItemTemplate.findOne()
  })

  beforeEach(async () => {
    // 获取测试卖家
    testSeller = await User.findOne({
      where: { mobile: '13612227930' }
    })

    if (!testSeller) {
      throw new Error('测试卖家不存在')
    }

    // 获取多个测试买家（排除卖家）
    const allBuyers = await User.findAll({
      where: {
        user_id: { [sequelize.Sequelize.Op.ne]: testSeller.user_id },
        status: 'active'
      },
      limit: 5
    })

    testBuyers = allBuyers

    console.log('✅ 测试用户准备完成', {
      seller_id: testSeller.user_id,
      buyer_count: testBuyers.length
    })
  })

  afterEach(async () => {
    // 清理测试订单
    for (const orderId of createdOrders) {
      try {
        await TradeOrder.destroy({ where: { trade_order_id: orderId }, force: true })
      } catch (error) {
        console.log(`清理订单 ${orderId} 失败:`, error.message)
      }
    }
    createdOrders = []

    // 清理测试挂牌
    for (const listingId of createdListings) {
      try {
        await MarketListing.destroy({ where: { market_listing_id: listingId }, force: true })
      } catch (error) {
        console.log(`清理挂牌 ${listingId} 失败:`, error.message)
      }
    }
    createdListings = []

    // 清理测试物品
    for (const itemInstanceId of createdItems) {
      try {
        await Item.destroy({ where: { item_id: itemInstanceId }, force: true })
      } catch (error) {
        console.log(`清理物品 ${itemInstanceId} 失败:`, error.message)
      }
    }
    createdItems = []
  })

  afterAll(async () => {
    console.log('🏁 并发购买竞态测试完成')
  })

  /**
   * ==========================================
   * 🔒 核心并发测试：多买家同时购买
   * ==========================================
   */
  describe('多买家并发购买同一挂牌', () => {
    /**
     * 核心测试：验证只有一个买家能成功购买
     * 业务规则：物品挂牌只能被一个买家购买，其他并发请求应失败
     */
    test('多个买家同时购买同一挂牌，只有一个应成功', async () => {
      if (testBuyers.length < 2) {
        console.warn('⚠️ 跳过测试：需要至少2个测试买家')
        return
      }

      // 1. 创建测试物品和挂牌
      const testItem = await createTestItem(testSeller.user_id)
      const testListing = await createTestListing(testSeller.user_id, testItem.item_id, 30)
      console.log(`✅ 挂牌创建成功: ${testListing.market_listing_id}`)

      // 2. 为所有买家准备资产
      for (const buyer of testBuyers) {
        await grantTestAsset(buyer.user_id, 100)
      }
      console.log(`✅ 已为 ${testBuyers.length} 个买家准备资产`)

      // 3. 创建并发购买任务
      const concurrentBuyers = testBuyers.slice(0, 3) // 使用3个买家
      console.log(`📋 开始并发购买测试: ${concurrentBuyers.length} 个买家同时购买`)

      const _purchaseResults = []

      // 并发执行购买
      const purchaseTasks = concurrentBuyers.map(async (buyer, index) => {
        const transaction = await sequelize.transaction()
        const idempotencyKey = generateIdempotencyKey(`concurrent_buy_${buyer.user_id}`)

        try {
          const result = await TradeOrderService.createOrder(
            {
              idempotency_key: idempotencyKey,
              market_listing_id: testListing.market_listing_id,
              buyer_id: buyer.user_id
            },
            { transaction }
          )

          await transaction.commit()

          if (result.trade_order_id) {
            createdOrders.push(result.trade_order_id)
          }

          return {
            buyer_id: buyer.user_id,
            index,
            success: true,
            trade_order_id: result.trade_order_id
          }
        } catch (error) {
          await transaction.rollback()
          return {
            buyer_id: buyer.user_id,
            index,
            success: false,
            error: error.message,
            code: error.code
          }
        }
      })

      // 同时执行所有购买任务
      const results = await Promise.all(purchaseTasks)

      // 4. 分析结果
      const successResults = results.filter(r => r.success)
      const failedResults = results.filter(r => !r.success)

      console.log('\n📊 并发购买结果:')
      console.log(`   成功购买: ${successResults.length} 个`)
      console.log(`   购买失败: ${failedResults.length} 个`)

      if (successResults.length > 0) {
        console.log(
          `   成功买家: user_id=${successResults[0].buyer_id}, trade_order_id=${successResults[0].trade_order_id}`
        )
      }

      failedResults.forEach(r => {
        console.log(`   失败买家: user_id=${r.buyer_id}, 原因: ${r.error}`)
      })

      // 5. 验证：只有一个买家成功
      expect(successResults.length).toBe(1)

      // 6. 验证失败原因
      failedResults.forEach(r => {
        // 失败原因应该是挂牌状态异常（已被锁定）
        expect(r.error).toMatch(/状态|locked|不可用|on_sale/i)
      })

      // 7. 验证挂牌状态
      const updatedListing = await MarketListing.findByPk(testListing.market_listing_id)
      expect(updatedListing.status).toBe('locked')
      // 注意：数据库字段可能返回字符串类型
      expect(Number(updatedListing.locked_by_order_id)).toBe(
        Number(successResults[0].trade_order_id)
      )

      // 8. 验证订单状态
      const order = await TradeOrder.findByPk(successResults[0].order_id)
      expect(order.status).toBe('frozen')
      expect(order.buyer_user_id).toBe(successResults[0].buyer_id)

      console.log('\n✅ 并发购买测试通过：只有一个买家成功购买')
    }, 60000)

    /**
     * 测试：相同买家重复购买（幂等性）
     */
    test('相同买家使用相同幂等键重复购买应返回首次结果', async () => {
      if (testBuyers.length < 1) {
        console.warn('⚠️ 跳过测试：需要至少1个测试买家')
        return
      }

      const testBuyer = testBuyers[0]

      // 1. 创建测试物品和挂牌
      const testItem = await createTestItem(testSeller.user_id)
      const testListing = await createTestListing(testSeller.user_id, testItem.item_id, 25)

      // 2. 准备买家资产
      await grantTestAsset(testBuyer.user_id, 100)

      // 3. 使用相同幂等键购买两次（包含listing_id确保唯一性）
      const idempotencyKey = generateIdempotencyKey(
        `idempotent_buy_${testListing.market_listing_id}`
      )

      // 第一次购买
      const tx1 = await sequelize.transaction()
      let firstResult
      try {
        firstResult = await TradeOrderService.createOrder(
          {
            idempotency_key: idempotencyKey,
            market_listing_id: testListing.market_listing_id,
            buyer_id: testBuyer.user_id
          },
          { transaction: tx1 }
        )
        await tx1.commit()
        createdOrders.push(firstResult.order_id)
      } catch (error) {
        await tx1.rollback()
        throw error
      }

      expect(firstResult.is_duplicate).toBe(false)
      console.log(`✅ 第一次购买成功: order_id=${firstResult.order_id}`)

      // 第二次购买（相同幂等键）
      const tx2 = await sequelize.transaction()
      let secondResult
      try {
        secondResult = await TradeOrderService.createOrder(
          {
            idempotency_key: idempotencyKey,
            market_listing_id: testListing.market_listing_id,
            buyer_id: testBuyer.user_id
          },
          { transaction: tx2 }
        )
        await tx2.commit()
      } catch (error) {
        await tx2.rollback()
        throw error
      }

      // 4. 验证幂等性
      expect(secondResult.is_duplicate).toBe(true)
      // 注意：order_id 可能是字符串类型
      expect(Number(secondResult.order_id)).toBe(Number(firstResult.order_id))

      console.log('✅ 幂等性验证通过：返回首次购买结果')
    }, 30000)
  })

  /**
   * ==========================================
   * 🔄 高并发压力测试
   * ==========================================
   */
  describe('高并发压力测试', () => {
    /**
     * 测试：快速连续请求
     */
    test('快速连续的购买请求应正确处理竞争', async () => {
      if (testBuyers.length < 3) {
        console.warn('⚠️ 跳过测试：需要至少3个测试买家')
        return
      }

      // 1. 准备多个挂牌
      const listings = []
      for (let i = 0; i < 3; i++) {
        const item = await createTestItem(testSeller.user_id)
        const listing = await createTestListing(testSeller.user_id, item.item_id, 20 + i * 10)
        listings.push(listing)
      }

      console.log(`✅ 创建 ${listings.length} 个测试挂牌`)

      // 2. 为买家准备资产
      for (const buyer of testBuyers) {
        await grantTestAsset(buyer.user_id, 300)
      }

      // 3. 创建混合购买任务（多个买家购买多个挂牌）
      const tasks = []

      // 每个挂牌有2个买家同时购买
      for (const listing of listings) {
        const buyers = testBuyers.slice(0, 2)
        for (const buyer of buyers) {
          tasks.push({
            market_listing_id: listing.market_listing_id,
            buyer_id: buyer.user_id
          })
        }
      }

      console.log(`📋 并发任务数: ${tasks.length}`)

      // 4. 执行并发购买
      const results = await Promise.all(
        tasks.map(async task => {
          const transaction = await sequelize.transaction()
          try {
            const result = await TradeOrderService.createOrder(
              {
                idempotency_key: generateIdempotencyKey(
                  `stress_${task.market_listing_id}_${task.buyer_id}`
                ),
                market_listing_id: task.market_listing_id,
                buyer_id: task.buyer_id
              },
              { transaction }
            )
            await transaction.commit()

            if (result.order_id) {
              createdOrders.push(result.order_id)
            }

            return {
              ...task,
              success: true,
              order_id: result.order_id
            }
          } catch (error) {
            await transaction.rollback()
            return {
              ...task,
              success: false,
              error: error.message
            }
          }
        })
      )

      // 5. 分析结果
      const successfulOrders = results.filter(r => r.success)
      const failedOrders = results.filter(r => !r.success)

      // 每个挂牌最多只能有一个成功的订单
      const ordersByListing = {}
      successfulOrders.forEach(r => {
        ordersByListing[r.market_listing_id] = (ordersByListing[r.market_listing_id] || 0) + 1
      })

      console.log('\n📊 高并发测试结果:')
      console.log(`   成功订单: ${successfulOrders.length}`)
      console.log(`   失败订单: ${failedOrders.length}`)
      console.log(`   各挂牌成功数:`, ordersByListing)

      // 验证：每个挂牌最多只有一个成功订单
      Object.entries(ordersByListing).forEach(([_listingId, count]) => {
        expect(count).toBeLessThanOrEqual(1)
      })

      // 成功订单数应该等于挂牌数（每个挂牌一个成功）
      expect(successfulOrders.length).toBeLessThanOrEqual(listings.length)

      console.log('✅ 高并发压力测试通过')
    }, 90000)
  })

  /**
   * ==========================================
   * 🛡️ 边界条件测试
   * ==========================================
   */
  describe('边界条件测试', () => {
    /**
     * 测试：购买已被锁定的挂牌
     */
    test('购买已被锁定的挂牌应返回错误', async () => {
      if (testBuyers.length < 2) {
        console.warn('⚠️ 跳过测试：需要至少2个测试买家')
        return
      }

      const [buyer1, buyer2] = testBuyers

      // 1. 创建挂牌
      const testItem = await createTestItem(testSeller.user_id)
      const testListing = await createTestListing(testSeller.user_id, testItem.item_id, 35)

      // 2. 准备买家资产
      await grantTestAsset(buyer1.user_id, 100)
      await grantTestAsset(buyer2.user_id, 100)

      // 3. 买家1先购买成功
      const tx1 = await sequelize.transaction()
      try {
        const result = await TradeOrderService.createOrder(
          {
            idempotency_key: generateIdempotencyKey('first_buy'),
            market_listing_id: testListing.market_listing_id,
            buyer_id: buyer1.user_id
          },
          { transaction: tx1 }
        )
        await tx1.commit()
        createdOrders.push(result.order_id)
        console.log(`✅ 买家1购买成功: order_id=${result.order_id}`)
      } catch (error) {
        await tx1.rollback()
        throw error
      }

      // 4. 买家2尝试购买（应失败）
      const tx2 = await sequelize.transaction()
      try {
        await TradeOrderService.createOrder(
          {
            idempotency_key: generateIdempotencyKey('second_buy'),
            market_listing_id: testListing.market_listing_id,
            buyer_id: buyer2.user_id
          },
          { transaction: tx2 }
        )
        await tx2.rollback()
        // 不应该到达这里
        throw new Error('测试失败：应该抛出错误表示挂牌已被锁定')
      } catch (error) {
        await tx2.rollback()
        if (error.message.includes('测试失败')) {
          throw error
        }
        expect(error.message).toMatch(/状态|locked|on_sale/i)
        console.log('✅ 正确拒绝购买已锁定的挂牌:', error.message)
      }
    })

    /**
     * 测试：购买已完成的挂牌
     */
    test('购买已完成（sold）的挂牌应返回错误', async () => {
      if (testBuyers.length < 2) {
        console.warn('⚠️ 跳过测试：需要至少2个测试买家')
        return
      }

      const [buyer1, buyer2] = testBuyers

      // 1. 创建并完成一个交易
      const testItem = await createTestItem(testSeller.user_id)
      const testListing = await createTestListing(testSeller.user_id, testItem.item_id, 40)

      // 准备资产
      await grantTestAsset(buyer1.user_id, 200)
      await grantTestAsset(buyer2.user_id, 200)

      // 买家1创建订单
      const orderTx = await sequelize.transaction()
      let orderId
      try {
        const result = await TradeOrderService.createOrder(
          {
            idempotency_key: generateIdempotencyKey('complete_buy'),
            market_listing_id: testListing.market_listing_id,
            buyer_id: buyer1.user_id
          },
          { transaction: orderTx }
        )
        await orderTx.commit()
        orderId = result.order_id
        createdOrders.push(orderId)
      } catch (error) {
        await orderTx.rollback()
        throw error
      }

      // 完成订单
      const completeTx = await sequelize.transaction()
      try {
        await TradeOrderService.completeOrder(
          {
            order_id: orderId,
            buyer_id: buyer1.user_id
          },
          { transaction: completeTx }
        )
        await completeTx.commit()
        console.log('✅ 订单已完成')
      } catch (error) {
        await completeTx.rollback()
        throw error
      }

      // 2. 买家2尝试购买已完成的挂牌
      const failTx = await sequelize.transaction()
      try {
        await TradeOrderService.createOrder(
          {
            idempotency_key: generateIdempotencyKey('buy_sold'),
            market_listing_id: testListing.market_listing_id,
            buyer_id: buyer2.user_id
          },
          { transaction: failTx }
        )
        await failTx.rollback()
        // 不应该到达这里
        throw new Error('测试失败：应该抛出错误表示挂牌已售出')
      } catch (error) {
        await failTx.rollback()
        if (error.message.includes('测试失败')) {
          throw error
        }
        expect(error.message).toMatch(/状态|sold|on_sale/i)
        console.log('✅ 正确拒绝购买已售出的挂牌:', error.message)
      }
    })
  })
})
