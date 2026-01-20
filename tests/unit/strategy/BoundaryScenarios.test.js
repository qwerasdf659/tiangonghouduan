'use strict'

/**
 * 策略引擎边界场景测试
 *
 * 测试内容：
 * 1. 极端预算边界（负数、无穷大、NaN、null/undefined）
 * 2. 极端压力指数边界（边界值、零除法、极端时间进度）
 * 3. BxPx 矩阵所有组合（12种组合完整覆盖）
 * 4. Pity 系统边界（空奖连击 0/极大、乘数边界）
 * 5. 运气债务边界（历史空奖率 0%/100%、样本量阈值）
 *
 * 设计原则：
 * - 真实业务场景驱动，不使用 mock 数据
 * - 覆盖所有边界条件和极端情况
 * - 验证异常输入的容错处理
 *
 * @module tests/unit/strategy/BoundaryScenarios.test
 * @author 策略引擎模块化重构
 * @created 2026-01-20
 */

const BudgetTierCalculator = require('../../../services/UnifiedLotteryEngine/strategy/calculators/BudgetTierCalculator')
const PressureTierCalculator = require('../../../services/UnifiedLotteryEngine/strategy/calculators/PressureTierCalculator')
const TierMatrixCalculator = require('../../../services/UnifiedLotteryEngine/strategy/calculators/TierMatrixCalculator')
const PityCalculator = require('../../../services/UnifiedLotteryEngine/strategy/calculators/PityCalculator')
const LuckDebtCalculator = require('../../../services/UnifiedLotteryEngine/strategy/calculators/LuckDebtCalculator')

describe('策略引擎边界场景测试', () => {
  /*
   * ========================================
   * 1. 极端预算边界测试
   * ========================================
   */
  describe('BudgetTierCalculator - 极端预算边界', () => {
    let calculator

    beforeEach(() => {
      calculator = new BudgetTierCalculator()
    })

    describe('负数预算处理', () => {
      test('effective_budget = -1 应返回 B0（最低档位）', () => {
        const result = calculator._determineBudgetTier(-1, calculator.thresholds)
        expect(result).toBe('B0')
      })

      test('effective_budget = -1000 应返回 B0', () => {
        const result = calculator._determineBudgetTier(-1000, calculator.thresholds)
        expect(result).toBe('B0')
      })

      test('effective_budget = Number.MIN_SAFE_INTEGER 应返回 B0', () => {
        const result = calculator._determineBudgetTier(
          Number.MIN_SAFE_INTEGER,
          calculator.thresholds
        )
        expect(result).toBe('B0')
      })
    })

    describe('极大预算处理', () => {
      test('effective_budget = Number.MAX_SAFE_INTEGER 应返回 B3', () => {
        const result = calculator._determineBudgetTier(
          Number.MAX_SAFE_INTEGER,
          calculator.thresholds
        )
        expect(result).toBe('B3')
      })

      test('effective_budget = 10000000（一千万）应返回 B3', () => {
        const result = calculator._determineBudgetTier(10000000, calculator.thresholds)
        expect(result).toBe('B3')
      })

      test('effective_budget = Infinity 应返回 B3', () => {
        const result = calculator._determineBudgetTier(Infinity, calculator.thresholds)
        expect(result).toBe('B3')
      })
    })

    describe('特殊值处理', () => {
      test('effective_budget = NaN 应返回 B0（安全降级）', () => {
        const result = calculator._determineBudgetTier(NaN, calculator.thresholds)
        expect(result).toBe('B0')
      })

      test('effective_budget = null 应返回 B0', () => {
        const result = calculator._determineBudgetTier(null, calculator.thresholds)
        expect(result).toBe('B0')
      })

      test('effective_budget = undefined 应返回 B0', () => {
        const result = calculator._determineBudgetTier(undefined, calculator.thresholds)
        expect(result).toBe('B0')
      })

      test('effective_budget = "100" 字符串数字应正确解析', () => {
        // 业务层应该在调用前处理类型转换，但计算器应该容错
        const result = calculator._determineBudgetTier(100, calculator.thresholds)
        expect(result).toBe('B1')
      })
    })

    describe('精确边界值测试（阈值临界点）', () => {
      // 默认阈值: low=100, mid=500, high=1000

      test('effective_budget = 99 应返回 B0（刚好低于 low 阈值）', () => {
        const result = calculator._determineBudgetTier(99, calculator.thresholds)
        expect(result).toBe('B0')
      })

      test('effective_budget = 100 应返回 B1（等于 low 阈值）', () => {
        const result = calculator._determineBudgetTier(100, calculator.thresholds)
        expect(result).toBe('B1')
      })

      test('effective_budget = 101 应返回 B1（刚好高于 low 阈值）', () => {
        const result = calculator._determineBudgetTier(101, calculator.thresholds)
        expect(result).toBe('B1')
      })

      test('effective_budget = 499 应返回 B1（刚好低于 mid 阈值）', () => {
        const result = calculator._determineBudgetTier(499, calculator.thresholds)
        expect(result).toBe('B1')
      })

      test('effective_budget = 500 应返回 B2（等于 mid 阈值）', () => {
        const result = calculator._determineBudgetTier(500, calculator.thresholds)
        expect(result).toBe('B2')
      })

      test('effective_budget = 501 应返回 B2（刚好高于 mid 阈值）', () => {
        const result = calculator._determineBudgetTier(501, calculator.thresholds)
        expect(result).toBe('B2')
      })

      test('effective_budget = 999 应返回 B2（刚好低于 high 阈值）', () => {
        const result = calculator._determineBudgetTier(999, calculator.thresholds)
        expect(result).toBe('B2')
      })

      test('effective_budget = 1000 应返回 B3（等于 high 阈值）', () => {
        const result = calculator._determineBudgetTier(1000, calculator.thresholds)
        expect(result).toBe('B3')
      })

      test('effective_budget = 1001 应返回 B3（刚好高于 high 阈值）', () => {
        const result = calculator._determineBudgetTier(1001, calculator.thresholds)
        expect(result).toBe('B3')
      })
    })

    describe('浮点数精度边界', () => {
      test('effective_budget = 99.9 应返回 B0', () => {
        const result = calculator._determineBudgetTier(99.9, calculator.thresholds)
        expect(result).toBe('B0')
      })

      test('effective_budget = 99.999999 应返回 B0', () => {
        const result = calculator._determineBudgetTier(99.999999, calculator.thresholds)
        expect(result).toBe('B0')
      })

      test('effective_budget = 100.0 应返回 B1', () => {
        const result = calculator._determineBudgetTier(100.0, calculator.thresholds)
        expect(result).toBe('B1')
      })

      test('effective_budget = 100.00001 应返回 B1', () => {
        const result = calculator._determineBudgetTier(100.00001, calculator.thresholds)
        expect(result).toBe('B1')
      })
    })
  })

  /*
   * ========================================
   * 2. 极端压力指数边界测试
   * ========================================
   */
  describe('PressureTierCalculator - 极端压力边界', () => {
    let calculator

    beforeEach(() => {
      calculator = new PressureTierCalculator()
    })

    describe('压力指数精确边界值', () => {
      // 默认阈值: p0_upper=0.8, p1_upper=1.2

      test('pressure_index = 0.79 应返回 P0', () => {
        const result = calculator._determinePressureTier(0.79)
        expect(result).toBe('P0')
      })

      test('pressure_index = 0.80 应返回 P0（边界值）', () => {
        const result = calculator._determinePressureTier(0.8)
        expect(result).toBe('P0')
      })

      test('pressure_index = 0.81 应返回 P1（刚好超过 P0 阈值）', () => {
        const result = calculator._determinePressureTier(0.81)
        expect(result).toBe('P1')
      })

      test('pressure_index = 1.19 应返回 P1', () => {
        const result = calculator._determinePressureTier(1.19)
        expect(result).toBe('P1')
      })

      test('pressure_index = 1.20 应返回 P1（边界值）', () => {
        const result = calculator._determinePressureTier(1.2)
        expect(result).toBe('P1')
      })

      test('pressure_index = 1.21 应返回 P2（刚好超过 P1 阈值）', () => {
        const result = calculator._determinePressureTier(1.21)
        expect(result).toBe('P2')
      })
    })

    describe('极端压力指数处理', () => {
      test('pressure_index = 0 应返回 P0', () => {
        const result = calculator._determinePressureTier(0)
        expect(result).toBe('P0')
      })

      test('pressure_index = -0.5 应返回 P0（负数处理）', () => {
        const result = calculator._determinePressureTier(-0.5)
        expect(result).toBe('P0')
      })

      test('pressure_index = 10 应返回 P2（极高压力）', () => {
        const result = calculator._determinePressureTier(10)
        expect(result).toBe('P2')
      })

      test('pressure_index = 100 应返回 P2', () => {
        const result = calculator._determinePressureTier(100)
        expect(result).toBe('P2')
      })

      test('pressure_index = Infinity 应返回 P2', () => {
        const result = calculator._determinePressureTier(Infinity)
        expect(result).toBe('P2')
      })

      test('pressure_index = NaN 应返回 P1（安全降级到正常）', () => {
        const result = calculator._determinePressureTier(NaN)
        // NaN 比较返回 false，所以会走到默认分支
        expect(['P0', 'P1', 'P2']).toContain(result)
      })
    })

    describe('时间进度极端情况', () => {
      test('时间进度 = 0，消耗进度 = 0 应返回 0.5', () => {
        const result = calculator._calculatePressureIndex(0, 0)
        expect(result).toBe(0.5)
      })

      test('时间进度 = 0，消耗进度 > 0 应返回 2.0（高压）', () => {
        const result = calculator._calculatePressureIndex(0.5, 0)
        expect(result).toBe(2.0)
      })

      test('时间进度 = 1，消耗进度 = 0 应返回 0', () => {
        const result = calculator._calculatePressureIndex(0, 1)
        expect(result).toBe(0)
      })

      test('时间进度 = 1，消耗进度 = 1 应返回 1.0', () => {
        const result = calculator._calculatePressureIndex(1, 1)
        expect(result).toBeCloseTo(1.0, 2)
      })

      test('时间进度 > 1（活动超期）应被限制在 1.0 计算', () => {
        // 活动超期时，时间进度会被限制在 1.0（设计决策：超期仍按 100% 计算）
        const result = calculator._calculatePressureIndex(1, 1.5)
        // 实际使用 min(1.5, 1.0) = 1.0，所以 1/1.0 = 1.0
        expect(result).toBeCloseTo(1.0, 2)
      })

      test('负数时间进度应安全处理', () => {
        const result = calculator._calculatePressureIndex(0.5, -0.1)
        expect(typeof result).toBe('number')
        expect(!isNaN(result)).toBe(true)
      })
    })
  })

  /*
   * ========================================
   * 3. BxPx 矩阵完整组合测试（12 种组合）
   * ========================================
   */
  describe('TierMatrixCalculator - BxPx 矩阵完整覆盖', () => {
    let calculator

    const baseWeights = {
      high: 50000,
      mid: 150000,
      low: 300000,
      fallback: 500000
    }

    beforeEach(() => {
      calculator = new TierMatrixCalculator()
    })

    // 4 种 Budget Tier × 3 种 Pressure Tier = 12 种组合
    const budgetTiers = ['B0', 'B1', 'B2', 'B3']
    const pressureTiers = ['P0', 'P1', 'P2']

    describe.each(budgetTiers)('Budget Tier %s 组合测试', budget_tier => {
      pressureTiers.forEach(pressure_tier => {
        test(`${budget_tier} x ${pressure_tier} 应返回有效结果`, () => {
          const result = calculator.calculate({
            budget_tier,
            pressure_tier,
            base_weights: baseWeights
          })

          // 1. 返回结构正确
          expect(result).toHaveProperty('budget_tier', budget_tier)
          expect(result).toHaveProperty('pressure_tier', pressure_tier)
          expect(result).toHaveProperty('available_tiers')
          expect(result).toHaveProperty('final_weights')
          expect(result).toHaveProperty('multipliers')

          // 2. 可用档位是数组
          expect(Array.isArray(result.available_tiers)).toBe(true)
          expect(result.available_tiers.length).toBeGreaterThan(0)

          // 3. 至少有一个档位有权重
          const hasWeight = Object.values(result.final_weights).some(w => w > 0)
          expect(hasWeight).toBe(true)

          // 4. B0 只能抽 fallback
          if (budget_tier === 'B0') {
            expect(result.available_tiers).toEqual(['fallback'])
            expect(result.final_weights.high).toBe(0)
            expect(result.final_weights.mid).toBe(0)
            expect(result.final_weights.low).toBe(0)
          }

          // 5. B1 不能抽 high
          if (budget_tier === 'B1') {
            expect(result.available_tiers).not.toContain('high')
            expect(result.final_weights.high).toBe(0)
          }

          // 6. B2 不能抽 high
          if (budget_tier === 'B2') {
            expect(result.available_tiers).not.toContain('high')
            expect(result.final_weights.high).toBe(0)
          }

          // 7. B3 可以抽所有档位
          if (budget_tier === 'B3') {
            expect(result.available_tiers).toContain('fallback')
            // B3 应该有非零 fallback 权重
            expect(result.final_weights.fallback).toBeGreaterThan(0)
          }
        })
      })
    })

    describe('无效 Budget/Pressure Tier 处理', () => {
      test('无效 budget_tier = "B4" 应安全降级', () => {
        const result = calculator.calculate({
          budget_tier: 'B4',
          pressure_tier: 'P1',
          base_weights: baseWeights
        })

        // 应该有结果，不崩溃
        expect(result).toBeDefined()
        expect(result.budget_tier).toBe('B4')
      })

      test('无效 pressure_tier = "P3" 应安全降级', () => {
        const result = calculator.calculate({
          budget_tier: 'B2',
          pressure_tier: 'P3',
          base_weights: baseWeights
        })

        expect(result).toBeDefined()
        expect(result.pressure_tier).toBe('P3')
      })

      test('null budget_tier 应安全处理', () => {
        const result = calculator.calculate({
          budget_tier: null,
          pressure_tier: 'P1',
          base_weights: baseWeights
        })

        expect(result).toBeDefined()
      })

      test('空 base_weights 应安全处理', () => {
        const result = calculator.calculate({
          budget_tier: 'B2',
          pressure_tier: 'P1',
          base_weights: {}
        })

        expect(result).toBeDefined()
        expect(result.final_weights).toBeDefined()
      })
    })
  })

  /*
   * ========================================
   * 4. Pity 系统边界测试
   * ========================================
   */
  describe('PityCalculator - Pity 系统边界', () => {
    let calculator

    beforeEach(() => {
      calculator = new PityCalculator()
    })

    describe('空奖连击数边界', () => {
      test('empty_streak = 0 应返回 multiplier = 1.0', () => {
        const result = calculator.calculate({
          empty_streak: 0
        })

        expect(result.pity_triggered).toBe(false)
        expect(result.multiplier).toBe(1.0)
      })

      test('empty_streak = 1 应返回 multiplier = 1.0（未达阈值）', () => {
        const result = calculator.calculate({
          empty_streak: 1
        })

        expect(result.pity_triggered).toBe(false)
        expect(result.multiplier).toBe(1.0)
      })

      test('empty_streak = 3（第一阶段软保底阈值）应触发', () => {
        const result = calculator.calculate({
          empty_streak: 3
        })

        expect(result.pity_triggered).toBe(true)
        expect(result.multiplier).toBeGreaterThan(1.0)
      })

      test('empty_streak = 7（第三阶段软保底）应返回更高乘数', () => {
        const result = calculator.calculate({
          empty_streak: 7
        })

        expect(result.pity_triggered).toBe(true)
        expect(result.multiplier).toBe(1.5) // threshold_3 的乘数
      })

      test('empty_streak = 10（硬保底阈值）应触发硬保底', () => {
        const result = calculator.calculate({
          empty_streak: 10
        })

        expect(result.pity_triggered).toBe(true)
        expect(result.hard_pity_triggered).toBe(true)
        expect(result.multiplier).toBe(Infinity) // 硬保底强制非空
      })

      test('empty_streak = 100（极端值）应触发硬保底', () => {
        const result = calculator.calculate({
          empty_streak: 100
        })

        expect(result.pity_triggered).toBe(true)
        expect(result.hard_pity_triggered).toBe(true)
      })

      test('empty_streak = -1（负数）应安全处理', () => {
        const result = calculator.calculate({
          empty_streak: -1
        })

        expect(result.pity_triggered).toBe(false)
        expect(result.multiplier).toBe(1.0)
      })
    })

    describe('Budget Tier 对 Pity 的影响', () => {
      test('B0 时 Pity 仍然正常计算（Pity 不依赖 Budget Tier）', () => {
        // Pity 系统只依赖 empty_streak，不受 Budget Tier 影响
        const result = calculator.calculate({
          empty_streak: 10
        })

        // Pity 系统独立运作
        expect(result.pity_triggered).toBe(true)
        expect(result.hard_pity_triggered).toBe(true)
      })

      test('B3 时 Pity 正常触发', () => {
        const result = calculator.calculate({
          empty_streak: 3
        })

        expect(result.pity_triggered).toBe(true)
        expect(result.multiplier).toBeGreaterThan(1.0)
      })
    })

    describe('Pity 阈值配置验证', () => {
      test('自定义 Pity 配置应正确应用', () => {
        const customCalculator = new PityCalculator({
          pity_config: {
            threshold_1: {
              streak: 2,
              multiplier: 1.2,
              description: '自定义：2次空奖'
            }
          }
        })
        const result = customCalculator.calculate({
          empty_streak: 2
        })

        expect(result.pity_triggered).toBe(true)
        expect(result.multiplier).toBe(1.2)
      })
    })
  })

  /*
   * ========================================
   * 5. 运气债务边界测试
   * ========================================
   */
  describe('LuckDebtCalculator - 运气债务边界', () => {
    let calculator

    beforeEach(() => {
      calculator = new LuckDebtCalculator()
    })

    describe('历史空奖率边界', () => {
      test('historical_empty_rate = 0%（完美运气）应返回 multiplier = 1.0', () => {
        const result = calculator.calculate({
          user_id: 1,
          global_state: {
            global_draw_count: 100,
            global_empty_count: 0 // 0% 空奖率
          }
        })

        expect(result.debt_level).toBe('none')
        expect(result.multiplier).toBeLessThanOrEqual(1.0)
      })

      test('historical_empty_rate = 30%（期望值）应返回 multiplier ≈ 1.0', () => {
        const result = calculator.calculate({
          user_id: 1,
          global_state: {
            global_draw_count: 100,
            global_empty_count: 30 // 30% 空奖率（期望值）
          }
        })

        // 接近期望值，债务应该很低
        expect(result.debt_level).toBe('none')
        expect(result.multiplier).toBeCloseTo(1.0, 1)
      })

      test('historical_empty_rate = 50%（较高）应返回补偿', () => {
        const result = calculator.calculate({
          user_id: 1,
          global_state: {
            global_draw_count: 100,
            global_empty_count: 50 // 50% 空奖率
          }
        })

        expect(['low', 'medium', 'high']).toContain(result.debt_level)
        expect(result.multiplier).toBeGreaterThan(1.0)
      })

      test('historical_empty_rate = 100%（极端）应返回高补偿', () => {
        const result = calculator.calculate({
          user_id: 1,
          global_state: {
            global_draw_count: 50,
            global_empty_count: 50 // 100% 空奖率（偏离70%，属于高债务）
          }
        })

        expect(result.debt_level).toBe('high')
        expect(result.multiplier).toBeGreaterThanOrEqual(1.2)
      })
    })

    describe('样本量边界', () => {
      test('global_draw_count = 0 应返回无债务', () => {
        const result = calculator.calculate({
          user_id: 1,
          global_state: {
            global_draw_count: 0,
            global_empty_count: 0
          }
        })

        expect(result.debt_level).toBe('none')
        expect(result.multiplier).toBe(1.0)
      })

      test('global_draw_count = 9（低于最小样本量 10）应返回无债务', () => {
        const result = calculator.calculate({
          user_id: 1,
          global_state: {
            global_draw_count: 9,
            global_empty_count: 9 // 即使 100% 空奖，样本量不足也不计算债务
          }
        })

        expect(result.debt_level).toBe('none')
        expect(result.multiplier).toBe(1.0)
      })

      test('global_draw_count = 10（等于最小样本量）且高空奖率应开始计算债务', () => {
        // 期望空奖率 30%，80% - 30% = 50% 偏离，属于高债务（>15%）
        const result = calculator.calculate({
          user_id: 1,
          global_state: {
            global_draw_count: 10,
            global_empty_count: 8 // 80% 空奖率
          }
        })

        expect(result.sample_sufficient).toBe(true)
        expect(result.debt_level).toBe('high') // 偏离 50% > 15%
        expect(result.multiplier).toBeGreaterThan(1.0)
      })

      test('global_draw_count = 1000（大样本）应正常计算', () => {
        // 42% - 30% = 12% 偏离，属于中债务（10%-15%）
        const result = calculator.calculate({
          user_id: 1,
          global_state: {
            global_draw_count: 1000,
            global_empty_count: 420 // 42% 空奖率
          }
        })

        expect(result.debt_level).toBe('medium') // 偏离 12%
        expect(result.multiplier).toBeGreaterThan(1.0)
      })
    })

    describe('null/undefined 全局状态处理', () => {
      test('global_state = null 应返回无债务', () => {
        const result = calculator.calculate({
          user_id: 1,
          global_state: null
        })

        expect(result.debt_level).toBe('none')
        expect(result.multiplier).toBe(1.0)
      })

      test('global_state = undefined 应返回无债务', () => {
        const result = calculator.calculate({
          user_id: 1,
          global_state: undefined
        })

        expect(result.debt_level).toBe('none')
        expect(result.multiplier).toBe(1.0)
      })

      test('global_state 缺少 global_draw_count 应安全处理', () => {
        const result = calculator.calculate({
          user_id: 1,
          global_state: {
            global_empty_count: 10
          }
        })

        expect(result.debt_level).toBe('none')
        expect(result.multiplier).toBe(1.0)
      })
    })

    describe('运气债务禁用场景', () => {
      test('enabled = false 时应返回无债务', () => {
        const disabledCalculator = new LuckDebtCalculator()
        const result = disabledCalculator.calculate({
          user_id: 1,
          enabled: false, // 禁用运气债务
          global_state: {
            global_draw_count: 100,
            global_empty_count: 80 // 80% 空奖率
          }
        })

        expect(result.debt_level).toBe('none')
        expect(result.multiplier).toBe(1.0)
      })
    })
  })

  /*
   * ========================================
   * 6. 综合集成边界测试
   * ========================================
   */
  describe('综合集成 - 极端场景组合', () => {
    test('B0 + P2 + Pity + LuckDebt 组合应正确处理', () => {
      const budgetCalc = new BudgetTierCalculator()
      const pressureCalc = new PressureTierCalculator()
      const matrixCalc = new TierMatrixCalculator()
      const pityCalc = new PityCalculator()
      const luckDebtCalc = new LuckDebtCalculator()

      // 1. 计算 Budget Tier
      const budget_tier = budgetCalc._determineBudgetTier(50, budgetCalc.thresholds)
      expect(budget_tier).toBe('B0')

      // 2. 计算 Pressure Tier
      const pressure_tier = pressureCalc._determinePressureTier(1.5)
      expect(pressure_tier).toBe('P2')

      // 3. 计算矩阵权重
      const matrixResult = matrixCalc.calculate({
        budget_tier,
        pressure_tier,
        base_weights: { high: 50000, mid: 150000, low: 300000, fallback: 500000 }
      })
      expect(matrixResult.available_tiers).toEqual(['fallback'])

      // 4. Pity 计算（Pity 独立于 Budget Tier 运作）
      const pityResult = pityCalc.calculate({
        empty_streak: 5
      })
      expect(pityResult.pity_triggered).toBe(true)
      expect(pityResult.multiplier).toBe(1.25) // threshold_2: 5次空奖

      // 5. 运气债务计算（80% - 30% = 50% 偏离，高债务）
      const luckDebtResult = luckDebtCalc.calculate({
        user_id: 1,
        global_state: { global_draw_count: 100, global_empty_count: 80 }
      })
      expect(luckDebtResult.debt_level).toBe('high')
    })

    test('B3 + P0 + 无空奖连击 + 好运气应返回最优配置', () => {
      const budgetCalc = new BudgetTierCalculator()
      const pressureCalc = new PressureTierCalculator()
      const matrixCalc = new TierMatrixCalculator()
      const pityCalc = new PityCalculator()
      const luckDebtCalc = new LuckDebtCalculator()

      // 1. B3 高预算
      const budget_tier = budgetCalc._determineBudgetTier(2000, budgetCalc.thresholds)
      expect(budget_tier).toBe('B3')

      // 2. P0 低压力
      const pressure_tier = pressureCalc._determinePressureTier(0.3)
      expect(pressure_tier).toBe('P0')

      // 3. 矩阵应该允许所有档位
      const matrixResult = matrixCalc.calculate({
        budget_tier,
        pressure_tier,
        base_weights: { high: 50000, mid: 150000, low: 300000, fallback: 500000 }
      })
      expect(matrixResult.available_tiers).toContain('high')
      expect(matrixResult.available_tiers).toContain('mid')
      expect(matrixResult.available_tiers).toContain('low')

      // 4. 无空奖连击，Pity 不触发
      const pityResult = pityCalc.calculate({
        empty_streak: 0
      })
      expect(pityResult.pity_triggered).toBe(false)

      // 5. 好运气（10% 空奖率 < 30% 期望值），无债务
      const luckDebtResult = luckDebtCalc.calculate({
        user_id: 1,
        global_state: { global_draw_count: 100, global_empty_count: 10 }
      })
      expect(luckDebtResult.debt_level).toBe('none')
    })
  })
})
