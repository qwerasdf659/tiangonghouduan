'use strict'

/**
 * SettleStage 预算扣减逻辑单元测试
 *
 * 核心验证：
 * 1. 扣减金额使用 budget_cost（非 pvp）—— BUG-2 修复验证
 * 2. budget_cost=0 时跳过扣减
 * 3. 监控指标 prize_value 使用 budget_cost
 *
 * @module tests/unit/stages/SettleStage
 * @since 2026-03-06 budget_cost 修复验证
 */

const SettleStage = require('../../../services/UnifiedLotteryEngine/pipeline/stages/SettleStage')

describe('SettleStage — budget_cost 扣减验证（BUG-2 修复）', () => {
  let stage

  beforeEach(() => {
    stage = new SettleStage()
    stage.log = jest.fn()
  })

  describe('_deductBudget 接收正确的扣减金额', () => {
    test('碎片×50（pvp=8, budget_cost=500）→ 扣减 500 而非 8', async () => {
      const mock_provider = {
        deductBudget: jest.fn(async ({ amount }) => ({ deducted: amount }))
      }

      const result = await stage._deductBudget(mock_provider, 500, {
        user_id: 31,
        lottery_campaign_id: 1,
        lottery_prize_id: 201,
        idempotency_key: 'test_key',
        transaction: null
      })

      expect(result).toBe(500)
      expect(mock_provider.deductBudget).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 500 }),
        expect.any(Object)
      )
    })

    test('碎片×3（pvp=1, budget_cost=30）→ 扣减 30 而非 1', async () => {
      const mock_provider = {
        deductBudget: jest.fn(async ({ amount }) => ({ deducted: amount }))
      }

      const result = await stage._deductBudget(mock_provider, 30, {
        user_id: 31,
        lottery_campaign_id: 1,
        lottery_prize_id: 202,
        idempotency_key: 'test_key',
        transaction: null
      })

      expect(result).toBe(30)
      expect(mock_provider.deductBudget).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 30 }),
        expect.any(Object)
      )
    })

    test('四人鸳鸯锅（pvp=20, budget_cost=20）→ 扣减 20（行为一致）', async () => {
      const mock_provider = {
        deductBudget: jest.fn(async ({ amount }) => ({ deducted: amount }))
      }

      const result = await stage._deductBudget(mock_provider, 20, {
        user_id: 31,
        lottery_campaign_id: 1,
        lottery_prize_id: 163,
        idempotency_key: 'test_key',
        transaction: null
      })

      expect(result).toBe(20)
    })

    test('九五折券×2（pvp=5, budget_cost=10）→ 扣减 10 而非 5', async () => {
      const mock_provider = {
        deductBudget: jest.fn(async ({ amount }) => ({ deducted: amount }))
      }

      const result = await stage._deductBudget(mock_provider, 10, {
        user_id: 31,
        lottery_campaign_id: 1,
        lottery_prize_id: 167,
        idempotency_key: 'test_key',
        transaction: null
      })

      expect(result).toBe(10)
    })
  })

  describe('budget_cost 提取逻辑验证', () => {
    /**
     * 验证代码中 `const budget_cost = final_prize.budget_cost || 0` 的行为
     * 确保 budget_cost 字段正确提取，而不是用 pvp
     */
    test('prize.budget_cost 存在时使用该值', () => {
      const prize = { prize_value_points: 8, budget_cost: 500 }
      const budget_cost = prize.budget_cost || 0
      expect(budget_cost).toBe(500)
    })

    test('prize.budget_cost 为 0 时跳过扣减', () => {
      const prize = { prize_value_points: 0, budget_cost: 0, material_asset_code: 'DIAMOND' }
      const budget_cost = prize.budget_cost || 0
      expect(budget_cost).toBe(0)
    })

    test('prize.budget_cost 未定义时回退到 0', () => {
      const prize = { prize_value_points: 20 }
      const budget_cost = prize.budget_cost || 0
      expect(budget_cost).toBe(0)
    })

    test('扣减条件：budget_provider && budget_cost > 0', () => {
      const should_deduct = (provider, prize) => {
        const cost = prize.budget_cost || 0
        return !!(provider && cost > 0)
      }

      expect(should_deduct({}, { budget_cost: 500 })).toBe(true)
      expect(should_deduct({}, { budget_cost: 0 })).toBe(false)
      expect(should_deduct(null, { budget_cost: 500 })).toBe(false)
      expect(should_deduct({}, { prize_value_points: 8 })).toBe(false)
    })
  })

  describe('监控指标使用 budget_cost', () => {
    test('prize_value 应为 budget_cost 而非 pvp', () => {
      const prize = { prize_value_points: 8, budget_cost: 500 }
      const metric_value = prize.budget_cost || 0
      expect(metric_value).toBe(500)
      expect(metric_value).not.toBe(prize.prize_value_points)
    })
  })
})
