/**
 * V4决策核心测试 - 基于真实实现
 * 测试DecisionCore的实际方法，使用真实数据
 * 创建时间：2025年01月21日 北京时间
 */

const DecisionCore = require('../../../../services/UnifiedLotteryEngine/core/DecisionCore')
const { getTestAccountConfig } = require('../../../../utils/TestAccountManager')
const { getDatabaseHelper } = require('../../../../utils/UnifiedDatabaseHelper')

describe('🧠 DecisionCore 决策核心测试套件', () => {
  let decisionCore
  let test_user_id
  let test_campaign_id
  let dbHelper

  beforeAll(async () => {
    dbHelper = getDatabaseHelper()
    await dbHelper.ensureConnection()

    // 🔴 获取真实测试数据
    const testConfig = await getTestAccountConfig()
    test_user_id = testConfig.user_id

    // 获取真实活动ID，确保存在
    const campaigns = await dbHelper.query(
      'SELECT campaign_id FROM lottery_campaigns LIMIT 1'
    )
    test_campaign_id = campaigns[0]?.campaign_id || 2 // 使用第一个可用的活动

    decisionCore = new DecisionCore()
  })

  afterAll(async () => {
    await dbHelper.disconnect()
  })

  describe('🎯 核心决策执行功能', () => {
    test('应该正确初始化DecisionCore', () => {
      expect(decisionCore).toBeInstanceOf(DecisionCore)
      expect(decisionCore.contextBuilder).toBeDefined()
      expect(decisionCore.resultGenerator).toBeDefined()
      expect(decisionCore.cacheManager).toBeDefined()
      expect(decisionCore.logger).toBeDefined()
    })

    test('应该正确执行完整决策流程', async () => {
      const context = {
        userId: test_user_id,
        activityId: test_campaign_id, // 使用ContextBuilder期望的字段名
        lotteryType: 'basic'
      }

      const result = await decisionCore.executeDecision(context)

      expect(result).toBeDefined()
      expect(result.userId).toBe(test_user_id)
      expect(result.guaranteeResult).toBeDefined()
      expect(result.timestamp).toBeDefined()
    }, 30000)

    test('应该正确处理无效上下文', async () => {
      const invalidContext = {
        userId: null,
        activityId: null
      }

      await expect(decisionCore.executeDecision(invalidContext)).rejects.toThrow()
    })

    test('应该正确处理不存在的用户', async () => {
      const invalidContext = {
        userId: 999999, // 不存在的用户
        activityId: test_campaign_id,
        lotteryType: 'basic'
      }

      await expect(decisionCore.executeDecision(invalidContext)).rejects.toThrow()
    })
  })

  describe('🛡️ 保底机制测试', () => {
    test('应该正确处理保底机制', async () => {
      // 创建模拟用户历史数据
      const mockUserHistory = [
        { is_winner: false, created_at: new Date(Date.now() - 60000) },
        { is_winner: false, created_at: new Date(Date.now() - 120000) },
        { is_winner: false, created_at: new Date(Date.now() - 180000) }
      ]

      const mockContext = {
        userHistory: mockUserHistory
      }

      const guaranteeResult = await decisionCore.processGuarantee(mockContext)

      expect(guaranteeResult).toBeDefined()
      expect(guaranteeResult).toHaveProperty('isGuaranteeTriggered')
      expect(guaranteeResult).toHaveProperty('forceWin')
      expect(guaranteeResult).toHaveProperty('probabilityBoost')
      expect(guaranteeResult).toHaveProperty('failureCount')
      expect(guaranteeResult.failureCount).toBe(3)
    })

    test('应该正确触发强制中奖保底', async () => {
      // 创建连续失败10次的历史
      const failureHistory = Array(10).fill(null).map((_, index) => ({
        is_winner: false,
        created_at: new Date(Date.now() - (index + 1) * 60000)
      }))

      const mockContext = {
        userHistory: failureHistory
      }

      const guaranteeResult = await decisionCore.processGuarantee(mockContext)

      expect(guaranteeResult.isGuaranteeTriggered).toBe(true)
      expect(guaranteeResult.forceWin).toBe(true)
      expect(guaranteeResult.guaranteeReason).toContain('连续失败达到保底上限')
    })

    test('应该正确应用概率提升', async () => {
      // 创建连续失败6次的历史（触发概率提升）
      const failureHistory = Array(6).fill(null).map((_, index) => ({
        is_winner: false,
        created_at: new Date(Date.now() - (index + 1) * 60000)
      }))

      const mockContext = {
        userHistory: failureHistory
      }

      const guaranteeResult = await decisionCore.processGuarantee(mockContext)

      expect(guaranteeResult.isGuaranteeTriggered).toBe(true)
      expect(guaranteeResult.forceWin).toBe(false)
      expect(guaranteeResult.probabilityBoost).toBeGreaterThan(1.0)
      expect(guaranteeResult.guaranteeReason.join(' ')).toContain('概率提升')
    })

    test('应该正确处理无保底触发情况', async () => {
      // 创建成功的历史记录
      const successHistory = [
        { is_winner: true, created_at: new Date(Date.now() - 60000) },
        { is_winner: false, created_at: new Date(Date.now() - 120000) }
      ]

      const mockContext = {
        userHistory: successHistory
      }

      const guaranteeResult = await decisionCore.processGuarantee(mockContext)

      expect(guaranteeResult.isGuaranteeTriggered).toBe(false)
      expect(guaranteeResult.forceWin).toBe(false)
      expect(guaranteeResult.probabilityBoost).toBe(1.0)
    })
  })

  describe('⚡ 配置和设置测试', () => {
    test('应该有正确的默认配置', () => {
      expect(decisionCore.config).toBeDefined()
      expect(decisionCore.config.enableCache).toBe(true)
      expect(decisionCore.config.cacheTimeout).toBe(5 * 60 * 1000)
      expect(decisionCore.config.maxProbability).toBe(1.0)
      expect(decisionCore.config.minProbability).toBe(0.0)
    })

    test('应该能够正确访问配置项', () => {
      expect(typeof decisionCore.config.enableCache).toBe('boolean')
      expect(typeof decisionCore.config.cacheTimeout).toBe('number')
      expect(typeof decisionCore.config.maxProbability).toBe('number')
      expect(typeof decisionCore.config.minProbability).toBe('number')
    })
  })

  describe('🔧 错误处理测试', () => {
    test('应该正确处理无效用户历史数据', async () => {
      const invalidContext = {
        userHistory: null
      }

      const guaranteeResult = await decisionCore.processGuarantee(invalidContext)
      expect(guaranteeResult).toBeDefined()
      expect(guaranteeResult.failureCount).toBe(0)
    })

    test('应该正确处理空用户历史数据', async () => {
      const emptyContext = {
        userHistory: []
      }

      const guaranteeResult = await decisionCore.processGuarantee(emptyContext)
      expect(guaranteeResult).toBeDefined()
      expect(guaranteeResult.failureCount).toBe(0)
      expect(guaranteeResult.isGuaranteeTriggered).toBe(false)
    })

    test('应该正确处理异常数据格式', async () => {
      const malformedContext = {
        userHistory: [
          { is_winner: 'invalid', created_at: 'invalid_date' },
          { random_field: 'random_value' }
        ]
      }

      const guaranteeResult = await decisionCore.processGuarantee(malformedContext)
      expect(guaranteeResult).toBeDefined()
      // 应该能够处理异常数据而不崩溃
    })
  })

  describe('📊 数据验证测试', () => {
    test('应该正确计算连续失败次数', async () => {
      const mixedHistory = [
        { is_winner: false, created_at: new Date(Date.now() - 30000) },
        { is_winner: false, created_at: new Date(Date.now() - 60000) },
        { is_winner: true, created_at: new Date(Date.now() - 90000) },
        { is_winner: false, created_at: new Date(Date.now() - 120000) }
      ]

      const mockContext = {
        userHistory: mixedHistory
      }

      const guaranteeResult = await decisionCore.processGuarantee(mockContext)

      // 应该只计算24小时内的连续失败，并且统计所有失败记录
      expect(guaranteeResult.failureCount).toBe(3) // 3个false记录在24小时内
    })

    test('应该正确识别中奖记录', async () => {
      const historyWithWin = [
        { is_winner: false, created_at: new Date(Date.now() - 30000) },
        { is_winner: true, created_at: new Date(Date.now() - 60000) },
        { is_winner: false, created_at: new Date(Date.now() - 90000) }
      ]

      const mockContext = {
        userHistory: historyWithWin
      }

      const guaranteeResult = await decisionCore.processGuarantee(mockContext)

      expect(guaranteeResult.timeSinceLastWin).toBeGreaterThan(0)
      expect(guaranteeResult.timeSinceLastWin).toBeLessThan(120000) // 2分钟内
    })
  })

  describe('⏱️ 性能测试', () => {
    test('决策执行应该在合理时间内完成', async () => {
      const context = {
        userId: test_user_id,
        activityId: test_campaign_id,
        lotteryType: 'basic'
      }

      const startTime = Date.now()
      const result = await decisionCore.executeDecision(context)
      const executionTime = Date.now() - startTime

      expect(result).toBeDefined()
      expect(executionTime).toBeLessThan(5000) // 5秒内完成
    }, 30000)

    test('保底机制处理应该高效', async () => {
      const largeHistory = Array(100).fill(null).map((_, index) => ({
        is_winner: Math.random() > 0.8,
        created_at: new Date(Date.now() - index * 60000)
      }))

      const mockContext = {
        userHistory: largeHistory
      }

      const startTime = Date.now()
      const guaranteeResult = await decisionCore.processGuarantee(mockContext)
      const executionTime = Date.now() - startTime

      expect(guaranteeResult).toBeDefined()
      expect(executionTime).toBeLessThan(100) // 100ms内完成
    })
  })
})
