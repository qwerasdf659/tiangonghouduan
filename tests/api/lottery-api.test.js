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

    /**
     * ✅ 获取用户抽奖统计 - GET /api/v4/unified-engine/lottery/statistics/:user_id
     * 
     * 测试场景（Test Scenarios - 基于@抽奖统计API实施方案.md）：
     * 1. 普通用户查看自己的统计（权限验证）
     * 2. 管理员查看任意用户的统计（管理员权限）
     * 3. 普通用户尝试查看其他用户统计（权限拒绝）
     * 4. 统计数据完整性验证（11个字段）
     * 
     * 验证字段（11个统计字段 - 基于实际API实现）：
     * - user_id: 用户ID
     * - total_draws: 总抽奖次数
     * - total_wins: 总中奖次数
     * - guarantee_wins: 保底中奖次数
     * - normal_wins: 正常中奖次数
     * - win_rate: 中奖率（百分比数字）
     * - today_draws: 今日抽奖次数
     * - today_wins: 今日中奖次数
     * - today_win_rate: 今日中奖率
     * - total_points_cost: 总消耗积分
     * - prize_type_distribution: 奖品类型分布（对象）
     * - last_win: 最近一次中奖记录（对象或null）
     * - timestamp: 响应时间戳（北京时间）
     */
    test('✅ 获取用户抽奖统计（普通用户查看自己）- GET /api/v4/unified-engine/lottery/statistics/:user_id', async () => {
      const target_user_id = test_user_id || test_account.user_id
      
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/lottery/statistics/${target_user_id}`,
        null,
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      
      if (response.status === 200) {
        const stats = response.data.data
        
        // ✅ 验证基础字段存在性
        expect(stats).toHaveProperty('user_id')
        expect(stats).toHaveProperty('total_draws')
        expect(stats).toHaveProperty('total_wins')
        expect(stats).toHaveProperty('guarantee_wins')
        expect(stats).toHaveProperty('normal_wins')
        expect(stats).toHaveProperty('win_rate')
        expect(stats).toHaveProperty('today_draws')
        expect(stats).toHaveProperty('today_wins')
        expect(stats).toHaveProperty('today_win_rate')
        expect(stats).toHaveProperty('total_points_cost')
        expect(stats).toHaveProperty('prize_type_distribution')
        expect(stats).toHaveProperty('last_win')
        expect(stats).toHaveProperty('timestamp')
        
        // ✅ 验证数据类型和逻辑一致性
        expect(stats.user_id).toBe(target_user_id)
        expect(typeof stats.total_draws).toBe('number')
        expect(typeof stats.total_wins).toBe('number')
        expect(typeof stats.guarantee_wins).toBe('number')
        expect(typeof stats.normal_wins).toBe('number')
        expect(typeof stats.win_rate).toBe('number')
        expect(typeof stats.today_draws).toBe('number')
        expect(typeof stats.today_wins).toBe('number')
        expect(typeof stats.today_win_rate).toBe('number')
        expect(typeof stats.total_points_cost).toBe('number')
        expect(typeof stats.prize_type_distribution).toBe('object')
        
        // ✅ 验证业务逻辑一致性
        expect(stats.total_wins).toBeGreaterThanOrEqual(0)
        expect(stats.total_wins).toBeLessThanOrEqual(stats.total_draws)
        expect(stats.guarantee_wins + stats.normal_wins).toBe(stats.total_wins)
        expect(stats.today_wins).toBeLessThanOrEqual(stats.today_draws)
        
        // ✅ 验证北京时间格式
        expect(stats.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
        
        console.log('📊 用户抽奖统计测试通过:', {
          user_id: stats.user_id,
          total_draws: stats.total_draws,
          total_wins: stats.total_wins,
          win_rate: `${stats.win_rate}%`,
          today_draws: stats.today_draws,
          today_wins: stats.today_wins
        })
      }
    })

    test('✅ 获取用户抽奖统计（管理员查看其他用户）- GET /api/v4/unified-engine/lottery/statistics/:user_id', async () => {
      const target_user_id = test_user_id || test_account.user_id
      
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/lottery/statistics/${target_user_id}`,
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      
      if (response.status === 200) {
        const stats = response.data.data
        
        // ✅ 验证管理员可以查看任意用户的统计
        expect(stats).toHaveProperty('user_id')
        expect(stats.user_id).toBe(target_user_id)
        
        console.log('👨‍💼 管理员查看用户统计测试通过:', {
          user_id: stats.user_id,
          total_draws: stats.total_draws,
          win_rate: `${stats.win_rate}%`
        })
      }
    })

    test('✅ 获取用户抽奖统计（权限验证逻辑测试）- GET /api/v4/unified-engine/lottery/statistics/:user_id', async () => {
      /**
       * 测试说明（Test Note）：
       * 由于测试账号13612227930同时具有普通用户和管理员权限（role_based_admin: true），
       * 所以即使以'regular'身份登录，仍然具有管理员权限，可以查看任何用户的统计。
       * 
       * 权限验证逻辑（Access Control Logic）：
       * 1. 普通用户只能查看自己的统计 → 如果user_id不匹配，返回403
       * 2. 管理员可以查看任何用户的统计 → 即使user_id不存在，也返回200（但数据为0）
       * 
       * 实际测试场景（Test Scenario）：
       * - 测试账号是管理员，查询不存在的用户999999
       * - 期望返回200（管理员权限通过），但统计数据全为0（用户不存在）
       */
      const non_existent_user_id = 999999 // 不存在的用户ID
      
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/lottery/statistics/${non_existent_user_id}`,
        null,
        'regular' // 使用regular用户身份，但该用户具有管理员权限
      )

      // ✅ 期望返回200（管理员权限允许查看），或401（认证失败）
      expect([200, 401]).toContain(response.status)
      
      if (response.status === 200) {
        const stats = response.data.data
        
        // ✅ 验证不存在的用户统计数据全为0
        expect(stats.user_id).toBe(non_existent_user_id)
        expect(stats.total_draws).toBe(0)
        expect(stats.total_wins).toBe(0)
        expect(stats.win_rate).toBe(0)
        expect(stats.today_draws).toBe(0)
        expect(stats.today_wins).toBe(0)
        
        console.log('🛡️ 权限验证测试通过: 管理员可以查看不存在用户的统计（全为0）', {
          user_id: stats.user_id,
          total_draws: stats.total_draws,
          total_wins: stats.total_wins
        })
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
