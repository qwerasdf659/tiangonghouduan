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

    test('MaterialConversionRule 模型应该有 fromMaterial 和 toMaterial 关联', () => {
      const { MaterialConversionRule } = require('../../../models')
      expect(MaterialConversionRule.associations).toBeDefined()
      expect(MaterialConversionRule.associations.fromMaterial).toBeDefined()
      expect(MaterialConversionRule.associations.toMaterial).toBeDefined()
      console.log('✅ P1-1：MaterialConversionRule 模型关联已定义')
    })
  })

  describe('P1-2：交易下单幂等冲突校验（多币种白名单模式）', () => {
    test('TradeOrderService.createOrder 应该存在', () => {
      // 🔴 P1-9 J2-RepoWide：通过 global.getTestService 获取服务
      const TradeOrderService = global.getTestService('trade_order')
      expect(TradeOrderService).toBeDefined()
      expect(typeof TradeOrderService.createOrder).toBe('function')
      console.log('✅ P1-2：TradeOrderService.createOrder 方法存在')
    })

    test('TradeOrderService 代码应该包含多币种白名单校验（2026-01-14升级）', async () => {
      const fs = require('fs').promises
      const serviceCode = await fs.readFile('./services/TradeOrderService.js', 'utf8')

      // 验证白名单函数存在
      expect(serviceCode).toMatch(/isAssetCodeAllowed/)
      expect(serviceCode).toMatch(/getAllowedSettlementAssets/)

      // 验证幂等回放路径有资产白名单校验
      expect(serviceCode).toMatch(/existingAssetAllowed.*=.*await isAssetCodeAllowed/)
      // 验证参数一致性校验包含 asset_code
      expect(serviceCode).toMatch(/existingOrder\.asset_code.*!==.*currentAssetCode/)

      console.log(
        '✅ P1-2：TradeOrderService 代码包含多币种白名单校验（支持 star_stone + red_core_shard 等）'
      )
    })
  })

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
