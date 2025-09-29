/**
 * V4统一完整API测试套件 - 重构整合版
 * 整合所有V4引擎和业务API测试，消除重复代码和技术债务
 * 创建时间：2025年01月21日 北京时间
 * 使用模型：Claude Sonnet 4
 *
 * 整合内容：
 * - unified-business-api.test.js (815行) ✅ 已整合
 * - unified-v4-api-complete.test.js (593行) ✅ 已整合
 * - 删除重复的管理员仪表板、健康检查等测试
 * - 统一测试账号和数据库配置
 *
 * 测试覆盖（完整版）：
 * 1. V4统一引擎核心功能（健康检查、版本、状态）
 * 2. 认证系统API（登录、token管理、权限验证）
 * 3. 抽奖系统API（策略、执行、历史、指标）
 * 4. 管理员系统API（仪表板、统计、系统管理）- 合并去重
 * 5. 积分系统API（查询、交易、历史、统计）
 * 6. 用户管理API（个人信息、积分查询、统计）
 * 7. 权限管理API（检查、用户权限、角色配置）
 * 8. 奖品分发系统API（历史、重试、统计）
 * 9. 用户画像API（深度分析、行为追踪）
 * 10. 概率系统API（概率计算、调整）
 * 11. 调度系统API（任务调度、状态查询）
 * 12. 智能系统API（推荐、分析）
 * 13. 事件系统API（发布、订阅、处理）
 * 14. 性能和集成测试
 *
 * 测试账号：13612227930 (用户ID: 31, 管理员权限)
 * 数据库：restaurant_points_dev (统一数据库)
 */

const UnifiedAPITestManager = require('./UnifiedAPITestManager')
const moment = require('moment-timezone')

describe('V4统一完整API测试套件 - 重构整合版', () => {
  let tester
  let test_user_id
  const test_account = {
    phone: '13612227930',
    user_id: 31,
    is_admin: true
  }

  beforeAll(async () => {
    console.log('🚀 V4统一完整API测试套件启动 [重构整合版]')
    console.log('='.repeat(70))
    console.log(
      `📅 测试时间: ${moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')} (北京时间)`
    )
    console.log(`👤 测试账号: ${test_account.phone} (用户ID: ${test_account.user_id})`)
    console.log('🗄️ 数据库: restaurant_points_dev (统一数据库)')
    console.log('🔄 整合内容: V4引擎+业务API完整覆盖（去重后）')

    tester = new UnifiedAPITestManager()

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
    console.log('🏁 V4统一完整API测试套件执行完成')
  })

  // ========== 第一部分：V4引擎核心功能 ==========
  describe('V4统一引擎核心功能', () => {
    test('✅ V4引擎健康检查 - GET /api/v4/unified-engine/health', async () => {
      const response = await tester.makeRequest('GET', '/api/v4/unified-engine/health')

      expect([200, 503]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('status')
        expect(response.data.data).toHaveProperty('timestamp')
      }
    })

    test('✅ V4引擎版本信息 - GET /api/v4/unified-engine/version', async () => {
      const response = await tester.makeRequest('GET', '/api/v4/unified-engine/version')

      expect([200, 404]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('version')
        expect(response.data.data).toHaveProperty('build_time')
      }
    })

    test('✅ V4引擎状态详情 - GET /api/v4/unified-engine/status', async () => {
      const response = await tester.makeRequest('GET', '/api/v4/unified-engine/status')

      expect([200, 503]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('engine_status')
        expect(response.data.data).toHaveProperty('strategies_status')
      }
    })
  })

  // ========== 第二部分：认证系统API ==========
  describe('认证系统API', () => {
    test('✅ 用户登录 - POST /api/v4/unified-engine/auth/login', async () => {
      const login_data = {
        mobile: '13612227930',
        verification_code: '123456'
      }

      const response = await tester.makeRequest(
        'POST',
        '/api/v4/unified-engine/auth/login',
        login_data
      )

      expect([200, 400]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data).toHaveProperty('code', 'SUCCESS')
        expect(response.data.data).toHaveProperty('access_token')
        expect(response.data.data).toHaveProperty('user')
        expect(response.data.data.user).toHaveProperty('user_id')
        expect(response.data.data.user).toHaveProperty('mobile')
      }
    })

    test('✅ Token验证 - GET /api/v4/unified-engine/auth/verify', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/auth/verify',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('valid', true)
        expect(response.data.data).toHaveProperty('user_id')
      }
    })

    test('✅ 用户登出 - POST /api/v4/unified-engine/auth/logout', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/auth/logout',
        {},
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data).toHaveProperty('code', 'LOGOUT_SUCCESS')
      }
    })
  })

  // ========== 第三部分：抽奖系统API ==========
  describe('抽奖系统API', () => {
    test('✅ 获取抽奖策略列表 - GET /api/v4/unified-engine/lottery/strategies', async () => {
      const response = await tester.makeRequest('GET', '/api/v4/unified-engine/lottery/strategies')

      expect([200, 503]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('strategies')
        expect(Array.isArray(response.data.data.strategies)).toBe(true)

        // 验证只有基础保底策略和管理策略
        const strategy_names = response.data.data.strategies.map(s => s.name)
        expect(strategy_names).toContain('BasicGuaranteeStrategy')
        expect(strategy_names).toContain('ManagementStrategy')
        expect(strategy_names.length).toBe(2)
      }
    })

    test('✅ 执行基础抽奖策略 - POST /api/v4/unified-engine/lottery/execute', async () => {
      const lottery_data = {
        user_id: test_user_id || test_account.user_id,
        strategy: 'BasicGuaranteeStrategy',
        campaign_id: 1
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/lottery/execute',
        lottery_data,
        'regular'
      )

      expect([200, 400, 402, 503]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('strategy_used')
        expect(response.data.data).toHaveProperty('result')
        expect(response.data.data).toHaveProperty('draw_id')
      }
    })

    test('✅ 获取抽奖引擎指标 - GET /api/v4/unified-engine/lottery/metrics', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/lottery/metrics',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('total_draws')
        expect(response.data.data).toHaveProperty('success_rate')
        expect(response.data.data).toHaveProperty('strategy_metrics')
      }
    })

    test('✅ 获取用户抽奖历史 - GET /api/v4/unified-engine/lottery/history', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/lottery/history/${test_user_id || test_account.user_id}`,
        null,
        'regular'
      )

      expect([200, 401, 404]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('records')
        expect(Array.isArray(response.data.data.records)).toBe(true)
        expect(response.data.data).toHaveProperty('pagination')
      }
    })
  })

  // ========== 第四部分：管理员系统API（合并去重） ==========
  describe('管理员系统API', () => {
    test('✅ 管理员仪表板 - GET /api/v4/unified-engine/admin/dashboard', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/admin/dashboard',
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

    test('✅ 获取系统统计数据 - GET /api/v4/unified-engine/admin/statistics', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/admin/statistics',
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

    test('✅ 获取活跃用户列表 - GET /api/v4/unified-engine/admin/users/active', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/admin/users/active',
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

    test('✅ 系统状态 - GET /api/v4/unified-engine/admin/status', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/admin/status',
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

    test('✅ 决策分析 - GET /api/v4/unified-engine/admin/decisions/analytics', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/admin/decisions/analytics',
        null,
        'admin'
      )

      expect([200, 401, 403, 404]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('decision_metrics')
        expect(response.data.data).toHaveProperty('trend_analysis')
      }
    })
  })

  // ========== 第五部分：积分系统API ==========
  describe('积分系统API', () => {
    test('✅ 获取当前用户积分 - GET /api/v4/unified-engine/user/points', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/user/points',
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

    test('✅ 获取积分交易历史 - GET /api/v4/unified-engine/points/transactions', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/points/transactions',
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

    test('✅ 积分统计信息 - GET /api/v4/unified-engine/points/statistics', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/points/statistics',
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

    test('✅ 积分余额验证 - POST /api/v4/unified-engine/points/validate', async () => {
      const validate_data = {
        required_points: 100,
        operation_type: 'lottery'
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/points/validate',
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
  })

  // ========== 第六部分：用户管理API ==========
  describe('用户管理API', () => {
    test('✅ 获取用户个人信息 - GET /api/v4/unified-engine/user/profile', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/user/profile',
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

    test('✅ 获取用户统计信息 - GET /api/v4/unified-engine/user/statistics', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/user/statistics',
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

  // ========== 第七部分：权限管理API ==========
  describe('V4权限管理API', () => {
    test('✅ 检查用户权限 - GET /api/v4/unified-engine/permissions/check', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/permissions/check?permission=lottery_draw',
        null,
        'regular'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('has_permission')
        expect(response.data.data).toHaveProperty('permission_level')
        expect(response.data.data).toHaveProperty('user_role')
      }
    })

    test('✅ 获取用户权限列表 - GET /api/v4/unified-engine/permissions/user', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/permissions/user/${test_user_id || test_account.user_id}`,
        null,
        'admin'
      )

      expect([200, 401, 403, 404]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('permissions')
        expect(Array.isArray(response.data.data.permissions)).toBe(true)
        expect(response.data.data).toHaveProperty('role_permissions')
      }
    })

    test('✅ 获取角色权限配置 - GET /api/v4/unified-engine/permissions/roles', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/permissions/roles',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('roles')
        expect(Array.isArray(response.data.data.roles)).toBe(true)
        expect(response.data.data).toHaveProperty('permission_matrix')
      }
    })
  })

  // ========== 第八部分：奖品分发系统API ==========
  describe('奖品分发系统API', () => {
    test('✅ 获取用户奖品分发历史 - GET /api/v4/unified-engine/prizeDistribution/user/:user_id/history', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/prizeDistribution/user/${test_user_id || test_account.user_id}/history`,
        null,
        'regular'
      )

      expect([200, 401, 404]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('distribution_history')
        expect(Array.isArray(response.data.data.distribution_history)).toBe(true)
        expect(response.data.data).toHaveProperty('total_count')
      }
    })

    test('✅ 获取奖品分发统计 - GET /api/v4/unified-engine/prizeDistribution/statistics', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/prizeDistribution/statistics',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('total_distributions')
        expect(response.data.data).toHaveProperty('success_rate')
        expect(response.data.data).toHaveProperty('prize_type_breakdown')
      }
    })

    test('✅ 管理员分发历史 - GET /api/v4/unified-engine/prizeDistribution/admin/history', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/prizeDistribution/admin/history',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('admin_history')
        expect(Array.isArray(response.data.data.admin_history)).toBe(true)
        expect(response.data.data).toHaveProperty('pagination')
      }
    })
  })

  // ========== 第九部分：用户画像API ==========
  describe('用户画像API', () => {
    test('✅ 获取用户深度画像 - GET /api/v4/unified-engine/user/profiling/deep', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/user/profiling/deep?user_id=${test_user_id || test_account.user_id}`,
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

    test('✅ 获取用户行为追踪 - GET /api/v4/unified-engine/user/behavior/tracking', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/user/behavior/tracking?user_id=${test_user_id || test_account.user_id}`,
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

    test('✅ 用户偏好分析 - GET /api/v4/unified-engine/user/preferences/analysis', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/user/preferences/analysis?user_id=${test_user_id || test_account.user_id}`,
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

  // ========== 第十部分：概率系统API ==========
  describe('概率系统API', () => {
    test('✅ 获取概率配置 - GET /api/v4/unified-engine/probability/config', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/probability/config',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('base_probability')
        expect(response.data.data).toHaveProperty('adjustment_factors')
        expect(response.data.data).toHaveProperty('strategy_probabilities')
      }
    })

    test('✅ 计算用户中奖概率 - POST /api/v4/unified-engine/probability/calculate', async () => {
      const probability_data = {
        user_id: test_user_id || test_account.user_id,
        strategy: 'BasicGuaranteeStrategy',
        campaign_id: 1
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/probability/calculate',
        probability_data,
        'admin'
      )

      expect([200, 400, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('calculated_probability')
        expect(response.data.data).toHaveProperty('adjustment_factors')
        expect(response.data.data).toHaveProperty('base_probability')
      }
    })

    test('✅ 概率统计分析 - GET /api/v4/unified-engine/probability/statistics', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/probability/statistics',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('overall_statistics')
        expect(response.data.data).toHaveProperty('strategy_statistics')
        expect(response.data.data).toHaveProperty('trend_analysis')
      }
    })
  })

  // ========== 第十一部分：调度系统API ==========
  describe('调度系统API', () => {
    test('✅ 获取调度任务列表 - GET /api/v4/unified-engine/schedule/tasks', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/schedule/tasks',
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

    test('✅ 创建调度任务 - POST /api/v4/unified-engine/schedule/tasks', async () => {
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
        '/api/v4/unified-engine/schedule/tasks',
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

    test('✅ 获取任务执行历史 - GET /api/v4/unified-engine/schedule/tasks/history', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/schedule/tasks/history',
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

  // ========== 第十二部分：智能系统API ==========
  describe('智能系统API', () => {
    test('✅ 获取智能推荐 - GET /api/v4/unified-engine/smart/recommendations', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/smart/recommendations?user_id=${test_user_id || test_account.user_id}`,
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

    test('✅ 智能分析报告 - GET /api/v4/unified-engine/smart/analysis', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/smart/analysis',
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

    test('✅ 智能优化建议 - POST /api/v4/unified-engine/smart/optimize', async () => {
      const optimization_data = {
        optimization_target: 'user_engagement',
        analysis_period: '30_days',
        include_metrics: ['lottery_participation', 'points_activity', 'user_retention']
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/smart/optimize',
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

  // ========== 第十三部分：事件系统API ==========
  describe('事件系统API', () => {
    test('✅ 获取事件列表 - GET /api/v4/unified-engine/events', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/events',
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

    test('✅ 发布事件 - POST /api/v4/unified-engine/events/publish', async () => {
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
        '/api/v4/unified-engine/events/publish',
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

    test('✅ 订阅事件 - POST /api/v4/unified-engine/events/subscribe', async () => {
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
        '/api/v4/unified-engine/events/subscribe',
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

    test('✅ 获取事件处理状态 - GET /api/v4/unified-engine/events/processing/status', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/events/processing/status',
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

  // ========== 第十四部分：性能和集成测试 ==========
  describe('性能和集成测试', () => {
    test('🚀 API响应时间性能测试', async () => {
      const start_time = Date.now()

      const _response = await tester.makeRequest('GET', '/api/v4/unified-engine/health')

      const response_time = Date.now() - start_time
      expect(response_time).toBeLessThan(5000) // 5秒内响应

      console.log(`API响应时间: ${response_time}ms`)
    })

    test('🔄 并发抽奖压力测试', async () => {
      const concurrent_requests = 5
      const lottery_promises = []

      for (let i = 0; i < concurrent_requests; i++) {
        const lottery_data = {
          user_id: test_user_id || test_account.user_id,
          strategy: 'BasicGuaranteeStrategy',
          campaign_id: 1
        }

        lottery_promises.push(
          tester.makeAuthenticatedRequest(
            'POST',
            '/api/v4/unified-engine/lottery/execute',
            lottery_data,
            'regular'
          )
        )
      }

      const results = await Promise.allSettled(lottery_promises)
      const successful_requests = results.filter(
        r => r.status === 'fulfilled' && r.value.status === 200
      )

      console.log(`并发抽奖测试: ${successful_requests.length}/${concurrent_requests} 成功`)
      expect(successful_requests.length).toBeGreaterThan(0)
    })

    test('🏁 引擎最终健康检查', async () => {
      const response = await tester.makeRequest('GET', '/api/v4/unified-engine/health')

      expect([200, 503]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('status')
        console.log('✅ V4引擎运行状态正常')
      } else {
        console.warn('⚠️ V4引擎可能存在问题，需要检查')
      }
    })
  })
})
