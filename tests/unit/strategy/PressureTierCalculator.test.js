'use strict'

/**
 * PressureTierCalculator 单元测试
 *
 * 测试内容：
 * 1. 实例创建
 * 2. 时间进度计算
 * 3. 压力指数计算
 * 4. 压力档位确定
 *
 * @module tests/unit/strategy/PressureTierCalculator.test
 */

const PressureTierCalculator = require('../../../services/UnifiedLotteryEngine/strategy/calculators/PressureTierCalculator')

describe('PressureTierCalculator', () => {
  let calculator

  beforeEach(() => {
    calculator = new PressureTierCalculator()
  })

  describe('实例化', () => {
    test('创建实例成功', () => {
      expect(calculator).toBeInstanceOf(PressureTierCalculator)
    })

    test('默认阈值配置正确', () => {
      // 实际配置使用 p0_upper 和 p1_upper
      expect(calculator.thresholds.p0_upper).toBe(0.8)
      expect(calculator.thresholds.p1_upper).toBe(1.2)
    })
  })

  describe('_calculatePressureIndex - 压力指数计算', () => {
    test('消耗 = 预期消耗时压力指数 = 1.0', () => {
      // 虚拟消耗 50%，时间进度 50%
      const result = calculator._calculatePressureIndex(0.5, 0.5)
      expect(result).toBeCloseTo(1.0, 2)
    })

    test('时间进度为 0 且无消耗时返回 0.5', () => {
      // 实际实现：时间进度 <= 0 且无消耗返回 0.5
      const result = calculator._calculatePressureIndex(0, 0)
      expect(result).toBe(0.5)
    })

    test('时间进度为 0 且有消耗时返回 2.0', () => {
      // 实际实现：时间进度 <= 0 且有消耗返回 2.0（高压）
      const result = calculator._calculatePressureIndex(0.5, 0)
      expect(result).toBe(2.0)
    })

    test('虚拟消耗为 0 时返回 0', () => {
      const result = calculator._calculatePressureIndex(0, 0.5)
      expect(result).toBe(0)
    })

    test('消耗速度快于时间进度时压力大', () => {
      // 虚拟消耗 80%，时间进度 50%
      const result = calculator._calculatePressureIndex(0.8, 0.5)
      expect(result).toBeCloseTo(1.6, 2)
    })
  })

  describe('_determinePressureTier - 压力档位确定', () => {
    test('压力指数 <= 0.8 => P0（宽松）', () => {
      const result = calculator._determinePressureTier(0.5)
      expect(result).toBe('P0')
    })

    test('压力指数 = 0 => P0', () => {
      const result = calculator._determinePressureTier(0)
      expect(result).toBe('P0')
    })

    test('压力指数 0.8-1.2 => P1（正常）', () => {
      const result = calculator._determinePressureTier(1.0)
      expect(result).toBe('P1')
    })

    test('压力指数 > 1.2 => P2（紧张）', () => {
      const result = calculator._determinePressureTier(1.5)
      expect(result).toBe('P2')
    })

    test('压力指数 = 0.8 => P0（边界值）', () => {
      const result = calculator._determinePressureTier(0.8)
      expect(result).toBe('P0')
    })

    test('压力指数 = 1.2 => P1（边界值）', () => {
      const result = calculator._determinePressureTier(1.2)
      expect(result).toBe('P1')
    })
  })

  describe('_calculateWeightAdjustment - 权重调整建议', () => {
    test('P0 宽松时提高高档位权重', () => {
      const result = calculator._calculateWeightAdjustment('P0', 0.5)
      expect(result.multipliers.high).toBeGreaterThan(1.0)
      expect(result.multipliers.fallback).toBeLessThan(1.0)
    })

    test('P1 正常压力时保持标准权重', () => {
      const result = calculator._calculateWeightAdjustment('P1', 1.0)
      expect(result.multipliers.high).toBe(1.0)
      expect(result.multipliers.mid).toBe(1.0)
      expect(result.multipliers.low).toBe(1.0)
      expect(result.multipliers.fallback).toBe(1.0)
    })

    test('P2 高压时降低高档位权重', () => {
      const result = calculator._calculateWeightAdjustment('P2', 1.5)
      expect(result.multipliers.high).toBeLessThan(1.0)
      expect(result.multipliers.fallback).toBeGreaterThan(1.0)
    })

    test('返回结果包含描述信息', () => {
      const result = calculator._calculateWeightAdjustment('P1', 1.0)
      expect(result.description).toBeDefined()
      expect(result.pressure_tier).toBe('P1')
      expect(result.pressure_index).toBe(1.0)
    })
  })

  describe('_calculateTimeProgress - 时间进度计算', () => {
    test('活动进行中计算进度', () => {
      const now = new Date()
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 1天前
      const end = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 1天后

      const campaign = {
        start_time: start.toISOString(),
        end_time: end.toISOString()
      }

      const progress = calculator._calculateTimeProgress(campaign)
      expect(progress).toBeGreaterThan(0)
      expect(progress).toBeLessThan(1)
      expect(progress).toBeCloseTo(0.5, 1)
    })

    test('活动未开始返回 0', () => {
      const now = new Date()
      const start = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 1天后
      const end = new Date(now.getTime() + 48 * 60 * 60 * 1000) // 2天后

      const campaign = {
        start_time: start.toISOString(),
        end_time: end.toISOString()
      }

      const progress = calculator._calculateTimeProgress(campaign)
      expect(progress).toBe(0)
    })

    test('活动已结束返回进度值（可能大于1）', () => {
      const now = new Date()
      const start = new Date(now.getTime() - 48 * 60 * 60 * 1000) // 2天前
      const end = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 1天前

      const campaign = {
        start_time: start.toISOString(),
        end_time: end.toISOString()
      }

      const progress = calculator._calculateTimeProgress(campaign)
      // 实际实现可能返回 > 1 的值表示已超期
      expect(progress).toBeGreaterThanOrEqual(1)
    })

    test('无开始/结束时间时返回默认值 0.5', () => {
      const campaign = {}
      const progress = calculator._calculateTimeProgress(campaign)
      expect(progress).toBe(0.5)
    })

    test('活动配置为 null 时返回默认值 0.5', () => {
      const progress = calculator._calculateTimeProgress(null)
      expect(progress).toBe(0.5)
    })
  })
})
