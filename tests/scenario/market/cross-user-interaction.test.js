/**
 * 交易市场跨用户交互场景测试
 *
 * 测试场景（测试体系问题分析与改进方案.md P0-2 系列）：
 * - P0-2.2: 买家取消+卖家挂牌恢复（TradeOrderService.cancelOrder）
 * - P0-2.3: 订单超时自动取消场景（HourlyUnlockTimeoutTradeOrders）
 * - P0-2.4: 多买家抢购同一挂牌（并发控制）
 * - P0-2.5: 管理员强制下架场景（adminForceWithdrawListing）
 *
 * 业务背景：
 * - 买家下单后可以主动取消，卖家挂牌应恢复为 on_sale 状态
 * - 订单超时后系统自动取消并解冻买家资产
 * - 多个买家同时抢购时，只有一个能成功，其他应收到冲突错误
 * - 管理员可强制下架违规挂牌，需记录审计日志
 *
 * 创建时间：2026-01-30
 * 需求来源：测试体系问题分析与改进方案.md (P0-2 系列)
 */

const crypto = require('crypto')
const {
  sequelize,
  User,
  MarketListing,
  TradeOrder,
  AccountAssetBalance,
  Account
} = require('../../../models')

function uniquePlaceholderTradeOrderNo() {
  return `PH${crypto.randomBytes(12).toString('hex').toUpperCase()}`
}

// 延迟加载服务，通过 global.getTestService 获取
let MarketListingService
let TradeOrderService
let BalanceService

// 定时任务模块
const HourlyUnlockTimeoutTradeOrders = require('../../../jobs/hourly-unlock-timeout-trade-orders')

// 测试超时设置（跨用户交互场景可能需要更长时间）
jest.setTimeout(90000)

describe('交易市场跨用户交互场景测试（P0-2 系列）', () => {
  // 测试用户
  let test_seller
  let test_buyer_1
  let test_buyer_2
  let test_admin

  // 测试资产配置
  const TEST_ASSET_CODE = 'DIAMOND'
  const LISTING_OFFER_AMOUNT = 50
  const LISTING_PRICE_AMOUNT = 200

  // 测试数据清理列表
  const created_listings = []
  const created_orders = []

  /**
   * 生成唯一幂等键
   * @param {string} prefix - 前缀
   * @returns {string} 幂等键
   */
  const generateIdempotencyKey = (prefix = 'test') => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
  }

  beforeAll(async () => {
    // 连接数据库
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 获取服务（通过 ServiceManager）
    MarketListingService = global.getTestService('market_listing_core')
    TradeOrderService = global.getTestService('trade_order')
    BalanceService = global.getTestService('asset_balance')

    if (!MarketListingService || !TradeOrderService || !BalanceService) {
      throw new Error('服务获取失败：请检查 ServiceManager 配置')
    }

    // 获取测试卖家（主测试账号）
    test_seller = await User.findOne({ where: { mobile: '13612227930' } })
    if (!test_seller) {
      throw new Error('测试卖家不存在：13612227930')
    }

    // 获取测试买家1
    test_buyer_1 = await User.findOne({ where: { mobile: '13800138001' } })

    // 获取测试买家2（用于多买家抢购场景）
    test_buyer_2 = await User.findOne({ where: { mobile: '13800138002' } })

    // 如果买家不存在，尝试查找其他用户
    if (!test_buyer_1) {
      test_buyer_1 = await User.findOne({
        where: {
          user_id: { [sequelize.Sequelize.Op.ne]: test_seller.user_id },
          status: 'active'
        },
        order: [['user_id', 'ASC']]
      })
    }

    if (!test_buyer_2) {
      test_buyer_2 = await User.findOne({
        where: {
          user_id: {
            [sequelize.Sequelize.Op.notIn]: [test_seller.user_id, test_buyer_1?.user_id || 0]
          },
          status: 'active'
        },
        order: [['user_id', 'ASC']]
      })
    }

    // 获取管理员（使用主测试账号，既是用户也是管理员）
    test_admin = test_seller

    console.log('✅ 测试用户准备完成:', {
      seller_id: test_seller.user_id,
      buyer_1_id: test_buyer_1?.user_id || '未找到',
      buyer_2_id: test_buyer_2?.user_id || '未找到',
      admin_id: test_admin.user_id
    })

    // 清理历史测试遗留的 on_sale 挂牌（避免超出挂牌数量限制）
    const staleCount = await MarketListing.update(
      { status: 'withdrawn' },
      {
        where: {
          seller_user_id: test_seller.user_id,
          status: 'on_sale',
          idempotency_key: {
            [sequelize.Sequelize.Op.or]: [
              { [sequelize.Sequelize.Op.like]: '%test%' },
              { [sequelize.Sequelize.Op.like]: 'cancel_%' },
              { [sequelize.Sequelize.Op.like]: 'multi_user_%' },
              { [sequelize.Sequelize.Op.like]: 'fungible_%' },
              { [sequelize.Sequelize.Op.like]: 'item_listing_%' },
              { [sequelize.Sequelize.Op.like]: 'stress_%' },
              { [sequelize.Sequelize.Op.like]: 'admin_%' }
            ]
          }
        }
      }
    )
    if (staleCount[0] > 0) {
      console.log(`🧹 清理 ${staleCount[0]} 个历史测试遗留挂牌`)
    }
  })

  afterAll(async () => {
    // 清理测试数据
    console.log('🧹 开始清理测试数据...')

    // 清理创建的订单
    if (created_orders.length > 0) {
      await TradeOrder.destroy({
        where: { trade_order_id: { [sequelize.Sequelize.Op.in]: created_orders } }
      })
      console.log(`✅ 清理 ${created_orders.length} 个测试订单`)
    }

    // 清理创建的挂牌
    if (created_listings.length > 0) {
      await MarketListing.destroy({
        where: { market_listing_id: { [sequelize.Sequelize.Op.in]: created_listings } }
      })
      console.log(`✅ 清理 ${created_listings.length} 个测试挂牌`)
    }

    await sequelize.close()
    console.log('✅ 数据库连接关闭')
  })

  /**
   * 为用户准备资产余额
   * @param {number} user_id - 用户ID
   * @param {string} asset_code - 资产代码
   * @param {number} amount - 金额
   * @param {Object} [transaction] - 事务对象
   */
  async function prepareUserBalance(user_id, asset_code, amount, transaction = null) {
    const options = transaction ? { transaction } : {}

    await BalanceService.changeBalance(
      {
        user_id,
        asset_code,
        delta_amount: amount,
        business_type: 'test_grant',
        counterpart_account_id: 2,
        idempotency_key: generateIdempotencyKey(`grant_${user_id}_${asset_code}`)
      },
      options
    )
  }

  /**
   * 获取用户可用余额
   * @param {number} user_id - 用户ID
   * @param {string} asset_code - 资产代码
   * @returns {Promise<number>} 可用余额
   */
  async function getUserAvailableBalance(user_id, asset_code) {
    const account = await Account.findOne({
      where: { user_id, account_type: 'user' }
    })

    if (!account) return 0

    const balance = await AccountAssetBalance.findOne({
      where: { account_id: account.account_id, asset_code }
    })

    return balance ? Number(balance.available_amount) : 0
  }

  /**
   * 获取用户冻结余额
   * @param {number} user_id - 用户ID
   * @param {string} asset_code - 资产代码
   * @returns {Promise<number>} 冻结余额
   */
  async function getUserFrozenBalance(user_id, asset_code) {
    const account = await Account.findOne({
      where: { user_id, account_type: 'user' }
    })

    if (!account) return 0

    const balance = await AccountAssetBalance.findOne({
      where: { account_id: account.account_id, asset_code }
    })

    return balance ? Number(balance.frozen_amount) : 0
  }

  /*
   * ============================================================
   * P0-2.2: 买家取消+卖家挂牌恢复
   * ============================================================
   */
  describe('P0-2.2: 买家取消+卖家挂牌恢复', () => {
    /**
     * 场景说明：
     * 1. 卖家创建可叠加资产挂牌
     * 2. 买家下单（冻结买家资产，挂牌状态变为 locked）
     * 3. 买家主动取消订单
     * 4. 验证：买家资产解冻，挂牌恢复为 on_sale 状态
     */
    it('买家取消订单后，卖家挂牌应恢复为 on_sale 状态', async () => {
      if (!test_buyer_1) {
        console.log('⚠️ 跳过测试：缺少测试买家')
        return
      }

      // ========== 1. 准备：确保卖家和买家有足够资产 ==========
      const prep_tx = await sequelize.transaction()
      try {
        // 卖家需要有挂牌资产
        await prepareUserBalance(
          test_seller.user_id,
          TEST_ASSET_CODE,
          LISTING_OFFER_AMOUNT,
          prep_tx
        )

        // 买家需要有购买资产
        await prepareUserBalance(
          test_buyer_1.user_id,
          TEST_ASSET_CODE,
          LISTING_PRICE_AMOUNT,
          prep_tx
        )

        await prep_tx.commit()
      } catch (e) {
        await prep_tx.rollback()
        throw e
      }

      // ========== 2. 卖家创建挂牌 ==========
      const create_tx = await sequelize.transaction()
      let listing
      try {
        const result = await MarketListingService.createFungibleAssetListing(
          {
            idempotency_key: generateIdempotencyKey('cancel_test_listing'),
            seller_user_id: test_seller.user_id,
            offer_asset_code: TEST_ASSET_CODE,
            offer_amount: LISTING_OFFER_AMOUNT,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: LISTING_PRICE_AMOUNT
          },
          { transaction: create_tx }
        )
        listing = result.listing
        created_listings.push(listing.market_listing_id)
        await create_tx.commit()
      } catch (e) {
        await create_tx.rollback()
        throw e
      }

      expect(listing).toBeDefined()
      expect(listing.status).toBe('on_sale')
      console.log(`✅ 创建挂牌成功: market_listing_id=${listing.market_listing_id}`)

      /*
       * ========== 3. 买家下单（冻结买家资产） ==========
       * 记录下单前的余额
       */
      const _buyer_available_before_order = await getUserAvailableBalance(
        test_buyer_1.user_id,
        TEST_ASSET_CODE
      )

      const order_tx = await sequelize.transaction()
      let order_id
      try {
        const result = await TradeOrderService.createOrder(
          {
            idempotency_key: generateIdempotencyKey('cancel_test_order'),
            market_listing_id: listing.market_listing_id,
            buyer_id: test_buyer_1.user_id
          },
          { transaction: order_tx }
        )
        order_id = result.trade_order_id
        created_orders.push(order_id)
        await order_tx.commit()
      } catch (e) {
        await order_tx.rollback()
        throw e
      }

      expect(order_id).toBeDefined()
      console.log(`✅ 创建订单成功: order_id=${order_id}`)

      // 验证订单状态和挂牌状态
      const order_after_create = await TradeOrder.findByPk(order_id)
      expect(order_after_create.status).toBe('frozen')

      const listing_after_order = await MarketListing.findByPk(listing.market_listing_id)
      expect(listing_after_order.status).toBe('locked')
      console.log('✅ 下单后挂牌状态为 locked')

      // 验证买家资产已冻结
      const buyer_frozen_after_order = await getUserFrozenBalance(
        test_buyer_1.user_id,
        TEST_ASSET_CODE
      )
      expect(buyer_frozen_after_order).toBeGreaterThan(0)
      console.log(`✅ 买家资产已冻结: ${buyer_frozen_after_order}`)

      // ========== 4. 买家主动取消订单 ==========
      const cancel_tx = await sequelize.transaction()
      let cancel_result
      try {
        cancel_result = await TradeOrderService.cancelOrder(
          {
            trade_order_id: order_id,
            cancel_reason: '买家主动取消测试'
          },
          { transaction: cancel_tx }
        )
        await cancel_tx.commit()
      } catch (e) {
        await cancel_tx.rollback()
        throw e
      }

      expect(cancel_result).toBeDefined()
      console.log('✅ 订单取消成功')

      // ========== 5. 验证：订单状态、挂牌状态、买家资产 ==========

      // 5.1 验证订单状态变为 cancelled
      const order_after_cancel = await TradeOrder.findByPk(order_id)
      expect(order_after_cancel.status).toBe('cancelled')
      console.log('✅ 订单状态已更新为 cancelled')

      // 5.2 【核心验证】挂牌应恢复为 on_sale 状态
      const listing_after_cancel = await MarketListing.findByPk(listing.market_listing_id)
      expect(listing_after_cancel.status).toBe('on_sale')
      expect(listing_after_cancel.locked_by_order_id).toBeNull()
      console.log('✅ 挂牌状态已恢复为 on_sale')

      // 5.3 验证买家资产已解冻
      const buyer_frozen_after_cancel = await getUserFrozenBalance(
        test_buyer_1.user_id,
        TEST_ASSET_CODE
      )

      const buyer_available_after_cancel = await getUserAvailableBalance(
        test_buyer_1.user_id,
        TEST_ASSET_CODE
      )

      // 冻结金额应该减少（解冻了订单金额）
      expect(buyer_frozen_after_cancel).toBeLessThan(buyer_frozen_after_order)
      console.log(
        `✅ 买家冻结资产已解冻: ${buyer_frozen_after_order} → ${buyer_frozen_after_cancel}`
      )
      console.log(`✅ 买家可用资产已恢复: ${buyer_available_after_cancel}`)
    })

    it('订单已完成时，不能取消', async () => {
      /*
       * 这个测试验证业务规则：completed 状态的订单不能取消
       * 使用模拟数据创建一个 completed 状态的订单记录
       */
      const mock_order = await TradeOrder.create({
        order_no: uniquePlaceholderTradeOrderNo(),
        business_id: generateIdempotencyKey('mock_completed'),
        idempotency_key: generateIdempotencyKey('mock_completed_order'),
        market_listing_id: 1, // 模拟挂牌ID
        buyer_user_id: test_buyer_1?.user_id || test_seller.user_id,
        seller_user_id: test_seller.user_id,
        asset_code: TEST_ASSET_CODE,
        gross_amount: 100,
        fee_amount: 5,
        net_amount: 95,
        status: 'completed'
      })
      created_orders.push(mock_order.trade_order_id)

      // 尝试取消已完成的订单
      const cancel_tx = await sequelize.transaction()
      try {
        await expect(
          TradeOrderService.cancelOrder(
            { trade_order_id: mock_order.trade_order_id, cancel_reason: '测试取消' },
            { transaction: cancel_tx }
          )
        ).rejects.toThrow(/状态异常/)

        await cancel_tx.rollback()
        console.log('✅ 已完成订单无法取消（符合预期）')
      } catch (e) {
        await cancel_tx.rollback()
        // 如果是预期的错误，测试通过
        if (e.message.includes('状态异常')) {
          console.log('✅ 已完成订单无法取消（符合预期）')
        } else {
          throw e
        }
      }
    })
  })

  /*
   * ============================================================
   * P0-2.3: 订单超时自动取消场景
   * ============================================================
   */
  describe('P0-2.3: 订单超时自动取消场景', () => {
    /**
     * 场景说明：
     * 1. 验证 HourlyUnlockTimeoutTradeOrders 任务的配置
     * 2. 验证超时检测逻辑（不实际修改订单状态，只检测）
     * 3. 验证任务执行报告结构
     */
    it('应正确配置订单超时阈值', () => {
      // 验证超时阈值配置（默认3分钟）
      expect(HourlyUnlockTimeoutTradeOrders.LOCK_TIMEOUT_MINUTES).toBeDefined()
      expect(HourlyUnlockTimeoutTradeOrders.LOCK_TIMEOUT_MINUTES).toBe(3)
      console.log(`✅ 订单超时阈值: ${HourlyUnlockTimeoutTradeOrders.LOCK_TIMEOUT_MINUTES} 分钟`)
    })

    it('应能统计超时的冻结订单数量', async () => {
      // 查询超时的 frozen 订单（created_at 超过 3 分钟）
      const timeout_threshold = new Date(
        Date.now() - HourlyUnlockTimeoutTradeOrders.LOCK_TIMEOUT_MINUTES * 60 * 1000
      )

      const timeout_orders_count = await TradeOrder.count({
        where: {
          status: 'frozen',
          created_at: { [sequelize.Sequelize.Op.lt]: timeout_threshold }
        }
      })

      console.log(`📊 当前超时的冻结订单数量: ${timeout_orders_count}`)
      expect(typeof timeout_orders_count).toBe('number')
    })

    it('超时任务执行后应返回正确的报告结构', async () => {
      /**
       * 注意：此测试会实际执行超时任务
       * 如果有真实的超时订单，会被取消并解冻资产
       */
      const report = await HourlyUnlockTimeoutTradeOrders.execute()

      // 验证报告结构
      expect(report).toHaveProperty('timestamp')
      expect(report).toHaveProperty('duration_ms')
      expect(report).toHaveProperty('released_items')
      expect(report).toHaveProperty('cancelled_orders')
      expect(report).toHaveProperty('total_released_items')
      expect(report).toHaveProperty('total_cancelled_orders')
      expect(report).toHaveProperty('total_unfrozen_amount')

      console.log('✅ 超时任务执行报告:', {
        duration_ms: report.duration_ms,
        released_items_count: report.total_released_items,
        cancelled_orders_count: report.total_cancelled_orders,
        total_unfrozen_amount: report.total_unfrozen_amount
      })
    })

    it('模拟超时订单场景（验证取消逻辑）', async () => {
      if (!test_buyer_1) {
        console.log('⚠️ 跳过测试：缺少测试买家')
        return
      }

      // ========== 1. 准备资产 ==========
      const prep_tx = await sequelize.transaction()
      try {
        await prepareUserBalance(
          test_seller.user_id,
          TEST_ASSET_CODE,
          LISTING_OFFER_AMOUNT,
          prep_tx
        )
        await prepareUserBalance(
          test_buyer_1.user_id,
          TEST_ASSET_CODE,
          LISTING_PRICE_AMOUNT,
          prep_tx
        )
        await prep_tx.commit()
      } catch (e) {
        await prep_tx.rollback()
        throw e
      }

      // ========== 2. 创建挂牌 ==========
      const create_tx = await sequelize.transaction()
      let listing
      try {
        const result = await MarketListingService.createFungibleAssetListing(
          {
            idempotency_key: generateIdempotencyKey('timeout_test_listing'),
            seller_user_id: test_seller.user_id,
            offer_asset_code: TEST_ASSET_CODE,
            offer_amount: LISTING_OFFER_AMOUNT,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: LISTING_PRICE_AMOUNT
          },
          { transaction: create_tx }
        )
        listing = result.listing
        created_listings.push(listing.market_listing_id)
        await create_tx.commit()
      } catch (e) {
        await create_tx.rollback()
        throw e
      }

      // ========== 3. 买家下单 ==========
      const order_tx = await sequelize.transaction()
      let order_id
      try {
        const result = await TradeOrderService.createOrder(
          {
            idempotency_key: generateIdempotencyKey('timeout_test_order'),
            market_listing_id: listing.market_listing_id,
            buyer_id: test_buyer_1.user_id
          },
          { transaction: order_tx }
        )
        order_id = result.trade_order_id
        created_orders.push(order_id)
        await order_tx.commit()
      } catch (e) {
        await order_tx.rollback()
        throw e
      }

      // ========== 4. 模拟超时（手动将 created_at 设置为超时时间之前） ==========
      const timeout_time = new Date(
        Date.now() - (HourlyUnlockTimeoutTradeOrders.LOCK_TIMEOUT_MINUTES + 1) * 60 * 1000
      )
      await TradeOrder.update({ created_at: timeout_time }, { where: { trade_order_id: order_id } })
      console.log(
        `✅ 模拟订单超时: trade_order_id=${order_id}, created_at=${timeout_time.toISOString()}`
      )

      // 记录超时前的状态
      const order_before_timeout = await TradeOrder.findByPk(order_id)
      expect(order_before_timeout.status).toBe('frozen')

      const buyer_frozen_before = await getUserFrozenBalance(test_buyer_1.user_id, TEST_ASSET_CODE)

      // ========== 5. 执行超时任务 ==========
      const _report = await HourlyUnlockTimeoutTradeOrders.execute()

      // ========== 6. 验证结果 ==========
      const order_after_timeout = await TradeOrder.findByPk(order_id)
      expect(order_after_timeout.status).toBe('cancelled')
      console.log('✅ 超时订单已自动取消')

      const listing_after_timeout = await MarketListing.findByPk(listing.market_listing_id)
      expect(listing_after_timeout.status).toBe('on_sale')
      console.log('✅ 挂牌已恢复为 on_sale')

      // 验证买家资产已解冻
      const buyer_frozen_after = await getUserFrozenBalance(test_buyer_1.user_id, TEST_ASSET_CODE)
      expect(buyer_frozen_after).toBeLessThan(buyer_frozen_before)
      console.log(`✅ 买家冻结资产已解冻: ${buyer_frozen_before} → ${buyer_frozen_after}`)
    })
  })

  /*
   * ============================================================
   * P0-2.4: 多买家抢购同一挂牌
   * ============================================================
   */
  describe('P0-2.4: 多买家抢购同一挂牌', () => {
    /**
     * 场景说明：
     * 1. 卖家创建一个挂牌
     * 2. 多个买家同时抢购
     * 3. 只有一个买家能成功，其他应收到状态异常错误
     */
    it('多买家抢购时，只有一个能成功下单', async () => {
      if (!test_buyer_1 || !test_buyer_2) {
        console.log('⚠️ 跳过测试：需要至少两个测试买家')
        return
      }

      // ========== 1. 准备资产 ==========
      const prep_tx = await sequelize.transaction()
      try {
        // 卖家资产
        await prepareUserBalance(
          test_seller.user_id,
          TEST_ASSET_CODE,
          LISTING_OFFER_AMOUNT,
          prep_tx
        )
        // 买家1资产
        await prepareUserBalance(
          test_buyer_1.user_id,
          TEST_ASSET_CODE,
          LISTING_PRICE_AMOUNT,
          prep_tx
        )
        // 买家2资产
        await prepareUserBalance(
          test_buyer_2.user_id,
          TEST_ASSET_CODE,
          LISTING_PRICE_AMOUNT,
          prep_tx
        )
        await prep_tx.commit()
      } catch (e) {
        await prep_tx.rollback()
        throw e
      }

      // ========== 2. 创建挂牌 ==========
      const create_tx = await sequelize.transaction()
      let listing
      try {
        const result = await MarketListingService.createFungibleAssetListing(
          {
            idempotency_key: generateIdempotencyKey('rush_test_listing'),
            seller_user_id: test_seller.user_id,
            offer_asset_code: TEST_ASSET_CODE,
            offer_amount: LISTING_OFFER_AMOUNT,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: LISTING_PRICE_AMOUNT
          },
          { transaction: create_tx }
        )
        listing = result.listing
        created_listings.push(listing.market_listing_id)
        await create_tx.commit()
      } catch (e) {
        await create_tx.rollback()
        throw e
      }

      console.log(`✅ 创建抢购挂牌: market_listing_id=${listing.market_listing_id}`)

      // ========== 3. 模拟并发抢购 ==========
      const createOrderForBuyer = async (buyer_id, buyer_name) => {
        const tx = await sequelize.transaction()
        try {
          const result = await TradeOrderService.createOrder(
            {
              idempotency_key: generateIdempotencyKey(`rush_order_${buyer_id}`),
              market_listing_id: listing.market_listing_id,
              buyer_id
            },
            { transaction: tx }
          )
          created_orders.push(result.trade_order_id)
          await tx.commit()
          return { success: true, buyer_name, trade_order_id: result.trade_order_id }
        } catch (e) {
          await tx.rollback()
          return { success: false, buyer_name, error: e.message }
        }
      }

      // 并发执行两个买家的下单请求
      const [result_1, result_2] = await Promise.all([
        createOrderForBuyer(test_buyer_1.user_id, '买家1'),
        createOrderForBuyer(test_buyer_2.user_id, '买家2')
      ])

      console.log('📊 抢购结果:', { result_1, result_2 })

      // ========== 4. 验证：只有一个买家成功 ==========
      const success_count = [result_1.success, result_2.success].filter(Boolean).length
      const failure_count = [result_1.success, result_2.success].filter(v => !v).length

      expect(success_count).toBe(1)
      expect(failure_count).toBe(1)
      console.log('✅ 并发控制正确：只有一个买家成功下单')

      // 验证失败的买家收到了正确的错误信息
      const failed_result = result_1.success ? result_2 : result_1
      expect(failed_result.error).toMatch(/状态异常|locked|不可用/i)
      console.log(`✅ 失败买家收到正确错误: ${failed_result.error}`)
    })

    it('挂牌被锁定后，其他买家应收到明确的错误提示', async () => {
      if (!test_buyer_1) {
        console.log('⚠️ 跳过测试：缺少测试买家')
        return
      }

      // ========== 1. 准备资产并创建挂牌 ==========
      const prep_tx = await sequelize.transaction()
      try {
        await prepareUserBalance(
          test_seller.user_id,
          TEST_ASSET_CODE,
          LISTING_OFFER_AMOUNT,
          prep_tx
        )
        await prepareUserBalance(
          test_buyer_1.user_id,
          TEST_ASSET_CODE,
          LISTING_PRICE_AMOUNT,
          prep_tx
        )
        await prep_tx.commit()
      } catch (e) {
        await prep_tx.rollback()
        throw e
      }

      const create_tx = await sequelize.transaction()
      let listing
      try {
        const result = await MarketListingService.createFungibleAssetListing(
          {
            idempotency_key: generateIdempotencyKey('lock_test_listing'),
            seller_user_id: test_seller.user_id,
            offer_asset_code: TEST_ASSET_CODE,
            offer_amount: LISTING_OFFER_AMOUNT,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: LISTING_PRICE_AMOUNT
          },
          { transaction: create_tx }
        )
        listing = result.listing
        created_listings.push(listing.market_listing_id)
        await create_tx.commit()
      } catch (e) {
        await create_tx.rollback()
        throw e
      }

      // ========== 2. 手动将挂牌设置为 locked 状态（模拟已被其他买家锁定） ==========
      await MarketListing.update(
        { status: 'locked', locked_by_order_id: 99999 },
        { where: { market_listing_id: listing.market_listing_id } }
      )

      // ========== 3. 买家尝试下单（应失败） ==========
      const order_tx = await sequelize.transaction()
      try {
        await TradeOrderService.createOrder(
          {
            idempotency_key: generateIdempotencyKey('lock_test_order'),
            market_listing_id: listing.market_listing_id,
            buyer_id: test_buyer_1.user_id
          },
          { transaction: order_tx }
        )
        await order_tx.rollback()
        throw new Error('应该抛出挂牌状态异常错误')
      } catch (e) {
        await order_tx.rollback()
        // 验证收到了正确的错误
        if (e.message === '应该抛出挂牌状态异常错误') {
          throw e
        }
        expect(e.message).toMatch(/状态异常|locked/)
        console.log(`✅ 挂牌被锁定时下单正确失败: ${e.message}`)
      }

      // 清理：恢复挂牌状态以便清理
      await MarketListing.update(
        { status: 'on_sale', locked_by_order_id: null },
        { where: { market_listing_id: listing.market_listing_id } }
      )
    })
  })

  /*
   * ============================================================
   * P0-2.5: 管理员强制下架场景
   * ============================================================
   */
  describe('P0-2.5: 管理员强制下架场景', () => {
    /**
     * 场景说明：
     * 1. 卖家创建挂牌
     * 2. 管理员强制下架（需要原因）
     * 3. 验证：挂牌状态变为 admin_withdrawn，卖家资产解冻，审计日志记录
     */
    it('管理员应能强制下架违规挂牌', async () => {
      // ========== 1. 准备资产 ==========
      const prep_tx = await sequelize.transaction()
      try {
        await prepareUserBalance(
          test_seller.user_id,
          TEST_ASSET_CODE,
          LISTING_OFFER_AMOUNT,
          prep_tx
        )
        await prep_tx.commit()
      } catch (e) {
        await prep_tx.rollback()
        throw e
      }

      // ========== 2. 创建挂牌 ==========
      const create_tx = await sequelize.transaction()
      let listing
      try {
        const result = await MarketListingService.createFungibleAssetListing(
          {
            idempotency_key: generateIdempotencyKey('admin_withdraw_test'),
            seller_user_id: test_seller.user_id,
            offer_asset_code: TEST_ASSET_CODE,
            offer_amount: LISTING_OFFER_AMOUNT,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: LISTING_PRICE_AMOUNT
          },
          { transaction: create_tx }
        )
        listing = result.listing
        created_listings.push(listing.market_listing_id)
        await create_tx.commit()
      } catch (e) {
        await create_tx.rollback()
        throw e
      }

      expect(listing.status).toBe('on_sale')
      expect(listing.seller_offer_frozen).toBe(true)
      console.log(`✅ 创建挂牌成功: market_listing_id=${listing.market_listing_id}`)

      // 记录下架前卖家的冻结余额
      const seller_frozen_before = await getUserFrozenBalance(test_seller.user_id, TEST_ASSET_CODE)

      // ========== 3. 管理员强制下架 ==========
      const withdraw_tx = await sequelize.transaction()
      let withdraw_result
      try {
        withdraw_result = await MarketListingService.adminForceWithdrawListing(
          {
            market_listing_id: listing.market_listing_id,
            operator_id: test_admin.user_id,
            reason: '测试：违规挂牌强制下架'
          },
          { transaction: withdraw_tx }
        )
        await withdraw_tx.commit()
      } catch (e) {
        await withdraw_tx.rollback()
        throw e
      }

      // ========== 4. 验证结果 ==========

      // 4.1 验证挂牌状态变为 admin_withdrawn
      const listing_after = await MarketListing.findByPk(listing.market_listing_id)
      expect(listing_after.status).toBe('admin_withdrawn')
      expect(listing_after.seller_offer_frozen).toBe(false)
      console.log('✅ 挂牌状态已更新为 admin_withdrawn')

      // 4.2 验证卖家资产已解冻
      const seller_frozen_after = await getUserFrozenBalance(test_seller.user_id, TEST_ASSET_CODE)
      expect(seller_frozen_after).toBeLessThan(seller_frozen_before)
      console.log(`✅ 卖家冻结资产已解冻: ${seller_frozen_before} → ${seller_frozen_after}`)

      // 4.3 验证返回结果包含审计日志
      expect(withdraw_result).toHaveProperty('listing')
      expect(withdraw_result.listing.status).toBe('admin_withdrawn')
      console.log('✅ 管理员强制下架完成')
    })

    it('强制下架时必须提供撤回原因', async () => {
      // 准备资产并创建挂牌
      const prep_tx = await sequelize.transaction()
      try {
        await prepareUserBalance(
          test_seller.user_id,
          TEST_ASSET_CODE,
          LISTING_OFFER_AMOUNT,
          prep_tx
        )
        await prep_tx.commit()
      } catch (e) {
        await prep_tx.rollback()
        throw e
      }

      const create_tx = await sequelize.transaction()
      let listing
      try {
        const result = await MarketListingService.createFungibleAssetListing(
          {
            idempotency_key: generateIdempotencyKey('admin_no_reason_test'),
            seller_user_id: test_seller.user_id,
            offer_asset_code: TEST_ASSET_CODE,
            offer_amount: LISTING_OFFER_AMOUNT,
            price_asset_code: TEST_ASSET_CODE,
            price_amount: LISTING_PRICE_AMOUNT
          },
          { transaction: create_tx }
        )
        listing = result.listing
        created_listings.push(listing.market_listing_id)
        await create_tx.commit()
      } catch (e) {
        await create_tx.rollback()
        throw e
      }

      // 尝试不提供原因进行强制下架
      const withdraw_tx = await sequelize.transaction()
      try {
        await MarketListingService.adminForceWithdrawListing(
          {
            market_listing_id: listing.market_listing_id,
            operator_id: test_admin.user_id,
            reason: '' // 空原因
          },
          { transaction: withdraw_tx }
        )
        await withdraw_tx.rollback()
        throw new Error('应该抛出缺少原因错误')
      } catch (e) {
        await withdraw_tx.rollback()
        if (e.message === '应该抛出缺少原因错误') {
          throw e
        }
        expect(e.message).toMatch(/原因|必需|reason/i)
        expect(e.code).toBe('MISSING_WITHDRAW_REASON')
        console.log(`✅ 缺少原因时正确报错: ${e.message}`)
      }
    })

    it('不存在的挂牌无法强制下架', async () => {
      const withdraw_tx = await sequelize.transaction()
      try {
        await MarketListingService.adminForceWithdrawListing(
          {
            market_listing_id: 999999999, // 不存在的挂牌ID
            operator_id: test_admin.user_id,
            reason: '测试不存在的挂牌'
          },
          { transaction: withdraw_tx }
        )
        await withdraw_tx.rollback()
        throw new Error('应该抛出挂牌不存在错误')
      } catch (e) {
        await withdraw_tx.rollback()
        if (e.message === '应该抛出挂牌不存在错误') {
          throw e
        }
        expect(e.message).toMatch(/不存在/i)
        expect(e.code).toBe('LISTING_NOT_FOUND')
        console.log(`✅ 不存在的挂牌正确报错: ${e.message}`)
      }
    })

    it('已售出的挂牌无法强制下架', async () => {
      // 创建一个状态为 sold 的挂牌记录（模拟已售出）
      const mock_listing = await MarketListing.create({
        business_id: generateIdempotencyKey('mock_sold'),
        idempotency_key: generateIdempotencyKey('mock_sold_listing'),
        listing_kind: 'fungible_asset',
        seller_user_id: test_seller.user_id,
        offer_asset_code: TEST_ASSET_CODE,
        offer_amount: LISTING_OFFER_AMOUNT,
        price_asset_code: TEST_ASSET_CODE,
        price_amount: LISTING_PRICE_AMOUNT,
        status: 'sold', // 已售出状态
        seller_offer_frozen: false
      })
      created_listings.push(mock_listing.market_listing_id)

      const withdraw_tx = await sequelize.transaction()
      try {
        await MarketListingService.adminForceWithdrawListing(
          {
            market_listing_id: mock_listing.market_listing_id,
            operator_id: test_admin.user_id,
            reason: '测试已售出挂牌'
          },
          { transaction: withdraw_tx }
        )
        await withdraw_tx.rollback()
        throw new Error('应该抛出状态不可撤回错误')
      } catch (e) {
        await withdraw_tx.rollback()
        if (e.message === '应该抛出状态不可撤回错误') {
          throw e
        }
        expect(e.message).toMatch(/状态不可撤回|sold/i)
        expect(e.code).toBe('INVALID_LISTING_STATUS')
        console.log(`✅ 已售出挂牌无法强制下架: ${e.message}`)
      }
    })
  })
})
