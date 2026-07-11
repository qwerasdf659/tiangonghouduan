/**
 * P1 修复验证测试
 *
 * 验证 P1 修复：
 * 1. P1-1：资产转换风控校验（AssetConversionRuleService._riskValidation：
 *    终点货币禁止流出 + 全局循环检测（DFS）+ 套利负环检测（Bellman-Ford））
 * 2. P1-3：asset_transactions.user_id 重复外键清理（已通过迁移验证）
 *
 * 2026-07-11 技术债务清理：
 * - utils/materialConversionValidator.js（从未被生产代码引用）已删除
 * - 本测试改为直接验证生产实际在用的 AssetConversionRuleService._riskValidation
 */

const AssetConversionRuleService = require('../../../services/AssetConversionRuleService')
const { sequelize } = require('../../../models')

describe('P1 修复验证测试', () => {
  let transaction

  beforeEach(async () => {
    transaction = await sequelize.transaction()
  })

  afterEach(async () => {
    if (transaction) {
      await transaction.rollback()
    }
  })

  describe('P1-1：资产转换风控校验（终点货币限制 + 全局循环/套利检测）', () => {
    test('应该允许普通跨组转换规则（无环、无套利、非终点货币）', async () => {
      /*
       * 使用不存在于现有规则图中的测试资产码，
       * 保证不会与真实规则形成环路或负环
       */
      const newRule = {
        from_asset_code: 'test_p1_red_shard',
        to_asset_code: 'test_p1_orange_shard',
        rate_numerator: 1,
        rate_denominator: 10
      }

      // 校验通过时无返回值、不抛错
      await expect(
        AssetConversionRuleService._riskValidation(newRule, null, transaction)
      ).resolves.toBeUndefined()
    })

    test('应该拒绝终点货币（star_stone）作为转换源', async () => {
      /*
       * 业务硬约束：星石是系统「终点货币」，只进不出，
       * 允许流出会打穿整个资产经济闭环
       */
      const newRule = {
        from_asset_code: 'star_stone',
        to_asset_code: 'test_p1_red_shard',
        rate_numerator: 1,
        rate_denominator: 20
      }

      await expect(
        AssetConversionRuleService._riskValidation(newRule, null, transaction)
      ).rejects.toMatchObject({
        code: 'TERMINAL_ASSET_OUTFLOW'
      })
    })

    test('应该拒绝终点货币（points）作为转换源', async () => {
      const newRule = {
        from_asset_code: 'points',
        to_asset_code: 'test_p1_red_shard',
        rate_numerator: 1,
        rate_denominator: 100
      }

      await expect(
        AssetConversionRuleService._riskValidation(newRule, null, transaction)
      ).rejects.toMatchObject({
        code: 'TERMINAL_ASSET_OUTFLOW'
      })
    })

    test('循环检测应该在全局范围进行（自环立即拦截）', async () => {
      /*
       * 自环是最小的循环转换路径（A → A），
       * 无论现有规则图如何都必须被 DFS 循环检测拦截
       */
      const selfLoopRule = {
        from_asset_code: 'test_p1_cycle_asset',
        to_asset_code: 'test_p1_cycle_asset',
        rate_numerator: 1,
        rate_denominator: 1
      }

      await expect(
        AssetConversionRuleService._riskValidation(selfLoopRule, null, transaction)
      ).rejects.toMatchObject({
        code: 'CYCLE_DETECTED'
      })
    })
  })

  // 注：P1-2（交易下单幂等校验）已随 C2C TradeOrderService 下线移除（2026-06-05 阶段五）

  describe('P1-3：asset_transactions.user_id 字段已删除（迁移到account_id）', () => {
    test('user_id 字段应该不存在', async () => {
      const [columns] = await sequelize.query(
        `
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'asset_transactions'
          AND COLUMN_NAME = 'user_id'
      `,
        { transaction }
      )

      // 验证：user_id 字段已删除
      expect(columns).toHaveLength(0)
      console.log('✅ P1-3：asset_transactions.user_id 字段已删除，完全迁移到 account_id 体系')
    })

    test('account_id 外键应该存在', async () => {
      const [fks] = await sequelize.query(
        `
        SELECT 
          CONSTRAINT_NAME,
          COLUMN_NAME,
          REFERENCED_TABLE_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'asset_transactions'
          AND COLUMN_NAME = 'account_id'
          AND REFERENCED_TABLE_NAME IS NOT NULL
      `,
        { transaction }
      )

      // 验证：account_id 外键存在
      expect(fks.length).toBeGreaterThanOrEqual(1)
      expect(fks[0].REFERENCED_TABLE_NAME).toBe('accounts')
      console.log('✅ P1-3：asset_transactions.account_id 外键约束存在')
    })
  })
})
