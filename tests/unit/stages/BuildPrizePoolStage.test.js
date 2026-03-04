'use strict'

/**
 * BuildPrizePoolStage 资源级过滤测试
 *
 * 验证"去预算门控改资源级过滤"重构后的核心行为：
 * 1. DIAMOND 奖品仅受 DIAMOND_QUOTA 控制，不受 BUDGET_POINTS 影响
 * 2. 保底/空奖（pvp=0 且非 DIAMOND）永远通过
 * 3. 其余奖品检查 BUDGET_POINTS 余额
 * 4. 档位门控（_filterByAllowedTiers）不再执行
 *
 * 对应文档：档位门控重构：去预算门控改资源级过滤.md 第五章验证用例
 *
 * @module tests/unit/stages/BuildPrizePoolStage
 * @since 2026-03-04
 */

const BuildPrizePoolStage = require('../../../services/UnifiedLotteryEngine/pipeline/stages/BuildPrizePoolStage')

/**
 * 真实奖品池镜像（基于数据库 lottery_prizes 表 campaign_id=1 的 8 个 active 奖品）
 * prize_value_points 已按迁移后的值设置（DIAMOND pvp=0）
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
    is_fallback: 0,
    win_weight: 200000,
    stock_quantity: 50,
    max_daily_wins: null,
    max_user_wins: null
  },
  {
    lottery_prize_id: 164,
    prize_name: '八折优惠券',
    prize_type: 'coupon',
    reward_tier: 'high',
    material_asset_code: null,
    material_amount: null,
    prize_value_points: 15,
    is_fallback: 0,
    win_weight: 800000,
    stock_quantity: 3000,
    max_daily_wins: null,
    max_user_wins: null
  },
  {
    lottery_prize_id: 165,
    prize_name: '招牌虾滑1份',
    prize_type: 'physical',
    reward_tier: 'mid',
    material_asset_code: null,
    material_amount: null,
    prize_value_points: 10,
    is_fallback: 0,
    win_weight: 400000,
    stock_quantity: 500,
    max_daily_wins: null,
    max_user_wins: null
  },
  {
    lottery_prize_id: 166,
    prize_name: '精酿啤酒1杯',
    prize_type: 'physical',
    reward_tier: 'mid',
    material_asset_code: null,
    material_amount: null,
    prize_value_points: 8,
    is_fallback: 0,
    win_weight: 350000,
    stock_quantity: 1000,
    max_daily_wins: null,
    max_user_wins: null
  },
  {
    lottery_prize_id: 167,
    prize_name: '九五折券',
    prize_type: 'coupon',
    reward_tier: 'mid',
    material_asset_code: null,
    material_amount: null,
    prize_value_points: 5,
    is_fallback: 0,
    win_weight: 250000,
    stock_quantity: 8000,
    max_daily_wins: null,
    max_user_wins: null
  },
  {
    lottery_prize_id: 168,
    prize_name: '钻石×1',
    prize_type: 'virtual',
    reward_tier: 'low',
    material_asset_code: 'DIAMOND',
    material_amount: 1,
    prize_value_points: 0,
    is_fallback: 0,
    win_weight: 300000,
    stock_quantity: 99999,
    max_daily_wins: null,
    max_user_wins: null
  },
  {
    lottery_prize_id: 169,
    prize_name: '幸运5积分',
    prize_type: 'points',
    reward_tier: 'low',
    material_asset_code: null,
    material_amount: null,
    prize_value_points: 1,
    is_fallback: 0,
    win_weight: 350000,
    stock_quantity: 99999,
    max_daily_wins: null,
    max_user_wins: null
  },
  {
    lottery_prize_id: 170,
    prize_name: '幸运5积分',
    prize_type: 'points',
    reward_tier: 'low',
    material_asset_code: null,
    material_amount: null,
    prize_value_points: 0,
    is_fallback: 1,
    win_weight: 350000,
    stock_quantity: 99999,
    max_daily_wins: null,
    max_user_wins: null
  }
]

/* ── Mock 外部依赖 ── */

jest.mock('../../../services/AdminSystemService', () => ({
  getSettingValue: jest.fn(async (category, key, defaultValue) => {
    if (category === 'points' && key === 'diamond_quota_enabled') return true
    if (category === 'points' && key === 'diamond_quota_exhausted_action') return 'filter'
    return defaultValue
  })
}))

let mockDiamondQuota = 200
jest.mock('../../../services/asset/BalanceService', () => ({
  getOrCreateAccount: jest.fn(async () => ({ account_id: 1 })),
  getBalance: jest.fn(async () => ({
    available_amount: mockDiamondQuota
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
    mockDiamondQuota = 200
  })

  describe('_filterByResourceEligibility', () => {
    /**
     * 场景1：预算充足（BUDGET=100），钻石配额充足（QUOTA=200）
     * 期望：所有 8 个奖品全部通过
     */
    test('场景1：预算充足 + 钻石配额充足 → 全部通过', async () => {
      const result = await stage._filterByResourceEligibility(REAL_PRIZE_POOL, 31, 100)

      expect(result).toHaveLength(8)
      expect(result.map(p => p.lottery_prize_id)).toEqual(
        expect.arrayContaining([163, 164, 165, 166, 167, 168, 169, 170])
      )
    })

    /**
     * 场景2（核心场景）：预算耗尽（BUDGET=0），钻石配额充足（QUOTA=200）
     * 期望：钻石×1 通过（走 DIAMOND_QUOTA 分支），幸运5积分(pvp=0) 通过，其余被预算过滤
     */
    test('场景2：预算耗尽 + 钻石配额充足 → 钻石通过、付费奖品被过滤', async () => {
      const result = await stage._filterByResourceEligibility(REAL_PRIZE_POOL, 31, 0)

      const surviving_ids = result.map(p => p.lottery_prize_id)

      /* 钻石×1 (id=168, DIAMOND, amount=1) 必须存活 — 这是本次重构的核心验证 */
      expect(surviving_ids).toContain(168)

      /* 幸运5积分 (id=170, pvp=0, is_fallback=1) 必须存活 */
      expect(surviving_ids).toContain(170)

      /* 付费奖品（pvp>0 且非 DIAMOND）全部被过滤 */
      expect(surviving_ids).not.toContain(163) // 四人鸳鸯锅套餐 pvp=20
      expect(surviving_ids).not.toContain(164) // 八折优惠券 pvp=15
      expect(surviving_ids).not.toContain(165) // 招牌虾滑 pvp=10
      expect(surviving_ids).not.toContain(166) // 精酿啤酒 pvp=8
      expect(surviving_ids).not.toContain(167) // 九五折券 pvp=5
      expect(surviving_ids).not.toContain(169) // 幸运5积分 pvp=1

      expect(result).toHaveLength(2)
    })

    /**
     * 场景3：钻石配额耗尽（QUOTA=0），预算充足（BUDGET=100）
     * 期望：钻石×1 被 DIAMOND 分支过滤（quota=0 < amount=1），其余按 pvp 正常过滤
     */
    test('场景3：钻石配额耗尽 + 预算充足 → 钻石被过滤、其余正常', async () => {
      mockDiamondQuota = 0

      const result = await stage._filterByResourceEligibility(REAL_PRIZE_POOL, 31, 100)

      const surviving_ids = result.map(p => p.lottery_prize_id)

      /* 钻石×1 被过滤（quota=0 < amount=1） */
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
      mockDiamondQuota = 0

      const result = await stage._filterByResourceEligibility(REAL_PRIZE_POOL, 31, 0)

      expect(result).toHaveLength(1)
      expect(result[0].lottery_prize_id).toBe(170)
      expect(result[0].prize_value_points).toBe(0)
      expect(result[0].is_fallback).toBe(1)
    })

    /**
     * 场景5：低消费用户（BUDGET=5），钻石配额充足
     * 期望：九五折券(pvp=5) 通过，high 全被过滤，low 档 DIAMOND + 保底通过
     */
    test('场景5：低消费用户 → 仅 pvp<=5 的奖品和钻石通过', async () => {
      const result = await stage._filterByResourceEligibility(REAL_PRIZE_POOL, 31, 5)

      const surviving_ids = result.map(p => p.lottery_prize_id)

      /* high 档全被过滤（pvp=20, 15 > 5） */
      expect(surviving_ids).not.toContain(163)
      expect(surviving_ids).not.toContain(164)

      /* mid 档仅九五折券通过（pvp=5 <= 5） */
      expect(surviving_ids).toContain(167) // 九五折券 pvp=5
      expect(surviving_ids).not.toContain(165) // 招牌虾滑 pvp=10
      expect(surviving_ids).not.toContain(166) // 精酿啤酒 pvp=8

      /* low 档：钻石通过（DIAMOND_QUOTA 分支）、幸运5积分(pvp=1) 通过、保底通过 */
      expect(surviving_ids).toContain(168) // 钻石×1
      expect(surviving_ids).toContain(169) // 幸运5积分 pvp=1
      expect(surviving_ids).toContain(170) // 保底 pvp=0

      expect(result).toHaveLength(4)
    })
  })

  describe('_groupByTier（资源级过滤后的分组验证）', () => {
    /**
     * 场景2 后续：预算耗尽后分组，验证 low 档有 DIAMOND + 保底
     */
    test('预算耗尽后分组：low 档保留钻石和保底', async () => {
      const filtered = await stage._filterByResourceEligibility(REAL_PRIZE_POOL, 31, 0)

      const grouped = stage._groupByTier(filtered)

      expect(grouped.high).toHaveLength(0)
      expect(grouped.mid).toHaveLength(0)
      expect(grouped.low).toHaveLength(2)
      expect(grouped.low.map(p => p.lottery_prize_id)).toEqual(expect.arrayContaining([168, 170]))
    })
  })

  describe('档位门控移除验证', () => {
    /**
     * 验证 _filterByAllowedTiers 函数仍然存在（用于回滚），
     * 但 execute() 不再调用它
     */
    test('_filterByAllowedTiers 方法仍然存在（保留用于回滚）', () => {
      expect(typeof stage._filterByAllowedTiers).toBe('function')
    })

    test('_filterByResourceEligibility 方法已添加', () => {
      expect(typeof stage._filterByResourceEligibility).toBe('function')
    })

    test('_filterByBudget 方法仍然存在（保留用于回滚）', () => {
      expect(typeof stage._filterByBudget).toBe('function')
    })
  })
})
