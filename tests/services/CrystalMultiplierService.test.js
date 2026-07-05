/**
 * CrystalMultiplierService 单元测试 — 水晶奖品倍率计算服务
 *
 * 测试范围（水晶奖品倍率活动设计方案 §18.3 单测要求）：
 * - 纯计算：isCrystalForm / applyRounding（ceil/round/floor）/ scopeCovers / effectiveMultiplier（cap 夹紧）
 * - resolveMultiplier：无命中→×1、单命中、多命中取 max、cap 夹紧、成本击穿回退、
 *   非水晶跳过、兜底不翻、user 定向命中/不命中、成本累加（extra_cost_used）
 * - getMergedMultiplierForUser：C 端合并倍率只读查询（active/inactive）
 *
 * 测试规范：
 * - 连接真实数据库 restaurant_points_dev（.env 唯一真相源），不使用 mock 数据
 * - 全部写操作在事务内执行并回滚，不污染真实数据
 * - 测试账号 user_id=31（13612227930）；抽奖活动用真实活动 lottery_campaign_id=1
 *
 * @date 2026-07-06
 */

'use strict'

require('dotenv').config()

const {
  sequelize,
  RewardMultiplierCampaign,
  RewardMultiplierTarget,
  MaterialAssetType
} = require('../../models')
const CrystalMultiplierService = require('../../services/lottery/CrystalMultiplierService')

jest.setTimeout(30000)

describe('CrystalMultiplierService - 水晶奖品倍率计算服务', () => {
  const TEST_USER_ID = 31
  const TEST_CAMPAIGN_ID = 1

  /** 真实水晶资产（red_core_shard，budget_value_points=1，form=shard） */
  const CRYSTAL_PRIZE = {
    prize_type: 'material',
    material_asset_code: 'red_core_shard',
    material_amount: 10
  }

  beforeAll(async () => {
    await sequelize.authenticate()
  })

  /* ==================== 纯计算函数（无 DB） ==================== */

  describe('isCrystalForm - 水晶形态判定（form ∈ shard/gem）', () => {
    it('shard/gem 为水晶，currency/quota 非水晶', () => {
      expect(CrystalMultiplierService.isCrystalForm('shard')).toBe(true)
      expect(CrystalMultiplierService.isCrystalForm('gem')).toBe(true)
      expect(CrystalMultiplierService.isCrystalForm('currency')).toBe(false)
      expect(CrystalMultiplierService.isCrystalForm('quota')).toBe(false)
    })
  })

  describe('applyRounding - 小数倍率取整（默认 ceil 向上，拍板 §11-9）', () => {
    it('ceil：10×1.75=17.5→18、10×1.55=15.5→16、10×2=20', () => {
      expect(CrystalMultiplierService.applyRounding(10, 1.75, 'ceil')).toBe(18)
      expect(CrystalMultiplierService.applyRounding(10, 1.55, 'ceil')).toBe(16)
      expect(CrystalMultiplierService.applyRounding(10, 2, 'ceil')).toBe(20)
    })

    it('round：10×1.75=17.5→18（四舍五入）；floor：10×1.75→17（向下）', () => {
      expect(CrystalMultiplierService.applyRounding(10, 1.75, 'round')).toBe(18)
      expect(CrystalMultiplierService.applyRounding(10, 1.75, 'floor')).toBe(17)
    })

    it('未指定模式默认 ceil', () => {
      expect(CrystalMultiplierService.applyRounding(10, 1.05)).toBe(11)
    })
  })

  describe('scopeCovers - 奖品范围覆盖判定', () => {
    const assetMeta = { asset_code: 'red_core_shard', group_code: 'red' }

    it('crystal_all 覆盖全部水晶', () => {
      expect(CrystalMultiplierService.scopeCovers({ reward_scope: 'crystal_all' }, assetMeta)).toBe(
        true
      )
    })

    it('group 按色系收窄（含 red 覆盖，不含 red 不覆盖）', () => {
      expect(
        CrystalMultiplierService.scopeCovers(
          { reward_scope: 'group', scope_values: ['red', 'blue'] },
          assetMeta
        )
      ).toBe(true)
      expect(
        CrystalMultiplierService.scopeCovers(
          { reward_scope: 'group', scope_values: ['blue'] },
          assetMeta
        )
      ).toBe(false)
    })

    it('asset_codes 按资产码精确收窄', () => {
      expect(
        CrystalMultiplierService.scopeCovers(
          { reward_scope: 'asset_codes', scope_values: ['red_core_shard'] },
          assetMeta
        )
      ).toBe(true)
      expect(
        CrystalMultiplierService.scopeCovers(
          { reward_scope: 'asset_codes', scope_values: ['blue_core_gem'] },
          assetMeta
        )
      ).toBe(false)
    })
  })

  describe('effectiveMultiplier - 有效倍率（max_multiplier_cap 二次夹紧）', () => {
    it('倍率未超 cap 时取自身；超 cap 时夹紧到 cap；且下限为 1', () => {
      expect(
        CrystalMultiplierService.effectiveMultiplier({ multiplier: 2.5, max_multiplier_cap: 3 })
      ).toBe(2.5)
      expect(
        CrystalMultiplierService.effectiveMultiplier({ multiplier: 2.5, max_multiplier_cap: 2 })
      ).toBe(2)
      expect(
        CrystalMultiplierService.effectiveMultiplier({ multiplier: 0.5, max_multiplier_cap: 3 })
      ).toBe(1)
    })
  })

  /* ==================== resolveMultiplier（真实 DB + 事务回滚） ==================== */

  describe('resolveMultiplier - 结算时倍率解析（事务内，回滚不污染）', () => {
    let transaction

    /**
     * 在当前事务内创建一条倍率规则（默认全体生效、全水晶、×2、成本上限充足）
     * @param {Object} overrides - 字段覆盖
     * @returns {Promise<Object>} 规则实例
     */
    async function createRuleInTx(overrides = {}) {
      return RewardMultiplierCampaign.create(
        {
          lottery_campaign_id: TEST_CAMPAIGN_ID,
          campaign_name: '单测倍率规则',
          display_name: '单测水晶翻倍',
          multiplier: 2.0,
          reward_scope: 'crystal_all',
          target_type: 'all',
          rounding_mode: 'ceil',
          max_multiplier_cap: 3.0,
          extra_cost_limit: 1000000,
          extra_cost_used: 0,
          status: 'active',
          ...overrides
        },
        { transaction }
      )
    }

    beforeEach(async () => {
      transaction = await sequelize.transaction()
    })

    afterEach(async () => {
      await transaction.rollback()
    })

    it('无任何规则时 ×1（final = base，crystal=true）', async () => {
      const result = await CrystalMultiplierService.resolveMultiplier({
        user_id: TEST_USER_ID,
        prize: CRYSTAL_PRIZE,
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        transaction
      })
      expect(result.crystal).toBe(true)
      expect(result.applied_multiplier).toBe(1)
      expect(result.final_quantity).toBe(10)
      expect(result.extra_cost).toBe(0)
    })

    it('非 material 奖品跳过（crystal=false，×1）', async () => {
      await createRuleInTx()
      const result = await CrystalMultiplierService.resolveMultiplier({
        user_id: TEST_USER_ID,
        prize: { prize_type: 'coupon', material_asset_code: null, material_amount: 0 },
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        transaction
      })
      expect(result.crystal).toBe(false)
      expect(result.applied_multiplier).toBe(1)
    })

    it('非水晶材料（points=currency）跳过翻倍', async () => {
      await createRuleInTx()
      const result = await CrystalMultiplierService.resolveMultiplier({
        user_id: TEST_USER_ID,
        prize: { prize_type: 'material', material_asset_code: 'points', material_amount: 10 },
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        transaction
      })
      expect(result.crystal).toBe(false)
      expect(result.final_quantity).toBe(10)
    })

    it('兜底奖（is_fallback=true）是水晶也不翻倍（拍板 §11-7）', async () => {
      await createRuleInTx()
      const result = await CrystalMultiplierService.resolveMultiplier({
        user_id: TEST_USER_ID,
        prize: CRYSTAL_PRIZE,
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        is_fallback: true,
        transaction
      })
      expect(result.crystal).toBe(true)
      expect(result.applied_multiplier).toBe(1)
      expect(result.final_quantity).toBe(10)
    })

    it('单规则命中：×2 → 10 发 20，extra_cost=10×budget_value_points，且累加 extra_cost_used', async () => {
      const rule = await createRuleInTx()

      const asset = await MaterialAssetType.findOne({
        where: { asset_code: 'red_core_shard' },
        transaction
      })
      const unitCost = Number(asset.budget_value_points)

      const result = await CrystalMultiplierService.resolveMultiplier({
        user_id: TEST_USER_ID,
        prize: CRYSTAL_PRIZE,
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        transaction
      })

      expect(result.crystal).toBe(true)
      expect(result.applied_multiplier).toBe(2)
      expect(result.final_quantity).toBe(20)
      expect(result.multiplier_campaign_id).toBe(Number(rule.multiplier_campaign_id))
      expect(result.extra_cost).toBe(10 * unitCost)
      expect(result.reason).toContain('单测水晶翻倍')

      // 成本刹车账本：extra_cost_used 已在事务内累加
      const reloaded = await RewardMultiplierCampaign.findByPk(rule.multiplier_campaign_id, {
        transaction
      })
      expect(Number(reloaded.extra_cost_used)).toBe(10 * unitCost)
    })

    it('多规则命中取最高（max）：×2 与 ×3 并存 → 应用 ×3，candidates 含两条', async () => {
      await createRuleInTx({ multiplier: 2.0 })
      await createRuleInTx({
        campaign_name: '单测高倍',
        display_name: '单测高倍×3',
        multiplier: 3.0
      })

      const result = await CrystalMultiplierService.resolveMultiplier({
        user_id: TEST_USER_ID,
        prize: CRYSTAL_PRIZE,
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        transaction
      })

      expect(result.applied_multiplier).toBe(3)
      expect(result.final_quantity).toBe(30)
      expect(result.candidates.length).toBe(2)
    })

    it('cap 夹紧：multiplier=2.5 但 max_multiplier_cap=2 → 有效 ×2', async () => {
      await createRuleInTx({ multiplier: 2.5, max_multiplier_cap: 2.0 })

      const result = await CrystalMultiplierService.resolveMultiplier({
        user_id: TEST_USER_ID,
        prize: CRYSTAL_PRIZE,
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        transaction
      })

      expect(result.applied_multiplier).toBe(2)
      expect(result.final_quantity).toBe(20)
    })

    it('成本击穿回退：最高倍率规则额度耗尽 → 回退次高仍有额度的规则', async () => {
      // ×3 规则已击穿（used >= limit）
      await createRuleInTx({
        campaign_name: '单测击穿',
        display_name: '单测击穿×3',
        multiplier: 3.0,
        extra_cost_limit: 100,
        extra_cost_used: 100
      })
      // ×2 规则额度充足
      await createRuleInTx({ multiplier: 2.0 })

      const result = await CrystalMultiplierService.resolveMultiplier({
        user_id: TEST_USER_ID,
        prize: CRYSTAL_PRIZE,
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        transaction
      })

      expect(result.applied_multiplier).toBe(2)
      expect(result.final_quantity).toBe(20)
    })

    it('全部击穿 → ×1 正常发放（成本永不超上限，§4.3）', async () => {
      await createRuleInTx({ extra_cost_limit: 100, extra_cost_used: 100 })

      const result = await CrystalMultiplierService.resolveMultiplier({
        user_id: TEST_USER_ID,
        prize: CRYSTAL_PRIZE,
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        transaction
      })

      expect(result.applied_multiplier).toBe(1)
      expect(result.final_quantity).toBe(10)
    })

    it('user 定向：命中本人翻倍，非本人不翻', async () => {
      const rule = await createRuleInTx({ target_type: 'user' })
      await RewardMultiplierTarget.create(
        {
          multiplier_campaign_id: rule.multiplier_campaign_id,
          target_type: 'user',
          target_ref: String(TEST_USER_ID)
        },
        { transaction }
      )

      const hit = await CrystalMultiplierService.resolveMultiplier({
        user_id: TEST_USER_ID,
        prize: CRYSTAL_PRIZE,
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        transaction
      })
      expect(hit.applied_multiplier).toBe(2)

      const miss = await CrystalMultiplierService.resolveMultiplier({
        user_id: 999999999,
        prize: CRYSTAL_PRIZE,
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        transaction
      })
      expect(miss.applied_multiplier).toBe(1)
    })

    it('时间窗外的规则不生效（end_at 已过）', async () => {
      await createRuleInTx({
        start_at: new Date('2020-01-01'),
        end_at: new Date('2020-12-31')
      })

      const result = await CrystalMultiplierService.resolveMultiplier({
        user_id: TEST_USER_ID,
        prize: CRYSTAL_PRIZE,
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        transaction
      })
      expect(result.applied_multiplier).toBe(1)
    })

    it('活动隔离：绑定其他活动的规则不影响本活动（§2.4）', async () => {
      await createRuleInTx()

      // 查询另一个活动ID（不存在规则）→ 应 ×1
      const result = await CrystalMultiplierService.resolveMultiplier({
        user_id: TEST_USER_ID,
        prize: CRYSTAL_PRIZE,
        lottery_campaign_id: 999999,
        transaction
      })
      expect(result.applied_multiplier).toBe(1)
    })
  })

  /* ==================== getMergedMultiplierForUser（C 端只读） ==================== */

  describe('getMergedMultiplierForUser - C 端抽奖前合并倍率（只读，不写成本）', () => {
    it('无生效规则时 applied_multiplier=1 且 active=false（前端不展示角标，§5.2）', async () => {
      const merged = await CrystalMultiplierService.getMergedMultiplierForUser({
        user_id: TEST_USER_ID,
        lottery_campaign_id: 999999
      })
      expect(merged.applied_multiplier).toBe(1)
      expect(merged.active).toBe(false)
      expect(merged.display_name).toBeNull()
    })
  })
})
