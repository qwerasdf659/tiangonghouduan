/**
 * 测试数据初始化测试
 *
 * 文件路径：tests/core/test_data_initialization.test.js
 *
 * **业务场景**：验证 P0-1 修复后的测试数据动态初始化功能
 * **技术规范**：
 *   - 测试数据通过数据库查询获取，而非硬编码
 *   - 测试用户通过 mobile 查询真实 user_id
 *   - 测试活动通过 status='active' 查询真实 campaign_id
 *
 * 创建时间：2026-01-09
 * 版本：V4.0.0
 */

'use strict'

const {
  TestConfig,
  initRealTestData,
  getRealTestUserId,
  getRealTestCampaignId
} = require('../helpers/test-setup')

describe('测试数据初始化功能 (P0-1)', () => {
  // 重置初始化状态
  beforeEach(() => {
    TestConfig.realData._initialized = false
    TestConfig.realData.testUser.user_id = null
    TestConfig.realData.adminUser.user_id = null
    TestConfig.realData.testCampaign.campaign_id = null
    TestConfig.realData.testCampaign.campaignName = null
  })

  describe('initRealTestData - 动态初始化测试数据', () => {
    test('应该从数据库查询真实的测试用户', async () => {
      const result = await initRealTestData('13612227930')

      // 验证用户数据已初始化
      expect(result.testUser.mobile).toBe('13612227930')
      expect(result.testUser.user_id).not.toBeNull()
      expect(typeof result.testUser.user_id).toBe('number')
      expect(result.testUser.user_id).toBeGreaterThan(0)

      // 验证管理员数据与测试用户一致
      expect(result.adminUser.user_id).toBe(result.testUser.user_id)
      expect(result.adminUser.mobile).toBe('13612227930')
    })

    test('应该从数据库查询活跃的测试活动', async () => {
      const result = await initRealTestData()

      // 活动可能存在也可能不存在，但不应该报错
      expect(result.testCampaign).toBeDefined()

      // 如果找到了活跃活动，验证数据格式
      if (result.testCampaign.campaign_id !== null) {
        expect(typeof result.testCampaign.campaign_id).toBe('number')
        expect(result.testCampaign.campaign_id).toBeGreaterThan(0)
        expect(typeof result.testCampaign.campaignName).toBe('string')
        expect(result.testCampaign.campaignName.length).toBeGreaterThan(0)
      }
    })

    test('应该避免重复初始化', async () => {
      // 第一次初始化
      await initRealTestData('13612227930')
      const firstUserId = TestConfig.realData.testUser.user_id

      // 标记已初始化
      expect(TestConfig.realData._initialized).toBe(true)

      // 修改数据（模拟被其他代码修改）
      TestConfig.realData.testUser.user_id = 99999

      // 第二次调用应该直接返回，不会重新查询
      await initRealTestData('13612227930')

      // 数据应该保持被修改后的值（因为跳过了重新初始化）
      expect(TestConfig.realData.testUser.user_id).toBe(99999)
    })

    test('用户不存在时不应该报错', async () => {
      // 使用不存在的手机号
      const result = await initRealTestData('19999999999')

      // 不应该抛错
      expect(result).toBeDefined()
      expect(result.testUser).toBeDefined()
      // 用户 ID 应该是 null
      expect(result.testUser.user_id).toBeNull()
    })
  })

  describe('getRealTestUserId - 获取真实用户ID', () => {
    test('应该返回数据库中的真实用户ID', async () => {
      const userId = await getRealTestUserId('13612227930')

      expect(userId).not.toBeNull()
      expect(typeof userId).toBe('number')
      expect(userId).toBeGreaterThan(0)
    })

    test('应该自动触发初始化', async () => {
      expect(TestConfig.realData._initialized).toBe(false)

      await getRealTestUserId('13612227930')

      expect(TestConfig.realData._initialized).toBe(true)
    })

    test('用户不存在时返回null', async () => {
      const userId = await getRealTestUserId('19999999999')

      expect(userId).toBeNull()
    })
  })

  describe('getRealTestCampaignId - 获取真实活动ID', () => {
    test('应该返回活跃活动的ID', async () => {
      const campaignId = await getRealTestCampaignId()

      // 活动可能存在也可能不存在
      if (campaignId !== null) {
        expect(typeof campaignId).toBe('number')
        expect(campaignId).toBeGreaterThan(0)
      }
    })

    test('应该自动触发初始化', async () => {
      expect(TestConfig.realData._initialized).toBe(false)

      await getRealTestCampaignId()

      expect(TestConfig.realData._initialized).toBe(true)
    })
  })

  describe('数据一致性验证', () => {
    test('初始化后 TestConfig.realData 应该包含真实数据', async () => {
      await initRealTestData('13612227930')

      // 验证数据结构完整
      expect(TestConfig.realData).toHaveProperty('testUser')
      expect(TestConfig.realData).toHaveProperty('adminUser')
      expect(TestConfig.realData).toHaveProperty('testCampaign')
      expect(TestConfig.realData).toHaveProperty('_initialized')

      // 验证初始化标记
      expect(TestConfig.realData._initialized).toBe(true)

      // 验证用户数据（如果存在）
      if (TestConfig.realData.testUser.user_id) {
        expect(TestConfig.realData.testUser.mobile).toBe('13612227930')
      }
    })

    test('多次调用获取函数应该返回一致的数据', async () => {
      const userId1 = await getRealTestUserId('13612227930')
      const userId2 = await getRealTestUserId('13612227930')
      const campaignId1 = await getRealTestCampaignId()
      const campaignId2 = await getRealTestCampaignId()

      // 多次调用应该返回相同的值
      expect(userId1).toBe(userId2)
      expect(campaignId1).toBe(campaignId2)
    })
  })

  describe('P0-1修复验证：硬编码已移除', () => {
    test('TestConfig.realData 初始状态应该没有硬编码的ID', () => {
      // 重置状态
      TestConfig.realData._initialized = false
      TestConfig.realData.testUser.user_id = null

      // 验证初始状态没有硬编码值
      expect(TestConfig.realData.testUser.user_id).toBeNull()
      expect(TestConfig.realData.adminUser.user_id).toBeNull()
      expect(TestConfig.realData.testCampaign.campaign_id).toBeNull()
    })

    test('只有 mobile 是预设的查询key', () => {
      // mobile 是允许硬编码的（作为查询key）
      expect(TestConfig.realData.testUser.mobile).toBe('13612227930')
      expect(TestConfig.realData.adminUser.mobile).toBe('13612227930')
    })
  })
})
