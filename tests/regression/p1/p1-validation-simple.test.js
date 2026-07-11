/**
 * P1 修复简化验证测试
 *
 * 验证 P1 修复的核心逻辑（不依赖复杂的测试数据）
 *
 * 2026-07-11 技术债务清理：
 * - P1-1 风控校验改为验证生产实际在用的 AssetConversionRuleService._riskValidation
 *   （utils/materialConversionValidator.js 从未被生产代码引用，已删除）
 *
 * P1-9 J2-RepoWide 改造：
 * - 通过 ServiceManager 统一获取服务
 * - 服务 key 使用 snake_case（E2-Strict）
 */

const { sequelize } = require('../../../models')

// 🔴 P1-9 J2-RepoWide：通过 global.getTestService 获取服务（snake_case key）

describe('P1 修复简化验证', () => {
  // 🔴 P1-9：ServiceManager 在 jest.setup.js 中已全局初始化

  describe('P1-1：资产转换风控校验（AssetConversionRuleService 内联图算法）', () => {
    test('AssetConversionRuleService 应该有 _riskValidation 方法', () => {
      const AssetConversionRuleService = require('../../../services/AssetConversionRuleService')
      expect(AssetConversionRuleService).toBeDefined()
      expect(typeof AssetConversionRuleService._riskValidation).toBe('function')
      console.log('✅ P1-1：AssetConversionRuleService._riskValidation 方法存在')
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
