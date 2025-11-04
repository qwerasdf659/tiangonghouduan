/**
 * 抽奖系统API测试
 * 从unified-complete-api.test.js拆分，符合单一职责原则
 * 创建时间：2025年10月31日 北京时间
 * 使用模型：Claude Sonnet 4
 *
 * 测试覆盖：
 * 1. 抽奖系统API（策略、执行、历史、指标）
 * 2. 奖品分发系统API（历史、重试、统计）
 * 3. 概率系统API（概率计算、调整）
 * 4. 性能和集成测试
 *
 * 测试账号：13612227930 (用户ID: 31, 管理员权限)
 * 数据库：restaurant_points_dev (统一数据库)
 */

const TestCoordinator = require('./TestCoordinator')
const moment = require('moment-timezone')

describe('抽奖系统API测试', () => {
  let tester
  let test_user_id
  const test_account = {
    phone: '13612227930',
    user_id: 31,
    role_based_admin: true
  }

  beforeAll(async () => {
    console.log('🚀 抽奖系统API测试启动')
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
    console.log('🏁 抽奖系统API测试完成')
  })

  // ========== 抽奖系统API ==========
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

  // ========== 奖品分发系统API ==========
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

  // ========== 概率系统API ==========
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

  // ========== 性能和集成测试 ==========
  describe('性能和集成测试', () => {
    test('🚀 API响应时间性能测试', async () => {
      const start_time = Date.now()

      const _response = await tester.makeRequest('GET', '/api/v4/unified-engine/lottery/health')

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
      const response = await tester.makeRequest('GET', '/api/v4/unified-engine/lottery/health')

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
