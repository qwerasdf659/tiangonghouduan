/**
 * 审计日志 target_type 命名统一测试
 *
 * 文件路径：tests/core/audit_target_type_normalization.test.js
 *
 * 职责：
 * - 验证 AuditTargetTypes.js 的常量和工具函数
 * - 验证 PascalCase → snake_case 规范化逻辑
 * - 验证未知 target_type 的处理逻辑
 *
 * 重构记录：
 * - 2026-01-21: 移除 TARGET_TYPE_LEGACY_MAPPING 相关测试（数据库已100%标准化）
 *
 * 创建时间：2026-01-09
 * 版本：V4.6.0
 */

'use strict'

const {
  AUDIT_TARGET_TYPES,
  VALID_TARGET_TYPES,
  normalizeTargetType,
  isValidTargetType,
  getTargetTypeDisplayName,
  normalizeTargetTypes
} = require('../../constants/AuditTargetTypes')

describe('审计日志 target_type 命名统一测试', () => {
  describe('常量定义验证', () => {
    test('AUDIT_TARGET_TYPES 应该是不可变对象', () => {
      expect(Object.isFrozen(AUDIT_TARGET_TYPES)).toBe(true)
    })

    test('AUDIT_TARGET_TYPES 应该包含所有标准资源码', () => {
      // 用户与权限
      expect(AUDIT_TARGET_TYPES.USER).toBe('user')
      expect(AUDIT_TARGET_TYPES.USER_ROLE_CHANGE_RECORD).toBe('user_role_change_record')
      expect(AUDIT_TARGET_TYPES.USER_STATUS_CHANGE_RECORD).toBe('user_status_change_record')
      expect(AUDIT_TARGET_TYPES.CUSTOMER_SERVICE_SESSION).toBe('customer_service_session')

      // 资产与账本
      expect(AUDIT_TARGET_TYPES.ACCOUNT).toBe('account')
      expect(AUDIT_TARGET_TYPES.ACCOUNT_ASSET_BALANCE).toBe('account_asset_balance')
      expect(AUDIT_TARGET_TYPES.ASSET_TRANSACTION).toBe('asset_transaction')

      // 物品与库存
      expect(AUDIT_TARGET_TYPES.ITEM_INSTANCE).toBe('item')

      // 市场交易
      expect(AUDIT_TARGET_TYPES.MARKET_LISTING).toBe('market_listing')
      expect(AUDIT_TARGET_TYPES.TRADE_ORDER).toBe('trade_order')
    })

    test('VALID_TARGET_TYPES 应该是不可变数组', () => {
      expect(Object.isFrozen(VALID_TARGET_TYPES)).toBe(true)
      expect(Array.isArray(VALID_TARGET_TYPES)).toBe(true)
    })

    test('所有 AUDIT_TARGET_TYPES 值应该在 VALID_TARGET_TYPES 中', () => {
      Object.values(AUDIT_TARGET_TYPES).forEach(value => {
        expect(VALID_TARGET_TYPES).toContain(value)
      })
    })
  })

  describe('normalizeTargetType 规范化逻辑验证', () => {
    describe('PascalCase → snake_case 转换', () => {
      test('User → user', () => {
        expect(normalizeTargetType('User')).toBe('user')
      })

      test('Item → item_instance', () => {
        expect(normalizeTargetType('Item')).toBe('item')
      })

      test('AssetTransaction → asset_transaction', () => {
        expect(normalizeTargetType('AssetTransaction')).toBe('asset_transaction')
      })

      test('AccountAssetBalance → account_asset_balance', () => {
        expect(normalizeTargetType('AccountAssetBalance')).toBe('account_asset_balance')
      })

      test('ConsumptionRecord → consumption_record', () => {
        expect(normalizeTargetType('ConsumptionRecord')).toBe('consumption_record')
      })

      test('CustomerServiceSession → customer_service_session', () => {
        expect(normalizeTargetType('CustomerServiceSession')).toBe('customer_service_session')
      })
    })

    describe('已规范化值直接返回', () => {
      test('user → user（已规范化）', () => {
        expect(normalizeTargetType('user')).toBe('user')
      })

      test('item_instance → item_instance（已规范化）', () => {
        expect(normalizeTargetType('item')).toBe('item')
      })

      test('asset_transaction → asset_transaction（已规范化）', () => {
        expect(normalizeTargetType('asset_transaction')).toBe('asset_transaction')
      })
    })

    describe('边界情况处理', () => {
      test('null 输入返回 null', () => {
        expect(normalizeTargetType(null)).toBeNull()
      })

      test('undefined 输入返回 undefined', () => {
        expect(normalizeTargetType(undefined)).toBeUndefined()
      })

      test('空字符串返回空字符串', () => {
        expect(normalizeTargetType('')).toBe('')
      })

      test('未知值返回原值', () => {
        expect(normalizeTargetType('UnknownType')).toBe('UnknownType')
      })

      test('数字类型返回原值', () => {
        expect(normalizeTargetType(123)).toBe(123)
      })
    })
  })

  describe('isValidTargetType 校验逻辑验证', () => {
    test('标准资源码返回 true', () => {
      expect(isValidTargetType('user')).toBe(true)
      expect(isValidTargetType('item')).toBe(true)
      expect(isValidTargetType('asset_transaction')).toBe(true)
      expect(isValidTargetType('account_asset_balance')).toBe(true)
      expect(isValidTargetType('market_listing')).toBe(true)
    })

    test('PascalCase 返回 false（需要先规范化）', () => {
      expect(isValidTargetType('User')).toBe(false)
      expect(isValidTargetType('Item')).toBe(false)
      expect(isValidTargetType('AssetTransaction')).toBe(false)
    })

    test('未知类型返回 false', () => {
      expect(isValidTargetType('UnknownType')).toBe(false)
      expect(isValidTargetType('random_string')).toBe(false)
    })
  })

  describe('getTargetTypeDisplayName 显示名称验证', () => {
    test('返回正确的中文显示名称', () => {
      expect(getTargetTypeDisplayName('user')).toBe('用户')
      expect(getTargetTypeDisplayName('account_asset_balance')).toBe('资产余额')
      expect(getTargetTypeDisplayName('asset_transaction')).toBe('资产流水')
      expect(getTargetTypeDisplayName('item')).toBe('道具实例')
      expect(getTargetTypeDisplayName('market_listing')).toBe('市场挂牌')
      expect(getTargetTypeDisplayName('trade_order')).toBe('交易订单')
    })

    test('未知类型返回原值', () => {
      expect(getTargetTypeDisplayName('unknown_type')).toBe('unknown_type')
    })
  })

  describe('normalizeTargetTypes 批量规范化验证', () => {
    test('批量转换多个 target_type', () => {
      const input = ['User', 'Item', 'user']
      const result = normalizeTargetTypes(input)

      expect(result.normalized).toEqual(['user', 'item', 'user'])

      expect(result.mapping).toEqual({
        User: 'user',
        Item: 'item'
      })
    })

    test('已规范化的值不记录在 mapping 中', () => {
      const input = ['user', 'item']
      const result = normalizeTargetTypes(input)

      expect(result.normalized).toEqual(['user', 'item'])
      expect(result.mapping).toEqual({})
    })
  })

  describe('数据完整性验证', () => {
    test('数据库中实际使用的 target_type 值都是有效的标准码', () => {
      // 2026-01-21 数据库验证结果中的所有 target_type 值（已全部是 snake_case）
      const dbTargetTypes = [
        'lottery_management_setting',
        'user',
        'account_asset_balance',
        'lottery_clear_setting_record',
        'customer_service_session',
        'user_role_change_record',
        'user_status_change_record',
        'consumption_record',
        'asset_transaction',
        'feature_flag',
        'exchange_record',
        'item'
      ]

      dbTargetTypes.forEach(targetType => {
        expect(isValidTargetType(targetType)).toBe(true)
      })
    })
  })
})
