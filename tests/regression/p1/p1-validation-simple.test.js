/**
 * P1 修复简化验证测试
 *
 * 验证 P1 修复的核心逻辑（不依赖复杂的测试数据）
 *
 * V2.1 更新（2026-01-26）：
 * - P1-1 现已支持跨组转换 + 终点货币限制 + 全局套利检测
 *
 * P1-9 J2-RepoWide 改造：
 * - 通过 ServiceManager 统一获取服务
 * - 服务 key 使用 snake_case（E2-Strict）
 */

const { sequelize } = require('../../../models')

// 🔴 P1-9 J2-RepoWide：通过 global.getTestService 获取服务（snake_case key）

describe('P1 修复简化验证', () => {
  // 🔴 P1-9：ServiceManager 在 jest.setup.js 中已全局初始化

  describe('P1-1：材料转换风控校验（V2.1 全局套利检测 + 终点货币限制）', () => {
    test('MaterialConversionValidator 应该有 validate 方法', () => {
      const MaterialConversionValidator = require('../../../utils/materialConversionValidator')
      expect(MaterialConversionValidator).toBeDefined()
      expect(typeof MaterialConversionValidator.validate).toBe('function')
      console.log('✅ P1-1：MaterialConversionValidator.validate 方法存在')
    })

    test('AssetConversionRule 模型应该有 fromAssetType 和 toAssetType 关联', () => {
      const { AssetConversionRule } = require('../../../models')
      expect(AssetConversionRule.associations).toBeDefined()
      expect(AssetConversionRule.associations.fromAssetType).toBeDefined()
      expect(AssetConversionRule.associations.toAssetType).toBeDefined()
      console.log('✅ P1-1：AssetConversionRule 模型关联已定义')
    })
  })

  // 注：P1-2（交易下单幂等校验）已随 C2C TradeOrderService 下线移除（2026-06-05 阶段五）

  describe('P1-3：asset_transactions.user_id 字段已删除', () => {
    test('user_id 字段应该不存在（已迁移到 account_id）', async () => {
      const [columns] = await sequelize.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'asset_transactions'
          AND COLUMN_NAME = 'user_id'
      `)

      // 验证：user_id 字段已删除
      expect(columns).toHaveLength(0)

      console.log('✅ P1-3：asset_transactions.user_id 字段已删除，完全迁移到 account_id 体系')
    })
  })
})
