/**
 * 负值余额守卫回归测试
 *
 * 验证 DB CHECK 约束和 BalanceService 前置断言
 * 确保 frozen_amount 和 available_amount 不会出现负值
 *
 * 对应文档决策：7.13 + 7.18（四管齐下：修复脚本 + 对账流水 + DB CHECK + 服务层断言）
 *
 * @module tests/regression/NegativeBalanceGuard.test
 */

'use strict'

const { getTestService, initializeTestServiceManager } = require('../helpers/UnifiedTestManager')

describe('负值余额守卫回归测试', () => {
  let BalanceService
  let sequelize

  beforeAll(async () => {
    await initializeTestServiceManager()
    BalanceService = getTestService('asset_balance')

    const models = require('../../models')
    sequelize = models.sequelize
  })

  afterAll(async () => {
    if (sequelize) {
      await sequelize.close()
    }
  })

  describe('DB CHECK 约束验证', () => {
    test('数据库中不存在 frozen_amount < 0 的记录', async () => {
      const [results] = await sequelize.query(
        'SELECT COUNT(*) as cnt FROM account_asset_balances WHERE frozen_amount < 0'
      )
      expect(Number(results[0].cnt)).toBe(0)
    })

    test('数据库中不存在 available_amount < 0 的记录', async () => {
      const [results] = await sequelize.query(
        'SELECT COUNT(*) as cnt FROM account_asset_balances WHERE available_amount < 0'
      )
      expect(Number(results[0].cnt)).toBe(0)
    })

    test('CHECK 约束 chk_frozen_non_negative 存在', async () => {
      const [constraints] = await sequelize.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'account_asset_balances'
         AND CONSTRAINT_TYPE = 'CHECK'`
      )
      const names = constraints.map(c => c.CONSTRAINT_NAME)
      expect(names).toContain('chk_frozen_amount_non_negative')
    })

    test('CHECK 约束 chk_available_non_negative 存在', async () => {
      const [constraints] = await sequelize.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'account_asset_balances'
         AND CONSTRAINT_TYPE = 'CHECK'`
      )
      const names = constraints.map(c => c.CONSTRAINT_NAME)
      expect(names).toContain('chk_available_non_negative')
    })
  })

  describe('服务层前置断言', () => {
    test('冻结时可用余额不足应拒绝', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          BalanceService.freeze(
            {
              user_id: 31,
              system_code: 'POINTS',
              asset_code: 'star_stone',
              amount: 999999999,
              business_type: 'test_guard_freeze',
              idempotency_key: `test_guard_freeze_${Date.now()}`
            },
            { transaction }
          )
        ).rejects.toThrow()
      } finally {
        await transaction.rollback()
      }
    })

    test('解冻时冻结余额不足应拒绝', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          BalanceService.unfreeze(
            {
              user_id: 31,
              system_code: 'POINTS',
              asset_code: 'star_stone',
              amount: 999999999,
              business_type: 'test_guard_unfreeze',
              idempotency_key: `test_guard_unfreeze_${Date.now()}`
            },
            { transaction }
          )
        ).rejects.toThrow()
      } finally {
        await transaction.rollback()
      }
    })

    test('扣减时可用余额不足应拒绝', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          BalanceService.changeBalance(
            {
              user_id: 31,
              system_code: 'POINTS',
              asset_code: 'star_stone',
              amount: -999999999,
              business_type: 'test_guard_debit',
              idempotency_key: `test_guard_debit_${Date.now()}`
            },
            { transaction }
          )
        ).rejects.toThrow()
      } finally {
        await transaction.rollback()
      }
    })
  })
})
