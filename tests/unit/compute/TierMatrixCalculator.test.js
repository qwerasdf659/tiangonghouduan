'use strict'

/**
 * TierMatrixCalculator 单元测试
 *
 * 测试内容：
 * 1. 实例创建
 * 2. BxPx 矩阵查表
 * 3. 权重调整计算
 * 4. 档位可用性过滤
 *
 * @module tests/unit/strategy/TierMatrixCalculator.test
 */

const TierMatrixCalculator = require('../../../services/UnifiedLotteryEngine/compute/calculators/TierMatrixCalculator')

describe('TierMatrixCalculator', () => {
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

  describe('实例化', () => {
    test('创建实例成功', () => {
      expect(calculator).toBeInstanceOf(TierMatrixCalculator)
    })

    test('矩阵配置已加载', () => {
      expect(calculator.matrix).toBeDefined()
      expect(calculator.matrix.B0).toBeDefined()
      expect(calculator.matrix.B3).toBeDefined()
    })
  })

  describe('calculate - 完整计算', () => {
    test('B0xP1 强制空奖', () => {
      const result = calculator.calculate({
        budget_tier: 'B0',
        pressure_tier: 'P1',
        base_weights: baseWeights
      })

      expect(result.budget_tier).toBe('B0')
      expect(result.pressure_tier).toBe('P1')
      expect(result.available_tiers).toEqual(['fallback'])
      // B0 时只有 fallback 有权重
      expect(result.final_weights.high).toBe(0)
      expect(result.final_weights.mid).toBe(0)
      expect(result.final_weights.low).toBe(0)
      expect(result.final_weights.fallback).toBeGreaterThan(0)
    })

    test('B3xP1 所有档位可用', () => {
      const result = calculator.calculate({
        budget_tier: 'B3',
        pressure_tier: 'P1',
        base_weights: baseWeights
      })

      expect(result.available_tiers).toContain('high')
      expect(result.available_tiers).toContain('mid')
      expect(result.available_tiers).toContain('low')
      expect(result.available_tiers).toContain('fallback')
      // 所有档位都有权重
      expect(result.final_weights.high).toBeGreaterThan(0)
      expect(result.final_weights.mid).toBeGreaterThan(0)
      expect(result.final_weights.low).toBeGreaterThan(0)
      expect(result.final_weights.fallback).toBeGreaterThan(0)
    })

    test('B2xP2 高压时调整权重', () => {
      const result = calculator.calculate({
        budget_tier: 'B2',
        pressure_tier: 'P2',
        base_weights: baseWeights
      })

      // B2 不能抽 high
      expect(result.available_tiers).not.toContain('high')
      expect(result.final_weights.high).toBe(0)
      // P2 高压应该增加空奖权重
      expect(result.multipliers.fallback).toBeGreaterThan(1.0)
    })
  })

  describe('_getMatrixMultipliers - 矩阵查表', () => {
    test('B0 x P0 时非空档位乘数为 0，用户只能抽 fallback', () => {
      const multipliers = calculator._getMatrixMultipliers('B0', 'P0')
      // B0 设计理念：通过禁用 high/mid/low（乘数=0）来保证只能抽 fallback
      expect(multipliers.high).toBe(0)
      expect(multipliers.mid).toBe(0)
      expect(multipliers.low).toBe(0)
      expect(multipliers.fallback).toBe(1.0) // fallback 保持不变
    })

    test('B3 x P2 时高压场景增大空奖乘数', () => {
      const multipliers = calculator._getMatrixMultipliers('B3', 'P2')
      // P2 高压时应降低非空奖乘数，增大空奖乘数
      expect(multipliers.high).toBeLessThan(1.0) // 高档被降权
      expect(multipliers.fallback).toBeGreaterThan(1.0) // 空奖被提权
    })

    test('未知 Budget Tier 降级为 B0', () => {
      const multipliers = calculator._getMatrixMultipliers('UNKNOWN', 'P1')
      // 降级为 B0 后，非空档位应该被禁用
      expect(multipliers.high).toBe(0)
      expect(multipliers.mid).toBe(0)
      expect(multipliers.low).toBe(0)
    })

    test('未知 Pressure Tier 降级为 P1', () => {
      const multipliers = calculator._getMatrixMultipliers('B3', 'UNKNOWN')
      // 不应该抛出错误
      expect(multipliers).toBeDefined()
    })
  })

  describe('_applyMultipliers - 乘数应用', () => {
    test('正常应用乘数', () => {
      const multipliers = { high: 1.0, mid: 1.0, low: 1.0, fallback: 0.5 }
      const adjusted = calculator._applyMultipliers(baseWeights, multipliers)

      expect(adjusted.high).toBe(50000) // 不变
      expect(adjusted.fallback).toBe(250000) // 减半
    })

    test('乘数为 0 时权重为 0', () => {
      const multipliers = { high: 0, mid: 0, low: 0, fallback: 1.0 }
      const adjusted = calculator._applyMultipliers(baseWeights, multipliers)

      expect(adjusted.high).toBe(0)
      expect(adjusted.mid).toBe(0)
      expect(adjusted.low).toBe(0)
    })
  })

  describe('_filterByAvailability - 档位过滤', () => {
    test('过滤不可用档位', () => {
      const weights = { high: 100, mid: 200, low: 300, fallback: 400 }
      const available = ['low', 'fallback'] // 只有 low 和 fallback 可用

      const filtered = calculator._filterByAvailability(weights, available)

      expect(filtered.high).toBe(0)
      expect(filtered.mid).toBe(0)
      expect(filtered.low).toBe(300)
      expect(filtered.fallback).toBe(400)
    })
  })

  describe('_normalizeWeights - 权重归一化', () => {
    test('归一化后总和为 1000000', () => {
      const weights = { high: 100, mid: 200, low: 300, fallback: 400 }
      const normalized = calculator._normalizeWeights(weights)

      const sum = Object.values(normalized).reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1000000, -2)
    })

    test('保持相对比例', () => {
      const weights = { high: 100, mid: 200, low: 0, fallback: 0 }
      const normalized = calculator._normalizeWeights(weights)

      // mid 应该是 high 的两倍
      expect(normalized.mid / normalized.high).toBeCloseTo(2, 5)
    })
  })
})
