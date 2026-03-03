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

/**
 * 默认阈值基于 ratio=0.22 动态计算：
 *   high = round(100 * 0.22 * 5) = 110
 *   mid  = round(100 * 0.22 * 2) = 44
 *   low  = round(100 * 0.22 * 1) = 22
 */
const DEFAULT_RATIO = 0.22
const EXPECTED_DEFAULTS = {
  high: Math.round(100 * DEFAULT_RATIO * 5),
  mid: Math.round(100 * DEFAULT_RATIO * 2),
  low: Math.round(100 * DEFAULT_RATIO * 1)
}

describe('BudgetTierCalculator', () => {
  let calculator

  beforeEach(() => {
    calculator = new BudgetTierCalculator()
  })

  describe('实例化', () => {
    test('创建实例成功', () => {
      expect(calculator).toBeInstanceOf(BudgetTierCalculator)
    })

    test('默认阈值基于 ratio=0.22 动态计算', () => {
      expect(calculator.thresholds.high).toBe(EXPECTED_DEFAULTS.high)
      expect(calculator.thresholds.mid).toBe(EXPECTED_DEFAULTS.mid)
      expect(calculator.thresholds.low).toBe(EXPECTED_DEFAULTS.low)
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

    test('支持自定义 ratio 计算默认阈值', () => {
      const customRatio = 0.5
      const calc = new BudgetTierCalculator({ budget_allocation_ratio: customRatio })
      expect(calc.thresholds.high).toBe(Math.round(100 * customRatio * 5))
      expect(calc.thresholds.mid).toBe(Math.round(100 * customRatio * 2))
      expect(calc.thresholds.low).toBe(Math.round(100 * customRatio * 1))
    })
  })

  describe('_determineBudgetTier - 内部分层逻辑', () => {
    test('effective_budget = 0 => B0', () => {
      const result = calculator._determineBudgetTier(0, calculator.thresholds)
      expect(result).toBe('B0')
    })

    test('effective_budget = 10 => B0（低于 low=22 阈值）', () => {
      const result = calculator._determineBudgetTier(10, calculator.thresholds)
      expect(result).toBe('B0')
    })

    test('effective_budget = 22 => B1（等于 low 阈值）', () => {
      const result = calculator._determineBudgetTier(EXPECTED_DEFAULTS.low, calculator.thresholds)
      expect(result).toBe('B1')
    })

    test('effective_budget = 30 => B1（介于 low=22 和 mid=44 之间）', () => {
      const result = calculator._determineBudgetTier(30, calculator.thresholds)
      expect(result).toBe('B1')
    })

    test('effective_budget = 44 => B2（等于 mid 阈值）', () => {
      const result = calculator._determineBudgetTier(EXPECTED_DEFAULTS.mid, calculator.thresholds)
      expect(result).toBe('B2')
    })

    test('effective_budget = 80 => B2（介于 mid=44 和 high=110 之间）', () => {
      const result = calculator._determineBudgetTier(80, calculator.thresholds)
      expect(result).toBe('B2')
    })

    test('effective_budget = 110 => B3（等于 high 阈值）', () => {
      const result = calculator._determineBudgetTier(EXPECTED_DEFAULTS.high, calculator.thresholds)
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
      { lottery_prize_id: 1, prize_value_points: 0 }, // 空奖
      { lottery_prize_id: 2, prize_value_points: 50 }, // 低价值
      { lottery_prize_id: 3, prize_value_points: 100 }, // 中价值
      { lottery_prize_id: 4, prize_value_points: 500 } // 高价值
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
    test('基于奖品 reward_tier 和 prize_value_points 计算阈值', () => {
      const prizes = [
        { reward_tier: 'high', prize_value_points: 40 },
        { reward_tier: 'high', prize_value_points: 20 },
        { reward_tier: 'mid', prize_value_points: 10 },
        { reward_tier: 'mid', prize_value_points: 5 },
        { reward_tier: 'low', prize_value_points: 1 },
        { reward_tier: 'low', prize_value_points: 0, is_fallback: true }
      ]
      const thresholds = calculator._calculateDynamicThresholds(prizes)

      expect(thresholds.high).toBe(20)
      expect(thresholds.mid).toBe(5)
      expect(thresholds.low).toBe(1)
      expect(thresholds.low).toBeLessThanOrEqual(thresholds.mid)
      expect(thresholds.mid).toBeLessThanOrEqual(thresholds.high)
    })

    test('A 层修复：某档全部 prize_value_points=0 时阈值回退到 0 而非默认值', () => {
      const prizes = [
        { reward_tier: 'high', prize_value_points: 20 },
        { reward_tier: 'mid', prize_value_points: 5 },
        { reward_tier: 'low', prize_value_points: 0 },
        { reward_tier: 'low', prize_value_points: 0 }
      ]
      const thresholds = calculator._calculateDynamicThresholds(prizes)

      expect(thresholds.low).toBe(0)
      expect(thresholds.mid).toBe(5)
      expect(thresholds.high).toBe(20)
    })

    test('B 层修复：保序向下收敛（low 不拉高 mid）', () => {
      const prizes = [
        { reward_tier: 'high', prize_value_points: 10 },
        { reward_tier: 'mid', prize_value_points: 5 },
        { reward_tier: 'low', prize_value_points: 50 }
      ]
      const thresholds = calculator._calculateDynamicThresholds(prizes)

      expect(thresholds.low).toBeLessThanOrEqual(thresholds.mid)
      expect(thresholds.mid).toBeLessThanOrEqual(thresholds.high)
      expect(thresholds.low).toBe(5)
      expect(thresholds.mid).toBe(5)
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
