/**
 * 🎯 完整交易流程测试 - 任务 8.6
 *
 * 创建时间：2026-01-28 北京时间
 * 版本：V1.0
 * 优先级：P0 - 核心业务路径
 *
 * 业务场景：
 * 1. 卖家创建挂牌（物品实例 + 可叠加资产）
 * 2. 买家购买（创建订单 + 锁定挂牌 + 冻结资产）
 * 3. 完成交割（资产结算 + 物品/资产转移）
 *
 * 技术验证点：
 * 1. MarketListingService 挂牌创建和状态管理
 * 2. TradeOrderService 订单全生命周期管理
 * 3. AssetService 资产冻结/解冻/结算
 * 4. 跨服务事务一致性
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
  ItemInstance,
  TradeOrder,
  ItemTemplate
} = require('../../../models')
const { getTestService } = require('../../helpers/UnifiedTestManager')
const { getTestUserId: _getTestUserId } = require('../../helpers/test-data')
const { v4: _uuidv4 } = require('uuid')
const { prepareMarketTestEnvironment } = require('../../helpers/test-points-setup')

// 测试超时设置
jest.setTimeout(60000)

describe('🛒 完整交易流程测试（挂单→购买→交割）', () => {
  // 服务实例
  let MarketListingService
  let TradeOrderService
  let AssetService

  // 测试数据
  let testSeller
  let testBuyer
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
      owner_user_id: ownerUserId,
      item_template_id: testItemTemplate?.item_template_id || null,
      status: options.status || 'available',
      meta: options.meta || {
        name: `测试物品_${Date.now()}`,
        description: '完整交易流程测试用物品'
      }
    }

    const item = await ItemInstance.create(itemData)
    createdItems.push(item.item_instance_id)
    return item
  }

  beforeAll(async () => {
    console.log('🎯 ===== 完整交易流程测试启动 =====')

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
    MarketListingService = getTestService('market_listing')
    TradeOrderService = getTestService('trade_order')
    AssetService = getTestService('asset')

    console.log('✅ 服务获取成功')

    // 获取测试物品模板
    testItemTemplate = await ItemTemplate.findOne()
    if (testItemTemplate) {
      console.log(`✅ 物品模板获取成功: ${testItemTemplate.item_template_id}`)
    }
  })

  beforeEach(async () => {
    // 获取测试卖家
    testSeller = await User.findOne({
      where: { mobile: '13612227930' }
    })

    if (!testSeller) {
      throw new Error('测试卖家不存在，请先创建 mobile=13612227930 的用户')
    }

    // 获取或创建测试买家（不同于卖家的用户）
    testBuyer = await User.findOne({
      where: { mobile: '13800138000' }
    })

    if (!testBuyer) {
      // 尝试查找其他用户作为买家
      testBuyer = await User.findOne({
        where: {
          user_id: { [sequelize.Sequelize.Op.ne]: testSeller.user_id }
        }
      })
    }

    console.log('✅ 测试用户获取成功', {
      seller_id: testSeller.user_id,
      buyer_id: testBuyer?.user_id || '未找到'
    })
  })

  afterEach(async () => {
    // 清理测试订单
    for (const orderId of createdOrders) {
      try {
        await TradeOrder.destroy({ where: { order_id: orderId }, force: true })
      } catch (error) {
        console.log(`清理订单 ${orderId} 失败:`, error.message)
      }
    }
    createdOrders = []

    // 清理测试挂牌
    for (const listingId of createdListings) {
      try {
        await MarketListing.destroy({ where: { listing_id: listingId }, force: true })
      } catch (error) {
        console.log(`清理挂牌 ${listingId} 失败:`, error.message)
      }
    }
    createdListings = []

    // 清理测试物品
    for (const itemInstanceId of createdItems) {
      try {
        await ItemInstance.destroy({ where: { item_instance_id: itemInstanceId }, force: true })
      } catch (error) {
        console.log(`清理物品 ${itemInstanceId} 失败:`, error.message)
      }
    }
    createdItems = []
  })

  afterAll(async () => {
    console.log('🏁 完整交易流程测试完成')
  })

  /**
   * ==========================================
   * 🏷️ 阶段一：物品挂牌创建
   * ==========================================
   */
  describe('阶段一：物品挂牌创建', () => {
    test('卖家应能成功创建物品实例挂牌', async () => {
      // 1. 创建测试物品
      const testItem = await createTestItem(testSeller.user_id)
      console.log(`✅ 创建测试物品: ${testItem.item_instance_id}`)

      // 2. 创建挂牌
      const idempotencyKey = generateIdempotencyKey('listing_create')
      const transaction = await sequelize.transaction()

      try {
        const result = await MarketListingService.createListing(
          {
            idempotency_key: idempotencyKey,
            seller_user_id: testSeller.user_id,
            item_instance_id: testItem.item_instance_id,
            price_amount: 100,
            price_asset_code: 'DIAMOND'
          },
          { transaction }
        )

        await transaction.commit()

        // 记录便于清理
        createdListings.push(result.listing.listing_id)

        // 3. 验证挂牌结果
        expect(result).toHaveProperty('listing')
        expect(result.listing.listing_kind).toBe('item_instance')
        expect(result.listing.status).toBe('on_sale')
        expect(result.listing.seller_user_id).toBe(testSeller.user_id)
        expect(Number(result.listing.price_amount)).toBe(100)

        // 4. 验证物品状态已锁定
        const updatedItem = await ItemInstance.findByPk(testItem.item_instance_id)
        expect(updatedItem.status).toBe('locked')

        console.log(`✅ 挂牌创建成功: ${result.listing.listing_id}, 物品状态: locked`)
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    test('挂牌创建应具有幂等性', async () => {
      // 1. 创建测试物品
      const testItem = await createTestItem(testSeller.user_id)
      const idempotencyKey = generateIdempotencyKey('listing_idempotent')

      // 2. 第一次创建挂牌
      const transaction1 = await sequelize.transaction()
      let firstResult
      try {
        firstResult = await MarketListingService.createListing(
          {
            idempotency_key: idempotencyKey,
            seller_user_id: testSeller.user_id,
            item_instance_id: testItem.item_instance_id,
            price_amount: 200,
            price_asset_code: 'DIAMOND'
          },
          { transaction: transaction1 }
        )
        await transaction1.commit()
        createdListings.push(firstResult.listing.listing_id)
      } catch (error) {
        await transaction1.rollback()
        throw error
      }

      // 3. 第二次使用相同参数创建（应返回首次结果）
      const existingListing = await MarketListing.findOne({
        where: { idempotency_key: idempotencyKey }
      })

      const transaction2 = await sequelize.transaction()
      try {
        const secondResult = await MarketListingService.createListing(
          {
            idempotency_key: idempotencyKey,
            seller_user_id: existingListing.seller_user_id,
            item_instance_id: existingListing.offer_item_instance_id,
            price_amount: Number(existingListing.price_amount),
            price_asset_code: existingListing.price_asset_code
          },
          { transaction: transaction2 }
        )
        await transaction2.commit()

        // 4. 验证幂等性
        expect(String(secondResult.listing.listing_id)).toBe(String(firstResult.listing.listing_id))
        expect(secondResult.is_duplicate).toBe(true)

        console.log('✅ 挂牌幂等性验证通过')
      } catch (error) {
        await transaction2.rollback()
        throw error
      }
    })
  })

  /**
   * ==========================================
   * 🛒 阶段二：买家购买（创建订单）
   * ==========================================
   */
  describe('阶段二：买家购买流程', () => {
    test('买家应能成功购买挂牌物品（创建订单）', async () => {
      if (!testBuyer) {
        console.warn('⚠️ 跳过测试：缺少测试买家')
        return
      }

      // 1. 创建测试物品和挂牌
      const testItem = await createTestItem(testSeller.user_id)
      const listingIdempotencyKey = generateIdempotencyKey('listing_for_buy')

      const listingTx = await sequelize.transaction()
      let testListing
      try {
        const result = await MarketListingService.createListing(
          {
            idempotency_key: listingIdempotencyKey,
            seller_user_id: testSeller.user_id,
            item_instance_id: testItem.item_instance_id,
            price_amount: 50,
            price_asset_code: 'DIAMOND'
          },
          { transaction: listingTx }
        )
        await listingTx.commit()
        testListing = result.listing
        createdListings.push(testListing.listing_id)
      } catch (error) {
        await listingTx.rollback()
        throw error
      }

      console.log(`✅ 挂牌创建成功: ${testListing.listing_id}`)

      // 2. 确保买家有足够的 DIAMOND
      const grantTx = await sequelize.transaction()
      try {
        const balance = await AssetService.getBalance({
          user_id: testBuyer.user_id,
          asset_code: 'DIAMOND'
        })

        if (Number(balance?.available_amount || 0) < 100) {
          await AssetService.changeBalance(
            {
              user_id: testBuyer.user_id,
              asset_code: 'DIAMOND',
              delta_amount: 200,
              business_type: 'test_grant',
              idempotency_key: generateIdempotencyKey('grant_diamond')
            },
            { transaction: grantTx }
          )
          console.log('✅ 已为买家添加测试 DIAMOND')
        }
        await grantTx.commit()
      } catch (error) {
        await grantTx.rollback()
        throw error
      }

      // 3. 买家创建订单
      const orderIdempotencyKey = generateIdempotencyKey('order_create')
      const orderTx = await sequelize.transaction()
      let orderCommitted = false

      try {
        const orderResult = await TradeOrderService.createOrder(
          {
            idempotency_key: orderIdempotencyKey,
            listing_id: testListing.listing_id,
            buyer_id: testBuyer.user_id
          },
          { transaction: orderTx }
        )

        await orderTx.commit()
        orderCommitted = true

        // 记录便于清理
        createdOrders.push(orderResult.order_id)

        // 4. 验证订单创建结果
        expect(orderResult).toHaveProperty('order_id')
        expect(orderResult.is_duplicate).toBe(false)

        // 5. 验证订单状态
        const order = await TradeOrder.findByPk(orderResult.order_id)
        expect(order.status).toBe('frozen')
        expect(order.buyer_user_id).toBe(testBuyer.user_id)
        expect(order.seller_user_id).toBe(testSeller.user_id)

        // 6. 验证挂牌状态已锁定
        const updatedListing = await MarketListing.findByPk(testListing.listing_id)
        expect(updatedListing.status).toBe('locked')
        // 注意：数据库字段可能返回字符串类型，需要转换比较
        expect(Number(updatedListing.locked_by_order_id)).toBe(Number(orderResult.order_id))

        console.log(`✅ 订单创建成功: ${orderResult.order_id}, 状态: frozen`)
      } catch (error) {
        if (!orderCommitted) {
          await orderTx.rollback()
        }
        throw error
      }
    })

    test('买家不能购买自己的挂牌', async () => {
      // 1. 创建卖家的挂牌
      const testItem = await createTestItem(testSeller.user_id)
      const listingIdempotencyKey = generateIdempotencyKey('self_buy_listing')

      const listingTx = await sequelize.transaction()
      let testListing
      try {
        const result = await MarketListingService.createListing(
          {
            idempotency_key: listingIdempotencyKey,
            seller_user_id: testSeller.user_id,
            item_instance_id: testItem.item_instance_id,
            price_amount: 100,
            price_asset_code: 'DIAMOND'
          },
          { transaction: listingTx }
        )
        await listingTx.commit()
        testListing = result.listing
        createdListings.push(testListing.listing_id)
      } catch (error) {
        await listingTx.rollback()
        throw error
      }

      // 2. 卖家尝试购买自己的挂牌应失败
      const orderIdempotencyKey = generateIdempotencyKey('self_buy_order')
      const orderTx = await sequelize.transaction()

      try {
        await TradeOrderService.createOrder(
          {
            idempotency_key: orderIdempotencyKey,
            listing_id: testListing.listing_id,
            buyer_id: testSeller.user_id // 卖家自己购买
          },
          { transaction: orderTx }
        )
        await orderTx.rollback()
        // 不应该到达这里
        throw new Error('测试失败：应该抛出错误表示不能购买自己的商品')
      } catch (error) {
        await orderTx.rollback()
        if (error.message.includes('测试失败')) {
          throw error
        }
        expect(error.message).toContain('自己')
        console.log('✅ 正确拒绝自购行为:', error.message)
      }
    })
  })

  /**
   * ==========================================
   * ✅ 阶段三：完成交割
   * ==========================================
   */
  describe('阶段三：完成交割', () => {
    test('完成订单应正确结算资产和转移物品', async () => {
      if (!testBuyer) {
        console.warn('⚠️ 跳过测试：缺少测试买家')
        return
      }

      // 1. 创建完整的交易场景
      const testItem = await createTestItem(testSeller.user_id)
      const listingTx = await sequelize.transaction()
      let testListing

      try {
        const listingResult = await MarketListingService.createListing(
          {
            idempotency_key: generateIdempotencyKey('complete_listing'),
            seller_user_id: testSeller.user_id,
            item_instance_id: testItem.item_instance_id,
            price_amount: 30,
            price_asset_code: 'DIAMOND'
          },
          { transaction: listingTx }
        )
        await listingTx.commit()
        testListing = listingResult.listing
        createdListings.push(testListing.listing_id)
      } catch (error) {
        await listingTx.rollback()
        throw error
      }

      // 2. 确保买家有足够资产
      const grantTx = await sequelize.transaction()
      try {
        await AssetService.changeBalance(
          {
            user_id: testBuyer.user_id,
            asset_code: 'DIAMOND',
            delta_amount: 100,
            business_type: 'test_grant',
            idempotency_key: generateIdempotencyKey('grant_for_complete')
          },
          { transaction: grantTx }
        )
        await grantTx.commit()
      } catch (error) {
        await grantTx.rollback()
        throw error
      }

      // 3. 创建订单
      const orderTx = await sequelize.transaction()
      let testOrder

      try {
        const orderResult = await TradeOrderService.createOrder(
          {
            idempotency_key: generateIdempotencyKey('complete_order'),
            listing_id: testListing.listing_id,
            buyer_id: testBuyer.user_id
          },
          { transaction: orderTx }
        )
        await orderTx.commit()
        testOrder = await TradeOrder.findByPk(orderResult.order_id)
        createdOrders.push(testOrder.order_id)
      } catch (error) {
        await orderTx.rollback()
        throw error
      }

      console.log(`✅ 订单创建成功: ${testOrder.order_id}`)

      // 4. 记录完成前的状态
      const sellerBalanceBefore = await AssetService.getBalance({
        user_id: testSeller.user_id,
        asset_code: 'DIAMOND'
      })
      const sellerBalanceBeforeAmount = Number(sellerBalanceBefore?.available_amount || 0)

      // 5. 完成订单
      const completeTx = await sequelize.transaction()
      let completeCommitted = false
      try {
        const completeResult = await TradeOrderService.completeOrder(
          {
            order_id: testOrder.order_id,
            buyer_id: testBuyer.user_id
          },
          { transaction: completeTx }
        )
        await completeTx.commit()
        completeCommitted = true

        // 6. 验证订单状态
        const updatedOrder = await TradeOrder.findByPk(testOrder.order_id)
        expect(updatedOrder.status).toBe('completed')

        // 7. 验证挂牌状态
        const updatedListing = await MarketListing.findByPk(testListing.listing_id)
        expect(updatedListing.status).toBe('sold')

        // 8. 验证物品所有权转移
        const updatedItem = await ItemInstance.findByPk(testItem.item_instance_id)
        expect(updatedItem.owner_user_id).toBe(testBuyer.user_id)
        // 交易完成后物品状态变为 transferred（业务逻辑：交易转移后的物品）
        expect(updatedItem.status).toBe('transferred')

        // 9. 验证卖家收到款项（实际金额 = 总价 - 手续费）
        const sellerBalanceAfter = await AssetService.getBalance({
          user_id: testSeller.user_id,
          asset_code: 'DIAMOND'
        })
        const sellerBalanceAfterAmount = Number(sellerBalanceAfter?.available_amount || 0)
        const sellerReceived = sellerBalanceAfterAmount - sellerBalanceBeforeAmount

        /*
         * 卖家收到的金额应该是净额（扣除手续费后）
         * 注意：数据库返回值可能是字符串，需要转换比较
         */
        expect(sellerReceived).toBe(Number(completeResult.net_amount))

        console.log('✅ 订单完成成功:', {
          order_status: updatedOrder.status,
          listing_status: updatedListing.status,
          item_new_owner: updatedItem.owner_user_id,
          seller_received: sellerReceived,
          fee_amount: completeResult.fee_amount
        })
      } catch (error) {
        if (!completeCommitted) {
          await completeTx.rollback()
        }
        throw error
      }
    })
  })

  /**
   * ==========================================
   * 🔄 完整端到端流程测试
   * ==========================================
   */
  describe('完整端到端流程', () => {
    test('完整交易流程：挂牌 → 购买 → 交割', async () => {
      if (!testBuyer) {
        console.warn('⚠️ 跳过测试：缺少测试买家')
        return
      }

      console.log('\n📋 ===== 完整交易流程开始 =====')

      // Step 1: 创建物品
      const testItem = await createTestItem(testSeller.user_id)
      console.log(`Step 1: 创建物品 ${testItem.item_instance_id}`)

      // Step 2: 卖家挂牌
      const listingTx = await sequelize.transaction()
      let listing
      try {
        const listingResult = await MarketListingService.createListing(
          {
            idempotency_key: generateIdempotencyKey('e2e_listing'),
            seller_user_id: testSeller.user_id,
            item_instance_id: testItem.item_instance_id,
            price_amount: 25,
            price_asset_code: 'DIAMOND'
          },
          { transaction: listingTx }
        )
        await listingTx.commit()
        listing = listingResult.listing
        createdListings.push(listing.listing_id)
        console.log(`Step 2: 创建挂牌 ${listing.listing_id}, 状态: ${listing.status}`)
      } catch (error) {
        await listingTx.rollback()
        throw error
      }

      // Step 3: 准备买家资产
      const grantTx = await sequelize.transaction()
      try {
        await AssetService.changeBalance(
          {
            user_id: testBuyer.user_id,
            asset_code: 'DIAMOND',
            delta_amount: 50,
            business_type: 'test_grant',
            idempotency_key: generateIdempotencyKey('e2e_grant')
          },
          { transaction: grantTx }
        )
        await grantTx.commit()
        console.log('Step 3: 买家资产准备完成')
      } catch (error) {
        await grantTx.rollback()
        throw error
      }

      // Step 4: 买家下单
      const orderTx = await sequelize.transaction()
      let order
      try {
        const orderResult = await TradeOrderService.createOrder(
          {
            idempotency_key: generateIdempotencyKey('e2e_order'),
            listing_id: listing.listing_id,
            buyer_id: testBuyer.user_id
          },
          { transaction: orderTx }
        )
        await orderTx.commit()
        order = await TradeOrder.findByPk(orderResult.order_id)
        createdOrders.push(order.order_id)
        console.log(`Step 4: 创建订单 ${order.order_id}, 状态: ${order.status}`)
      } catch (error) {
        await orderTx.rollback()
        throw error
      }

      // Step 5: 完成交割
      const completeTx = await sequelize.transaction()
      try {
        const result = await TradeOrderService.completeOrder(
          {
            order_id: order.order_id,
            buyer_id: testBuyer.user_id
          },
          { transaction: completeTx }
        )
        await completeTx.commit()
        console.log(`Step 5: 订单完成, 手续费: ${result.fee_amount}, 实收: ${result.net_amount}`)
      } catch (error) {
        await completeTx.rollback()
        throw error
      }

      // Step 6: 验证最终状态
      const finalOrder = await TradeOrder.findByPk(order.order_id)
      const finalListing = await MarketListing.findByPk(listing.listing_id)
      const finalItem = await ItemInstance.findByPk(testItem.item_instance_id)

      expect(finalOrder.status).toBe('completed')
      expect(finalListing.status).toBe('sold')
      expect(finalItem.owner_user_id).toBe(testBuyer.user_id)

      console.log('Step 6: 最终验证通过')
      console.log('📋 ===== 完整交易流程结束 =====\n')
    })
  })
})
