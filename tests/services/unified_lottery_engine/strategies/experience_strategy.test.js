/**
 * 体验策略模块测试套件
 *
 * 测试内容：
 * - PityCalculator: Pity 系统计算器测试
 * - LuckDebtCalculator: 运气债务计算器测试
 * - AntiEmptyStreakHandler: 防空奖连击处理器测试
 * - AntiHighStreakHandler: 防高价值连击处理器测试
 *
 * @author 抽奖模块策略重构
 * @date 2026-01-20
 */

/* eslint-disable no-console */

const PityCalculator = require('../../../../services/UnifiedLotteryEngine/strategy/calculators/PityCalculator')
const LuckDebtCalculator = require('../../../../services/UnifiedLotteryEngine/strategy/calculators/LuckDebtCalculator')
const AntiEmptyStreakHandler = require('../../../../services/UnifiedLotteryEngine/strategy/calculators/AntiEmptyStreakHandler')
const AntiHighStreakHandler = require('../../../../services/UnifiedLotteryEngine/strategy/calculators/AntiHighStreakHandler')

describe('体验策略模块测试套件', () => {
  // ============== PityCalculator 测试 ==============
  describe('PityCalculator - Pity 系统测试', () => {
    let calculator

    beforeAll(() => {
      calculator = new PityCalculator()
      console.log('✅ PityCalculator 初始化完成')
    })

    test('应该正确实例化', () => {
      expect(calculator).toBeDefined()
      // PityCalculator 使用 pity_config 属性
      expect(calculator.pity_config).toBeDefined()
    })

    test('空奖连击 0 次时不触发 Pity', () => {
      const result = calculator.calculate({
        empty_streak: 0,
        tier_weights: { high: 5, mid: 15, low: 30, fallback: 50 }
      })

      expect(result.pity_triggered).toBe(false)
      expect(result.multiplier).toBe(1.0)
      console.log('✅ 空奖连击 0 次：Pity 未触发')
    })

    test('空奖连击 2 次时不触发 Pity', () => {
      const result = calculator.calculate({
        empty_streak: 2,
        tier_weights: { high: 5, mid: 15, low: 30, fallback: 50 }
      })

      expect(result.pity_triggered).toBe(false)
      console.log('✅ 空奖连击 2 次：Pity 未触发')
    })

    test('空奖连击 3 次时触发软 Pity（+10%）', () => {
      const result = calculator.calculate({
        empty_streak: 3,
        tier_weights: { high: 5, mid: 15, low: 30, fallback: 50 }
      })

      expect(result.pity_triggered).toBe(true)
      expect(result.multiplier).toBeCloseTo(1.1, 2)
      expect(result.hard_pity_triggered).toBe(false)
      console.log(`✅ 空奖连击 3 次：Pity 触发，multiplier=${result.multiplier}`)
    })

    test('空奖连击 5 次时触发中等 Pity（+25%）', () => {
      const result = calculator.calculate({
        empty_streak: 5,
        tier_weights: { high: 5, mid: 15, low: 30, fallback: 50 }
      })

      expect(result.pity_triggered).toBe(true)
      expect(result.multiplier).toBeCloseTo(1.25, 2)
      console.log(`✅ 空奖连击 5 次：Pity 触发，multiplier=${result.multiplier}`)
    })

    test('空奖连击 7 次时触发高等 Pity（+50%）', () => {
      const result = calculator.calculate({
        empty_streak: 7,
        tier_weights: { high: 5, mid: 15, low: 30, fallback: 50 }
      })

      expect(result.pity_triggered).toBe(true)
      expect(result.multiplier).toBeCloseTo(1.5, 2)
      console.log(`✅ 空奖连击 7 次：Pity 触发，multiplier=${result.multiplier}`)
    })

    test('空奖连击 10 次时触发硬 Pity', () => {
      const result = calculator.calculate({
        empty_streak: 10,
        tier_weights: { high: 5, mid: 15, low: 30, fallback: 50 }
      })

      expect(result.pity_triggered).toBe(true)
      expect(result.hard_pity_triggered).toBe(true)
      console.log(`✅ 空奖连击 10 次：硬 Pity 触发`)
    })

    test('Pity 触发时应该正确调整权重', () => {
      const original_weights = { high: 5, mid: 15, low: 30, fallback: 50 }
      const result = calculator.calculate({
        empty_streak: 5,
        tier_weights: original_weights
      })

      // 非空奖权重应该增加
      expect(result.adjusted_weights.high).toBeGreaterThan(original_weights.high)
      expect(result.adjusted_weights.mid).toBeGreaterThan(original_weights.mid)
      expect(result.adjusted_weights.low).toBeGreaterThan(original_weights.low)

      // 空奖权重应该降低
      expect(result.adjusted_weights.fallback).toBeLessThan(original_weights.fallback)

      console.log('✅ Pity 权重调整正确')
    })
  })

  // ============== LuckDebtCalculator 测试 ==============
  describe('LuckDebtCalculator - 运气债务测试', () => {
    let calculator

    beforeAll(() => {
      calculator = new LuckDebtCalculator()
      console.log('✅ LuckDebtCalculator 初始化完成')
    })

    test('应该正确实例化', () => {
      expect(calculator).toBeDefined()
      expect(calculator.config).toBeDefined()
    })

    test('样本不足时不计算运气债务', () => {
      const result = calculator.calculate({
        global_state: {
          global_draw_count: 5,
          global_empty_count: 3,
          historical_empty_rate: 0.6
        }
      })

      expect(result.sample_sufficient).toBe(false)
      expect(result.multiplier).toBe(1.0)
      console.log('✅ 样本不足：运气债务未计算')
    })

    test('历史空奖率等于预期时无运气债务', () => {
      const result = calculator.calculate({
        global_state: {
          global_draw_count: 100,
          global_empty_count: 35 // 35% 空奖率（假设预期 35%）
        }
      })

      expect(result.sample_sufficient).toBe(true)
      // 空奖率低于或等于预期时，乘数应该是 1（无债务）
      expect(result.multiplier).toBe(1.0)
      expect(result.debt_level).toBe('none')
      console.log(`✅ 预期空奖率：乘数=${result.multiplier}`)
    })

    test('历史空奖率高于预期时产生运气债务', () => {
      const result = calculator.calculate({
        global_state: {
          global_draw_count: 100,
          global_empty_count: 60 // 60% 空奖率（超过预期）
        }
      })

      expect(result.sample_sufficient).toBe(true)
      // 运气债务乘数应该 >= 1.0（高空奖率用户获得补偿）
      expect(result.multiplier).toBeGreaterThanOrEqual(1.0)
      // 债务等级不是 'none' 表示有债务
      expect(['low', 'medium', 'high']).toContain(result.debt_level)
      console.log(`✅ 欠运用户：乘数=${result.multiplier}，债务等级=${result.debt_level}`)
    })

    test('运气债务乘数应该正确计算', () => {
      const result = calculator.calculate({
        global_state: {
          global_draw_count: 100,
          global_empty_count: 60 // 60% 空奖率
        }
      })

      // 债务等级不是 'none' 表示有债务
      if (result.debt_level !== 'none') {
        // 有债务时，乘数应该 > 1.0
        expect(result.multiplier).toBeGreaterThan(1.0)
        // 应该返回偏离值
        expect(result.deviation).toBeGreaterThan(0)
        console.log(
          `✅ 运气债务乘数正确：multiplier=${result.multiplier}，deviation=${result.deviation}`
        )
      } else {
        // 无债务时，乘数应该是 1.0
        expect(result.multiplier).toBe(1.0)
        console.log('✅ 无运气债务，乘数为 1.0')
      }
    })
  })

  // ============== AntiEmptyStreakHandler 测试 ==============
  describe('AntiEmptyStreakHandler - 防空奖连击测试', () => {
    let handler

    beforeAll(() => {
      handler = new AntiEmptyStreakHandler()
      console.log('✅ AntiEmptyStreakHandler 初始化完成')
    })

    test('应该正确实例化', () => {
      expect(handler).toBeDefined()
      expect(handler.config).toBeDefined()
    })

    test('空奖连击未达阈值时不强制非空奖', () => {
      const result = handler.handle({
        empty_streak: 5,
        selected_tier: 'fallback'
      })

      // 未达阈值，forced 应该为 false
      expect(result.forced).toBe(false)
      expect(result.final_tier).toBe('fallback')
      console.log('✅ 空奖连击 5 次：未触发强制非空奖')
    })

    test('空奖连击达到阈值时强制非空奖', () => {
      // 提供完整的可用档位信息：available_tiers, prizes_by_tier, effective_budget
      const result = handler.handle({
        empty_streak: 10,
        selected_tier: 'fallback',
        available_tiers: { low: true, mid: true, high: false },
        effective_budget: 100,
        // 必须提供 prizes_by_tier 才能让 _selectForcedTier 选择档位
        prizes_by_tier: {
          low: [{ prize_id: 1, prize_value_points: 10 }],
          mid: [{ prize_id: 2, prize_value_points: 50 }]
        }
      })

      // 达到阈值且有可用档位，forced 应该为 true
      expect(result.forced).toBe(true)
      expect(['low', 'mid', 'high']).toContain(result.final_tier)
      console.log(`✅ 空奖连击 10 次：强制非空奖触发，档位=${result.final_tier}`)
    })

    test('选中档位已经是非空奖时不做修改', () => {
      const result = handler.handle({
        empty_streak: 10,
        selected_tier: 'mid'
      })

      // 选中的是 mid（非空奖），不需要强制
      expect(result.forced).toBe(false)
      expect(result.result_type).toBe('already_non_empty')
      console.log('✅ 选中非空奖：不触发强制')
    })
  })

  // ============== AntiHighStreakHandler 测试 ==============
  describe('AntiHighStreakHandler - 防高价值连击测试', () => {
    let handler

    beforeAll(() => {
      handler = new AntiHighStreakHandler()
      console.log('✅ AntiHighStreakHandler 初始化完成')
    })

    test('应该正确实例化', () => {
      expect(handler).toBeDefined()
      expect(handler.config).toBeDefined()
    })

    test('连续高价值未达阈值时不降级', () => {
      const result = handler.handle({
        recent_high_count: 1,
        selected_tier: 'high'
      })

      expect(result.tier_capped).toBe(false)
      expect(result.final_tier).toBe('high')
      console.log('✅ 连续高价值 1 次：未触发降级')
    })

    test('连续高价值达到阈值时降级', () => {
      const result = handler.handle({
        recent_high_count: 3,
        selected_tier: 'high'
      })

      expect(result.tier_capped).toBe(true)
      expect(result.final_tier).toBe('mid') // 降级到 mid
      expect(result.original_tier).toBe('high')
      console.log(`✅ 连续高价值 3 次：触发降级，${result.original_tier} -> ${result.final_tier}`)
    })

    test('选中档位不是高价值时不做修改', () => {
      const result = handler.handle({
        recent_high_count: 5,
        selected_tier: 'mid'
      })

      expect(result.tier_capped).toBe(false)
      expect(result.final_tier).toBe('mid')
      console.log('✅ 选中非高价值：不触发降级')
    })
  })
})
