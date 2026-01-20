'use strict'

/**
 * LuckDebtCalculator 单元测试
 *
 * 测试内容：
 * 1. 运气债务等级计算
 * 2. 补偿乘数计算
 * 3. 样本量检查
 * 4. 边界条件处理
 *
 * @module services/UnifiedLotteryEngine/strategy/__tests__/LuckDebtCalculator.test
 */

const LuckDebtCalculator = require('../../../services/UnifiedLotteryEngine/strategy/calculators/LuckDebtCalculator')

describe('LuckDebtCalculator', () => {
  let calculator

  beforeEach(() => {
    calculator = new LuckDebtCalculator()
  })

  describe('calculate - 运气债务计算', () => {
    test('样本量不足时返回无债务', () => {
      const result = calculator.calculate({
        global_state: {
          global_draw_count: 5, // 低于默认阈值 10
          global_empty_count: 3
        },
        user_id: 1
      })

      expect(result.debt_level).toBe('none')
      expect(result.multiplier).toBe(1.0)
      expect(result.sample_sufficient).toBe(false)
    })

    test('空奖率低于期望值时返回无债务', () => {
      const result = calculator.calculate({
        global_state: {
          global_draw_count: 100,
          global_empty_count: 20 // 20% 空奖率，低于期望 30%
        },
        user_id: 1
      })

      expect(result.debt_level).toBe('none')
      expect(result.multiplier).toBe(1.0)
      expect(result.deviation).toBeLessThanOrEqual(0)
    })

    test('空奖率略高于期望值时返回低债务', () => {
      const result = calculator.calculate({
        global_state: {
          global_draw_count: 100,
          global_empty_count: 38 // 38% 空奖率，偏离 8%（5%-10%区间）
        },
        user_id: 1
      })

      expect(result.debt_level).toBe('low')
      expect(result.multiplier).toBeGreaterThan(1.0)
      expect(result.multiplier).toBeLessThanOrEqual(1.1)
    })

    test('空奖率明显高于期望值时返回中债务', () => {
      const result = calculator.calculate({
        global_state: {
          global_draw_count: 100,
          global_empty_count: 42 // 42% 空奖率，偏离 12%（10%-15%区间）
        },
        user_id: 1
      })

      expect(result.debt_level).toBe('medium')
      expect(result.multiplier).toBeGreaterThan(1.1)
      expect(result.multiplier).toBeLessThanOrEqual(1.2)
    })

    test('空奖率严重高于期望值时返回高债务', () => {
      const result = calculator.calculate({
        global_state: {
          global_draw_count: 100,
          global_empty_count: 50 // 50% 空奖率，偏离 20%（>15%）
        },
        user_id: 1
      })

      expect(result.debt_level).toBe('high')
      expect(result.multiplier).toBeGreaterThanOrEqual(1.2)
    })

    test('enabled=false 时返回无债务', () => {
      const result = calculator.calculate({
        global_state: {
          global_draw_count: 100,
          global_empty_count: 50
        },
        user_id: 1,
        enabled: false
      })

      expect(result.debt_level).toBe('none')
      expect(result.multiplier).toBe(1.0)
      expect(result.debt_enabled).toBe(false)
    })

    test('无全局状态时返回无债务', () => {
      const result = calculator.calculate({
        global_state: null,
        user_id: 1
      })

      expect(result.debt_level).toBe('none')
      expect(result.multiplier).toBe(1.0)
    })
  })

  describe('自定义配置', () => {
    test('支持自定义期望空奖率', () => {
      const customCalculator = new LuckDebtCalculator({
        luck_debt_config: {
          expected_empty_rate: 0.4 // 更高的期望空奖率
        }
      })

      const result = customCalculator.calculate({
        global_state: {
          global_draw_count: 100,
          global_empty_count: 42 // 42%，接近期望值
        },
        user_id: 1
      })

      // 偏离值应该很小
      expect(result.deviation).toBeLessThan(0.05)
    })

    test('支持自定义最小样本量', () => {
      const customCalculator = new LuckDebtCalculator({
        luck_debt_config: {
          min_draw_count: 50
        }
      })

      const result = customCalculator.calculate({
        global_state: {
          global_draw_count: 30,
          global_empty_count: 20
        },
        user_id: 1
      })

      expect(result.sample_sufficient).toBe(false)
    })
  })
})
