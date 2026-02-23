/**
 * 🎯 订单生命周期测试 - P0-3.2 & P0-3.3
 *
 * 创建时间：2026-01-30 北京时间
 * 版本：V1.0
 * 优先级：P0 - 核心业务路径
 *
 * 测试目标：
 * 1. 覆盖所有合法状态转换路径（P0-3.2）
 * 2. 覆盖所有中断场景（P0-3.3）
 *
 * 状态机定义（参考：docs/test-matrices/order-state-machine.md）：
 * - created: 订单已创建（初始状态）
 * - frozen: 买家资产已冻结
 * - completed: 交易完成（终态）
 * - cancelled: 已取消（终态）
 * - failed: 失败（终态）
 *
 * 合法状态转换：
 * 1. created → frozen（资产冻结成功）
 * 2. frozen → completed（交割完成）
 * 3. frozen → cancelled（订单取消）
 *
 * 技术验证点：
 * 1. TradeOrderService 订单全生命周期管理
 * 2. BalanceService 资产冻结/解冻/结算
 * 3. MarketListing 状态联动
 * 4. 幂等性保证（idempotency_key）
 *
 * 测试数据：
 * - 使用真实数据库 restaurant_points_dev
 * - 测试账号：13612227930（卖家）、13800138000（买家）
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
const { prepareMarketTestEnvironment } = require('../../helpers/test-points-setup')

// 测试超时设置（复杂流程需要更长时间）
jest.setTimeout(90000)

describe('📋 订单生命周期测试（Order Lifecycle）', () => {
  // 服务实例
  let MarketListingService
  let TradeOrderService
  let BalanceService

  // 测试数据
  let testSeller
  let testBuyer
  let testItemTemplate
  let createdListings = []
  let createdItems = []
  let createdOrders = []

  /**
   * 生成唯一幂等键
   * @param {string} prefix - 前缀
   * @returns {string} 幂等键
   */
  function generateIdempotencyKey(prefix = 'lifecycle') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  /**
   * 创建测试物品实例
   * @param {number} owner_account_id - 所有者用户ID
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 物品实例
   */
  async function createTestItem(owner_account_id, options = {}) {
    const item_data = {
      owner_account_id,
      item_template_id: testItemTemplate?.item_template_id || null,
      item_type: 'tradable_item',
      status: options.status || 'available',
      meta: options.meta || {
        name: `生命周期测试物品_${Date.now()}`,
        description: '订单生命周期测试用物品'
      }
    }

    const item = await Item.create(item_data)
    createdItems.push(item.item_id)
    return item
  }

  /**
   * 创建测试挂牌
   * @param {Object} options - 挂牌选项
   * @returns {Promise<Object>} {listing, item}
   */
  async function createTestListing(options = {}) {
    const price_amount = options.price_amount || 50
    const seller_id = options.seller_id || testSeller.user_id

    // 创建物品
    const test_item = await createTestItem(seller_id)

    // 创建挂牌
    const listing_tx = await sequelize.transaction()
    let listing
    try {
      const listing_result = await MarketListingService.createListing(
        {
          idempotency_key: generateIdempotencyKey('listing'),
          seller_user_id: seller_id,
          item_id: test_item.item_id,
          price_amount,
          price_asset_code: 'DIAMOND'
        },
        { transaction: listing_tx }
      )
      await listing_tx.commit()
      listing = listing_result.listing
      createdListings.push(listing.market_listing_id)
    } catch (error) {
      await listing_tx.rollback()
      throw error
    }

    return { listing, item: test_item }
  }

  /**
   * 为用户添加测试资产
   * @param {number} user_id - 用户ID
   * @param {number} amount - 金额
   */
  async function grantTestAsset(user_id, amount = 200) {
    const grant_tx = await sequelize.transaction()
    try {
      await BalanceService.changeBalance(
        {
          user_id,
          asset_code: 'DIAMOND',
          delta_amount: amount,
          business_type: 'test_grant',
          idempotency_key: generateIdempotencyKey('grant')
        },
        { transaction: grant_tx }
      )
      await grant_tx.commit()
    } catch (error) {
      await grant_tx.rollback()
      throw error
    }
  }

  beforeAll(async () => {
    console.log('🎯 ===== 订单生命周期测试启动 =====')

    // 连接数据库
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 准备市场测试环境
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

    console.log('✅ 测试用户准备完成', {
      seller_id: testSeller.user_id,
      buyer_id: testBuyer?.user_id || '未找到'
    })
  })

  afterEach(async () => {
    // 清理测试订单
    for (const order_id of createdOrders) {
      try {
        await TradeOrder.destroy({ where: { order_id }, force: true })
      } catch (error) {
        console.log(`清理订单 ${order_id} 失败:`, error.message)
      }
    }
    createdOrders = []

    // 清理测试挂牌
    for (const market_listing_id of createdListings) {
      try {
        await MarketListing.destroy({ where: { market_listing_id }, force: true })
      } catch (error) {
        console.log(`清理挂牌 ${market_listing_id} 失败:`, error.message)
      }
    }
    createdListings = []

    // 清理测试物品
    for (const item_id of createdItems) {
      try {
        await Item.destroy({ where: { item_id }, force: true })
      } catch (error) {
        console.log(`清理物品 ${item_id} 失败:`, error.message)
      }
    }
    createdItems = []
  })

  afterAll(async () => {
    console.log('🏁 订单生命周期测试完成')
  })

  /**
   * ==========================================
   * 📋 P0-3.2: 合法状态转换路径测试
   * ==========================================
   */
  describe('P0-3.2: 合法状态转换路径', () => {
    /**
     * 测试路径 1: created → frozen
     * 订单创建时自动冻结买家资产
     */
    describe('路径 1: created → frozen（订单创建冻结资产）', () => {
      test('创建订单应自动进入 frozen 状态并冻结买家资产', async () => {
        if (!testBuyer) {
          console.warn('⚠️ 跳过测试：缺少测试买家')
          return
        }

        // 1. 准备挂牌
        const { listing } = await createTestListing({ price_amount: 60 })
        console.log(`✅ 挂牌创建成功: market_listing_id=${listing.market_listing_id}`)

        // 2. 为买家准备资产
        await grantTestAsset(testBuyer.user_id, 100)

        // 3. 记录冻结前的资产状态
        const balance_before = await BalanceService.getBalance({
          user_id: testBuyer.user_id,
          asset_code: 'DIAMOND'
        })
        const frozen_before = Number(balance_before?.frozen_amount || 0)

        // 4. 创建订单
        const order_tx = await sequelize.transaction()
        let order_result
        try {
          order_result = await TradeOrderService.createOrder(
            {
              idempotency_key: generateIdempotencyKey('order'),
              market_listing_id: listing.market_listing_id,
              buyer_id: testBuyer.user_id
            },
            { transaction: order_tx }
          )
          await order_tx.commit()
          createdOrders.push(order_result.trade_order_id)
        } catch (error) {
          await order_tx.rollback()
          throw error
        }

        // 5. 验证订单状态为 frozen（不是 created）
        const order = await TradeOrder.findByPk(order_result.trade_order_id)
        expect(order.status).toBe('frozen')
        expect(order.buyer_user_id).toBe(testBuyer.user_id)
        expect(order.seller_user_id).toBe(testSeller.user_id)

        // 6. 验证资产已冻结
        const balance_after = await BalanceService.getBalance({
          user_id: testBuyer.user_id,
          asset_code: 'DIAMOND'
        })
        const frozen_after = Number(balance_after?.frozen_amount || 0)
        expect(frozen_after).toBeGreaterThan(frozen_before)

        // 7. 验证挂牌状态为 locked
        const updated_listing = await MarketListing.findByPk(listing.market_listing_id)
        expect(updated_listing.status).toBe('locked')
        expect(Number(updated_listing.locked_by_order_id)).toBe(Number(order_result.trade_order_id))

        console.log('✅ 订单创建 → frozen 状态转换验证通过')
      })
    })

    /**
     * 测试路径 2: frozen → completed
     * 订单完成交割
     */
    describe('路径 2: frozen → completed（订单完成交割）', () => {
      test('完成订单应结算资产并转移物品所有权', async () => {
        if (!testBuyer) {
          console.warn('⚠️ 跳过测试：缺少测试买家')
          return
        }

        // 1. 准备挂牌和订单
        const { listing, item } = await createTestListing({ price_amount: 40 })
        await grantTestAsset(testBuyer.user_id, 100)

        const order_tx = await sequelize.transaction()
        let order_id
        try {
          const order_result = await TradeOrderService.createOrder(
            {
              idempotency_key: generateIdempotencyKey('order'),
              market_listing_id: listing.market_listing_id,
              buyer_id: testBuyer.user_id
            },
            { transaction: order_tx }
          )
          await order_tx.commit()
          order_id = order_result.trade_order_id
          createdOrders.push(order_id)
        } catch (error) {
          await order_tx.rollback()
          throw error
        }

        // 2. 验证订单状态为 frozen
        const frozen_order = await TradeOrder.findByPk(order_id)
        expect(frozen_order.status).toBe('frozen')

        // 3. 记录卖家资产（用于验证结算）
        const seller_balance_before = await BalanceService.getBalance({
          user_id: testSeller.user_id,
          asset_code: 'DIAMOND'
        })
        const seller_available_before = Number(seller_balance_before?.available_amount || 0)

        // 4. 完成订单
        const complete_tx = await sequelize.transaction()
        let complete_result
        try {
          complete_result = await TradeOrderService.completeOrder(
            {
              trade_order_id: order_id,
              buyer_id: testBuyer.user_id
            },
            { transaction: complete_tx }
          )
          await complete_tx.commit()
        } catch (error) {
          await complete_tx.rollback()
          throw error
        }

        // 5. 验证订单状态为 completed
        const completed_order = await TradeOrder.findByPk(order_id)
        expect(completed_order.status).toBe('completed')
        expect(completed_order.completed_at).not.toBeNull()

        // 6. 验证挂牌状态为 sold
        const sold_listing = await MarketListing.findByPk(listing.market_listing_id)
        expect(sold_listing.status).toBe('sold')

        // 7. 验证物品所有权转移
        const transferred_item = await Item.findByPk(item.item_id)
        expect(transferred_item.owner_account_id).toBe(testBuyer.user_id)
        expect(transferred_item.status).toBe('transferred')

        // 8. 验证卖家收到款项
        const seller_balance_after = await BalanceService.getBalance({
          user_id: testSeller.user_id,
          asset_code: 'DIAMOND'
        })
        const seller_available_after = Number(seller_balance_after?.available_amount || 0)
        const seller_received = seller_available_after - seller_available_before
        expect(seller_received).toBe(Number(complete_result.net_amount))

        console.log('✅ frozen → completed 状态转换验证通过', {
          fee_amount: complete_result.fee_amount,
          net_amount: complete_result.net_amount
        })
      })
    })

    /**
     * 测试路径 3: frozen → cancelled
     * 订单取消退款
     */
    describe('路径 3: frozen → cancelled（订单取消）', () => {
      test('取消订单应解冻买家资产并恢复挂牌状态', async () => {
        if (!testBuyer) {
          console.warn('⚠️ 跳过测试：缺少测试买家')
          return
        }

        // 1. 准备挂牌和订单
        const { listing } = await createTestListing({ price_amount: 55 })
        await grantTestAsset(testBuyer.user_id, 100)

        const order_tx = await sequelize.transaction()
        let order_id
        try {
          const order_result = await TradeOrderService.createOrder(
            {
              idempotency_key: generateIdempotencyKey('order'),
              market_listing_id: listing.market_listing_id,
              buyer_id: testBuyer.user_id
            },
            { transaction: order_tx }
          )
          await order_tx.commit()
          order_id = order_result.trade_order_id
          createdOrders.push(order_id)
        } catch (error) {
          await order_tx.rollback()
          throw error
        }

        // 2. 验证订单状态为 frozen
        const frozen_order = await TradeOrder.findByPk(order_id)
        expect(frozen_order.status).toBe('frozen')

        // 3. 记录冻结金额
        const balance_before_cancel = await BalanceService.getBalance({
          user_id: testBuyer.user_id,
          asset_code: 'DIAMOND'
        })
        const frozen_before_cancel = Number(balance_before_cancel?.frozen_amount || 0)

        // 4. 取消订单
        const cancel_tx = await sequelize.transaction()
        try {
          await TradeOrderService.cancelOrder(
            {
              trade_order_id: order_id,
              cancel_reason: '生命周期测试取消'
            },
            { transaction: cancel_tx }
          )
          await cancel_tx.commit()
        } catch (error) {
          await cancel_tx.rollback()
          throw error
        }

        // 5. 验证订单状态为 cancelled
        const cancelled_order = await TradeOrder.findByPk(order_id)
        expect(cancelled_order.status).toBe('cancelled')
        expect(cancelled_order.cancelled_at).not.toBeNull()
        expect(cancelled_order.meta?.cancel_reason).toBe('生命周期测试取消')

        // 6. 验证挂牌状态恢复为 on_sale
        const restored_listing = await MarketListing.findByPk(listing.market_listing_id)
        expect(restored_listing.status).toBe('on_sale')
        expect(restored_listing.locked_by_order_id).toBeNull()

        // 7. 验证买家资产解冻
        const balance_after_cancel = await BalanceService.getBalance({
          user_id: testBuyer.user_id,
          asset_code: 'DIAMOND'
        })
        const frozen_after_cancel = Number(balance_after_cancel?.frozen_amount || 0)
        expect(frozen_after_cancel).toBeLessThan(frozen_before_cancel)

        console.log('✅ frozen → cancelled 状态转换验证通过')
      })
    })

    /**
     * 测试：订单幂等性
     */
    describe('幂等性测试', () => {
      test('相同幂等键应返回已存在的订单', async () => {
        if (!testBuyer) {
          console.warn('⚠️ 跳过测试：缺少测试买家')
          return
        }

        // 1. 准备挂牌
        const { listing } = await createTestListing({ price_amount: 30 })
        await grantTestAsset(testBuyer.user_id, 100)

        const idempotency_key = generateIdempotencyKey('idempotent_order')

        // 2. 第一次创建订单
        const tx1 = await sequelize.transaction()
        let first_result
        try {
          first_result = await TradeOrderService.createOrder(
            {
              idempotency_key,
              market_listing_id: listing.market_listing_id,
              buyer_id: testBuyer.user_id
            },
            { transaction: tx1 }
          )
          await tx1.commit()
          createdOrders.push(first_result.trade_order_id)
        } catch (error) {
          await tx1.rollback()
          throw error
        }

        expect(first_result.is_duplicate).toBe(false)

        // 3. 第二次使用相同幂等键创建（应返回已存在订单）
        const tx2 = await sequelize.transaction()
        let second_result
        try {
          second_result = await TradeOrderService.createOrder(
            {
              idempotency_key,
              market_listing_id: listing.market_listing_id,
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
        expect(second_result.is_duplicate).toBe(true)
        expect(String(second_result.trade_order_id)).toBe(String(first_result.trade_order_id))

        console.log('✅ 订单幂等性验证通过')
      })
    })
  })

  /**
   * ==========================================
   * 🛡️ P0-3.3: 中断场景测试
   * ==========================================
   */
  describe('P0-3.3: 中断场景测试', () => {
    /**
     * 中断场景 1: 买家余额不足
     */
    describe('中断场景 1: 买家余额不足', () => {
      test('买家余额不足时应拒绝创建订单', async () => {
        if (!testBuyer) {
          console.warn('⚠️ 跳过测试：缺少测试买家')
          return
        }

        // 1. 查询买家当前余额
        const balance_before = await BalanceService.getBalance({
          user_id: testBuyer.user_id,
          asset_code: 'DIAMOND'
        })
        const available = Number(balance_before?.available_amount || 0)
        console.log(`买家当前余额: ${available}`)

        /*
         * 2. 创建一个价格远高于买家余额的挂牌
         * 价格 = 当前余额 + 100000，确保绝对不够
         */
        const required_price = available + 100000
        const { listing } = await createTestListing({ price_amount: required_price })
        console.log(`挂牌价格: ${required_price}`)

        // 3. 尝试创建订单（应失败）
        const order_tx = await sequelize.transaction()
        let tx_committed = false
        try {
          await TradeOrderService.createOrder(
            {
              idempotency_key: generateIdempotencyKey('insufficient'),
              market_listing_id: listing.market_listing_id,
              buyer_id: testBuyer.user_id
            },
            { transaction: order_tx }
          )
          await order_tx.rollback()
          tx_committed = true
          throw new Error('测试失败：应因余额不足而拒绝')
        } catch (error) {
          // 事务可能已被服务层回滚，安全地尝试回滚
          if (!tx_committed && !order_tx.finished) {
            try {
              await order_tx.rollback()
            } catch (_rollbackError) {
              // 忽略回滚错误
            }
          }
          if (error.message.includes('测试失败')) {
            throw error
          }
          expect(error.message).toMatch(/余额|不足|insufficient|balance/i)
          console.log('✅ 正确拒绝余额不足的订单:', error.message)
        }
      })
    })

    /**
     * 中断场景 2: 挂牌已被锁定
     */
    describe('中断场景 2: 挂牌已被锁定（并发购买）', () => {
      test('第二个买家购买已锁定挂牌应被拒绝', async () => {
        if (!testBuyer) {
          console.warn('⚠️ 跳过测试：缺少测试买家')
          return
        }

        // 1. 查找第三个用户作为第二买家
        const second_buyer = await User.findOne({
          where: {
            user_id: {
              [sequelize.Sequelize.Op.notIn]: [testSeller.user_id, testBuyer.user_id]
            },
            status: 'active'
          }
        })

        if (!second_buyer) {
          console.warn('⚠️ 跳过测试：缺少第二买家')
          return
        }

        // 2. 准备挂牌
        const { listing } = await createTestListing({ price_amount: 35 })
        await grantTestAsset(testBuyer.user_id, 100)
        await grantTestAsset(second_buyer.user_id, 100)

        // 3. 第一个买家成功创建订单（锁定挂牌）
        const tx1 = await sequelize.transaction()
        try {
          const result = await TradeOrderService.createOrder(
            {
              idempotency_key: generateIdempotencyKey('first_buyer'),
              market_listing_id: listing.market_listing_id,
              buyer_id: testBuyer.user_id
            },
            { transaction: tx1 }
          )
          await tx1.commit()
          createdOrders.push(result.trade_order_id)
          console.log('✅ 第一个买家订单创建成功')
        } catch (error) {
          await tx1.rollback()
          throw error
        }

        // 4. 验证挂牌已被锁定
        const locked_listing = await MarketListing.findByPk(listing.market_listing_id)
        expect(locked_listing.status).toBe('locked')

        // 5. 第二个买家尝试购买（应失败）
        const tx2 = await sequelize.transaction()
        try {
          await TradeOrderService.createOrder(
            {
              idempotency_key: generateIdempotencyKey('second_buyer'),
              market_listing_id: listing.market_listing_id,
              buyer_id: second_buyer.user_id
            },
            { transaction: tx2 }
          )
          await tx2.rollback()
          throw new Error('测试失败：应因挂牌已锁定而拒绝')
        } catch (error) {
          await tx2.rollback()
          if (error.message.includes('测试失败')) {
            throw error
          }
          expect(error.message).toMatch(/锁定|locked|状态|购买/i)
          console.log('✅ 正确拒绝购买已锁定挂牌:', error.message)
        }
      })
    })

    /**
     * 中断场景 3: 挂牌已售出
     */
    describe('中断场景 3: 挂牌已售出', () => {
      test('购买已售出挂牌应被拒绝', async () => {
        if (!testBuyer) {
          console.warn('⚠️ 跳过测试：缺少测试买家')
          return
        }

        // 1. 查找第三个用户
        const second_buyer = await User.findOne({
          where: {
            user_id: {
              [sequelize.Sequelize.Op.notIn]: [testSeller.user_id, testBuyer.user_id]
            },
            status: 'active'
          }
        })

        if (!second_buyer) {
          console.warn('⚠️ 跳过测试：缺少第二买家')
          return
        }

        // 2. 准备挂牌并完成交易
        const { listing } = await createTestListing({ price_amount: 25 })
        await grantTestAsset(testBuyer.user_id, 100)
        await grantTestAsset(second_buyer.user_id, 100)

        // 3. 第一个买家完成交易
        const order_tx = await sequelize.transaction()
        let order_id
        try {
          const result = await TradeOrderService.createOrder(
            {
              idempotency_key: generateIdempotencyKey('sold_order'),
              market_listing_id: listing.market_listing_id,
              buyer_id: testBuyer.user_id
            },
            { transaction: order_tx }
          )
          await order_tx.commit()
          order_id = result.trade_order_id
          createdOrders.push(order_id)
        } catch (error) {
          await order_tx.rollback()
          throw error
        }

        const complete_tx = await sequelize.transaction()
        try {
          await TradeOrderService.completeOrder(
            { trade_order_id: order_id, buyer_id: testBuyer.user_id },
            { transaction: complete_tx }
          )
          await complete_tx.commit()
          console.log('✅ 第一个订单完成')
        } catch (error) {
          await complete_tx.rollback()
          throw error
        }

        // 4. 验证挂牌已售出
        const sold_listing = await MarketListing.findByPk(listing.market_listing_id)
        expect(sold_listing.status).toBe('sold')

        // 5. 第二个买家尝试购买（应失败）
        const tx2 = await sequelize.transaction()
        try {
          await TradeOrderService.createOrder(
            {
              idempotency_key: generateIdempotencyKey('second_attempt'),
              market_listing_id: listing.market_listing_id,
              buyer_id: second_buyer.user_id
            },
            { transaction: tx2 }
          )
          await tx2.rollback()
          throw new Error('测试失败：应因挂牌已售出而拒绝')
        } catch (error) {
          await tx2.rollback()
          if (error.message.includes('测试失败')) {
            throw error
          }
          expect(error.message).toMatch(/售出|sold|状态|购买/i)
          console.log('✅ 正确拒绝购买已售出挂牌:', error.message)
        }
      })
    })

    /**
     * 中断场景 4: 买家购买自己的挂牌
     */
    describe('中断场景 4: 禁止自购', () => {
      test('买家不能购买自己的挂牌', async () => {
        // 1. 卖家创建挂牌
        const { listing } = await createTestListing({ price_amount: 45 })
        await grantTestAsset(testSeller.user_id, 100)

        // 2. 卖家尝试购买自己的挂牌（应失败）
        const order_tx = await sequelize.transaction()
        try {
          await TradeOrderService.createOrder(
            {
              idempotency_key: generateIdempotencyKey('self_buy'),
              market_listing_id: listing.market_listing_id,
              buyer_id: testSeller.user_id // 卖家自己购买
            },
            { transaction: order_tx }
          )
          await order_tx.rollback()
          throw new Error('测试失败：应拒绝自购行为')
        } catch (error) {
          await order_tx.rollback()
          if (error.message.includes('测试失败')) {
            throw error
          }
          expect(error.message).toMatch(/自己|self|禁止|不能/i)
          console.log('✅ 正确拒绝自购行为:', error.message)
        }
      })
    })

    /**
     * 中断场景 5: 完成已取消的订单
     */
    describe('中断场景 5: 操作已取消订单', () => {
      test('不能完成已取消的订单', async () => {
        if (!testBuyer) {
          console.warn('⚠️ 跳过测试：缺少测试买家')
          return
        }

        // 1. 创建并取消订单
        const { listing } = await createTestListing({ price_amount: 50 })
        await grantTestAsset(testBuyer.user_id, 100)

        const order_tx = await sequelize.transaction()
        let order_id
        try {
          const result = await TradeOrderService.createOrder(
            {
              idempotency_key: generateIdempotencyKey('to_cancel'),
              market_listing_id: listing.market_listing_id,
              buyer_id: testBuyer.user_id
            },
            { transaction: order_tx }
          )
          await order_tx.commit()
          order_id = result.trade_order_id
          createdOrders.push(order_id)
        } catch (error) {
          await order_tx.rollback()
          throw error
        }

        // 取消订单
        const cancel_tx = await sequelize.transaction()
        try {
          await TradeOrderService.cancelOrder(
            { trade_order_id: order_id, cancel_reason: '测试取消' },
            { transaction: cancel_tx }
          )
          await cancel_tx.commit()
        } catch (error) {
          await cancel_tx.rollback()
          throw error
        }

        // 2. 尝试完成已取消的订单（应失败）
        const complete_tx = await sequelize.transaction()
        try {
          await TradeOrderService.completeOrder(
            { trade_order_id: order_id, buyer_id: testBuyer.user_id },
            { transaction: complete_tx }
          )
          await complete_tx.rollback()
          throw new Error('测试失败：应拒绝完成已取消订单')
        } catch (error) {
          await complete_tx.rollback()
          if (error.message.includes('测试失败')) {
            throw error
          }
          expect(error.message).toMatch(/状态|cancelled|frozen|无法/i)
          console.log('✅ 正确拒绝完成已取消订单:', error.message)
        }
      })
    })

    /**
     * 中断场景 6: 取消已完成的订单
     */
    describe('中断场景 6: 取消已完成订单', () => {
      test('不能取消已完成的订单', async () => {
        if (!testBuyer) {
          console.warn('⚠️ 跳过测试：缺少测试买家')
          return
        }

        // 1. 创建并完成订单
        const { listing } = await createTestListing({ price_amount: 30 })
        await grantTestAsset(testBuyer.user_id, 100)

        const order_tx = await sequelize.transaction()
        let order_id
        try {
          const result = await TradeOrderService.createOrder(
            {
              idempotency_key: generateIdempotencyKey('to_complete'),
              market_listing_id: listing.market_listing_id,
              buyer_id: testBuyer.user_id
            },
            { transaction: order_tx }
          )
          await order_tx.commit()
          order_id = result.trade_order_id
          createdOrders.push(order_id)
        } catch (error) {
          await order_tx.rollback()
          throw error
        }

        // 完成订单
        const complete_tx = await sequelize.transaction()
        try {
          await TradeOrderService.completeOrder(
            { trade_order_id: order_id, buyer_id: testBuyer.user_id },
            { transaction: complete_tx }
          )
          await complete_tx.commit()
        } catch (error) {
          await complete_tx.rollback()
          throw error
        }

        // 2. 尝试取消已完成的订单（应失败）
        const cancel_tx = await sequelize.transaction()
        try {
          await TradeOrderService.cancelOrder(
            { trade_order_id: order_id, cancel_reason: '测试取消' },
            { transaction: cancel_tx }
          )
          await cancel_tx.rollback()
          throw new Error('测试失败：应拒绝取消已完成订单')
        } catch (error) {
          await cancel_tx.rollback()
          if (error.message.includes('测试失败')) {
            throw error
          }
          expect(error.message).toMatch(/状态|completed|frozen|无法/i)
          console.log('✅ 正确拒绝取消已完成订单:', error.message)
        }
      })
    })

    /**
     * 中断场景 7: 订单不存在
     */
    describe('中断场景 7: 订单不存在', () => {
      test('操作不存在的订单应返回错误', async () => {
        const fake_order_id = 99999999

        // 尝试完成不存在的订单
        const complete_tx = await sequelize.transaction()
        try {
          await TradeOrderService.completeOrder(
            { trade_order_id: fake_order_id, buyer_id: testSeller.user_id },
            { transaction: complete_tx }
          )
          await complete_tx.rollback()
          throw new Error('测试失败：应拒绝操作不存在的订单')
        } catch (error) {
          await complete_tx.rollback()
          if (error.message.includes('测试失败')) {
            throw error
          }
          expect(error.message).toMatch(/不存在|not found|找不到/i)
          console.log('✅ 正确拒绝操作不存在的订单:', error.message)
        }
      })
    })
  })

  /**
   * ==========================================
   * 🔄 完整端到端流程测试
   * ==========================================
   */
  describe('完整端到端流程', () => {
    test('完整订单生命周期：创建 → 冻结 → 完成', async () => {
      if (!testBuyer) {
        console.warn('⚠️ 跳过测试：缺少测试买家')
        return
      }

      console.log('\n📋 ===== 完整订单生命周期开始 =====')

      // Step 1: 创建挂牌
      const { listing, item } = await createTestListing({ price_amount: 70 })
      console.log(`Step 1: 挂牌创建 market_listing_id=${listing.market_listing_id}`)

      // Step 2: 准备买家资产
      await grantTestAsset(testBuyer.user_id, 200)
      console.log('Step 2: 买家资产准备完成')

      // Step 3: 创建订单（自动进入 frozen 状态）
      const order_tx = await sequelize.transaction()
      let order_id
      try {
        const result = await TradeOrderService.createOrder(
          {
            idempotency_key: generateIdempotencyKey('e2e'),
            market_listing_id: listing.market_listing_id,
            buyer_id: testBuyer.user_id
          },
          { transaction: order_tx }
        )
        await order_tx.commit()
        order_id = result.trade_order_id
        createdOrders.push(order_id)
      } catch (error) {
        await order_tx.rollback()
        throw error
      }

      const order_after_create = await TradeOrder.findByPk(order_id)
      expect(order_after_create.status).toBe('frozen')
      console.log(`Step 3: 订单创建 order_id=${order_id}, status=frozen`)

      // Step 4: 验证挂牌锁定
      const locked_listing = await MarketListing.findByPk(listing.market_listing_id)
      expect(locked_listing.status).toBe('locked')
      console.log('Step 4: 挂牌已锁定')

      // Step 5: 完成订单
      const complete_tx = await sequelize.transaction()
      try {
        await TradeOrderService.completeOrder(
          { trade_order_id: order_id, buyer_id: testBuyer.user_id },
          { transaction: complete_tx }
        )
        await complete_tx.commit()
      } catch (error) {
        await complete_tx.rollback()
        throw error
      }

      // Step 6: 最终状态验证
      const final_order = await TradeOrder.findByPk(order_id)
      const final_listing = await MarketListing.findByPk(listing.market_listing_id)
      const final_item = await Item.findByPk(item.item_id)

      expect(final_order.status).toBe('completed')
      expect(final_listing.status).toBe('sold')
      expect(final_item.owner_account_id).toBe(testBuyer.user_id)

      console.log('Step 5-6: 订单完成，最终状态验证通过')
      console.log({
        order_status: final_order.status,
        listing_status: final_listing.status,
        item_new_owner: final_item.owner_account_id
      })

      console.log('📋 ===== 完整订单生命周期结束 =====\n')
    })
  })
})
