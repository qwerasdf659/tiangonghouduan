'use strict'

/**
 * PityCalculator 单元测试
 *
 * 测试内容：
 * 1. Pity 触发条件
 * 2. 软保底阈值
 * 3. 硬保底触发
 * 4. 权重调整
 *
 * @module tests/unit/strategy/PityCalculator.test
 */

const PityCalculator = require('../../../services/UnifiedLotteryEngine/compute/calculators/PityCalculator')

describe('PityCalculator', () => {
  let calculator

  const baseTierWeights = {
    high: 50000,
    mid: 150000,
    low: 300000,
    fallback: 500000
  }

  beforeEach(() => {
    calculator = new PityCalculator()
  })

  describe('实例化', () => {
    test('创建实例成功', () => {
      expect(calculator).toBeInstanceOf(PityCalculator)
    })

    test('默认 Pity 配置正确', () => {
      expect(calculator.pity_config.threshold_1).toBeDefined()
      expect(calculator.pity_config.threshold_2).toBeDefined()
      expect(calculator.pity_config.threshold_3).toBeDefined()
      expect(calculator.pity_config.hard_pity).toBeDefined()
    })
  })

  describe('calculate - Pity 效果计算', () => {
    test('empty_streak = 0 不触发', () => {
      const result = calculator.calculate({
        empty_streak: 0,
        tier_weights: baseTierWeights,
        user_id: 1
      })

      expect(result.pity_triggered).toBe(false)
      expect(result.pity_type).toBe('none')
      expect(result.multiplier).toBe(1.0)
    })

    test('empty_streak 低于阈值不触发', () => {
      const result = calculator.calculate({
        empty_streak: 2, // 默认阈值通常 > 2
        tier_weights: baseTierWeights,
        user_id: 1
      })

      expect(result.pity_triggered).toBe(false)
      expect(result.pity_type).toBe('none')
    })

    test('达到第一阈值触发软保底', () => {
      const threshold1_streak = calculator.pity_config.threshold_1.streak
      const result = calculator.calculate({
        empty_streak: threshold1_streak,
        tier_weights: baseTierWeights,
        user_id: 1
      })

      expect(result.pity_triggered).toBe(true)
      expect(result.pity_type).toBe('soft')
      expect(result.multiplier).toBeGreaterThan(1.0)
      expect(result.threshold_matched).toBe('threshold_1')
    })

    test('达到第二阈值触发更高软保底', () => {
      const threshold2_streak = calculator.pity_config.threshold_2.streak
      const result = calculator.calculate({
        empty_streak: threshold2_streak,
        tier_weights: baseTierWeights,
        user_id: 1
      })

      expect(result.pity_triggered).toBe(true)
      expect(result.pity_type).toBe('soft')
      expect(result.multiplier).toBeGreaterThan(calculator.pity_config.threshold_1.multiplier)
    })

    test('达到硬保底阈值触发硬保底', () => {
      const hard_pity_streak = calculator.pity_config.hard_pity.streak
      const result = calculator.calculate({
        empty_streak: hard_pity_streak,
        tier_weights: baseTierWeights,
        user_id: 1
      })

      expect(result.pity_triggered).toBe(true)
      expect(result.pity_type).toBe('hard')
      expect(result.hard_pity_triggered).toBe(true)
      expect(result.multiplier).toBe(Infinity) // 强制非空奖
    })
  })

  describe('_adjustWeights - 权重调整', () => {
    test('软保底提升非空奖权重', () => {
      const multiplier = 1.5
      const adjusted = calculator._adjustWeights(baseTierWeights, multiplier)

      // 非空奖权重应该提升
      expect(adjusted.high).toBeGreaterThan(baseTierWeights.high)
      expect(adjusted.mid).toBeGreaterThan(baseTierWeights.mid)
      expect(adjusted.low).toBeGreaterThan(baseTierWeights.low)
      // 空奖权重应该降低
      expect(adjusted.fallback).toBeLessThan(baseTierWeights.fallback)
    })

    test('乘数为 1.0 时权重不变', () => {
      const adjusted = calculator._adjustWeights(baseTierWeights, 1.0)
      expect(adjusted).toEqual(baseTierWeights)
    })
  })

  describe('_calculatePityProgress - Pity 进度', () => {
    test('empty_streak = 0 进度为 0', () => {
      const progress = calculator._calculatePityProgress(0)
      expect(progress).toBe(0)
    })

    test('达到硬保底时进度为 1', () => {
      const hard_pity_streak = calculator.pity_config.hard_pity.streak
      const progress = calculator._calculatePityProgress(hard_pity_streak)
      expect(progress).toBeGreaterThanOrEqual(1)
    })

    test('进度随 empty_streak 增加', () => {
      const progress1 = calculator._calculatePityProgress(3)
      const progress2 = calculator._calculatePityProgress(6)
      expect(progress2).toBeGreaterThan(progress1)
    })
  })
})
