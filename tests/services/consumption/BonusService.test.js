/**
 * ConsumptionBonusService 单元测试 — 消费加成活动服务（多活动独立倍率，方案C）
 *
 * 测试范围：
 * - resolveConsumptionBonusRate：命中判定核心逻辑
 *   · 全平台活动命中（store_ids/merchant_ids 均 NULL）
 *   · 商家专属活动命中（merchant_ids 含目标商家）
 *   · 【核心】商家专属优先于全平台（同时命中取商家专属）
 *   · 同组多命中按 priority 取最高
 *   · 时间窗外不命中
 *   · 门店/商家不匹配不命中
 *   · 加成率二次夹紧上限（bonus_rate > max_bonus_rate 时按上限）
 *   · 无命中返回 0
 * - CRUD 校验：加成率非负、超上限拦截、store_ids 格式
 *
 * 测试规范：
 * - 连接真实数据库（.env 唯一真相源），写操作全部在事务内执行并回滚（不污染数据）
 * - 服务通过 global.getTestService('consumption_bonus') 获取
 *
 * @date 2026-07-15
 */

'use strict'

require('dotenv').config()

const { sequelize } = require('../../../models')

let ConsumptionBonusService

jest.setTimeout(30000)

describe('ConsumptionBonusService - 消费加成活动（多活动独立倍率）', () => {
  // 测试用门店/商家标识（仅用于命中判定入参，不写关联表）
  const TEST_STORE_ID = 90001
  const TEST_MERCHANT_ID = 80001
  const OTHER_MERCHANT_ID = 80002

  let transaction

  beforeAll(async () => {
    await sequelize.authenticate()
    ConsumptionBonusService = global.getTestService
      ? global.getTestService('consumption_bonus')
      : require('../../../services/consumption/BonusService')
  })

  beforeEach(async () => {
    transaction = await sequelize.transaction()
  })

  afterEach(async () => {
    await transaction.rollback()
  })

  /**
   * 事务内创建一条 active 规则的辅助函数
   * @param {Object} overrides - 覆盖字段
   * @returns {Promise<Object>} 创建的规则
   */
  async function createRule(overrides = {}) {
    return ConsumptionBonusService.createRule(
      {
        rule_name: overrides.rule_name || '单测消费加成规则',
        display_name: overrides.display_name || '单测活动',
        bonus_rate: overrides.bonus_rate ?? 0.5,
        store_ids: overrides.store_ids ?? null,
        merchant_ids: overrides.merchant_ids ?? null,
        start_at: overrides.start_at ?? null,
        end_at: overrides.end_at ?? null,
        priority: overrides.priority ?? 0,
        max_bonus_rate: overrides.max_bonus_rate ?? 2.0,
        status: overrides.status ?? 'active'
      },
      { transaction }
    )
  }

  describe('resolveConsumptionBonusRate - 命中判定', () => {
    test('全平台活动（无门店/商家限制）命中任意消费', async () => {
      await createRule({ bonus_rate: 0.5, store_ids: null, merchant_ids: null })
      const result = await ConsumptionBonusService.resolveConsumptionBonusRate({
        store_id: TEST_STORE_ID,
        merchant_id: TEST_MERCHANT_ID,
        transaction
      })
      expect(result.bonus_rate).toBe(0.5)
      expect(result.rule).not.toBeNull()
    })

    test('商家专属活动仅命中目标商家', async () => {
      await createRule({ bonus_rate: 0.3, merchant_ids: [TEST_MERCHANT_ID] })
      // 目标商家命中
      const hit = await ConsumptionBonusService.resolveConsumptionBonusRate({
        merchant_id: TEST_MERCHANT_ID,
        transaction
      })
      expect(hit.bonus_rate).toBe(0.3)
      // 其它商家不命中
      const miss = await ConsumptionBonusService.resolveConsumptionBonusRate({
        merchant_id: OTHER_MERCHANT_ID,
        transaction
      })
      expect(miss.bonus_rate).toBe(0)
      expect(miss.rule).toBeNull()
    })

    test('【核心】商家专属优先于全平台（同时命中取商家专属）', async () => {
      // 全平台 0.5（优先级更高）+ 商家专属 0.3（优先级更低）同时命中同一商家
      await createRule({
        rule_name: '全平台活动',
        bonus_rate: 0.5,
        priority: 100,
        store_ids: null,
        merchant_ids: null
      })
      await createRule({
        rule_name: '商家专属活动',
        bonus_rate: 0.3,
        priority: 1,
        merchant_ids: [TEST_MERCHANT_ID]
      })
      const result = await ConsumptionBonusService.resolveConsumptionBonusRate({
        merchant_id: TEST_MERCHANT_ID,
        transaction
      })
      // 尽管全平台优先级(100)远高于商家专属(1)，仍应取商家专属 0.3
      expect(result.bonus_rate).toBe(0.3)
      expect(result.rule.rule_name).toBe('商家专属活动')
    })

    test('同组多命中按 priority 取最高', async () => {
      await createRule({ rule_name: '平台A', bonus_rate: 0.4, priority: 1 })
      await createRule({ rule_name: '平台B', bonus_rate: 0.7, priority: 9 })
      const result = await ConsumptionBonusService.resolveConsumptionBonusRate({
        merchant_id: TEST_MERCHANT_ID,
        transaction
      })
      expect(result.bonus_rate).toBe(0.7)
      expect(result.rule.rule_name).toBe('平台B')
    })

    test('时间窗外不命中', async () => {
      const past = new Date('2020-01-01T00:00:00+08:00')
      await createRule({ bonus_rate: 0.5, end_at: past })
      const result = await ConsumptionBonusService.resolveConsumptionBonusRate({
        merchant_id: TEST_MERCHANT_ID,
        now: new Date(),
        transaction
      })
      expect(result.bonus_rate).toBe(0)
    })

    test('加成率二次夹紧上限（bonus_rate 超过 max_bonus_rate）', async () => {
      /*
       * bonus_rate 1.5 但上限 1.0 → 夹紧为 1.0。
       * 注：createRule 走 Service 校验会拦截 rate>cap，故直接建实例绕过校验，专测夹紧逻辑。
       */
      const { ConsumptionBonusRule } = require('../../../models')
      await ConsumptionBonusRule.create(
        {
          rule_name: '超限规则',
          display_name: '超限',
          bonus_rate: 1.5,
          max_bonus_rate: 1.0,
          status: 'active'
        },
        { transaction }
      )
      const result = await ConsumptionBonusService.resolveConsumptionBonusRate({
        merchant_id: TEST_MERCHANT_ID,
        transaction
      })
      expect(result.bonus_rate).toBe(1.0)
    })

    test('无任何活动时返回 0', async () => {
      const result = await ConsumptionBonusService.resolveConsumptionBonusRate({
        merchant_id: TEST_MERCHANT_ID,
        transaction
      })
      expect(result.bonus_rate).toBe(0)
      expect(result.rule).toBeNull()
    })
  })

  describe('createRule - 校验', () => {
    test('加成率为负数应拒绝', async () => {
      await expect(
        ConsumptionBonusService.createRule(
          { rule_name: 'x', display_name: 'x', bonus_rate: -0.1 },
          { transaction }
        )
      ).rejects.toThrow()
    })

    test('加成率超过上限应拒绝', async () => {
      await expect(
        ConsumptionBonusService.createRule(
          { rule_name: 'x', display_name: 'x', bonus_rate: 2.5, max_bonus_rate: 2.0 },
          { transaction }
        )
      ).rejects.toThrow()
    })

    test('store_ids 非数组应拒绝', async () => {
      await expect(
        ConsumptionBonusService.createRule(
          { rule_name: 'x', display_name: 'x', bonus_rate: 0.5, store_ids: 'not-array' },
          { transaction }
        )
      ).rejects.toThrow()
    })

    test('写操作未传事务应拒绝', async () => {
      await expect(
        ConsumptionBonusService.createRule({
          rule_name: 'x',
          display_name: 'x',
          bonus_rate: 0.5
        })
      ).rejects.toThrow()
    })
  })
})
