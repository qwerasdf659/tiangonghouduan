/**
 * 活动条件验证服务测试套件
 *
 * @description 测试活动参与条件验证功能
 * @testApproach 使用真实数据库数据测试
 * @created 2025-11-26
 * @version 1.0.0
 */

const ActivityConditionValidator = require('../../services/ActivityConditionValidator')
const models = require('../../models')
const { User, LotteryCampaign, UserPointsAccount } = models

describe('🎯 活动条件验证服务测试', () => {
  let testUser = null
  let testCampaign = null

  // 真实测试用户配置
  const REAL_TEST_USER_CONFIG = {
    mobile: '13612227930',
    user_id: 31
  }

  /**
   * 测试前准备：使用实际用户数据
   */
  beforeAll(async () => {
    console.log('🔍 初始化活动条件验证测试环境...')

    try {
      // 验证真实测试用户存在
      testUser = await User.findOne({
        where: { mobile: REAL_TEST_USER_CONFIG.mobile }
      })

      if (!testUser) {
        throw new Error(`测试用户 ${REAL_TEST_USER_CONFIG.mobile} 不存在`)
      }

      // 获取活跃的抽奖活动
      testCampaign = await LotteryCampaign.findOne({
        where: { status: 'active' },
        order: [['created_at', 'DESC']]
      })

      if (!testCampaign) {
        throw new Error('未找到活跃的抽奖活动')
      }

      // 确保用户有足够的积分进行测试
      const userAccount = await UserPointsAccount.findOne({
        where: { user_id: testUser.user_id }
      })

      if (!userAccount || userAccount.available_points < 1000) {
        console.log('⚠️ 用户积分不足1000，添加测试积分...')
        if (userAccount) {
          await userAccount.update({
            available_points: 10000,
            total_earned: models.sequelize.literal('total_earned + 10000')
          })
        } else {
          await UserPointsAccount.create({
            user_id: testUser.user_id,
            available_points: 10000,
            total_earned: 10000
          })
        }
      }

      console.log('✅ 测试环境初始化完成')
      console.log(`📊 测试用户: ${testUser.user_id} (${testUser.mobile})`)
      console.log(`📊 测试活动: ${testCampaign.campaign_id} (${testCampaign.campaign_name})`)
    } catch (error) {
      console.error('❌ 测试环境初始化失败:', error.message)
      throw error
    }
  })

  /**
   * 测试1：无条件配置时应该通过验证
   */
  test('无条件配置时应该通过验证', async () => {
    const mockActivity = {
      campaign_id: 1,
      campaign_name: '测试活动',
      participation_conditions: null,
      condition_error_messages: null
    }

    const result = await ActivityConditionValidator.validateUser(
      { user_id: testUser.user_id },
      mockActivity
    )

    expect(result.valid).toBe(true)
    expect(result.failedConditions).toHaveLength(0)
    expect(result.messages).toHaveLength(0)
  })

  /**
   * 测试2：积分条件验证 - 满足条件
   */
  test('积分条件验证 - 满足条件', async () => {
    const mockActivity = {
      campaign_id: 1,
      campaign_name: '测试活动',
      participation_conditions: {
        user_points: { operator: '>=', value: 100 }
      },
      condition_error_messages: {
        user_points: '您的积分不足100分'
      }
    }

    const result = await ActivityConditionValidator.validateUser(
      { user_id: testUser.user_id },
      mockActivity
    )

    expect(result.valid).toBe(true)
    expect(result.userData.user_points).toBeGreaterThanOrEqual(100)
  })

  /**
   * 测试3：积分条件验证 - 不满足条件
   */
  test('积分条件验证 - 不满足条件', async () => {
    const mockActivity = {
      campaign_id: 1,
      campaign_name: '测试活动',
      participation_conditions: {
        user_points: { operator: '>=', value: 999999 }
      },
      condition_error_messages: {
        user_points: '您的积分不足999999分'
      }
    }

    const result = await ActivityConditionValidator.validateUser(
      { user_id: testUser.user_id },
      mockActivity
    )

    expect(result.valid).toBe(false)
    expect(result.failedConditions).toHaveLength(1)
    expect(result.messages[0]).toBe('您的积分不足999999分')
  })

  /**
   * 测试4：多条件验证 - 全部满足
   */
  test('多条件验证 - 全部满足', async () => {
    const mockActivity = {
      campaign_id: 1,
      campaign_name: '测试活动',
      participation_conditions: {
        user_points: { operator: '>=', value: 0 },
        registration_days: { operator: '>=', value: 0 }
      },
      condition_error_messages: {
        user_points: '您的积分不足',
        registration_days: '注册天数不足'
      }
    }

    const result = await ActivityConditionValidator.validateUser(
      { user_id: testUser.user_id },
      mockActivity
    )

    if (!result.valid) {
      console.log('❌ 验证失败:', result.failedConditions)
      console.log('用户数据:', result.userData)
    }

    expect(result.valid).toBe(true)
    expect(result.userData.user_points).toBeGreaterThanOrEqual(0)
    expect(result.userData.registration_days).toBeGreaterThanOrEqual(0)
  })

  /**
   * 测试5：多条件验证 - 部分不满足
   */
  test('多条件验证 - 部分不满足', async () => {
    const mockActivity = {
      campaign_id: 1,
      campaign_name: '测试活动',
      participation_conditions: {
        user_points: { operator: '>=', value: 100 },
        registration_days: { operator: '>=', value: 999999 }
      },
      condition_error_messages: {
        user_points: '您的积分不足100分',
        registration_days: '注册天数不足999999天'
      }
    }

    const result = await ActivityConditionValidator.validateUser(
      { user_id: testUser.user_id },
      mockActivity
    )

    expect(result.valid).toBe(false)
    expect(result.failedConditions.length).toBeGreaterThan(0)
    expect(result.messages).toContain('注册天数不足999999天')
  })

  /**
   * 测试6：用户类型条件验证 - in运算符
   */
  test('用户类型条件验证 - in运算符', async () => {
    const mockActivity = {
      campaign_id: 1,
      campaign_name: '测试活动',
      participation_conditions: {
        user_type: { operator: 'in', value: ['normal', 'vip', 'svip', 'admin'] }
      },
      condition_error_messages: {
        user_type: '此活动仅限特定用户类型参与'
      }
    }

    const result = await ActivityConditionValidator.validateUser(
      { user_id: testUser.user_id },
      mockActivity
    )

    expect(result.valid).toBe(true)
    expect(['normal', 'vip', 'svip', 'admin']).toContain(result.userData.user_type)
  })

  /**
   * 测试7：运算符测试 - 大于
   */
  test('运算符测试 - 大于', async () => {
    const mockActivity = {
      campaign_id: 1,
      campaign_name: '测试活动',
      participation_conditions: {
        user_points: { operator: '>', value: 0 }
      },
      condition_error_messages: {
        user_points: '积分必须大于0'
      }
    }

    const result = await ActivityConditionValidator.validateUser(
      { user_id: testUser.user_id },
      mockActivity
    )

    expect(result.valid).toBe(true)
  })

  /**
   * 测试8：运算符测试 - 小于等于
   */
  test('运算符测试 - 小于等于', async () => {
    const mockActivity = {
      campaign_id: 1,
      campaign_name: '测试活动',
      participation_conditions: {
        user_points: { operator: '<=', value: 999999 }
      },
      condition_error_messages: {
        user_points: '积分超出限制'
      }
    }

    const result = await ActivityConditionValidator.validateUser(
      { user_id: testUser.user_id },
      mockActivity
    )

    expect(result.valid).toBe(true)
  })

  /**
   * 测试9：获取用户数据功能
   */
  test('获取用户数据功能', async () => {
    const userData = await ActivityConditionValidator.getUserData(testUser.user_id)

    expect(userData).toHaveProperty('user_id')
    expect(userData).toHaveProperty('user_points')
    expect(userData).toHaveProperty('user_type')
    expect(userData).toHaveProperty('registration_days')
    expect(userData).toHaveProperty('consecutive_fail_count')
    expect(userData.user_id).toBe(testUser.user_id)
    expect(typeof userData.user_points).toBe('number')
    expect(['normal', 'vip', 'svip', 'admin']).toContain(userData.user_type)
  })

  /**
   * 测试10：条件运算符解析引擎
   */
  test('条件运算符解析引擎', () => {
    const userData = {
      user_points: 500,
      user_type: 'vip'
    }

    // 测试 >= 运算符
    expect(ActivityConditionValidator.evaluateCondition(
      userData,
      'user_points',
      { operator: '>=', value: 100 }
    )).toBe(true)

    expect(ActivityConditionValidator.evaluateCondition(
      userData,
      'user_points',
      { operator: '>=', value: 1000 }
    )).toBe(false)

    // 测试 = 运算符
    expect(ActivityConditionValidator.evaluateCondition(
      userData,
      'user_type',
      { operator: '=', value: 'vip' }
    )).toBe(true)

    // 测试 in 运算符
    expect(ActivityConditionValidator.evaluateCondition(
      userData,
      'user_type',
      { operator: 'in', value: ['vip', 'svip'] }
    )).toBe(true)

    expect(ActivityConditionValidator.evaluateCondition(
      userData,
      'user_type',
      { operator: 'in', value: ['normal'] }
    )).toBe(false)
  })
})
