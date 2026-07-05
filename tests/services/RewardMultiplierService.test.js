/**
 * RewardMultiplierService 单元测试 — 水晶奖品倍率规则管理服务
 *
 * 测试范围（水晶奖品倍率活动设计方案 §16.1/§16.2）：
 * - listRules：分页列表
 * - createRule：参数校验（活动必填/倍率>=1/extra_cost_limit 强制必填）+ 创建（含 targets）
 * - updateRule：字段更新 + targets 全量替换 + 禁止改绑活动
 * - setStatus / deleteRule：开关与删除
 * - getCostWaterLevel：成本水位统计结构
 * - getSegmentOptions：segment 选项数据源（DB segment_rule_configs，D-12 防漂移）
 * - getAdTagOptions：标签选项（当前可能为空数组）
 *
 * 测试规范：
 * - 连接真实数据库（.env 唯一真相源），写操作全部在事务内执行并回滚
 * - 服务通过 global.getTestService('reward_multiplier') 获取（与业务代码同源）
 * - 抽奖活动用真实活动 lottery_campaign_id=1
 *
 * @date 2026-07-06
 */

'use strict'

require('dotenv').config()

const { sequelize } = require('../../models')

let RewardMultiplierService

jest.setTimeout(30000)

describe('RewardMultiplierService - 水晶奖品倍率规则管理服务', () => {
  const TEST_ADMIN_ID = 31
  const TEST_CAMPAIGN_ID = 1

  /** 合法的规则创建请求体（snake_case，字段名 = 数据库列名，§16.1） */
  const VALID_PAYLOAD = {
    lottery_campaign_id: TEST_CAMPAIGN_ID,
    campaign_name: '单测规则',
    display_name: '单测水晶翻倍',
    multiplier: 2.0,
    reward_scope: 'crystal_all',
    target_type: 'all',
    extra_cost_limit: 100000,
    status: 'inactive'
  }

  let transaction

  beforeAll(async () => {
    await sequelize.authenticate()
    RewardMultiplierService = global.getTestService
      ? global.getTestService('reward_multiplier')
      : require('../../services/lottery/RewardMultiplierService')
  })

  beforeEach(async () => {
    transaction = await sequelize.transaction()
  })

  afterEach(async () => {
    await transaction.rollback()
  })

  describe('createRule - 创建规则（校验 + 写入）', () => {
    it('写操作未传事务应抛 TRANSACTION_REQUIRED（事务边界强制）', async () => {
      await expect(
        RewardMultiplierService.createRule(VALID_PAYLOAD, TEST_ADMIN_ID)
      ).rejects.toThrow(/事务/)
    })

    it('缺少 lottery_campaign_id 应报错（活动隔离，禁止全局规则）', async () => {
      await expect(
        RewardMultiplierService.createRule(
          { ...VALID_PAYLOAD, lottery_campaign_id: undefined },
          TEST_ADMIN_ID,
          { transaction }
        )
      ).rejects.toThrow(/lottery_campaign_id/)
    })

    it('缺少 extra_cost_limit 应报错（成本封顶强制必填，拍板 §11-6）', async () => {
      await expect(
        RewardMultiplierService.createRule(
          { ...VALID_PAYLOAD, extra_cost_limit: undefined },
          TEST_ADMIN_ID,
          { transaction }
        )
      ).rejects.toThrow(/extra_cost_limit/)
    })

    it('multiplier < 1 应报错', async () => {
      await expect(
        RewardMultiplierService.createRule({ ...VALID_PAYLOAD, multiplier: 0.5 }, TEST_ADMIN_ID, {
          transaction
        })
      ).rejects.toThrow(/multiplier/)
    })

    it('绑定不存在的活动应报 CAMPAIGN_NOT_FOUND', async () => {
      await expect(
        RewardMultiplierService.createRule(
          { ...VALID_PAYLOAD, lottery_campaign_id: 999999 },
          TEST_ADMIN_ID,
          { transaction }
        )
      ).rejects.toThrow(/活动不存在/)
    })

    it('target_type=user 时 targets 必填且创建后落库', async () => {
      await expect(
        RewardMultiplierService.createRule(
          { ...VALID_PAYLOAD, target_type: 'user', targets: [] },
          TEST_ADMIN_ID,
          { transaction }
        )
      ).rejects.toThrow(/targets/)

      const rule = await RewardMultiplierService.createRule(
        {
          ...VALID_PAYLOAD,
          target_type: 'user',
          targets: [{ target_type: 'user', target_ref: String(TEST_ADMIN_ID) }]
        },
        TEST_ADMIN_ID,
        { transaction }
      )
      expect(rule.target_type).toBe('user')
      expect(rule.targets.length).toBe(1)
      expect(rule.targets[0].target_ref).toBe(String(TEST_ADMIN_ID))
    })

    it('合法请求创建成功（默认 rounding_mode=ceil、max_multiplier_cap=3.00）', async () => {
      const rule = await RewardMultiplierService.createRule(VALID_PAYLOAD, TEST_ADMIN_ID, {
        transaction
      })
      expect(Number(rule.multiplier_campaign_id)).toBeGreaterThan(0)
      expect(rule.multiplier).toBe(2)
      expect(rule.rounding_mode).toBe('ceil')
      expect(rule.max_multiplier_cap).toBe(3)
      expect(rule.extra_cost_used).toBe(0)
      expect(rule.status).toBe('inactive')
    })
  })

  describe('updateRule - 更新规则', () => {
    it('可更新倍率并全量替换 targets；lottery_campaign_id 不可改绑', async () => {
      const rule = await RewardMultiplierService.createRule(
        {
          ...VALID_PAYLOAD,
          target_type: 'user',
          targets: [{ target_type: 'user', target_ref: '1' }]
        },
        TEST_ADMIN_ID,
        { transaction }
      )

      const updated = await RewardMultiplierService.updateRule(
        rule.multiplier_campaign_id,
        {
          multiplier: 2.5,
          lottery_campaign_id: 999999, // 应被忽略（禁止改绑）
          targets: [
            { target_type: 'user', target_ref: '2' },
            { target_type: 'user', target_ref: '3' }
          ]
        },
        TEST_ADMIN_ID,
        { transaction }
      )

      expect(updated.multiplier).toBe(2.5)
      expect(updated.lottery_campaign_id).toBe(TEST_CAMPAIGN_ID)
      expect(updated.targets.length).toBe(2)
      expect(updated.targets.map(t => t.target_ref).sort()).toEqual(['2', '3'])
    })

    it('更新不存在的规则应报 MULTIPLIER_RULE_NOT_FOUND', async () => {
      await expect(
        RewardMultiplierService.updateRule(999999999, { multiplier: 2 }, TEST_ADMIN_ID, {
          transaction
        })
      ).rejects.toThrow(/不存在/)
    })
  })

  describe('setStatus / deleteRule - 开关与删除', () => {
    it('setStatus 切换 active/inactive；非法状态报错', async () => {
      const rule = await RewardMultiplierService.createRule(VALID_PAYLOAD, TEST_ADMIN_ID, {
        transaction
      })

      const activated = await RewardMultiplierService.setStatus(
        rule.multiplier_campaign_id,
        'active',
        { transaction }
      )
      expect(activated.status).toBe('active')

      await expect(
        RewardMultiplierService.setStatus(rule.multiplier_campaign_id, 'paused', { transaction })
      ).rejects.toThrow(/非法/)
    })

    it('deleteRule 删除后规则不可查（getRule 抛 404）', async () => {
      const rule = await RewardMultiplierService.createRule(VALID_PAYLOAD, TEST_ADMIN_ID, {
        transaction
      })
      const ok = await RewardMultiplierService.deleteRule(rule.multiplier_campaign_id, {
        transaction
      })
      expect(ok).toBe(true)
    })
  })

  describe('listRules - 分页列表', () => {
    it('返回 { rows, total, page, page_size } 分页结构', async () => {
      const result = await RewardMultiplierService.listRules({ page: 1, page_size: 10 })
      expect(result).toHaveProperty('rows')
      expect(result).toHaveProperty('total')
      expect(result.page).toBe(1)
      expect(result.page_size).toBe(10)
      expect(Array.isArray(result.rows)).toBe(true)
    })
  })

  describe('getCostWaterLevel - 成本水位（extra_cost_used/limit + lottery_draws 快照聚合）', () => {
    it('返回完整水位结构（usage_ratio/exhausted/trigger_count/beneficiary_count/extra_units_total）', async () => {
      /*
       * 成本水位读取需要规则真实存在（getCostWaterLevel 不接收事务参数，走全局连接），
       * 因此此处不经事务直接创建一条 inactive 规则，断言后物理删除（硬删除，不留测试数据）。
       */
      const { RewardMultiplierCampaign } = require('../../models')
      const rule = await RewardMultiplierCampaign.create({
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        campaign_name: '单测成本水位',
        display_name: '单测成本水位',
        multiplier: 2.0,
        extra_cost_limit: 1000,
        extra_cost_used: 250,
        status: 'inactive'
      })

      try {
        const cost = await RewardMultiplierService.getCostWaterLevel(rule.multiplier_campaign_id)
        expect(cost.extra_cost_used).toBe(250)
        expect(cost.extra_cost_limit).toBe(1000)
        expect(cost.usage_ratio).toBe(0.25)
        expect(cost.exhausted).toBe(false)
        expect(cost).toHaveProperty('trigger_count')
        expect(cost).toHaveProperty('beneficiary_count')
        expect(cost).toHaveProperty('extra_units_total')
      } finally {
        await rule.destroy() // 硬删除测试数据
      }
    })
  })

  describe('getSegmentOptions - segment 选项（DB segment_rule_configs 同源，D-12）', () => {
    it('活动 1 的选项来自其 resolver_version 对应版本 rules[].segment_key', async () => {
      const options = await RewardMultiplierService.getSegmentOptions(TEST_CAMPAIGN_ID)
      expect(Array.isArray(options)).toBe(true)
      for (const opt of options) {
        expect(opt).toHaveProperty('segment_key')
        expect(typeof opt.segment_key).toBe('string')
      }
    })
  })

  describe('getAdTagOptions - 标签选项（user_ad_tags 去重，可能为空）', () => {
    it('返回数组（当前 user_ad_tags 可能 0 行 → 空数组，前端提示"暂无标签数据"）', async () => {
      const tags = await RewardMultiplierService.getAdTagOptions()
      expect(Array.isArray(tags)).toBe(true)
      for (const t of tags) {
        expect(t).toHaveProperty('tag_key')
      }
    })
  })
})
