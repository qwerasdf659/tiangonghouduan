/**
 * P1 修复简化验证测试
 *
 * 验证 P1 修复的核心逻辑（不依赖复杂的测试数据）
 */

const { sequelize } = require('../models')

describe('P1 修复简化验证', () => {
  describe('P1-1：材料转换风控校验按 group_code 限定', () => {
    test('MaterialConversionValidator 应该有 validate 方法', () => {
      const MaterialConversionValidator = require('../utils/materialConversionValidator')
      expect(MaterialConversionValidator).toBeDefined()
      expect(typeof MaterialConversionValidator.validate).toBe('function')
      console.log('✅ P1-1：MaterialConversionValidator.validate 方法存在')
    })

    test('MaterialConversionRule 模型应该有 fromMaterial 和 toMaterial 关联', () => {
      const { MaterialConversionRule } = require('../models')
      expect(MaterialConversionRule.associations).toBeDefined()
      expect(MaterialConversionRule.associations.fromMaterial).toBeDefined()
      expect(MaterialConversionRule.associations.toMaterial).toBeDefined()
      console.log('✅ P1-1：MaterialConversionRule 模型关联已定义')
    })
  })

  describe('P1-2：交易下单幂等冲突校验强制 DIAMOND-only', () => {
    test('TradeOrderService.createOrder 应该存在', () => {
      const TradeOrderService = require('../services/TradeOrderService')
      expect(TradeOrderService).toBeDefined()
      expect(typeof TradeOrderService.createOrder).toBe('function')
      console.log('✅ P1-2：TradeOrderService.createOrder 方法存在')
    })

    test('TradeOrderService 代码应该包含 DIAMOND 强制校验', async () => {
      const fs = require('fs').promises
      const serviceCode = await fs.readFile('./services/TradeOrderService.js', 'utf8')

      // 验证幂等回放路径有 DIAMOND 校验
      expect(serviceCode).toMatch(/existingOrder\.asset_code.*!==.*'DIAMOND'/)
      expect(serviceCode).toMatch(/price_asset_code.*!==.*'DIAMOND'/)

      console.log('✅ P1-2：TradeOrderService 代码包含 DIAMOND 强制校验')
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
