/**
 * 活动条件API集成测试套件
 *
 * @description 测试活动条件相关API端点
 * @testApproach 使用真实数据库和API测试
 * @created 2025-11-26
 * @version 1.0.0
 */

const request = require('supertest')
const app = require('../../app')
const models = require('../../models')
const { User, LotteryCampaign } = models

describe('🎯 活动条件API集成测试', () => {
  let authToken = null
  let testUser = null
  let testCampaign = null

  // 真实测试用户配置
  const REAL_TEST_USER_CONFIG = {
    mobile: '13612227930'
  }

  /**
   * 测试前准备：登录获取token
   */
  beforeAll(async () => {
    console.log('🔍 初始化活动条件API测试环境...')

    try {
      // 验证真实测试用户存在
      testUser = await User.findOne({
        where: { mobile: REAL_TEST_USER_CONFIG.mobile }
      })

      if (!testUser) {
        throw new Error(`测试用户 ${REAL_TEST_USER_CONFIG.mobile} 不存在`)
      }

      // 登录获取token
      const loginResponse = await request(app)
        .post('/api/v4/auth/login')
        .send({
          mobile: REAL_TEST_USER_CONFIG.mobile,
          verification_code: '123456'
        })

      if (!loginResponse.body.success) {
        throw new Error('登录失败: ' + loginResponse.body.message)
      }

      authToken = loginResponse.body.data.token

      // 获取活跃的抽奖活动
      testCampaign = await LotteryCampaign.findOne({
        where: { status: 'active' },
        order: [['created_at', 'DESC']]
      })

      if (!testCampaign) {
        throw new Error('未找到活跃的抽奖活动')
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
   * 测试1：获取可参与的活动列表
   */
  test('GET /api/v4/activities/available - 获取可参与的活动列表', async () => {
    const response = await request(app)
      .get('/api/v4/activities/available')
      .set('Authorization', `Bearer ${authToken}`)

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toHaveProperty('activities')
    expect(response.body.data).toHaveProperty('total')
    expect(Array.isArray(response.body.data.activities)).toBe(true)

    console.log(`✅ 找到 ${response.body.data.total} 个可参与的活动`)
  })

  /**
   * 测试2：检查特定活动的参与条件
   */
  test('GET /api/v4/activities/:id/check-eligibility - 检查参与条件', async () => {
    const response = await request(app)
      .get(`/api/v4/activities/${testCampaign.campaign_id}/check-eligibility`)
      .set('Authorization', `Bearer ${authToken}`)

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toHaveProperty('eligible')
    expect(response.body.data).toHaveProperty('activity_id')
    expect(response.body.data).toHaveProperty('activity_name')

    console.log(`✅ 条件检查结果: ${response.body.data.eligible ? '满足' : '不满足'}`)
  })

  /**
   * 测试3：使用活动代码检查参与条件
   */
  test('GET /api/v4/activities/:code/check-eligibility - 使用活动代码检查', async () => {
    const response = await request(app)
      .get(`/api/v4/activities/${testCampaign.campaign_code}/check-eligibility`)
      .set('Authorization', `Bearer ${authToken}`)

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.activity_id).toBe(testCampaign.campaign_id)
  })

  /**
   * 测试4：参与活动（验证条件）
   */
  test('POST /api/v4/activities/:id/participate - 参与活动', async () => {
    const response = await request(app)
      .post(`/api/v4/activities/${testCampaign.campaign_id}/participate`)
      .set('Authorization', `Bearer ${authToken}`)

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('success')
    expect(response.body.data).toHaveProperty('can_participate')

    console.log(`✅ 参与活动结果: ${response.body.message}`)
  })

  /**
   * 测试5：未授权访问应该返回401
   */
  test('未授权访问应该返回401', async () => {
    const response = await request(app)
      .get('/api/v4/activities/available')

    expect(response.status).toBe(401)
  })

  /**
   * 测试6：检查不存在的活动应该返回错误
   */
  test('检查不存在的活动应该返回错误', async () => {
    const response = await request(app)
      .get('/api/v4/activities/999999/check-eligibility')
      .set('Authorization', `Bearer ${authToken}`)

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(false)
    expect(response.body.code).toBe('ACTIVITY_NOT_FOUND')
  })

  /**
   * 测试7：配置活动条件（管理员功能）
   */
  test('POST /api/v4/activities/:code/configure-conditions - 配置活动条件', async () => {
    // 注意：此测试需要管理员权限
    const conditionsConfig = {
      participation_conditions: {
        user_points: { operator: '>=', value: 100 }
      },
      condition_error_messages: {
        user_points: '您的积分不足100分，快去消费获取积分吧！'
      }
    }

    const response = await request(app)
      .post(`/api/v4/activities/${testCampaign.campaign_code}/configure-conditions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(conditionsConfig)

    // 如果用户是管理员，应该成功；否则应该返回403
    if (response.status === 200) {
      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveProperty('participation_conditions')
      console.log('✅ 活动条件配置成功（管理员权限）')
    } else if (response.status === 403) {
      console.log('⚠️ 测试用户不是管理员，跳过配置测试')
    }
  })
})
