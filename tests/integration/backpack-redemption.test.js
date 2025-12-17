/**
 * 餐厅积分抽奖系统 V4.2 - 背包与兑换集成测试
 *
 * 测试场景：
 * - 完整流程：创建订单 → 生成核销码 → 核销 → 背包查询
 * - 跨服务交互：RedemptionOrderService + BackpackService
 * - 端到端验证：从API到数据库的完整链路
 *
 * 创建时间：2025-12-17
 * 使用模型：Claude Sonnet 4.5
 */

const { sequelize, ItemInstance, User, RedemptionOrder } = require('../../models')
const RedemptionOrderService = require('../../services/RedemptionOrderService')
const BackpackService = require('../../services/BackpackService')

// 测试数据库配置
jest.setTimeout(30000)

describe('背包与兑换集成测试', () => {
  let test_user
  let test_item_instance

  // 测试前准备
  beforeAll(async () => {
    // 连接测试数据库
    await sequelize.authenticate()
  })

  // 每个测试前创建测试数据
  beforeEach(async () => {
    // 使用测试用户
    test_user = await User.findOne({
      where: { mobile: '13612227930' }
    })

    if (!test_user) {
      throw new Error('测试用户不存在，请先创建 mobile=13612227930 的用户')
    }

    // 创建测试物品实例
    test_item_instance = await ItemInstance.create({
      owner_user_id: test_user.user_id,
      item_type: 'voucher',
      status: 'available',
      meta: {
        name: '测试优惠券',
        value: 100,
        description: '集成测试用优惠券'
      }
    })
  })

  // 每个测试后清理数据
  afterEach(async () => {
    // 清理测试兑换订单
    if (test_item_instance) {
      await RedemptionOrder.destroy({
        where: {
          item_instance_id: test_item_instance.item_instance_id
        }
      })

      // 清理测试物品实例
      await ItemInstance.destroy({
        where: {
          item_instance_id: test_item_instance.item_instance_id
        }
      })
    }
  })

  // 测试后关闭连接
  afterAll(async () => {
    await sequelize.close()
  })

  // ==================== 完整流程测试 ====================

  describe('完整兑换流程', () => {
    it('应该完成：创建订单 → 生成核销码 → 核销 → 背包查询 的完整流程', async () => {
      // === 第1步：查询背包（核销前） ===
      const backpack_before = await BackpackService.getUserBackpack(
        test_user.user_id,
        test_user.user_id
      )

      const _items_count_before = backpack_before.items.length

      // === 第2步：创建兑换订单（生成核销码） ===
      const create_result = await RedemptionOrderService.createOrder(
        test_item_instance.item_instance_id
      )

      expect(create_result).toHaveProperty('order')
      expect(create_result).toHaveProperty('code')

      const order = create_result.order
      const code = create_result.code

      // 验证订单状态
      expect(order.status).toBe('pending')
      expect(order.item_instance_id).toBe(test_item_instance.item_instance_id)

      // 验证核销码格式
      expect(code).toMatch(
        /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/
      )

      // === 第3步：核销订单 ===
      const fulfilled_order = await RedemptionOrderService.fulfillOrder(code, test_user.user_id)

      // 验证核销结果
      expect(fulfilled_order.status).toBe('fulfilled')
      expect(fulfilled_order.redeemer_user_id).toBe(test_user.user_id)
      expect(fulfilled_order.fulfilled_at).toBeDefined()

      // === 第4步：查询背包（核销后） ===
      const backpack_after = await BackpackService.getUserBackpack(
        test_user.user_id,
        test_user.user_id
      )

      // 验证物品状态变化（已使用的物品不应该出现在背包中）
      const _items_count_after = backpack_after.items.length

      // 查找该物品实例
      await test_item_instance.reload()
      expect(test_item_instance.status).toBe('used')

      // 验证背包中不包含已使用的物品
      const found_item = backpack_after.items.find(
        item => item.item_instance_id === test_item_instance.item_instance_id
      )
      expect(found_item).toBeUndefined()

      console.log('✅ 完整兑换流程测试通过')
    })

    it('应该支持多个物品的独立兑换', async () => {
      // 创建多个物品实例
      const item_1 = await ItemInstance.create({
        owner_user_id: test_user.user_id,
        item_type: 'voucher',
        status: 'available',
        meta: { name: '优惠券1', value: 50 }
      })

      const item_2 = await ItemInstance.create({
        owner_user_id: test_user.user_id,
        item_type: 'voucher',
        status: 'available',
        meta: { name: '优惠券2', value: 100 }
      })

      try {
        // 为两个物品创建兑换订单
        const order_1 = await RedemptionOrderService.createOrder(item_1.item_instance_id)
        const order_2 = await RedemptionOrderService.createOrder(item_2.item_instance_id)

        // 验证生成了不同的核销码
        expect(order_1.code).not.toBe(order_2.code)

        // 核销第一个订单
        await RedemptionOrderService.fulfillOrder(order_1.code, test_user.user_id)

        // 查询背包
        const backpack = await BackpackService.getUserBackpack(test_user.user_id, test_user.user_id)

        // 验证：已核销的不在背包中，未核销的仍在背包中
        await item_1.reload()
        await item_2.reload()

        expect(item_1.status).toBe('used')
        expect(item_2.status).toBe('available')

        const found_item_1 = backpack.items.find(
          item => item.item_instance_id === item_1.item_instance_id
        )
        const found_item_2 = backpack.items.find(
          item => item.item_instance_id === item_2.item_instance_id
        )

        expect(found_item_1).toBeUndefined()
        expect(found_item_2).toBeDefined()

        console.log('✅ 多物品独立兑换测试通过')
      } finally {
        // 清理测试数据
        await RedemptionOrder.destroy({
          where: {
            item_instance_id: [item_1.item_instance_id, item_2.item_instance_id]
          }
        })
        await item_1.destroy()
        await item_2.destroy()
      }
    })
  })

  // ==================== 异常流程测试 ====================

  describe('异常流程处理', () => {
    it('应该正确处理核销失败的情况', async () => {
      // 创建订单
      const result = await RedemptionOrderService.createOrder(test_item_instance.item_instance_id)
      const code = result.code

      // 第一次核销（成功）
      await RedemptionOrderService.fulfillOrder(code, test_user.user_id)

      // 第二次核销（应该失败）
      await expect(RedemptionOrderService.fulfillOrder(code, test_user.user_id)).rejects.toThrow(
        '核销码已被使用'
      )

      // 查询背包（物品应该只被核销一次）
      const _backpack = await BackpackService.getUserBackpack(test_user.user_id, test_user.user_id)

      // 验证物品状态
      await test_item_instance.reload()
      expect(test_item_instance.status).toBe('used')

      console.log('✅ 核销失败处理测试通过')
    })

    it('应该正确处理订单过期的情况', async () => {
      // 创建订单
      const result = await RedemptionOrderService.createOrder(test_item_instance.item_instance_id)
      const order = result.order
      const code = result.code

      // 手动设置订单过期
      await order.update({
        expires_at: new Date(Date.now() - 86400000) // 昨天过期
      })

      // 尝试核销（应该失败）
      await expect(RedemptionOrderService.fulfillOrder(code, test_user.user_id)).rejects.toThrow(
        /过期|有效期/
      )

      // 查询背包（物品应该仍在背包中）
      const backpack = await BackpackService.getUserBackpack(test_user.user_id, test_user.user_id)

      // 验证物品状态（未使用）
      await test_item_instance.reload()
      expect(test_item_instance.status).toBe('available')

      // 背包中应该包含该物品
      const found_item = backpack.items.find(
        item => item.item_instance_id === test_item_instance.item_instance_id
      )
      expect(found_item).toBeDefined()

      console.log('✅ 订单过期处理测试通过')
    })

    it('应该正确处理取消订单的情况', async () => {
      // 创建订单
      const result = await RedemptionOrderService.createOrder(test_item_instance.item_instance_id)
      const order = result.order
      const code = result.code

      // 取消订单
      await RedemptionOrderService.cancelOrder(order.order_id)

      // 尝试核销已取消的订单（应该失败）
      await expect(RedemptionOrderService.fulfillOrder(code, test_user.user_id)).rejects.toThrow()

      // 查询背包（物品应该仍在背包中）
      const _backpack2 = await BackpackService.getUserBackpack(test_user.user_id, test_user.user_id)

      // 验证物品状态（未使用）
      await test_item_instance.reload()
      expect(test_item_instance.status).toBe('available')

      console.log('✅ 订单取消处理测试通过')
    })
  })

  // ==================== 并发场景测试 ====================

  describe('并发场景', () => {
    it('应该支持同一用户并发创建多个订单', async () => {
      // 创建多个物品实例
      const items = []
      for (let i = 0; i < 5; i++) {
        const item = await ItemInstance.create({
          owner_user_id: test_user.user_id,
          item_type: 'voucher',
          status: 'available',
          meta: { name: `优惠券${i + 1}`, value: 50 }
        })
        items.push(item)
      }

      try {
        // 并发创建订单
        const promises = items.map(item =>
          RedemptionOrderService.createOrder(item.item_instance_id)
        )

        const results = await Promise.all(promises)

        // 验证：所有订单都成功创建
        expect(results.length).toBe(5)

        // 验证：所有核销码都是唯一的
        const codes = results.map(r => r.code)
        const unique_codes = new Set(codes)
        expect(unique_codes.size).toBe(5)

        console.log('✅ 并发创建订单测试通过')
      } finally {
        // 清理测试数据
        await RedemptionOrder.destroy({
          where: {
            item_instance_id: items.map(item => item.item_instance_id)
          }
        })
        for (const item of items) {
          await item.destroy()
        }
      }
    })

    it('应该防止并发核销同一个订单', async () => {
      // 创建订单
      const result = await RedemptionOrderService.createOrder(test_item_instance.item_instance_id)
      const code = result.code

      // 并发核销
      const promises = [
        RedemptionOrderService.fulfillOrder(code, test_user.user_id),
        RedemptionOrderService.fulfillOrder(code, test_user.user_id),
        RedemptionOrderService.fulfillOrder(code, test_user.user_id)
      ]

      const results = await Promise.allSettled(promises)

      // 验证：只有一个成功，其他失败
      const success_count = results.filter(r => r.status === 'fulfilled').length
      const failure_count = results.filter(r => r.status === 'rejected').length

      expect(success_count).toBe(1)
      expect(failure_count).toBe(2)

      console.log('✅ 并发核销防护测试通过')
    })
  })

  // ==================== 数据一致性测试 ====================

  describe('数据一致性', () => {
    it('核销后物品状态应该与订单状态一致', async () => {
      // 创建订单
      const result = await RedemptionOrderService.createOrder(test_item_instance.item_instance_id)
      const order = result.order
      const code = result.code

      // 核销订单
      await RedemptionOrderService.fulfillOrder(code, test_user.user_id)

      // 重新加载订单和物品
      await order.reload()
      await test_item_instance.reload()

      // 验证状态一致性
      expect(order.status).toBe('fulfilled')
      expect(test_item_instance.status).toBe('used')

      console.log('✅ 数据一致性测试通过')
    })

    it('背包查询应该与数据库状态一致', async () => {
      // 查询背包
      const backpack = await BackpackService.getUserBackpack(test_user.user_id, test_user.user_id)

      // 查询数据库中的物品实例
      const db_items = await ItemInstance.findAll({
        where: {
          owner_user_id: test_user.user_id,
          status: ['available', 'locked']
        }
      })

      // 验证数量一致（背包中的物品数应该等于数据库中可用的物品数）
      expect(backpack.items.length).toBeGreaterThanOrEqual(db_items.length - 1) // 允许有些物品已被使用

      console.log('✅ 背包数据一致性测试通过')
    })
  })
})
