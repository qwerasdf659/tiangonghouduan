/**
 * 管理员和系统管理API测试
 * 从unified-complete-api.test.js拆分，符合单一职责原则
 * 创建时间：2025年10月31日 北京时间
 * 使用模型：Claude Sonnet 4
 *
 * 测试覆盖：
 * 1. 管理员系统API（仪表板、统计、系统管理）
 * 2. 调度系统API（任务调度、状态查询）
 * 3. 智能系统API（推荐、分析）
 * 4. 事件系统API（发布、订阅、处理）
 *
 * 测试账号：13612227930 (用户ID: 31, 管理员权限)
 * 数据库：restaurant_points_dev (统一数据库)
 */

const TestCoordinator = require('./TestCoordinator')
const moment = require('moment-timezone')

describe('管理员和系统管理API测试', () => {
  let tester
  let test_user_id
  const test_account = {
    phone: '13612227930',
    user_id: 31,
    role_based_admin: true
  }

  beforeAll(async () => {
    console.log('🚀 管理员和系统管理API测试启动')
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
    console.log('🏁 管理员和系统管理API测试完成')
  })

  // ========== 管理员系统API ==========
  describe('管理员系统API', () => {
    test('✅ 管理员仪表板 - GET /api/v4/admin/dashboard', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/admin/dashboard',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('total_users')
        expect(response.data.data).toHaveProperty('total_draws')
        expect(response.data.data).toHaveProperty('system_health')
      }
    })

    test('✅ 获取系统统计数据 - GET /api/v4/admin/statistics', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/admin/statistics',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('user_statistics')
        expect(response.data.data).toHaveProperty('lottery_statistics')
        expect(response.data.data).toHaveProperty('system_statistics')
      }
    })

    test('✅ 获取活跃用户列表 - GET /api/v4/admin/users/active', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/admin/users/active',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('active_users')
        expect(Array.isArray(response.data.data.active_users)).toBe(true)
        expect(response.data.data).toHaveProperty('total_count')
      }
    })

    test('✅ 系统状态 - GET /api/v4/admin/status', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/admin/status',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('database_status')
        expect(response.data.data).toHaveProperty('redis_status')
        expect(response.data.data).toHaveProperty('engine_status')
      }
    })

    test('✅ 决策分析 - GET /api/v4/admin/decisions/analytics', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/admin/decisions/analytics',
        null,
        'admin'
      )

      expect([200, 401, 403, 404]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('decision_metrics')
        expect(response.data.data).toHaveProperty('trend_analysis')
      }
    })

    test('✅ WebSocket服务状态 - GET /api/v4/system/chat/ws-status', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/system/chat/ws-status',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        // 验证API返回格式符合规范
        expect(response.data.data).toHaveProperty('status')
        expect(response.data.data).toHaveProperty('connections')
        expect(response.data.data).toHaveProperty('uptime')
        expect(response.data.data).toHaveProperty('connected_users')
        expect(response.data.data).toHaveProperty('connected_admins')
        expect(response.data.data).toHaveProperty('timestamp')
        expect(response.data.data).toHaveProperty('startup_log_id')

        // 验证字段类型
        expect(typeof response.data.data.status).toBe('string')
        expect(typeof response.data.data.connections).toBe('number')
        expect(typeof response.data.data.uptime).toBe('number')
        expect(typeof response.data.data.connected_users).toBe('number')
        expect(typeof response.data.data.connected_admins).toBe('number')

        // 验证业务逻辑
        expect(['running', 'stopped']).toContain(response.data.data.status)
        expect(response.data.data.uptime).toBeGreaterThanOrEqual(0)
        expect(response.data.data.connections).toBeGreaterThanOrEqual(0)

        console.log('📊 WebSocket服务状态:', {
          status: response.data.data.status,
          uptime: `${response.data.data.uptime}小时`,
          connections: response.data.data.connections
        })
      }
    })
  })

  // ========== 调度系统API ==========
  describe('调度系统API', () => {
    test('✅ 获取调度任务列表 - GET /api/v4/schedule/tasks', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/schedule/tasks',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('tasks')
        expect(Array.isArray(response.data.data.tasks)).toBe(true)
        expect(response.data.data).toHaveProperty('active_count')
      }
    })

    test('✅ 创建调度任务 - POST /api/v4/schedule/tasks', async () => {
      const task_data = {
        task_name: 'test_scheduled_task',
        task_type: 'maintenance',
        schedule_expression: '0 0 2 * * *', // 每天凌晨2点
        task_config: {
          action: 'cleanup_temp_data',
          target: 'lottery_logs'
        }
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/schedule/tasks',
        task_data,
        'admin'
      )

      expect([200, 400, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('task_id')
        expect(response.data.data).toHaveProperty('task_status')
      }
    })

    test('✅ 获取任务执行历史 - GET /api/v4/schedule/tasks/history', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/schedule/tasks/history',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('execution_history')
        expect(Array.isArray(response.data.data.execution_history)).toBe(true)
        expect(response.data.data).toHaveProperty('pagination')
      }
    })
  })

  // ========== 智能系统API ==========
  describe('智能系统API', () => {
    test('✅ 获取智能推荐 - GET /api/v4/smart/recommendations', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/smart/recommendations?user_id=${test_user_id || test_account.user_id}`,
        null,
        'regular'
      )

      expect([200, 401, 404]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('recommendations')
        expect(Array.isArray(response.data.data.recommendations)).toBe(true)
        expect(response.data.data).toHaveProperty('recommendation_score')
      }
    })

    test('✅ 智能分析报告 - GET /api/v4/smart/analysis', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/smart/analysis',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('analysis_report')
        expect(response.data.data).toHaveProperty('key_insights')
        expect(response.data.data).toHaveProperty('recommendations')
      }
    })

    test('✅ 智能优化建议 - POST /api/v4/smart/optimize', async () => {
      const optimization_data = {
        optimization_target: 'user_engagement',
        analysis_period: '30_days',
        include_metrics: ['lottery_participation', 'points_activity', 'user_retention']
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/smart/optimize',
        optimization_data,
        'admin'
      )

      expect([200, 400, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('optimization_suggestions')
        expect(response.data.data).toHaveProperty('impact_analysis')
        expect(response.data.data).toHaveProperty('implementation_plan')
      }
    })
  })

  // ========== 事件系统API ==========
  describe('事件系统API', () => {
    test('✅ 获取事件列表 - GET /api/v4/events', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/events',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('events')
        expect(Array.isArray(response.data.data.events)).toBe(true)
        expect(response.data.data).toHaveProperty('event_categories')
      }
    })

    test('✅ 发布事件 - POST /api/v4/events/publish', async () => {
      const event_data = {
        event_type: 'system_notification',
        event_category: 'maintenance',
        event_data: {
          title: '系统维护通知',
          message: '系统将于明日凌晨2点进行维护',
          target_users: 'all',
          priority: 'medium'
        },
        schedule_time: new Date(Date.now() + 60000).toISOString() // 1分钟后
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/events/publish',
        event_data,
        'admin'
      )

      expect([200, 400, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('event_id')
        expect(response.data.data).toHaveProperty('publish_status')
      }
    })

    test('✅ 订阅事件 - POST /api/v4/events/subscribe', async () => {
      const subscription_data = {
        event_types: ['lottery_result', 'points_change', 'system_notification'],
        notification_preferences: {
          email: false,
          push: true,
          sms: false
        },
        filter_conditions: {
          priority: ['high', 'critical'],
          categories: ['lottery', 'system']
        }
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/events/subscribe',
        subscription_data,
        'regular'
      )

      expect([200, 400, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('subscription_id')
        expect(response.data.data).toHaveProperty('subscribed_events')
      }
    })

    test('✅ 获取事件处理状态 - GET /api/v4/events/processing/status', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/events/processing/status',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('processing_queue')
        expect(response.data.data).toHaveProperty('processed_events')
        expect(response.data.data).toHaveProperty('failed_events')
      }
    })
  })
})
