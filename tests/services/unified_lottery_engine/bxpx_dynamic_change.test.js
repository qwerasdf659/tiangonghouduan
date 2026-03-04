'use strict'

/**
 * Pressure-Only 矩阵动态变化测试
 *
 * 2026-03-04 架构重构：Budget Tier 降级为纯监控指标，不再参与概率决策。
 * 矩阵从 4×3（B0-B3 × P0-P2）简化为 1×3（仅 P0/P1/P2）。
 * 资格控制由 BuildPrizePoolStage._filterByResourceEligibility 唯一负责。
 *
 * 测试内容：
 * - Pressure Tier (P0/P1/P2) 变化时矩阵权重调整
 * - 全部 3 种 Pressure 组合的权重计算正确性
 * - 权重归一化逻辑
 * - LotteryComputeEngine 集成（不传 budget_tier）
 * - 矩阵动态配置更新
 *
 * 业务语义验证：
 * - P0（低压）高档概率略提，吸引参与
 * - P1（中压）保持原始权重
 * - P2（高压）压低高档，保护库存
 * - 权重总和必须等于 WEIGHT_SCALE (1000000)
 *
 * @module tests/services/unified_lottery_engine/bxpx_dynamic_change
 * @since 2026-01-28
 */

const {
  PressureTierCalculator,
  TierMatrixCalculator,
  getComputeEngine
} = require('../../../services/UnifiedLotteryEngine/compute')

const lottery_compute_engine = getComputeEngine()

const WEIGHT_SCALE = TierMatrixCalculator.WEIGHT_SCALE || 1000000

const PRESSURE_TIER = PressureTierCalculator.PRESSURE_TIER || {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2'
}

describe('Pressure-Only 矩阵动态变化测试', () => {
  let tier_matrix_calculator

  const STANDARD_BASE_WEIGHTS = {
    high: 50000,
    mid: 150000,
    low: 300000,
    fallback: 500000
  }

  beforeAll(() => {
    tier_matrix_calculator = new TierMatrixCalculator()
  })

  // ========== Pressure Tier 变化测试 ==========

  describe('Pressure Tier 变化验证', () => {
    test('P0（低压）应提高高档位概率', () => {
      const result_p0 = tier_matrix_calculator.calculate({
        pressure_tier: PRESSURE_TIER.P0,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      const result_p1 = tier_matrix_calculator.calculate({
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      expect(result_p0.multipliers.high).toBeGreaterThanOrEqual(result_p1.multipliers.high)
      expect(result_p0.multipliers.fallback).toBeLessThanOrEqual(result_p1.multipliers.fallback)
    })

    test('P2（高压）应降低高档位概率', () => {
      const result_p1 = tier_matrix_calculator.calculate({
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      const result_p2 = tier_matrix_calculator.calculate({
        pressure_tier: PRESSURE_TIER.P2,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      expect(result_p2.multipliers.high).toBeLessThanOrEqual(result_p1.multipliers.high)
      expect(result_p2.multipliers.fallback).toBeGreaterThanOrEqual(result_p1.multipliers.fallback)
    })

    test('P1（中压）乘数应全部为 1.0', () => {
      const result = tier_matrix_calculator.calculate({
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      expect(result.multipliers.high).toBe(1.0)
      expect(result.multipliers.mid).toBe(1.0)
      expect(result.multipliers.low).toBe(1.0)
      expect(result.multipliers.fallback).toBe(1.0)
    })

    test('P0 乘数应符合设计值 (high=1.3, mid=1.1, low=0.9, fallback=0.8)', () => {
      const result = tier_matrix_calculator.calculate({
        pressure_tier: PRESSURE_TIER.P0,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      expect(result.multipliers.high).toBe(1.3)
      expect(result.multipliers.mid).toBe(1.1)
      expect(result.multipliers.low).toBe(0.9)
      expect(result.multipliers.fallback).toBe(0.8)
    })

    test('P2 乘数应符合设计值 (high=0.6, mid=0.8, low=1.2, fallback=1.5)', () => {
      const result = tier_matrix_calculator.calculate({
        pressure_tier: PRESSURE_TIER.P2,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      expect(result.multipliers.high).toBe(0.6)
      expect(result.multipliers.mid).toBe(0.8)
      expect(result.multipliers.low).toBe(1.2)
      expect(result.multipliers.fallback).toBe(1.5)
    })
  })

  // ========== 全矩阵 3 种 Pressure 组合测试 ==========

  describe('全矩阵 3 种 Pressure 组合验证', () => {
    const pressure_tiers = ['P0', 'P1', 'P2']

    test.each(pressure_tiers)('Pressure Tier %s 权重归一化正确', pressure_tier => {
      const result = tier_matrix_calculator.calculate({
        pressure_tier,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      expect(result).toHaveProperty('pressure_tier', pressure_tier)
      expect(result).toHaveProperty('matrix_key', pressure_tier)
      expect(result).toHaveProperty('multipliers')
      expect(result).toHaveProperty('final_weights')

      const total =
        result.final_weights.high +
        result.final_weights.mid +
        result.final_weights.low +
        result.final_weights.fallback
      expect(total).toBe(WEIGHT_SCALE)
    })
  })

  // ========== 权重归一化测试 ==========

  describe('权重归一化验证', () => {
    test('所有 Pressure 组合的权重总和应等于 WEIGHT_SCALE', () => {
      const all_combinations = tier_matrix_calculator.getAllCombinations()

      for (const combination of all_combinations) {
        const result = tier_matrix_calculator.calculate({
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
    })

    test('基础权重为空时应返回 fallback = WEIGHT_SCALE', () => {
      const result = tier_matrix_calculator.calculate({
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: null
      })

      const total =
        result.final_weights.high +
        result.final_weights.mid +
        result.final_weights.low +
        result.final_weights.fallback
      expect(total).toBe(WEIGHT_SCALE)
    })

    test('所有权重为0时应返回 fallback = WEIGHT_SCALE', () => {
      const result = tier_matrix_calculator.calculate({
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: { high: 0, mid: 0, low: 0, fallback: 0 }
      })

      expect(result.final_weights.fallback).toBe(WEIGHT_SCALE)
    })
  })

  // ========== 矩阵乘数应用测试 ==========

  describe('矩阵乘数逻辑验证', () => {
    test('乘数应正确应用到基础权重', () => {
      const base_weights = {
        high: 100000,
        mid: 200000,
        low: 300000,
        fallback: 400000
      }

      const result = tier_matrix_calculator.calculate({
        pressure_tier: PRESSURE_TIER.P0,
        base_weights
      })

      const expected_high_adjusted = Math.round(base_weights.high * result.multipliers.high)
      expect(result.adjusted_weights.high).toBe(expected_high_adjusted)
    })

    test('P1 乘数全为 1.0，调整后权重应与基础权重相同', () => {
      const result = tier_matrix_calculator.calculate({
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      expect(result.adjusted_weights.high).toBe(STANDARD_BASE_WEIGHTS.high)
      expect(result.adjusted_weights.mid).toBe(STANDARD_BASE_WEIGHTS.mid)
      expect(result.adjusted_weights.low).toBe(STANDARD_BASE_WEIGHTS.low)
      expect(result.adjusted_weights.fallback).toBe(STANDARD_BASE_WEIGHTS.fallback)
    })
  })

  // ========== LotteryComputeEngine 集成测试 ==========

  describe('LotteryComputeEngine 集成验证', () => {
    test('computeWeightAdjustment 应只接收 pressure_tier（不传 budget_tier）', () => {
      const result = lottery_compute_engine.computeWeightAdjustment({
        pressure_tier: PRESSURE_TIER.P1,
        base_tier_weights: STANDARD_BASE_WEIGHTS
      })

      expect(result).toHaveProperty('adjusted_weights')
      expect(result).toHaveProperty('pressure_tier', PRESSURE_TIER.P1)
      expect(result).not.toHaveProperty('budget_tier')

      const weights = result.adjusted_weights
      const total = weights.high + weights.mid + weights.low + weights.fallback
      expect(total).toBe(WEIGHT_SCALE)
    })

    test('getAllCombinations 应返回 3 种 Pressure 组合', () => {
      const combinations = tier_matrix_calculator.getAllCombinations()

      expect(combinations.length).toBe(3)

      for (const combo of combinations) {
        expect(combo).toHaveProperty('pressure_tier')
        expect(combo).toHaveProperty('matrix_key')
        expect(combo).toHaveProperty('multipliers')
        expect(['P0', 'P1', 'P2']).toContain(combo.pressure_tier)
      }
    })
  })

  // ========== 动态配置测试 ==========

  describe('矩阵动态配置验证', () => {
    test('updateMatrix 应能更新 Pressure-Only 矩阵配置', () => {
      const test_calculator = new TierMatrixCalculator()

      const original_result = test_calculator.calculate({
        pressure_tier: PRESSURE_TIER.P0,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      const original_high_multiplier = original_result.multipliers.high

      test_calculator.updateMatrix({
        [PRESSURE_TIER.P0]: { high: 2.0, mid: 1.5, low: 1.0, fallback: 0.5, cap: 1.0, empty: 1.0 }
      })

      const updated_result = test_calculator.calculate({
        pressure_tier: PRESSURE_TIER.P0,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      expect(updated_result.multipliers.high).toBe(2.0)
      expect(updated_result.multipliers.high).not.toBe(original_high_multiplier)
    })

    test('无效的矩阵配置应抛出错误', () => {
      const test_calculator = new TierMatrixCalculator()

      expect(() => {
        test_calculator.updateMatrix(null)
      }).toThrow()

      expect(() => {
        test_calculator.updateMatrix('invalid')
      }).toThrow()
    })
  })

  // ========== 边界条件测试 ==========

  describe('边界条件验证', () => {
    test('未知 Pressure Tier 应降级到 P1', () => {
      const result = tier_matrix_calculator.calculate({
        pressure_tier: 'INVALID_PRESSURE',
        base_weights: STANDARD_BASE_WEIGHTS
      })

      expect(result.multipliers.high).toBe(1.0)
      expect(result.multipliers.mid).toBe(1.0)
      expect(result.multipliers.low).toBe(1.0)
      expect(result.multipliers.fallback).toBe(1.0)
    })

    test('极端基础权重应正确处理', () => {
      const extreme_weights = {
        high: WEIGHT_SCALE,
        mid: 0,
        low: 0,
        fallback: 0
      }

      const result = tier_matrix_calculator.calculate({
        pressure_tier: PRESSURE_TIER.P1,
        base_weights: extreme_weights
      })

      const total =
        result.final_weights.high +
        result.final_weights.mid +
        result.final_weights.low +
        result.final_weights.fallback
      expect(total).toBe(WEIGHT_SCALE)
    })

    test('cap 和 empty 字段应包含在乘数中', () => {
      const result = tier_matrix_calculator.calculate({
        pressure_tier: PRESSURE_TIER.P0,
        base_weights: STANDARD_BASE_WEIGHTS
      })

      expect(result.multipliers).toHaveProperty('cap')
      expect(result.multipliers).toHaveProperty('empty')
      expect(result.multipliers.cap).toBe(1.0)
      expect(result.multipliers.empty).toBe(1.0)
    })
  })
})
