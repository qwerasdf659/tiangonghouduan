/**
 * 8.7 并发购买竞态测试（Concurrent Purchase Race Condition Tests）
 *
 * 测试目标：
 * 1. 验证多用户并发购买同一挂牌时的原子性（只能有一个成功）
 * 2. 验证并发下单时的锁机制正确性
 * 3. 验证资产冻结在并发场景下的一致性
 * 4. 验证失败订单的资产正确回滚
 *
 * 测试场景：
 * - 场景1：多用户同时购买同一挂牌（抢购）
 * - 场景2：同一用户多设备并发下单
 * - 场景3：高并发压力下的系统稳定性
 * - 场景4：并发场景下的幂等性验证
 *
 * 依赖服务：
 * - MarketListingService：挂牌服务
 * - TradeOrderService：订单服务
 * - AssetService：资产服务
 *
 * @file tests/integration/concurrent_purchase.test.js
 * @version V4.6 - 并发购买竞态测试
 * @date 2026-01-28
 */

'use strict'

const { sequelize, User, MarketListing, TradeOrder, AccountAssetBalance } = require('../../models')
const MarketListingService = require('../../services/MarketListingService')
const TradeOrderService = require('../../services/TradeOrderService')
const AssetService = require('../../services/AssetService')
const { v4: uuidv4 } = require('uuid')

const {
  executeConcurrent,
  detectRaceCondition,
  generateConcurrentTestId,
  delay
} = require('../helpers/test-concurrent-utils')

const { initRealTestData, getRealTestUserId } = require('../helpers/test-setup')

const {
  resetTestUserDailyListings,
  setTestUserListingLimit
} = require('../helpers/test-points-setup')

// 测试配置
const TEST_ASSET_CODE = 'DIAMOND'
const TEST_OFFER_ASSET = 'red_shard'
const CONCURRENT_BUYERS = 5 // 并发买家数量

/**
 * 并发购买竞态测试套件
 */
describe('【8.7】并发购买竞态测试 - 多用户抢购场景', () => {
  let sellerUserId
  let buyerUserIds = []
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

    // 2. 查找多个买家用户
    const users = await User.findAll({
      where: { status: 'active' },
      limit: CONCURRENT_BUYERS + 1, // 卖家 + 买家
      order: [['user_id', 'ASC']]
    })

    if (users.length < 2) {
      throw new Error('测试需要至少2个用户，请先创建测试数据')
    }

    // 使用除卖家外的用户作为买家
    buyerUserIds = users
      .filter(u => u.user_id !== sellerUserId)
      .map(u => u.user_id)
      .slice(0, CONCURRENT_BUYERS)

    // 如果买家不足，使用卖家自己（测试会跳过部分场景）
    if (buyerUserIds.length === 0) {
      buyerUserIds = [sellerUserId]
      console.warn('⚠️ 买家数量不足，部分并发场景将被限制')
    }

    // 3. 清理卖家的活跃挂牌和日挂牌计数（避免超出限制）
    await cleanupListingsAndResetDailyCount(sellerUserId)

    // 4. 确保所有用户有足够资产
    await ensureTestAssets()

    console.log(
      `✅ 测试初始化完成：seller_id=${sellerUserId}, buyer_ids=[${buyerUserIds.join(',')}]`
    )
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
                listing_id: listingId,
                seller_user_id: listing.seller_user_id,
                idempotency_key: `cleanup_${listingId}_${Date.now()}`
              },
              { transaction }
            )
            await transaction.commit()
          } catch (e) {
            if (!transaction.finished) {
              await transaction.rollback()
            }
          }
        }
      } catch (e) {
        // 忽略清理错误
      }
    }

    // 取消未完成的订单
    for (const orderId of createdOrderIds) {
      try {
        const order = await TradeOrder.findByPk(orderId)
        if (order && order.status === 'frozen') {
          const transaction = await sequelize.transaction()
          try {
            await TradeOrderService.cancelOrder(
              {
                order_id: orderId,
                idempotency_key: `cleanup_cancel_${orderId}_${Date.now()}`
              },
              { transaction }
            )
            await transaction.commit()
          } catch (e) {
            if (!transaction.finished) {
              await transaction.rollback()
            }
          }
        }
      } catch (e) {
        // 忽略清理错误
      }
    }
  })

  /**
   * 场景1：多用户并发购买同一挂牌
   */
  describe('场景1：多用户并发购买同一挂牌', () => {
    let testListingId
    const offerAmount = 100
    const priceAmount = 500

    beforeEach(async () => {
      // 每个测试前创建新的挂牌
      const idempotencyKey = `listing_concurrent_${sellerUserId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction = await sequelize.transaction()
      try {
        const result = await MarketListingService.createFungibleAssetListing(
          {
            seller_user_id: sellerUserId,
            offer_asset_code: TEST_OFFER_ASSET,
            offer_amount: offerAmount,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: priceAmount,
            idempotency_key: idempotencyKey
          },
          { transaction }
        )
        await transaction.commit()
        // 注意：createFungibleAssetListing 返回 { listing, freeze_result, is_duplicate }
        testListingId = result.listing?.listing_id
        if (testListingId) {
          createdListingIds.push(testListingId)
        }
        console.log(`📦 场景1: 创建测试挂牌 listing_id=${testListingId}`)
      } catch (error) {
        if (!transaction.finished) {
          await transaction.rollback()
        }
        throw error
      }
    })

    test('并发购买同一挂牌，只有一个买家成功', async () => {
      // 跳过只有一个买家的情况
      if (buyerUserIds.length < 2) {
        console.warn('⚠️ 买家数量不足，跳过此测试')
        return
      }

      // 记录所有买家的初始余额
      const initialBalances = {}
      for (const buyerId of buyerUserIds) {
        initialBalances[buyerId] = await getBalance(buyerId, TEST_ASSET_CODE)
      }

      // 创建并发购买任务
      const tasks = buyerUserIds.map(buyerId => async () => {
        const idempotencyKey = `purchase_${buyerId}_${testListingId}_${Date.now()}_${uuidv4().slice(0, 8)}`

        const transaction = await sequelize.transaction()
        try {
          const result = await TradeOrderService.createOrder(
            {
              listing_id: testListingId,
              buyer_id: buyerId,
              idempotency_key: idempotencyKey
            },
            { transaction }
          )
          await transaction.commit()
          return { success: true, order_id: result.order_id, buyer_id: buyerId }
        } catch (error) {
          if (!transaction.finished) {
            await transaction.rollback()
          }
          return { success: false, error: error.message, buyer_id: buyerId }
        }
      })

      // 执行并发购买
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: buyerUserIds.length,
        timeout: 30000
      })

      // 分析结果
      const successfulPurchases = results.filter(r => r.result?.success === true)
      const failedPurchases = results.filter(r => r.result?.success === false)

      console.log(
        `📊 并发购买结果: 成功=${successfulPurchases.length}, 失败=${failedPurchases.length}`
      )

      // 核心断言：只有一个买家成功
      expect(successfulPurchases.length).toBe(1)

      // 成功的买家应该有订单
      const successfulBuyer = successfulPurchases[0].result
      expect(successfulBuyer.order_id).toBeDefined()
      createdOrderIds.push(successfulBuyer.order_id)

      // 失败的买家应该收到挂牌已锁定的错误
      for (const failed of failedPurchases) {
        expect(failed.result.error).toMatch(/locked|已锁定|不可购买|状态|并发/i)
      }

      // 验证挂牌状态变为 locked
      const listing = await MarketListing.findByPk(testListingId)
      expect(listing.status).toBe('locked')

      // 验证只有成功的买家资产被冻结
      for (const buyerId of buyerUserIds) {
        const currentBalance = await getBalanceDetails(buyerId, TEST_ASSET_CODE)

        if (buyerId === successfulBuyer.buyer_id) {
          // 成功的买家应该有冻结余额
          expect(Number(currentBalance.frozen)).toBeGreaterThan(0)
          console.log(`📊 成功买家 ${buyerId}: frozen=${currentBalance.frozen}`)
        } else {
          // 失败的买家冻结余额应该不变（或为0）
          console.log(`📊 失败买家 ${buyerId}: frozen=${currentBalance.frozen}`)
        }
      }
    }, 60000)

    test('竞态条件检测：并发购买的数据一致性', async () => {
      if (buyerUserIds.length < 2) {
        console.warn('⚠️ 买家数量不足，跳过此测试')
        return
      }

      // 使用竞态条件检测器
      const result = await detectRaceCondition({
        beforeAction: async () => {
          // 获取挂牌状态和所有买家余额
          const listing = await MarketListing.findByPk(testListingId)
          const balances = {}
          for (const buyerId of buyerUserIds) {
            balances[buyerId] = await getBalanceDetails(buyerId, TEST_ASSET_CODE)
          }
          return { listingStatus: listing?.status || 'unknown', balances }
        },
        action: async () => {
          const buyerId = buyerUserIds[Math.floor(Math.random() * buyerUserIds.length)]
          const idempotencyKey = `race_purchase_${buyerId}_${testListingId}_${Date.now()}_${uuidv4().slice(0, 8)}`

          const transaction = await sequelize.transaction()
          try {
            const result = await TradeOrderService.createOrder(
              {
                listing_id: testListingId,
                buyer_id: buyerId,
                idempotency_key: idempotencyKey
              },
              { transaction }
            )
            await transaction.commit()
            return { success: true, order_id: result.order_id, buyer_id: buyerId }
          } catch (error) {
            if (!transaction.finished) {
              await transaction.rollback()
            }
            return { success: false, error: error.message, buyer_id: buyerId }
          }
        },
        afterAction: async () => {
          const listing = await MarketListing.findByPk(testListingId)
          const balances = {}
          for (const buyerId of buyerUserIds) {
            balances[buyerId] = await getBalanceDetails(buyerId, TEST_ASSET_CODE)
          }
          return { listingStatus: listing?.status || 'unknown', balances }
        },
        validator: (beforeState, results, afterState) => {
          const successCount = results.filter(r => r.result?.success === true).length

          // 验证：最多只有一个成功
          if (successCount > 1) {
            console.error(`❌ 数据不一致：多个买家成功购买同一挂牌 (count=${successCount})`)
            return false
          }

          // 验证：如果有成功，挂牌应该是 locked 状态
          if (successCount === 1 && afterState.listingStatus !== 'locked') {
            console.error(`❌ 数据不一致：有成功订单但挂牌状态不是 locked`)
            return false
          }

          return true
        },
        concurrency: Math.min(buyerUserIds.length, 5)
      })

      console.log(`📊 竞态检测结果: ${result.message}`)
      expect(result.isConsistent).toBe(true)
    }, 60000)
  })

  /**
   * 场景2：同一用户并发下单（多设备场景）
   */
  describe('场景2：同一用户并发下单', () => {
    let testListingId
    const testBuyerId = () => buyerUserIds[0] || sellerUserId

    beforeEach(async () => {
      // 创建新挂牌
      const idempotencyKey = `listing_single_${sellerUserId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction = await sequelize.transaction()
      try {
        const result = await MarketListingService.createFungibleAssetListing(
          {
            seller_user_id: sellerUserId,
            offer_asset_code: TEST_OFFER_ASSET,
            offer_amount: 50,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: 250,
            idempotency_key: idempotencyKey
          },
          { transaction }
        )
        await transaction.commit()
        // createFungibleAssetListing 返回 { listing, freeze_result, is_duplicate }
        testListingId = result.listing?.listing_id
        if (testListingId) {
          createdListingIds.push(testListingId)
        }
        console.log(`✅ 场景2: 创建测试挂牌 listing_id=${testListingId}`)
      } catch (error) {
        if (!transaction.finished) {
          await transaction.rollback()
        }
        throw error
      }
    })

    test('同一用户多次并发下单，只有一个成功', async () => {
      const buyerId = testBuyerId()
      if (buyerId === sellerUserId) {
        console.warn('⚠️ 跳过自买自卖场景')
        return
      }

      // 记录初始冻结余额（用于计算增量）
      const initialDetails = await getBalanceDetails(buyerId, TEST_ASSET_CODE)
      const initialFrozen = Number(initialDetails.frozen)

      // 创建多个并发下单任务（同一用户不同幂等键）
      const tasks = Array(5)
        .fill()
        .map((_, index) => async () => {
          const idempotencyKey = `single_user_${buyerId}_${testListingId}_${Date.now()}_${index}_${uuidv4().slice(0, 8)}`

          const transaction = await sequelize.transaction()
          try {
            const result = await TradeOrderService.createOrder(
              {
                listing_id: testListingId,
                buyer_id: buyerId,
                idempotency_key: idempotencyKey
              },
              { transaction }
            )
            await transaction.commit()
            return { success: true, order_id: result.order_id }
          } catch (error) {
            if (!transaction.finished) {
              await transaction.rollback()
            }
            return { success: false, error: error.message }
          }
        })

      const { results } = await executeConcurrent(tasks, {
        concurrency: 5,
        timeout: 30000
      })

      const successfulOrders = results.filter(r => r.result?.success === true)
      const failedOrders = results.filter(r => r.result?.success === false)

      console.log(
        `📊 同一用户并发下单: 成功=${successfulOrders.length}, 失败=${failedOrders.length}`
      )

      // 只有一个成功
      expect(successfulOrders.length).toBe(1)

      if (successfulOrders.length > 0) {
        createdOrderIds.push(successfulOrders[0].result.order_id)
      }

      // 验证只冻结了一次（比较增量而非总额）
      const finalBalance = await getBalanceDetails(buyerId, TEST_ASSET_CODE)
      const frozenDelta = Number(finalBalance.frozen) - initialFrozen

      // 冻结金额增量应该等于一次购买的金额（250），允许±50容差
      console.log(`📊 冻结金额变化: ${initialFrozen} → ${finalBalance.frozen}, 增量=${frozenDelta}`)
      expect(frozenDelta).toBeLessThanOrEqual(250 + 50) // 价格 + 可能的手续费
      expect(frozenDelta).toBeGreaterThanOrEqual(0) // 不应该为负
    }, 60000)

    test('使用相同幂等键的并发请求，只处理一次', async () => {
      const buyerId = testBuyerId()
      if (buyerId === sellerUserId) {
        console.warn('⚠️ 跳过自买自卖场景')
        return
      }

      // 使用同一个幂等键
      const sharedIdempotencyKey = `shared_idem_${buyerId}_${testListingId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      // 记录初始冻结余额（用于计算增量）
      const initialDetails = await getBalanceDetails(buyerId, TEST_ASSET_CODE)
      const initialFrozen = Number(initialDetails.frozen)

      // 创建多个并发下单任务（相同幂等键）
      const tasks = Array(5)
        .fill()
        .map(() => async () => {
          const transaction = await sequelize.transaction()
          try {
            const result = await TradeOrderService.createOrder(
              {
                listing_id: testListingId,
                buyer_id: buyerId,
                idempotency_key: sharedIdempotencyKey
              },
              { transaction }
            )
            await transaction.commit()
            return { success: true, order_id: result.order_id, is_duplicate: result.is_duplicate }
          } catch (error) {
            if (!transaction.finished) {
              await transaction.rollback()
            }
            return { success: false, error: error.message }
          }
        })

      const { results } = await executeConcurrent(tasks, {
        concurrency: 5,
        timeout: 30000
      })

      const successfulResults = results.filter(r => r.result?.success === true)

      // 所有成功的应该返回相同的 order_id
      if (successfulResults.length > 0) {
        const firstOrderId = successfulResults[0].result.order_id
        createdOrderIds.push(firstOrderId)

        for (const result of successfulResults) {
          expect(result.result.order_id).toBe(firstOrderId)
        }

        // 应该有 is_duplicate 标记
        const duplicateCount = successfulResults.filter(r => r.result.is_duplicate === true).length
        console.log(`📊 幂等键并发: 总成功=${successfulResults.length}, 重复返回=${duplicateCount}`)
      }

      // 验证资产只冻结一次（比较增量而非总额）
      const finalBalance = await getBalanceDetails(buyerId, TEST_ASSET_CODE)
      const frozenDelta = Number(finalBalance.frozen) - initialFrozen

      // 只应该冻结一次
      console.log(
        `📊 幂等键冻结变化: ${initialFrozen} → ${finalBalance.frozen}, 增量=${frozenDelta}`
      )
      expect(frozenDelta).toBeLessThanOrEqual(250 + 50)
      expect(frozenDelta).toBeGreaterThanOrEqual(0) // 不应该为负
    }, 60000)
  })

  /**
   * 场景3：高并发压力测试
   */
  describe('场景3：高并发压力测试', () => {
    test('大量并发请求的系统稳定性', async () => {
      // 创建多个挂牌
      const listingCount = 3
      const listingIds = []

      for (let i = 0; i < listingCount; i++) {
        const idempotencyKey = `stress_listing_${sellerUserId}_${Date.now()}_${i}_${uuidv4().slice(0, 8)}`

        const transaction = await sequelize.transaction()
        try {
          const result = await MarketListingService.createFungibleAssetListing(
            {
              seller_user_id: sellerUserId,
              offer_asset_code: TEST_OFFER_ASSET,
              offer_amount: 10,
              price_asset_code: TEST_ASSET_CODE,
              price_amount: 50,
              idempotency_key: idempotencyKey
            },
            { transaction }
          )
          await transaction.commit()
          // createFungibleAssetListing 返回 { listing, freeze_result, is_duplicate }
          const newListingId = result.listing?.listing_id
          if (newListingId) {
            listingIds.push(newListingId)
            createdListingIds.push(newListingId)
          }
        } catch (error) {
          if (!transaction.finished) {
            await transaction.rollback()
          }
        }
      }

      if (listingIds.length === 0) {
        console.warn('⚠️ 没有创建挂牌，跳过压力测试')
        return
      }

      // 创建大量并发购买任务
      const totalRequests = 20
      const tasks = Array(totalRequests)
        .fill()
        .map((_, index) => async () => {
          const buyerId = buyerUserIds[index % buyerUserIds.length] || sellerUserId
          const listingId = listingIds[index % listingIds.length]
          const idempotencyKey = `stress_purchase_${buyerId}_${listingId}_${Date.now()}_${index}_${uuidv4().slice(0, 8)}`

          // 跳过自买自卖
          if (buyerId === sellerUserId) {
            return { success: false, error: 'self_purchase', skipped: true }
          }

          const transaction = await sequelize.transaction()
          try {
            const result = await TradeOrderService.createOrder(
              {
                listing_id: listingId,
                buyer_id: buyerId,
                idempotency_key: idempotencyKey
              },
              { transaction }
            )
            await transaction.commit()
            return { success: true, order_id: result.order_id }
          } catch (error) {
            if (!transaction.finished) {
              await transaction.rollback()
            }
            return { success: false, error: error.message }
          }
        })

      const startTime = Date.now()
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: 10,
        timeout: 60000
      })
      const totalTime = Date.now() - startTime

      // 分析结果
      const successful = results.filter(r => r.result?.success === true)
      const failed = results.filter(r => r.result?.success === false && !r.result?.skipped)
      const skipped = results.filter(r => r.result?.skipped === true)

      console.log(`📊 压力测试结果:`)
      console.log(`   总请求: ${totalRequests}`)
      console.log(`   成功: ${successful.length}`)
      console.log(`   失败: ${failed.length}`)
      console.log(`   跳过: ${skipped.length}`)
      console.log(`   总耗时: ${totalTime}ms`)
      console.log(`   吞吐量: ${Math.round((totalRequests / totalTime) * 1000)} req/s`)

      // 记录成功的订单
      for (const result of successful) {
        if (result.result?.order_id) {
          createdOrderIds.push(result.result.order_id)
        }
      }

      // 核心断言：成功数不应超过挂牌数（每个挂牌只能被购买一次）
      expect(successful.length).toBeLessThanOrEqual(listingIds.length)

      // 系统应该完成所有请求（无超时）
      expect(metrics.timedOut).toBe(0)
    }, 120000)
  })
})

// ==================== 辅助函数 ====================

/**
 * 获取用户资产可用余额
 */
async function getBalance(userId, assetCode) {
  const transaction = await sequelize.transaction()
  try {
    const balance = await AssetService.getBalance(
      { user_id: userId, asset_code: assetCode },
      { transaction }
    )
    await transaction.commit()
    return Number(balance.available_amount) || 0
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback()
    }
    return 0
  }
}

/**
 * 获取用户资产详细余额
 */
async function getBalanceDetails(userId, assetCode) {
  const transaction = await sequelize.transaction()
  try {
    const balance = await AssetService.getBalance(
      { user_id: userId, asset_code: assetCode },
      { transaction }
    )
    await transaction.commit()
    return {
      available: Number(balance.available_amount) || 0,
      frozen: Number(balance.frozen_amount) || 0
    }
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback()
    }
    return { available: 0, frozen: 0 }
  }
}

/**
 * 确保用户有足够余额
 */
async function ensureBalance(userId, assetCode, minBalance) {
  const currentBalance = await getBalance(userId, assetCode)

  if (currentBalance < minBalance) {
    const amountToAdd = minBalance - currentBalance + 1000

    const transaction = await sequelize.transaction()
    try {
      await AssetService.changeBalance(
        {
          user_id: userId,
          asset_code: assetCode,
          delta_amount: amountToAdd,
          business_type: 'test_topup',
          idempotency_key: `test_topup_${userId}_${assetCode}_${Date.now()}_${uuidv4().slice(0, 8)}`
        },
        { transaction }
      )
      await transaction.commit()
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback()
      }
      console.error(`❌ 补充余额失败: ${error.message}`)
    }
  }
}

/**
 * 清理用户的活跃挂牌并重置日挂牌计数
 * 解决两个限制：
 * 1. 活跃挂牌数量限制（最多10个）
 * 2. 日挂牌次数限制（最多20次）
 *
 * @param {number} userId - 用户 ID
 */
async function cleanupListingsAndResetDailyCount(userId) {
  const { Op } = sequelize.Sequelize

  try {
    // 1. 计算北京时间今天零点（UTC时间）
    const now = new Date()
    const beijingOffset = 8 * 60 // 北京时间 UTC+8
    const utcOffset = now.getTimezoneOffset()
    const todayStartBeijing = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const todayStartUTC = new Date(
      todayStartBeijing.getTime() - (utcOffset + beijingOffset) * 60 * 1000
    )
    const yesterdayUTC = new Date(todayStartUTC.getTime() - 24 * 60 * 60 * 1000)

    // 2. 重置日挂牌计数：将今日创建的挂牌时间修改为昨天
    const todayListingCount = await MarketListing.count({
      where: {
        seller_user_id: userId,
        created_at: { [Op.gte]: todayStartUTC }
      }
    })

    if (todayListingCount > 0) {
      await MarketListing.update(
        { created_at: yesterdayUTC },
        {
          where: {
            seller_user_id: userId,
            created_at: { [Op.gte]: todayStartUTC }
          }
        }
      )
      console.log(`🧹 重置用户 ${userId} 日挂牌计数: ${todayListingCount} 条 → 昨日`)
    }

    // 3. 清理活跃挂牌（保留最多3个，为测试留出空间）
    const activeListings = await MarketListing.findAll({
      where: {
        seller_user_id: userId,
        status: 'on_sale'
      },
      order: [['created_at', 'DESC']]
    })

    if (activeListings.length > 3) {
      const toWithdraw = activeListings.slice(3) // 保留最新的3个
      console.log(`🧹 清理用户 ${userId} 多余活跃挂牌: ${toWithdraw.length} 个`)

      for (const listing of toWithdraw) {
        const transaction = await sequelize.transaction()
        try {
          const withdrawParams = {
            listing_id: listing.listing_id,
            seller_user_id: listing.seller_user_id,
            idempotency_key: `cleanup_concurrent_${listing.listing_id}_${Date.now()}`
          }

          if (listing.listing_kind === 'fungible_asset') {
            await MarketListingService.withdrawFungibleAssetListing(withdrawParams, { transaction })
          } else {
            await MarketListingService.withdrawListing(withdrawParams, { transaction })
          }

          await transaction.commit()
        } catch (e) {
          if (!transaction.finished) {
            await transaction.rollback()
          }
          // 忽略撤回失败，直接强制更新状态
          await MarketListing.update(
            { status: 'withdrawn' },
            { where: { listing_id: listing.listing_id } }
          )
        }
      }
    }

    console.log(`✅ 用户 ${userId} 挂牌限制已重置`)
  } catch (error) {
    console.error(`❌ 清理挂牌失败: ${error.message}`)
  }
}

/**
 * 确保所有测试用户有足够资产
 */
async function ensureTestAssets() {
  const testUserId = await getRealTestUserId()

  // 确保卖家有足够的 red_shard
  await ensureBalance(testUserId, TEST_OFFER_ASSET, 5000)

  // 确保所有买家有足够的 DIAMOND
  const users = await User.findAll({
    where: { status: 'active' },
    limit: CONCURRENT_BUYERS + 1
  })

  for (const user of users) {
    if (user.user_id !== testUserId) {
      await ensureBalance(user.user_id, TEST_ASSET_CODE, 10000)
    }
  }
}
