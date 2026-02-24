/**
 * 交易市场资产黑名单测试
 *
 * 文件路径：tests/core/market_asset_blacklist.test.js
 *
 * **业务场景**：验证 P0-4 交易市场积分类白名单强约束功能
 * **技术规范**：
 *   - POINTS 和 BUDGET_POINTS 永久禁止在交易市场交易
 *   - 黑名单检查优先于数据库 is_tradable 字段
 *   - 提供清晰的错误信息
 *
 * 创建时间：2026-01-09
 * 更新时间：2026-02-24（统一术语：C2C → 交易市场）
 * 版本：V4.0.0
 */

'use strict'

const {
  MARKET_BLACKLISTED_ASSET_CODES,
  isBlacklistedForMarket,
  getBlacklistReason,
  validateMarketTradability,
  createMarketBlacklistError,
  TradableAssetTypes
} = require('../../constants')

describe('交易市场资产黑名单功能 (P0-4)', () => {
  describe('MARKET_BLACKLISTED_ASSET_CODES - 黑名单常量', () => {
    test('POINTS 应该在黑名单中', () => {
      expect(MARKET_BLACKLISTED_ASSET_CODES).toContain('POINTS')
    })

    test('BUDGET_POINTS 应该在黑名单中', () => {
      expect(MARKET_BLACKLISTED_ASSET_CODES).toContain('BUDGET_POINTS')
    })

    test('黑名单应该是不可变的（Object.freeze）', () => {
      expect(() => {
        MARKET_BLACKLISTED_ASSET_CODES.push('NEW_ASSET')
      }).toThrow()
    })

    test('黑名单至少包含2个资产类型', () => {
      expect(MARKET_BLACKLISTED_ASSET_CODES.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('isBlacklistedForMarket - 黑名单检查函数', () => {
    test('POINTS 应该被识别为禁止交易', () => {
      expect(isBlacklistedForMarket('POINTS')).toBe(true)
    })

    test('BUDGET_POINTS 应该被识别为禁止交易', () => {
      expect(isBlacklistedForMarket('BUDGET_POINTS')).toBe(true)
    })

    test('非黑名单资产应该返回 false', () => {
      expect(isBlacklistedForMarket('GOLD_COIN')).toBe(false)
      expect(isBlacklistedForMarket('MATERIAL_A')).toBe(false)
      expect(isBlacklistedForMarket('UNKNOWN_ASSET')).toBe(false)
    })

    test('应该区分大小写', () => {
      expect(isBlacklistedForMarket('points')).toBe(false)
      expect(isBlacklistedForMarket('Points')).toBe(false)
      expect(isBlacklistedForMarket('POINTS')).toBe(true)
    })

    test('空字符串应该返回 false', () => {
      expect(isBlacklistedForMarket('')).toBe(false)
    })

    test('null/undefined 应该返回 false（不崩溃）', () => {
      expect(isBlacklistedForMarket(null)).toBe(false)
      expect(isBlacklistedForMarket(undefined)).toBe(false)
    })
  })

  describe('getBlacklistReason - 获取禁止原因', () => {
    test('POINTS 应该返回系统积分禁止交易原因', () => {
      const reason = getBlacklistReason('POINTS')
      expect(reason).not.toBeNull()
      expect(reason).toContain('系统积分')
      expect(reason).toContain('禁止')
    })

    test('BUDGET_POINTS 应该返回预算积分禁止交易原因', () => {
      const reason = getBlacklistReason('BUDGET_POINTS')
      expect(reason).not.toBeNull()
      expect(reason).toContain('预算积分')
      expect(reason).toContain('禁止')
    })

    test('非黑名单资产应该返回 null', () => {
      expect(getBlacklistReason('GOLD_COIN')).toBeNull()
      expect(getBlacklistReason('MATERIAL_A')).toBeNull()
    })
  })

  describe('validateMarketTradability - 综合验证函数', () => {
    test('POINTS 验证应该返回不允许交易', () => {
      const result = validateMarketTradability('POINTS')

      expect(result.allowed).toBe(false)
      expect(result.reason).not.toBeNull()
      expect(result.source).toBe('HARDCODED_BLACKLIST')
    })

    test('BUDGET_POINTS 验证应该返回不允许交易', () => {
      const result = validateMarketTradability('BUDGET_POINTS')

      expect(result.allowed).toBe(false)
      expect(result.reason).not.toBeNull()
      expect(result.source).toBe('HARDCODED_BLACKLIST')
    })

    test('非黑名单资产验证应该返回允许（需继续检查数据库）', () => {
      const result = validateMarketTradability('GOLD_COIN')

      expect(result.allowed).toBe(true)
      expect(result.reason).toBeNull()
      expect(result.source).toBeNull()
    })
  })

  describe('createMarketBlacklistError - 创建错误对象', () => {
    test('应该创建带有正确错误码的错误对象', () => {
      const error = createMarketBlacklistError('POINTS', '系统积分')

      expect(error).toBeInstanceOf(Error)
      expect(error.code).toBe('ASSET_MARKET_BLACKLISTED')
      expect(error.statusCode).toBe(400)
    })

    test('错误对象应该包含详细信息', () => {
      const error = createMarketBlacklistError('POINTS', '系统积分')

      expect(error.details).toBeDefined()
      expect(error.details.asset_code).toBe('POINTS')
      expect(error.details.display_name).toBe('系统积分')
      expect(error.details.reason).toBeDefined()
      expect(error.details.blacklist_source).toBe('HARDCODED_PROTECTION')
      expect(error.details.suggestion).toBeDefined()
    })

    test('错误消息应该包含资产名称', () => {
      const error = createMarketBlacklistError('POINTS', '系统积分')

      expect(error.message).toContain('系统积分')
      expect(error.message).toContain('禁止')
      expect(error.message).toContain('交易市场')
    })
  })

  describe('命名空间导出验证', () => {
    test('TradableAssetTypes 应该包含所有必需的导出', () => {
      expect(TradableAssetTypes.MARKET_BLACKLISTED_ASSET_CODES).toBeDefined()
      expect(TradableAssetTypes.isBlacklistedForMarket).toBeInstanceOf(Function)
      expect(TradableAssetTypes.getBlacklistReason).toBeInstanceOf(Function)
      expect(TradableAssetTypes.validateMarketTradability).toBeInstanceOf(Function)
      expect(TradableAssetTypes.createMarketBlacklistError).toBeInstanceOf(Function)
    })
  })

  describe('P0-4业务场景验证', () => {
    test('场景1：用户尝试挂卖 POINTS（应被拒绝）', () => {
      const asset_code = 'POINTS'

      expect(isBlacklistedForMarket(asset_code)).toBe(true)

      const validation = validateMarketTradability(asset_code)
      expect(validation.allowed).toBe(false)
      expect(validation.source).toBe('HARDCODED_BLACKLIST')
    })

    test('场景2：用户尝试挂卖 BUDGET_POINTS（应被拒绝）', () => {
      const asset_code = 'BUDGET_POINTS'

      expect(isBlacklistedForMarket(asset_code)).toBe(true)

      const validation = validateMarketTradability(asset_code)
      expect(validation.allowed).toBe(false)
    })

    test('场景3：用户挂卖普通材料（允许，需继续数据库检查）', () => {
      const asset_code = 'MATERIAL_A'

      expect(isBlacklistedForMarket(asset_code)).toBe(false)

      const validation = validateMarketTradability(asset_code)
      expect(validation.allowed).toBe(true)
    })

    test('场景4：错误信息应该对用户友好', () => {
      const error = createMarketBlacklistError('POINTS', '系统积分')

      expect(error.message).toMatch(/[\u4e00-\u9fa5]/)
      expect(error.details.suggestion).toMatch(/[\u4e00-\u9fa5]/)
    })
  })
})
