'use strict'

/**
 * BudgetTierCalculator 单元测试
 *
 * 测试内容：
 * 1. 实例创建
 * 2. 阈值配置
 * 3. calculate 方法（集成测试）
 *
 * 注意：由于 calculate 方法需要数据库访问，这里使用 mock
 *
 * @module tests/unit/strategy/BudgetTierCalculator.test
 */

const BudgetTierCalculator = require('../../../services/UnifiedLotteryEngine/compute/calculators/BudgetTierCalculator')

describe('BudgetTierCalculator', () => {
  let calculator

  beforeEach(() => {
    calculator = new BudgetTierCalculator()
  })

  describe('实例化', () => {
    test('创建实例成功', () => {
      expect(calculator).toBeInstanceOf(BudgetTierCalculator)
    })

    test('默认阈值配置正确', () => {
      expect(calculator.thresholds.high).toBe(1000)
      expect(calculator.thresholds.mid).toBe(500)
      expect(calculator.thresholds.low).toBe(100)
    })

    test('支持自定义阈值', () => {
      const customCalculator = new BudgetTierCalculator({
        thresholds: {
          high: 2000,
          mid: 1000,
          low: 200
        }
      })
      expect(customCalculator.thresholds.high).toBe(2000)
      expect(customCalculator.thresholds.mid).toBe(1000)
      expect(customCalculator.thresholds.low).toBe(200)
    })
  })

  describe('_determineBudgetTier - 内部分层逻辑', () => {
    /**
     * 测试私有方法（通过反射访问）
     * 注意：测试私有方法仅用于验证核心逻辑，不推荐在生产测试中过度使用
     */
    test('effective_budget = 0 => B0', () => {
      const result = calculator._determineBudgetTier(0, calculator.thresholds)
      expect(result).toBe('B0')
    })

    test('effective_budget = 50 => B0（低于 low 阈值）', () => {
      const result = calculator._determineBudgetTier(50, calculator.thresholds)
      expect(result).toBe('B0')
    })

    test('effective_budget = 100 => B1（等于 low 阈值）', () => {
      const result = calculator._determineBudgetTier(100, calculator.thresholds)
      expect(result).toBe('B1')
    })

    test('effective_budget = 300 => B1（介于 low 和 mid 之间）', () => {
      const result = calculator._determineBudgetTier(300, calculator.thresholds)
      expect(result).toBe('B1')
    })

    test('effective_budget = 500 => B2（等于 mid 阈值）', () => {
      const result = calculator._determineBudgetTier(500, calculator.thresholds)
      expect(result).toBe('B2')
    })

    test('effective_budget = 800 => B2（介于 mid 和 high 之间）', () => {
      const result = calculator._determineBudgetTier(800, calculator.thresholds)
      expect(result).toBe('B2')
    })

    test('effective_budget = 1000 => B3（等于 high 阈值）', () => {
      const result = calculator._determineBudgetTier(1000, calculator.thresholds)
      expect(result).toBe('B3')
    })

    test('effective_budget = 5000 => B3（超过 high 阈值）', () => {
      const result = calculator._determineBudgetTier(5000, calculator.thresholds)
      expect(result).toBe('B3')
    })

    test('effective_budget = Infinity => B3（none 模式）', () => {
      const result = calculator._determineBudgetTier(Infinity, calculator.thresholds)
      expect(result).toBe('B3')
    })
  })

  describe('_calculateBudgetSufficiency - 预算充足性', () => {
    const testPrizes = [
      { prize_id: 1, prize_value_points: 0 }, // 空奖
      { prize_id: 2, prize_value_points: 50 }, // 低价值
      { prize_id: 3, prize_value_points: 100 }, // 中价值
      { prize_id: 4, prize_value_points: 500 } // 高价值
    ]

    test('预算足够时返回 is_sufficient=true', () => {
      const result = calculator._calculateBudgetSufficiency(1000, testPrizes, 'B3')
      expect(result.is_sufficient).toBe(true)
      expect(result.affordable_prizes_count).toBe(4) // 全部可负担
    })

    test('预算为 0 时只能负担空奖', () => {
      const result = calculator._calculateBudgetSufficiency(0, testPrizes, 'B0')
      expect(result.is_sufficient).toBe(false)
      expect(result.affordable_prizes_count).toBe(1) // 只有空奖
    })

    test('预算为 100 时可负担 3 个奖品', () => {
      const result = calculator._calculateBudgetSufficiency(100, testPrizes, 'B1')
      expect(result.affordable_prizes_count).toBe(3) // 空奖 + 50 + 100
    })

    test('计算最低非空奖成本', () => {
      const result = calculator._calculateBudgetSufficiency(1000, testPrizes, 'B3')
      expect(result.min_prize_cost).toBe(50) // 最低非空奖是 50
    })

    test('空奖品列表处理', () => {
      const result = calculator._calculateBudgetSufficiency(1000, [], 'B3')
      expect(result.affordable_prizes_count).toBe(0)
      expect(result.total_prizes_count).toBe(0)
    })
  })

  describe('_calculateDynamicThresholds - 动态阈值', () => {
    test('基于奖品价值计算阈值', () => {
      const prizes = [
        { prize_value_points: 0 },
        { prize_value_points: 50 },
        { prize_value_points: 100 },
        { prize_value_points: 200 },
        { prize_value_points: 400 }
      ]
      const thresholds = calculator._calculateDynamicThresholds(prizes)

      // 阈值应该有意义的层级
      expect(thresholds.low).toBeLessThan(thresholds.mid)
      expect(thresholds.mid).toBeLessThan(thresholds.high)
    })

    test('空奖品列表返回默认阈值', () => {
      const thresholds = calculator._calculateDynamicThresholds([])
      expect(thresholds.high).toBe(calculator.thresholds.high)
      expect(thresholds.mid).toBe(calculator.thresholds.mid)
      expect(thresholds.low).toBe(calculator.thresholds.low)
    })

    test('null 奖品列表返回默认阈值', () => {
      const thresholds = calculator._calculateDynamicThresholds(null)
      expect(thresholds.high).toBe(calculator.thresholds.high)
    })
  })
})
