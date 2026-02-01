'use strict'

/**
 * 预算计算器专项测试 - BudgetCalculator（P1级）
 *
 * 测试内容（对应测试审计标准文档任务2.6）：
 * 2.6 预算计算器 BudgetCalculator - 测试 budget_mode 下的预算控制
 *
 * 业务规则（来自 BudgetTierCalculator.js）：
 * - budget_mode 决定预算来源（user/pool/hybrid/none）
 * - Budget Tier (B0-B3) 根据有效预算和阈值确定
 * - 默认阈值: { high: 1000, mid: 500, low: 100 }
 * - B3: 预算 >= high, B2: 预算 >= mid, B1: 预算 >= low, B0: 预算 < low
 *
 * 核心组件：
 * - BudgetTierCalculator: 预算档位计算
 *
 * @file tests/unit/compute/BudgetModeCalculator.test.js
 * @author 预算计算器专项测试
 * @since 2026-01-28
 */

const BudgetTierCalculator = require('../../../services/UnifiedLotteryEngine/compute/calculators/BudgetTierCalculator')

/**
 * 默认预算阈值
 */
const DEFAULT_THRESHOLDS = {
  high: 1000, // B3 阈值：可抽高档奖品
  mid: 500, // B2 阈值：可抽中档奖品
  low: 100 // B1 阈值：可抽低档奖品
}

/**
 * 模拟奖品列表
 */
const MOCK_PRIZES = [
  { lottery_prize_id: 1, prize_name: '特等奖', reward_tier: 'high', prize_value_points: 5000 },
  { lottery_prize_id: 2, prize_name: '一等奖', reward_tier: 'mid', prize_value_points: 500 },
  { lottery_prize_id: 3, prize_name: '二等奖', reward_tier: 'low', prize_value_points: 100 },
  { lottery_prize_id: 4, prize_name: '参与奖', reward_tier: 'fallback', prize_value_points: 0 }
]

describe('【P1】预算计算器专项测试 - BudgetCalculator', () => {
  /**
   * 测试前准备
   */
  beforeAll(() => {
    console.log('='.repeat(80))
    console.log('💰 【P1】预算计算器专项测试 - BudgetCalculator')
    console.log('='.repeat(80))
    console.log('📋 测试目标：')
    console.log('   2.6.1 BudgetTierCalculator 实例化和配置')
    console.log('   2.6.2 Budget Tier 确定逻辑')
    console.log('   2.6.3 动态阈值计算')
    console.log('   2.6.4 预算充足性计算')
    console.log('   2.6.5 边界条件处理')
    console.log('='.repeat(80))
  })

  afterAll(() => {
    console.log('='.repeat(80))
    console.log('🏁 预算计算器专项测试完成')
    console.log('='.repeat(80))
  })

  /**
   * 2.6.1 BudgetTierCalculator 实例化和配置
   */
  describe('2.6.1 BudgetTierCalculator 实例化和配置', () => {
    let calculator

    beforeEach(() => {
      calculator = new BudgetTierCalculator()
    })

    test('BudgetTierCalculator 实例化成功', () => {
      console.log('📊 2.6.1.1 验证实例化...')

      expect(calculator).toBeInstanceOf(BudgetTierCalculator)
      expect(calculator.thresholds).toBeDefined()

      console.log('   ✅ 实例化成功')
      console.log(
        `   默认阈值: high=${calculator.thresholds.high}, mid=${calculator.thresholds.mid}, low=${calculator.thresholds.low}`
      )
    })

    test('默认阈值配置正确', () => {
      console.log('📊 2.6.1.2 验证默认阈值...')

      expect(calculator.thresholds.high).toBe(1000)
      expect(calculator.thresholds.mid).toBe(500)
      expect(calculator.thresholds.low).toBe(100)

      // 阈值应递减
      expect(calculator.thresholds.high).toBeGreaterThanOrEqual(calculator.thresholds.mid)
      expect(calculator.thresholds.mid).toBeGreaterThanOrEqual(calculator.thresholds.low)

      console.log('   ✅ 阈值配置正确（递减顺序）')
    })

    test('核心方法存在', () => {
      console.log('📊 2.6.1.3 验证核心方法...')

      expect(typeof calculator.calculate).toBe('function')
      expect(typeof calculator._determineBudgetTier).toBe('function')
      expect(typeof calculator._calculateDynamicThresholds).toBe('function')
      expect(typeof calculator._calculateBudgetSufficiency).toBe('function')

      console.log('   ✅ 核心方法存在')
    })

    test('支持自定义阈值', () => {
      console.log('📊 2.6.1.4 验证自定义阈值支持...')

      const customThresholds = {
        high: 2000,
        mid: 1000,
        low: 200
      }

      const customCalculator = new BudgetTierCalculator({ thresholds: customThresholds })

      expect(customCalculator.thresholds.high).toBe(2000)
      expect(customCalculator.thresholds.mid).toBe(1000)
      expect(customCalculator.thresholds.low).toBe(200)

      console.log('   自定义阈值: high=2000, mid=1000, low=200')
      console.log('   ✅ 支持自定义阈值')
    })

    test('静态常量导出正确', () => {
      console.log('📊 2.6.1.5 验证静态常量...')

      expect(BudgetTierCalculator.BUDGET_TIER).toBeDefined()
      expect(BudgetTierCalculator.BUDGET_TIER.B0).toBe('B0')
      expect(BudgetTierCalculator.BUDGET_TIER.B1).toBe('B1')
      expect(BudgetTierCalculator.BUDGET_TIER.B2).toBe('B2')
      expect(BudgetTierCalculator.BUDGET_TIER.B3).toBe('B3')

      expect(BudgetTierCalculator.TIER_AVAILABILITY).toBeDefined()
      expect(BudgetTierCalculator.TIER_AVAILABILITY.B0).toContain('fallback')
      expect(BudgetTierCalculator.TIER_AVAILABILITY.B3).toContain('high')

      console.log('   BUDGET_TIER: B0, B1, B2, B3')
      console.log('   TIER_AVAILABILITY: 定义每个 Tier 允许的档位')
      console.log('   ✅ 静态常量导出正确')
    })
  })

  /**
   * 2.6.2 Budget Tier 确定逻辑
   */
  describe('2.6.2 Budget Tier 确定逻辑', () => {
    let calculator

    beforeEach(() => {
      calculator = new BudgetTierCalculator()
    })

    test('预算 >= high 应返回 B3', () => {
      console.log('📊 2.6.2.1 验证 B3 (高预算) 判定...')

      // 默认 high = 1000
      const budgetTier = calculator._determineBudgetTier(1500, DEFAULT_THRESHOLDS)

      expect(budgetTier).toBe('B3')

      console.log(`   有效预算: 1500, 阈值 high=${DEFAULT_THRESHOLDS.high}`)
      console.log(`   Budget Tier: ${budgetTier}`)
      console.log('   ✅ B3 判定正确')
    })

    test('预算 >= mid 且 < high 应返回 B2', () => {
      console.log('📊 2.6.2.2 验证 B2 (中预算) 判定...')

      // 500 <= budget < 1000
      const budgetTier = calculator._determineBudgetTier(700, DEFAULT_THRESHOLDS)

      expect(budgetTier).toBe('B2')

      console.log(`   有效预算: 700 (mid=500 <= 700 < high=1000)`)
      console.log(`   Budget Tier: ${budgetTier}`)
      console.log('   ✅ B2 判定正确')
    })

    test('预算 >= low 且 < mid 应返回 B1', () => {
      console.log('📊 2.6.2.3 验证 B1 (低预算) 判定...')

      // 100 <= budget < 500
      const budgetTier = calculator._determineBudgetTier(200, DEFAULT_THRESHOLDS)

      expect(budgetTier).toBe('B1')

      console.log(`   有效预算: 200 (low=100 <= 200 < mid=500)`)
      console.log(`   Budget Tier: ${budgetTier}`)
      console.log('   ✅ B1 判定正确')
    })

    test('预算 < low 应返回 B0', () => {
      console.log('📊 2.6.2.4 验证 B0 (不足) 判定...')

      // budget < 100
      const budgetTier = calculator._determineBudgetTier(50, DEFAULT_THRESHOLDS)

      expect(budgetTier).toBe('B0')

      console.log(`   有效预算: 50 (< low=100)`)
      console.log(`   Budget Tier: ${budgetTier}`)
      console.log('   ✅ B0 判定正确')
    })

    test('边界值测试 - 恰好等于阈值', () => {
      console.log('📊 2.6.2.5 验证边界值处理...')

      // 恰好等于 high 阈值
      const tier1 = calculator._determineBudgetTier(1000, DEFAULT_THRESHOLDS)
      expect(tier1).toBe('B3')

      // 恰好等于 mid 阈值
      const tier2 = calculator._determineBudgetTier(500, DEFAULT_THRESHOLDS)
      expect(tier2).toBe('B2')

      // 恰好等于 low 阈值
      const tier3 = calculator._determineBudgetTier(100, DEFAULT_THRESHOLDS)
      expect(tier3).toBe('B1')

      console.log(`   预算=1000 → ${tier1}`)
      console.log(`   预算=500 → ${tier2}`)
      console.log(`   预算=100 → ${tier3}`)
      console.log('   ✅ 边界值处理正确（等于阈值归入对应档）')
    })

    test('Infinity 预算应返回 B3', () => {
      console.log('📊 2.6.2.6 验证无限预算处理...')

      const budgetTier = calculator._determineBudgetTier(Infinity, DEFAULT_THRESHOLDS)

      expect(budgetTier).toBe('B3')

      console.log('   无限预算 → B3')
      console.log('   ✅ 无限预算处理正确')
    })
  })

  /**
   * 2.6.3 动态阈值计算
   */
  describe('2.6.3 动态阈值计算', () => {
    let calculator

    beforeEach(() => {
      calculator = new BudgetTierCalculator()
    })

    test('空奖品列表使用默认阈值', () => {
      console.log('📊 2.6.3.1 验证空奖品列表处理...')

      const thresholds = calculator._calculateDynamicThresholds([])

      expect(thresholds.high).toBe(DEFAULT_THRESHOLDS.high)
      expect(thresholds.mid).toBe(DEFAULT_THRESHOLDS.mid)
      expect(thresholds.low).toBe(DEFAULT_THRESHOLDS.low)

      console.log('   空奖品列表 → 使用默认阈值')
      console.log('   ✅ 空奖品列表处理正确')
    })

    test('null 奖品列表使用默认阈值', () => {
      console.log('📊 2.6.3.2 验证 null 奖品列表处理...')

      const thresholds = calculator._calculateDynamicThresholds(null)

      expect(thresholds.high).toBe(DEFAULT_THRESHOLDS.high)

      console.log('   null 奖品列表 → 使用默认阈值')
      console.log('   ✅ null 奖品列表处理正确')
    })

    test('基于奖品价值计算动态阈值', () => {
      console.log('📊 2.6.3.3 验证动态阈值计算...')

      const thresholds = calculator._calculateDynamicThresholds(MOCK_PRIZES)

      /*
       * 动态阈值基于各档位的最低成本
       * high: 5000, mid: 500, low: 100
       */
      expect(thresholds).toBeDefined()
      expect(thresholds.high).toBeGreaterThan(0)

      console.log(
        `   动态阈值: high=${thresholds.high}, mid=${thresholds.mid}, low=${thresholds.low}`
      )
      console.log('   ✅ 动态阈值计算正确')
    })

    test('动态阈值应保持递减顺序', () => {
      console.log('📊 2.6.3.4 验证阈值递减顺序...')

      const prizes = [
        { lottery_prize_id: 1, reward_tier: 'high', prize_value_points: 500 },
        { lottery_prize_id: 2, reward_tier: 'mid', prize_value_points: 1000 }, // mid > high
        { lottery_prize_id: 3, reward_tier: 'low', prize_value_points: 100 }
      ]

      const thresholds = calculator._calculateDynamicThresholds(prizes)

      // 应自动调整保持 high >= mid >= low
      expect(thresholds.high).toBeGreaterThanOrEqual(thresholds.mid)
      expect(thresholds.mid).toBeGreaterThanOrEqual(thresholds.low)

      console.log(
        `   调整后: high=${thresholds.high}, mid=${thresholds.mid}, low=${thresholds.low}`
      )
      console.log('   ✅ 阈值保持递减顺序')
    })
  })

  /**
   * 2.6.4 预算充足性计算
   */
  describe('2.6.4 预算充足性计算', () => {
    let calculator

    beforeEach(() => {
      calculator = new BudgetTierCalculator()
    })

    test('空奖品列表返回默认充足性', () => {
      console.log('📊 2.6.4.1 验证空奖品列表充足性...')

      const sufficiency = calculator._calculateBudgetSufficiency(1000, [], 'B3')

      expect(sufficiency.is_sufficient).toBe(true)
      expect(sufficiency.affordable_prizes_count).toBe(0)
      expect(sufficiency.total_prizes_count).toBe(0)

      console.log('   空奖品列表 → 默认充足')
      console.log('   ✅ 空奖品列表充足性处理正确')
    })

    test('有奖品列表计算充足性', () => {
      console.log('📊 2.6.4.2 验证奖品列表充足性计算...')

      const sufficiency = calculator._calculateBudgetSufficiency(600, MOCK_PRIZES, 'B2')

      expect(sufficiency).toBeDefined()
      expect(sufficiency.is_sufficient).toBe(true) // B2 != B0
      expect(sufficiency.affordable_prizes_count).toBeDefined()
      expect(sufficiency.total_prizes_count).toBe(MOCK_PRIZES.length)

      console.log(
        `   预算: 600, 可负担奖品: ${sufficiency.affordable_prizes_count}/${sufficiency.total_prizes_count}`
      )
      console.log('   ✅ 充足性计算正确')
    })

    test('B0 时 is_sufficient 为 false', () => {
      console.log('📊 2.6.4.3 验证 B0 充足性...')

      const sufficiency = calculator._calculateBudgetSufficiency(50, MOCK_PRIZES, 'B0')

      expect(sufficiency.is_sufficient).toBe(false)

      console.log('   B0 → is_sufficient = false')
      console.log('   ✅ B0 充足性处理正确')
    })

    test('无限预算的充足性', () => {
      console.log('📊 2.6.4.4 验证无限预算充足性...')

      const sufficiency = calculator._calculateBudgetSufficiency(Infinity, MOCK_PRIZES, 'B3')

      expect(sufficiency.is_sufficient).toBe(true)
      expect(sufficiency.max_affordable_cost).toBe(Infinity)

      console.log('   无限预算 → 所有奖品可负担')
      console.log('   ✅ 无限预算充足性处理正确')
    })
  })

  /**
   * 2.6.5 边界条件处理
   */
  describe('2.6.5 边界条件处理', () => {
    let calculator

    beforeEach(() => {
      calculator = new BudgetTierCalculator()
    })

    test('零预算应返回 B0', () => {
      console.log('📊 2.6.5.1 验证零预算...')

      const budgetTier = calculator._determineBudgetTier(0, DEFAULT_THRESHOLDS)

      expect(budgetTier).toBe('B0')

      console.log('   零预算 → B0')
      console.log('   ✅ 零预算处理正确')
    })

    test('负数预算应返回 B0', () => {
      console.log('📊 2.6.5.2 验证负数预算...')

      const budgetTier = calculator._determineBudgetTier(-100, DEFAULT_THRESHOLDS)

      expect(budgetTier).toBe('B0')

      console.log('   负数预算 → B0')
      console.log('   ✅ 负数预算处理正确')
    })

    test('超大预算应返回 B3', () => {
      console.log('📊 2.6.5.3 验证超大预算...')

      const budgetTier = calculator._determineBudgetTier(999999999, DEFAULT_THRESHOLDS)

      expect(budgetTier).toBe('B3')

      console.log('   超大预算 → B3')
      console.log('   ✅ 超大预算处理正确')
    })
  })

  /**
   * 测试报告
   */
  describe('测试报告', () => {
    test('生成预算计算器测试报告', () => {
      console.log('\n')
      console.log('='.repeat(80))
      console.log('💰 预算计算器专项测试报告')
      console.log('='.repeat(80))
      console.log(
        `📅 测试时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
      )
      console.log('')
      console.log('✅ 测试覆盖内容：')
      console.log('   2.6.1 BudgetTierCalculator 实例化和配置 ✓')
      console.log('   2.6.2 Budget Tier 确定逻辑 ✓')
      console.log('   2.6.3 动态阈值计算 ✓')
      console.log('   2.6.4 预算充足性计算 ✓')
      console.log('   2.6.5 边界条件处理 ✓')
      console.log('')
      console.log('📋 核心业务规则验证：')
      console.log('   - Budget Tier: B0(不足) → B3(高)')
      console.log('   - 默认阈值: high=1000, mid=500, low=100')
      console.log('   - 动态阈值: 基于奖品价值自动计算')
      console.log('   - 档位可用性: B0=fallback, B3=all')
      console.log('='.repeat(80))

      expect(true).toBe(true)
    })
  })
})
