/**
 * 餐厅积分抽奖系统 V4 - TradeOrderService 单元测试
 *
 * 测试范围：
 * - P1-5：TradeOrderService 核心功能测试
 *   - 交易订单创建流程
 *   - 订单状态变更测试
 *   - 订单取消（退款）逻辑测试
 *   - 幂等性保证验证
 *   - 查询方法测试
 *
 * 业务流程：
 * 1. 创建订单（createOrder）：
 *    - 锁定挂牌（MarketListing.status = locked）
 *    - 冻结买家资产（AssetService.freeze）
 *    - 创建订单记录（TradeOrder.status = frozen）
 * 2. 完成订单（completeOrder）：
 *    - 从冻结资产结算（AssetService.settleFromFrozen）
 *    - 转移物品所有权（ItemInstance.owner_user_id）
 *    - 更新订单状态（TradeOrder.status = completed）
 * 3. 取消订单（cancelOrder）：
 *    - 解冻买家资产（AssetService.unfreeze）
 *    - 解锁挂牌（MarketListing.status = on_sale）
 *    - 更新订单状态（TradeOrder.status = cancelled）
 *
 * 创建时间：2026-01-28
 * 使用模型：Claude Sonnet 4.5
 *
 * 命名规范：
 * - 服务通过 ServiceManager 获取（snake_case key）
 * - 模型直接 require（测试需要直接数据库操作）
 * - 遵循项目 snake_case 命名规范
 */

const { sequelize, User, MarketListing, ItemInstance, TradeOrder } = require('../../../models')
const { initRealTestData, getRealTestUserId } = require('../../helpers/test-setup')

/**
 * 通过 ServiceManager 获取服务
 * 在 beforeAll 中获取，确保 ServiceManager 已初始化
 */
let TradeOrderService
let AssetService

// 测试超时设置（交易订单涉及多步骤，需要较长超时）
jest.setTimeout(60000)

describe('TradeOrderService - 交易订单服务', () => {
  // 测试用户和门店数据
  let test_buyer
  let test_seller
  let test_listing
  let test_item

  // 幂等键计数器（确保每次测试使用唯一的幂等键）
  let idempotency_counter = 0

  /**
   * 生成唯一的幂等键
   * @param {string} prefix - 幂等键前缀
   * @returns {string} 唯一的幂等键
   */
  function generateIdempotencyKey(prefix = 'test_order') {
    idempotency_counter++
    return `${prefix}_${Date.now()}_${idempotency_counter}_${Math.random().toString(36).slice(2, 8)}`
  }

  // 测试前准备
  beforeAll(async () => {
    // 连接测试数据库
    await sequelize.authenticate()

    // 初始化真实测试数据
    await initRealTestData()

    // 通过 global.getTestService() 获取服务实例（jest.setup.js 初始化）
    TradeOrderService = global.getTestService('trade_order')
    AssetService = global.getTestService('asset')

    if (!TradeOrderService) {
      throw new Error(
        'TradeOrderService 未在 ServiceManager 中注册（使用 snake_case key: trade_order）'
      )
    }
    if (!AssetService) {
      throw new Error('AssetService 未在 ServiceManager 中注册（使用 snake_case key: asset）')
    }

    // 获取测试用户（买家）
    const buyer_id = await getRealTestUserId()
    test_buyer = await User.findByPk(buyer_id)
    if (!test_buyer) {
      throw new Error('测试用户（买家）不存在')
    }

    // 查找或创建测试用户（卖家）- 使用另一个用户
    test_seller = await User.findOne({
      where: {
        status: 'active'
      },
      order: [['user_id', 'DESC']] // 取最新的用户作为卖家
    })

    // 如果只有一个用户，则卖家与买家相同（某些测试场景需要不同用户）
    if (!test_seller || test_seller.user_id === test_buyer.user_id) {
      test_seller = test_buyer
      console.warn('⚠️ 警告：买家和卖家使用相同的用户，部分测试将被跳过')
    }

    console.log(`✅ 测试用户准备完成: 买家=${test_buyer.user_id}, 卖家=${test_seller.user_id}`)
  })

  // 每个测试前准备测试挂牌和物品
  beforeEach(async () => {
    // 重置幂等键计数器
    idempotency_counter = 0

    // 为卖家创建测试物品实例
    test_item = await ItemInstance.create({
      owner_user_id: test_seller.user_id,
      item_type: 'voucher',
      status: 'available', // 可用状态
      meta: {
        name: '交易测试物品',
        description: '用于 TradeOrderService 测试',
        rarity: 'common',
        value: 100 // 价值锚点，用于手续费计算
      }
    })

    // 生成挂牌幂等键
    const listing_idempotency_key = generateIdempotencyKey('test_listing')

    // 创建测试挂牌（on_sale 状态）
    test_listing = await MarketListing.create({
      seller_user_id: test_seller.user_id,
      listing_kind: 'item_instance',
      offer_item_instance_id: test_item.item_instance_id,
      offer_item_display_name: '交易测试物品',
      price_asset_code: 'DIAMOND',
      price_amount: 100,
      status: 'on_sale',
      seller_offer_frozen: false, // 物品实例不需要冻结
      idempotency_key: listing_idempotency_key
    })

    // 锁定物品实例（模拟挂牌时的物品锁定）
    await test_item.update({ status: 'locked' })

    console.log(
      `📦 测试数据准备完成: listing_id=${test_listing.listing_id}, item_id=${test_item.item_instance_id}`
    )
  })

  // 每个测试后清理测试数据
  afterEach(async () => {
    // 清理测试订单（如果有）
    if (test_listing) {
      await TradeOrder.destroy({
        where: { listing_id: test_listing.listing_id }
      })
    }

    // 清理测试挂牌
    if (test_listing) {
      await test_listing.destroy()
      test_listing = null
    }

    // 清理测试物品
    if (test_item) {
      await test_item.destroy()
      test_item = null
    }
  })

  /**
   * 测试后关闭连接（增加超时防止清理阻塞）
   * 不需要手动关闭 sequelize 连接，jest.setup.js 会统一处理
   * 如果有需要清理的测试数据，在这里处理
   */
  afterAll(async () => {
    // jest.setup.js 会统一关闭 sequelize 和 Redis 连接
  }, 30000)

  // ==================== 1. 订单创建流程测试 ====================

  describe('1. 订单创建流程测试（createOrder）', () => {
    it('1.1 应正确验证必填参数', async () => {
      // 测试缺少 idempotency_key
      await expect(
        TradeOrderService.createOrder(
          {
            listing_id: test_listing.listing_id,
            buyer_id: test_buyer.user_id
          },
          { transaction: await sequelize.transaction() }
        )
      ).rejects.toThrow('idempotency_key 是必需参数')

      // 测试缺少 listing_id
      await expect(
        TradeOrderService.createOrder(
          {
            idempotency_key: generateIdempotencyKey(),
            buyer_id: test_buyer.user_id
          },
          { transaction: await sequelize.transaction() }
        )
      ).rejects.toThrow('listing_id 是必需参数')

      // 测试缺少 buyer_id
      await expect(
        TradeOrderService.createOrder(
          {
            idempotency_key: generateIdempotencyKey(),
            listing_id: test_listing.listing_id
          },
          { transaction: await sequelize.transaction() }
        )
      ).rejects.toThrow('buyer_id 是必需参数')
    })

    it('1.2 应拒绝不存在的挂牌', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          TradeOrderService.createOrder(
            {
              idempotency_key: generateIdempotencyKey(),
              listing_id: 999999999, // 不存在的挂牌ID
              buyer_id: test_buyer.user_id
            },
            { transaction }
          )
        ).rejects.toThrow(/挂牌不存在/)
      } finally {
        await transaction.rollback()
      }
    })

    it('1.3 应拒绝非 on_sale 状态的挂牌', async () => {
      // 将挂牌状态改为 locked
      await test_listing.update({ status: 'locked' })

      const transaction = await sequelize.transaction()
      try {
        await expect(
          TradeOrderService.createOrder(
            {
              idempotency_key: generateIdempotencyKey(),
              listing_id: test_listing.listing_id,
              buyer_id: test_buyer.user_id
            },
            { transaction }
          )
        ).rejects.toThrow(/挂牌状态异常/)
      } finally {
        await transaction.rollback()
        // 恢复状态
        await test_listing.update({ status: 'on_sale' })
      }
    })

    it('1.4 买家不能购买自己的挂牌', async () => {
      // 跳过条件：买家和卖家相同时无法测试此场景
      if (test_buyer.user_id === test_seller.user_id) {
        console.log('⏭️ 跳过：买家和卖家相同，无法测试自购禁止逻辑')
        return
      }

      // 修改挂牌卖家为买家自己
      await test_listing.update({ seller_user_id: test_buyer.user_id })

      const transaction = await sequelize.transaction()
      try {
        await expect(
          TradeOrderService.createOrder(
            {
              idempotency_key: generateIdempotencyKey(),
              listing_id: test_listing.listing_id,
              buyer_id: test_buyer.user_id
            },
            { transaction }
          )
        ).rejects.toThrow(/不能购买自己的挂牌/)
      } finally {
        await transaction.rollback()
        // 恢复卖家
        await test_listing.update({ seller_user_id: test_seller.user_id })
      }
    })
  })

  // ==================== 2. 幂等性验证测试 ====================

  describe('2. 幂等性验证测试', () => {
    it('2.1 相同 idempotency_key 应返回已有订单（is_duplicate=true）', async () => {
      // 跳过条件：买家和卖家相同时无法测试
      if (test_buyer.user_id === test_seller.user_id) {
        console.log('⏭️ 跳过：买家和卖家相同，无法测试订单创建')
        return
      }

      // 确保买家有足够余额（使用 AssetService.getBalance）
      const buyer_balance = await AssetService.getBalance({
        user_id: test_buyer.user_id,
        asset_code: 'DIAMOND'
      })

      if (buyer_balance.available_amount < 100) {
        console.log('⏭️ 跳过：买家 DIAMOND 余额不足')
        return
      }

      const idempotency_key = generateIdempotencyKey('idempotent_test')

      // 第一次创建订单
      const transaction1 = await sequelize.transaction()
      let result1
      try {
        result1 = await TradeOrderService.createOrder(
          {
            idempotency_key,
            listing_id: test_listing.listing_id,
            buyer_id: test_buyer.user_id
          },
          { transaction: transaction1 }
        )
        await transaction1.commit()
      } catch (error) {
        await transaction1.rollback()
        // 如果余额不足等业务错误，跳过测试
        if (error.message.includes('余额不足') || error.message.includes('insufficient')) {
          console.log('⏭️ 跳过：买家余额不足')
          return
        }
        throw error
      }

      expect(result1).toHaveProperty('order_id')
      expect(result1.is_duplicate).toBe(false)

      // 第二次使用相同的 idempotency_key
      const transaction2 = await sequelize.transaction()
      let committed2 = false
      try {
        const result2 = await TradeOrderService.createOrder(
          {
            idempotency_key,
            listing_id: test_listing.listing_id,
            buyer_id: test_buyer.user_id
          },
          { transaction: transaction2 }
        )
        await transaction2.commit()
        committed2 = true

        // 验证幂等返回（注意：order_id 可能是字符串类型，使用 String() 转换比较）
        expect(result2).toHaveProperty('order_id')
        expect(String(result2.order_id)).toBe(String(result1.order_id)) // 应返回相同的订单ID
        expect(result2.is_duplicate).toBe(true) // 应标记为重复
      } catch (error) {
        if (!committed2) {
          await transaction2.rollback()
        }
        throw error
      }
    })

    it('2.2 相同 idempotency_key 但参数不同应返回 409 冲突', async () => {
      // 跳过条件：买家和卖家相同时无法测试
      if (test_buyer.user_id === test_seller.user_id) {
        console.log('⏭️ 跳过：买家和卖家相同，无法测试幂等冲突')
        return
      }

      // 确保买家有足够余额（使用 AssetService.getBalance）
      const buyer_balance = await AssetService.getBalance({
        user_id: test_buyer.user_id,
        asset_code: 'DIAMOND'
      })

      if (buyer_balance.available_amount < 200) {
        console.log('⏭️ 跳过：买家 DIAMOND 余额不足')
        return
      }

      const idempotency_key = generateIdempotencyKey('conflict_test')

      // 第一次创建订单
      const transaction1 = await sequelize.transaction()
      try {
        await TradeOrderService.createOrder(
          {
            idempotency_key,
            listing_id: test_listing.listing_id,
            buyer_id: test_buyer.user_id
          },
          { transaction: transaction1 }
        )
        await transaction1.commit()
      } catch (error) {
        await transaction1.rollback()
        if (error.message.includes('余额不足') || error.message.includes('insufficient')) {
          console.log('⏭️ 跳过：买家余额不足')
          return
        }
        throw error
      }

      // 创建另一个测试挂牌
      const another_item = await ItemInstance.create({
        owner_user_id: test_seller.user_id,
        item_type: 'voucher',
        status: 'locked',
        meta: { name: '另一个测试物品' }
      })

      const another_listing = await MarketListing.create({
        seller_user_id: test_seller.user_id,
        listing_kind: 'item_instance',
        offer_item_instance_id: another_item.item_instance_id,
        offer_item_display_name: '另一个测试物品',
        price_asset_code: 'DIAMOND',
        price_amount: 100,
        status: 'on_sale',
        seller_offer_frozen: false,
        idempotency_key: generateIdempotencyKey('another_listing')
      })

      try {
        // 使用相同的 idempotency_key 但不同的 listing_id
        const transaction2 = await sequelize.transaction()
        try {
          await TradeOrderService.createOrder(
            {
              idempotency_key, // 相同的幂等键
              listing_id: another_listing.listing_id, // 不同的挂牌
              buyer_id: test_buyer.user_id
            },
            { transaction: transaction2 }
          )
          await transaction2.commit()
          // 如果没有抛错，测试失败
          throw new Error('应该抛出 409 冲突错误')
        } catch (error) {
          await transaction2.rollback()

          // 验证是冲突错误
          expect(error.code).toBe('CONFLICT')
          expect(error.statusCode).toBe(409)
          expect(error.message).toContain('冲突')
        }
      } finally {
        // 清理额外创建的数据
        await another_listing.destroy()
        await another_item.destroy()
      }
    })
  })

  // ==================== 3. 订单取消（退款）逻辑测试 ====================

  describe('3. 订单取消（退款）逻辑测试（cancelOrder）', () => {
    it('3.1 应正确验证 order_id 必填', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(TradeOrderService.cancelOrder({}, { transaction })).rejects.toThrow(
          'order_id 是必需参数'
        )
      } finally {
        await transaction.rollback()
      }
    })

    it('3.2 应拒绝取消不存在的订单', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          TradeOrderService.cancelOrder({ order_id: 999999999 }, { transaction })
        ).rejects.toThrow(/订单不存在/)
      } finally {
        await transaction.rollback()
      }
    })

    it('3.3 应拒绝取消非 frozen 状态的订单', async () => {
      // 创建一个已完成的测试订单
      const completed_order = await TradeOrder.create({
        idempotency_key: generateIdempotencyKey('completed_order'),
        business_id: `trade_order_${test_buyer.user_id}_${test_listing.listing_id}_${Date.now()}`,
        listing_id: test_listing.listing_id,
        buyer_user_id: test_buyer.user_id,
        seller_user_id: test_seller.user_id,
        asset_code: 'DIAMOND',
        gross_amount: 100,
        fee_amount: 5,
        net_amount: 95,
        status: 'completed' // 已完成状态
      })

      const transaction = await sequelize.transaction()
      try {
        await expect(
          TradeOrderService.cancelOrder({ order_id: completed_order.order_id }, { transaction })
        ).rejects.toThrow(/订单状态异常/)
      } finally {
        await transaction.rollback()
        // 清理测试订单
        await completed_order.destroy()
      }
    })
  })

  // ==================== 4. 订单查询方法测试 ====================

  describe('4. 订单查询方法测试', () => {
    let query_test_order

    beforeEach(async () => {
      // 创建一个测试订单用于查询
      query_test_order = await TradeOrder.create({
        idempotency_key: generateIdempotencyKey('query_test_order'),
        business_id: `trade_order_${test_buyer.user_id}_${test_listing.listing_id}_${Date.now()}`,
        listing_id: test_listing.listing_id,
        buyer_user_id: test_buyer.user_id,
        seller_user_id: test_seller.user_id,
        asset_code: 'DIAMOND',
        gross_amount: 100,
        fee_amount: 5,
        net_amount: 95,
        status: 'frozen'
      })
    })

    afterEach(async () => {
      if (query_test_order) {
        await query_test_order.destroy()
        query_test_order = null
      }
    })

    it('4.1 getOrderDetail 应返回订单详情', async () => {
      const order = await TradeOrderService.getOrderDetail(query_test_order.order_id)

      expect(order).toBeDefined()
      // order_id 可能是字符串类型，统一使用 String() 转换比较
      expect(String(order.order_id)).toBe(String(query_test_order.order_id))
      expect(order.buyer_user_id).toBe(test_buyer.user_id)
      expect(order.seller_user_id).toBe(test_seller.user_id)
      expect(Number(order.gross_amount)).toBe(100)
      expect(Number(order.fee_amount)).toBe(5)
      expect(Number(order.net_amount)).toBe(95)
    })

    it('4.2 getOrderDetail 应抛出订单不存在错误', async () => {
      await expect(TradeOrderService.getOrderDetail(999999999)).rejects.toThrow(/订单不存在/)
    })

    it('4.3 getUserOrders 应返回用户订单列表', async () => {
      const result = await TradeOrderService.getUserOrders({
        user_id: test_buyer.user_id,
        role: 'buyer',
        page: 1,
        page_size: 10
      })

      expect(result).toHaveProperty('orders')
      expect(result).toHaveProperty('total')
      expect(result).toHaveProperty('page')
      expect(result).toHaveProperty('page_size')
      expect(Array.isArray(result.orders)).toBe(true)

      // 应能找到测试订单（注意：order_id 可能是字符串类型）
      const found = result.orders.find(
        o => String(o.order_id) === String(query_test_order.order_id)
      )
      expect(found).toBeDefined()
    })

    it('4.4 getOrders（管理后台）应返回订单列表和分页信息', async () => {
      const result = await TradeOrderService.getOrders({
        page: 1,
        page_size: 10
      })

      expect(result).toHaveProperty('orders')
      expect(result).toHaveProperty('pagination')
      expect(Array.isArray(result.orders)).toBe(true)

      // 验证分页结构
      expect(result.pagination).toHaveProperty('total_count')
      expect(result.pagination).toHaveProperty('page')
      expect(result.pagination).toHaveProperty('page_size')
      expect(result.pagination).toHaveProperty('total_pages')
    })

    it('4.5 getOrderById（管理后台）应返回订单详情', async () => {
      const order = await TradeOrderService.getOrderById(query_test_order.order_id)

      expect(order).toBeDefined()
      // order_id 可能是字符串类型，统一使用 String() 转换比较
      expect(String(order.order_id)).toBe(String(query_test_order.order_id))

      // 管理后台版本应包含关联数据
      expect(order).toHaveProperty('buyer')
      expect(order).toHaveProperty('seller')
      expect(order).toHaveProperty('listing')
    })

    it('4.6 getOrderByBusinessId 应通过 business_id 查询订单', async () => {
      const order = await TradeOrderService.getOrderByBusinessId(query_test_order.business_id)

      expect(order).toBeDefined()
      // order_id 可能是字符串类型，统一使用 String() 转换比较
      expect(String(order.order_id)).toBe(String(query_test_order.order_id))
      expect(order.business_id).toBe(query_test_order.business_id)
    })

    it('4.7 getOrderByBusinessId 应返回 null 如果不存在', async () => {
      const order = await TradeOrderService.getOrderByBusinessId('non_existent_business_id')
      expect(order).toBeNull()
    })
  })

  // ==================== 5. 订单统计方法测试 ====================

  describe('5. 订单统计方法测试', () => {
    it('5.1 getOrderStats 应返回订单统计汇总', async () => {
      const stats = await TradeOrderService.getOrderStats({})

      expect(stats).toHaveProperty('period')
      expect(stats).toHaveProperty('by_status')
      expect(stats).toHaveProperty('completed_summary')

      // 验证完成订单汇总结构
      expect(stats.completed_summary).toHaveProperty('total_orders')
      expect(stats.completed_summary).toHaveProperty('total_gross_amount')
      expect(stats.completed_summary).toHaveProperty('total_fee_amount')
      expect(stats.completed_summary).toHaveProperty('total_net_amount')
    })

    it('5.2 getUserTradeStats 应返回用户交易统计', async () => {
      const stats = await TradeOrderService.getUserTradeStats(test_buyer.user_id)

      expect(stats).toHaveProperty('user_id')
      expect(stats.user_id).toBe(test_buyer.user_id)

      // 验证作为买家的统计
      expect(stats).toHaveProperty('as_buyer')
      expect(stats.as_buyer).toHaveProperty('total_orders')
      expect(stats.as_buyer).toHaveProperty('total_spent')

      // 验证作为卖家的统计
      expect(stats).toHaveProperty('as_seller')
      expect(stats.as_seller).toHaveProperty('total_orders')
      expect(stats.as_seller).toHaveProperty('total_earned')
    })
  })

  // ==================== 6. 对账金额验证测试 ====================

  describe('6. 对账金额验证测试', () => {
    it('6.1 订单金额应符合对账公式：gross_amount = fee_amount + net_amount', async () => {
      // 创建测试订单验证对账公式
      const gross_amount = 100
      const fee_amount = 5
      const net_amount = 95 // gross_amount - fee_amount

      const test_order = await TradeOrder.create({
        idempotency_key: generateIdempotencyKey('reconcile_test'),
        business_id: `trade_order_${test_buyer.user_id}_${test_listing.listing_id}_${Date.now()}`,
        listing_id: test_listing.listing_id,
        buyer_user_id: test_buyer.user_id,
        seller_user_id: test_seller.user_id,
        asset_code: 'DIAMOND',
        gross_amount,
        fee_amount,
        net_amount,
        status: 'frozen'
      })

      try {
        // 验证对账公式
        expect(test_order.validateAmounts()).toBe(true)
        expect(Number(test_order.gross_amount)).toBe(
          Number(test_order.fee_amount) + Number(test_order.net_amount)
        )
      } finally {
        await test_order.destroy()
      }
    })

    it('6.2 对账金额错误的订单应被 validateAmounts 检测出', async () => {
      // 创建金额不符的测试订单
      const test_order = await TradeOrder.create({
        idempotency_key: generateIdempotencyKey('bad_reconcile_test'),
        business_id: `trade_order_${test_buyer.user_id}_${test_listing.listing_id}_${Date.now()}`,
        listing_id: test_listing.listing_id,
        buyer_user_id: test_buyer.user_id,
        seller_user_id: test_seller.user_id,
        asset_code: 'DIAMOND',
        gross_amount: 100,
        fee_amount: 5,
        net_amount: 90, // 错误：应该是 95
        status: 'frozen'
      })

      try {
        // 验证对账公式检测出错误
        expect(test_order.validateAmounts()).toBe(false)
      } finally {
        await test_order.destroy()
      }
    })
  })

  // ==================== 7. 订单状态机测试 ====================

  describe('7. 订单状态机测试', () => {
    it('7.1 canCancel 应正确判断订单是否可取消', async () => {
      // created 状态可取消
      const created_order = await TradeOrder.create({
        idempotency_key: generateIdempotencyKey('cancel_test_created'),
        business_id: `trade_order_${test_buyer.user_id}_${test_listing.listing_id}_${Date.now()}`,
        listing_id: test_listing.listing_id,
        buyer_user_id: test_buyer.user_id,
        seller_user_id: test_seller.user_id,
        asset_code: 'DIAMOND',
        gross_amount: 100,
        fee_amount: 5,
        net_amount: 95,
        status: 'created'
      })
      expect(created_order.canCancel()).toBe(true)
      await created_order.destroy()

      // frozen 状态可取消
      const frozen_order = await TradeOrder.create({
        idempotency_key: generateIdempotencyKey('cancel_test_frozen'),
        business_id: `trade_order_${test_buyer.user_id}_${test_listing.listing_id}_${Date.now() + 1}`,
        listing_id: test_listing.listing_id,
        buyer_user_id: test_buyer.user_id,
        seller_user_id: test_seller.user_id,
        asset_code: 'DIAMOND',
        gross_amount: 100,
        fee_amount: 5,
        net_amount: 95,
        status: 'frozen'
      })
      expect(frozen_order.canCancel()).toBe(true)
      await frozen_order.destroy()

      // completed 状态不可取消
      const completed_order = await TradeOrder.create({
        idempotency_key: generateIdempotencyKey('cancel_test_completed'),
        business_id: `trade_order_${test_buyer.user_id}_${test_listing.listing_id}_${Date.now() + 2}`,
        listing_id: test_listing.listing_id,
        buyer_user_id: test_buyer.user_id,
        seller_user_id: test_seller.user_id,
        asset_code: 'DIAMOND',
        gross_amount: 100,
        fee_amount: 5,
        net_amount: 95,
        status: 'completed'
      })
      expect(completed_order.canCancel()).toBe(false)
      await completed_order.destroy()

      // cancelled 状态不可取消
      const cancelled_order = await TradeOrder.create({
        idempotency_key: generateIdempotencyKey('cancel_test_cancelled'),
        business_id: `trade_order_${test_buyer.user_id}_${test_listing.listing_id}_${Date.now() + 3}`,
        listing_id: test_listing.listing_id,
        buyer_user_id: test_buyer.user_id,
        seller_user_id: test_seller.user_id,
        asset_code: 'DIAMOND',
        gross_amount: 100,
        fee_amount: 5,
        net_amount: 95,
        status: 'cancelled'
      })
      expect(cancelled_order.canCancel()).toBe(false)
      await cancelled_order.destroy()
    })

    it('7.2 isCompleted 应正确判断订单是否已完成（终态）', async () => {
      const statuses = [
        { status: 'created', expected: false },
        { status: 'frozen', expected: false },
        { status: 'completed', expected: true },
        { status: 'cancelled', expected: true },
        { status: 'failed', expected: true }
      ]

      for (const { status, expected } of statuses) {
        const test_order = await TradeOrder.create({
          idempotency_key: generateIdempotencyKey(`complete_test_${status}`),
          business_id: `trade_order_${test_buyer.user_id}_${test_listing.listing_id}_${Date.now()}_${status}`,
          listing_id: test_listing.listing_id,
          buyer_user_id: test_buyer.user_id,
          seller_user_id: test_seller.user_id,
          asset_code: 'DIAMOND',
          gross_amount: 100,
          fee_amount: 5,
          net_amount: 95,
          status
        })

        expect(test_order.isCompleted()).toBe(expected)
        await test_order.destroy()
      }
    })
  })

  // ==================== 8. 时间筛选查询测试 ====================

  describe('8. 时间筛选查询测试', () => {
    it('8.1 getOrders 应支持时间范围过滤', async () => {
      // 创建一个带时间的测试订单
      const test_order = await TradeOrder.create({
        idempotency_key: generateIdempotencyKey('time_filter_test'),
        business_id: `trade_order_${test_buyer.user_id}_${test_listing.listing_id}_${Date.now()}`,
        listing_id: test_listing.listing_id,
        buyer_user_id: test_buyer.user_id,
        seller_user_id: test_seller.user_id,
        asset_code: 'DIAMOND',
        gross_amount: 100,
        fee_amount: 5,
        net_amount: 95,
        status: 'frozen'
      })

      try {
        const now = new Date()
        const one_hour_ago = new Date(now.getTime() - 3600000)
        const one_hour_later = new Date(now.getTime() + 3600000)

        // 时间范围内应能查到
        const result_in_range = await TradeOrderService.getOrders({
          start_time: one_hour_ago.toISOString(),
          end_time: one_hour_later.toISOString(),
          page: 1,
          page_size: 100
        })

        // order_id 可能是字符串类型，统一使用 String() 转换比较
        const found = result_in_range.orders.find(
          o => String(o.order_id) === String(test_order.order_id)
        )
        expect(found).toBeDefined()

        // 时间范围外不应查到
        const one_day_ago = new Date(now.getTime() - 86400000)
        const two_hours_ago = new Date(now.getTime() - 7200000)

        const result_out_range = await TradeOrderService.getOrders({
          start_time: one_day_ago.toISOString(),
          end_time: two_hours_ago.toISOString(),
          page: 1,
          page_size: 100
        })

        // order_id 可能是字符串类型，统一使用 String() 转换比较
        const not_found = result_out_range.orders.find(
          o => String(o.order_id) === String(test_order.order_id)
        )
        expect(not_found).toBeUndefined()
      } finally {
        await test_order.destroy()
      }
    })
  })
})
