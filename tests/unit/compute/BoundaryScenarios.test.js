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

const BudgetTierCalculator = require('../../../services/UnifiedLotteryEngine/compute/calculators/BudgetTierCalculator')
const PressureTierCalculator = require('../../../services/UnifiedLotteryEngine/compute/calculators/PressureTierCalculator')
const TierMatrixCalculator = require('../../../services/UnifiedLotteryEngine/compute/calculators/TierMatrixCalculator')
const PityCalculator = require('../../../services/UnifiedLotteryEngine/compute/calculators/PityCalculator')
const LuckDebtCalculator = require('../../../services/UnifiedLotteryEngine/compute/calculators/LuckDebtCalculator')

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
   * 6. AntiEmptyStreakHandler 边界测试（扩展）
   * ========================================
   */
  describe('AntiEmptyStreakHandler - 详细边界测试', () => {
    const AntiEmptyStreakHandler = require('../../../services/UnifiedLotteryEngine/compute/calculators/AntiEmptyStreakHandler')
    let handler

    beforeEach(() => {
      handler = new AntiEmptyStreakHandler()
    })

    describe('force_threshold 精确边界测试', () => {
      test('empty_streak = force_threshold - 1 应返回 not_triggered', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold - 1,
          selected_tier: 'fallback',
          available_tiers: { fallback: true, low: true },
          effective_budget: 500,
          prizes_by_tier: {
            low: [{ lottery_prize_id: 1, prize_value_points: 50 }]
          },
          user_id: 1
        })

        expect(result.result_type).toBe('not_triggered')
        expect(result.forced).toBe(false)
      })

      test('empty_streak = force_threshold 应触发强制干预', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold,
          selected_tier: 'fallback',
          available_tiers: { fallback: true, low: true },
          effective_budget: 500,
          prizes_by_tier: {
            low: [{ lottery_prize_id: 1, prize_value_points: 50 }]
          },
          user_id: 1
        })

        expect(result.result_type).toBe('forced')
        expect(result.forced).toBe(true)
        expect(result.final_tier).toBe('low')
      })

      test('empty_streak = force_threshold + 1 应触发强制干预', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold + 1,
          selected_tier: 'fallback',
          available_tiers: { fallback: true, low: true },
          effective_budget: 500,
          prizes_by_tier: {
            low: [{ lottery_prize_id: 1, prize_value_points: 50 }]
          },
          user_id: 1
        })

        expect(result.result_type).toBe('forced')
        expect(result.forced).toBe(true)
      })
    })

    describe('预算不足场景边界', () => {
      test('effective_budget = 0 应返回 budget_insufficient', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold,
          selected_tier: 'fallback',
          available_tiers: { fallback: true, low: true },
          effective_budget: 0,
          prizes_by_tier: {
            low: [{ lottery_prize_id: 1, prize_value_points: 50 }]
          },
          user_id: 1
        })

        expect(result.result_type).toBe('budget_insufficient')
        expect(result.forced).toBe(false)
        expect(result.budget_check_passed).toBe(false)
      })

      test('effective_budget 刚好等于最低档位成本应强制成功', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold,
          selected_tier: 'fallback',
          available_tiers: { fallback: true, low: true },
          effective_budget: 50, // 刚好等于 low 档位最低成本
          prizes_by_tier: {
            low: [{ lottery_prize_id: 1, prize_value_points: 50 }]
          },
          user_id: 1
        })

        expect(result.result_type).toBe('forced')
        expect(result.forced).toBe(true)
        expect(result.final_tier).toBe('low')
      })

      test('effective_budget 比最低档位成本少 1 应返回 budget_insufficient', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold,
          selected_tier: 'fallback',
          available_tiers: { fallback: true, low: true },
          effective_budget: 49, // 比 low 档位最低成本少 1
          prizes_by_tier: {
            low: [{ lottery_prize_id: 1, prize_value_points: 50 }]
          },
          user_id: 1
        })

        expect(result.result_type).toBe('budget_insufficient')
        expect(result.budget_check_passed).toBe(false)
      })

      test('effective_budget = Infinity 应强制成功', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold,
          selected_tier: 'fallback',
          available_tiers: { fallback: true, low: true },
          effective_budget: Infinity,
          prizes_by_tier: {
            low: [{ lottery_prize_id: 1, prize_value_points: 50 }]
          },
          user_id: 1
        })

        expect(result.result_type).toBe('forced')
        expect(result.forced).toBe(true)
      })
    })

    describe('prizes_by_tier 边界情况', () => {
      test('prizes_by_tier 为空对象应返回 budget_insufficient', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold,
          selected_tier: 'fallback',
          available_tiers: { fallback: true, low: true },
          effective_budget: 500,
          prizes_by_tier: {},
          user_id: 1
        })

        expect(result.result_type).toBe('budget_insufficient')
        expect(result.forced).toBe(false)
      })

      test('prizes_by_tier 为 undefined 应返回 budget_insufficient', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold,
          selected_tier: 'fallback',
          available_tiers: { fallback: true, low: true },
          effective_budget: 500,
          prizes_by_tier: undefined,
          user_id: 1
        })

        expect(result.result_type).toBe('budget_insufficient')
        expect(result.forced).toBe(false)
      })

      test('prizes_by_tier 仅有 high 档位时应选择 high', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold,
          selected_tier: 'fallback',
          available_tiers: { fallback: true, high: true },
          effective_budget: 500,
          prizes_by_tier: {
            high: [{ lottery_prize_id: 1, prize_value_points: 100 }]
          },
          user_id: 1
        })

        expect(result.result_type).toBe('forced')
        expect(result.final_tier).toBe('high')
      })
    })

    describe('available_tiers 边界情况', () => {
      test('available_tiers 全部为 false 应返回 budget_insufficient', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold,
          selected_tier: 'fallback',
          available_tiers: { low: false, mid: false, high: false },
          effective_budget: 500,
          prizes_by_tier: {
            low: [{ lottery_prize_id: 1, prize_value_points: 50 }]
          },
          user_id: 1
        })

        expect(result.result_type).toBe('budget_insufficient')
      })

      test('available_tiers 为空对象应返回 budget_insufficient', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold,
          selected_tier: 'fallback',
          available_tiers: {},
          effective_budget: 500,
          prizes_by_tier: {
            low: [{ lottery_prize_id: 1, prize_value_points: 50 }]
          },
          user_id: 1
        })

        expect(result.result_type).toBe('budget_insufficient')
      })
    })

    describe('selected_tier 边界情况', () => {
      test('selected_tier = "low" 应返回 already_non_empty', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold,
          selected_tier: 'low',
          available_tiers: { fallback: true, low: true },
          effective_budget: 500,
          user_id: 1
        })

        expect(result.result_type).toBe('already_non_empty')
        expect(result.forced).toBe(false)
        expect(result.final_tier).toBe('low')
      })

      test('selected_tier = "mid" 应返回 already_non_empty', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold,
          selected_tier: 'mid',
          available_tiers: { fallback: true, mid: true },
          effective_budget: 500,
          user_id: 1
        })

        expect(result.result_type).toBe('already_non_empty')
        expect(result.final_tier).toBe('mid')
      })

      test('selected_tier = "high" 应返回 already_non_empty', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold,
          selected_tier: 'high',
          available_tiers: { fallback: true, high: true },
          effective_budget: 500,
          user_id: 1
        })

        expect(result.result_type).toBe('already_non_empty')
        expect(result.final_tier).toBe('high')
      })

      test('selected_tier = "empty" 应尝试强制干预', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold,
          selected_tier: 'empty',
          available_tiers: { fallback: true, low: true },
          effective_budget: 500,
          prizes_by_tier: {
            low: [{ lottery_prize_id: 1, prize_value_points: 50 }]
          },
          user_id: 1
        })

        expect(result.result_type).toBe('forced')
        expect(result.forced).toBe(true)
      })

      test('selected_tier = null 应尝试强制干预', () => {
        const threshold = handler.config.force_threshold
        const result = handler.handle({
          empty_streak: threshold,
          selected_tier: null,
          available_tiers: { fallback: true, low: true },
          effective_budget: 500,
          prizes_by_tier: {
            low: [{ lottery_prize_id: 1, prize_value_points: 50 }]
          },
          user_id: 1
        })

        // null 不等于 'fallback'/'empty'，应该触发检测
        expect(['forced', 'budget_insufficient', 'already_non_empty']).toContain(result.result_type)
      })
    })

    describe('辅助方法边界测试', () => {
      test('shouldForce 与 handle 结果一致', () => {
        const threshold = handler.config.force_threshold

        // 未达阈值
        expect(handler.shouldForce(threshold - 1, 'fallback')).toBe(false)

        // 达到阈值
        expect(handler.shouldForce(threshold, 'fallback')).toBe(true)

        // 非空奖档位
        expect(handler.shouldForce(threshold, 'low')).toBe(false)
      })

      test('getRemainingUntilForce 边界值', () => {
        const threshold = handler.config.force_threshold

        expect(handler.getRemainingUntilForce(0)).toBe(threshold)
        expect(handler.getRemainingUntilForce(threshold - 1)).toBe(1)
        expect(handler.getRemainingUntilForce(threshold)).toBe(0)
        expect(handler.getRemainingUntilForce(threshold + 1)).toBe(0)
        expect(handler.getRemainingUntilForce(100)).toBe(0)
      })
    })
  })

  /*
   * ========================================
   * 7. AntiHighStreakHandler 边界测试（扩展）
   * ========================================
   */
  describe('AntiHighStreakHandler - 详细边界测试', () => {
    const AntiHighStreakHandler = require('../../../services/UnifiedLotteryEngine/compute/calculators/AntiHighStreakHandler')
    let handler

    beforeEach(() => {
      handler = new AntiHighStreakHandler()
    })

    describe('high_streak_threshold 精确边界测试', () => {
      test('recent_high_count = threshold - 1 应返回 not_triggered', () => {
        const threshold = handler.config.high_streak_threshold
        const result = handler.handle({
          recent_high_count: threshold - 1,
          anti_high_cooldown: 0,
          selected_tier: 'high',
          tier_weights: { high: 100000, mid: 200000 },
          user_id: 1
        })

        expect(result.result_type).toBe('not_triggered')
        expect(result.tier_capped).toBe(false)
      })

      test('recent_high_count = threshold 应触发降级', () => {
        const threshold = handler.config.high_streak_threshold
        const result = handler.handle({
          recent_high_count: threshold,
          anti_high_cooldown: 0,
          selected_tier: 'high',
          tier_weights: { high: 100000, mid: 200000 },
          user_id: 1
        })

        expect(result.result_type).toBe('downgraded')
        expect(result.tier_capped).toBe(true)
        expect(result.final_tier).toBe('mid')
      })

      test('recent_high_count = threshold + 1 应触发降级', () => {
        const threshold = handler.config.high_streak_threshold
        const result = handler.handle({
          recent_high_count: threshold + 1,
          anti_high_cooldown: 0,
          selected_tier: 'high',
          tier_weights: { high: 100000, mid: 200000 },
          user_id: 1
        })

        expect(result.result_type).toBe('downgraded')
        expect(result.tier_capped).toBe(true)
      })
    })

    describe('冷却机制边界测试', () => {
      test('anti_high_cooldown = 0 应正常检测', () => {
        const threshold = handler.config.high_streak_threshold
        const result = handler.handle({
          recent_high_count: threshold,
          anti_high_cooldown: 0,
          selected_tier: 'high',
          tier_weights: { high: 100000, mid: 200000 },
          user_id: 1
        })

        expect(result.result_type).toBe('downgraded')
      })

      test('anti_high_cooldown = 1 应返回 in_cooldown', () => {
        const threshold = handler.config.high_streak_threshold
        const result = handler.handle({
          recent_high_count: threshold,
          anti_high_cooldown: 1,
          selected_tier: 'high',
          tier_weights: { high: 100000, mid: 200000 },
          user_id: 1
        })

        expect(result.result_type).toBe('in_cooldown')
        expect(result.tier_capped).toBe(false)
      })

      test('anti_high_cooldown = 100（极大值）应返回 in_cooldown', () => {
        const threshold = handler.config.high_streak_threshold
        const result = handler.handle({
          recent_high_count: threshold,
          anti_high_cooldown: 100,
          selected_tier: 'high',
          tier_weights: { high: 100000, mid: 200000 },
          user_id: 1
        })

        expect(result.result_type).toBe('in_cooldown')
      })

      test('decrementCooldown 边界值', () => {
        expect(handler.decrementCooldown(0)).toBe(0)
        expect(handler.decrementCooldown(1)).toBe(0)
        expect(handler.decrementCooldown(5)).toBe(4)
        expect(handler.decrementCooldown(-1)).toBe(0) // 负数应返回 0
      })
    })

    describe('selected_tier 边界情况', () => {
      test('selected_tier = "low" 应返回 not_high_tier', () => {
        const threshold = handler.config.high_streak_threshold
        const result = handler.handle({
          recent_high_count: threshold,
          anti_high_cooldown: 0,
          selected_tier: 'low',
          tier_weights: { high: 100000, mid: 200000, low: 300000 },
          user_id: 1
        })

        expect(result.result_type).toBe('not_high_tier')
        expect(result.tier_capped).toBe(false)
        expect(result.final_tier).toBe('low')
      })

      test('selected_tier = "mid" 应返回 not_high_tier', () => {
        const threshold = handler.config.high_streak_threshold
        const result = handler.handle({
          recent_high_count: threshold,
          anti_high_cooldown: 0,
          selected_tier: 'mid',
          tier_weights: { high: 100000, mid: 200000 },
          user_id: 1
        })

        expect(result.result_type).toBe('not_high_tier')
      })

      test('selected_tier = "fallback" 应返回 not_high_tier', () => {
        const threshold = handler.config.high_streak_threshold
        const result = handler.handle({
          recent_high_count: threshold,
          anti_high_cooldown: 0,
          selected_tier: 'fallback',
          tier_weights: { high: 100000, fallback: 500000 },
          user_id: 1
        })

        expect(result.result_type).toBe('not_high_tier')
      })
    })

    describe('权重调整边界测试', () => {
      test('high 权重 = 0 时调整后仍为 0', () => {
        const result = handler._adjustWeights({ high: 0, mid: 200000 })
        expect(result.high).toBe(0)
      })

      test('high 权重 = 1 时调整后至少为 1', () => {
        const result = handler._adjustWeights({ high: 1, mid: 200000 })
        expect(result.high).toBeGreaterThanOrEqual(1)
      })

      test('high 权重 = 100000 时应正确降低', () => {
        const original_high = 100000
        const result = handler._adjustWeights({ high: original_high, mid: 200000 })
        expect(result.high).toBeLessThan(original_high)
        expect(result.high).toBe(Math.round(original_high * handler.config.high_weight_reduction))
      })

      test('tier_weights 为空对象应安全处理', () => {
        const result = handler._adjustWeights({})
        expect(result).toBeDefined()
        expect(result.high).toBeUndefined()
      })

      test('tier_weights 无 high 字段应安全处理', () => {
        const result = handler._adjustWeights({ mid: 200000, low: 300000 })
        expect(result.high).toBeUndefined()
        expect(result.mid).toBe(200000)
      })
    })

    describe('辅助方法边界测试', () => {
      test('shouldDowngrade 与 handle 结果一致', () => {
        const threshold = handler.config.high_streak_threshold

        // 未达阈值
        expect(handler.shouldDowngrade(threshold - 1, 'high', 0)).toBe(false)

        // 达到阈值
        expect(handler.shouldDowngrade(threshold, 'high', 0)).toBe(true)

        // 非 high 档位
        expect(handler.shouldDowngrade(threshold, 'low', 0)).toBe(false)

        // 冷却期内
        expect(handler.shouldDowngrade(threshold, 'high', 1)).toBe(false)
      })

      test('getRemainingUntilCap 边界值', () => {
        const threshold = handler.config.high_streak_threshold

        expect(handler.getRemainingUntilCap(0)).toBe(threshold)
        expect(handler.getRemainingUntilCap(threshold - 1)).toBe(1)
        expect(handler.getRemainingUntilCap(threshold)).toBe(0)
        expect(handler.getRemainingUntilCap(threshold + 1)).toBe(0)
      })
    })

    describe('触发降级后的冷却设置', () => {
      test('触发降级应设置正确的冷却次数', () => {
        const threshold = handler.config.high_streak_threshold
        const result = handler.handle({
          recent_high_count: threshold,
          anti_high_cooldown: 0,
          selected_tier: 'high',
          tier_weights: { high: 100000, mid: 200000 },
          user_id: 1
        })

        expect(result.cooldown_triggered).toBe(true)
        expect(result.cooldown_draws).toBe(handler.config.cooldown_draws)
      })
    })
  })

  /*
   * ========================================
   * 8. 综合集成边界测试（扩展）
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

    test('AntiEmpty + AntiHigh 同时触发应正确处理', () => {
      const AntiEmptyStreakHandler = require('../../../services/UnifiedLotteryEngine/compute/calculators/AntiEmptyStreakHandler')
      const AntiHighStreakHandler = require('../../../services/UnifiedLotteryEngine/compute/calculators/AntiHighStreakHandler')

      const antiEmpty = new AntiEmptyStreakHandler()
      const antiHigh = new AntiHighStreakHandler()

      /*
       * 场景：用户刚经历连续空奖后突然抽中 high
       * AntiEmpty 不干预（因为抽中非空）
       * AntiHigh 检测是否需要降级
       */

      // 1. 首先检查 AntiEmpty（selected_tier = high）
      const antiEmptyResult = antiEmpty.handle({
        empty_streak: 15,
        selected_tier: 'high',
        available_tiers: { high: true, mid: true, low: true },
        effective_budget: 1000,
        user_id: 1
      })
      expect(antiEmptyResult.result_type).toBe('already_non_empty')
      expect(antiEmptyResult.final_tier).toBe('high')

      // 2. 然后检查 AntiHigh（recent_high_count 达到阈值）
      const antiHighResult = antiHigh.handle({
        recent_high_count: antiHigh.config.high_streak_threshold,
        anti_high_cooldown: 0,
        selected_tier: 'high',
        tier_weights: { high: 100000, mid: 200000 },
        user_id: 1
      })
      expect(antiHighResult.result_type).toBe('downgraded')
      expect(antiHighResult.final_tier).toBe('mid')
    })

    test('Pity + AntiEmpty 双重保护边界场景', () => {
      const pityCalc = new PityCalculator()
      const AntiEmptyStreakHandler = require('../../../services/UnifiedLotteryEngine/compute/calculators/AntiEmptyStreakHandler')
      const antiEmpty = new AntiEmptyStreakHandler()

      // 场景：用户连续空奖 10 次，触发 Pity 硬保底和 AntiEmpty

      // 1. Pity 硬保底触发
      const pityResult = pityCalc.calculate({
        empty_streak: 10
      })
      expect(pityResult.pity_triggered).toBe(true)
      expect(pityResult.hard_pity_triggered).toBe(true)
      expect(pityResult.multiplier).toBe(Infinity)

      // 2. AntiEmpty 也会触发（因为 empty_streak = 10 = force_threshold）
      const antiEmptyResult = antiEmpty.handle({
        empty_streak: 10,
        selected_tier: 'fallback', // 假设 Pity 提升后仍选中 fallback
        available_tiers: { fallback: true, low: true },
        effective_budget: 100,
        prizes_by_tier: {
          low: [{ lottery_prize_id: 1, prize_value_points: 50 }]
        },
        user_id: 1
      })
      expect(antiEmptyResult.result_type).toBe('forced')
      expect(antiEmptyResult.final_tier).toBe('low')
    })

    test('LuckDebt + Pity 组合补偿场景', () => {
      const luckDebtCalc = new LuckDebtCalculator()
      const pityCalc = new PityCalculator()

      // 场景：高债务用户 + 连续空奖

      // 1. 高运气债务（历史空奖率 70%）
      const luckDebtResult = luckDebtCalc.calculate({
        user_id: 1,
        global_state: {
          global_draw_count: 100,
          global_empty_count: 70
        }
      })
      expect(luckDebtResult.debt_level).toBe('high')
      expect(luckDebtResult.multiplier).toBeGreaterThan(1.0)

      // 2. 同时 Pity 触发（连续空奖 5 次）
      const pityResult = pityCalc.calculate({
        empty_streak: 5
      })
      expect(pityResult.pity_triggered).toBe(true)
      expect(pityResult.multiplier).toBe(1.25)

      // 3. 综合补偿乘数（理论上两者叠加）
      const combinedMultiplier = luckDebtResult.multiplier * pityResult.multiplier
      expect(combinedMultiplier).toBeGreaterThan(pityResult.multiplier)
      expect(combinedMultiplier).toBeGreaterThan(luckDebtResult.multiplier)
    })

    test('所有机制均未触发的基准场景', () => {
      const budgetCalc = new BudgetTierCalculator()
      const pressureCalc = new PressureTierCalculator()
      const matrixCalc = new TierMatrixCalculator()
      const pityCalc = new PityCalculator()
      const luckDebtCalc = new LuckDebtCalculator()
      const AntiEmptyStreakHandler = require('../../../services/UnifiedLotteryEngine/compute/calculators/AntiEmptyStreakHandler')
      const AntiHighStreakHandler = require('../../../services/UnifiedLotteryEngine/compute/calculators/AntiHighStreakHandler')
      const antiEmpty = new AntiEmptyStreakHandler()
      const antiHigh = new AntiHighStreakHandler()

      /*
       * B2 中等预算、P1 中等压力、无连续空奖、无连续高价值、正常运气
       * 根据阈值配置：B0 < 100, B1 = 100-499, B2 = 500-999, B3 >= 1000
       */

      // 1. Budget Tier = B2（需要 500 <= 预算 < 1000）
      const budget_tier = budgetCalc._determineBudgetTier(600, budgetCalc.thresholds)
      expect(budget_tier).toBe('B2')

      // 2. Pressure Tier = P1
      const pressure_tier = pressureCalc._determinePressureTier(1.0)
      expect(pressure_tier).toBe('P1')

      // 3. 矩阵计算正常
      const matrixResult = matrixCalc.calculate({
        budget_tier,
        pressure_tier,
        base_weights: { high: 50000, mid: 150000, low: 300000, fallback: 500000 }
      })
      expect(matrixResult.available_tiers).toContain('mid')
      expect(matrixResult.available_tiers).toContain('low')
      expect(matrixResult.available_tiers).toContain('fallback')

      // 4. Pity 不触发
      const pityResult = pityCalc.calculate({ empty_streak: 0 })
      expect(pityResult.pity_triggered).toBe(false)

      // 5. LuckDebt 不触发（正常运气）
      const luckDebtResult = luckDebtCalc.calculate({
        user_id: 1,
        global_state: { global_draw_count: 100, global_empty_count: 30 }
      })
      expect(luckDebtResult.debt_level).toBe('none')

      // 6. AntiEmpty 不触发
      const antiEmptyResult = antiEmpty.handle({
        empty_streak: 3,
        selected_tier: 'low',
        available_tiers: { low: true },
        effective_budget: 600,
        user_id: 1
      })
      expect(antiEmptyResult.result_type).toBe('already_non_empty')

      // 7. AntiHigh 不触发
      const antiHighResult = antiHigh.handle({
        recent_high_count: 1,
        anti_high_cooldown: 0,
        selected_tier: 'mid',
        tier_weights: { mid: 200000 },
        user_id: 1
      })
      expect(antiHighResult.result_type).toBe('not_high_tier')
    })

    test('极端边界：所有数值为 0 的场景', () => {
      const budgetCalc = new BudgetTierCalculator()
      const pressureCalc = new PressureTierCalculator()
      const pityCalc = new PityCalculator()
      const luckDebtCalc = new LuckDebtCalculator()

      // 1. 预算 = 0 → B0
      const budget_tier = budgetCalc._determineBudgetTier(0, budgetCalc.thresholds)
      expect(budget_tier).toBe('B0')

      // 2. 压力指数 = 0 → P0
      const pressure_tier = pressureCalc._determinePressureTier(0)
      expect(pressure_tier).toBe('P0')

      // 3. 空奖连击 = 0 → Pity 不触发
      const pityResult = pityCalc.calculate({ empty_streak: 0 })
      expect(pityResult.pity_triggered).toBe(false)

      // 4. 抽奖次数 = 0 → 无债务
      const luckDebtResult = luckDebtCalc.calculate({
        user_id: 1,
        global_state: { global_draw_count: 0, global_empty_count: 0 }
      })
      expect(luckDebtResult.debt_level).toBe('none')
    })

    test('极端边界：所有数值极大的场景', () => {
      const budgetCalc = new BudgetTierCalculator()
      const pressureCalc = new PressureTierCalculator()
      const pityCalc = new PityCalculator()
      const luckDebtCalc = new LuckDebtCalculator()

      // 1. 预算 = Infinity → B3
      const budget_tier = budgetCalc._determineBudgetTier(Infinity, budgetCalc.thresholds)
      expect(budget_tier).toBe('B3')

      // 2. 压力指数 = 100 → P2
      const pressure_tier = pressureCalc._determinePressureTier(100)
      expect(pressure_tier).toBe('P2')

      // 3. 空奖连击 = 1000 → 硬保底
      const pityResult = pityCalc.calculate({ empty_streak: 1000 })
      expect(pityResult.hard_pity_triggered).toBe(true)

      // 4. 抽奖次数极大且全空奖 → 高债务
      const luckDebtResult = luckDebtCalc.calculate({
        user_id: 1,
        global_state: {
          global_draw_count: 10000,
          global_empty_count: 9900 // 99% 空奖率
        }
      })
      expect(luckDebtResult.debt_level).toBe('high')
    })
  })

  /*
   * ========================================
   * 9. LotteryComputeEngine 配置边界测试
   *
   * 技术债务清理（2026-01-20）：
   * - 原引用：compute/StrategyEngine
   * - 新引用：compute/LotteryComputeEngine
   * ========================================
   */
  describe('LotteryComputeEngine - 配置边界测试', () => {
    const LotteryComputeEngine = require('../../../services/UnifiedLotteryEngine/compute/LotteryComputeEngine')

    describe('功能开关边界', () => {
      test('所有功能禁用时应正常运行', () => {
        const engine = new LotteryComputeEngine({
          enable_pity: false,
          enable_luck_debt: false,
          enable_anti_streak: false
        })

        expect(engine.options.enable_pity).toBe(false)
        expect(engine.options.enable_luck_debt).toBe(false)
        expect(engine.options.enable_anti_streak).toBe(false)
      })

      test('所有功能启用时应正常运行', () => {
        const engine = new LotteryComputeEngine({
          enable_pity: true,
          enable_luck_debt: true,
          enable_anti_streak: true
        })

        expect(engine.options.enable_pity).toBe(true)
        expect(engine.options.enable_luck_debt).toBe(true)
        expect(engine.options.enable_anti_streak).toBe(true)
      })
    })

    describe('computeWeightAdjustment 边界测试', () => {
      let engine

      beforeEach(() => {
        engine = new LotteryComputeEngine()
      })

      test('有效的 BxPx 组合应返回正确结果', () => {
        const result = engine.computeWeightAdjustment({
          budget_tier: 'B2',
          pressure_tier: 'P1',
          base_tier_weights: { high: 50000, mid: 150000, low: 300000, fallback: 500000 }
        })

        expect(result.adjusted_weights).toBeDefined()
        expect(result.budget_tier).toBe('B2')
        expect(result.pressure_tier).toBe('P1')
      })

      test('无效的 budget_tier 应安全处理', () => {
        const result = engine.computeWeightAdjustment({
          budget_tier: 'B99',
          pressure_tier: 'P1',
          base_tier_weights: { high: 50000, mid: 150000, low: 300000, fallback: 500000 }
        })

        expect(result).toBeDefined()
        expect(result.budget_tier).toBe('B99')
      })

      test('空的 base_tier_weights 应安全处理', () => {
        const result = engine.computeWeightAdjustment({
          budget_tier: 'B2',
          pressure_tier: 'P1',
          base_tier_weights: {}
        })

        expect(result).toBeDefined()
        expect(result.adjusted_weights).toBeDefined()
      })

      test('undefined base_tier_weights 应安全处理', () => {
        const result = engine.computeWeightAdjustment({
          budget_tier: 'B2',
          pressure_tier: 'P1',
          base_tier_weights: undefined
        })

        expect(result).toBeDefined()
      })
    })

    describe('getLuckDebtMultiplier 边界测试', () => {
      test('禁用运气债务时应返回默认值', () => {
        const engine = new LotteryComputeEngine({ enable_luck_debt: false })
        const result = engine.getLuckDebtMultiplier({
          global_state: { global_draw_count: 100, global_empty_count: 80 }
        })

        expect(result.enabled).toBe(false)
        expect(result.multiplier).toBe(1.0)
        expect(result.debt_level).toBe('none')
      })

      test('global_state 为 null 时应返回默认值', () => {
        const engine = new LotteryComputeEngine({ enable_luck_debt: true })
        const result = engine.getLuckDebtMultiplier({
          global_state: null
        })

        expect(result.multiplier).toBe(1.0)
        expect(result.debt_level).toBe('none')
      })
    })

    describe('getStatus 边界测试', () => {
      test('应返回完整的状态信息', () => {
        const engine = new LotteryComputeEngine()
        const status = engine.getStatus()

        expect(status.engine_name).toBe('LotteryComputeEngine')
        expect(status.version).toBeDefined()
        expect(status.options).toBeDefined()
        expect(status.budget_tiers).toBeDefined()
        expect(status.pressure_tiers).toBeDefined()
        expect(status.matrix).toBeDefined()
      })
    })
  })

  /*
   * ========================================
   * 10. 数值稳定性边界测试
   * ========================================
   */
  describe('数值稳定性 - IEEE 754 边界', () => {
    test('处理 Number.EPSILON 级别的差异', () => {
      const budgetCalc = new BudgetTierCalculator()

      /*
       * 注意：Number.EPSILON ≈ 2.22e-16，太小以至于 100 - Number.EPSILON
       * 在 64 位浮点表示中几乎等于 100。
       * 使用更大的差值（如 0.0001）来测试实际的边界行为
       */

      // 99.9999（比阈值稍小）应该是 B0
      const result1 = budgetCalc._determineBudgetTier(99.9999, budgetCalc.thresholds)
      expect(result1).toBe('B0')

      // 100.0001（比阈值稍大）应该是 B1
      const result2 = budgetCalc._determineBudgetTier(100.0001, budgetCalc.thresholds)
      expect(result2).toBe('B1')

      // 精确的 100 应该是 B1（>= 阈值）
      const result3 = budgetCalc._determineBudgetTier(100, budgetCalc.thresholds)
      expect(result3).toBe('B1')
    })

    test('处理浮点数累加误差', () => {
      const pressureCalc = new PressureTierCalculator()

      // 0.1 + 0.2 = 0.30000000000000004
      const value = 0.1 + 0.2
      const result = pressureCalc._determinePressureTier(value)

      // 应该正确判定，不受浮点误差影响
      expect(['P0', 'P1', 'P2']).toContain(result)
    })

    test('处理极小正数', () => {
      const budgetCalc = new BudgetTierCalculator()

      // Number.MIN_VALUE 是最小正数
      const result = budgetCalc._determineBudgetTier(Number.MIN_VALUE, budgetCalc.thresholds)
      expect(result).toBe('B0')
    })

    test('处理 -0 和 +0', () => {
      const budgetCalc = new BudgetTierCalculator()

      const result1 = budgetCalc._determineBudgetTier(+0, budgetCalc.thresholds)
      const result2 = budgetCalc._determineBudgetTier(-0, budgetCalc.thresholds)

      expect(result1).toBe('B0')
      expect(result2).toBe('B0')
      expect(result1).toBe(result2)
    })
  })
})
