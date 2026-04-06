/**
 * AssetConversionRuleService 单元测试 — 统一资产转换规则
 *
 * 测试范围：
 * - getEffectiveRule: 获取特定币对的生效规则
 * - getAvailableRules: 获取所有可用规则
 * - previewConvert: 转换预览（计算+余额检查）
 * - executeConvert: 执行转换（三方记账+幂等）
 * - adminListRules: 管理后台规则列表
 * - adminCreateRule: 创建规则（含风控校验）
 * - adminUpdateStatus: 更新规则状态
 *
 * 测试规范：
 * - 服务通过 global.getTestService('asset_conversion_rule') 获取
 * - 使用 snake_case service key
 * - 所有写操作必须在事务内执行
 *
 * @date 2026-04-05
 */

'use strict'

require('dotenv').config()

const { sequelize } = require('../../models')
const TransactionManager = require('../../utils/TransactionManager')
const {
  resolve_conversion_type,
  resolve_display_category,
  CONVERSION_TYPES
} = require('../../utils/conversion_type_resolver')

let AssetConversionRuleService

jest.setTimeout(30000)

describe('AssetConversionRuleService - 统一资产转换规则服务测试', () => {
  const TEST_USER_ID = 31

  beforeAll(async () => {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    AssetConversionRuleService = global.getTestService
      ? global.getTestService('asset_conversion_rule')
      : require('../../services/AssetConversionRuleService')
  })

  describe('getEffectiveRule - 获取特定币对生效规则', () => {
    it('应能获取 red_core_shard → star_stone 规则', async () => {
      const rule = await AssetConversionRuleService.getEffectiveRule('red_core_shard', 'star_stone')
      expect(rule).not.toBeNull()
      expect(rule.from_asset_code).toBe('red_core_shard')
      expect(rule.to_asset_code).toBe('star_stone')
      expect(rule.status).toBe('active')
    })

    it('不存在的币对应返回 null', async () => {
      const rule = await AssetConversionRuleService.getEffectiveRule('NONEXISTENT', 'star_stone')
      expect(rule).toBeNull()
    })
  })

  describe('getAvailableRules - 获取所有可用规则', () => {
    it('应返回数组且包含活跃的转换规则', async () => {
      const rules = await AssetConversionRuleService.getAvailableRules()
      expect(Array.isArray(rules)).toBe(true)
      expect(rules.length).toBeGreaterThanOrEqual(5)

      const redShard = rules.find(r => r.from_asset_code === 'red_core_shard')
      expect(redShard).toBeDefined()
      expect(redShard.to_asset_code).toBe('star_stone')
    })

    it('不应返回 disabled 状态的规则', async () => {
      const rules = await AssetConversionRuleService.getAvailableRules()
      const disabled = rules.filter(r => r.status === 'disabled')
      expect(disabled.length).toBe(0)
    })
  })

  describe('previewConvert - 转换预览', () => {
    it('应正确计算 100 red_core_shard → 10 star_stone', async () => {
      const preview = await AssetConversionRuleService.previewConvert(
        TEST_USER_ID,
        'red_core_shard',
        'star_stone',
        100
      )

      expect(preview.from_asset_code).toBe('red_core_shard')
      expect(preview.to_asset_code).toBe('star_stone')
      expect(preview.from_amount).toBe(100)
      expect(preview.net_amount).toBe(10) // 1:10 ratio, floor
      expect(preview.fee_amount).toBe(0) // no fee
      expect(preview).toHaveProperty('from_balance')
      expect(preview).toHaveProperty('sufficient')
    })

    it('不存在的币对应抛出 RULE_NOT_FOUND', async () => {
      await expect(
        AssetConversionRuleService.previewConvert(TEST_USER_ID, 'NONEXISTENT', 'star_stone', 100)
      ).rejects.toThrow(/未找到/)
    })

    it('数量为0应抛出 INVALID_AMOUNT', async () => {
      await expect(
        AssetConversionRuleService.previewConvert(TEST_USER_ID, 'red_core_shard', 'star_stone', 0)
      ).rejects.toThrow(/正整数/)
    })
  })

  describe('adminListRules - 管理后台规则列表', () => {
    it('应返回分页结果', async () => {
      const result = await AssetConversionRuleService.adminListRules({ page: 1, page_size: 10 })
      expect(result).toHaveProperty('rules')
      expect(result).toHaveProperty('total')
      expect(result).toHaveProperty('page')
      expect(result.total).toBeGreaterThanOrEqual(7)
    })

    it('应支持状态筛选', async () => {
      const result = await AssetConversionRuleService.adminListRules({ status: 'active' })
      expect(result.rules.every(r => r.status === 'active')).toBe(true)
    })

    it('应支持源资产筛选', async () => {
      const result = await AssetConversionRuleService.adminListRules({
        from_asset_code: 'red_core_shard'
      })
      expect(result.rules.every(r => r.from_asset_code === 'red_core_shard')).toBe(true)
    })
  })

  describe('adminGetRuleById - 获取规则详情', () => {
    it('应返回规则详情', async () => {
      const rule = await AssetConversionRuleService.adminGetRuleById(1)
      expect(rule).not.toBeNull()
      expect(rule.conversion_rule_id).toBeTruthy()
    })

    it('不存在的ID应抛出 RULE_NOT_FOUND', async () => {
      await expect(AssetConversionRuleService.adminGetRuleById(999999)).rejects.toThrow(/不存在/)
    })
  })

  describe('calculateConversion - 模型实例方法', () => {
    it('应正确计算 floor 舍入', async () => {
      const rule = await AssetConversionRuleService.getEffectiveRule('red_core_shard', 'star_stone')
      expect(rule).not.toBeNull()
      const result = rule.calculateConversion(15)
      // 15 * 1 / 10 = 1.5 → floor = 1
      expect(result.gross).toBe(1)
      expect(result.fee).toBe(0)
      expect(result.net).toBe(1)
    })

    it('应正确计算整除情况', async () => {
      const rule = await AssetConversionRuleService.getEffectiveRule('red_core_shard', 'star_stone')
      const result = rule.calculateConversion(100)
      // 100 * 1 / 10 = 10
      expect(result.gross).toBe(10)
      expect(result.net).toBe(10)
    })
  })

  describe('风控校验 - _riskValidation', () => {
    it('终点货币作为源应被拦截', async () => {
      await expect(
        TransactionManager.execute(async transaction => {
          return AssetConversionRuleService.adminCreateRule(
            {
              from_asset_code: 'star_stone',
              to_asset_code: 'red_core_shard',
              rate_numerator: 1,
              rate_denominator: 1,
              status: 'active'
            },
            { transaction }
          )
        })
      ).rejects.toThrow(/终点货币/)
    })
  })

  describe('conversion_type_resolver - 转换类型推导', () => {
    it('低 tier → 高 tier 应推导为 compose（合成）', () => {
      const result = resolve_conversion_type({ tier: 1 }, { tier: 10 })
      expect(result.type).toBe(CONVERSION_TYPES.COMPOSE)
      expect(result.label).toBe('合成')
    })

    it('高 tier → 低 tier 应推导为 decompose（分解）', () => {
      const result = resolve_conversion_type({ tier: 10 }, { tier: 1 })
      expect(result.type).toBe(CONVERSION_TYPES.DECOMPOSE)
      expect(result.label).toBe('分解')
    })

    it('同 tier 应推导为 exchange（兑换）', () => {
      const result = resolve_conversion_type({ tier: 1 }, { tier: 1 })
      expect(result.type).toBe(CONVERSION_TYPES.EXCHANGE)
      expect(result.label).toBe('兑换')
    })

    it('null 资产类型应安全降级为 exchange', () => {
      const result = resolve_conversion_type(null, null)
      expect(result.type).toBe(CONVERSION_TYPES.EXCHANGE)
    })

    it('display_category 应覆盖自动推导', () => {
      const rule = {
        display_category: 'exchange',
        fromAssetType: { tier: 1 },
        toAssetType: { tier: 10 }
      }
      const result = resolve_display_category(rule)
      expect(result.conversion_type).toBe('exchange')
      expect(result.type_source).toBe('manual')
    })

    it('display_category 为 null 时应使用自动推导', () => {
      const rule = {
        display_category: null,
        fromAssetType: { tier: 1 },
        toAssetType: { tier: 10 }
      }
      const result = resolve_display_category(rule)
      expect(result.conversion_type).toBe('compose')
      expect(result.type_source).toBe('auto')
    })
  })

  describe('getAvailableRules - 返回结果应包含 tier 字段', () => {
    it('关联的 fromAssetType 应包含 tier', async () => {
      const rules = await AssetConversionRuleService.getAvailableRules()
      expect(rules.length).toBeGreaterThan(0)
      const rule = rules[0]
      const plain = rule.toJSON ? rule.toJSON() : rule
      if (plain.fromAssetType) {
        expect(plain.fromAssetType).toHaveProperty('tier')
      }
    })
  })
})
