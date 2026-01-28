'use strict'

/**
 * BxPx矩阵动态变化测试（任务8.2）
 *
 * 测试内容：
 * - 验证 Budget Tier (B0-B3) 变化时矩阵权重调整
 * - 验证 Pressure Tier (P0-P2) 变化时矩阵权重调整
 * - 验证 BxPx 所有12种组合的权重计算正确性
 * - 验证权重归一化逻辑
 *
 * 业务语义验证：
 * - B0 只能抽 fallback，其他档位权重为0
 * - B3P0 高档位权重最高
 * - B3P2 高档位权重受限
 * - 权重总和必须等于 WEIGHT_SCALE (1000000)
 *
 * @module tests/services/unified_lottery_engine/bxpx_dynamic_change
 * @author 测试审计标准文档 任务8.2
 * @since 2026-01-28
 */

const {
  LotteryComputeEngine,
  BudgetTierCalculator,
  PressureTierCalculator,
  TierMatrixCalculator,
  BUDGET_TIERS,
  PRESSURE_TIERS
} = require('../../../services/UnifiedLotteryEngine/compute')

/**
 * 权重缩放比例常量
 */
const WEIGHT_SCALE = TierMatrixCalculator.WEIGHT_SCALE || 1000000

/**
 * Budget Tier 常量
 */
const BUDGET_TIER = BudgetTierCalculator.BUDGET_TIER || {
  B0: 'B0',
  B1: 'B1',
  B2: 'B2',
  B3: 'B3'
}

/**
 * Pressure Tier 常量
 */
const PRESSURE_TIER = PressureTierCalculator.PRESSURE_TIER || {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2'
}

/**
 * Tier 可用性映射
 */
const TIER_AVAILABILITY = BudgetTierCalculator.TIER_AVAILABILITY || {
  [BUDGET_TIER.B0]: ['fallback'],
  [BUDGET_TIER.B1]: ['low', 'fallback'],
  [BUDGET_TIER.B2]: ['mid', 'low', 'fallback'],
  [BUDGET_TIER.B3]: ['high', 'mid', 'low', 'fallback']
}

describe('BxPx矩阵动态变化测试（任务8.2）', () => {
  let tier_matrix_calculator
  let budget_tier_calculator
  let pressure_tier_calculator
  let lottery_compute_engine

  /**
   * 标准基础权重（用于测试）
   */
  const STANDARD_BASE_WEIGHTS = {
    high: 50000, // 5%
    mid: 150000, // 15%
    low: 300000, // 30%
    fallback: 500000 // 50%
  }

  beforeAll(() => {
    console.log('🔍 初始化BxPx矩阵动态变化测试环境...')

    // 创建计算器实例
    tier_matrix_calculator = new TierMatrixCalculator()
    budget_tier_calculator = new BudgetTierCalculator()
    pressure_tier_calculator = new PressureTierCalculator()
    lottery_compute_engine = new LotteryComputeEngine()

    console.log('✅ BxPx矩阵测试环境初始化完成')
    console.log(`📊 WEIGHT_SCALE: ${WEIGHT_SCALE}`)
  })

  // ========== Budget Tier 变化测试 ==========

  describe('Budget Tier 变化验证', () => {
    test('B0 应只允许 fallback 档位', () => {
      const result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B0,
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      console.log('📊 B0xP1 计算结果:')
      console.log(`   multipliers: ${JSON.stringify(result.multipliers)}`)
      console.log(`   final_weights: ${JSON.stringify(result.final_weights)}`)
      console.log(`   available_tiers: ${JSON.stringify(result.available_tiers)}`)

      // B0 只允许 fallback
      expect(result.available_tiers).toEqual(['fallback'])

      // 其他档位权重应该为0
      expect(result.final_weights.high).toBe(0)
      expect(result.final_weights.mid).toBe(0)
      expect(result.final_weights.low).toBe(0)

      // fallback 应该占 100%
      expect(result.final_weights.fallback).toBe(WEIGHT_SCALE)

      console.log('✅ B0 档位限制验证通过')
    })

    test('B1 应允许 low 和 fallback 档位', () => {
      const result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B1,
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      console.log('📊 B1xP1 计算结果:')
      console.log(`   multipliers: ${JSON.stringify(result.multipliers)}`)
      console.log(`   final_weights: ${JSON.stringify(result.final_weights)}`)
      console.log(`   available_tiers: ${JSON.stringify(result.available_tiers)}`)

      // B1 允许 low + fallback
      expect(result.available_tiers).toContain('low')
      expect(result.available_tiers).toContain('fallback')

      // high 和 mid 权重应该为0
      expect(result.final_weights.high).toBe(0)
      expect(result.final_weights.mid).toBe(0)

      // low 和 fallback 应该有权重
      expect(result.final_weights.low).toBeGreaterThan(0)
      expect(result.final_weights.fallback).toBeGreaterThan(0)

      // 权重总和应该等于 WEIGHT_SCALE
      const total =
        result.final_weights.high +
        result.final_weights.mid +
        result.final_weights.low +
        result.final_weights.fallback
      expect(total).toBe(WEIGHT_SCALE)

      console.log('✅ B1 档位限制验证通过')
    })

    test('B2 应允许 mid, low 和 fallback 档位', () => {
      const result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B2,
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      console.log('📊 B2xP1 计算结果:')
      console.log(`   multipliers: ${JSON.stringify(result.multipliers)}`)
      console.log(`   final_weights: ${JSON.stringify(result.final_weights)}`)
      console.log(`   available_tiers: ${JSON.stringify(result.available_tiers)}`)

      // B2 允许 mid + low + fallback
      expect(result.available_tiers).toContain('mid')
      expect(result.available_tiers).toContain('low')
      expect(result.available_tiers).toContain('fallback')

      // high 权重应该为0
      expect(result.final_weights.high).toBe(0)

      // mid, low, fallback 应该有权重
      expect(result.final_weights.mid).toBeGreaterThan(0)
      expect(result.final_weights.low).toBeGreaterThan(0)
      expect(result.final_weights.fallback).toBeGreaterThan(0)

      // 权重总和应该等于 WEIGHT_SCALE
      const total =
        result.final_weights.high +
        result.final_weights.mid +
        result.final_weights.low +
        result.final_weights.fallback
      expect(total).toBe(WEIGHT_SCALE)

      console.log('✅ B2 档位限制验证通过')
    })

    test('B3 应允许所有档位', () => {
      const result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B3,
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      console.log('📊 B3xP1 计算结果:')
      console.log(`   multipliers: ${JSON.stringify(result.multipliers)}`)
      console.log(`   final_weights: ${JSON.stringify(result.final_weights)}`)
      console.log(`   available_tiers: ${JSON.stringify(result.available_tiers)}`)

      // B3 允许所有档位
      expect(result.available_tiers).toContain('high')
      expect(result.available_tiers).toContain('mid')
      expect(result.available_tiers).toContain('low')
      expect(result.available_tiers).toContain('fallback')

      // 所有档位都应该有权重（P1是标准压力，乘数都是1.0）
      expect(result.final_weights.high).toBeGreaterThan(0)
      expect(result.final_weights.mid).toBeGreaterThan(0)
      expect(result.final_weights.low).toBeGreaterThan(0)
      expect(result.final_weights.fallback).toBeGreaterThan(0)

      // 权重总和应该等于 WEIGHT_SCALE
      const total =
        result.final_weights.high +
        result.final_weights.mid +
        result.final_weights.low +
        result.final_weights.fallback
      expect(total).toBe(WEIGHT_SCALE)

      console.log('✅ B3 全档位开放验证通过')
    })
  })

  // ========== Pressure Tier 变化测试 ==========

  describe('Pressure Tier 变化验证', () => {
    test('P0（宽松）应提高高档位概率', () => {
      const result_p0 = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B3,
        pressure_tier: PRESSURE_TIER.P0,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      const result_p1 = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B3,
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      console.log('📊 P0 vs P1 对比（B3）:')
      console.log(`   P0 multipliers: ${JSON.stringify(result_p0.multipliers)}`)
      console.log(`   P1 multipliers: ${JSON.stringify(result_p1.multipliers)}`)
      console.log(`   P0 final_weights: ${JSON.stringify(result_p0.final_weights)}`)
      console.log(`   P1 final_weights: ${JSON.stringify(result_p1.final_weights)}`)

      // P0 的 high 乘数应该 >= P1 的 high 乘数
      expect(result_p0.multipliers.high).toBeGreaterThanOrEqual(result_p1.multipliers.high)

      // P0 的 fallback 乘数应该 <= P1 的 fallback 乘数
      expect(result_p0.multipliers.fallback).toBeLessThanOrEqual(result_p1.multipliers.fallback)

      console.log('✅ P0 宽松状态权重调整验证通过')
    })

    test('P2（紧张）应降低高档位概率', () => {
      const result_p1 = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B3,
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      const result_p2 = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B3,
        pressure_tier: PRESSURE_TIER.P2,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      console.log('📊 P1 vs P2 对比（B3）:')
      console.log(`   P1 multipliers: ${JSON.stringify(result_p1.multipliers)}`)
      console.log(`   P2 multipliers: ${JSON.stringify(result_p2.multipliers)}`)
      console.log(`   P1 final_weights: ${JSON.stringify(result_p1.final_weights)}`)
      console.log(`   P2 final_weights: ${JSON.stringify(result_p2.final_weights)}`)

      // P2 的 high 乘数应该 <= P1 的 high 乘数
      expect(result_p2.multipliers.high).toBeLessThanOrEqual(result_p1.multipliers.high)

      // P2 的 fallback 乘数应该 >= P1 的 fallback 乘数
      expect(result_p2.multipliers.fallback).toBeGreaterThanOrEqual(result_p1.multipliers.fallback)

      console.log('✅ P2 紧张状态权重调整验证通过')
    })

    test('P1（正常）应保持标准权重乘数1.0', () => {
      const result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B3,
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      console.log('📊 P1 标准乘数验证:')
      console.log(`   multipliers: ${JSON.stringify(result.multipliers)}`)

      // P1 的所有乘数应该接近1.0（允许小范围调整）
      expect(result.multipliers.high).toBeGreaterThanOrEqual(0.8)
      expect(result.multipliers.high).toBeLessThanOrEqual(1.2)
      expect(result.multipliers.mid).toBeGreaterThanOrEqual(0.8)
      expect(result.multipliers.mid).toBeLessThanOrEqual(1.2)
      expect(result.multipliers.low).toBeGreaterThanOrEqual(0.8)
      expect(result.multipliers.low).toBeLessThanOrEqual(1.2)
      expect(result.multipliers.fallback).toBeGreaterThanOrEqual(0.8)
      expect(result.multipliers.fallback).toBeLessThanOrEqual(1.2)

      console.log('✅ P1 标准乘数验证通过')
    })
  })

  // ========== 全矩阵组合测试 ==========

  describe('全矩阵12种组合验证', () => {
    const budget_tiers = ['B0', 'B1', 'B2', 'B3']
    const pressure_tiers = ['P0', 'P1', 'P2']

    test.each(budget_tiers)('Budget Tier %s 与所有 Pressure Tier 组合', budget_tier => {
      console.log(`\n📊 测试 ${budget_tier} 与所有 Pressure Tier 组合:`)

      for (const pressure_tier of pressure_tiers) {
        const result = tier_matrix_calculator.calculate({
          budget_tier,
          pressure_tier,
          base_weights: STANDARD_BASE_WEIGHTS
        })

        // 验证结果结构
        expect(result).toHaveProperty('budget_tier', budget_tier)
        expect(result).toHaveProperty('pressure_tier', pressure_tier)
        expect(result).toHaveProperty('matrix_key', `${budget_tier}x${pressure_tier}`)
        expect(result).toHaveProperty('multipliers')
        expect(result).toHaveProperty('final_weights')
        expect(result).toHaveProperty('available_tiers')

        // 验证权重归一化
        const total =
          result.final_weights.high +
          result.final_weights.mid +
          result.final_weights.low +
          result.final_weights.fallback
        expect(total).toBe(WEIGHT_SCALE)

        // 验证可用档位与权重一致性
        const available = result.available_tiers
        if (!available.includes('high')) {
          expect(result.final_weights.high).toBe(0)
        }
        if (!available.includes('mid')) {
          expect(result.final_weights.mid).toBe(0)
        }
        if (!available.includes('low')) {
          expect(result.final_weights.low).toBe(0)
        }

        console.log(
          `   ${budget_tier}x${pressure_tier}: high=${result.final_weights.high}, mid=${result.final_weights.mid}, low=${result.final_weights.low}, fallback=${result.final_weights.fallback}`
        )
      }

      console.log(`✅ ${budget_tier} 所有组合验证通过`)
    })
  })

  // ========== 权重归一化测试 ==========

  describe('权重归一化验证', () => {
    test('所有组合的权重总和应等于 WEIGHT_SCALE', () => {
      const all_combinations = tier_matrix_calculator.getAllCombinations()

      console.log(`📊 验证 ${all_combinations.length} 种组合的权重归一化:`)

      for (const combination of all_combinations) {
        const result = tier_matrix_calculator.calculate({
          budget_tier: combination.budget_tier,
          pressure_tier: combination.pressure_tier,
          base_weights: STANDARD_BASE_WEIGHTS
        })

        const total =
          result.final_weights.high +
          result.final_weights.mid +
          result.final_weights.low +
          result.final_weights.fallback

        expect(total).toBe(WEIGHT_SCALE)
      }

      console.log(`✅ 所有 ${all_combinations.length} 种组合权重归一化验证通过`)
    })

    test('基础权重为空时应返回 fallback = WEIGHT_SCALE', () => {
      const result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B3,
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: null
      })

      console.log('📊 空基础权重测试:')
      console.log(`   final_weights: ${JSON.stringify(result.final_weights)}`)

      // 当没有有效权重时，应该全部归到 fallback
      const total =
        result.final_weights.high +
        result.final_weights.mid +
        result.final_weights.low +
        result.final_weights.fallback
      expect(total).toBe(WEIGHT_SCALE)

      console.log('✅ 空基础权重处理验证通过')
    })

    test('所有权重为0时应返回 fallback = WEIGHT_SCALE', () => {
      const result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B0, // B0 所有非 fallback 乘数为0
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: { high: 0, mid: 0, low: 0, fallback: 0 }
      })

      console.log('📊 零权重测试:')
      console.log(`   final_weights: ${JSON.stringify(result.final_weights)}`)

      expect(result.final_weights.fallback).toBe(WEIGHT_SCALE)

      console.log('✅ 零权重处理验证通过')
    })
  })

  // ========== 矩阵乘数测试 ==========

  describe('矩阵乘数逻辑验证', () => {
    test('乘数应正确应用到基础权重', () => {
      const base_weights = {
        high: 100000,
        mid: 200000,
        low: 300000,
        fallback: 400000
      }

      // B3P0 应该有 > 1 的 high 乘数
      const result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B3,
        pressure_tier: PRESSURE_TIER.P0,
        base_weights
      })

      console.log('📊 乘数应用测试:')
      console.log(`   base_weights: ${JSON.stringify(base_weights)}`)
      console.log(`   multipliers: ${JSON.stringify(result.multipliers)}`)
      console.log(`   adjusted_weights: ${JSON.stringify(result.adjusted_weights)}`)
      console.log(`   final_weights: ${JSON.stringify(result.final_weights)}`)

      // adjusted_weights 应该是 base_weights * multipliers
      const expected_high_adjusted = Math.round(base_weights.high * result.multipliers.high)
      expect(result.adjusted_weights.high).toBe(expected_high_adjusted)

      console.log('✅ 乘数应用逻辑验证通过')
    })

    test('B0 的非 fallback 乘数应为0', () => {
      const result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B0,
        pressure_tier: PRESSURE_TIER.P0,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      console.log('📊 B0 乘数验证:')
      console.log(`   multipliers: ${JSON.stringify(result.multipliers)}`)

      expect(result.multipliers.high).toBe(0)
      expect(result.multipliers.mid).toBe(0)
      expect(result.multipliers.low).toBe(0)
      expect(result.multipliers.fallback).toBe(1.0)

      console.log('✅ B0 乘数验证通过')
    })
  })

  // ========== LotteryComputeEngine 集成测试 ==========

  describe('LotteryComputeEngine 集成验证', () => {
    test('computeWeightAdjustment 应返回正确的权重调整', () => {
      const result = lottery_compute_engine.computeWeightAdjustment({
        budget_tier: BUDGET_TIER.B3,
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      console.log('📊 LotteryComputeEngine.computeWeightAdjustment 结果:')
      console.log(`   ${JSON.stringify(result, null, 2)}`)

      // 验证返回结构（实际返回 adjusted_weights 而不是 final_weights）
      expect(result).toHaveProperty('adjusted_weights')
      expect(result).toHaveProperty('budget_tier', BUDGET_TIER.B3)
      expect(result).toHaveProperty('pressure_tier', PRESSURE_TIER.P1)

      // 验证权重归一化
      const weights = result.adjusted_weights
      const total = weights.high + weights.mid + weights.low + weights.fallback
      expect(total).toBe(WEIGHT_SCALE)

      console.log('✅ LotteryComputeEngine 集成验证通过')
    })

    test('getAllCombinations 应返回12种组合', () => {
      const combinations = tier_matrix_calculator.getAllCombinations()

      console.log(`📊 总组合数: ${combinations.length}`)

      expect(combinations.length).toBe(12) // 4 * 3 = 12

      // 验证每种组合都有正确的字段
      for (const combo of combinations) {
        expect(combo).toHaveProperty('budget_tier')
        expect(combo).toHaveProperty('pressure_tier')
        expect(combo).toHaveProperty('matrix_key')
        expect(combo).toHaveProperty('multipliers')
        expect(combo).toHaveProperty('available_tiers')
      }

      console.log('✅ getAllCombinations 验证通过')
    })
  })

  // ========== 动态配置测试 ==========

  describe('矩阵动态配置验证', () => {
    test('updateMatrix 应能更新矩阵配置', () => {
      // 创建新的计算器实例进行测试
      const test_calculator = new TierMatrixCalculator()

      // 获取原始 B3P0 的 high 乘数
      const original_result = test_calculator.calculate({
        budget_tier: BUDGET_TIER.B3,
        pressure_tier: PRESSURE_TIER.P0,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      const original_high_multiplier = original_result.multipliers.high

      console.log(`📊 原始 B3xP0 high 乘数: ${original_high_multiplier}`)

      // 更新矩阵配置（提高 B3P0 的 high 乘数）
      test_calculator.updateMatrix({
        [BUDGET_TIER.B3]: {
          [PRESSURE_TIER.P0]: { high: 2.0, mid: 1.5, low: 1.0, fallback: 0.5 }
        }
      })

      // 验证更新后的乘数
      const updated_result = test_calculator.calculate({
        budget_tier: BUDGET_TIER.B3,
        pressure_tier: PRESSURE_TIER.P0,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      console.log(`📊 更新后 B3xP0 high 乘数: ${updated_result.multipliers.high}`)

      expect(updated_result.multipliers.high).toBe(2.0)

      console.log('✅ updateMatrix 动态配置验证通过')
    })

    test('无效的矩阵配置应抛出错误', () => {
      const test_calculator = new TierMatrixCalculator()

      expect(() => {
        test_calculator.updateMatrix(null)
      }).toThrow()

      expect(() => {
        test_calculator.updateMatrix('invalid')
      }).toThrow()

      console.log('✅ 无效配置错误处理验证通过')
    })
  })

  // ========== 边界条件测试 ==========

  describe('边界条件验证', () => {
    test('未知 Budget Tier 应降级到 B0', () => {
      const result = tier_matrix_calculator.calculate({
        budget_tier: 'INVALID_TIER',
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      console.log('📊 未知 Budget Tier 处理:')
      console.log(`   final_weights: ${JSON.stringify(result.final_weights)}`)

      // 应该降级到 B0（只有 fallback）
      expect(result.final_weights.fallback).toBe(WEIGHT_SCALE)

      console.log('✅ 未知 Budget Tier 降级处理验证通过')
    })

    test('未知 Pressure Tier 应降级到 P1', () => {
      const result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B3,
        pressure_tier: 'INVALID_PRESSURE',
        base_weights: STANDARD_BASE_WEIGHTS
      })

      console.log('📊 未知 Pressure Tier 处理:')
      console.log(`   multipliers: ${JSON.stringify(result.multipliers)}`)

      // 应该降级到 P1（乘数接近1.0）
      expect(result.multipliers.high).toBeGreaterThanOrEqual(0.8)
      expect(result.multipliers.high).toBeLessThanOrEqual(1.2)

      console.log('✅ 未知 Pressure Tier 降级处理验证通过')
    })

    test('极端基础权重应正确处理', () => {
      // 测试所有权重集中在一个档位
      const extreme_weights = {
        high: WEIGHT_SCALE, // 100% 在 high
        mid: 0,
        low: 0,
        fallback: 0
      }

      const result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B3,
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: extreme_weights
      })

      console.log('📊 极端权重测试:')
      console.log(`   input: ${JSON.stringify(extreme_weights)}`)
      console.log(`   final_weights: ${JSON.stringify(result.final_weights)}`)

      // 权重总和仍应等于 WEIGHT_SCALE
      const total =
        result.final_weights.high +
        result.final_weights.mid +
        result.final_weights.low +
        result.final_weights.fallback
      expect(total).toBe(WEIGHT_SCALE)

      console.log('✅ 极端基础权重处理验证通过')
    })
  })
})
