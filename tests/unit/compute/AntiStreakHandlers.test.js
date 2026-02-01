'use strict'

/**
 * AntiEmptyStreakHandler 和 AntiHighStreakHandler 单元测试
 *
 * 测试内容：
 * 1. 防连续空奖触发条件
 * 2. 防连续高奖触发条件
 * 3. 冷却机制
 * 4. 档位选择逻辑
 *
 * @module tests/unit/strategy/AntiStreakHandlers.test
 */

const AntiEmptyStreakHandler = require('../../../services/UnifiedLotteryEngine/compute/calculators/AntiEmptyStreakHandler')
const AntiHighStreakHandler = require('../../../services/UnifiedLotteryEngine/compute/calculators/AntiHighStreakHandler')

describe('AntiEmptyStreakHandler', () => {
  let handler

  beforeEach(() => {
    handler = new AntiEmptyStreakHandler()
  })

  describe('实例化', () => {
    test('创建实例成功', () => {
      expect(handler).toBeInstanceOf(AntiEmptyStreakHandler)
    })

    test('默认配置正确', () => {
      expect(handler.config.force_threshold).toBeDefined()
      expect(handler.config.warning_threshold).toBeDefined()
    })
  })

  describe('handle - 防连续空奖处理', () => {
    test('已选中非空奖时不干预', () => {
      const result = handler.handle({
        empty_streak: 15,
        selected_tier: 'mid',
        available_tiers: { mid: true },
        effective_budget: 500,
        user_id: 1
      })

      expect(result.forced).toBe(false)
      expect(result.result_type).toBe('already_non_empty')
      expect(result.final_tier).toBe('mid')
    })

    test('未达到阈值时不干预', () => {
      const result = handler.handle({
        empty_streak: 3,
        selected_tier: 'fallback',
        available_tiers: { fallback: true, low: true },
        effective_budget: 100,
        user_id: 1
      })

      expect(result.forced).toBe(false)
      expect(result.result_type).toBe('not_triggered')
    })

    test('达到阈值时尝试强制非空奖', () => {
      const forceThreshold = handler.config.force_threshold
      const result = handler.handle({
        empty_streak: forceThreshold + 2,
        selected_tier: 'fallback',
        available_tiers: { fallback: true, low: true },
        effective_budget: 100,
        prizes_by_tier: {
          low: [{ lottery_prize_id: 1, prize_value_points: 50 }]
        },
        user_id: 1
      })

      expect(result.result_type).not.toBe('not_triggered')
      // 要么强制成功，要么预算不足
      expect(['forced', 'budget_insufficient']).toContain(result.result_type)
    })
  })
})

describe('AntiHighStreakHandler', () => {
  let handler

  beforeEach(() => {
    handler = new AntiHighStreakHandler()
  })

  describe('实例化', () => {
    test('创建实例成功', () => {
      expect(handler).toBeInstanceOf(AntiHighStreakHandler)
    })

    test('默认配置正确', () => {
      expect(handler.config.high_streak_threshold).toBeDefined()
      expect(handler.config.cooldown_draws).toBeDefined()
    })
  })

  describe('handle - 防连续高奖处理', () => {
    test('高奖次数未达阈值时不干预', () => {
      const result = handler.handle({
        recent_high_count: 1,
        selected_tier: 'high',
        user_id: 1
      })

      expect(result.tier_capped).toBe(false)
      expect(result.result_type).toBe('not_triggered')
    })

    test('已选中非高奖时不干预', () => {
      const result = handler.handle({
        recent_high_count: 5,
        selected_tier: 'low',
        user_id: 1
      })

      expect(result.tier_capped).toBe(false)
      expect(result.result_type).toBe('not_high_tier') // 实际实现返回 not_high_tier
    })

    test('达到阈值时尝试降级', () => {
      const threshold = handler.config.high_streak_threshold
      const result = handler.handle({
        recent_high_count: threshold + 1,
        selected_tier: 'high',
        tier_weights: { high: 100000, mid: 200000, low: 300000, fallback: 400000 },
        user_id: 1
      })

      expect(result.result_type).not.toBe('not_triggered')
    })

    test('冷却期内不重复触发', () => {
      const result = handler.handle({
        recent_high_count: 5,
        anti_high_cooldown: 3, // 还有 3 次冷却
        selected_tier: 'high',
        user_id: 1
      })

      expect(result.tier_capped).toBe(false)
      expect(result.result_type).toBe('in_cooldown')
    })
  })
})
