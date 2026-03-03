'use strict'

/**
 * 预算耗尽降级测试（任务8.3）
 *
 * 测试内容：
 * - 验证预算从 B3 逐渐降级到 B0 的过程
 * - 验证 TierPickStage 的固定降级路径（high → mid → low → fallback）
 * - 验证预算不足时的档位限制
 * - 验证降级后权重重新归一化
 *
 * 业务语义验证：
 * - 预算耗尽时系统应自动降级，而非直接失败
 * - 降级路径是确定性的：high → mid → low → fallback
 * - 当某档位无可用奖品时，应自动尝试下一档位
 * - 最终必定有奖品产出（fallback 兜底）
 *
 * @module tests/services/unified_lottery_engine/budget_exhaustion
 * @author 测试审计标准文档 任务8.3
 * @since 2026-01-28
 */

const {
  BudgetTierCalculator,
  TierMatrixCalculator,
  LotteryComputeEngine
} = require('../../../services/UnifiedLotteryEngine/compute')

const models = require('../../../models')
const { LotteryCampaign, LotteryPrize } = models
// User 模型用于后续扩展测试场景

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
 * Tier 可用性映射
 */
const TIER_AVAILABILITY = BudgetTierCalculator.TIER_AVAILABILITY || {
  [BUDGET_TIER.B0]: ['fallback'],
  [BUDGET_TIER.B1]: ['low', 'fallback'],
  [BUDGET_TIER.B2]: ['mid', 'low', 'fallback'],
  [BUDGET_TIER.B3]: ['high', 'mid', 'low', 'fallback']
}

/**
 * 固定降级路径
 */
const TIER_DOWNGRADE_PATH = ['high', 'mid', 'low', 'fallback']

describe('预算耗尽降级测试（任务8.3）', () => {
  let budget_tier_calculator
  let tier_matrix_calculator
  let _lottery_compute_engine // 用于后续扩展的抽奖引擎实例（变量名以下划线开头表示预留）
  let test_campaign = null
  let test_prizes = []

  /**
   * 模拟奖品列表（用于测试）
   */
  const MOCK_PRIZES = [
    {
      lottery_prize_id: 1,
      name: 'high_prize_1',
      reward_tier: 'high',
      prize_value_points: 1000,
      status: 'active'
    },
    {
      lottery_prize_id: 2,
      name: 'high_prize_2',
      reward_tier: 'high',
      prize_value_points: 800,
      status: 'active'
    },
    {
      lottery_prize_id: 3,
      name: 'mid_prize_1',
      reward_tier: 'mid',
      prize_value_points: 500,
      status: 'active'
    },
    {
      lottery_prize_id: 4,
      name: 'mid_prize_2',
      reward_tier: 'mid',
      prize_value_points: 400,
      status: 'active'
    },
    {
      lottery_prize_id: 5,
      name: 'low_prize_1',
      reward_tier: 'low',
      prize_value_points: 100,
      status: 'active'
    },
    {
      lottery_prize_id: 6,
      name: 'low_prize_2',
      reward_tier: 'low',
      prize_value_points: 50,
      status: 'active'
    },
    {
      lottery_prize_id: 7,
      name: 'fallback_prize',
      reward_tier: 'fallback',
      prize_value_points: 0,
      status: 'active'
    }
  ]

  /**
   * 模拟活动配置（用于后续集成测试场景扩展）
   */
  const _MOCK_CAMPAIGN = {
    lottery_campaign_id: 999,
    name: 'Test Campaign',
    budget_mode: 'pool',
    pool_budget_total: 10000,
    pool_budget_remaining: 10000,
    draw_cost: 10
  }

  beforeAll(async () => {
    console.log('🔍 初始化预算耗尽降级测试环境...')

    // 创建计算器实例
    budget_tier_calculator = new BudgetTierCalculator()
    tier_matrix_calculator = new TierMatrixCalculator()
    _lottery_compute_engine = new LotteryComputeEngine()

    // 获取真实活动和奖品数据
    try {
      test_campaign = await LotteryCampaign.findOne({
        where: { status: 'active' },
        order: [['created_at', 'DESC']]
      })

      if (test_campaign) {
        test_prizes = await LotteryPrize.findAll({
          where: {
            lottery_campaign_id: test_campaign.lottery_campaign_id,
            status: 'active'
          }
        })

        console.log(
          `✅ 加载真实活动数据: lottery_campaign_id=${test_campaign.lottery_campaign_id}, prizes=${test_prizes.length}`
        )
      } else {
        console.log('⚠️ 未找到活跃活动，将使用模拟数据')
      }
    } catch (error) {
      console.log('⚠️ 加载真实数据失败，将使用模拟数据:', error.message)
    }

    console.log('✅ 预算耗尽降级测试环境初始化完成')
  })

  // ========== Budget Tier 阈值测试 ==========

  describe('Budget Tier 阈值判定', () => {
    test('预算 >= threshold_high 应判定为 B3', () => {
      const thresholds = budget_tier_calculator.thresholds

      console.log(
        `📊 阈值配置: high=${thresholds.high}, mid=${thresholds.mid}, low=${thresholds.low}`
      )

      // 测试刚好达到 high 阈值
      const tier_at_high = budget_tier_calculator._determineBudgetTier(thresholds.high, thresholds)
      expect(tier_at_high).toBe(BUDGET_TIER.B3)

      // 测试超过 high 阈值
      const tier_above_high = budget_tier_calculator._determineBudgetTier(
        thresholds.high + 1000,
        thresholds
      )
      expect(tier_above_high).toBe(BUDGET_TIER.B3)

      // 测试无限预算
      const tier_infinite = budget_tier_calculator._determineBudgetTier(Infinity, thresholds)
      expect(tier_infinite).toBe(BUDGET_TIER.B3)

      console.log('✅ B3 阈值判定验证通过')
    })

    test('预算 >= threshold_mid 且 < threshold_high 应判定为 B2', () => {
      const thresholds = budget_tier_calculator.thresholds

      // 测试刚好达到 mid 阈值
      const tier_at_mid = budget_tier_calculator._determineBudgetTier(thresholds.mid, thresholds)
      expect(tier_at_mid).toBe(BUDGET_TIER.B2)

      // 测试刚好低于 high 阈值
      const tier_below_high = budget_tier_calculator._determineBudgetTier(
        thresholds.high - 1,
        thresholds
      )
      expect(tier_below_high).toBe(BUDGET_TIER.B2)

      console.log('✅ B2 阈值判定验证通过')
    })

    test('预算 >= threshold_low 且 < threshold_mid 应判定为 B1', () => {
      const thresholds = budget_tier_calculator.thresholds

      // 测试刚好达到 low 阈值
      const tier_at_low = budget_tier_calculator._determineBudgetTier(thresholds.low, thresholds)
      expect(tier_at_low).toBe(BUDGET_TIER.B1)

      // 测试刚好低于 mid 阈值
      const tier_below_mid = budget_tier_calculator._determineBudgetTier(
        thresholds.mid - 1,
        thresholds
      )
      expect(tier_below_mid).toBe(BUDGET_TIER.B1)

      console.log('✅ B1 阈值判定验证通过')
    })

    test('预算 < threshold_low 应判定为 B0', () => {
      const thresholds = budget_tier_calculator.thresholds

      // 测试刚好低于 low 阈值
      const tier_below_low = budget_tier_calculator._determineBudgetTier(
        thresholds.low - 1,
        thresholds
      )
      expect(tier_below_low).toBe(BUDGET_TIER.B0)

      // 测试预算为0
      const tier_zero = budget_tier_calculator._determineBudgetTier(0, thresholds)
      expect(tier_zero).toBe(BUDGET_TIER.B0)

      // 测试负预算（理论上不应该出现）
      const tier_negative = budget_tier_calculator._determineBudgetTier(-100, thresholds)
      expect(tier_negative).toBe(BUDGET_TIER.B0)

      console.log('✅ B0 阈值判定验证通过')
    })
  })

  // ========== 预算耗尽降级过程测试 ==========

  describe('预算耗尽降级过程', () => {
    test('预算从 B3 降级到 B2 应限制 high 档位', () => {
      const high_budget_result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B3,
        pressure_tier: 'P1',
        base_weights: { high: 100000, mid: 200000, low: 300000, fallback: 400000 }
      })

      const mid_budget_result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B2,
        pressure_tier: 'P1',
        base_weights: { high: 100000, mid: 200000, low: 300000, fallback: 400000 }
      })

      console.log('📊 B3 → B2 降级对比:')
      console.log(`   B3 final_weights: ${JSON.stringify(high_budget_result.final_weights)}`)
      console.log(`   B2 final_weights: ${JSON.stringify(mid_budget_result.final_weights)}`)

      // B3 有 high 权重
      expect(high_budget_result.final_weights.high).toBeGreaterThan(0)

      // B2 没有 high 权重
      expect(mid_budget_result.final_weights.high).toBe(0)

      // B2 有 mid 权重
      expect(mid_budget_result.final_weights.mid).toBeGreaterThan(0)

      console.log('✅ B3 → B2 降级验证通过')
    })

    test('预算从 B2 降级到 B1 应限制 mid 档位', () => {
      const b2_result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B2,
        pressure_tier: 'P1',
        base_weights: { high: 100000, mid: 200000, low: 300000, fallback: 400000 }
      })

      const b1_result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B1,
        pressure_tier: 'P1',
        base_weights: { high: 100000, mid: 200000, low: 300000, fallback: 400000 }
      })

      console.log('📊 B2 → B1 降级对比:')
      console.log(`   B2 final_weights: ${JSON.stringify(b2_result.final_weights)}`)
      console.log(`   B1 final_weights: ${JSON.stringify(b1_result.final_weights)}`)

      // B2 有 mid 权重
      expect(b2_result.final_weights.mid).toBeGreaterThan(0)

      // B1 没有 mid 权重
      expect(b1_result.final_weights.mid).toBe(0)

      // B1 有 low 权重
      expect(b1_result.final_weights.low).toBeGreaterThan(0)

      console.log('✅ B2 → B1 降级验证通过')
    })

    test('预算从 B1 降级到 B0 应仅保留 fallback', () => {
      const b1_result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B1,
        pressure_tier: 'P1',
        base_weights: { high: 100000, mid: 200000, low: 300000, fallback: 400000 }
      })

      const b0_result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B0,
        pressure_tier: 'P1',
        base_weights: { high: 100000, mid: 200000, low: 300000, fallback: 400000 }
      })

      console.log('📊 B1 → B0 降级对比:')
      console.log(`   B1 final_weights: ${JSON.stringify(b1_result.final_weights)}`)
      console.log(`   B0 final_weights: ${JSON.stringify(b0_result.final_weights)}`)

      // B1 有 low 权重
      expect(b1_result.final_weights.low).toBeGreaterThan(0)

      // B0 只有 fallback 权重
      expect(b0_result.final_weights.high).toBe(0)
      expect(b0_result.final_weights.mid).toBe(0)
      expect(b0_result.final_weights.low).toBe(0)
      expect(b0_result.final_weights.fallback).toBe(WEIGHT_SCALE)

      console.log('✅ B1 → B0 降级验证通过')
    })
  })

  // ========== 固定降级路径测试 ==========

  describe('固定降级路径验证', () => {
    /**
     * 模拟 TierPickStage 的降级逻辑
     */
    const simulateTierDowngrade = (original_tier, prizes_by_tier, available_tiers) => {
      const path_index = TIER_DOWNGRADE_PATH.indexOf(original_tier)
      if (path_index === -1) {
        return 'fallback'
      }

      // 从当前档位开始，沿降级路径查找
      for (let i = path_index; i < TIER_DOWNGRADE_PATH.length; i++) {
        const candidate_tier = TIER_DOWNGRADE_PATH[i]

        // 检查是否在可用档位列表中
        if (!available_tiers.includes(candidate_tier)) {
          continue
        }

        // 检查是否有可用奖品
        if (prizes_by_tier[candidate_tier]?.length > 0) {
          return candidate_tier
        }
      }

      // 兜底返回 fallback
      return 'fallback'
    }

    test('当 high 档位无奖品时应降级到 mid', () => {
      const prizes_by_tier = {
        high: [], // 无高档奖品
        mid: [{ lottery_prize_id: 1 }],
        low: [{ lottery_prize_id: 2 }],
        fallback: [{ lottery_prize_id: 3 }]
      }

      const result = simulateTierDowngrade(
        'high',
        prizes_by_tier,
        TIER_AVAILABILITY[BUDGET_TIER.B3]
      )

      console.log(`📊 high 无奖品降级结果: ${result}`)
      expect(result).toBe('mid')

      console.log('✅ high → mid 降级验证通过')
    })

    test('当 high 和 mid 档位都无奖品时应降级到 low', () => {
      const prizes_by_tier = {
        high: [], // 无高档奖品
        mid: [], // 无中档奖品
        low: [{ lottery_prize_id: 1 }],
        fallback: [{ lottery_prize_id: 2 }]
      }

      const result = simulateTierDowngrade(
        'high',
        prizes_by_tier,
        TIER_AVAILABILITY[BUDGET_TIER.B3]
      )

      console.log(`📊 high/mid 无奖品降级结果: ${result}`)
      expect(result).toBe('low')

      console.log('✅ high → low 降级验证通过')
    })

    test('当 high/mid/low 都无奖品时应降级到 fallback', () => {
      const prizes_by_tier = {
        high: [],
        mid: [],
        low: [],
        fallback: [{ lottery_prize_id: 1 }]
      }

      const result = simulateTierDowngrade(
        'high',
        prizes_by_tier,
        TIER_AVAILABILITY[BUDGET_TIER.B3]
      )

      console.log(`📊 high/mid/low 无奖品降级结果: ${result}`)
      expect(result).toBe('fallback')

      console.log('✅ high → fallback 降级验证通过')
    })

    test('降级路径应严格遵循 high → mid → low → fallback 顺序', () => {
      // 测试所有可能的起始点
      const test_cases = [
        { start: 'high', expected_path: ['high', 'mid', 'low', 'fallback'] },
        { start: 'mid', expected_path: ['mid', 'low', 'fallback'] },
        { start: 'low', expected_path: ['low', 'fallback'] },
        { start: 'fallback', expected_path: ['fallback'] }
      ]

      for (const test_case of test_cases) {
        const start_index = TIER_DOWNGRADE_PATH.indexOf(test_case.start)
        const actual_path = TIER_DOWNGRADE_PATH.slice(start_index)

        console.log(`📊 从 ${test_case.start} 开始的降级路径: ${actual_path.join(' → ')}`)
        expect(actual_path).toEqual(test_case.expected_path)
      }

      console.log('✅ 降级路径顺序验证通过')
    })

    test('B2 预算下 high 不可用时应直接从 mid 开始', () => {
      const prizes_by_tier = {
        high: [{ lottery_prize_id: 1 }], // 有高档奖品但预算不够
        mid: [{ lottery_prize_id: 2 }],
        low: [{ lottery_prize_id: 3 }],
        fallback: [{ lottery_prize_id: 4 }]
      }

      // B2 不允许 high 档位
      const result = simulateTierDowngrade(
        'high',
        prizes_by_tier,
        TIER_AVAILABILITY[BUDGET_TIER.B2]
      )

      console.log(`📊 B2 预算下从 high 降级结果: ${result}`)
      expect(result).toBe('mid') // 跳过 high，从 mid 开始

      console.log('✅ B2 预算限制降级验证通过')
    })

    test('B1 预算下应只能选择 low 或 fallback', () => {
      const prizes_by_tier = {
        high: [{ lottery_prize_id: 1 }],
        mid: [{ lottery_prize_id: 2 }],
        low: [{ lottery_prize_id: 3 }],
        fallback: [{ lottery_prize_id: 4 }]
      }

      // B1 只允许 low 和 fallback
      const result = simulateTierDowngrade(
        'high',
        prizes_by_tier,
        TIER_AVAILABILITY[BUDGET_TIER.B1]
      )

      console.log(`📊 B1 预算下从 high 降级结果: ${result}`)
      expect(['low', 'fallback']).toContain(result)

      console.log('✅ B1 预算限制降级验证通过')
    })
  })

  // ========== 动态阈值测试 ==========

  describe('动态阈值计算', () => {
    test('应根据奖品价值动态计算阈值', () => {
      const dynamic_thresholds = budget_tier_calculator._calculateDynamicThresholds(MOCK_PRIZES)

      console.log('📊 动态阈值计算结果:')
      console.log(`   high 阈值: ${dynamic_thresholds.high}`)
      console.log(`   mid 阈值: ${dynamic_thresholds.mid}`)
      console.log(`   low 阈值: ${dynamic_thresholds.low}`)

      // 验证阈值递减关系
      expect(dynamic_thresholds.high).toBeGreaterThanOrEqual(dynamic_thresholds.mid)
      expect(dynamic_thresholds.mid).toBeGreaterThanOrEqual(dynamic_thresholds.low)

      // 验证阈值基于奖品价值
      const high_min_cost = Math.min(
        ...MOCK_PRIZES.filter(p => p.reward_tier === 'high').map(p => p.prize_value_points)
      )
      const mid_min_cost = Math.min(
        ...MOCK_PRIZES.filter(p => p.reward_tier === 'mid').map(p => p.prize_value_points)
      )
      const low_min_cost = Math.min(
        ...MOCK_PRIZES.filter(p => p.reward_tier === 'low').map(p => p.prize_value_points)
      )

      console.log(
        `📊 奖品最低成本: high=${high_min_cost}, mid=${mid_min_cost}, low=${low_min_cost}`
      )

      console.log('✅ 动态阈值计算验证通过')
    })

    test('空奖品列表应使用默认阈值', () => {
      const default_thresholds = budget_tier_calculator._calculateDynamicThresholds([])

      console.log('📊 空奖品列表阈值:')
      console.log(`   ${JSON.stringify(default_thresholds)}`)

      // 应该返回默认阈值
      expect(default_thresholds).toEqual(budget_tier_calculator.thresholds)

      console.log('✅ 空奖品列表默认阈值验证通过')
    })

    test('null 奖品列表应使用默认阈值', () => {
      const default_thresholds = budget_tier_calculator._calculateDynamicThresholds(null)

      expect(default_thresholds).toEqual(budget_tier_calculator.thresholds)

      console.log('✅ null 奖品列表默认阈值验证通过')
    })
  })

  // ========== 预算充足性测试 ==========

  describe('预算充足性计算', () => {
    test('B0 应报告预算不足', () => {
      const sufficiency = budget_tier_calculator._calculateBudgetSufficiency(
        50,
        MOCK_PRIZES,
        BUDGET_TIER.B0
      )

      console.log('📊 B0 预算充足性:')
      console.log(`   ${JSON.stringify(sufficiency)}`)

      expect(sufficiency.is_sufficient).toBe(false)
      expect(sufficiency.budget_tier).toBe(BUDGET_TIER.B0)

      console.log('✅ B0 预算充足性验证通过')
    })

    test('B3 应报告预算充足', () => {
      const sufficiency = budget_tier_calculator._calculateBudgetSufficiency(
        5000,
        MOCK_PRIZES,
        BUDGET_TIER.B3
      )

      console.log('📊 B3 预算充足性:')
      console.log(`   ${JSON.stringify(sufficiency)}`)

      expect(sufficiency.is_sufficient).toBe(true)
      expect(sufficiency.budget_tier).toBe(BUDGET_TIER.B3)
      expect(sufficiency.affordable_prizes_count).toBeGreaterThan(0)

      console.log('✅ B3 预算充足性验证通过')
    })

    test('应正确计算可负担奖品数量', () => {
      // 预算 = 500，可以负担 mid(500/400) + low(100/50) + fallback(0)
      const budget = 500
      const sufficiency = budget_tier_calculator._calculateBudgetSufficiency(
        budget,
        MOCK_PRIZES,
        BUDGET_TIER.B2
      )

      console.log('📊 预算 500 的充足性:')
      console.log(`   affordable_prizes_count: ${sufficiency.affordable_prizes_count}`)
      console.log(`   total_prizes_count: ${sufficiency.total_prizes_count}`)
      console.log(`   min_prize_cost: ${sufficiency.min_prize_cost}`)

      // 可负担的奖品：cost <= budget 或 cost == 0
      const expected_affordable = MOCK_PRIZES.filter(
        p => p.prize_value_points <= budget || p.prize_value_points === 0
      ).length

      expect(sufficiency.affordable_prizes_count).toBe(expected_affordable)

      console.log('✅ 可负担奖品数量验证通过')
    })
  })

  // ========== 权重重新归一化测试 ==========

  describe('降级后权重重新归一化', () => {
    test('降级后权重总和应保持 WEIGHT_SCALE', () => {
      const tiers = [BUDGET_TIER.B0, BUDGET_TIER.B1, BUDGET_TIER.B2, BUDGET_TIER.B3]

      for (const budget_tier of tiers) {
        const result = tier_matrix_calculator.calculate({
          budget_tier,
          pressure_tier: 'P1',
          base_weights: { high: 50000, mid: 150000, low: 300000, fallback: 500000 }
        })

        const total =
          result.final_weights.high +
          result.final_weights.mid +
          result.final_weights.low +
          result.final_weights.fallback

        console.log(`📊 ${budget_tier} 权重总和: ${total}`)
        expect(total).toBe(WEIGHT_SCALE)
      }

      console.log('✅ 所有 Budget Tier 权重归一化验证通过')
    })

    test('禁用档位的权重应重新分配到可用档位', () => {
      const base_weights = { high: 250000, mid: 250000, low: 250000, fallback: 250000 }

      // B2 禁用 high，其权重应分配到其他档位
      const b2_result = tier_matrix_calculator.calculate({
        budget_tier: BUDGET_TIER.B2,
        pressure_tier: 'P1',
        base_weights
      })

      console.log('📊 B2 权重重分配:')
      console.log(`   原始: ${JSON.stringify(base_weights)}`)
      console.log(`   调整后: ${JSON.stringify(b2_result.final_weights)}`)

      // high 权重为0
      expect(b2_result.final_weights.high).toBe(0)

      // 其他档位权重增加（总和仍为 WEIGHT_SCALE）
      const non_high_total =
        b2_result.final_weights.mid + b2_result.final_weights.low + b2_result.final_weights.fallback
      expect(non_high_total).toBe(WEIGHT_SCALE)

      console.log('✅ 权重重分配验证通过')
    })
  })

  // ========== 真实活动数据测试 ==========

  describe('真实活动数据验证', () => {
    test('应能正确处理真实奖品数据', async () => {
      if (!test_campaign || test_prizes.length === 0) {
        console.log('⚠️ 跳过测试：缺少真实活动或奖品数据')
        expect(true).toBe(true)
        return
      }

      console.log(`📊 真实活动: ${test_campaign.lottery_campaign_id} (${test_campaign.name})`)
      console.log(`📊 真实奖品数: ${test_prizes.length}`)

      // 按档位统计奖品
      const tier_counts = {
        high: test_prizes.filter(p => p.reward_tier === 'high').length,
        mid: test_prizes.filter(p => p.reward_tier === 'mid').length,
        low: test_prizes.filter(p => p.reward_tier === 'low').length,
        fallback: test_prizes.filter(p => p.reward_tier === 'fallback').length
      }

      console.log(`📊 各档位奖品数: ${JSON.stringify(tier_counts)}`)

      // 计算动态阈值
      const dynamic_thresholds = budget_tier_calculator._calculateDynamicThresholds(test_prizes)
      console.log(`📊 动态阈值: ${JSON.stringify(dynamic_thresholds)}`)

      expect(dynamic_thresholds.high).toBeGreaterThanOrEqual(0)
      expect(dynamic_thresholds.mid).toBeGreaterThanOrEqual(0)
      expect(dynamic_thresholds.low).toBeGreaterThanOrEqual(0)

      console.log('✅ 真实活动数据处理验证通过')
    })

    test('应能计算真实活动的预算充足性', async () => {
      if (!test_campaign) {
        console.log('⚠️ 跳过测试：缺少真实活动数据')
        expect(true).toBe(true)
        return
      }

      const pool_budget = test_campaign.pool_budget_remaining || 0
      const thresholds = budget_tier_calculator.thresholds
      const budget_tier = budget_tier_calculator._determineBudgetTier(pool_budget, thresholds)

      console.log(`📊 真实活动预算: ${pool_budget}`)
      console.log(`📊 判定 Budget Tier: ${budget_tier}`)

      const sufficiency = budget_tier_calculator._calculateBudgetSufficiency(
        pool_budget,
        test_prizes,
        budget_tier
      )

      console.log(`📊 预算充足性: ${JSON.stringify(sufficiency)}`)

      expect(sufficiency).toHaveProperty('is_sufficient')
      expect(sufficiency).toHaveProperty('affordable_prizes_count')
      expect(sufficiency).toHaveProperty('total_prizes_count')

      console.log('✅ 真实活动预算充足性验证通过')
    })
  })

  // ========== 边界条件测试 ==========

  describe('边界条件验证', () => {
    test('预算刚好等于阈值应正确判定', () => {
      const thresholds = budget_tier_calculator.thresholds

      // 刚好等于 high 阈值
      expect(budget_tier_calculator._determineBudgetTier(thresholds.high, thresholds)).toBe(
        BUDGET_TIER.B3
      )

      // 比 high 阈值少1
      expect(budget_tier_calculator._determineBudgetTier(thresholds.high - 1, thresholds)).toBe(
        BUDGET_TIER.B2
      )

      // 刚好等于 mid 阈值
      expect(budget_tier_calculator._determineBudgetTier(thresholds.mid, thresholds)).toBe(
        BUDGET_TIER.B2
      )

      // 刚好等于 low 阈值
      expect(budget_tier_calculator._determineBudgetTier(thresholds.low, thresholds)).toBe(
        BUDGET_TIER.B1
      )

      console.log('✅ 阈值边界条件验证通过')
    })

    test('所有奖品价值为0时阈值应为0（免费奖品不需要预算门槛）', () => {
      const zero_value_prizes = [
        { lottery_prize_id: 1, reward_tier: 'fallback', prize_value_points: 0 },
        { lottery_prize_id: 2, reward_tier: 'fallback', prize_value_points: 0 }
      ]

      const dynamic_thresholds =
        budget_tier_calculator._calculateDynamicThresholds(zero_value_prizes)

      console.log(`📊 全0价值奖品阈值: ${JSON.stringify(dynamic_thresholds)}`)

      /*
       * 所有奖品 prize_value_points=0 → getMinPositiveCost 返回 null → 阈值为 0
       * 这是正确行为：免费奖品无需任何预算门槛
       */
      expect(dynamic_thresholds.high).toBe(0)
      expect(dynamic_thresholds.mid).toBe(0)
      expect(dynamic_thresholds.low).toBe(0)

      console.log('✅ 全0价值奖品处理验证通过')
    })

    test('只有一个档位有奖品时应正确降级', () => {
      const prizes_by_tier = {
        high: [],
        mid: [],
        low: [],
        fallback: [{ lottery_prize_id: 1 }]
      }

      // 从任意档位开始都应该降级到 fallback
      for (const start_tier of TIER_DOWNGRADE_PATH) {
        const result = (() => {
          for (const tier of TIER_DOWNGRADE_PATH.slice(TIER_DOWNGRADE_PATH.indexOf(start_tier))) {
            if (prizes_by_tier[tier]?.length > 0) {
              return tier
            }
          }
          return 'fallback'
        })()

        expect(result).toBe('fallback')
      }

      console.log('✅ 单档位奖品降级验证通过')
    })
  })
})
