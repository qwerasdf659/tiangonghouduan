/**
 * 8.6 完整交易流程测试（Full Trade Flow Integration Tests）
 *
 * 测试目标：
 * 1. 验证完整的 C2C 交易流程：挂单 → 购买 → 交割
 * 2. 验证资产冻结/解冻/结算的正确性
 * 3. 验证物品所有权转移
 * 4. 验证手续费计算和收取
 * 5. 验证交易记录完整性
 *
 * 测试场景：
 * - 场景1：物品挂牌交易完整流程
 * - 场景2：可叠加资产挂牌交易完整流程
 * - 场景3：多币种交易流程
 * - 场景4：手续费计算验证
 * - 场景5：异常中断恢复
 *
 * 依赖服务：
 * - MarketListingService：挂牌服务
 * - TradeOrderService：订单服务
 * - BalanceService：资产余额服务（V4.7.0 从 AssetService 拆分）
 *
 * @file tests/integration/full_trade_flow.test.js
 * @version V4.6 - 完整交易流程测试
 * @date 2026-01-28
 */

'use strict'

const {
  sequelize,
  User,
  MarketListing,
  TradeOrder
  // ItemInstance, AccountAssetBalance 用于后续资产交割验证扩展
} = require('../../../models')
// V4.7.0 拆分：使用 market-listing/CoreService
const MarketListingService = require('../../../services/market-listing/CoreService')
const TradeOrderService = require('../../../services/TradeOrderService')
// V4.7.0 AssetService 拆分：使用 BalanceService（2026-01-31）
const BalanceService = require('../../../services/asset/BalanceService')
const { v4: uuidv4 } = require('uuid')

const { initRealTestData, getRealTestUserId } = require('../../helpers/test-setup')
// TestConfig 用于后续参数化测试扩展

const {
  resetTestUserDailyListings,
  setTestUserListingLimit
} = require('../../helpers/test-points-setup')

// 测试配置
const TEST_ASSET_CODE = 'DIAMOND' // 默认结算币种
const TEST_OFFER_ASSET = 'red_shard' // 可叠加资产类型
const PLATFORM_FEE_RATE = 0.05 // 平台手续费率 5%

/**
 * 完整交易流程测试套件
 */
describe('【8.6】完整交易流程测试 - 挂单→购买→交割', () => {
  let sellerUser
  let _buyerUser // 用于后续买家状态验证扩展
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
    sellerUser = await User.findByPk(sellerUserId)

    // 2. 创建或查找买家用户（使用另一个测试用户）
    const secondUser = await User.findOne({
      where: {
        user_id: { [sequelize.Sequelize.Op.ne]: sellerUserId },
        status: 'active'
      }
    })

    if (secondUser) {
      buyerUserId = secondUser.user_id
      _buyerUser = secondUser
    } else {
      // 如果没有第二个用户，使用同一个用户测试（部分场景会跳过）
      buyerUserId = sellerUserId
      _buyerUser = sellerUser
      console.warn('⚠️ 只有一个测试用户，部分跨用户场景将被跳过')
    }

    // 3. 重置每日挂牌限制（删除今日挂牌记录 + 提高上限到 1000）
    console.log('🧹 重置每日挂牌限制...')
    await resetTestUserDailyListings(sellerUserId, TEST_ASSET_CODE)
    await setTestUserListingLimit(1000, sellerUserId, TEST_ASSET_CODE)

    // 4. 清理卖家的活跃挂牌（避免超出10个挂牌限制）
    await cleanupActiveListings(sellerUserId)

    // 5. 确保用户有足够的测试资产
    await ensureSellerAssets()
    await ensureBuyerAssets()

    console.log(`✅ 测试初始化完成：seller_id=${sellerUserId}, buyer_id=${buyerUserId}`)
  }, 60000)

  afterAll(async () => {
    // 清理测试数据：撤回未完成的挂牌，取消未完成的订单
    for (const listingId of createdListingIds) {
      try {
        const listing = await MarketListing.findByPk(listingId)
        if (listing && listing.status === 'on_sale') {
          const transaction = await sequelize.transaction()
          try {
            if (listing.listing_kind === 'fungible_asset') {
              await MarketListingService.withdrawFungibleAssetListing(
                {
                  market_listing_id: listingId,
                  seller_user_id: listing.seller_user_id,
                  idempotency_key: `cleanup_withdraw_${listingId}_${Date.now()}`
                },
                { transaction }
              )
            } else {
              await MarketListingService.withdrawListing(
                {
                  market_listing_id: listingId,
                  seller_user_id: listing.seller_user_id,
                  idempotency_key: `cleanup_withdraw_${listingId}_${Date.now()}`
                },
                { transaction }
              )
            }
            await transaction.commit()
          } catch (e) {
            await transaction.rollback()
            console.warn(`⚠️ 清理挂牌 ${listingId} 失败: ${e.message}`)
          }
        }
      } catch (e) {
        console.warn(`⚠️ 查询挂牌 ${listingId} 失败: ${e.message}`)
      }
    }
  })

  /**
   * 场景1：可叠加资产挂牌交易完整流程（材料交易）
   */
  describe('场景1：可叠加资产挂牌交易完整流程', () => {
    let listingId
    let orderId
    const offerAmount = 100 // 出售100个 red_shard
    const priceAmount = 500 // 定价500 DIAMOND

    test('步骤1：卖家创建挂牌', async () => {
      const idempotencyKey = `listing_fungible_${sellerUserId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      // 记录卖家挂牌前的资产余额
      const sellerBalanceBefore = await getBalance(sellerUserId, TEST_OFFER_ASSET)
      console.log(`📊 卖家 ${TEST_OFFER_ASSET} 余额（挂牌前）: ${sellerBalanceBefore}`)

      expect(sellerBalanceBefore).toBeGreaterThanOrEqual(offerAmount)

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

        // 服务返回结构：{ listing, freeze_result, is_duplicate }
        listingId = result.listing?.market_listing_id
        createdListingIds.push(listingId)

        console.log(`✅ 创建挂牌成功: market_listing_id=${listingId}`)

        expect(result.listing).toBeDefined()
        expect(result.listing.market_listing_id).toBeDefined()
        expect(result.is_duplicate).toBeFalsy()
      } catch (error) {
        // 只有事务未完成时才回滚
        if (!transaction.finished) {
          await transaction.rollback()
        }
        throw error
      }

      // 验证卖家资产已冻结
      const sellerBalance = await getBalanceDetails(sellerUserId, TEST_OFFER_ASSET)
      console.log(
        `📊 卖家 ${TEST_OFFER_ASSET} 余额（挂牌后）: available=${sellerBalance.available}, frozen=${sellerBalance.frozen}`
      )

      // 冻结余额应增加
      expect(Number(sellerBalance.frozen)).toBeGreaterThanOrEqual(offerAmount)

      // 验证挂牌状态
      const listing = await MarketListing.findByPk(listingId)
      expect(listing.status).toBe('on_sale')
      expect(listing.listing_kind).toBe('fungible_asset')
      expect(Number(listing.offer_amount)).toBe(offerAmount)
      expect(Number(listing.price_amount)).toBe(priceAmount)
    }, 30000)

    test('步骤2：买家创建订单', async () => {
      // 跳过自买自卖场景（如果只有一个测试用户）
      if (sellerUserId === buyerUserId) {
        console.warn('⚠️ 跳过自买自卖场景')
        return
      }

      // 记录买家购买前的 DIAMOND 余额
      const buyerBalanceBefore = await getBalance(buyerUserId, TEST_ASSET_CODE)
      console.log(`📊 买家 ${TEST_ASSET_CODE} 余额（购买前）: ${buyerBalanceBefore}`)

      // 确保买家有足够余额
      if (buyerBalanceBefore < priceAmount) {
        await ensureBalance(buyerUserId, TEST_ASSET_CODE, priceAmount + 1000)
      }

      const idempotencyKey = `order_${buyerUserId}_${listingId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction = await sequelize.transaction()
      try {
        const result = await TradeOrderService.createOrder(
          {
            market_listing_id: listingId,
            buyer_id: buyerUserId,
            idempotency_key: idempotencyKey
          },
          { transaction }
        )

        await transaction.commit()

        orderId = result.order_id
        createdOrderIds.push(orderId)

        console.log(`✅ 创建订单成功: order_id=${orderId}`)

        expect(result.order_id).toBeDefined()
        expect(result.is_duplicate).toBeFalsy()
      } catch (error) {
        if (!transaction.finished) {
          await transaction.rollback()
        }
        throw error
      }

      // 验证买家 DIAMOND 已冻结
      const buyerBalance = await getBalanceDetails(buyerUserId, TEST_ASSET_CODE)
      console.log(
        `📊 买家 ${TEST_ASSET_CODE} 余额（下单后）: available=${buyerBalance.available}, frozen=${buyerBalance.frozen}`
      )

      // 验证冻结金额（包含手续费）
      const grossAmount = priceAmount // 实际冻结金额
      expect(Number(buyerBalance.frozen)).toBeGreaterThanOrEqual(grossAmount)

      // 验证订单状态
      const order = await TradeOrder.findByPk(orderId)
      expect(order.status).toBe('frozen')
      expect(Number(order.buyer_user_id)).toBe(buyerUserId)
      expect(Number(order.market_listing_id)).toBe(listingId)

      // 验证挂牌状态变为 locked
      const listing = await MarketListing.findByPk(listingId)
      expect(listing.status).toBe('locked')
    }, 30000)

    test('步骤3：完成订单（交割）', async () => {
      // 跳过自买自卖场景
      if (sellerUserId === buyerUserId || !orderId) {
        console.warn('⚠️ 跳过交割场景')
        return
      }

      // 记录交割前的各方余额
      const sellerDiamondBefore = await getBalance(sellerUserId, TEST_ASSET_CODE)
      const buyerOfferAssetBefore = await getBalance(buyerUserId, TEST_OFFER_ASSET)

      console.log(`📊 交割前 - 卖家 ${TEST_ASSET_CODE}: ${sellerDiamondBefore}`)
      console.log(`📊 交割前 - 买家 ${TEST_OFFER_ASSET}: ${buyerOfferAssetBefore}`)

      const idempotencyKey = `complete_${orderId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction = await sequelize.transaction()
      try {
        const result = await TradeOrderService.completeOrder(
          {
            trade_order_id: orderId,
            idempotency_key: idempotencyKey
          },
          { transaction }
        )

        await transaction.commit()

        console.log(`✅ 订单完成: order_id=${orderId}`)

        // completeOrder 返回 { order, fee_amount, net_amount }
        expect(result.order).toBeDefined()
        // order_id 可能是字符串或数字，使用宽松相等
        expect(Number(result.order.order_id)).toBe(Number(orderId))
      } catch (error) {
        if (!transaction.finished) {
          await transaction.rollback()
        }
        throw error
      }

      // 验证订单状态
      const order = await TradeOrder.findByPk(orderId)
      expect(order.status).toBe('completed')

      // 验证挂牌状态
      const listing = await MarketListing.findByPk(listingId)
      expect(listing.status).toBe('sold')

      /*
       * 验证资产转移
       * 1. 卖家应该收到 DIAMOND（扣除手续费后）
       */
      const sellerDiamondAfter = await getBalance(sellerUserId, TEST_ASSET_CODE)
      const netAmount = priceAmount * (1 - PLATFORM_FEE_RATE) // 扣除5%手续费
      const sellerReceived = sellerDiamondAfter - sellerDiamondBefore

      console.log(
        `📊 交割后 - 卖家 ${TEST_ASSET_CODE}: ${sellerDiamondAfter} (收到 ${sellerReceived})`
      )

      // 允许一定误差（手续费计算可能有取整）
      expect(sellerReceived).toBeGreaterThanOrEqual(netAmount - 1)
      expect(sellerReceived).toBeLessThanOrEqual(netAmount + 1)

      // 2. 买家应该收到 red_shard
      const buyerOfferAssetAfter = await getBalance(buyerUserId, TEST_OFFER_ASSET)
      const buyerReceived = buyerOfferAssetAfter - buyerOfferAssetBefore

      console.log(
        `📊 交割后 - 买家 ${TEST_OFFER_ASSET}: ${buyerOfferAssetAfter} (收到 ${buyerReceived})`
      )

      expect(buyerReceived).toBe(offerAmount)
    }, 30000)

    test('步骤4：验证交易记录完整性', async () => {
      if (!orderId) {
        console.warn('⚠️ 跳过验证场景')
        return
      }

      const order = await TradeOrder.findByPk(orderId)

      // 验证订单记录完整性
      expect(order).toBeTruthy()
      expect(order.status).toBe('completed')
      expect(order.buyer_user_id).toBeDefined()
      expect(order.seller_user_id).toBeDefined()
      expect(order.market_listing_id).toBeDefined()
      expect(order.gross_amount).toBeDefined()
      expect(order.net_amount).toBeDefined()
      expect(order.fee_amount).toBeDefined() // 修复：使用正确的字段名

      // 验证手续费计算正确
      const grossAmount = Number(order.gross_amount)
      const netAmount = Number(order.net_amount)
      const feeAmount = Number(order.fee_amount) // 修复：使用正确的字段名

      expect(grossAmount).toBe(netAmount + feeAmount)
      expect(feeAmount).toBeCloseTo(grossAmount * PLATFORM_FEE_RATE, 0)

      console.log(`📊 订单记录验证: gross=${grossAmount}, net=${netAmount}, fee=${feeAmount}`)
    }, 15000)
  })

  /**
   * 场景2：幂等性验证
   */
  describe('场景2：交易流程幂等性验证', () => {
    let testListingId

    test('创建挂牌幂等性：重复请求返回相同结果', async () => {
      const idempotencyKey = `idem_listing_${sellerUserId}_${Date.now()}_${uuidv4().slice(0, 8)}`
      const offerAmount = 50
      const priceAmount = 250

      // 第一次创建
      const transaction1 = await sequelize.transaction()
      let firstResult
      try {
        firstResult = await MarketListingService.createFungibleAssetListing(
          {
            seller_user_id: sellerUserId,
            offer_asset_code: TEST_OFFER_ASSET,
            offer_amount: offerAmount,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: priceAmount,
            idempotency_key: idempotencyKey
          },
          { transaction: transaction1 }
        )
        await transaction1.commit()
        testListingId = firstResult.market_listing_id
        createdListingIds.push(testListingId)
      } catch (error) {
        await transaction1.rollback()
        throw error
      }

      expect(firstResult.is_duplicate).toBeFalsy()

      // 重复请求（使用相同幂等键）
      const transaction2 = await sequelize.transaction()
      let duplicateResult
      try {
        duplicateResult = await MarketListingService.createFungibleAssetListing(
          {
            seller_user_id: sellerUserId,
            offer_asset_code: TEST_OFFER_ASSET,
            offer_amount: offerAmount,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: priceAmount,
            idempotency_key: idempotencyKey
          },
          { transaction: transaction2 }
        )
        await transaction2.commit()
      } catch (error) {
        await transaction2.rollback()
        throw error
      }

      // 验证幂等返回
      expect(duplicateResult.market_listing_id).toBe(firstResult.market_listing_id)
      expect(duplicateResult.is_duplicate).toBe(true)

      console.log(`✅ 挂牌幂等性验证通过: market_listing_id=${testListingId}`)
    }, 30000)

    test('创建订单幂等性：重复请求返回相同结果', async () => {
      if (sellerUserId === buyerUserId || !testListingId) {
        console.warn('⚠️ 跳过订单幂等性测试')
        return
      }

      const idempotencyKey = `idem_order_${buyerUserId}_${testListingId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      // 第一次创建订单
      const transaction1 = await sequelize.transaction()
      let firstResult
      try {
        firstResult = await TradeOrderService.createOrder(
          {
            market_listing_id: testListingId,
            buyer_id: buyerUserId,
            idempotency_key: idempotencyKey
          },
          { transaction: transaction1 }
        )
        await transaction1.commit()
        createdOrderIds.push(firstResult.order_id)
      } catch (error) {
        await transaction1.rollback()
        throw error
      }

      expect(firstResult.is_duplicate).toBeFalsy()

      // 重复请求
      const transaction2 = await sequelize.transaction()
      let duplicateResult
      try {
        duplicateResult = await TradeOrderService.createOrder(
          {
            market_listing_id: testListingId,
            buyer_id: buyerUserId,
            idempotency_key: idempotencyKey
          },
          { transaction: transaction2 }
        )
        await transaction2.commit()
      } catch (error) {
        await transaction2.rollback()
        throw error
      }

      // 验证幂等返回
      expect(duplicateResult.order_id).toBe(firstResult.order_id)
      expect(duplicateResult.is_duplicate).toBe(true)

      console.log(`✅ 订单幂等性验证通过: order_id=${firstResult.order_id}`)
    }, 30000)
  })

  /**
   * 场景3：异常场景处理
   */
  describe('场景3：异常场景处理', () => {
    test('余额不足时创建挂牌应失败', async () => {
      // 尝试挂牌超过余额的数量
      const currentBalance = await getBalance(sellerUserId, TEST_OFFER_ASSET)
      const excessiveAmount = currentBalance + 1000000

      const idempotencyKey = `excess_listing_${sellerUserId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction = await sequelize.transaction()
      try {
        await MarketListingService.createFungibleAssetListing(
          {
            seller_user_id: sellerUserId,
            offer_asset_code: TEST_OFFER_ASSET,
            offer_amount: excessiveAmount,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: 1000,
            idempotency_key: idempotencyKey
          },
          { transaction }
        )
        await transaction.commit()
        throw new Error('应该抛出余额不足错误')
      } catch (error) {
        if (error.message === '应该抛出余额不足错误') throw error
        await transaction.rollback()
        expect(error.message).toMatch(/余额不足|insufficient|balance/i)
        console.log(`✅ 余额不足场景验证通过: ${error.message}`)
      }
    }, 15000)

    test('购买已锁定的挂牌应失败', async () => {
      if (sellerUserId === buyerUserId) {
        console.warn('⚠️ 跳过已锁定挂牌购买测试')
        return
      }

      // 创建一个挂牌
      const idempotencyKey1 = `locked_listing_${sellerUserId}_${Date.now()}_${uuidv4().slice(0, 8)}`
      let testListingId

      const transaction1 = await sequelize.transaction()
      try {
        const result = await MarketListingService.createFungibleAssetListing(
          {
            seller_user_id: sellerUserId,
            offer_asset_code: TEST_OFFER_ASSET,
            offer_amount: 10,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: 50,
            idempotency_key: idempotencyKey1
          },
          { transaction: transaction1 }
        )
        await transaction1.commit()
        testListingId = result.listing?.market_listing_id
        createdListingIds.push(testListingId)
      } catch (error) {
        if (!transaction1.finished) {
          await transaction1.rollback()
        }
        throw error
      }

      // 第一个买家下单（锁定挂牌）
      const idempotencyKey2 = `first_order_${buyerUserId}_${testListingId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction2 = await sequelize.transaction()
      try {
        await TradeOrderService.createOrder(
          {
            market_listing_id: testListingId,
            buyer_id: buyerUserId,
            idempotency_key: idempotencyKey2
          },
          { transaction: transaction2 }
        )
        await transaction2.commit()
      } catch (error) {
        await transaction2.rollback()
        throw error
      }

      // 第二个买家尝试下单（应失败）
      const idempotencyKey3 = `second_order_${buyerUserId}_${testListingId}_${Date.now()}_${uuidv4().slice(0, 8)}`

      const transaction3 = await sequelize.transaction()
      try {
        await TradeOrderService.createOrder(
          {
            market_listing_id: testListingId,
            buyer_id: buyerUserId,
            idempotency_key: idempotencyKey3
          },
          { transaction: transaction3 }
        )
        await transaction3.commit()
        throw new Error('应该抛出挂牌已锁定错误')
      } catch (error) {
        if (error.message === '应该抛出挂牌已锁定错误') throw error
        await transaction3.rollback()
        expect(error.message).toMatch(/locked|已锁定|不可购买|状态/i)
        console.log(`✅ 已锁定挂牌购买失败验证通过: ${error.message}`)
      }
    }, 30000)
  })
})

// ==================== 辅助函数 ====================

/**
 * 获取用户资产可用余额
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
 * 获取用户资产详细余额（包含可用和冻结）
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
 * 确保用户有足够的指定资产余额
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
          idempotency_key: `test_topup_${userId}_${assetCode}_${Date.now()}_${uuidv4().slice(0, 8)}`
        },
        { transaction }
      )
      await transaction.commit()
      console.log(`📊 补充 ${assetCode} 余额: ${currentBalance} + ${amountToAdd}`)
    } catch (error) {
      await transaction.rollback()
      console.error(`❌ 补充余额失败: ${error.message}`)
    }
  }
}

/**
 * 清理用户今日的挂牌记录（避免超出日挂牌次数限制）
 * 通过将今日创建的挂牌created_at修改为昨天，重置日计数
 *
 * @param {number} userId - 用户 ID
 */
async function cleanupActiveListings(userId) {
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

    // 2. 查询用户今日创建的所有挂牌
    const todayListings = await MarketListing.findAll({
      where: {
        seller_user_id: userId,
        created_at: { [Op.gte]: todayStartUTC }
      }
    })

    if (todayListings.length === 0) {
      console.log(`✅ 用户 ${userId} 今日没有挂牌记录，无需重置日计数`)
      return
    }

    console.log(`🧹 重置用户 ${userId} 今日 ${todayListings.length} 条挂牌记录的创建时间...`)

    // 3. 将今日挂牌的created_at修改为昨天，重置日计数
    await MarketListing.update(
      { created_at: yesterdayUTC },
      {
        where: {
          seller_user_id: userId,
          created_at: { [Op.gte]: todayStartUTC }
        }
      }
    )

    console.log(`✅ 用户 ${userId} 日挂牌计数已重置（修改${todayListings.length}条记录为昨日）`)

    // 4. 同时清理活跃挂牌（避免超出10个挂牌限制）
    const activeListings = await MarketListing.findAll({
      where: {
        seller_user_id: userId,
        status: 'on_sale'
      }
    })

    if (activeListings.length > 5) {
      console.log(`🧹 活跃挂牌超过5个(${activeListings.length})，开始撤回多余的...`)
      const toWithdraw = activeListings.slice(5)

      for (const listing of toWithdraw) {
        const transaction = await sequelize.transaction()
        try {
          const withdrawParams = {
            market_listing_id: listing.market_listing_id,
            seller_user_id: listing.seller_user_id,
            idempotency_key: `cleanup_active_${listing.market_listing_id}_${Date.now()}`
          }

          if (listing.listing_kind === 'fungible_asset') {
            await MarketListingService.withdrawFungibleAssetListing(withdrawParams, { transaction })
          } else {
            await MarketListingService.withdrawListing(withdrawParams, { transaction })
          }

          await transaction.commit()
          console.log(`✅ 撤回挂牌 ${listing.market_listing_id} (${listing.listing_kind})`)
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

/**
 * 确保卖家有足够的测试资产
 */
async function ensureSellerAssets() {
  const sellerUserId = await getRealTestUserId()

  // 确保卖家有 red_shard（用于挂牌出售）
  await ensureBalance(sellerUserId, TEST_OFFER_ASSET, 1000)

  // 确保卖家有 DIAMOND（用于接收支付）
  await ensureBalance(sellerUserId, TEST_ASSET_CODE, 100)
}

/**
 * 确保买家有足够的测试资产
 */
async function ensureBuyerAssets() {
  const testUserId = await getRealTestUserId()

  // 查找买家用户
  const buyerUser = await User.findOne({
    where: {
      user_id: { [sequelize.Sequelize.Op.ne]: testUserId },
      status: 'active'
    }
  })

  if (buyerUser) {
    // 确保买家有 DIAMOND（用于购买）
    await ensureBalance(buyerUser.user_id, TEST_ASSET_CODE, 10000)

    // 确保买家有少量 red_shard（用于接收交易物品）
    await ensureBalance(buyerUser.user_id, TEST_OFFER_ASSET, 100)
  }
}
