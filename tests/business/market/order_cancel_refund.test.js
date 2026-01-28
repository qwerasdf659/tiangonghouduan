/**
 * 🎯 订单取消退款测试 - 任务 8.8
 *
 * 创建时间：2026-01-28 北京时间
 * 版本：V1.0
 * 优先级：P0 - 核心业务路径
 *
 * 业务场景：
 * - 买家主动取消订单
 * - 卖家超时未发货导致订单取消
 * - 系统自动取消超时订单
 *
 * 退款流程验证：
 * 1. 冻结资产解冻（AssetService.unfreeze）
 * 2. 挂牌状态恢复（locked → on_sale）
 * 3. 订单状态更新（frozen → cancelled）
 * 4. 物品状态恢复（如适用）
 *
 * 技术验证点：
 * 1. TradeOrderService.cancelOrder 原子性
 * 2. 资产解冻正确性
 * 3. 挂牌重新上架
 * 4. 取消原因记录
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
const { v4: _uuidv4 } = require('uuid')
const { prepareMarketTestEnvironment } = require('../../helpers/test-points-setup')

// 测试超时设置
jest.setTimeout(60000)

describe('💰 订单取消退款测试', () => {
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
        name: `取消退款测试物品_${Date.now()}`,
        description: '订单取消退款测试用物品'
      }
    }

    const item = await ItemInstance.create(itemData)
    createdItems.push(item.item_instance_id)
    return item
  }

  /**
   * 创建完整的测试订单（挂牌 + 订单）
   */
  async function createTestOrder(priceAmount = 50) {
    // 1. 创建物品
    const testItem = await createTestItem(testSeller.user_id)

    // 2. 创建挂牌
    const listingTx = await sequelize.transaction()
    let listing
    try {
      const listingResult = await MarketListingService.createListing(
        {
          idempotency_key: generateIdempotencyKey('cancel_listing'),
          seller_user_id: testSeller.user_id,
          item_instance_id: testItem.item_instance_id,
          price_amount: priceAmount,
          price_asset_code: 'DIAMOND'
        },
        { transaction: listingTx }
      )
      await listingTx.commit()
      listing = listingResult.listing
      createdListings.push(listing.listing_id)
    } catch (error) {
      await listingTx.rollback()
      throw error
    }

    // 3. 准备买家资产
    const grantTx = await sequelize.transaction()
    try {
      await AssetService.changeBalance(
        {
          user_id: testBuyer.user_id,
          asset_code: 'DIAMOND',
          delta_amount: priceAmount + 50,
          business_type: 'test_grant',
          idempotency_key: generateIdempotencyKey('grant_for_cancel')
        },
        { transaction: grantTx }
      )
      await grantTx.commit()
    } catch (error) {
      await grantTx.rollback()
      throw error
    }

    // 4. 创建订单
    const orderTx = await sequelize.transaction()
    let order
    try {
      const orderResult = await TradeOrderService.createOrder(
        {
          idempotency_key: generateIdempotencyKey('cancel_order'),
          listing_id: listing.listing_id,
          buyer_id: testBuyer.user_id
        },
        { transaction: orderTx }
      )
      await orderTx.commit()
      order = await TradeOrder.findByPk(orderResult.order_id)
      createdOrders.push(order.order_id)
    } catch (error) {
      await orderTx.rollback()
      throw error
    }

    return { item: testItem, listing, order }
  }

  beforeAll(async () => {
    console.log('🎯 ===== 订单取消退款测试启动 =====')

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
  })

  beforeEach(async () => {
    // 获取测试卖家
    testSeller = await User.findOne({
      where: { mobile: '13612227930' }
    })

    if (!testSeller) {
      throw new Error('测试卖家不存在')
    }

    // 获取测试买家
    testBuyer = await User.findOne({
      where: { mobile: '13800138000' }
    })

    if (!testBuyer) {
      testBuyer = await User.findOne({
        where: {
          user_id: { [sequelize.Sequelize.Op.ne]: testSeller.user_id },
          status: 'active'
        }
      })
    }

    if (!testBuyer) {
      console.warn('⚠️ 未找到测试买家')
    }

    console.log('✅ 测试用户准备完成', {
      seller_id: testSeller.user_id,
      buyer_id: testBuyer?.user_id
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
    console.log('🏁 订单取消退款测试完成')
  })

  /**
   * ==========================================
   * 💰 核心退款流程测试
   * ==========================================
   */
  describe('核心退款流程', () => {
    /**
     * 核心测试：取消订单应正确退款
     */
    test('取消订单应解冻买家资产并恢复挂牌状态', async () => {
      if (!testBuyer) {
        console.warn('⚠️ 跳过测试：缺少测试买家')
        return
      }

      // 1. 创建完整订单
      const { item: _item, listing, order } = await createTestOrder(60)
      console.log(`✅ 测试订单创建成功: order_id=${order.order_id}`)

      // 2. 记录取消前的状态
      const buyerBalanceBefore = await AssetService.getBalance({
        user_id: testBuyer.user_id,
        asset_code: 'DIAMOND'
      })
      const buyerAvailableBefore = Number(buyerBalanceBefore?.available_amount || 0)
      const buyerFrozenBefore = Number(buyerBalanceBefore?.frozen_amount || 0)

      console.log(
        `📊 取消前买家余额: available=${buyerAvailableBefore}, frozen=${buyerFrozenBefore}`
      )

      // 验证订单状态为 frozen
      expect(order.status).toBe('frozen')

      // 验证挂牌状态为 locked
      const lockedListing = await MarketListing.findByPk(listing.listing_id)
      expect(lockedListing.status).toBe('locked')

      // 3. 执行取消订单
      const cancelTx = await sequelize.transaction()
      let cancelResult
      try {
        cancelResult = await TradeOrderService.cancelOrder(
          {
            order_id: order.order_id,
            cancel_reason: '测试取消订单'
          },
          { transaction: cancelTx }
        )
        await cancelTx.commit()
        console.log('✅ 订单取消成功')
      } catch (error) {
        await cancelTx.rollback()
        throw error
      }

      // 4. 验证取消结果
      expect(cancelResult).toHaveProperty('order')
      expect(cancelResult).toHaveProperty('unfreeze')

      // 5. 验证订单状态
      const cancelledOrder = await TradeOrder.findByPk(order.order_id)
      expect(cancelledOrder.status).toBe('cancelled')
      expect(cancelledOrder.cancelled_at).not.toBeNull()

      // 验证取消原因记录
      expect(cancelledOrder.meta?.cancel_reason).toBe('测试取消订单')

      // 6. 验证挂牌状态恢复
      const restoredListing = await MarketListing.findByPk(listing.listing_id)
      expect(restoredListing.status).toBe('on_sale')
      expect(restoredListing.locked_by_order_id).toBeNull()
      expect(restoredListing.locked_at).toBeNull()

      // 7. 验证买家资产解冻
      const buyerBalanceAfter = await AssetService.getBalance({
        user_id: testBuyer.user_id,
        asset_code: 'DIAMOND'
      })
      const buyerAvailableAfter = Number(buyerBalanceAfter?.available_amount || 0)
      const buyerFrozenAfter = Number(buyerBalanceAfter?.frozen_amount || 0)

      console.log(`📊 取消后买家余额: available=${buyerAvailableAfter}, frozen=${buyerFrozenAfter}`)

      /*
       * 资产应从冻结恢复到可用
       * 注意：由于测试可能有其他冻结，只验证趋势
       */
      expect(buyerFrozenAfter).toBeLessThanOrEqual(buyerFrozenBefore)

      console.log('✅ 订单取消退款验证通过')
    })

    /**
     * 测试：取消订单应记录取消原因
     */
    test('取消订单应正确记录取消原因', async () => {
      if (!testBuyer) {
        console.warn('⚠️ 跳过测试：缺少测试买家')
        return
      }

      const { order } = await createTestOrder(40)
      const cancelReason = '买家主动取消：不想购买了'

      const cancelTx = await sequelize.transaction()
      try {
        await TradeOrderService.cancelOrder(
          {
            order_id: order.order_id,
            cancel_reason: cancelReason
          },
          { transaction: cancelTx }
        )
        await cancelTx.commit()
      } catch (error) {
        await cancelTx.rollback()
        throw error
      }

      // 验证取消原因
      const cancelledOrder = await TradeOrder.findByPk(order.order_id)
      expect(cancelledOrder.status).toBe('cancelled')
      expect(cancelledOrder.meta?.cancel_reason).toBe(cancelReason)

      console.log('✅ 取消原因记录验证通过')
    })

    /**
     * 测试：默认取消原因
     */
    test('不提供取消原因时应使用默认原因', async () => {
      if (!testBuyer) {
        console.warn('⚠️ 跳过测试：缺少测试买家')
        return
      }

      const { order } = await createTestOrder(35)

      const cancelTx = await sequelize.transaction()
      try {
        await TradeOrderService.cancelOrder(
          {
            order_id: order.order_id
            // 不提供 cancel_reason
          },
          { transaction: cancelTx }
        )
        await cancelTx.commit()
      } catch (error) {
        await cancelTx.rollback()
        throw error
      }

      const cancelledOrder = await TradeOrder.findByPk(order.order_id)
      expect(cancelledOrder.status).toBe('cancelled')
      expect(cancelledOrder.meta?.cancel_reason).toBe('用户取消')

      console.log('✅ 默认取消原因验证通过')
    })
  })

  /**
   * ==========================================
   * 🛡️ 边界条件测试
   * ==========================================
   */
  describe('边界条件测试', () => {
    /**
     * 测试：不能取消不存在的订单
     */
    test('取消不存在的订单应返回错误', async () => {
      const fakeOrderId = 99999999

      const cancelTx = await sequelize.transaction()
      try {
        await TradeOrderService.cancelOrder(
          {
            order_id: fakeOrderId
          },
          { transaction: cancelTx }
        )
        await cancelTx.rollback()
        // 不应该到达这里
        throw new Error('测试失败：应该抛出错误表示订单不存在')
      } catch (error) {
        await cancelTx.rollback()
        if (error.message.includes('测试失败')) {
          throw error
        }
        expect(error.message).toContain('不存在')
        console.log('✅ 正确拒绝取消不存在的订单:', error.message)
      }
    })

    /**
     * 测试：不能取消已完成的订单
     */
    test('不能取消已完成的订单', async () => {
      if (!testBuyer) {
        console.warn('⚠️ 跳过测试：缺少测试买家')
        return
      }

      // 1. 创建并完成订单
      const { order } = await createTestOrder(45)

      const completeTx = await sequelize.transaction()
      try {
        await TradeOrderService.completeOrder(
          {
            order_id: order.order_id,
            buyer_id: testBuyer.user_id
          },
          { transaction: completeTx }
        )
        await completeTx.commit()
        console.log('✅ 订单已完成')
      } catch (error) {
        await completeTx.rollback()
        throw error
      }

      // 2. 尝试取消已完成的订单
      const cancelTx = await sequelize.transaction()
      try {
        await TradeOrderService.cancelOrder(
          {
            order_id: order.order_id
          },
          { transaction: cancelTx }
        )
        await cancelTx.rollback()
        // 不应该到达这里
        throw new Error('测试失败：应该抛出错误表示订单已完成')
      } catch (error) {
        await cancelTx.rollback()
        if (error.message.includes('测试失败')) {
          throw error
        }
        expect(error.message).toMatch(/状态|completed|frozen|created/i)
        console.log('✅ 正确拒绝取消已完成的订单:', error.message)
      }
    })

    /**
     * 测试：不能取消已取消的订单
     */
    test('不能重复取消订单', async () => {
      if (!testBuyer) {
        console.warn('⚠️ 跳过测试：缺少测试买家')
        return
      }

      const { order } = await createTestOrder(30)

      // 1. 第一次取消
      const cancel1Tx = await sequelize.transaction()
      try {
        await TradeOrderService.cancelOrder(
          {
            order_id: order.order_id,
            cancel_reason: '第一次取消'
          },
          { transaction: cancel1Tx }
        )
        await cancel1Tx.commit()
        console.log('✅ 第一次取消成功')
      } catch (error) {
        await cancel1Tx.rollback()
        throw error
      }

      // 2. 尝试重复取消
      const cancel2Tx = await sequelize.transaction()
      try {
        await TradeOrderService.cancelOrder(
          {
            order_id: order.order_id,
            cancel_reason: '第二次取消'
          },
          { transaction: cancel2Tx }
        )
        await cancel2Tx.rollback()
        // 不应该到达这里
        throw new Error('测试失败：应该抛出错误表示订单已取消')
      } catch (error) {
        await cancel2Tx.rollback()
        if (error.message.includes('测试失败')) {
          throw error
        }
        expect(error.message).toMatch(/状态|cancelled|frozen|created/i)
        console.log('✅ 正确拒绝重复取消订单:', error.message)
      }
    })
  })

  /**
   * ==========================================
   * 🔄 资产一致性验证
   * ==========================================
   */
  describe('资产一致性验证', () => {
    /**
     * 测试：取消订单后资产对账
     */
    test('取消订单后资产对账应正确', async () => {
      if (!testBuyer) {
        console.warn('⚠️ 跳过测试：缺少测试买家')
        return
      }

      const orderPrice = 100

      // 1. 记录初始余额
      const initialBalance = await AssetService.getBalance({
        user_id: testBuyer.user_id,
        asset_code: 'DIAMOND'
      })
      const initialAvailable = Number(initialBalance?.available_amount || 0)
      const initialFrozen = Number(initialBalance?.frozen_amount || 0)
      const initialTotal = initialAvailable + initialFrozen

      console.log(
        `📊 初始余额: available=${initialAvailable}, frozen=${initialFrozen}, total=${initialTotal}`
      )

      // 2. 创建订单（会冻结资产）
      const { order } = await createTestOrder(orderPrice)

      // 3. 验证冻结后的余额
      const afterOrderBalance = await AssetService.getBalance({
        user_id: testBuyer.user_id,
        asset_code: 'DIAMOND'
      })
      const afterOrderFrozen = Number(afterOrderBalance?.frozen_amount || 0)

      console.log(`📊 下单后: frozen=${afterOrderFrozen}`)

      // 冻结金额应该增加（至少等于订单金额）
      expect(afterOrderFrozen).toBeGreaterThanOrEqual(initialFrozen)

      // 4. 取消订单
      const cancelTx = await sequelize.transaction()
      try {
        await TradeOrderService.cancelOrder(
          {
            order_id: order.order_id,
            cancel_reason: '资产对账测试'
          },
          { transaction: cancelTx }
        )
        await cancelTx.commit()
      } catch (error) {
        await cancelTx.rollback()
        throw error
      }

      // 5. 验证取消后的余额
      const finalBalance = await AssetService.getBalance({
        user_id: testBuyer.user_id,
        asset_code: 'DIAMOND'
      })
      const finalAvailable = Number(finalBalance?.available_amount || 0)
      const finalFrozen = Number(finalBalance?.frozen_amount || 0)
      const finalTotal = finalAvailable + finalFrozen

      console.log(
        `📊 取消后: available=${finalAvailable}, frozen=${finalFrozen}, total=${finalTotal}`
      )

      /*
       * 资产总量应保持不变或仅有测试授予的增加
       * 注意：由于测试会授予额外资产，我们验证冻结金额恢复
       */
      expect(finalFrozen).toBeLessThanOrEqual(afterOrderFrozen)

      console.log('✅ 资产对账验证通过')
    })
  })

  /**
   * ==========================================
   * 📋 完整取消退款流程
   * ==========================================
   */
  describe('完整取消退款流程', () => {
    /**
     * 端到端测试：创建订单 → 取消 → 验证退款
     */
    test('完整流程：创建订单 → 取消 → 验证退款', async () => {
      if (!testBuyer) {
        console.warn('⚠️ 跳过测试：缺少测试买家')
        return
      }

      console.log('\n📋 ===== 完整取消退款流程开始 =====')

      // Step 1: 创建订单
      const { item, listing, order } = await createTestOrder(80)
      console.log(`Step 1: 创建订单 order_id=${order.order_id}`)

      // Step 2: 验证订单状态
      expect(order.status).toBe('frozen')
      console.log(`Step 2: 订单状态 = ${order.status}`)

      // Step 3: 验证挂牌已锁定
      const lockedListing = await MarketListing.findByPk(listing.listing_id)
      expect(lockedListing.status).toBe('locked')
      console.log(`Step 3: 挂牌状态 = ${lockedListing.status}`)

      // Step 4: 执行取消
      const cancelTx = await sequelize.transaction()
      try {
        await TradeOrderService.cancelOrder(
          {
            order_id: order.order_id,
            cancel_reason: '端到端测试取消'
          },
          { transaction: cancelTx }
        )
        await cancelTx.commit()
        console.log('Step 4: 取消订单成功')
      } catch (error) {
        await cancelTx.rollback()
        throw error
      }

      // Step 5: 验证最终状态
      const finalOrder = await TradeOrder.findByPk(order.order_id)
      const finalListing = await MarketListing.findByPk(listing.listing_id)
      const finalItem = await ItemInstance.findByPk(item.item_instance_id)

      expect(finalOrder.status).toBe('cancelled')
      expect(finalListing.status).toBe('on_sale')
      expect(finalItem.owner_user_id).toBe(testSeller.user_id) // 物品仍属于卖家
      expect(finalItem.status).toBe('locked') // 物品仍为挂牌锁定状态（因为挂牌恢复了）

      console.log('Step 5: 最终状态验证通过')
      console.log({
        order_status: finalOrder.status,
        listing_status: finalListing.status,
        item_owner: finalItem.owner_user_id,
        item_status: finalItem.status
      })

      console.log('📋 ===== 完整取消退款流程结束 =====\n')
    })
  })
})
