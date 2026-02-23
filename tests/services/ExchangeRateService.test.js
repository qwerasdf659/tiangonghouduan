/**
 * ExchangeRateService 单元测试 — 固定汇率兑换
 *
 * 测试范围：
 * - getRate: 获取特定币对的生效汇率
 * - getAllRates: 获取所有活跃汇率（含缓存）
 * - previewConvert: 兑换预览（计算+余额检查+限额检查）
 * - executeConvert: 执行兑换（三方记账+幂等+限额）
 * - adminListRates: 管理后台汇率列表
 *
 * 测试规范：
 * - 服务通过 global.getTestService('exchange_rate') 获取
 * - 使用 snake_case service key
 * - 所有写操作必须在事务内执行
 * - 测试数据通过 global.testData 动态获取
 *
 * @date 2026-02-23
 */

'use strict'

const TransactionManager = require('../../utils/TransactionManager')
const models = require('../../models')
const { sequelize } = models

let ExchangeRateService

jest.setTimeout(30000)

describe('ExchangeRateService - 固定汇率兑换服务测试', () => {
  const TEST_USER_ID = 31

  beforeAll(async () => {
    ExchangeRateService = global.getTestService
      ? global.getTestService('exchange_rate')
      : require('../../services/exchange/ExchangeRateService')
  })

  describe('getRate - 获取特定币对汇率', () => {
    it('应能获取 red_shard → DIAMOND 汇率', async () => {
      const rate = await ExchangeRateService.getRate('red_shard', 'DIAMOND')
      expect(rate).not.toBeNull()
      expect(rate.from_asset_code).toBe('red_shard')
      expect(rate.to_asset_code).toBe('DIAMOND')
      expect(rate.rate_numerator).toBe(1)
      expect(rate.rate_denominator).toBe(10)
      expect(rate.rate_display).toContain('red_shard')
      expect(rate.rate_display).toContain('DIAMOND')
    })

    it('不存在的币对应返回 null', async () => {
      const rate = await ExchangeRateService.getRate('NONEXISTENT', 'DIAMOND')
      expect(rate).toBeNull()
    })
  })

  describe('getAllRates - 获取所有活跃汇率', () => {
    it('应返回数组且包含初始的7条规则', async () => {
      const rates = await ExchangeRateService.getAllRates()
      expect(Array.isArray(rates)).toBe(true)
      expect(rates.length).toBeGreaterThanOrEqual(7)

      const redShard = rates.find(r => r.from_asset_code === 'red_shard')
      expect(redShard).toBeDefined()
      expect(redShard.to_asset_code).toBe('DIAMOND')
    })
  })

  describe('previewConvert - 兑换预览', () => {
    it('应正确计算 100 red_shard → 10 DIAMOND', async () => {
      const preview = await ExchangeRateService.previewConvert(
        TEST_USER_ID,
        'red_shard',
        'DIAMOND',
        100
      )

      expect(preview.from_asset_code).toBe('red_shard')
      expect(preview.to_asset_code).toBe('DIAMOND')
      expect(preview.from_amount).toBe(100)
      expect(preview.gross_to_amount).toBe(10)
      expect(preview.net_to_amount).toBe(10)
      expect(preview.fee_amount).toBe(0)
      expect(typeof preview.user_balance).toBe('number')
      expect(typeof preview.sufficient_balance).toBe('boolean')
    })

    it('不存在的币对应抛出 RATE_NOT_FOUND', async () => {
      await expect(
        ExchangeRateService.previewConvert(TEST_USER_ID, 'NONEXISTENT', 'DIAMOND', 100)
      ).rejects.toThrow('汇率规则不存在')
    })

    it('数量为0应抛出错误', async () => {
      await expect(
        ExchangeRateService.previewConvert(TEST_USER_ID, 'red_shard', 'DIAMOND', 0)
      ).rejects.toThrow('兑换数量必须大于0')
    })

    it('数量低于最小限制应抛出错误', async () => {
      await expect(
        ExchangeRateService.previewConvert(TEST_USER_ID, 'red_shard', 'DIAMOND', 1)
      ).rejects.toThrow('兑换数量低于最小限制')
    })
  })

  describe('executeConvert - 执行汇率兑换', () => {
    it('应成功执行 red_shard → DIAMOND 兑换并产生双录流水', async () => {
      const idempotencyKey = `test_rate_convert_${Date.now()}`

      const result = await TransactionManager.execute(async transaction => {
        return await ExchangeRateService.executeConvert(
          TEST_USER_ID,
          'red_shard',
          'DIAMOND',
          10,
          idempotencyKey,
          { transaction }
        )
      })

      expect(result.success).toBe(true)
      expect(result.from_asset_code).toBe('red_shard')
      expect(result.to_asset_code).toBe('DIAMOND')
      expect(result.from_amount).toBe(10)
      expect(result.net_to_amount).toBe(1)
      expect(result.is_duplicate).toBe(false)
      expect(result.from_tx_id).toBeDefined()
      expect(result.to_tx_id).toBeDefined()
      expect(result.from_balance).toBeDefined()
      expect(result.to_balance).toBeDefined()
    })

    it('重复幂等键（相同参数）应返回 is_duplicate=true', async () => {
      const idempotencyKey = `test_rate_idempotent_${Date.now()}`

      await TransactionManager.execute(async transaction => {
        return await ExchangeRateService.executeConvert(
          TEST_USER_ID,
          'red_shard',
          'DIAMOND',
          10,
          idempotencyKey,
          { transaction }
        )
      })

      const result2 = await TransactionManager.execute(async transaction => {
        return await ExchangeRateService.executeConvert(
          TEST_USER_ID,
          'red_shard',
          'DIAMOND',
          10,
          idempotencyKey,
          { transaction }
        )
      })

      expect(result2.success).toBe(true)
      expect(result2.is_duplicate).toBe(true)
    })

    it('缺少 idempotency_key 应抛出错误', async () => {
      await expect(
        TransactionManager.execute(async transaction => {
          return await ExchangeRateService.executeConvert(
            TEST_USER_ID,
            'red_shard',
            'DIAMOND',
            10,
            null,
            { transaction }
          )
        })
      ).rejects.toThrow('idempotency_key不能为空')
    })
  })

  describe('adminListRates - 管理后台汇率列表', () => {
    it('应返回分页结构', async () => {
      const result = await ExchangeRateService.adminListRates({ page: 1, page_size: 20 })
      expect(result).toHaveProperty('items')
      expect(result).toHaveProperty('total')
      expect(result).toHaveProperty('page')
      expect(result).toHaveProperty('page_size')
      expect(Array.isArray(result.items)).toBe(true)
      expect(result.total).toBeGreaterThanOrEqual(7)
    })

    it('应支持按状态筛选', async () => {
      const result = await ExchangeRateService.adminListRates({ status: 'active' })
      expect(result.items.every(r => r.status === 'active')).toBe(true)
    })
  })
})
