/**
 * 餐厅积分抽奖系统 V4.2 - RedemptionOrderService 单元测试
 *
 * 测试范围：
 * - 创建兑换订单（createOrder）
 * - 核销订单（fulfillOrder）
 * - 取消订单（cancelOrder）
 * - 过期订单清理（expireOrders）
 * - 并发核销冲突场景
 *
 * 创建时间：2025-12-17
 * 使用模型：Claude Sonnet 4.5
 */

const { sequelize, RedemptionOrder, ItemInstance, User } = require('../../models')
const RedemptionOrderService = require('../../services/RedemptionOrderService')
const RedemptionCodeGenerator = require('../../utils/RedemptionCodeGenerator')

// 测试数据库配置
jest.setTimeout(30000)

describe('RedemptionOrderService - 兑换订单服务', () => {
  let test_user
  let test_item_instance

  // 测试前准备
  beforeAll(async () => {
    // 连接测试数据库
    await sequelize.authenticate()
  })

  // 每个测试前创建测试数据
  beforeEach(async () => {
    // 创建测试用户
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
        description: '测试用优惠券'
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

  // ==================== 创建兑换订单测试 ====================

  describe('createOrder - 创建兑换订单', () => {
    it('应该成功创建兑换订单并返回12位Base32核销码', async () => {
      // 执行创建
      const result = await RedemptionOrderService.createOrder(test_item_instance.item_instance_id)

      // 验证返回结果
      expect(result).toHaveProperty('order')
      expect(result).toHaveProperty('code')

      // 验证订单
      const order = result.order
      expect(order.order_id).toBeDefined()
      expect(order.item_instance_id).toBe(test_item_instance.item_instance_id)
      expect(order.status).toBe('pending')
      expect(order.expires_at).toBeDefined()

      // 验证核销码格式（12位Base32，格式: XXXX-XXXX-XXXX）
      const code = result.code
      expect(code).toMatch(
        /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/
      )

      // 验证过期时间（应该是30天后）
      const expires_at = new Date(order.expires_at)
      const expected_expires = new Date()
      expected_expires.setDate(expected_expires.getDate() + 30)
      const time_diff = Math.abs(expires_at - expected_expires)
      expect(time_diff).toBeLessThan(60000) // 允许1分钟误差
    })

    it('应该拒绝为不可用的物品实例创建兑换订单', async () => {
      // 标记物品实例为已使用
      await test_item_instance.update({ status: 'used' })

      // 尝试创建订单（应该失败）
      await expect(
        RedemptionOrderService.createOrder(test_item_instance.item_instance_id)
      ).rejects.toThrow('物品实例不可用')
    })

    it('应该拒绝为不存在的物品实例创建兑换订单', async () => {
      const non_existent_id = 999999999

      // 尝试创建订单（应该失败）
      await expect(RedemptionOrderService.createOrder(non_existent_id)).rejects.toThrow(
        '物品实例不存在'
      )
    })
  })

  // ==================== 核销订单测试 ====================

  describe('fulfillOrder - 核销订单', () => {
    let test_order
    let test_code

    beforeEach(async () => {
      // 创建测试兑换订单
      const result = await RedemptionOrderService.createOrder(test_item_instance.item_instance_id)
      test_order = result.order
      test_code = result.code
    })

    it('应该成功核销有效的兑换订单', async () => {
      // 执行核销
      const fulfilled_order = await RedemptionOrderService.fulfillOrder(
        test_code,
        test_user.user_id
      )

      // 验证订单状态
      expect(fulfilled_order.status).toBe('fulfilled')
      expect(fulfilled_order.redeemer_user_id).toBe(test_user.user_id)
      expect(fulfilled_order.fulfilled_at).toBeDefined()

      // 验证物品实例状态
      await test_item_instance.reload()
      expect(test_item_instance.status).toBe('used')
    })

    it('应该拒绝重复核销同一个订单', async () => {
      // 第一次核销（成功）
      await RedemptionOrderService.fulfillOrder(test_code, test_user.user_id)

      // 第二次核销（应该失败）
      await expect(
        RedemptionOrderService.fulfillOrder(test_code, test_user.user_id)
      ).rejects.toThrow('核销码已被使用')
    })

    it('应该拒绝核销格式错误的核销码', async () => {
      const invalid_code = 'INVALID-CODE'

      // 尝试核销（应该失败）
      await expect(
        RedemptionOrderService.fulfillOrder(invalid_code, test_user.user_id)
      ).rejects.toThrow('核销码格式错误')
    })

    it('应该拒绝核销不存在的核销码', async () => {
      const non_existent_code = '2345-6789-ABCD' // 格式正确但不存在

      // 尝试核销（应该失败）
      await expect(
        RedemptionOrderService.fulfillOrder(non_existent_code, test_user.user_id)
      ).rejects.toThrow(/核销码不存在|订单不存在/)
    })

    it('应该拒绝核销已过期的订单', async () => {
      // 手动设置订单过期
      await test_order.update({
        expires_at: new Date(Date.now() - 86400000) // 昨天过期
      })

      // 尝试核销（应该失败）
      await expect(
        RedemptionOrderService.fulfillOrder(test_code, test_user.user_id)
      ).rejects.toThrow(/过期|有效期/)
    })
  })

  // ==================== 取消订单测试 ====================

  describe('cancelOrder - 取消订单', () => {
    let test_order
    let test_code

    beforeEach(async () => {
      // 创建测试兑换订单
      const result = await RedemptionOrderService.createOrder(test_item_instance.item_instance_id)
      test_order = result.order
      test_code = result.code
    })

    it('应该成功取消待核销的订单', async () => {
      // 执行取消
      const cancelled_order = await RedemptionOrderService.cancelOrder(test_order.order_id)

      // 验证订单状态
      expect(cancelled_order.status).toBe('cancelled')
    })

    it('应该拒绝取消已核销的订单', async () => {
      // 先核销订单
      await RedemptionOrderService.fulfillOrder(test_code, test_user.user_id)

      // 尝试取消（应该失败）
      await expect(RedemptionOrderService.cancelOrder(test_order.order_id)).rejects.toThrow(
        /只能取消pending状态的订单|订单已核销，不能取消/
      )
    })

    it('应该拒绝取消不存在的订单', async () => {
      const non_existent_id = 'non-existent-uuid'

      // 尝试取消（应该失败）
      await expect(RedemptionOrderService.cancelOrder(non_existent_id)).rejects.toThrow(
        /兑换订单不存在|订单不存在/
      )
    })
  })

  // ==================== 过期订单清理测试 ====================

  describe('expireOrders - 过期订单清理', () => {
    let expired_order_1
    let expired_order_2
    let valid_order

    beforeEach(async () => {
      // 创建3个订单
      const result1 = await RedemptionOrderService.createOrder(test_item_instance.item_instance_id)
      expired_order_1 = result1.order

      // 创建第二个物品实例和订单
      const test_item_2 = await ItemInstance.create({
        owner_user_id: test_user.user_id,
        item_type: 'voucher',
        status: 'available',
        meta: { name: '测试优惠券2' }
      })
      const result2 = await RedemptionOrderService.createOrder(test_item_2.item_instance_id)
      expired_order_2 = result2.order

      // 创建第三个物品实例和订单（不过期）
      const test_item_3 = await ItemInstance.create({
        owner_user_id: test_user.user_id,
        item_type: 'voucher',
        status: 'available',
        meta: { name: '测试优惠券3' }
      })
      const result3 = await RedemptionOrderService.createOrder(test_item_3.item_instance_id)
      valid_order = result3.order

      // 手动设置前两个订单为过期
      await expired_order_1.update({
        expires_at: new Date(Date.now() - 86400000) // 昨天过期
      })
      await expired_order_2.update({
        expires_at: new Date(Date.now() - 86400000) // 昨天过期
      })
    })

    it('应该批量标记所有过期订单', async () => {
      // 执行过期清理
      const expired_count = await RedemptionOrderService.expireOrders()

      // 验证清理数量
      expect(expired_count).toBeGreaterThanOrEqual(2)

      // 验证订单状态
      await expired_order_1.reload()
      await expired_order_2.reload()
      await valid_order.reload()

      expect(expired_order_1.status).toBe('expired')
      expect(expired_order_2.status).toBe('expired')
      expect(valid_order.status).toBe('pending') // 未过期的不应该被标记
    })

    it('应该不影响已核销的订单', async () => {
      // 核销第一个订单
      const code = RedemptionCodeGenerator.generate()
      const _code_hash = RedemptionCodeGenerator.hash(code)
      await expired_order_1.update({
        status: 'fulfilled',
        redeemer_user_id: test_user.user_id,
        fulfilled_at: new Date()
      })

      // 执行过期清理
      await RedemptionOrderService.expireOrders()

      // 验证已核销订单状态不变
      await expired_order_1.reload()
      expect(expired_order_1.status).toBe('fulfilled')
    })
  })

  // ==================== 并发核销冲突测试 ====================

  describe('并发核销冲突场景', () => {
    let _test_order
    let test_code

    beforeEach(async () => {
      // 创建测试兑换订单
      const result = await RedemptionOrderService.createOrder(test_item_instance.item_instance_id)
      _test_order = result.order
      test_code = result.code
    })

    it('应该防止并发核销同一个订单', async () => {
      // 并发发起两个核销请求
      const promise1 = RedemptionOrderService.fulfillOrder(test_code, test_user.user_id)
      const promise2 = RedemptionOrderService.fulfillOrder(test_code, test_user.user_id)

      // 等待两个请求完成
      const results = await Promise.allSettled([promise1, promise2])

      // 验证只有一个成功，一个失败
      const success_count = results.filter(r => r.status === 'fulfilled').length
      const failure_count = results.filter(r => r.status === 'rejected').length

      expect(success_count).toBe(1)
      expect(failure_count).toBe(1)

      // 验证失败原因是"已被使用"
      const rejected = results.find(r => r.status === 'rejected')
      expect(rejected.reason.message).toContain('核销码已被使用')
    })
  })
})
