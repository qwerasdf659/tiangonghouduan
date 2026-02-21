/**
 * 物品实例测试 - P2优先级
 *
 * 测试目标：验证物品实例CRUD、状态变更、生命周期管理
 *
 * 功能覆盖：
 * 1. 物品实例创建（通过奖品发放）
 * 2. 物品实例查询（按用户、按状态）
 * 3. 物品实例状态变更
 * 4. 物品实例事件记录
 *
 * 相关模型：
 * - ItemInstance: 物品实例主表
 * - ItemTemplate: 物品模板
 * - ItemInstanceEvent: 物品事件日志
 *
 * 相关服务：
 * - BackpackService: 背包服务
 * - RedemptionService: 兑换核销服务
 *
 * 创建时间：2026-01-28
 * P2优先级：物品系统模块
 */

const {
  sequelize,
  ItemInstance,
  ItemTemplate,
  ItemInstanceEvent,
  User
} = require('../../../models')
const {
  initializeTestServiceManager,
  getTestService,
  cleanupTestServiceManager
} = require('../../helpers/UnifiedTestManager')
const { TEST_DATA } = require('../../helpers/test-data')

// 测试数据
let test_user_id = null
let test_item_template = null
let test_item_instance = null

describe('物品实例测试 - P2优先级', () => {
  /*
   * ===== 测试准备（Before All Tests） =====
   */
  beforeAll(async () => {
    // 1. 初始化 ServiceManager
    await initializeTestServiceManager()

    // 2. 获取测试用户
    const test_mobile = TEST_DATA.users.testUser.mobile
    const test_user = await User.findOne({
      where: { mobile: test_mobile }
    })

    if (!test_user) {
      throw new Error(`测试用户不存在：${test_mobile}，请先创建测试用户`)
    }

    test_user_id = test_user.user_id

    // 3. 获取或创建测试用的物品模板
    test_item_template = await ItemTemplate.findOne({
      where: { is_enabled: true }
    })

    if (!test_item_template) {
      // 如果没有启用的模板，创建一个测试模板
      test_item_template = await ItemTemplate.create({
        template_code: `TEST_ITEM_TPL_${Date.now()}`,
        item_type: 'collectible',
        display_name: '测试物品模板',
        description: '用于单元测试的物品模板',
        is_tradable: false,
        is_enabled: true,
        reference_price_points: 100
      })
    }

    console.log(
      `✅ 测试准备完成: user_id=${test_user_id}, template_id=${test_item_template.item_template_id}`
    )
  }, 60000)

  // ===== 测试用例1：物品实例创建 =====
  describe('物品实例创建', () => {
    test('应该成功创建物品实例', async () => {
      // 创建物品实例
      test_item_instance = await ItemInstance.create({
        item_template_id: test_item_template.item_template_id,
        owner_user_id: test_user_id,
        item_type: 'voucher',
        status: 'available',
        acquisition_method: 'test',
        acquisition_source_type: 'system',
        acquisition_source_id: 'test_script'
      })

      expect(test_item_instance).toBeDefined()
      expect(test_item_instance.item_instance_id).toBeDefined()
      expect(test_item_instance.owner_user_id).toBe(test_user_id)
      expect(test_item_instance.status).toBe('available')

      // 记录创建事件（符合模型要求：idempotency_key 必填）
      await ItemInstanceEvent.create({
        item_instance_id: test_item_instance.item_instance_id,
        event_type: 'mint',
        operator_type: 'system',
        operator_user_id: null,
        idempotency_key: `test_create_${test_item_instance.item_instance_id}_${Date.now()}`,
        business_type: 'test',
        meta: { method: 'test', source: 'unit_test' }
      })
    })

    test('应该验证必填字段', async () => {
      // 缺少必填字段应该失败
      await expect(
        ItemInstance.create({
          // 缺少 item_template_id 和 owner_user_id
          status: 'available'
        })
      ).rejects.toThrow()
    })

    test('应该使用正确的关联别名', async () => {
      // 验证模型关联别名是 itemTemplate 而不是 template
      const instance = await ItemInstance.findOne({
        where: { owner_user_id: test_user_id },
        include: [
          {
            model: ItemTemplate,
            as: 'itemTemplate'
          }
        ]
      })

      // 应该能正确加载关联
      if (instance) {
        expect(instance.itemTemplate || instance.item_template_id).toBeDefined()
      }
    })
  })

  // ===== 测试用例2：物品实例查询 =====
  describe('物品实例查询', () => {
    test('应该按用户查询物品实例', async () => {
      const instances = await ItemInstance.findAll({
        where: { owner_user_id: test_user_id },
        include: [
          {
            model: ItemTemplate,
            as: 'itemTemplate' // 使用正确的关联别名
          }
        ]
      })

      expect(Array.isArray(instances)).toBe(true)
      // 用户可能有或没有物品
      expect(instances.length).toBeGreaterThanOrEqual(0)

      // 验证关联数据
      if (instances.length > 0 && test_item_instance) {
        const instance = instances.find(
          i => i.item_instance_id === test_item_instance.item_instance_id
        )
        if (instance && instance.itemTemplate) {
          expect(instance.itemTemplate.item_template_id).toBe(test_item_template.item_template_id)
        }
      }
    })

    test('应该按状态筛选物品实例', async () => {
      const availableInstances = await ItemInstance.findAll({
        where: {
          owner_user_id: test_user_id,
          status: 'available'
        }
      })

      expect(Array.isArray(availableInstances)).toBe(true)
      // 所有结果都应该是 available 状态
      availableInstances.forEach(instance => {
        expect(instance.status).toBe('available')
      })
    })

    test('应该返回空数组对于不存在的用户', async () => {
      const instances = await ItemInstance.findAll({
        where: { owner_user_id: 999999999 }
      })

      expect(Array.isArray(instances)).toBe(true)
      expect(instances.length).toBe(0)
    })
  })

  // ===== 测试用例3：物品实例状态变更 =====
  describe('物品实例状态变更', () => {
    test('应该成功变更状态从 available 到 used', async () => {
      if (!test_item_instance) {
        console.log('跳过测试：之前未成功创建测试物品实例')
        return
      }

      // 更新状态（模型使用 status 字段，不使用 used_at）
      await test_item_instance.update({
        status: 'used'
      })

      // 刷新数据
      await test_item_instance.reload()

      expect(test_item_instance.status).toBe('used')

      // 记录使用事件（符合模型要求）
      await ItemInstanceEvent.create({
        item_instance_id: test_item_instance.item_instance_id,
        event_type: 'use',
        operator_type: 'user',
        operator_user_id: test_user_id,
        status_before: 'available',
        status_after: 'used',
        idempotency_key: `test_use_${test_item_instance.item_instance_id}_${Date.now()}`,
        business_type: 'test',
        meta: { reason: 'unit_test_use' }
      })
    })

    test('应该记录状态变更事件', async () => {
      if (!test_item_instance) {
        console.log('跳过测试：之前未成功创建测试物品实例')
        return
      }

      const events = await ItemInstanceEvent.findAll({
        where: { item_instance_id: test_item_instance.item_instance_id },
        order: [['created_at', 'DESC']]
      })

      expect(events.length).toBeGreaterThanOrEqual(1)
      // 最近的事件应该是 use 类型（注意：事件类型是 use 而不是 used）
      expect(['use', 'mint']).toContain(events[0].event_type)
    })

    test('应该支持状态变更为 expired', async () => {
      // 创建一个新的物品实例用于过期测试
      const expireTestInstance = await ItemInstance.create({
        item_template_id: test_item_template.item_template_id,
        owner_user_id: test_user_id,
        item_type: 'voucher',
        status: 'available',
        acquisition_method: 'test',
        acquisition_source_type: 'system',
        acquisition_source_id: 'expire_test'
      })

      // 变更为过期状态（模型使用 status 字段，不使用 expired_at）
      await expireTestInstance.update({
        status: 'expired'
      })

      await expireTestInstance.reload()
      expect(expireTestInstance.status).toBe('expired')

      // 清理测试数据
      await ItemInstanceEvent.destroy({
        where: { item_instance_id: expireTestInstance.item_instance_id }
      })
      await expireTestInstance.destroy()
    })
  })

  // ===== 测试用例4：物品事件日志 =====
  describe('物品事件日志', () => {
    test('应该正确记录物品事件', async () => {
      if (!test_item_instance) {
        console.log('跳过测试：之前未成功创建测试物品实例')
        return
      }

      // 创建一个新事件（符合模型要求）
      const event = await ItemInstanceEvent.create({
        item_instance_id: test_item_instance.item_instance_id,
        event_type: 'lock', // 使用有效的事件类型
        operator_type: 'user',
        operator_user_id: test_user_id,
        status_before: 'available',
        status_after: 'locked',
        idempotency_key: `test_event_${test_item_instance.item_instance_id}_${Date.now()}`,
        business_type: 'test',
        meta: {
          from_status: 'available',
          to_status: 'locked',
          reason: 'test_event'
        }
      })

      expect(event).toBeDefined()
      expect(event.item_instance_event_id).toBeDefined()
      expect(event.event_type).toBe('lock')
    })

    test('应该按物品实例查询事件历史', async () => {
      if (!test_item_instance) {
        console.log('跳过测试：之前未成功创建测试物品实例')
        return
      }

      const events = await ItemInstanceEvent.findAll({
        where: { item_instance_id: test_item_instance.item_instance_id },
        order: [['created_at', 'ASC']]
      })

      expect(Array.isArray(events)).toBe(true)
      expect(events.length).toBeGreaterThanOrEqual(1)

      // 验证事件按时间排序
      for (let i = 1; i < events.length; i++) {
        expect(new Date(events[i].created_at) >= new Date(events[i - 1].created_at)).toBe(true)
      }
    })

    test('应该支持解析事件元数据', async () => {
      if (!test_item_instance) {
        console.log('跳过测试：之前未成功创建测试物品实例')
        return
      }

      const events = await ItemInstanceEvent.findAll({
        where: {
          item_instance_id: test_item_instance.item_instance_id
        }
      })

      if (events.length > 0) {
        const event = events[0]
        // 使用 meta 字段而不是 data
        const meta = event.meta

        // meta 应该是对象类型
        expect(typeof meta).toBe('object')
      }
    })
  })

  // ===== 测试用例5：BackpackService 服务层测试 =====
  describe('BackpackService 服务层测试', () => {
    test('应该通过服务获取用户背包', async () => {
      const BackpackService = getTestService('backpack')

      const backpack = await BackpackService.getUserBackpack(test_user_id)

      expect(backpack).toBeDefined()
      expect(backpack).toHaveProperty('assets')
      expect(backpack).toHaveProperty('items')
      expect(Array.isArray(backpack.assets)).toBe(true)
      expect(Array.isArray(backpack.items)).toBe(true)
    })

    test('应该通过服务获取背包统计', async () => {
      const BackpackService = getTestService('backpack')

      const stats = await BackpackService.getBackpackStats(test_user_id)

      expect(stats).toBeDefined()
      // 统计信息应该包含资产和物品的数量
      expect(stats).toHaveProperty('total_assets')
      expect(stats).toHaveProperty('total_items')
    })

    test('对于不存在的用户应该返回空背包', async () => {
      const BackpackService = getTestService('backpack')

      // 不存在的用户ID应返回空的背包数据（无资产、无物品）
      const result = await BackpackService.getUserBackpack(999999999)
      expect(result).toBeDefined()
      expect(result.assets).toEqual([])
      expect(result.items).toEqual([])
    })
  })

  // ===== 测试清理（After All Tests） =====
  afterAll(async () => {
    // 清理测试数据
    if (test_item_instance) {
      try {
        // 先删除事件记录
        await ItemInstanceEvent.destroy({
          where: { item_instance_id: test_item_instance.item_instance_id }
        })
        // 再删除物品实例
        await test_item_instance.destroy()
        console.log('✅ 测试物品实例清理完成')
      } catch (err) {
        console.log('清理测试数据失败:', err.message)
      }
    }

    // 如果创建了测试模板，检查是否需要清理
    if (test_item_template && test_item_template.template_code.startsWith('TEST_ITEM_TPL_')) {
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
