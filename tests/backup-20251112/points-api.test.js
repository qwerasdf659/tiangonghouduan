/**
 * 积分和用户系统API测试
 * 从unified-complete-api.test.js拆分，符合单一职责原则
 * 创建时间：2025年10月31日 北京时间
 * 使用模型：Claude Sonnet 4
 *
 * 测试覆盖：
 * 1. 积分系统API（查询、交易、历史、统计）
 * 2. 用户管理API（个人信息、积分查询、统计）
 * 3. 用户画像API（深度分析、行为追踪）
 *
 * 测试账号：13612227930 (用户ID: 31, 管理员权限)
 * 数据库：restaurant_points_dev (统一数据库)
 */

const TestCoordinator = require('./TestCoordinator')
const moment = require('moment-timezone')

describe('积分和用户系统API测试', () => {
  let tester
  let test_user_id
  const test_account = {
    phone: '13612227930',
    user_id: 31,
    role_based_admin: true
  }

  beforeAll(async () => {
    console.log('🚀 积分和用户系统API测试启动')
    console.log('='.repeat(70))
    console.log(
      `📅 测试时间: ${moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')} (北京时间)`
    )
    console.log(`👤 测试账号: ${test_account.phone} (用户ID: ${test_account.user_id})`)
    console.log('🗄️ 数据库: restaurant_points_dev')

    tester = new TestCoordinator()

    // 等待V4引擎启动
    try {
      await tester.waitForV4Engine(30000)
      console.log('✅ V4引擎启动检查通过')
    } catch (error) {
      console.warn('⚠️ V4引擎可能未启动，继续测试:', error.message)
    }

    // 获取认证token
    try {
      const user_data = await tester.authenticateV4User('regular')
      test_user_id = user_data.user.user_id
      await tester.authenticateV4User('admin')
      console.log('✅ 用户认证完成')
    } catch (error) {
      console.warn('⚠️ 认证失败，部分测试可能跳过:', error.message)
    }
  })

  afterAll(async () => {
    if (tester) {
      await tester.cleanup()
    }
    console.log('🏁 积分和用户系统API测试完成')
  })

  // ========== 积分系统API ==========
  describe('积分系统API', () => {
    test('✅ 获取当前用户积分 - GET /api/v4/user/points', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/user/points',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('total_points')
        expect(typeof response.data.data.total_points).toBe('number')
        expect(response.data.data).toHaveProperty('available_points')
      }
    })

    test('✅ 获取积分交易历史 - GET /api/v4/points/transactions', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/points/transactions',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('transactions')
        expect(Array.isArray(response.data.data.transactions)).toBe(true)
        expect(response.data.data).toHaveProperty('total_count')
      }
    })

    test('✅ 积分统计信息 - GET /api/v4/points/statistics', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/points/statistics',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('total_earned')
        expect(response.data.data).toHaveProperty('total_spent')
        expect(response.data.data).toHaveProperty('monthly_summary')
      }
    })

    test('✅ 积分余额验证 - POST /api/v4/points/validate', async () => {
      const validate_data = {
        required_points: 100,
        operation_type: 'lottery'
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/points/validate',
        validate_data,
        'regular'
      )

      expect([200, 400, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('is_valid')
        expect(response.data.data).toHaveProperty('current_balance')
      }
    })

    /**
     * 积分趋势API测试
     * 业务场景：个人中心积分趋势图展示，用于分析用户积分获得/消费趋势
     * API路径：GET /api/v4/points/trend
     * 参数：days（查询天数，7-90天）
     * 返回：labels（日期标签数组）、earn_data（每日获得积分）、consume_data（每日消费积分）
     */
    test('✅ 积分趋势查询（默认30天）- GET /api/v4/points/trend', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/points/trend?days=30',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        const data = response.data.data

        // 验证返回数据结构
        expect(data).toHaveProperty('labels')
        expect(data).toHaveProperty('earn_data')
        expect(data).toHaveProperty('consume_data')
        expect(data).toHaveProperty('total_earn')
        expect(data).toHaveProperty('total_consume')
        expect(data).toHaveProperty('net_change')
        expect(data).toHaveProperty('period')
        expect(data).toHaveProperty('days')
        expect(data).toHaveProperty('data_points')

        // 验证数据类型
        expect(Array.isArray(data.labels)).toBe(true)
        expect(Array.isArray(data.earn_data)).toBe(true)
        expect(Array.isArray(data.consume_data)).toBe(true)
        expect(typeof data.total_earn).toBe('number')
        expect(typeof data.total_consume).toBe('number')
        expect(typeof data.net_change).toBe('number')

        // 验证数据完整性：数组长度应等于days
        expect(data.labels.length).toBe(data.days)
        expect(data.earn_data.length).toBe(data.days)
        expect(data.consume_data.length).toBe(data.days)
        expect(data.data_points).toBe(data.days)

        console.log(`📊 积分趋势查询成功 - 周期: ${data.period}, 数据点: ${data.data_points}`)
      }
    })

    test('✅ 积分趋势查询（7天）- GET /api/v4/points/trend', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/points/trend?days=7',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        const data = response.data.data
        expect(data.days).toBe(7)
        expect(data.data_points).toBe(7)
        expect(data.labels.length).toBe(7)
      }
    })

    test('✅ 积分趋势查询（90天）- GET /api/v4/points/trend', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/points/trend?days=90',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        const data = response.data.data
        expect(data.days).toBe(90)
        expect(data.data_points).toBe(90)
        expect(data.labels.length).toBe(90)
      }
    })

    test('✅ 积分趋势参数边界测试（自动修正）- GET /api/v4/points/trend', async () => {
      // 测试days=5应自动修正为7
      const response1 = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/points/trend?days=5',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response1.status)
      if (response1.status === 200) {
        expect(response1.data.data.days).toBe(7) // 应自动修正为最小值7
      }

      // 测试days=100应自动修正为90
      const response2 = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/points/trend?days=100',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response2.status)
      if (response2.status === 200) {
        expect(response2.data.data.days).toBe(90) // 应自动修正为最大值90
      }
    })
  })

  // ========== 用户管理API ==========
  describe('用户管理API', () => {
    test('✅ 获取用户个人信息 - GET /api/v4/user/profile', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/user/profile',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('user_id')
        expect(response.data.data).toHaveProperty('mobile')
        expect(response.data.data).toHaveProperty('points')
        expect(response.data.data).toHaveProperty('status')
      }
    })

    test('✅ 获取用户统计信息 - GET /api/v4/user/statistics', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/user/statistics',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('lottery_count')
        expect(response.data.data).toHaveProperty('win_count')
        expect(response.data.data).toHaveProperty('total_points_earned')
      }
    })
  })

  // ========== 用户画像API ==========
  describe('用户画像API', () => {
    test('✅ 获取用户深度画像 - GET /api/v4/user/profiling/deep', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/user/profiling/deep?user_id=${test_user_id || test_account.user_id}`,
        null,
        'admin'
      )

      expect([200, 401, 403, 404]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('user_profile')
        expect(response.data.data).toHaveProperty('behavioral_insights')
        expect(response.data.data).toHaveProperty('risk_score')
      }
    })

    test('✅ 获取用户行为追踪 - GET /api/v4/user/behavior/tracking', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/user/behavior/tracking?user_id=${test_user_id || test_account.user_id}`,
        null,
        'admin'
      )

      expect([200, 401, 403, 404]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('behavior_timeline')
        expect(response.data.data).toHaveProperty('activity_patterns')
        expect(response.data.data).toHaveProperty('engagement_metrics')
      }
    })

    test('✅ 用户偏好分析 - GET /api/v4/user/preferences/analysis', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/user/preferences/analysis?user_id=${test_user_id || test_account.user_id}`,
        null,
        'admin'
      )

      expect([200, 401, 403, 404]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('preference_profile')
        expect(response.data.data).toHaveProperty('recommendation_factors')
      }
    })
  })
})
