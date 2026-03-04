'use strict'

/**
 * TierMatrixCalculator 单元测试
 *
 * Pressure-Only 矩阵（1×3）：仅 P0/P1/P2，无 Budget Tier 维度
 *
 * 测试内容：
 * 1. 实例创建与默认矩阵
 * 2. calculate() 各压力档位权重计算
 * 3. _getMatrixMultipliers 矩阵查表
 * 4. _applyMultipliers 乘数应用
 * 5. _normalizeWeights 权重归一化
 * 6. updateMatrix 矩阵覆盖
 * 7. getAllCombinations 组合枚举
 *
 * @module tests/unit/compute/TierMatrixCalculator.test
 */

const TierMatrixCalculator = require('../../../services/UnifiedLotteryEngine/compute/calculators/TierMatrixCalculator')

describe('TierMatrixCalculator', () => {
  let calculator

  const base_weights = {
    high: 50000,
    mid: 150000,
    low: 300000,
    fallback: 500000
  }

  beforeEach(() => {
    calculator = new TierMatrixCalculator()
  })

  describe('实例化', () => {
    test('创建实例成功', () => {
      expect(calculator).toBeInstanceOf(TierMatrixCalculator)
    })

    test('矩阵配置为 Pressure-Only 结构（P0/P1/P2）', () => {
      expect(calculator.matrix).toBeDefined()
      expect(calculator.matrix.P0).toBeDefined()
      expect(calculator.matrix.P1).toBeDefined()
      expect(calculator.matrix.P2).toBeDefined()
      expect(calculator.matrix.P0.high).toBe(1.3)
      expect(calculator.matrix.P1.high).toBe(1.0)
      expect(calculator.matrix.P2.high).toBe(0.6)
    })
  })

  describe('calculate - 完整计算', () => {
    test('P0 低压时 high 权重被放大', () => {
      const result = calculator.calculate({
        pressure_tier: 'P0',
        base_weights
      })

      expect(result.pressure_tier).toBe('P0')
      expect(result.matrix_key).toBe('P0')
      expect(result.multipliers.high).toBe(1.3)
      expect(result.multipliers.mid).toBe(1.1)
      expect(result.multipliers.low).toBe(0.9)
      expect(result.multipliers.fallback).toBe(0.8)

      const adjusted_high = base_weights.high * 1.3
      expect(result.adjusted_weights.high).toBeGreaterThan(base_weights.high)
      expect(result.adjusted_weights.high).toBeCloseTo(adjusted_high, -2)
      expect(result.final_weights.high).toBeGreaterThan(0)
    })

    test('P1 中压时保持中性乘数（1.0）', () => {
      const result = calculator.calculate({
        pressure_tier: 'P1',
        base_weights
      })

      expect(result.pressure_tier).toBe('P1')
      expect(result.matrix_key).toBe('P1')
      expect(result.multipliers.high).toBe(1.0)
      expect(result.multipliers.mid).toBe(1.0)
      expect(result.multipliers.low).toBe(1.0)
      expect(result.multipliers.fallback).toBe(1.0)

      expect(result.adjusted_weights.high).toBe(base_weights.high)
      expect(result.adjusted_weights.mid).toBe(base_weights.mid)
      expect(result.adjusted_weights.low).toBe(base_weights.low)
      expect(result.adjusted_weights.fallback).toBe(base_weights.fallback)
    })

    test('P2 高压时 high 降权、low/fallback 升权', () => {
      const result = calculator.calculate({
        pressure_tier: 'P2',
        base_weights
      })

      expect(result.pressure_tier).toBe('P2')
      expect(result.matrix_key).toBe('P2')
      expect(result.multipliers.high).toBe(0.6)
      expect(result.multipliers.mid).toBe(0.8)
      expect(result.multipliers.low).toBe(1.2)
      expect(result.multipliers.fallback).toBe(1.5)

      expect(result.adjusted_weights.high).toBeLessThan(base_weights.high)
      expect(result.adjusted_weights.low).toBeGreaterThan(base_weights.low)
      expect(result.adjusted_weights.fallback).toBeGreaterThan(base_weights.fallback)
    })

    test('未知 pressure_tier 降级为 P1', () => {
      const result = calculator.calculate({
        pressure_tier: 'UNKNOWN',
        base_weights
      })

      expect(result.pressure_tier).toBe('UNKNOWN')
      expect(result.matrix_key).toBe('UNKNOWN')
      expect(result.multipliers.high).toBe(1.0)
      expect(result.multipliers.mid).toBe(1.0)
      expect(result.multipliers.low).toBe(1.0)
      expect(result.multipliers.fallback).toBe(1.0)
    })

    test('结果包含 weight_scale 且为 1000000', () => {
      const result = calculator.calculate({
        pressure_tier: 'P1',
        base_weights
      })
      expect(result.weight_scale).toBe(1000000)
    })
  })

  describe('_getMatrixMultipliers - 矩阵查表', () => {
    test('P0 返回正确乘数', () => {
      const multipliers = calculator._getMatrixMultipliers('P0')
      expect(multipliers.high).toBe(1.3)
      expect(multipliers.mid).toBe(1.1)
      expect(multipliers.low).toBe(0.9)
      expect(multipliers.fallback).toBe(0.8)
      expect(multipliers.cap).toBe(1.0)
      expect(multipliers.empty).toBe(1.0)
    })

    test('P1 返回中性乘数', () => {
      const multipliers = calculator._getMatrixMultipliers('P1')
      expect(multipliers.high).toBe(1.0)
      expect(multipliers.mid).toBe(1.0)
      expect(multipliers.low).toBe(1.0)
      expect(multipliers.fallback).toBe(1.0)
    })

    test('P2 返回高压乘数', () => {
      const multipliers = calculator._getMatrixMultipliers('P2')
      expect(multipliers.high).toBe(0.6)
      expect(multipliers.mid).toBe(0.8)
      expect(multipliers.low).toBe(1.2)
      expect(multipliers.fallback).toBe(1.5)
    })

    test('未知 pressure_tier 降级为 P1', () => {
      const multipliers = calculator._getMatrixMultipliers('INVALID')
      expect(multipliers).toBeDefined()
      expect(multipliers.high).toBe(1.0)
      expect(multipliers.fallback).toBe(1.0)
    })
  })

  describe('_applyMultipliers - 乘数应用', () => {
    test('正常应用乘数', () => {
      const multipliers = { high: 1.0, mid: 1.0, low: 1.0, fallback: 0.5 }
      const adjusted = calculator._applyMultipliers(base_weights, multipliers)

      expect(adjusted.high).toBe(50000)
      expect(adjusted.fallback).toBe(250000)
    })

    test('乘数为 0 时权重为 0', () => {
      const multipliers = { high: 0, mid: 0, low: 0, fallback: 1.0 }
      const adjusted = calculator._applyMultipliers(base_weights, multipliers)

      expect(adjusted.high).toBe(0)
      expect(adjusted.mid).toBe(0)
      expect(adjusted.low).toBe(0)
    })
  })

  describe('_normalizeWeights - 权重归一化', () => {
    test('归一化后总和为 WEIGHT_SCALE (1000000)', () => {
      const weights = { high: 100, mid: 200, low: 300, fallback: 400 }
      const normalized = calculator._normalizeWeights(weights)

      const sum = Object.values(normalized).reduce((a, b) => a + b, 0)
      expect(sum).toBe(1000000)
    })

    test('保持相对比例', () => {
      const weights = { high: 100, mid: 200, low: 0, fallback: 0 }
      const normalized = calculator._normalizeWeights(weights)

      expect(normalized.mid / normalized.high).toBeCloseTo(2, 5)
    })

    test('全零时 fallback 为 WEIGHT_SCALE', () => {
      const weights = { high: 0, mid: 0, low: 0, fallback: 0 }
      const normalized = calculator._normalizeWeights(weights)

      expect(normalized.fallback).toBe(1000000)
      expect(normalized.high).toBe(0)
      expect(normalized.mid).toBe(0)
      expect(normalized.low).toBe(0)
    })
  })

  describe('updateMatrix - 矩阵覆盖', () => {
    test('覆盖默认矩阵', () => {
      const custom_matrix = {
        P0: { high: 2.0, mid: 1.5, low: 1.0, fallback: 0.5, cap: 1.0, empty: 1.0 }
      }
      calculator.updateMatrix(custom_matrix)

      const multipliers = calculator._getMatrixMultipliers('P0')
      expect(multipliers.high).toBe(2.0)
      expect(multipliers.mid).toBe(1.5)
      expect(multipliers.fallback).toBe(0.5)
    })

    test('部分覆盖保留其他档位默认值', () => {
      calculator.updateMatrix({
        P2: { high: 0.5, mid: 0.7, low: 1.3, fallback: 1.6, cap: 1.0, empty: 1.0 }
      })

      const p1_multipliers = calculator._getMatrixMultipliers('P1')
      expect(p1_multipliers.high).toBe(1.0)

      const p2_multipliers = calculator._getMatrixMultipliers('P2')
      expect(p2_multipliers.high).toBe(0.5)
      expect(p2_multipliers.fallback).toBe(1.6)
    })

    test('无效矩阵抛出错误', () => {
      expect(() => calculator.updateMatrix(null)).toThrow('无效的矩阵配置')
      expect(() => calculator.updateMatrix('invalid')).toThrow('无效的矩阵配置')
    })
  })

  describe('getAllCombinations - 组合枚举', () => {
    test('返回 3 个 Pressure Tier 组合', () => {
      const combinations = calculator.getAllCombinations()

      expect(combinations).toHaveLength(3)
      const pressure_tiers = combinations.map(c => c.pressure_tier)
      expect(pressure_tiers).toContain('P0')
      expect(pressure_tiers).toContain('P1')
      expect(pressure_tiers).toContain('P2')
    })

    test('每个组合包含 pressure_tier、matrix_key、multipliers', () => {
      const combinations = calculator.getAllCombinations()

      for (const combo of combinations) {
        expect(combo.pressure_tier).toBeDefined()
        expect(combo.matrix_key).toBe(combo.pressure_tier)
        expect(combo.multipliers).toBeDefined()
        expect(combo.multipliers.high).toBeDefined()
        expect(combo.multipliers.fallback).toBeDefined()
      }
    })
  })
})
