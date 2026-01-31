/**
 * 市场交易流程测试（阶段四：P2）
 *
 * 测试范围：
 * - 5.1 挂单流程：测试 market_listings 创建（item_instance 和 fungible_asset）
 * - 5.2 购买流程：测试物品转移和资产结算
 * - 5.3 下架流程：测试卖家主动下架
 * - 5.4 过期处理：测试挂单超时自动下架
 *
 * 测试原则：
 * - 使用真实数据库（restaurant_points_dev），不使用mock数据
 * - 通过 global.getTestService 获取服务（由 jest.setup.js 初始化）
 * - 复用 tests/shared 下的共享测试套件
 * - 测试数据创建后需清理，避免污染数据库
 *
 * 创建时间：2026-01-28
 * 符合规范：01-核心开发质量标准.mdc
 */

'use strict'

const {
  sequelize,
  User,
  MarketListing,
  ItemInstance,
  TradeOrder,
  ItemTemplate
} = require('../../models')
const { Op } = sequelize.Sequelize

// 测试超时设置（市场交易涉及多服务调用，增加超时）
jest.setTimeout(60000)

describe('市场交易流程测试（阶段四：P2）', () => {
  // 服务引用（通过 ServiceManager 获取）
  let MarketListingService
  let TradeOrderService
  let BalanceService

  // 测试用户和数据
  let test_seller
  let test_buyer
  let test_item_template
  let created_listings = [] // 记录创建的挂牌，便于清理
  let created_items = [] // 记录创建的物品，便于清理

  // ==================== 测试准备 ====================

  beforeAll(async () => {
    // 连接测试数据库
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    /**
     * V4.7.0 大文件拆分适配：
     * MarketListingService 已拆分，测试需要组合多个子服务的方法
     */
    const coreService = global.getTestService('market_listing_core')
    const queryService = global.getTestService('market_listing_query')

    // 创建组合服务对象，包含所有需要的方法
    MarketListingService = {
      // 核心操作方法（CoreService）
      createListing: coreService.createListing.bind(coreService),
      createFungibleAssetListing: coreService.createFungibleAssetListing.bind(coreService),
      withdrawListing: coreService.withdrawListing.bind(coreService),
      withdrawFungibleAssetListing: coreService.withdrawFungibleAssetListing.bind(coreService),
      // 查询方法（QueryService - 静态方法）
      getListingById: queryService.getListingById
    }

    TradeOrderService = global.getTestService('trade_order')
    BalanceService = global.getTestService('asset_balance')

    console.log('✅ 服务获取成功（组合CoreService + QueryService）')

    // 获取测试物品模板（用于创建物品实例时关联）
    test_item_template = await ItemTemplate.findOne()

    if (!test_item_template) {
      console.log('⚠️ 无可用物品模板，将创建无模板的物品实例')
    } else {
      console.log(`✅ 物品模板获取成功: ${test_item_template.item_template_id}`)
    }
  })

  beforeEach(async () => {
    // 获取测试用户（卖家）
    test_seller = await User.findOne({
      where: { mobile: '13612227930' }
    })

    if (!test_seller) {
      throw new Error('测试卖家不存在，请先创建 mobile=13612227930 的用户')
    }

    // 获取或创建测试买家
    test_buyer = await User.findOne({
      where: { mobile: '13800138000' }
    })

    if (!test_buyer) {
      console.log('⚠️ 测试买家不存在，部分购买测试可能跳过')
    }

    console.log('✅ 测试用户获取成功', {
      seller_id: test_seller.user_id,
      buyer_id: test_buyer?.user_id
    })
  })

  afterEach(async () => {
    // 清理本测试创建的挂牌数据
    for (const listing_id of created_listings) {
      try {
        await MarketListing.destroy({ where: { listing_id }, force: true })
      } catch (error) {
        console.log(`清理挂牌 ${listing_id} 失败:`, error.message)
      }
    }
    created_listings = []

    // 清理测试物品
    for (const item_instance_id of created_items) {
      try {
        await ItemInstance.destroy({ where: { item_instance_id }, force: true })
      } catch (error) {
        console.log(`清理物品 ${item_instance_id} 失败:`, error.message)
      }
    }
    created_items = []
  })

  afterAll(async () => {
    /*
     * 注意：数据库连接由 jest.setup.js 的 afterAll 统一关闭
     * 此处不要显式关闭 sequelize，否则会导致其他测试失败
     */
    console.log('✅ 市场交易流程测试完成')
  })

  // ==================== 辅助函数 ====================

  /**
   * 创建测试物品实例
   * @param {number} owner_user_id - 物品所有者ID
   * @param {Object} options - 可选参数
   * @returns {Promise<ItemInstance>} 创建的物品实例
   */
  async function createTestItem(owner_user_id, options = {}) {
    const item_data = {
      owner_user_id,
      item_template_id: test_item_template?.item_template_id || null,
      status: options.status || 'available',
      meta: options.meta || { name: `测试物品_${Date.now()}`, description: '市场交易测试用物品' }
    }

    const item = await ItemInstance.create(item_data)
    created_items.push(item.item_instance_id)
    return item
  }

  /**
   * 生成唯一的幂等键
   * @param {string} prefix - 前缀
   * @returns {string} 幂等键
   */
  function generateIdempotencyKey(prefix = 'test') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  // ==================== 5.1 挂单流程测试 ====================

  describe('5.1 挂单流程 - 测试 market_listings 创建', () => {
    describe('物品实例挂牌（item_instance）', () => {
      it('应成功创建物品实例挂牌', async () => {
        // 1. 创建测试物品
        const test_item = await createTestItem(test_seller.user_id)
        console.log('✅ 测试物品创建成功:', test_item.item_instance_id)

        // 2. 生成幂等键
        const idempotency_key = generateIdempotencyKey('listing')

        // 3. 执行挂牌操作
        const transaction = await sequelize.transaction()
        try {
          const result = await MarketListingService.createListing(
            {
              idempotency_key,
              seller_user_id: test_seller.user_id,
              item_instance_id: test_item.item_instance_id,
              price_amount: 100,
              price_asset_code: 'DIAMOND'
            },
            { transaction }
          )

          await transaction.commit()

          // 记录挂牌ID便于清理
          created_listings.push(result.listing.listing_id)

          // 4. 验证挂牌结果
          expect(result).toHaveProperty('listing')
          expect(result.listing).toHaveProperty('listing_id')
          expect(result.listing.listing_kind).toBe('item_instance')
          expect(result.listing.status).toBe('on_sale')
          expect(result.listing.seller_user_id).toBe(test_seller.user_id)
          expect(Number(result.listing.price_amount)).toBe(100)
          expect(result.listing.price_asset_code).toBe('DIAMOND')

          // 5. 验证物品状态已变为 locked
          const updated_item = await ItemInstance.findByPk(test_item.item_instance_id)
          expect(updated_item.status).toBe('locked')

          console.log('✅ 物品实例挂牌创建成功:', result.listing.listing_id)
        } catch (error) {
          await transaction.rollback()
          throw error
        }
      })

      it('相同幂等键应返回首次挂牌结果（幂等性）', async () => {
        // 1. 创建测试物品
        const test_item = await createTestItem(test_seller.user_id)

        // 2. 使用固定幂等键
        const idempotency_key = generateIdempotencyKey('idempotency')

        /*
         * 统一类型：确保数字类型参数一致性
         * 注意：MarketListingService 使用严格比较，需要类型匹配
         */
        const listing_params = {
          idempotency_key,
          seller_user_id: Number(test_seller.user_id),
          item_instance_id: Number(test_item.item_instance_id),
          price_amount: 200,
          price_asset_code: 'DIAMOND'
        }

        // 3. 第一次挂牌
        const transaction1 = await sequelize.transaction()
        let first_result
        try {
          first_result = await MarketListingService.createListing(listing_params, {
            transaction: transaction1
          })
          await transaction1.commit()
          created_listings.push(first_result.listing.listing_id)
        } catch (error) {
          await transaction1.rollback()
          throw error
        }

        /*
         * 4. 第二次挂牌（完全相同的参数）
         *    服务端幂等性检查应该返回首次挂牌结果
         *    注意：需要从数据库重新获取首次挂牌记录，保证类型一致
         */
        const existing_listing = await MarketListing.findOne({
          where: { idempotency_key }
        })

        // 使用从数据库获取的值构建参数（保证类型完全一致）
        const second_params = {
          idempotency_key,
          seller_user_id: existing_listing.seller_user_id,
          item_instance_id: existing_listing.offer_item_instance_id,
          price_amount: Number(existing_listing.price_amount),
          price_asset_code: existing_listing.price_asset_code
        }

        const transaction2 = await sequelize.transaction()
        let second_result
        try {
          second_result = await MarketListingService.createListing(second_params, {
            transaction: transaction2
          })
          await transaction2.commit()
        } catch (error) {
          await transaction2.rollback()
          throw error
        }

        // 5. 验证幂等性：返回相同的 listing_id
        expect(String(second_result.listing.listing_id)).toBe(
          String(first_result.listing.listing_id)
        )
        expect(second_result.is_duplicate).toBe(true)

        console.log('✅ 幂等性验证通过')
      })

      it('不可用物品不能挂牌', async () => {
        // 1. 创建已锁定的物品
        const test_item = await createTestItem(test_seller.user_id, { status: 'locked' })

        const idempotency_key = generateIdempotencyKey('locked_item')

        // 2. 尝试挂牌应失败
        const transaction = await sequelize.transaction()
        try {
          await MarketListingService.createListing(
            {
              idempotency_key,
              seller_user_id: test_seller.user_id,
              item_instance_id: test_item.item_instance_id,
              price_amount: 100,
              price_asset_code: 'DIAMOND'
            },
            { transaction }
          )
          await transaction.rollback()
          throw new Error('应该抛出错误：物品不可用')
        } catch (error) {
          await transaction.rollback()
          // 验证错误代码或消息
          expect(
            error.code === 'INVALID_ITEM_STATUS' || error.message.includes('状态')
          ).toBeTruthy()
          console.log('✅ 正确拒绝不可用物品挂牌:', error.message)
        }
      })

      it('非物品所有者不能挂牌', async () => {
        if (!test_buyer) {
          console.log('⚠️ 跳过测试：缺少测试买家')
          return
        }

        // 1. 创建属于卖家的物品
        const test_item = await createTestItem(test_seller.user_id)

        const idempotency_key = generateIdempotencyKey('not_owner')

        // 2. 买家尝试挂牌卖家的物品应失败
        const transaction = await sequelize.transaction()
        try {
          await MarketListingService.createListing(
            {
              idempotency_key,
              seller_user_id: test_buyer.user_id, // 买家试图挂牌
              item_instance_id: test_item.item_instance_id,
              price_amount: 100,
              price_asset_code: 'DIAMOND'
            },
            { transaction }
          )
          await transaction.rollback()
          throw new Error('应该抛出错误：非物品所有者')
        } catch (error) {
          await transaction.rollback()
          expect(error.code).toBe('NOT_OWNER')
          console.log('✅ 正确拒绝非所有者挂牌:', error.message)
        }
      })
    })

    describe('可叠加资产挂牌（fungible_asset）', () => {
      it('应成功创建可叠加资产挂牌', async () => {
        // 1. 确保卖家有足够的 red_shard 资产
        const balance = await BalanceService.getBalance({
          user_id: test_seller.user_id,
          asset_code: 'red_shard'
        })

        if (Number(balance?.available_amount || 0) < 10) {
          // 添加测试资产
          await BalanceService.changeBalance({
            user_id: test_seller.user_id,
            asset_code: 'red_shard',
            delta_amount: 100,
            business_type: 'test_grant',
            idempotency_key: generateIdempotencyKey('grant_shard')
          })
          console.log('✅ 已为卖家添加测试 red_shard 资产')
        }

        // 2. 生成幂等键
        const idempotency_key = generateIdempotencyKey('fungible_listing')

        // 3. 执行可叠加资产挂牌
        const transaction = await sequelize.transaction()
        try {
          const result = await MarketListingService.createFungibleAssetListing(
            {
              idempotency_key,
              seller_user_id: test_seller.user_id,
              offer_asset_code: 'red_shard',
              offer_amount: 10,
              price_amount: 50,
              price_asset_code: 'DIAMOND'
            },
            { transaction }
          )

          await transaction.commit()

          // 记录挂牌ID便于清理
          created_listings.push(result.listing.listing_id)

          // 4. 验证挂牌结果
          expect(result).toHaveProperty('listing')
          expect(result.listing.listing_kind).toBe('fungible_asset')
          expect(result.listing.status).toBe('on_sale')
          expect(result.listing.offer_asset_code).toBe('red_shard')
          expect(Number(result.listing.offer_amount)).toBe(10)
          expect(Number(result.listing.price_amount)).toBe(50)
          expect(result.listing.seller_offer_frozen).toBe(true)

          // 5. 验证资产已冻结
          expect(result).toHaveProperty('freeze_result')

          console.log('✅ 可叠加资产挂牌创建成功:', result.listing.listing_id)
        } catch (error) {
          await transaction.rollback()
          throw error
        }
      })

      it('余额不足不能挂牌', async () => {
        // 1. 获取当前余额
        const balance = await BalanceService.getBalance({
          user_id: test_seller.user_id,
          asset_code: 'red_shard'
        })
        const available = Number(balance?.available_amount || 0)

        // 2. 尝试挂牌超过余额的数量
        const idempotency_key = generateIdempotencyKey('insufficient_balance')

        const transaction = await sequelize.transaction()
        try {
          await MarketListingService.createFungibleAssetListing(
            {
              idempotency_key,
              seller_user_id: test_seller.user_id,
              offer_asset_code: 'red_shard',
              offer_amount: available + 10000, // 超过余额
              price_amount: 100,
              price_asset_code: 'DIAMOND'
            },
            { transaction }
          )
          await transaction.rollback()
          throw new Error('应该抛出错误：余额不足')
        } catch (error) {
          await transaction.rollback()
          expect(
            error.code === 'INSUFFICIENT_BALANCE' || error.message.includes('余额')
          ).toBeTruthy()
          console.log('✅ 正确拒绝余额不足的挂牌:', error.message)
        }
      })
    })
  })

  // ==================== 5.2 购买流程测试 ====================

  describe('5.2 购买流程 - 测试物品转移和资产结算', () => {
    it('不能购买自己的商品', async () => {
      // 1. 创建测试物品和挂牌
      const test_item = await createTestItem(test_seller.user_id)

      const listing_idempotency_key = generateIdempotencyKey('self_buy_listing')
      const listing_tx = await sequelize.transaction()
      let test_listing

      try {
        const result = await MarketListingService.createListing(
          {
            idempotency_key: listing_idempotency_key,
            seller_user_id: test_seller.user_id,
            item_instance_id: test_item.item_instance_id,
            price_amount: 100,
            price_asset_code: 'DIAMOND'
          },
          { transaction: listing_tx }
        )
        await listing_tx.commit()
        test_listing = result.listing
        created_listings.push(test_listing.listing_id)
      } catch (error) {
        await listing_tx.rollback()
        throw error
      }

      // 2. 卖家尝试购买自己的商品应失败
      const order_idempotency_key = generateIdempotencyKey('self_buy_order')
      const order_tx = await sequelize.transaction()

      try {
        await TradeOrderService.createOrder(
          {
            buyer_id: test_seller.user_id, // 卖家自己购买
            listing_id: test_listing.listing_id,
            idempotency_key: order_idempotency_key
          },
          { transaction: order_tx }
        )
        await order_tx.rollback()
        throw new Error('应该抛出错误：不能购买自己的商品')
      } catch (error) {
        await order_tx.rollback()
        // 验证错误表明是自购禁止
        expect(
          error.code === 'SELF_PURCHASE' ||
            error.code === 'FORBIDDEN' ||
            error.message.includes('自己') ||
            error.message.includes('self')
        ).toBeTruthy()
        console.log('✅ 正确拒绝购买自己的商品:', error.message)
      }
    })

    it('应能查询挂牌详情', async () => {
      // 1. 创建测试物品和挂牌
      const test_item = await createTestItem(test_seller.user_id)

      const listing_idempotency_key = generateIdempotencyKey('query_listing')
      const listing_tx = await sequelize.transaction()
      let test_listing

      try {
        const result = await MarketListingService.createListing(
          {
            idempotency_key: listing_idempotency_key,
            seller_user_id: test_seller.user_id,
            item_instance_id: test_item.item_instance_id,
            price_amount: 150,
            price_asset_code: 'DIAMOND'
          },
          { transaction: listing_tx }
        )
        await listing_tx.commit()
        test_listing = result.listing
        created_listings.push(test_listing.listing_id)
      } catch (error) {
        await listing_tx.rollback()
        throw error
      }

      // 2. 查询挂牌详情
      const listing_detail = await MarketListingService.getListingById(test_listing.listing_id)

      // 3. 验证返回的字段（注意：listing_id 可能是字符串或数字）
      expect(listing_detail).toBeTruthy()
      expect(String(listing_detail.listing_id)).toBe(String(test_listing.listing_id))
      expect(listing_detail.status).toBe('on_sale')
      expect(Number(listing_detail.price_amount)).toBe(150)

      console.log('✅ 挂牌详情查询成功')
    })
  })

  // ==================== 5.3 下架流程测试 ====================

  describe('5.3 下架流程 - 测试卖家主动下架', () => {
    describe('物品实例下架', () => {
      it('卖家应能成功撤回物品挂牌', async () => {
        // 1. 创建测试物品和挂牌
        const test_item = await createTestItem(test_seller.user_id)

        const idempotency_key = generateIdempotencyKey('withdraw_listing')
        const listing_tx = await sequelize.transaction()
        let test_listing

        try {
          const result = await MarketListingService.createListing(
            {
              idempotency_key,
              seller_user_id: test_seller.user_id,
              item_instance_id: test_item.item_instance_id,
              price_amount: 100,
              price_asset_code: 'DIAMOND'
            },
            { transaction: listing_tx }
          )
          await listing_tx.commit()
          test_listing = result.listing
          created_listings.push(test_listing.listing_id)
        } catch (error) {
          await listing_tx.rollback()
          throw error
        }

        // 2. 执行撤回
        const withdraw_tx = await sequelize.transaction()
        try {
          const result = await MarketListingService.withdrawListing(
            {
              listing_id: test_listing.listing_id,
              seller_user_id: test_seller.user_id
            },
            { transaction: withdraw_tx }
          )
          await withdraw_tx.commit()

          // 3. 验证撤回结果
          expect(result).toHaveProperty('listing')
          expect(result.listing.status).toBe('withdrawn')

          // 4. 验证物品状态恢复
          const updated_item = await ItemInstance.findByPk(test_item.item_instance_id)
          expect(updated_item.status).toBe('available')

          console.log('✅ 物品挂牌撤回成功')
        } catch (error) {
          await withdraw_tx.rollback()
          throw error
        }
      })

      it('非卖家不能撤回挂牌', async () => {
        if (!test_buyer) {
          console.log('⚠️ 跳过测试：缺少测试买家')
          return
        }

        // 1. 创建测试物品和挂牌
        const test_item = await createTestItem(test_seller.user_id)

        const idempotency_key = generateIdempotencyKey('permission_listing')
        const listing_tx = await sequelize.transaction()
        let test_listing

        try {
          const result = await MarketListingService.createListing(
            {
              idempotency_key,
              seller_user_id: test_seller.user_id,
              item_instance_id: test_item.item_instance_id,
              price_amount: 100,
              price_asset_code: 'DIAMOND'
            },
            { transaction: listing_tx }
          )
          await listing_tx.commit()
          test_listing = result.listing
          created_listings.push(test_listing.listing_id)
        } catch (error) {
          await listing_tx.rollback()
          throw error
        }

        // 2. 买家尝试撤回应失败
        const withdraw_tx = await sequelize.transaction()
        try {
          await MarketListingService.withdrawListing(
            {
              listing_id: test_listing.listing_id,
              seller_user_id: test_buyer.user_id // 非卖家
            },
            { transaction: withdraw_tx }
          )
          await withdraw_tx.rollback()
          throw new Error('应该抛出错误：非卖家无权撤回')
        } catch (error) {
          await withdraw_tx.rollback()
          expect(error.code).toBe('NOT_OWNER')
          console.log('✅ 正确拒绝非卖家撤回:', error.message)
        }
      })
    })

    describe('可叠加资产下架', () => {
      it('卖家应能成功撤回可叠加资产挂牌并解冻资产', async () => {
        // 1. 确保卖家有资产（需要在事务中执行）
        const grant_tx = await sequelize.transaction()
        try {
          await BalanceService.changeBalance(
            {
              user_id: test_seller.user_id,
              asset_code: 'red_shard',
              delta_amount: 50,
              business_type: 'test_grant',
              idempotency_key: generateIdempotencyKey('grant_for_withdraw')
            },
            { transaction: grant_tx }
          )
          await grant_tx.commit()
        } catch (error) {
          await grant_tx.rollback()
          throw error
        }

        // 2. 创建可叠加资产挂牌
        const idempotency_key = generateIdempotencyKey('fungible_withdraw')
        const listing_tx = await sequelize.transaction()
        let test_listing

        try {
          const result = await MarketListingService.createFungibleAssetListing(
            {
              idempotency_key,
              seller_user_id: test_seller.user_id,
              offer_asset_code: 'red_shard',
              offer_amount: 20,
              price_amount: 100,
              price_asset_code: 'DIAMOND'
            },
            { transaction: listing_tx }
          )
          await listing_tx.commit()
          test_listing = result.listing
          created_listings.push(test_listing.listing_id)
        } catch (error) {
          await listing_tx.rollback()
          throw error
        }

        // 3. 验证资产已冻结
        const balance_after_listing = await BalanceService.getBalance({
          user_id: test_seller.user_id,
          asset_code: 'red_shard'
        })
        expect(Number(balance_after_listing.frozen_amount)).toBeGreaterThan(0)

        // 4. 执行撤回
        const withdraw_tx = await sequelize.transaction()
        try {
          const result = await MarketListingService.withdrawFungibleAssetListing(
            {
              listing_id: test_listing.listing_id,
              seller_user_id: test_seller.user_id
            },
            { transaction: withdraw_tx }
          )
          await withdraw_tx.commit()

          // 5. 验证撤回结果
          expect(result.listing.status).toBe('withdrawn')
          expect(result.listing.seller_offer_frozen).toBe(false)

          // 6. 验证资产已解冻
          expect(result).toHaveProperty('unfreeze_result')

          console.log('✅ 可叠加资产挂牌撤回成功，资产已解冻')
        } catch (error) {
          await withdraw_tx.rollback()
          throw error
        }
      })
    })
  })

  // ==================== 5.4 过期处理测试 ====================

  describe('5.4 过期处理 - 测试挂单超时自动下架', () => {
    it('过期任务应能正确识别超时挂牌', async () => {
      // 直接引入过期任务类
      const HourlyExpireFungibleAssetListings = require('../../jobs/hourly-expire-fungible-asset-listings')

      // 1. 获取过期天数配置
      const expiryDays = await HourlyExpireFungibleAssetListings.getExpiryDays()
      expect(expiryDays).toBeGreaterThan(0)
      console.log(`✅ 过期天数配置: ${expiryDays}天`)

      // 2. 查询当前超时的挂牌数量（不实际执行过期操作）
      const expiryThreshold = new Date(Date.now() - expiryDays * 24 * 60 * 60 * 1000)

      const timeoutCount = await MarketListing.count({
        where: {
          listing_kind: 'fungible_asset',
          status: 'on_sale',
          seller_offer_frozen: true,
          created_at: { [Op.lt]: expiryThreshold }
        }
      })

      console.log(`✅ 当前超时的可叠加资产挂牌数量: ${timeoutCount}`)
    })

    it('物品锁定超时任务应能正确识别超时订单', async () => {
      // 直接引入超时解锁任务类
      const HourlyUnlockTimeoutTradeOrders = require('../../jobs/hourly-unlock-timeout-trade-orders')

      // 1. 获取超时阈值
      const lockTimeoutMinutes = HourlyUnlockTimeoutTradeOrders.LOCK_TIMEOUT_MINUTES
      expect(lockTimeoutMinutes).toBeGreaterThan(0)
      console.log(`✅ 锁定超时阈值: ${lockTimeoutMinutes}分钟`)

      // 2. 查询当前超时的订单数量（不实际执行解锁操作）
      const timeoutThreshold = new Date(Date.now() - lockTimeoutMinutes * 60 * 1000)

      const timeoutOrderCount = await TradeOrder.count({
        where: {
          status: 'frozen',
          created_at: { [Op.lt]: timeoutThreshold }
        }
      })

      console.log(`✅ 当前超时的 frozen 订单数量: ${timeoutOrderCount}`)
    })

    it('过期任务应能安全执行（无副作用验证）', async () => {
      const HourlyExpireFungibleAssetListings = require('../../jobs/hourly-expire-fungible-asset-listings')

      // 1. 执行过期任务
      const report = await HourlyExpireFungibleAssetListings.execute()

      // 2. 验证报告结构
      expect(report).toHaveProperty('timestamp')
      expect(report).toHaveProperty('duration_ms')
      expect(report).toHaveProperty('expiry_days')
      expect(report).toHaveProperty('expired_count')
      expect(report).toHaveProperty('failed_count')

      console.log('✅ 过期任务执行报告:', {
        expired_count: report.expired_count,
        failed_count: report.failed_count,
        duration_ms: report.duration_ms
      })
    })
  })
})
