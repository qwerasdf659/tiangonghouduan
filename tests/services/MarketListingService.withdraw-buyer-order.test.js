/**
 * MarketListingService 撤回挂牌测试 - 买家订单场景
 *
 * 测试背景：
 * 2026-01-30 发现"孤儿冻结"问题：
 * - 卖家撤回挂牌时，买家已下单的冻结资产没有解冻
 * - 导致买家资产永久被冻结
 *
 * 本测试用例覆盖之前缺失的场景：
 * - 卖家创建挂牌
 * - 买家下单（冻结资产）
 * - 卖家撤回挂牌
 * - 验证买家资产是否被自动解冻
 *
 * 创建时间：2026-01-30
 * 修复版本：方案C系统性预防机制
 */

const {
  sequelize,
  User,
  // MarketListing 用于后续市场交易验证扩展
  TradeOrder,
  AccountAssetBalance,
  Account
} = require('../../models')

/**
 * V4.7.0 大文件拆分：MarketListingService 已拆分为子服务
 * 本测试使用核心操作方法（createFungibleAssetListing, withdrawFungibleAssetListing）
 * 都在 CoreService 中
 */
let MarketListingService
let TradeOrderService
let BalanceService

// 测试超时设置
jest.setTimeout(60000)

describe('MarketListingService - 撤回挂牌时买家订单处理', () => {
  let test_seller
  let test_buyer

  beforeAll(async () => {
    await sequelize.authenticate()

    /**
     * V4.7.0 大文件拆分适配：
     * 使用 CoreService（静态类）获取核心挂牌操作方法
     */
    MarketListingService = global.getTestService('market_listing_core')
    TradeOrderService = global.getTestService('trade_order')
    BalanceService = global.getTestService('asset_balance')

    // 获取测试用户
    test_seller = await User.findOne({ where: { mobile: '13612227930' } })
    test_buyer = await User.findOne({ where: { mobile: '13800138001' } })

    if (!test_seller) {
      throw new Error('测试卖家不存在：13612227930')
    }

    // 如果没有买家，尝试使用其他用户
    if (!test_buyer) {
      test_buyer = await User.findOne({
        where: {
          user_id: { [sequelize.Sequelize.Op.ne]: test_seller.user_id }
        }
      })
    }

    if (!test_buyer) {
      console.warn('⚠️ 未找到测试买家，部分测试将跳过')
    }
  })

  afterAll(async () => {
    await sequelize.close()
  })

  describe('关键场景：撤回挂牌时自动取消买家订单并解冻资产', () => {
    /**
     * 这是之前缺失的关键测试用例
     *
     * 场景：
     * 1. 卖家创建可叠加资产挂牌（如100钻石）
     * 2. 买家下单购买（冻结买家资产）
     * 3. 卖家撤回挂牌
     * 4. 验证：买家的冻结资产应自动解冻
     */
    it('卖家撤回挂牌时，应自动取消买家订单并解冻买家资产', async () => {
      if (!test_buyer) {
        console.log('⚠️ 跳过测试：缺少测试买家')
        return
      }

      const test_asset_code = 'DIAMOND'
      const listing_amount = 10
      const price_amount = 100

      // ========== 1. 准备：确保卖家和买家有资产 ==========
      const prep_tx = await sequelize.transaction()
      try {
        // 卖家需要有挂牌资产
        await BalanceService.changeBalance(
          {
            user_id: test_seller.user_id,
            asset_code: test_asset_code,
            delta_amount: listing_amount,
            business_type: 'test_grant',
            counterpart_account_id: 2,
            idempotency_key: `test_seller_grant_${Date.now()}`
          },
          { transaction: prep_tx }
        )

        // 买家需要有购买资产
        await BalanceService.changeBalance(
          {
            user_id: test_buyer.user_id,
            asset_code: test_asset_code,
            delta_amount: price_amount,
            business_type: 'test_grant',
            counterpart_account_id: 2,
            idempotency_key: `test_buyer_grant_${Date.now()}`
          },
          { transaction: prep_tx }
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
            idempotency_key: `withdraw_test_listing_${Date.now()}`,
            seller_user_id: test_seller.user_id,
            offer_asset_code: test_asset_code,
            offer_amount: listing_amount,
            price_asset_code: test_asset_code,
            price_amount
          },
          { transaction: create_tx }
        )
        listing = result.listing
        await create_tx.commit()
      } catch (e) {
        await create_tx.rollback()
        throw e
      }

      expect(listing).toBeDefined()
      expect(listing.status).toBe('on_sale')

      // ========== 3. 买家下单（冻结买家资产） ==========
      const order_tx = await sequelize.transaction()
      let order_id
      try {
        const result = await TradeOrderService.createOrder(
          {
            idempotency_key: `withdraw_test_order_${Date.now()}`,
            market_listing_id: listing.market_listing_id,
            buyer_id: test_buyer.user_id
          },
          { transaction: order_tx }
        )
        order_id = result.trade_order_id
        await order_tx.commit()
      } catch (e) {
        await order_tx.rollback()
        throw e
      }

      expect(order_id).toBeDefined()

      // 查询订单确认状态
      const order = await TradeOrder.findByPk(order_id)
      expect(order.status).toBe('frozen')

      // 记录买家冻结前的资产状态
      const buyer_account = await Account.findOne({
        where: { user_id: test_buyer.user_id, account_type: 'user' }
      })
      const buyer_balance_before = await AccountAssetBalance.findOne({
        where: { account_id: buyer_account.account_id, asset_code: test_asset_code }
      })

      const frozen_before = Number(buyer_balance_before.frozen_amount)
      expect(frozen_before).toBeGreaterThan(0) // 确认有冻结

      // ========== 4. 卖家撤回挂牌 ==========
      const withdraw_tx = await sequelize.transaction()
      let withdraw_result
      try {
        withdraw_result = await MarketListingService.withdrawFungibleAssetListing(
          {
            market_listing_id: listing.market_listing_id,
            seller_user_id: test_seller.user_id
          },
          { transaction: withdraw_tx }
        )
        await withdraw_tx.commit()
      } catch (e) {
        await withdraw_tx.rollback()
        throw e
      }

      // ========== 5. 验证：买家订单应被取消，资产应解冻 ==========

      // 5.1 验证挂牌状态
      expect(withdraw_result.listing.status).toBe('withdrawn')

      // 5.2 验证取消的订单列表（新增返回字段）
      expect(withdraw_result.cancelled_orders).toBeDefined()
      expect(withdraw_result.cancelled_orders.length).toBeGreaterThan(0)
      console.log('✅ 已取消的买家订单:', withdraw_result.cancelled_orders)

      // 5.3 验证订单状态已变为 cancelled
      const updated_order = await TradeOrder.findByPk(order_id)
      expect(updated_order.status).toBe('cancelled')
      console.log('✅ 订单状态已更新为 cancelled')

      // 5.4 验证买家资产已解冻
      const buyer_balance_after = await AccountAssetBalance.findOne({
        where: { account_id: buyer_account.account_id, asset_code: test_asset_code }
      })

      const frozen_after = Number(buyer_balance_after.frozen_amount)
      const available_after = Number(buyer_balance_after.available_amount)

      // 冻结金额应该减少（解冻了订单金额）
      expect(frozen_after).toBeLessThan(frozen_before)
      console.log(`✅ 买家冻结资产已解冻: ${frozen_before} → ${frozen_after}`)
      console.log(`✅ 买家可用资产: ${available_after}`)
    })

    it('撤回时没有买家订单，应正常完成', async () => {
      const test_asset_code = 'DIAMOND'

      // 1. 准备卖家资产
      const prep_tx = await sequelize.transaction()
      try {
        await BalanceService.changeBalance(
          {
            user_id: test_seller.user_id,
            asset_code: test_asset_code,
            delta_amount: 10,
            business_type: 'test_grant',
            counterpart_account_id: 2,
            idempotency_key: `no_order_grant_${Date.now()}`
          },
          { transaction: prep_tx }
        )
        await prep_tx.commit()
      } catch (e) {
        await prep_tx.rollback()
        throw e
      }

      // 2. 创建挂牌
      const create_tx = await sequelize.transaction()
      let listing
      try {
        const result = await MarketListingService.createFungibleAssetListing(
          {
            idempotency_key: `no_order_listing_${Date.now()}`,
            seller_user_id: test_seller.user_id,
            offer_asset_code: test_asset_code,
            offer_amount: 10,
            price_asset_code: test_asset_code,
            price_amount: 50
          },
          { transaction: create_tx }
        )
        listing = result.listing
        await create_tx.commit()
      } catch (e) {
        await create_tx.rollback()
        throw e
      }

      // 3. 直接撤回（没有买家订单）
      const withdraw_tx = await sequelize.transaction()
      let withdraw_result
      try {
        withdraw_result = await MarketListingService.withdrawFungibleAssetListing(
          {
            market_listing_id: listing.market_listing_id,
            seller_user_id: test_seller.user_id
          },
          { transaction: withdraw_tx }
        )
        await withdraw_tx.commit()
      } catch (e) {
        await withdraw_tx.rollback()
        throw e
      }

      // 4. 验证
      expect(withdraw_result.listing.status).toBe('withdrawn')
      expect(withdraw_result.cancelled_orders).toBeDefined()
      expect(withdraw_result.cancelled_orders.length).toBe(0) // 没有订单需要取消
      console.log('✅ 无买家订单时撤回正常')
    })
  })
})
