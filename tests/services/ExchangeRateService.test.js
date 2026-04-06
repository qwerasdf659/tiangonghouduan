/**
 * ExchangeRateService 单元测试 — 已合并到 AssetConversionRuleService
 *
 * ⚠️ 2026-04-05：ExchangeRateService 已合并到 AssetConversionRuleService
 * 本测试文件保留但改为测试新服务的等价方法，确保向后兼容
 *
 * 原测试范围 → 新服务方法映射：
 * - getRate → getEffectiveRule
 * - getAllRates → getAvailableRules
 * - previewConvert → previewConvert
 * - adminListRates → adminListRules
 *
 * @date 2026-04-05 迁移到 AssetConversionRuleService
 */

'use strict'

let AssetConversionRuleService

jest.setTimeout(30000)

describe('ExchangeRateService → AssetConversionRuleService 兼容测试', () => {
  beforeAll(async () => {
    AssetConversionRuleService = global.getTestService
      ? global.getTestService('asset_conversion_rule')
      : require('../../services/AssetConversionRuleService')
  })

  describe('getEffectiveRule（原 getRate）', () => {
    it('应能获取 red_core_shard → star_stone 规则', async () => {
      const rule = await AssetConversionRuleService.getEffectiveRule('red_core_shard', 'star_stone')
      expect(rule).not.toBeNull()
      expect(rule.from_asset_code).toBe('red_core_shard')
      expect(rule.to_asset_code).toBe('star_stone')
    })

    it('不存在的币对应返回 null', async () => {
      const rule = await AssetConversionRuleService.getEffectiveRule('NONEXISTENT', 'star_stone')
      expect(rule).toBeNull()
    })
  })

  describe('getAvailableRules（原 getAllRates）', () => {
    it('应返回数组且包含活跃的转换规则', async () => {
      const rules = await AssetConversionRuleService.getAvailableRules()
      expect(Array.isArray(rules)).toBe(true)
      expect(rules.length).toBeGreaterThanOrEqual(5)

      const redShard = rules.find(r => r.from_asset_code === 'red_core_shard')
      expect(redShard).toBeDefined()
      expect(redShard.to_asset_code).toBe('star_stone')
    })
  })

  describe('previewConvert（原 previewConvert）', () => {
    it('应正确计算 100 red_core_shard → star_stone 预览', async () => {
      const preview = await AssetConversionRuleService.previewConvert(
        31,
        'red_core_shard',
        'star_stone',
        100
      )
      expect(preview.from_asset_code).toBe('red_core_shard')
      expect(preview.to_asset_code).toBe('star_stone')
      expect(preview.from_amount).toBe(100)
      expect(preview.net_amount).toBe(10)
    })
  })

  describe('adminListRules（原 adminListRates）', () => {
    it('应返回分页结果', async () => {
      const result = await AssetConversionRuleService.adminListRules({ page: 1, page_size: 20 })
      expect(result).toHaveProperty('rules')
      expect(result).toHaveProperty('total')
      expect(result).toHaveProperty('page')
      expect(result.total).toBeGreaterThanOrEqual(7)
    })

    it('应支持按状态筛选', async () => {
      const result = await AssetConversionRuleService.adminListRules({ status: 'active' })
      expect(result.rules.every(r => r.status === 'active')).toBe(true)
    })
  })
})
