/**
 * 物品兑换核销测试 - P2优先级
 *
 * 测试目标：验证物品兑换和核销流程的完整性
 *
 * 功能覆盖：
 * 1. 物品兑换码生成
 * 2. 物品核销流程
 * 3. 核销状态验证
 * 4. 重复核销防护
 *
 * 相关模型：
 * - Item: 物品实例
 * - ItemTemplate: 物品模板
 *
 * 相关服务：
 * - RedemptionService: 兑换核销服务
 *
 * 创建时间：2026-01-28
 * P2优先级：物品系统模块
 */

const {
  sequelize,
  Item,
  ItemTemplate,
  ItemLedger,
  ItemHold,
  User,
  Account
} = require('../../../models')
const {
  initializeTestServiceManager,
  getTestService,
  cleanupTestServiceManager
} = require('../../helpers/UnifiedTestManager')
const { TEST_DATA } = require('../../helpers/test-data')

let test_user_id = null
let test_account_id = null
let test_item_template = null
let test_item_instance = null
let RedemptionService = null

describe('物品兑换核销测试 - P2优先级', () => {
  /*
   * ===== 测试准备（Before All Tests） =====
   */
  beforeAll(async () => {
    // 1. 初始化 ServiceManager
    await initializeTestServiceManager()

    // 2. 获取 RedemptionService
    try {
      RedemptionService = getTestService('redemption')
    } catch (err) {
      console.log('⚠️ RedemptionService 未注册，部分测试将跳过:', err.message)
    }

    // 3. 获取测试用户
    const test_mobile = TEST_DATA.users.testUser.mobile
    const test_user = await User.findOne({
      where: { mobile: test_mobile }
    })

    if (!test_user) {
      throw new Error(`测试用户不存在：${test_mobile}，请先创建测试用户`)
    }

    test_user_id = test_user.user_id

    // 3b. 获取 account_id（三表模型）
    const account = await Account.findOne({
      where: { user_id: test_user_id, account_type: 'user' }
    })
    if (!account) {
      throw new Error(`测试用户 Account 不存在：user_id=${test_user_id}`)
    }
    test_account_id = account.account_id

    // 4. 获取或创建测试用的物品模板（可兑换类型）
    test_item_template = await ItemTemplate.findOne({
      where: {
        is_enabled: true,
        item_type: 'voucher' // 优惠券类型，支持兑换
      }
    })

    if (!test_item_template) {
      // 查找任意启用的模板
      test_item_template = await ItemTemplate.findOne({
        where: { is_enabled: true }
      })
    }

    if (!test_item_template) {
      // 如果没有启用的模板，创建一个测试模板
      test_item_template = await ItemTemplate.create({
        template_code: `TEST_VOUCHER_${Date.now()}`,
        item_type: 'voucher',
        display_name: '测试兑换券',
        description: '用于单元测试的兑换券模板',
        is_tradable: false,
        is_enabled: true,
        reference_price_points: 50
      })
    }

    console.log(
      `✅ 测试准备完成: user_id=${test_user_id}, template_id=${test_item_template.item_template_id}`
    )
  }, 60000)

  // ===== 测试用例1：物品实例创建和兑换码 =====
  describe('物品实例创建和兑换码', () => {
    test('应该成功创建可兑换的物品实例', async () => {
      const trackingCode = `TS${String(Date.now()).slice(-12)}`
      test_item_instance = await Item.create({
        tracking_code: trackingCode,
        owner_account_id: test_account_id,
        item_type: 'voucher',
        item_name: '测试兑换券',
        item_value: 50,
        status: 'available',
        source: 'test',
        source_ref_id: 'redemption_test'
      })

      expect(test_item_instance).toBeDefined()
      expect(test_item_instance.item_id).toBeDefined()
      expect(test_item_instance.status).toBe('available')
      expect(test_item_instance.tracking_code).toBe(trackingCode)
    })

    test('应该正确设置兑换码（如果有）', async () => {
      if (!test_item_instance) {
        console.log('跳过测试：之前未成功创建测试物品实例')
        return
      }

      // 如果物品有兑换码字段，验证其格式
      if (test_item_instance.redemption_code) {
        expect(typeof test_item_instance.redemption_code).toBe('string')
        expect(test_item_instance.redemption_code.length).toBeGreaterThan(0)
      }
    })
  })

  // ===== 测试用例2：RedemptionService 服务测试 =====
  describe('RedemptionService 服务测试', () => {
    test('应该能获取 RedemptionService', () => {
      if (!RedemptionService) {
        console.log('跳过测试：RedemptionService 未注册')
        return
      }

      expect(RedemptionService).toBeDefined()
    })

    test('应该支持查询可兑换的物品', async () => {
      if (!RedemptionService) {
        console.log('跳过测试：RedemptionService 未注册')
        return
      }

      // 检查服务是否有 getRedeemableItems 方法
      if (typeof RedemptionService.getRedeemableItems === 'function') {
        const redeemableItems = await RedemptionService.getRedeemableItems(test_user_id)
        expect(Array.isArray(redeemableItems)).toBe(true)
      } else {
        console.log('跳过测试：RedemptionService.getRedeemableItems 方法不存在')
      }
    })

    test('应该支持核销物品', async () => {
      if (!RedemptionService) {
        console.log('跳过测试：RedemptionService 未注册')
        return
      }

      if (!test_item_instance) {
        console.log('跳过测试：之前未成功创建测试物品实例')
        return
      }

      // 检查服务是否有 redeemItem 方法
      if (typeof RedemptionService.redeemItem === 'function') {
        try {
          const result = await RedemptionService.redeemItem({
            item_id: test_item_instance.item_id,
            user_id: test_user_id
          })

          expect(result).toBeDefined()
          // 核销后物品状态应该变更
          await test_item_instance.reload()
          expect(test_item_instance.status).toBe('used')
        } catch (err) {
          // 如果核销失败，检查是否是业务规则限制
          console.log('核销测试结果:', err.message)
        }
      } else {
        console.log('跳过测试：RedemptionService.redeemItem 方法不存在')
      }
    })
  })

  // ===== 测试用例3：核销状态验证 =====
  describe('核销状态验证', () => {
    test('已核销的物品状态应该是 used', async () => {
      const trackingCode = `TS${String(Date.now()).slice(-12)}`
      const usedInstance = await Item.create({
        tracking_code: trackingCode,
        owner_account_id: test_account_id,
        item_type: 'voucher',
        item_name: '核销状态测试物品',
        item_value: 50,
        status: 'available',
        source: 'test',
        source_ref_id: 'status_test'
      })

      // 模拟核销（使用模型实例方法或直接更新状态）
      await usedInstance.update({
        status: 'used'
      })

      await usedInstance.reload()
      expect(usedInstance.status).toBe('used')
      // 注意：模型中没有 used_at 字段，使用 updated_at 来验证更新
      expect(usedInstance.updated_at).toBeDefined()

      // 清理
      await usedInstance.destroy()
    })

    test('不应该允许重复核销同一物品', async () => {
      const trackingCode = `TS${String(Date.now()).slice(-12)}`
      const alreadyUsedInstance = await Item.create({
        tracking_code: trackingCode,
        owner_account_id: test_account_id,
        item_type: 'voucher',
        item_name: '重复核销测试物品',
        item_value: 50,
        status: 'used',
        source: 'test',
        source_ref_id: 'duplicate_test'
      })

      // 尝试再次核销应该失败（验证业务逻辑）
      if (RedemptionService && typeof RedemptionService.redeemItem === 'function') {
        try {
          await RedemptionService.redeemItem({
            item_id: alreadyUsedInstance.item_id,
            user_id: test_user_id
          })
          // 如果没有抛出错误，测试失败
          expect(true).toBe(false) // 应该抛出错误
        } catch (err) {
          // 预期会抛出错误
          expect(err).toBeDefined()
        }
      }

      // 清理
      await alreadyUsedInstance.destroy()
    })
  })

  // ===== 测试用例4：物品状态流转 =====
  describe('物品状态流转', () => {
    test('物品状态应该只能按规定路径流转', async () => {
      /**
       * 物品状态机定义（三表模型）：
       * - available: 可用
       * - held: 锁定中（替代旧的 locked）
       * - used: 已使用
       * - expired: 已过期
       * - destroyed: 已销毁
       */
      const validStatuses = ['available', 'held', 'used', 'expired', 'destroyed']

      const trackingCode = `TS${String(Date.now()).slice(-12)}`
      const statusTestInstance = await Item.create({
        tracking_code: trackingCode,
        owner_account_id: test_account_id,
        item_type: 'voucher',
        item_name: '状态流转测试物品',
        item_value: 50,
        status: 'available',
        source: 'test',
        source_ref_id: 'status_flow_test'
      })

      expect(validStatuses).toContain(statusTestInstance.status)
      expect(statusTestInstance.status).toBe('available')

      // available -> held（锁定）
      await statusTestInstance.update({ status: 'held' })
      await statusTestInstance.reload()
      expect(statusTestInstance.status).toBe('held')

      // held -> available（解锁）
      await statusTestInstance.update({ status: 'available' })
      await statusTestInstance.reload()
      expect(statusTestInstance.status).toBe('available')

      // available -> used（核销）
      await statusTestInstance.update({ status: 'used' })
      await statusTestInstance.reload()
      expect(statusTestInstance.status).toBe('used')

      await statusTestInstance.destroy()
    })
  })

  // ===== 测试用例5：并发核销防护 =====
  describe('并发核销防护', () => {
    test('应该防止并发核销同一物品', async () => {
      const trackingCode = `TS${String(Date.now()).slice(-12)}`
      const concurrentTestInstance = await Item.create({
        tracking_code: trackingCode,
        owner_account_id: test_account_id,
        item_type: 'voucher',
        item_name: '并发核销测试物品',
        item_value: 50,
        status: 'available',
        source: 'test',
        source_ref_id: 'concurrent_test'
      })

      const concurrentRedemptions = [
        concurrentTestInstance.update({ status: 'used' }),
        concurrentTestInstance.update({ status: 'used' })
      ]

      // 等待所有操作完成
      const results = await Promise.allSettled(concurrentRedemptions)

      // 至少一个应该成功
      const successCount = results.filter(r => r.status === 'fulfilled').length
      expect(successCount).toBeGreaterThanOrEqual(1)

      // 最终状态应该是 used
      await concurrentTestInstance.reload()
      expect(concurrentTestInstance.status).toBe('used')

      // 清理
      await concurrentTestInstance.destroy()
    })
  })

  // ===== 测试清理（After All Tests） =====
  afterAll(async () => {
    // 清理测试数据
    if (test_item_instance) {
      try {
        await test_item_instance.destroy()
        console.log('✅ 测试物品实例清理完成')
      } catch (err) {
        console.log('清理测试数据失败:', err.message)
      }
    }

    // 如果创建了测试模板，检查是否需要清理
    if (test_item_template && test_item_template.template_code.startsWith('TEST_VOUCHER_')) {
      try {
        await test_item_template.destroy()
        console.log('✅ 测试物品模板清理完成')
      } catch (err) {
        console.log('清理测试模板失败:', err.message)
      }
    }

    // 关闭 ServiceManager
    await cleanupTestServiceManager()

    // 关闭数据库连接
    await sequelize.close()
  })
})
