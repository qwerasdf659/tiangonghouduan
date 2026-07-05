/**
 * EventBudgetService 单元测试 — 活动专属预算/活动积分生命周期服务
 *
 * 测试范围（水晶奖品倍率活动设计方案 §12 防囤积套利）：
 * - bucketKey：专属桶键派生（D-5 规范 EVENT_<活动code>）
 * - 归集规则 CRUD：校验（活动必填/比率>=0/store_ids 格式）+ 创建/更新/开关/删除
 * - resolveCollectionTarget：归集判定（命中→专属桶；门店不匹配/规则停用/时间窗外→null）
 * - clearExpiredEventBudgets：到期清零报告结构（无到期活动时零清零）
 *
 * 测试规范：
 * - 连接真实数据库（.env 唯一真相源），写操作全部在事务内执行并回滚
 * - 服务通过 global.getTestService('event_budget') 获取
 * - 抽奖活动用真实活动 lottery_campaign_id=1（active，end_time 2026-12）
 *
 * @date 2026-07-06
 */

'use strict'

require('dotenv').config()

const { sequelize, LotteryCampaign } = require('../../models')

let EventBudgetService

jest.setTimeout(30000)

describe('EventBudgetService - 活动专属预算/活动积分生命周期服务', () => {
  const TEST_ADMIN_ID = 31
  const TEST_CAMPAIGN_ID = 1

  /** 合法的归集规则创建请求体 */
  const VALID_PAYLOAD = {
    lottery_campaign_id: TEST_CAMPAIGN_ID,
    rule_name: '单测归集规则',
    event_points_ratio: 1.0,
    status: 'active'
  }

  let transaction

  beforeAll(async () => {
    await sequelize.authenticate()
    EventBudgetService = global.getTestService
      ? global.getTestService('event_budget')
      : require('../../services/lottery/EventBudgetService')
  })

  beforeEach(async () => {
    transaction = await sequelize.transaction()
  })

  afterEach(async () => {
    await transaction.rollback()
  })

  describe('bucketKey - 专属预算桶键派生（D-5）', () => {
    it('EVENT_<campaign_code> 格式', () => {
      expect(EventBudgetService.bucketKey('CAMP20250901001')).toBe('EVENT_CAMP20250901001')
    })
  })

  describe('resolveEntryAsset - 抽奖入场资产解析（双层货币可见层 §12.7 / §23.5 遗留项①）', () => {
    it('entry_asset_code=points（或缺省）→ 扣全局 points，不分桶', () => {
      expect(EventBudgetService.resolveEntryAsset({ entry_asset_code: 'points' })).toEqual({
        asset_code: 'points',
        lottery_campaign_id: null,
        is_event: false
      })
      // 缺省（未配置）时向后回落为 points，保证常驻活动语义不变
      expect(EventBudgetService.resolveEntryAsset({})).toEqual({
        asset_code: 'points',
        lottery_campaign_id: null,
        is_event: false
      })
    })

    it('entry_asset_code=event_points → 扣活动专属 event_points，按 EVENT_<code> 桶隔离', () => {
      expect(
        EventBudgetService.resolveEntryAsset({
          entry_asset_code: 'event_points',
          campaign_code: 'CAMP20250901001'
        })
      ).toEqual({
        asset_code: 'event_points',
        lottery_campaign_id: 'EVENT_CAMP20250901001',
        is_event: true
      })
    })

    it('event_points 但缺 campaign_code → 抛 ENTRY_ASSET_BUCKET_MISSING（无法定位专属桶）', () => {
      expect(() =>
        EventBudgetService.resolveEntryAsset({ entry_asset_code: 'event_points' })
      ).toThrow(/campaign_code/)
    })
  })

  describe('createRule - 创建归集规则（校验 + 写入）', () => {
    it('写操作未传事务应抛 TRANSACTION_REQUIRED', async () => {
      await expect(EventBudgetService.createRule(VALID_PAYLOAD, TEST_ADMIN_ID)).rejects.toThrow(
        /事务/
      )
    })

    it('缺少 lottery_campaign_id / rule_name 应报错', async () => {
      await expect(
        EventBudgetService.createRule(
          { ...VALID_PAYLOAD, lottery_campaign_id: undefined },
          TEST_ADMIN_ID,
          { transaction }
        )
      ).rejects.toThrow(/lottery_campaign_id/)

      await expect(
        EventBudgetService.createRule({ ...VALID_PAYLOAD, rule_name: undefined }, TEST_ADMIN_ID, {
          transaction
        })
      ).rejects.toThrow(/rule_name/)
    })

    it('event_points_ratio 为负应报错；store_ids 空数组应报错', async () => {
      await expect(
        EventBudgetService.createRule({ ...VALID_PAYLOAD, event_points_ratio: -1 }, TEST_ADMIN_ID, {
          transaction
        })
      ).rejects.toThrow(/event_points_ratio/)

      await expect(
        EventBudgetService.createRule({ ...VALID_PAYLOAD, store_ids: [] }, TEST_ADMIN_ID, {
          transaction
        })
      ).rejects.toThrow(/store_ids/)
    })

    it('归集去向活动不存在应报 CAMPAIGN_NOT_FOUND', async () => {
      await expect(
        EventBudgetService.createRule(
          { ...VALID_PAYLOAD, lottery_campaign_id: 999999 },
          TEST_ADMIN_ID,
          { transaction }
        )
      ).rejects.toThrow(/活动不存在/)
    })

    it('合法请求创建成功（默认 event_points_ratio=1.0）', async () => {
      const rule = await EventBudgetService.createRule(VALID_PAYLOAD, TEST_ADMIN_ID, {
        transaction
      })
      expect(Number(rule.collection_rule_id)).toBeGreaterThan(0)
      expect(rule.lottery_campaign_id).toBe(TEST_CAMPAIGN_ID)
      expect(rule.event_points_ratio).toBe(1)
      expect(rule.status).toBe('active')
    })
  })

  describe('updateRule / setStatus / deleteRule', () => {
    it('updateRule 可改比率与门店条件；lottery_campaign_id 不可改绑', async () => {
      const rule = await EventBudgetService.createRule(VALID_PAYLOAD, TEST_ADMIN_ID, {
        transaction
      })

      const updated = await EventBudgetService.updateRule(
        rule.collection_rule_id,
        { event_points_ratio: 0.5, store_ids: [101, 102], lottery_campaign_id: 999999 },
        TEST_ADMIN_ID,
        { transaction }
      )
      expect(updated.event_points_ratio).toBe(0.5)
      expect(updated.store_ids).toEqual([101, 102])
      expect(updated.lottery_campaign_id).toBe(TEST_CAMPAIGN_ID)
    })

    it('setStatus 非法状态报错；deleteRule 删除成功', async () => {
      const rule = await EventBudgetService.createRule(VALID_PAYLOAD, TEST_ADMIN_ID, {
        transaction
      })

      await expect(
        EventBudgetService.setStatus(rule.collection_rule_id, 'paused', { transaction })
      ).rejects.toThrow(/非法/)

      const stopped = await EventBudgetService.setStatus(rule.collection_rule_id, 'inactive', {
        transaction
      })
      expect(stopped.status).toBe('inactive')

      const ok = await EventBudgetService.deleteRule(rule.collection_rule_id, { transaction })
      expect(ok).toBe(true)
    })
  })

  describe('resolveCollectionTarget - 归集判定（§12.10 后端规则自动判定）', () => {
    it('命中不限门店的 active 规则 → 返回专属桶键 EVENT_<活动code>', async () => {
      await EventBudgetService.createRule(VALID_PAYLOAD, TEST_ADMIN_ID, { transaction })

      const campaign = await LotteryCampaign.findByPk(TEST_CAMPAIGN_ID, { transaction })
      const target = await EventBudgetService.resolveCollectionTarget({
        store_id: 1,
        merchant_id: 1,
        transaction
      })

      expect(target).not.toBeNull()
      expect(target.bucket_key).toBe(`EVENT_${campaign.campaign_code}`)
      expect(target.event_points_ratio).toBe(1)
      expect(target.campaign.lottery_campaign_id).toBe(TEST_CAMPAIGN_ID)
    })

    it('门店条件不匹配 → null（维持全局 CONSUMPTION_DEFAULT）', async () => {
      await EventBudgetService.createRule(
        { ...VALID_PAYLOAD, store_ids: [888888] },
        TEST_ADMIN_ID,
        { transaction }
      )

      const target = await EventBudgetService.resolveCollectionTarget({
        store_id: 1,
        merchant_id: 1,
        transaction
      })
      expect(target).toBeNull()
    })

    it('规则停用（inactive）→ null', async () => {
      await EventBudgetService.createRule({ ...VALID_PAYLOAD, status: 'inactive' }, TEST_ADMIN_ID, {
        transaction
      })

      const target = await EventBudgetService.resolveCollectionTarget({
        store_id: 1,
        merchant_id: 1,
        transaction
      })
      expect(target).toBeNull()
    })

    it('规则时间窗已过（end_at 在过去）→ null', async () => {
      await EventBudgetService.createRule(
        { ...VALID_PAYLOAD, start_at: new Date('2020-01-01'), end_at: new Date('2020-12-31') },
        TEST_ADMIN_ID,
        { transaction }
      )

      const target = await EventBudgetService.resolveCollectionTarget({
        store_id: 1,
        merchant_id: 1,
        transaction
      })
      expect(target).toBeNull()
    })
  })

  describe('clearExpiredEventBudgets - 到期清零（防2 直接清零）', () => {
    it('未传事务应抛 TRANSACTION_REQUIRED', async () => {
      await expect(EventBudgetService.clearExpiredEventBudgets({})).rejects.toThrow(/事务/)
    })

    it('无到期活动时返回零清零报告（活动 1 end_time 未到期）', async () => {
      await EventBudgetService.createRule(VALID_PAYLOAD, TEST_ADMIN_ID, { transaction })

      const report = await EventBudgetService.clearExpiredEventBudgets({ transaction })
      expect(report).toHaveProperty('campaigns_processed')
      expect(report).toHaveProperty('balances_cleared')
      expect(report).toHaveProperty('total_cleared_amount')
      expect(Array.isArray(report.details)).toBe(true)
      // 活动 1 end_time 在未来 → 不应清任何余额
      expect(report.balances_cleared).toBe(0)
    })
  })
})
