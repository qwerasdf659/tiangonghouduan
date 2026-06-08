/**
 * @file 价值流向守卫 AssetProductGuard 单元测试（路线B 合规改造 模块A·竞价双层防护）
 * @description 验证竞价标的硬约束与计价侧红线的纯逻辑判定
 *
 * 覆盖范围：
 * - isValuable：以 item_type 枚举为准（product/voucher 恒 valuable），参考价兜底
 * - assertBiddableTarget：仅 prop 可竞价，实物/券/缺模板一律 BID_TARGET_FORBIDDEN
 * - assertPriceAssetAllowed：星石不可为有价值商品计价（STONE_BUY_VALUABLE_FORBIDDEN）；
 *   有价值商品仅限水晶系计价（VALUABLE_NEEDS_CRYSTAL）
 *
 * 测试策略：
 * - 纯静态方法逻辑测试，无数据库、无 mock
 * - 与实际业务代码 services/shared/AssetProductGuard.js 字段语义一致
 *
 * @version 1.0.0
 * @date 2026-06-08
 */

'use strict'

const AssetProductGuard = require('../../../services/shared/AssetProductGuard')
const { isValuable } = require('../../../services/shared/AssetProductGuard')

describe('AssetProductGuard 价值流向守卫（竞价双层防护）', () => {
  describe('isValuable：有价值商品判定（以 item_type 枚举为准）', () => {
    test('product 恒为有价值（即使参考价为 0）', () => {
      expect(isValuable({ item_type: 'product', reference_price_points: 0 })).toBe(true)
    })

    test('voucher 恒为有价值（即使参考价为 0）', () => {
      expect(isValuable({ item_type: 'voucher', reference_price_points: 0 })).toBe(true)
    })

    test('prop 零价值（参考价为 0）→ 非有价值', () => {
      expect(isValuable({ item_type: 'prop', reference_price_points: 0 })).toBe(false)
    })

    test('参考价>0 作为防御性兜底仍判为有价值', () => {
      expect(isValuable({ item_type: 'prop', reference_price_points: 100 })).toBe(true)
    })

    test('空模板视为非有价值', () => {
      expect(isValuable(null)).toBe(false)
    })
  })

  describe('assertBiddableTarget：仅纯虚拟道具可进入竞价', () => {
    test('prop 标的放行（无异常）', () => {
      expect(() => AssetProductGuard.assertBiddableTarget({ item_type: 'prop' })).not.toThrow()
    })

    test('product 标的禁止进竞价（BID_TARGET_FORBIDDEN）', () => {
      expect(() => AssetProductGuard.assertBiddableTarget({ item_type: 'product' })).toThrow(
        /竞价标的仅允许纯虚拟道具/
      )
    })

    test('voucher 标的禁止进竞价', () => {
      try {
        AssetProductGuard.assertBiddableTarget({ item_type: 'voucher' })
        throw new Error('未按预期抛出')
      } catch (e) {
        expect(e.code).toBe('BID_TARGET_FORBIDDEN')
      }
    })

    test('缺失模板（null）禁止进竞价', () => {
      expect(() => AssetProductGuard.assertBiddableTarget(null)).toThrow(/竞价标的/)
    })
  })

  describe('assertPriceAssetAllowed：计价侧红线', () => {
    test('红线①：星石给 product 计价被拒（STONE_BUY_VALUABLE_FORBIDDEN）', () => {
      try {
        AssetProductGuard.assertPriceAssetAllowed(
          { item_type: 'product', reference_price_points: 0 },
          'star_stone'
        )
        throw new Error('未按预期抛出')
      } catch (e) {
        expect(e.code).toBe('STONE_BUY_VALUABLE_FORBIDDEN')
      }
    })

    test('红线②：product 用非水晶系（如积分）计价被拒（VALUABLE_NEEDS_CRYSTAL）', () => {
      try {
        AssetProductGuard.assertPriceAssetAllowed({ item_type: 'product' }, 'points')
        throw new Error('未按预期抛出')
      } catch (e) {
        expect(e.code).toBe('VALUABLE_NEEDS_CRYSTAL')
      }
    })

    test('product 用水晶系（red_core_shard）计价放行', () => {
      expect(() =>
        AssetProductGuard.assertPriceAssetAllowed({ item_type: 'product' }, 'red_core_shard')
      ).not.toThrow()
    })

    test('prop 零价值道具用星石计价放行（向下销毁）', () => {
      expect(() =>
        AssetProductGuard.assertPriceAssetAllowed(
          { item_type: 'prop', reference_price_points: 0 },
          'star_stone'
        )
      ).not.toThrow()
    })
  })
})
