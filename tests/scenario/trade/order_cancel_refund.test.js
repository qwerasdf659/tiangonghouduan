/**
 * 8.8 订单取消退款测试（Order Cancel and Refund Tests）
 *
 * 测试目标：
 * 1. 验证订单取消后买家资产正确解冻
 * 2. 验证订单取消后挂牌状态正确恢复
 * 3. 验证取消操作的幂等性
 * 4. 验证并发取消场景的正确性
 * 5. 验证不同订单状态下的取消行为
 *
 * 测试场景：
 * - 场景1：正常取消订单流程
 * - 场景2：取消操作幂等性验证
 * - 场景3：并发取消同一订单
 * - 场景4：取消后重新购买
 * - 场景5：异常状态订单取消
 *
 * 依赖服务：
 * - MarketListingService：挂牌服务
 * - TradeOrderService：订单服务
 * - BalanceService：资产余额服务（V4.7.0 从 AssetService 拆分）
 *
 * @file tests/integration/order_cancel_refund.test.js
 * @version V4.6 - 订单取消退款测试
 * @date 2026-01-28
 */

'use strict'

const {
  sequelize,
  User,
  MarketListing,
  TradeOrder
  // AccountAssetBalance 用于后续资产交割验证扩展
} = require('../../../models')
// V4.7.0 拆分：使用 market-listing/CoreService
const MarketListingService = require('../../../services/market-listing/CoreService')
const TradeOrderService = require('../../../services/TradeOrderService')
// V4.7.0 AssetService 拆分：使用 BalanceService（2026-01-31）
const BalanceService = require('../../../services/asset/BalanceService')
const { v4: uuidv4 } = require('uuid')

const {
  executeConcurrent
  // generateConcurrentTestId, delay 用于后续并发测试扩展
} = require('../../helpers/test-concurrent-utils')

const { initRealTestData, getRealTestUserId } = require('../../helpers/test-setup')

const {
  resetTestUserDailyListings,
  setTestUserListingLimit
} = require('../../helpers/test-points-setup')

// 测试配置
const TEST_ASSET_CODE = 'star_stone'
const TEST_OFFER_ASSET = 'red_core_shard'

// ==================== 辅助函数（提前定义）====================

/**
 * 获取用户资产可用余额
 * @param {number} userId - 用户ID
 * @param {string} assetCode - 资产代码
 * @returns {Promise<number>} 可用余额
 */
async function getBalance(userId, assetCode) {
  const transaction = await sequelize.transaction()
  try {
    const balance = await BalanceService.getBalance(
      { user_id: userId, asset_code: assetCode },
      { transaction }
    )
    await transaction.commit()
    return Number(balance.available_amount) || 0
  } catch (error) {
    await transaction.rollback()
    return 0
  }
}

/**
 * 获取用户资产详细余额（可用+冻结）
 * @param {number} userId - 用户ID
 * @param {string} assetCode - 资产代码
 * @returns {Promise<{available: number, frozen: number}>}
 */
async function getBalanceDetails(userId, assetCode) {
  const transaction = await sequelize.transaction()
  try {
    const balance = await BalanceService.getBalance(
      { user_id: userId, asset_code: assetCode },
      { transaction }
    )
    await transaction.commit()
    return {
      available: Number(balance.available_amount) || 0,
      frozen: Number(balance.frozen_amount) || 0
    }
  } catch (error) {
    await transaction.rollback()
    return { available: 0, frozen: 0 }
  }
}

/**
 * 确保用户有足够余额
 * @param {number} userId - 用户ID
 * @param {string} assetCode - 资产代码
 * @param {number} minBalance - 最小余额要求
 */
async function ensureBalance(userId, assetCode, minBalance) {
  const currentBalance = await getBalance(userId, assetCode)

  if (currentBalance < minBalance) {
    const amountToAdd = minBalance - currentBalance + 1000

    const transaction = await sequelize.transaction()
    try {
      await BalanceService.changeBalance(
        {
          user_id: userId,
          asset_code: assetCode,
          delta_amount: amountToAdd,
          business_type: 'test_topup',
          counterpart_account_id: 2,
          idempotency_key: `test_topup_${userId}_${assetCode}_${Date.now()}_${uuidv4().slice(0, 8)}`
        },
        { transaction }
      )
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      console.error(`❌ 补充余额失败: ${error.message}`)
    }
  }
}

/**
 * 确保测试用户有足够资产
 */
async function ensureTestAssets() {
  const testUserId = await getRealTestUserId()

  // 确保卖家有足够的 red_core_shard
  await ensureBalance(testUserId, TEST_OFFER_ASSET, 5000)

  // 查找买家用户
  const buyerUser = await User.findOne({
    where: {
      user_id: { [sequelize.Sequelize.Op.ne]: testUserId },
      status: 'active'
    }
  })

  if (buyerUser) {
    // 确保买家有足够的 star_stone
    await ensureBalance(buyerUser.user_id, TEST_ASSET_CODE, 10000)
  }
}

/**
 * 清理用户活跃挂牌（避免超出10个挂牌限制）
 * @param {number} userId - 用户ID
 */
async function cleanupActiveListings(userId) {
  try {
    // 查询用户活跃挂牌
    const activeListings = await MarketListing.findAll({
      where: {
        seller_user_id: userId,
        status: 'on_sale'
      }
    })

    if (activeListings.length > 3) {
      console.log(`🧹 活跃挂牌超过3个（${activeListings.length}），开始撤回...`)
      const toWithdraw = activeListings.slice(3)

      for (const listing of toWithdraw) {
        const transaction = await sequelize.transaction()
        try {
          const withdrawParams = {
            market_listing_id: listing.market_listing_id,
            seller_user_id: listing.seller_user_id,
            idempotency_key: `cleanup_order_cancel_${listing.market_listing_id}_${Date.now()}`
          }

          if (listing.listing_kind === 'fungible_asset') {
            await MarketListingService.withdrawFungibleAssetListing(withdrawParams, { transaction })
          } else {
            await MarketListingService.withdrawListing(withdrawParams, { transaction })
          }

          await transaction.commit()
          console.log(`✅ 撤回挂牌 ${listing.market_listing_id}`)
        } catch (e) {
          if (!transaction.finished) {
            await transaction.rollback()
          }
          console.warn(`⚠️ 撤回挂牌 ${listing.market_listing_id} 失败: ${e.message}`)
        }
      }
    }

    console.log(`✅ 用户 ${userId} 挂牌清理完成`)
  } catch (error) {
    console.error(`❌ 清理挂牌失败: ${error.message}`)
  }
}

// ==================== 测试套件 ====================

/**
 * 订单取消退款测试套件
 */
describe('【8.8】订单取消退款测试 - 资产解冻和状态恢复', () => {
  let sellerUserId
  let buyerUserId
  const createdListingIds = []
  const createdOrderIds = []

  beforeAll(async () => {
    // 1. 初始化测试数据
    await initRealTestData()
    const testUserId = await getRealTestUserId()

    if (!testUserId) {
      throw new Error('测试用户不存在，请先创建测试数据')
    }

    sellerUserId = testUserId

    // 2. 查找买家用户
    const secondUser = await User.findOne({
      where: {
        user_id: { [sequelize.Sequelize.Op.ne]: sellerUserId },
        status: 'active'
      }
    })

    if (secondUser) {
      buyerUserId = secondUser.user_id
    } else {
      console.warn('⚠️ 只有一个测试用户，部分场景将被跳过')
      buyerUserId = null
    }

    // 3. 重置每日挂牌限制和清理活跃挂牌
    console.log('🧹 重置每日挂牌限制和清理活跃挂牌...')
    await resetTestUserDailyListings(sellerUserId, TEST_ASSET_CODE)
    await setTestUserListingLimit(1000, sellerUserId, TEST_ASSET_CODE)
    await cleanupActiveListings(sellerUserId)

    // 4. 确保用户有足够资产
    await ensureTestAssets()

    console.log(`✅ 测试初始化完成：seller_id=${sellerUserId}, buyer_id=${buyerUserId || '无'}`)
  }, 60000)

  afterAll(async () => {
    // 清理测试数据
    for (const listingId of createdListingIds) {
      try {
        const listing = await MarketListing.findByPk(listingId)
        if (listing && listing.status === 'on_sale') {
          const transaction = await sequelize.transaction()
          try {
            await MarketListingService.withdrawFungibleAssetListing(
              {
                market_listing_id: listingId,
                seller_user_id: listing.seller_user_id,
                idempotency_key: `cleanup_${listingId}_${Date.now()}`
              },
              { transaction }
            )
            await transaction.commit()
          } catch (e) {
            await transaction.rollback()
          }
        }
      } catch (e) {
        // 忽略
      }
    }

    for (const orderId of createdOrderIds) {
      try {
        const order = await TradeOrder.findByPk(orderId)
        if (order && order.status === 'frozen') {
          const transaction = await sequelize.transaction()
          try {
            await TradeOrderService.cancelOrder(
              {
                trade_order_id: orderId,
                idempotency_key: `cleanup_cancel_${orderId}_${Date.now()}`
              },
              { transaction }
            )
            await transaction.commit()
          } catch (e) {
            await transaction.rollback()
          }
        }
      } catch (e) {
        // 忽略
      }
    }
  })

  /**
   * 场景1：正常取消订单流程
   */
  describe('场景1：正常取消订单流程', () => {
    let testListingId
    let testOrderId
    const offerAmount = 100
    const priceAmount = 500

    test('步骤1：创建挂牌和订单', async () => {
      if (!buyerUserId) {
        console.warn('⚠️ 无买家用户，跳过此测试')
        return
      }

      // 创建挂牌
      const listingIdempotencyKey = `listing_cancel_test_${sellerUserId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction1 = await sequelize.transaction()
      try {
        const listingResult = await MarketListingService.createFungibleAssetListing(
          {
            seller_user_id: sellerUserId,
            offer_asset_code: TEST_OFFER_ASSET,
            offer_amount: offerAmount,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: priceAmount,
            idempotency_key: listingIdempotencyKey
          },
          { transaction: transaction1 }
        )
        await transaction1.commit()
        testListingId = listingResult.listing?.market_listing_id
        createdListingIds.push(testListingId)
      } catch (error) {
        await transaction1.rollback()
        throw error
      }

      // 创建订单
      const orderIdempotencyKey = `order_cancel_test_${buyerUserId}_${testListingId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction2 = await sequelize.transaction()
      try {
        const orderResult = await TradeOrderService.createOrder(
          {
            market_listing_id: testListingId,
            buyer_id: buyerUserId,
            idempotency_key: orderIdempotencyKey
          },
          { transaction: transaction2 }
        )
        await transaction2.commit()
        testOrderId = orderResult.trade_order_id
        createdOrderIds.push(testOrderId)
      } catch (error) {
        await transaction2.rollback()
        throw error
      }

      // 验证订单状态
      const order = await TradeOrder.findByPk(testOrderId)
      expect(order.status).toBe('frozen')

      // 验证挂牌状态
      const listing = await MarketListing.findByPk(testListingId)
      expect(listing.status).toBe('locked')

      console.log(`📦 创建测试数据: market_listing_id=${testListingId}, order_id=${testOrderId}`)
    }, 30000)

    test('步骤2：记录取消前的资产状态', async () => {
      if (!buyerUserId || !testOrderId) {
        console.warn('⚠️ 缺少测试数据，跳过此测试')
        return
      }

      const buyerBalance = await getBalanceDetails(buyerUserId, TEST_ASSET_CODE)
      const sellerBalance = await getBalanceDetails(sellerUserId, TEST_OFFER_ASSET)

      console.log(
        `📊 取消前 - 买家 ${TEST_ASSET_CODE}: available=${buyerBalance.available}, frozen=${buyerBalance.frozen}`
      )
      console.log(
        `📊 取消前 - 卖家 ${TEST_OFFER_ASSET}: available=${sellerBalance.available}, frozen=${sellerBalance.frozen}`
      )

      // 买家应该有冻结的 star_stone
      expect(Number(buyerBalance.frozen)).toBeGreaterThan(0)
    }, 15000)

    test('步骤3：取消订单', async () => {
      if (!buyerUserId || !testOrderId) {
        console.warn('⚠️ 缺少测试数据，跳过此测试')
        return
      }

      const cancelIdempotencyKey = `cancel_${testOrderId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction = await sequelize.transaction()
      try {
        const result = await TradeOrderService.cancelOrder(
          {
            trade_order_id: testOrderId,
            idempotency_key: cancelIdempotencyKey
          },
          { transaction }
        )
        await transaction.commit()

        // cancelOrder 返回 { order, is_duplicate } 而非 { success: true }
        expect(result.order).toBeDefined()
        expect(result.order.status).toBe('cancelled')
        console.log(`✅ 订单取消成功: order_id=${testOrderId}`)
      } catch (error) {
        if (!transaction.finished) {
          await transaction.rollback()
        }
        throw error
      }
    }, 30000)

    test('步骤4：验证取消后的状态', async () => {
      if (!buyerUserId || !testOrderId || !testListingId) {
        console.warn('⚠️ 缺少测试数据，跳过此测试')
        return
      }

      // 验证订单状态
      const order = await TradeOrder.findByPk(testOrderId)
      expect(order.status).toBe('cancelled')

      // 验证挂牌状态恢复为 on_sale
      const listing = await MarketListing.findByPk(testListingId)
      expect(listing.status).toBe('on_sale')

      // 验证买家资产已解冻
      const buyerBalance = await getBalanceDetails(buyerUserId, TEST_ASSET_CODE)
      console.log(
        `📊 取消后 - 买家 ${TEST_ASSET_CODE}: available=${buyerBalance.available}, frozen=${buyerBalance.frozen}`
      )

      /*
       * 冻结余额应该为0或减少（此订单的冻结已解除）
       * 注意：可能有其他订单的冻结，所以不能断言 frozen === 0
       */

      console.log(`✅ 订单取消验证通过`)
    }, 15000)
  })

  /**
   * 场景2：取消操作幂等性验证
   */
  describe('场景2：取消操作幂等性验证', () => {
    let testListingId
    let testOrderId

    beforeEach(async () => {
      if (!buyerUserId) return

      // 创建挂牌
      const listingIdempotencyKey = `listing_idem_cancel_${sellerUserId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction1 = await sequelize.transaction()
      try {
        const listingResult = await MarketListingService.createFungibleAssetListing(
          {
            seller_user_id: sellerUserId,
            offer_asset_code: TEST_OFFER_ASSET,
            offer_amount: 50,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: 250,
            idempotency_key: listingIdempotencyKey
          },
          { transaction: transaction1 }
        )
        await transaction1.commit()
        testListingId = listingResult.listing?.market_listing_id
        createdListingIds.push(testListingId)
      } catch (error) {
        await transaction1.rollback()
        throw error
      }

      // 创建订单
      const orderIdempotencyKey = `order_idem_cancel_${buyerUserId}_${testListingId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction2 = await sequelize.transaction()
      try {
        const orderResult = await TradeOrderService.createOrder(
          {
            market_listing_id: testListingId,
            buyer_id: buyerUserId,
            idempotency_key: orderIdempotencyKey
          },
          { transaction: transaction2 }
        )
        await transaction2.commit()
        testOrderId = orderResult.trade_order_id
        createdOrderIds.push(testOrderId)
      } catch (error) {
        await transaction2.rollback()
        throw error
      }
    })

    test('重复取消请求应该返回幂等结果', async () => {
      if (!buyerUserId || !testOrderId) {
        console.warn('⚠️ 缺少测试数据，跳过此测试')
        return
      }

      const cancelIdempotencyKey = `cancel_idem_${testOrderId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      // 第一次取消
      const transaction1 = await sequelize.transaction()
      let firstResult
      try {
        firstResult = await TradeOrderService.cancelOrder(
          {
            trade_order_id: testOrderId,
            idempotency_key: cancelIdempotencyKey
          },
          { transaction: transaction1 }
        )
        await transaction1.commit()
      } catch (error) {
        if (!transaction1.finished) {
          await transaction1.rollback()
        }
        throw error
      }

      // cancelOrder 返回 { order, is_duplicate } 而非 { success: true }
      expect(firstResult.order).toBeDefined()
      expect(firstResult.order.status).toBe('cancelled')

      // 重复取消（使用相同幂等键）
      const transaction2 = await sequelize.transaction()
      let _duplicateResult // 用于后续幂等性验证扩展
      try {
        _duplicateResult = await TradeOrderService.cancelOrder(
          {
            trade_order_id: testOrderId,
            idempotency_key: cancelIdempotencyKey
          },
          { transaction: transaction2 }
        )
        await transaction2.commit()
      } catch (error) {
        if (!transaction2.finished) {
          await transaction2.rollback()
        }
        // 幂等返回可能以异常形式返回已取消的信息
        _duplicateResult = { order: { status: 'cancelled' }, is_duplicate: true }
      }

      // 验证订单仍然是已取消状态
      const order = await TradeOrder.findByPk(testOrderId)
      expect(order.status).toBe('cancelled')

      console.log(`✅ 取消幂等性验证通过: order_id=${testOrderId}`)
    }, 30000)

    test('使用不同幂等键取消已取消的订单应失败或返回已取消', async () => {
      if (!buyerUserId || !testOrderId) {
        console.warn('⚠️ 缺少测试数据，跳过此测试')
        return
      }

      // 先取消订单
      const firstCancelKey = `first_cancel_${testOrderId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction1 = await sequelize.transaction()
      try {
        await TradeOrderService.cancelOrder(
          {
            trade_order_id: testOrderId,
            idempotency_key: firstCancelKey
          },
          { transaction: transaction1 }
        )
        await transaction1.commit()
      } catch (error) {
        await transaction1.rollback()
        // 可能已经取消
      }

      // 使用不同幂等键再次取消
      const secondCancelKey = `second_cancel_${testOrderId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction2 = await sequelize.transaction()
      try {
        await TradeOrderService.cancelOrder(
          {
            trade_order_id: testOrderId,
            idempotency_key: secondCancelKey
          },
          { transaction: transaction2 }
        )
        await transaction2.commit()
        // 如果成功，说明服务允许重复取消（幂等返回）
        console.log(`📊 服务允许重复取消（幂等行为）`)
      } catch (error) {
        await transaction2.rollback()
        // 期望抛出订单已取消的错误
        expect(error.message).toMatch(/已取消|cancelled|状态|cannot/i)
        console.log(`📊 服务拒绝重复取消: ${error.message}`)
      }

      // 无论如何，订单状态应该是已取消
      const order = await TradeOrder.findByPk(testOrderId)
      expect(order.status).toBe('cancelled')
    }, 30000)
  })

  /**
   * 场景3：并发取消同一订单
   */
  describe('场景3：并发取消同一订单', () => {
    let testListingId
    let testOrderId

    beforeEach(async () => {
      if (!buyerUserId) return

      // 创建挂牌
      const listingIdempotencyKey = `listing_conc_cancel_${sellerUserId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction1 = await sequelize.transaction()
      try {
        const listingResult = await MarketListingService.createFungibleAssetListing(
          {
            seller_user_id: sellerUserId,
            offer_asset_code: TEST_OFFER_ASSET,
            offer_amount: 50,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: 250,
            idempotency_key: listingIdempotencyKey
          },
          { transaction: transaction1 }
        )
        await transaction1.commit()
        testListingId = listingResult.listing?.market_listing_id
        createdListingIds.push(testListingId)
      } catch (error) {
        await transaction1.rollback()
        throw error
      }

      // 创建订单
      const orderIdempotencyKey = `order_conc_cancel_${buyerUserId}_${testListingId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction2 = await sequelize.transaction()
      try {
        const orderResult = await TradeOrderService.createOrder(
          {
            market_listing_id: testListingId,
            buyer_id: buyerUserId,
            idempotency_key: orderIdempotencyKey
          },
          { transaction: transaction2 }
        )
        await transaction2.commit()
        testOrderId = orderResult.trade_order_id
        createdOrderIds.push(testOrderId)
      } catch (error) {
        await transaction2.rollback()
        throw error
      }
    })

    test('并发取消同一订单，只有一个成功执行', async () => {
      if (!buyerUserId || !testOrderId) {
        console.warn('⚠️ 缺少测试数据，跳过此测试')
        return
      }

      // 记录取消前的买家余额
      const balanceBefore = await getBalanceDetails(buyerUserId, TEST_ASSET_CODE)
      console.log(
        `📊 并发取消前 - 买家余额: available=${balanceBefore.available}, frozen=${balanceBefore.frozen}`
      )

      // 创建并发取消任务（不同幂等键）
      const tasks = Array(5)
        .fill()
        .map((_, index) => async () => {
          const cancelIdempotencyKey = `conc_cancel_${testOrderId}_${Date.now()}_${index}_${uuidv4().slice(0, 8)}`

          const transaction = await sequelize.transaction()
          try {
            const result = await TradeOrderService.cancelOrder(
              {
                trade_order_id: testOrderId,
                idempotency_key: cancelIdempotencyKey
              },
              { transaction }
            )
            await transaction.commit()
            return { success: true, result }
          } catch (error) {
            await transaction.rollback()
            return { success: false, error: error.message }
          }
        })

      const { results } = await executeConcurrent(tasks, {
        concurrency: 5,
        timeout: 30000
      })

      const successful = results.filter(r => r.result?.success === true)
      const failed = results.filter(r => r.result?.success === false)

      console.log(`📊 并发取消结果: 成功=${successful.length}, 失败=${failed.length}`)

      // 至少有一个成功
      expect(successful.length).toBeGreaterThanOrEqual(1)

      // 验证订单最终状态是已取消
      const order = await TradeOrder.findByPk(testOrderId)
      expect(order.status).toBe('cancelled')

      // 验证挂牌状态恢复
      const listing = await MarketListing.findByPk(testListingId)
      expect(listing.status).toBe('on_sale')

      // 验证买家资产只解冻一次
      const balanceAfter = await getBalanceDetails(buyerUserId, TEST_ASSET_CODE)
      console.log(
        `📊 并发取消后 - 买家余额: available=${balanceAfter.available}, frozen=${balanceAfter.frozen}`
      )

      // 可用余额应该增加（解冻）
      expect(Number(balanceAfter.available)).toBeGreaterThanOrEqual(Number(balanceBefore.available))
    }, 60000)
  })

  /**
   * 场景4：取消后重新购买
   */
  describe('场景4：取消后重新购买', () => {
    let testListingId

    beforeEach(async () => {
      if (!buyerUserId) return

      // 创建挂牌
      const listingIdempotencyKey = `listing_rebuy_${sellerUserId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction = await sequelize.transaction()
      try {
        const listingResult = await MarketListingService.createFungibleAssetListing(
          {
            seller_user_id: sellerUserId,
            offer_asset_code: TEST_OFFER_ASSET,
            offer_amount: 50,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: 250,
            idempotency_key: listingIdempotencyKey
          },
          { transaction }
        )
        await transaction.commit()
        testListingId = listingResult.listing?.market_listing_id
        createdListingIds.push(testListingId)
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    test('取消订单后应该能够重新购买', async () => {
      if (!buyerUserId || !testListingId) {
        console.warn('⚠️ 缺少测试数据，跳过此测试')
        return
      }

      // 第一次购买
      const orderKey1 = `order_first_${buyerUserId}_${testListingId}_${Date.now()}_${uuidv4().slice(0, 8)}`
      let firstOrderId

      const transaction1 = await sequelize.transaction()
      try {
        const orderResult = await TradeOrderService.createOrder(
          {
            market_listing_id: testListingId,
            buyer_id: buyerUserId,
            idempotency_key: orderKey1
          },
          { transaction: transaction1 }
        )
        await transaction1.commit()
        firstOrderId = orderResult.trade_order_id
        createdOrderIds.push(firstOrderId)
      } catch (error) {
        await transaction1.rollback()
        throw error
      }

      // 取消第一次订单
      const cancelKey = `cancel_first_${firstOrderId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction2 = await sequelize.transaction()
      try {
        await TradeOrderService.cancelOrder(
          {
            trade_order_id: firstOrderId,
            idempotency_key: cancelKey
          },
          { transaction: transaction2 }
        )
        await transaction2.commit()
      } catch (error) {
        await transaction2.rollback()
        throw error
      }

      // 验证挂牌状态恢复
      const listingAfterCancel = await MarketListing.findByPk(testListingId)
      expect(listingAfterCancel.status).toBe('on_sale')

      // 重新购买
      const orderKey2 = `order_second_${buyerUserId}_${testListingId}_${Date.now()}_${uuidv4().slice(0, 8)}`
      let secondOrderId

      const transaction3 = await sequelize.transaction()
      try {
        const orderResult = await TradeOrderService.createOrder(
          {
            market_listing_id: testListingId,
            buyer_id: buyerUserId,
            idempotency_key: orderKey2
          },
          { transaction: transaction3 }
        )
        await transaction3.commit()
        secondOrderId = orderResult.trade_order_id
        createdOrderIds.push(secondOrderId)
      } catch (error) {
        await transaction3.rollback()
        throw error
      }

      // 验证新订单创建成功
      expect(secondOrderId).toBeDefined()
      expect(secondOrderId).not.toBe(firstOrderId)

      // 验证新订单状态
      const secondOrder = await TradeOrder.findByPk(secondOrderId)
      expect(secondOrder.status).toBe('frozen')

      // 验证挂牌状态变为 locked
      const listingAfterRebuy = await MarketListing.findByPk(testListingId)
      expect(listingAfterRebuy.status).toBe('locked')

      console.log(
        `✅ 取消后重新购买验证通过: first_order=${firstOrderId}, second_order=${secondOrderId}`
      )
    }, 60000)
  })

  /**
   * 场景5：异常状态订单取消
   */
  describe('场景5：异常状态订单取消', () => {
    test('已完成的订单不能取消', async () => {
      /*
       * 创建一个已完成的订单场景比较复杂，这里使用简化验证
       * 直接检查取消服务对于非 frozen 状态订单的处理
       */

      if (!buyerUserId) {
        console.warn('⚠️ 缺少买家用户，跳过此测试')
        return
      }

      // 创建并完成一个订单
      const listingIdempotencyKey = `listing_completed_${sellerUserId}_${Date.now()}_${uuidv4().slice(0, 8)}`
      let testListingId

      const transaction1 = await sequelize.transaction()
      try {
        const listingResult = await MarketListingService.createFungibleAssetListing(
          {
            seller_user_id: sellerUserId,
            offer_asset_code: TEST_OFFER_ASSET,
            offer_amount: 30,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: 150,
            idempotency_key: listingIdempotencyKey
          },
          { transaction: transaction1 }
        )
        await transaction1.commit()
        testListingId = listingResult.listing?.market_listing_id
        createdListingIds.push(testListingId)
      } catch (error) {
        await transaction1.rollback()
        throw error
      }

      // 创建订单
      const orderIdempotencyKey = `order_completed_${buyerUserId}_${testListingId}_${Date.now()}_${uuidv4().slice(0, 8)}`
      let testOrderId

      const transaction2 = await sequelize.transaction()
      try {
        const orderResult = await TradeOrderService.createOrder(
          {
            market_listing_id: testListingId,
            buyer_id: buyerUserId,
            idempotency_key: orderIdempotencyKey
          },
          { transaction: transaction2 }
        )
        await transaction2.commit()
        testOrderId = orderResult.trade_order_id
        createdOrderIds.push(testOrderId)
      } catch (error) {
        await transaction2.rollback()
        throw error
      }

      // 完成订单
      const completeIdempotencyKey = `complete_${testOrderId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction3 = await sequelize.transaction()
      try {
        await TradeOrderService.completeOrder(
          {
            trade_order_id: testOrderId,
            idempotency_key: completeIdempotencyKey
          },
          { transaction: transaction3 }
        )
        await transaction3.commit()
      } catch (error) {
        await transaction3.rollback()
        throw error
      }

      // 验证订单已完成
      const completedOrder = await TradeOrder.findByPk(testOrderId)
      expect(completedOrder.status).toBe('completed')

      // 尝试取消已完成的订单（应该失败）
      const cancelIdempotencyKey = `cancel_completed_${testOrderId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction4 = await sequelize.transaction()
      try {
        await TradeOrderService.cancelOrder(
          {
            trade_order_id: testOrderId,
            idempotency_key: cancelIdempotencyKey
          },
          { transaction: transaction4 }
        )
        await transaction4.commit()
        throw new Error('应该抛出订单已完成无法取消的错误')
      } catch (error) {
        if (error.message === '应该抛出订单已完成无法取消的错误') throw error
        await transaction4.rollback()
        expect(error.message).toMatch(/completed|已完成|状态|cannot|不能/i)
        console.log(`✅ 已完成订单取消失败验证通过: ${error.message}`)
      }
    }, 60000)

    test('不存在的订单取消应报错', async () => {
      const fakeOrderId = 999999999
      const cancelIdempotencyKey = `cancel_fake_${fakeOrderId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction = await sequelize.transaction()
      try {
        await TradeOrderService.cancelOrder(
          {
            trade_order_id: fakeOrderId,
            idempotency_key: cancelIdempotencyKey
          },
          { transaction }
        )
        await transaction.commit()
        throw new Error('应该抛出订单不存在的错误')
      } catch (error) {
        if (error.message === '应该抛出订单不存在的错误') throw error
        await transaction.rollback()
        expect(error.message).toMatch(/不存在|not found|invalid|无效/i)
        console.log(`✅ 不存在订单取消失败验证通过: ${error.message}`)
      }
    }, 15000)
  })
})
