'use strict'

/**
 * BuildPrizePoolStage 资源级过滤测试
 *
 * 验证核心行为：
 * 1. star_stone 奖品仅受 star_stone_quota 控制，不受 BUDGET_POINTS 影响
 * 2. 保底/空奖（budget_cost=0）永远通过
 * 3. 其余奖品统一用 budget_cost 判断（pvp 仅管分层阈值）
 * 4. 碎片奖品的 budget_cost 正确过滤（BUG-1 修复验证）
 *
 * @module tests/unit/stages/BuildPrizePoolStage
 * @since 2026-03-04
 * @updated 2026-03-05 budget_cost 修复（BUG-1/BUG-2/BUG-3）
 */

const BuildPrizePoolStage = require('../../../services/UnifiedLotteryEngine/pipeline/stages/BuildPrizePoolStage')

/**
 * 真实奖品池镜像（基于数据库 lottery_prizes 表 campaign_id=1 的 8 个 active 奖品）
 * prize_value_points 已按迁移后的值设置（star_stone pvp=0）
 */
const REAL_PRIZE_POOL = [
  {
    lottery_prize_id: 163,
    prize_name: '四人鸳鸯锅套餐',
    prize_type: 'physical',
    reward_tier: 'high',
    material_asset_code: null,
    material_amount: null,
    prize_value_points: 20,
    budget_cost: 20,
    is_fallback: 0,
    win_weight: 200000,
    stock_quantity: 50
  },
  {
    lottery_prize_id: 164,
    prize_name: '八折优惠券',
    prize_type: 'coupon',
    reward_tier: 'high',
    material_asset_code: null,
    material_amount: null,
    prize_value_points: 15,
    budget_cost: 15,
    is_fallback: 0,
    win_weight: 800000,
    stock_quantity: 3000
  },
  {
    lottery_prize_id: 165,
    prize_name: '招牌虾滑1份',
    prize_type: 'physical',
    reward_tier: 'mid',
    material_asset_code: null,
    material_amount: null,
    prize_value_points: 10,
    budget_cost: 10,
    is_fallback: 0,
    win_weight: 400000,
    stock_quantity: 500
  },
  {
    lottery_prize_id: 166,
    prize_name: '精酿啤酒1杯',
    prize_type: 'physical',
    reward_tier: 'mid',
    material_asset_code: null,
    material_amount: null,
    prize_value_points: 8,
    budget_cost: 8,
    is_fallback: 0,
    win_weight: 350000,
    stock_quantity: 1000
  },
  {
    lottery_prize_id: 167,
    prize_name: '九五折券',
    prize_type: 'coupon',
    reward_tier: 'mid',
    material_asset_code: null,
    material_amount: null,
    prize_value_points: 5,
    budget_cost: 5,
    is_fallback: 0,
    win_weight: 250000,
    stock_quantity: 8000
  },
  {
    lottery_prize_id: 168,
    prize_name: '星石×1',
    prize_type: 'virtual',
    reward_tier: 'low',
    material_asset_code: 'star_stone',
    material_amount: 1,
    prize_value_points: 0,
    budget_cost: 0,
    is_fallback: 0,
    win_weight: 300000,
    stock_quantity: 99999
  },
  {
    lottery_prize_id: 169,
    prize_name: '幸运5积分',
    prize_type: 'points',
    reward_tier: 'low',
    material_asset_code: null,
    material_amount: null,
    prize_value_points: 1,
    budget_cost: 1,
    is_fallback: 0,
    win_weight: 350000,
    stock_quantity: 99999
  },
  {
    lottery_prize_id: 170,
    prize_name: '幸运5积分',
    prize_type: 'points',
    reward_tier: 'low',
    material_asset_code: null,
    material_amount: null,
    prize_value_points: 0,
    budget_cost: 0,
    is_fallback: 1,
    win_weight: 350000,
    stock_quantity: 99999
  }
]

/**
 * 扩展奖品池：包含碎片奖品（用于 BUG-1 修复验证）
 * 碎片×50: pvp=8（分层标记），budget_cost=500（50 × 10）
 * 碎片×3:  pvp=1（分层标记），budget_cost=30（3 × 10）
 */
const PRIZE_POOL_WITH_SHARDS = [
  ...REAL_PRIZE_POOL,
  {
    lottery_prize_id: 201,
    prize_name: '碎片×50',
    prize_type: 'virtual',
    reward_tier: 'high',
    material_asset_code: 'red_core_shard',
    material_amount: 50,
    prize_value_points: 8,
    budget_cost: 500,
    is_fallback: 0,
    win_weight: 100000,
    stock_quantity: 100
  },
  {
    lottery_prize_id: 202,
    prize_name: '碎片×3',
    prize_type: 'virtual',
    reward_tier: 'low',
    material_asset_code: 'red_core_shard',
    material_amount: 3,
    prize_value_points: 1,
    budget_cost: 30,
    is_fallback: 0,
    win_weight: 200000,
    stock_quantity: 1000
  }
]

/* ── Mock 外部依赖 ── */

jest.mock('../../../services/AdminSystemService', () => ({
  getSettingValue: jest.fn(async (category, key, defaultValue) => {
    if (category === 'points' && key === 'star_stone_quota_enabled') return true
    if (category === 'points' && key === 'star_stone_quota_exhausted_action') return 'filter'
    return defaultValue
  })
}))

let mockStarStoneQuota = 200
jest.mock('../../../services/asset/BalanceService', () => ({
  getOrCreateAccount: jest.fn(async () => ({ account_id: 1 })),
  getBalance: jest.fn(async () => ({
    available_amount: mockStarStoneQuota
  }))
}))

jest.mock('../../../models', () => ({
  sequelize: { query: jest.fn(async () => [[]]) }
}))

describe('BuildPrizePoolStage — 资源级过滤', () => {
  let stage

  beforeEach(() => {
    stage = new BuildPrizePoolStage()
    /* 静默日志避免测试输出噪音 */
    stage.log = jest.fn()
    mockStarStoneQuota = 200
  })

  describe('_filterByResourceEligibility', () => {
    /**
     * 场景1：预算充足（BUDGET=100），星石配额充足（QUOTA=200）
     * 期望：所有 8 个奖品全部通过
     */
    test('场景1：预算充足 + 星石配额充足 → 全部通过', async () => {
      const result = await stage._filterByResourceEligibility(REAL_PRIZE_POOL, 31, 100)

      expect(result).toHaveLength(8)
      expect(result.map(p => p.lottery_prize_id)).toEqual(
        expect.arrayContaining([163, 164, 165, 166, 167, 168, 169, 170])
      )
    })

    /**
     * 场景2（核心场景）：预算耗尽（BUDGET=0），星石配额充足（QUOTA=200）
     * 期望：星石×1 通过（走 star_stone_quota 分支），budget_cost=0 的奖品通过，其余被过滤
     */
    test('场景2：预算耗尽 + 星石配额充足 → 星石通过、付费奖品被过滤', async () => {
      const result = await stage._filterByResourceEligibility(REAL_PRIZE_POOL, 31, 0)

      const surviving_ids = result.map(p => p.lottery_prize_id)

      /* 星石×1 (id=168, star_stone, amount=1) 必须存活 */
      expect(surviving_ids).toContain(168)

      /* 幸运5积分 (id=170, budget_cost=0, is_fallback=1) 必须存活 */
      expect(surviving_ids).toContain(170)

      /* 付费奖品（budget_cost>0 且非 star_stone）全部被过滤 */
      expect(surviving_ids).not.toContain(163) // 四人鸳鸯锅套餐 budget_cost=20
      expect(surviving_ids).not.toContain(164) // 八折优惠券 budget_cost=15
      expect(surviving_ids).not.toContain(165) // 招牌虾滑 budget_cost=10
      expect(surviving_ids).not.toContain(166) // 精酿啤酒 budget_cost=8
      expect(surviving_ids).not.toContain(167) // 九五折券 budget_cost=5
      expect(surviving_ids).not.toContain(169) // 幸运5积分 budget_cost=1

      expect(result).toHaveLength(2)
    })

    /**
     * 场景3：星石配额耗尽（QUOTA=0），预算充足（BUDGET=100）
     * 期望：星石×1 被 star_stone 分支过滤（quota=0 < amount=1），其余按 pvp 正常过滤
     */
    test('场景3：星石配额耗尽 + 预算充足 → 星石被过滤、其余正常', async () => {
      mockStarStoneQuota = 0

      const result = await stage._filterByResourceEligibility(REAL_PRIZE_POOL, 31, 100)

      const surviving_ids = result.map(p => p.lottery_prize_id)

      /* 星石×1 被过滤（quota=0 < amount=1） */
      expect(surviving_ids).not.toContain(168)

      /* 其余 7 个奖品全部通过（pvp <= budget=100） */
      expect(surviving_ids).toContain(163) // pvp=20
      expect(surviving_ids).toContain(164) // pvp=15
      expect(surviving_ids).toContain(170) // pvp=0
      expect(result).toHaveLength(7)
    })

    /**
     * 场景4：双配额均耗尽（BUDGET=0，QUOTA=0）
     * 期望：只剩 pvp=0 的幸运5积分(id=170)
     */
    test('场景4：双配额均耗尽 → 只剩保底奖品', async () => {
      mockStarStoneQuota = 0

      const result = await stage._filterByResourceEligibility(REAL_PRIZE_POOL, 31, 0)

      expect(result).toHaveLength(1)
      expect(result[0].lottery_prize_id).toBe(170)
      expect(result[0].prize_value_points).toBe(0)
      expect(result[0].is_fallback).toBe(1)
    })

    /**
     * 场景5：低消费用户（BUDGET=5），星石配额充足
     * 期望：九五折券(pvp=5) 通过，high 全被过滤，low 档 star_stone + 保底通过
     */
    test('场景5：低消费用户 → 仅 pvp<=5 的奖品和星石通过', async () => {
      const result = await stage._filterByResourceEligibility(REAL_PRIZE_POOL, 31, 5)

      const surviving_ids = result.map(p => p.lottery_prize_id)

      /* high 档全被过滤（pvp=20, 15 > 5） */
      expect(surviving_ids).not.toContain(163)
      expect(surviving_ids).not.toContain(164)

      /* mid 档仅九五折券通过（pvp=5 <= 5） */
      expect(surviving_ids).toContain(167) // 九五折券 pvp=5
      expect(surviving_ids).not.toContain(165) // 招牌虾滑 pvp=10
      expect(surviving_ids).not.toContain(166) // 精酿啤酒 pvp=8

      /* low 档：星石通过（star_stone_quota 分支）、幸运5积分(pvp=1) 通过、保底通过 */
      expect(surviving_ids).toContain(168) // 星石×1
      expect(surviving_ids).toContain(169) // 幸运5积分 pvp=1
      expect(surviving_ids).toContain(170) // 保底 pvp=0

      expect(result).toHaveLength(4)
    })
  })

  describe('_groupByTier（资源级过滤后的分组验证）', () => {
    /**
     * 场景2 后续：预算耗尽后分组，验证 low 档有 star_stone + 保底
     */
    test('预算耗尽后分组：low 档保留星石和保底', async () => {
      const filtered = await stage._filterByResourceEligibility(REAL_PRIZE_POOL, 31, 0)

      const grouped = stage._groupByTier(filtered)

      expect(grouped.high).toHaveLength(0)
      expect(grouped.mid).toHaveLength(0)
      expect(grouped.low).toHaveLength(2)
      expect(grouped.low.map(p => p.lottery_prize_id)).toEqual(expect.arrayContaining([168, 170]))
    })
  })

  describe('碎片奖品 budget_cost 过滤验证（BUG-1 修复）', () => {
    /**
     * BUG-1 核心验证：碎片×50 的 pvp=8 但 budget_cost=500
     * 用户 BUDGET=60 时，pvp 判断会错误通过（8≤60），budget_cost 正确过滤（60<500）
     */
    test('BUG-1：碎片×50（budget_cost=500）在 BUDGET=60 时被正确过滤', async () => {
      const result = await stage._filterByResourceEligibility(PRIZE_POOL_WITH_SHARDS, 31, 60)
      const surviving_ids = result.map(p => p.lottery_prize_id)

      expect(surviving_ids).not.toContain(201) // 碎片×50 budget_cost=500 > 60
      expect(surviving_ids).toContain(202) // 碎片×3 budget_cost=30 ≤ 60
    })

    /**
     * 碎片×3（budget_cost=30）在 BUDGET=29 时被过滤，BUDGET=30 时通过
     */
    test('碎片×3 的过滤边界：budget_cost=30 vs BUDGET=29/30', async () => {
      const result29 = await stage._filterByResourceEligibility(PRIZE_POOL_WITH_SHARDS, 31, 29)
      expect(result29.map(p => p.lottery_prize_id)).not.toContain(202)

      const result30 = await stage._filterByResourceEligibility(PRIZE_POOL_WITH_SHARDS, 31, 30)
      expect(result30.map(p => p.lottery_prize_id)).toContain(202)
    })

    /**
     * BUDGET=500 恰好等于碎片×50 的 budget_cost=500 → 通过（边界值）
     */
    test('BUDGET=500 等于碎片×50 budget_cost=500 → 恰好通过（边界值）', async () => {
      const result = await stage._filterByResourceEligibility(PRIZE_POOL_WITH_SHARDS, 31, 500)
      const surviving_ids = result.map(p => p.lottery_prize_id)

      expect(surviving_ids).toContain(201) // 碎片×50 budget_cost=500 ≤ 500
      expect(surviving_ids).toContain(202) // 碎片×3 budget_cost=30 ≤ 500
    })

    /**
     * BUDGET=499 不够碎片×50 的 budget_cost=500 → 过滤
     */
    test('BUDGET=499 小于碎片×50 budget_cost=500 → 过滤', async () => {
      const result = await stage._filterByResourceEligibility(PRIZE_POOL_WITH_SHARDS, 31, 499)
      const surviving_ids = result.map(p => p.lottery_prize_id)

      expect(surviving_ids).not.toContain(201) // 碎片×50 budget_cost=500 > 499
      expect(surviving_ids).toContain(202) // 碎片×3 budget_cost=30 ≤ 499
    })

    /**
     * 碎片配额耗尽后只剩保底和星石
     */
    test('碎片配额耗尽 → 碎片全过滤，星石和保底保留', async () => {
      const result = await stage._filterByResourceEligibility(PRIZE_POOL_WITH_SHARDS, 31, 0)
      const surviving_ids = result.map(p => p.lottery_prize_id)

      expect(surviving_ids).not.toContain(201)
      expect(surviving_ids).not.toContain(202)
      expect(surviving_ids).toContain(168) // 星石
      expect(surviving_ids).toContain(170) // 保底
    })
  })

  describe('方法存在性验证', () => {
    test('_filterByResourceEligibility 方法已添加', () => {
      expect(typeof stage._filterByResourceEligibility).toBe('function')
    })

    test('_filterByBudget 已删除（被 _filterByResourceEligibility 取代）', () => {
      expect(typeof stage._filterByBudget).toBe('undefined')
    })
  })
})
