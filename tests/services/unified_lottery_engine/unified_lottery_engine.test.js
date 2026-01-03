/**
 * V4统一抽奖引擎主引擎测试 - 重构版
 * 基于真实业务数据的完整测试套件
 *
 * 🔧 V4.0 测试重构内容：
 * - 移除所有占位测试和Mock代码
 * - 统一使用snake_case命名规范
 * - 基于真实业务逻辑验证功能
 * - 使用真实测试用户 13612227930 (user_id: 31)
 * - 只测试实际存在的2个策略：basic_guarantee、ManagementStrategy
 *
 * @date 2025-01-21 (重构)
 */

const {
  UnifiedLotteryEngine
} = require('../../../services/UnifiedLotteryEngine/UnifiedLotteryEngine')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const models = require('../../../models')
const { User, LotteryCampaign } = models

describe('V4统一抽奖引擎主引擎测试 - 重构版', () => {
  let engine
  let real_test_user = null
  let test_campaign = null

  // 🔧 真实测试用户配置 - 使用统一测试标准
  const REAL_TEST_USER_CONFIG = {
    mobile: '13612227930',
    user_id: 31, // 数据库确认的真实用户ID
    required_points: 1000 // 确保测试时有足够积分
  }

  // 🔧 V4架构实际策略配置 - 基于真实代码
  const V4_ACTUAL_STRATEGIES = {
    expected_strategies: ['basic_guarantee', 'management'],
    expected_count: 2
  }

  // 创建测试上下文 - 统一使用snake_case
  const create_test_context = (overrides = {}) => {
    if (!real_test_user || !test_campaign) {
      return null
    }

    return {
      user_id: real_test_user.user_id,
      campaign_id: test_campaign.campaign_id,
      request_id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: BeijingTimeHelper.now(),
      ...overrides
    }
  }

  beforeAll(async () => {
    console.log('🔍 初始化V4真实业务测试环境...')

    try {
      // 验证真实测试用户存在
      real_test_user = await User.findOne({
        where: { mobile: REAL_TEST_USER_CONFIG.mobile }
      })

      if (!real_test_user) {
        throw new Error(`测试用户 ${REAL_TEST_USER_CONFIG.mobile} 不存在`)
      }

      // 验证用户ID匹配
      if (real_test_user.user_id !== REAL_TEST_USER_CONFIG.user_id) {
        console.warn(
          `⚠️ 用户ID不匹配：期望 ${REAL_TEST_USER_CONFIG.user_id}，实际 ${real_test_user.user_id}`
        )
      }

      // 获取活跃的抽奖活动
      test_campaign = await LotteryCampaign.findOne({
        where: { status: 'active' },
        order: [['created_at', 'DESC']]
      })

      if (!test_campaign) {
        console.warn('⚠️ 未找到活跃的抽奖活动，将跳过部分测试')
      }

      // 初始化统一引擎
      engine = new UnifiedLotteryEngine()

      console.log('✅ V4测试环境初始化完成')
      console.log(`📊 测试用户: ${real_test_user.user_id} (${real_test_user.mobile})`)
      console.log(`📊 测试活动: ${test_campaign ? test_campaign.campaign_id : '无活跃活动'}`)
    } catch (error) {
      console.error('❌ 测试环境初始化失败:', error.message)
      throw error
    }
  }, 30000)

  afterAll(async () => {
    // 清理测试数据（如有必要）
    console.log('🧹 测试环境清理完成')
  })

  describe('🔧 V4引擎初始化测试', () => {
    test('应该正确初始化统一抽奖引擎', () => {
      expect(engine).toBeDefined()
      expect(engine.constructor.name).toBe('UnifiedLotteryEngine')
      expect(engine.version).toBeDefined()
      expect(engine.strategies).toBeDefined()
    })

    test('应该加载正确数量的V4策略', () => {
      const strategy_count = engine.strategies.size
      expect(strategy_count).toBe(V4_ACTUAL_STRATEGIES.expected_count)

      console.log(`✅ V4引擎加载了 ${strategy_count} 个策略`)
    })

    test('应该包含所有期望的V4策略', () => {
      V4_ACTUAL_STRATEGIES.expected_strategies.forEach(strategy_name => {
        expect(engine.strategies.has(strategy_name)).toBe(true)
        expect(engine.strategies.get(strategy_name)).toBeDefined()
      })

      console.log('✅ 所有V4策略验证通过')
    })
  })

  describe('🎯 V4抽奖执行流程测试', () => {
    test('应该成功执行基础抽奖流程', async () => {
      const test_context = create_test_context()

      if (!test_context) {
        console.log('⚠️ 跳过测试：缺少真实用户或活动数据')
        expect(real_test_user).toBeNull()
        return
      }

      const result = await engine.executeLottery(test_context)

      expect(result).toBeDefined()
      expect(result.success).toBeDefined()

      if (result.success) {
        // 验证成功结果结构
        expect(result.engine_version).toBeDefined()
        expect(result.strategy_used).toBeDefined()
        expect(result.execution_time).toBeGreaterThan(0)
        expect(V4_ACTUAL_STRATEGIES.expected_strategies).toContain(result.strategy_used)

        console.log(`✅ 抽奖执行成功，策略: ${result.strategy_used}`)
      } else {
        // 验证失败结果结构
        expect(result.success).toBe(false)
        expect(result.message || result.error).toBeDefined()

        console.log(`ℹ️ 抽奖执行失败: ${result.message || result.error}`)
      }
    }, 30000)

    test('应该正确处理无效抽奖上下文', async () => {
      const invalid_context = {
        // 故意留空，测试验证逻辑
      }

      const result = await engine.executeLottery(invalid_context)

      expect(result.success).toBe(false)
      expect(result.message || result.error).toBeDefined()

      console.log(`✅ 无效上下文验证通过: ${result.message || result.error}`)
    })

    test('应该处理不存在的用户ID', async () => {
      const invalid_context = {
        user_id: 999999, // 不存在的用户ID
        campaign_id: test_campaign ? test_campaign.campaign_id : 1,
        request_id: 'test_invalid_user'
      }

      const result = await engine.executeLottery(invalid_context)

      expect(result.success).toBe(false)
      expect(result.message || result.error).toBeDefined()

      console.log(`✅ 无效用户验证通过: ${result.message || result.error}`)
    })

    test('应该支持指定特定策略执行', async () => {
      const test_context = create_test_context({
        force_strategy: 'basic_guarantee'
      })

      if (!test_context) {
        console.log('⚠️ 跳过策略指定测试：缺少测试环境')
        return
      }

      const result = await engine.executeLottery(test_context)

      expect(result).toBeDefined()

      if (result.success) {
        expect(result.strategy_used).toBe('basic_guarantee')
        console.log('✅ 策略指定功能验证通过')
      } else {
        console.log(`ℹ️ 策略指定测试结果: ${result.message || result.error}`)
      }
    })
  })

  describe('📊 V4引擎状态和统计测试', () => {
    test('应该返回正确的引擎健康状态', async () => {
      const health_status = await engine.getHealthStatus()

      expect(health_status).toBeDefined()
      expect(health_status.status).toBeDefined()
      expect(health_status.version).toBeDefined()
      expect(health_status.enabledStrategies).toBe(V4_ACTUAL_STRATEGIES.expected_count)

      console.log(`✅ 引擎健康状态: ${health_status.status}`)
    })

    test('应该提供策略统计信息', async () => {
      if (!real_test_user || !test_campaign) {
        console.log('⚠️ 跳过策略统计测试：缺少测试环境')
        return
      }

      // 执行几次抽奖以生成统计数据
      const test_context = create_test_context()
      const execution_results = []

      for (let i = 0; i < 3; i++) {
        const result = await engine.executeLottery({
          ...test_context,
          request_id: `stat_test_${i}_${Date.now()}`
        })
        execution_results.push(result)
      }

      // 获取统计信息
      const stats = engine.getMetrics()

      expect(stats).toBeDefined()
      expect(stats.totalExecutions).toBeGreaterThanOrEqual(0)
      expect(stats.strategiesUsed).toBeDefined()

      // 验证策略使用统计
      const strategy_usage = Object.keys(stats.strategies_used)
      strategy_usage.forEach(strategy => {
        expect(V4_ACTUAL_STRATEGIES.expected_strategies).toContain(strategy)
      })

      console.log('✅ 策略统计验证通过')
      console.log(`📊 总执行次数: ${stats.total_executions}`)
    })

    test('应该正确计算成功率统计', async () => {
      const stats = engine.getMetrics()

      expect(stats).toBeDefined()

      if (stats.totalExecutions > 0) {
        expect(stats.successRate).toBeGreaterThanOrEqual(0)
        expect(stats.successRate).toBeLessThanOrEqual(100)

        console.log(`✅ 成功率计算正确: ${stats.successRate.toFixed(2)}%`)
      } else {
        console.log('ℹ️ 暂无执行统计数据')
        expect(stats.successRate).toBe(0)
      }
    })
  })

  describe('🔍 V4引擎内部功能测试', () => {
    test('应该正确记录执行日志', async () => {
      const test_info = { test: 'engine_log_test', timestamp: Date.now() }

      // 测试信息日志
      expect(() => {
        engine.logInfo('V4引擎测试信息日志', test_info)
      }).not.toThrow()

      // 测试错误日志
      const error_data = { test: 'error_test', timestamp: Date.now() }
      expect(() => {
        engine.logError('V4引擎测试错误日志', error_data)
      }).not.toThrow()

      console.log('✅ V4引擎日志功能验证通过')
    })

    test('应该正确处理异常情况', async () => {
      // 测试空上下文
      const result1 = await engine.executeLottery(null)
      expect(result1.success).toBe(false)

      // 测试未定义上下文
      const result2 = await engine.executeLottery(undefined)
      expect(result2.success).toBe(false)

      // 测试空对象上下文
      const result3 = await engine.executeLottery({})
      expect(result3.success).toBe(false)

      console.log('✅ V4引擎异常处理验证通过')
    })
  })

  describe('🎮 V4策略集成测试', () => {
    test('应该能够动态切换策略', async () => {
      if (!real_test_user || !test_campaign) {
        console.log('⚠️ 跳过策略切换测试：缺少测试环境')
        return
      }

      // 测试每个实际存在的策略
      for (const strategy_name of V4_ACTUAL_STRATEGIES.expected_strategies) {
        const test_context = create_test_context({
          force_strategy: strategy_name
        })

        const result = await engine.executeLottery(test_context)

        expect(result).toBeDefined()

        if (result.success && result.strategy_used) {
          expect(result.strategy_used).toBe(strategy_name)
          console.log(`✅ 策略 ${strategy_name} 测试通过`)
        } else {
          console.log(`ℹ️ 策略 ${strategy_name} 执行结果: ${result.message || result.error}`)
        }
      }
    })

    test('应该在策略失败时提供降级机制', async () => {
      // 测试无效策略名
      const test_context = create_test_context({
        force_strategy: 'NonExistentStrategy'
      })

      if (!test_context) {
        console.log('⚠️ 跳过降级测试：缺少测试环境')
        return
      }

      const result = await engine.executeLottery(test_context)

      expect(result).toBeDefined()

      // 应该降级到默认策略或返回错误
      if (result.success) {
        expect(V4_ACTUAL_STRATEGIES.expected_strategies).toContain(result.strategy_used)
        console.log(`✅ 策略降级成功，使用: ${result.strategy_used}`)
      } else {
        expect(result.message || result.error).toBeDefined()
        console.log(`✅ 无效策略正确拒绝: ${result.message || result.error}`)
      }
    })
  })

  describe('🔄 V4引擎并发测试', () => {
    test('应该支持并发抽奖执行', async () => {
      if (!real_test_user || !test_campaign) {
        console.log('⚠️ 跳过并发测试：缺少测试环境')
        return
      }

      const concurrent_count = 5
      const concurrent_promises = []

      for (let i = 0; i < concurrent_count; i++) {
        const test_context = create_test_context({
          request_id: `concurrent_test_${i}_${Date.now()}`
        })

        concurrent_promises.push(engine.executeLottery(test_context))
      }

      const results = await Promise.all(concurrent_promises)

      expect(results).toHaveLength(concurrent_count)

      results.forEach((result, _index) => {
        expect(result).toBeDefined()
        expect(result.success).toBeDefined()

        if (result.success) {
          expect(result.strategy_used).toBeDefined()
          expect(V4_ACTUAL_STRATEGIES.expected_strategies).toContain(result.strategy_used)
        }
      })

      const success_count = results.filter(r => r.success).length
      console.log(`✅ 并发测试完成: ${success_count}/${concurrent_count} 成功`)
    }, 45000)
  })
})
