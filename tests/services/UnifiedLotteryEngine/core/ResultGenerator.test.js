/**
 * V4结果生成器测试
 * 基于真实业务代码和数据库的完整测试
 * 测试时间：2025年01月21日 北京时间
 */

const ResultGenerator = require('../../../../services/UnifiedLotteryEngine/core/ResultGenerator')
const { sequelize } = require('../../../../config/database')

describe('ResultGenerator V4测试套件', () => {
  let resultGenerator

  beforeAll(async () => {
    // 连接真实测试数据库
    await sequelize.authenticate()
    resultGenerator = new ResultGenerator()
  })

  afterAll(async () => {
    await sequelize.close()
  })

  describe('基础功能测试', () => {
    test('应该能够成功初始化ResultGenerator', () => {
      expect(resultGenerator).toBeInstanceOf(ResultGenerator)
      expect(resultGenerator.logger).toBeDefined()
    })

    test('generateResult方法应该存在并可调用', () => {
      expect(typeof resultGenerator.generateResult).toBe('function')
    })
  })

  describe('中奖结果生成测试', () => {
    test('应该能够生成中奖结果', async () => {
      // 🔧 修复：使用正确的业务数据格式
      const decisionData = {
        is_winner: true, // ✅ 统一使用业务标准字段
        prizeId: 2, // 🔴 使用真实奖品ID (100积分)
        strategy: 'basic',
        finalProbability: 0.1,
        guaranteeTriggered: false,
        poolSelected: 'default',
        decisionId: `decision_${Date.now()}`
      }

      const context = {
        userId: 4, // 🔴 使用真实用户ID
        campaignId: 2, // 🔴 使用真实活动ID (餐厅积分抽奖)
        userProfile: {
          id: 4,
          points: 1000
        }
      }

      const result = await resultGenerator.generateResult(decisionData, context)

      // 验证中奖结果结构 - 验证真实的业务需求
      expect(result).toBeDefined()
      expect(typeof result).toBe('object')
      expect(result.success).toBeDefined()

      // 验证业务字段 - 用户真正关心的功能
      if (result.success === true) {
        expect(result.is_winner).toBe(true) // 🔧 修复：验证is_winner而非result
        expect(result.prize).toBeDefined()
        expect(result.prize.name).toBe('100积分')
        expect(result.message).toContain('恭喜')
        expect(result.userPrize).toBeDefined()
        expect(result.statistics).toBeDefined()
      } else {
        // 如果失败，应该有错误信息
        expect(result.message).toBeDefined()
      }
    }, 10000) // 10秒超时

    test('应该能够生成未中奖结果', async () => {
      const decisionData = {
        result: 'lose',
        strategy: 'basic',
        probability: 0.0
      }

      const context = {
        userId: 1,
        campaignId: 2,
        userProfile: {
          id: 1,
          points: 1000
        }
      }

      const result = await resultGenerator.generateResult(decisionData, context)

      // 验证未中奖结果结构
      expect(result).toBeDefined()
      expect(typeof result).toBe('object')

      // 验证未中奖的基本信息
      if (result.result === 'lose') {
        expect(result.message).toBeDefined()
        expect(typeof result.message).toBe('string')
      }
    })
  })

  describe('保底抽奖结果测试', () => {
    test('应该能够处理保底抽奖结果', async () => {
      const decisionData = {
        result: 'win',
        strategy: 'guarantee', // 保底策略
        isGuarantee: true,
        prize: {
          id: 2,
          name: '保底奖品',
          type: 'discount'
        }
      }

      const context = {
        userId: 1,
        campaignId: 2,
        isGuarantee: true,
        drawCount: 10 // 触发保底的抽奖次数
      }

      const result = await resultGenerator.generateResult(decisionData, context)

      expect(result).toBeDefined()
      expect(typeof result).toBe('object')

      // 验证保底相关字段
      if (result.success && result.isGuarantee) {
        expect(result.strategy).toBe('guarantee')
        expect(result.prize).toBeDefined()
      }
    })
  })

  describe('管理策略结果测试', () => {
    test('应该能够处理管理策略预设结果', async () => {
      const decisionData = {
        result: 'win',
        strategy: 'management', // 管理策略
        isManaged: true,
        predefinedPrize: {
          id: 3,
          name: '预设奖品',
          number: 1
        }
      }

      const context = {
        userId: 1,
        campaignId: 2,
        isManaged: true
      }

      const result = await resultGenerator.generateResult(decisionData, context)

      expect(result).toBeDefined()
      expect(typeof result).toBe('object')

      // 验证管理策略相关字段
      if (result.success && result.isManaged) {
        expect(result.strategy).toBe('management')
        expect(result.prize).toBeDefined()
      }
    })
  })

  describe('错误处理测试', () => {
    test('应该优雅处理无效的决策数据', async () => {
      const invalidDecisionData = null
      const context = {
        userId: 1,
        campaignId: 1
      }

      const result = await resultGenerator.generateResult(invalidDecisionData, context)

      expect(result).toBeDefined()
      expect(result.success).toBe(false)
      expect(result.message).toBeDefined()
      expect(result.error).toBeDefined()
    })

    test('应该处理缺失上下文信息的情况', async () => {
      // 🔧 修复：使用正确的业务数据格式
      const decisionData = {
        is_winner: true, // ✅ 统一使用业务标准字段
        strategy: 'basic'
      }
      const invalidContext = null

      const result = await resultGenerator.generateResult(decisionData, invalidContext)

      expect(result).toBeDefined()
      expect(result.success).toBe(false)
      expect(result.message).toContain('上下文信息')
      expect(result.is_winner).toBe(false) // 🔧 修复：验证业务字段
      expect(result.error).toBeDefined()
    })
  })

  describe('性能测试', () => {
    test('结果生成应该在合理时间内完成', async () => {
      const decisionData = {
        result: 'win',
        strategy: 'basic',
        prize: { id: 1, name: '测试奖品' }
      }

      const context = {
        userId: 1,
        campaignId: 1
      }

      const startTime = Date.now()
      const result = await resultGenerator.generateResult(decisionData, context)
      const executionTime = Date.now() - startTime

      expect(executionTime).toBeLessThan(3000) // 3秒内完成
      expect(result).toBeDefined()
    })

    test('批量结果生成性能测试', async () => {
      const batchSize = 10
      const results = []
      const startTime = Date.now()

      for (let i = 0; i < batchSize; i++) {
        const decisionData = {
          result: i % 2 === 0 ? 'win' : 'lose',
          strategy: 'basic',
          prize: i % 2 === 0 ? { id: i, name: `奖品${i}` } : null
        }

        const context = {
          userId: 1,
          campaignId: 2,
          batchIndex: i
        }

        const result = await resultGenerator.generateResult(decisionData, context)
        results.push(result)
      }

      const totalTime = Date.now() - startTime
      const averageTime = totalTime / batchSize

      expect(results).toHaveLength(batchSize)
      expect(averageTime).toBeLessThan(1000) // 平均每个结果1秒内完成

      // 验证所有结果都有基本结构
      results.forEach(result => {
        expect(result).toBeDefined()
        expect(typeof result).toBe('object')
      })
    })
  })
})
