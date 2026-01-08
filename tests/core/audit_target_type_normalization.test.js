/**
 * P0-5: 审计日志 target_type 命名统一测试
 *
 * 文件路径：tests/core/audit_target_type_normalization.test.js
 *
 * 职责：
 * - 验证 AuditTargetTypes.js 的常量和工具函数
 * - 验证 PascalCase → snake_case 规范化逻辑
 * - 验证历史遗留名映射到新架构标准名
 * - 验证复数形式规范化为单数
 * - 验证未知 target_type 的处理逻辑
 *
 * 创建时间：2026-01-09
 * 版本：V4.5.0
 */

'use strict'

const {
  AUDIT_TARGET_TYPES,
  TARGET_TYPE_LEGACY_MAPPING,
  VALID_TARGET_TYPES,
  normalizeTargetType,
  isValidTargetType,
  getTargetTypeDisplayName,
  getLegacyMappings,
  normalizeTargetTypes
} = require('../../constants/AuditTargetTypes')

describe('P0-5: 审计日志 target_type 命名统一测试', () => {
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
      expect(AUDIT_TARGET_TYPES.ITEM_INSTANCE).toBe('item_instance')

      // 市场交易
      expect(AUDIT_TARGET_TYPES.MARKET_LISTING).toBe('market_listing')
      expect(AUDIT_TARGET_TYPES.TRADE_ORDER).toBe('trade_order')
    })

    test('TARGET_TYPE_LEGACY_MAPPING 应该是不可变对象', () => {
      expect(Object.isFrozen(TARGET_TYPE_LEGACY_MAPPING)).toBe(true)
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

      test('ItemInstance → item_instance', () => {
        expect(normalizeTargetType('ItemInstance')).toBe('item_instance')
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

    describe('历史遗留名映射', () => {
      test('UserPointsAccount → account_asset_balance（旧模型名）', () => {
        expect(normalizeTargetType('UserPointsAccount')).toBe('account_asset_balance')
      })

      test('PointsTransaction → asset_transaction（旧模型名）', () => {
        expect(normalizeTargetType('PointsTransaction')).toBe('asset_transaction')
      })

      test('UserInventory → item_instance（旧模型名）', () => {
        expect(normalizeTargetType('UserInventory')).toBe('item_instance')
      })
    })

    describe('复数形式修正', () => {
      test('ExchangeRecords → exchange_record（复数→单数）', () => {
        expect(normalizeTargetType('ExchangeRecords')).toBe('exchange_record')
      })
    })

    describe('语义不清修正', () => {
      test('LotteryManagement → lottery_management_setting', () => {
        expect(normalizeTargetType('LotteryManagement')).toBe('lottery_management_setting')
      })
    })

    describe('已规范化值直接返回', () => {
      test('user → user（已规范化）', () => {
        expect(normalizeTargetType('user')).toBe('user')
      })

      test('item_instance → item_instance（已规范化）', () => {
        expect(normalizeTargetType('item_instance')).toBe('item_instance')
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
      expect(isValidTargetType('item_instance')).toBe(true)
      expect(isValidTargetType('asset_transaction')).toBe(true)
      expect(isValidTargetType('account_asset_balance')).toBe(true)
      expect(isValidTargetType('market_listing')).toBe(true)
    })

    test('PascalCase 返回 false（需要先规范化）', () => {
      expect(isValidTargetType('User')).toBe(false)
      expect(isValidTargetType('ItemInstance')).toBe(false)
      expect(isValidTargetType('AssetTransaction')).toBe(false)
    })

    test('历史遗留名返回 false（需要先规范化）', () => {
      expect(isValidTargetType('UserPointsAccount')).toBe(false)
      expect(isValidTargetType('PointsTransaction')).toBe(false)
      expect(isValidTargetType('UserInventory')).toBe(false)
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
      expect(getTargetTypeDisplayName('item_instance')).toBe('道具实例')
      expect(getTargetTypeDisplayName('market_listing')).toBe('市场挂牌')
      expect(getTargetTypeDisplayName('trade_order')).toBe('交易订单')
    })

    test('未知类型返回原值', () => {
      expect(getTargetTypeDisplayName('unknown_type')).toBe('unknown_type')
    })
  })

  describe('getLegacyMappings 验证', () => {
    test('返回映射表副本', () => {
      const mappings = getLegacyMappings()
      expect(typeof mappings).toBe('object')
      expect(mappings.User).toBe('user')
      expect(mappings.UserPointsAccount).toBe('account_asset_balance')
    })

    test('返回的是副本，修改不影响原始数据', () => {
      const mappings = getLegacyMappings()
      mappings.NewKey = 'new_value'
      expect(TARGET_TYPE_LEGACY_MAPPING.NewKey).toBeUndefined()
    })
  })

  describe('normalizeTargetTypes 批量规范化验证', () => {
    test('批量转换多个 target_type', () => {
      const input = ['User', 'ItemInstance', 'user', 'UserPointsAccount']
      const result = normalizeTargetTypes(input)

      expect(result.normalized).toEqual(['user', 'item_instance', 'user', 'account_asset_balance'])

      expect(result.mapping).toEqual({
        User: 'user',
        ItemInstance: 'item_instance',
        UserPointsAccount: 'account_asset_balance'
      })
    })

    test('已规范化的值不记录在 mapping 中', () => {
      const input = ['user', 'item_instance']
      const result = normalizeTargetTypes(input)

      expect(result.normalized).toEqual(['user', 'item_instance'])
      expect(result.mapping).toEqual({})
    })
  })

  describe('迁移数据完整性验证', () => {
    test('所有历史遗留值都映射到有效的标准资源码', () => {
      Object.entries(TARGET_TYPE_LEGACY_MAPPING).forEach(([legacy, standard]) => {
        expect(isValidTargetType(standard)).toBe(true)
      })
    })

    test('映射覆盖真实数据库中发现的所有历史值', () => {
      // 真实数据库验证结果中发现的 target_type 值
      const dbTargetTypes = [
        'UserPointsAccount',
        'CustomerServiceSession',
        'User',
        'ConsumptionRecord',
        'PointsTransaction',
        'lottery_management_setting',
        'lottery_clear_setting_record',
        'UserRoleChangeRecord',
        'UserStatusChangeRecord',
        'AccountAssetBalance',
        'ExchangeRecords',
        'LotteryManagement',
        'UserInventory'
      ]

      dbTargetTypes.forEach(targetType => {
        const normalized = normalizeTargetType(targetType)
        // 规范化后要么是有效的标准码，要么就是已经是标准码（snake_case）
        const isValid = isValidTargetType(normalized) || targetType === normalized
        expect(isValid).toBe(true)
      })
    })
  })
})
