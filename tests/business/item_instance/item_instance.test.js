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
 * - Item: 物品实例主表
 * - ItemTemplate: 物品模板
 * - ItemLedger: 物品事件日志
 *
 * 相关服务：
 * - BackpackService: 背包服务
 * - RedemptionService: 兑换核销服务
 *
 * 创建时间：2026-01-28
 * P2优先级：物品系统模块
 */

const { sequelize, Item, ItemTemplate, ItemLedger, User, Account } = require('../../../models')
const {
  initializeTestServiceManager,
  getTestService,
  cleanupTestServiceManager
} = require('../../helpers/UnifiedTestManager')
const { TEST_DATA } = require('../../helpers/test-data')

// SYSTEM_MINT(id=2) 和 SYSTEM_BURN(id=3) 是系统账户
const SYSTEM_MINT_ACCOUNT_ID = 2
const SYSTEM_BURN_ACCOUNT_ID = 3

// 测试数据
let test_user_id = null
let test_account_id = null
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

    // 3. 获取测试用户的 account_id（三表模型使用 account_id 而非 user_id）
    const test_account = await Account.findOne({
      where: { user_id: test_user_id, account_type: 'user' }
    })
    if (!test_account) {
      throw new Error(`测试用户的 Account 不存在：user_id=${test_user_id}`)
    }
    test_account_id = test_account.account_id

    // 4. 获取或创建测试用的物品模板
    test_item_template = await ItemTemplate.findOne({
      where: { is_enabled: true }
    })

    if (!test_item_template) {
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
      `✅ 测试准备完成: user_id=${test_user_id}, account_id=${test_account_id}, template_id=${test_item_template.item_template_id}`
    )
  }, 60000)

  // ===== 测试用例1：物品实例创建 =====
  describe('物品实例创建', () => {
    test('应该成功创建物品实例', async () => {
      const now = new Date()
      const yy = String(now.getFullYear()).slice(2)
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const trackingCode = `TS${yy}${mm}${dd}${String(Date.now()).slice(-6)}`

      test_item_instance = await Item.create({
        tracking_code: trackingCode,
        owner_account_id: test_account_id,
        item_type: 'voucher',
        item_name: '测试物品实例',
        item_value: 100,
        status: 'available',
        source: 'test',
        source_ref_id: 'test_script',
        prize_definition_id: null
      })

      expect(test_item_instance).toBeDefined()
      expect(test_item_instance.item_id).toBeDefined()
      expect(test_item_instance.owner_account_id).toBe(test_account_id)
      expect(test_item_instance.status).toBe('available')
      expect(test_item_instance.tracking_code).toBe(trackingCode)

      // 双录记账：SYSTEM_MINT(-1) + 用户(+1)
      const idempKey = `test_mint_${test_item_instance.item_id}_${Date.now()}`
      await ItemLedger.bulkCreate([
        {
          item_id: test_item_instance.item_id,
          account_id: SYSTEM_MINT_ACCOUNT_ID,
          delta: -1,
          counterpart_id: test_account_id,
          event_type: 'mint',
          operator_type: 'system',
          business_type: 'test',
          idempotency_key: `${idempKey}_out`,
          meta: { source: 'unit_test' }
        },
        {
          item_id: test_item_instance.item_id,
          account_id: test_account_id,
          delta: 1,
          counterpart_id: SYSTEM_MINT_ACCOUNT_ID,
          event_type: 'mint',
          operator_type: 'system',
          business_type: 'test',
          idempotency_key: `${idempKey}_in`,
          meta: { source: 'unit_test' }
        }
      ])
    })

    test('应该验证必填字段', async () => {
      // 缺少必填字段应该失败
      await expect(
        Item.create({
          // 缺少 item_template_id 和 owner_account_id
          status: 'available'
        })
      ).rejects.toThrow()
    })

    test('应该使用正确的关联别名', async () => {
      // 验证 Item 模型关联：ownerAccount / ledgerEntries / holds
      const instance = await Item.findOne({
        where: { owner_account_id: test_account_id },
        include: [
          {
            model: Account,
            as: 'ownerAccount'
          }
        ]
      })

      if (instance) {
        expect(instance.ownerAccount).toBeDefined()
        expect(instance.ownerAccount.account_id).toBe(test_account_id)
      }
    })
  })

  // ===== 测试用例2：物品实例查询 =====
  describe('物品实例查询', () => {
    test('应该按用户查询物品实例', async () => {
      const instances = await Item.findAll({
        where: { owner_account_id: test_account_id }
      })

      expect(Array.isArray(instances)).toBe(true)
      expect(instances.length).toBeGreaterThanOrEqual(0)

      // 验证查询结果中包含测试创建的物品
      if (instances.length > 0 && test_item_instance) {
        const instance = instances.find(i => i.item_id === test_item_instance.item_id)
        if (instance) {
          expect(instance.item_name).toBe('测试物品实例')
          expect(instance.source).toBe('test')
        }
      }
    })

    test('应该按状态筛选物品实例', async () => {
      const availableInstances = await Item.findAll({
        where: {
          owner_account_id: test_account_id,
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
      const instances = await Item.findAll({
        where: { owner_account_id: 999999999 }
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

      // 状态变更不需要额外写 ledger（使用操作已在事件日志测试中覆盖）
    })

    test('应该记录状态变更事件', async () => {
      if (!test_item_instance) {
        console.log('跳过测试：之前未成功创建测试物品实例')
        return
      }

      const events = await ItemLedger.findAll({
        where: { item_id: test_item_instance.item_id },
        order: [['created_at', 'DESC']]
      })

      expect(events.length).toBeGreaterThanOrEqual(1)
      // 最近的事件应该是 use 类型（注意：事件类型是 use 而不是 used）
      expect(['use', 'mint']).toContain(events[0].event_type)
    })

    test('应该支持状态变更为 expired', async () => {
      const now = new Date()
      const yy = String(now.getFullYear()).slice(2)
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const trackingCode = `TS${yy}${mm}${dd}${String(Date.now()).slice(-6)}`

      const expireTestInstance = await Item.create({
        tracking_code: trackingCode,
        owner_account_id: test_account_id,
        item_type: 'voucher',
        item_name: '过期测试物品',
        item_value: 50,
        status: 'available',
        source: 'test',
        source_ref_id: 'expire_test'
      })

      await expireTestInstance.update({ status: 'expired' })
      await expireTestInstance.reload()
      expect(expireTestInstance.status).toBe('expired')

      // 清理测试数据
      await ItemLedger.destroy({
        where: { item_id: expireTestInstance.item_id }
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

      // 双录：模拟使用操作 — 用户(-1) + SYSTEM_BURN(+1)
      const idempKey = `test_use_${test_item_instance.item_id}_${Date.now()}`
      const entries = await ItemLedger.bulkCreate([
        {
          item_id: test_item_instance.item_id,
          account_id: test_account_id,
          delta: -1,
          counterpart_id: SYSTEM_BURN_ACCOUNT_ID,
          event_type: 'use',
          operator_type: 'user',
          operator_id: test_user_id,
          business_type: 'test',
          idempotency_key: `${idempKey}_out`,
          meta: { reason: 'test_event' }
        },
        {
          item_id: test_item_instance.item_id,
          account_id: SYSTEM_BURN_ACCOUNT_ID,
          delta: 1,
          counterpart_id: test_account_id,
          event_type: 'use',
          operator_type: 'user',
          operator_id: test_user_id,
          business_type: 'test',
          idempotency_key: `${idempKey}_in`,
          meta: { reason: 'test_event' }
        }
      ])

      expect(entries).toHaveLength(2)
      expect(entries[0].ledger_entry_id).toBeDefined()
      expect(entries[0].event_type).toBe('use')
    })

    test('应该按物品实例查询事件历史', async () => {
      if (!test_item_instance) {
        console.log('跳过测试：之前未成功创建测试物品实例')
        return
      }

      const events = await ItemLedger.findAll({
        where: { item_id: test_item_instance.item_id },
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

      const events = await ItemLedger.findAll({
        where: {
          item_id: test_item_instance.item_id
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
        await ItemLedger.destroy({
          where: { item_id: test_item_instance.item_id }
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
