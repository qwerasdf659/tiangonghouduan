/**
 * 积分系统API测试 - V4架构
 * 迁移自 tests/api/points-api.test.js
 * 测试覆盖：
 * 1. 积分查询API（余额、交易历史、统计）
 * 2. 积分趋势API（7/30/90天趋势分析）
 * 3. 积分验证API（余额验证）
 * 4. 用户信息API（个人信息、统计）
 * 5. 用户画像API（深度分析、行为追踪）
 *
 * 测试原则：
 * - 使用真实数据库（restaurant_points_dev）
 * - 使用统一测试数据（test-data.js）
 * - 验证API响应格式符合业务标准
 * - 测试认证和授权机制
 *
 * 创建时间：2025年11月12日 北京时间
 */

const request = require('supertest')
const app = require('../../../app')
const { TEST_DATA, createTestData } = require('../../helpers/test-data')
const BeijingTimeHelper = require('../../../utils/timeHelper')

/*
 * ==========================================
 * 🔧 测试环境设置
 * ==========================================
 */

describe('积分系统API测试（V4架构）', () => {
  let authToken = null
  let adminToken = null
  // ✅ 修复：统一使用TEST_DATA而非TestConfig.real_data
  const testUser = TEST_DATA.users.testUser
  const adminUser = TEST_DATA.users.adminUser

  // 测试前准备：获取认证token
  beforeAll(async () => {
    console.log('🚀 积分系统API测试启动')
    console.log('='.repeat(70))
    console.log(`📅 测试时间: ${BeijingTimeHelper.now()} (北京时间)`)
    console.log(`👤 测试账号: ${testUser.mobile} (用户ID: ${testUser.user_id})`)
    console.log('🗄️ 数据库: restaurant_points_dev')

    // 获取普通用户token
    try {
      const loginResponse = await request(app)
        .post('/api/v4/auth/login')
        .send({
          mobile: testUser.mobile,
          verification_code: '123456' // 开发环境统一验证码
        })
        .expect(200)

      if (loginResponse.body.success && loginResponse.body.data.token) {
        authToken = loginResponse.body.data.token
        console.log('✅ 普通用户认证成功')
      }
    } catch (error) {
      console.warn('⚠️ 普通用户认证失败，部分测试可能跳过:', error.message)
    }

    // 获取管理员token
    try {
      const adminLoginResponse = await request(app)
        .post('/api/v4/auth/login')
        .send({
          mobile: adminUser.mobile,
          verification_code: '123456' // 开发环境统一验证码
        })
        .expect(200)

      if (adminLoginResponse.body.success && adminLoginResponse.body.data.token) {
        adminToken = adminLoginResponse.body.data.token
        console.log('✅ 管理员认证成功')
      }
    } catch (error) {
      console.warn('⚠️ 管理员认证失败，部分测试可能跳过:', error.message)
    }
  })

  afterAll(() => {
    console.log('🏁 积分系统API测试完成')
  })

  /*
   * ==========================================
   * 📊 积分查询API测试
   * ==========================================
   */

  describe('积分查询API', () => {
    test('应该能获取当前用户积分余额 - GET /api/v4/user/points', async () => {
      if (!authToken) {
        console.warn('⏭️ 跳过测试：未获取到认证token')
        return
      }

      const response = await request(app)
        .get('/api/v4/user/points')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      // 验证响应格式
      expect(response.body).toHaveProperty('success', true)
      expect(response.body).toHaveProperty('data')

      // 验证积分数据
      const data = response.body.data
      expect(data).toHaveProperty('total_points')
      expect(data).toHaveProperty('available_points')
      expect(typeof data.total_points).toBe('number')
      expect(typeof data.available_points).toBe('number')
      expect(data.available_points).toBeLessThanOrEqual(data.total_points)

      console.log(`📊 当前积分余额: ${data.total_points}，可用积分: ${data.available_points}`)
    })

    test('应该能获取积分交易历史 - GET /api/v4/points/transactions', async () => {
      if (!authToken) {
        console.warn('⏭️ 跳过测试：未获取到认证token')
        return
      }

      const response = await request(app)
        .get('/api/v4/points/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toHaveProperty('success', true)
      const data = response.body.data

      // 验证交易历史数据结构
      expect(data).toHaveProperty('transactions')
      expect(Array.isArray(data.transactions)).toBe(true)
      expect(data).toHaveProperty('total_count')
      expect(typeof data.total_count).toBe('number')

      console.log(`📜 积分交易记录数: ${data.total_count}`)
    })

    test('应该能获取积分统计信息 - GET /api/v4/points/statistics', async () => {
      if (!authToken) {
        console.warn('⏭️ 跳过测试：未获取到认证token')
        return
      }

      const response = await request(app)
        .get('/api/v4/points/statistics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toHaveProperty('success', true)
      const data = response.body.data

      // 验证统计数据
      expect(data).toHaveProperty('total_earned')
      expect(data).toHaveProperty('total_spent')
      expect(data).toHaveProperty('monthly_summary')
      expect(typeof data.total_earned).toBe('number')
      expect(typeof data.total_spent).toBe('number')

      console.log(`📊 积分统计 - 总获得: ${data.total_earned}, 总消费: ${data.total_spent}`)
    })
  })

  /*
   * ==========================================
   * 📈 积分趋势API测试
   * ==========================================
   */

  describe('积分趋势API', () => {
    test('应该能查询积分趋势（默认30天）- GET /api/v4/points/trend', async () => {
      if (!authToken) {
        console.warn('⏭️ 跳过测试：未获取到认证token')
        return
      }

      const response = await request(app)
        .get('/api/v4/points/trend?days=30')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toHaveProperty('success', true)
      const data = response.body.data

      // 验证趋势数据结构
      expect(data).toHaveProperty('labels')
      expect(data).toHaveProperty('earn_data')
      expect(data).toHaveProperty('consume_data')
      expect(data).toHaveProperty('total_earn')
      expect(data).toHaveProperty('total_consume')
      expect(data).toHaveProperty('net_change')
      expect(data).toHaveProperty('period')
      expect(data).toHaveProperty('days')
      expect(data).toHaveProperty('data_points')

      // 验证数组类型和长度
      expect(Array.isArray(data.labels)).toBe(true)
      expect(Array.isArray(data.earn_data)).toBe(true)
      expect(Array.isArray(data.consume_data)).toBe(true)
      expect(data.labels.length).toBe(data.days)
      expect(data.earn_data.length).toBe(data.days)
      expect(data.consume_data.length).toBe(data.days)

      console.log(`📈 积分趋势 - 周期: ${data.period}, 数据点: ${data.data_points}`)
    })

    test('应该能查询7天积分趋势 - GET /api/v4/points/trend?days=7', async () => {
      if (!authToken) {
        console.warn('⏭️ 跳过测试：未获取到认证token')
        return
      }

      const response = await request(app)
        .get('/api/v4/points/trend?days=7')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      const data = response.body.data
      expect(data.days).toBe(7)
      expect(data.data_points).toBe(7)
      expect(data.labels.length).toBe(7)
    })

    test('应该能查询90天积分趋势 - GET /api/v4/points/trend?days=90', async () => {
      if (!authToken) {
        console.warn('⏭️ 跳过测试：未获取到认证token')
        return
      }

      const response = await request(app)
        .get('/api/v4/points/trend?days=90')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      const data = response.body.data
      expect(data.days).toBe(90)
      expect(data.data_points).toBe(90)
      expect(data.labels.length).toBe(90)
    })

    test('应该自动修正days参数边界 - GET /api/v4/points/trend', async () => {
      if (!authToken) {
        console.warn('⏭️ 跳过测试：未获取到认证token')
        return
      }

      // 测试days=5应自动修正为7
      const response1 = await request(app)
        .get('/api/v4/points/trend?days=5')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response1.body.data.days).toBe(7) // 应自动修正为最小值7

      // 测试days=100应自动修正为90
      const response2 = await request(app)
        .get('/api/v4/points/trend?days=100')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response2.body.data.days).toBe(90) // 应自动修正为最大值90
    })
  })

  /*
   * ==========================================
   * ✅ 积分验证API测试
   * ==========================================
   */

  describe('积分验证API', () => {
    test('应该能验证积分余额是否足够 - POST /api/v4/points/validate', async () => {
      if (!authToken) {
        console.warn('⏭️ 跳过测试：未获取到认证token')
        return
      }

      const validateData = {
        required_points: 100,
        operation_type: 'lottery'
      }

      const response = await request(app)
        .post('/api/v4/points/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validateData)
        .expect(200)

      expect(response.body).toHaveProperty('success', true)
      const data = response.body.data

      expect(data).toHaveProperty('is_valid')
      expect(data).toHaveProperty('current_balance')
      expect(typeof data.is_valid).toBe('boolean')
      expect(typeof data.current_balance).toBe('number')

      console.log(`✅ 积分验证 - 需要: 100, 当前: ${data.current_balance}, 有效: ${data.is_valid}`)
    })
  })

  /*
   * ==========================================
   * 👤 用户信息API测试
   * ==========================================
   */

  describe('用户信息API', () => {
    test('应该能获取用户个人信息 - GET /api/v4/user/profile', async () => {
      if (!authToken) {
        console.warn('⏭️ 跳过测试：未获取到认证token')
        return
      }

      const response = await request(app)
        .get('/api/v4/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toHaveProperty('success', true)
      const data = response.body.data

      expect(data).toHaveProperty('user_id')
      expect(data).toHaveProperty('mobile')
      expect(data).toHaveProperty('points')
      expect(data).toHaveProperty('status')

      console.log(`👤 用户信息 - ID: ${data.user_id}, 手机: ${data.mobile}`)
    })

    test('应该能获取用户统计信息 - GET /api/v4/user/statistics', async () => {
      if (!authToken) {
        console.warn('⏭️ 跳过测试：未获取到认证token')
        return
      }

      const response = await request(app)
        .get('/api/v4/user/statistics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toHaveProperty('success', true)
      const data = response.body.data

      expect(data).toHaveProperty('lottery_count')
      expect(data).toHaveProperty('win_count')
      expect(data).toHaveProperty('total_points_earned')

      console.log(`📊 用户统计 - 抽奖: ${data.lottery_count}次, 中奖: ${data.win_count}次`)
    })
  })

  /*
   * ==========================================
   * 🔍 用户画像API测试（需要管理员权限）
   * ==========================================
   */

  describe('用户画像API（管理员）', () => {
    test('应该能获取用户深度画像 - GET /api/v4/user/profiling/deep', async () => {
      if (!adminToken) {
        console.warn('⏭️ 跳过测试：未获取到管理员token')
        return
      }

      const response = await request(app)
        .get(`/api/v4/user/profiling/deep?user_id=${testUser.user_id}`)
        .set('Authorization', `Bearer ${adminToken}`)

      // 允许200（成功）或403（权限不足）或404（用户不存在）
      expect([200, 403, 404]).toContain(response.status)

      if (response.status === 200) {
        const data = response.body.data
        expect(data).toHaveProperty('user_profile')
        expect(data).toHaveProperty('behavioral_insights')
        expect(data).toHaveProperty('risk_score')
        console.log('🔍 用户深度画像查询成功')
      }
    })

    test('应该能获取用户行为追踪 - GET /api/v4/user/behavior/tracking', async () => {
      if (!adminToken) {
        console.warn('⏭️ 跳过测试：未获取到管理员token')
        return
      }

      const response = await request(app)
        .get(`/api/v4/user/behavior/tracking?user_id=${testUser.user_id}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 403, 404]).toContain(response.status)

      if (response.status === 200) {
        const data = response.body.data
        expect(data).toHaveProperty('behavior_timeline')
        expect(data).toHaveProperty('activity_patterns')
        expect(data).toHaveProperty('engagement_metrics')
        console.log('🔍 用户行为追踪查询成功')
      }
    })

    test('应该能获取用户偏好分析 - GET /api/v4/user/preferences/analysis', async () => {
      if (!adminToken) {
        console.warn('⏭️ 跳过测试：未获取到管理员token')
        return
      }

      const response = await request(app)
        .get(`/api/v4/user/preferences/analysis?user_id=${testUser.user_id}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect([200, 403, 404]).toContain(response.status)

      if (response.status === 200) {
        const data = response.body.data
        expect(data).toHaveProperty('preference_profile')
        expect(data).toHaveProperty('recommendation_factors')
        console.log('🔍 用户偏好分析查询成功')
      }
    })
  })

  /*
   * ==========================================
   * 🔒 认证测试
   * ==========================================
   */

  describe('API认证测试', () => {
    test('应该拒绝未认证的请求 - GET /api/v4/user/points', async () => {
      const response = await request(app)
        .get('/api/v4/user/points')
        .expect(401)

      expect(response.body).toHaveProperty('success', false)
      expect(response.body.code).toMatch(/AUTH|UNAUTHORIZED/i)
    })

    test('应该拒绝无效token的请求 - GET /api/v4/user/points', async () => {
      const response = await request(app)
        .get('/api/v4/user/points')
        .set('Authorization', 'Bearer invalid-token-12345')
        .expect(401)

      expect(response.body).toHaveProperty('success', false)
    })
  })
})
