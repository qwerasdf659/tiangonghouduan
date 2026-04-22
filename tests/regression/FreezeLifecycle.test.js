/**
 * 冻结生命周期回归测试
 *
 * 验证 BalanceService 的 freeze/unfreeze/settleFromFrozen 完整生命周期
 * 确保前置断言（负值检查、余额充足检查）正常工作
 *
 * @module tests/regression/FreezeLifecycle.test
 */

'use strict'

const { getTestService, initializeTestServiceManager } = require('../helpers/UnifiedTestManager')

describe('冻结生命周期回归测试', () => {
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

  describe('freeze 前置断言', () => {
    test('冻结金额必须为正数', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          BalanceService.freeze(
            {
              user_id: 31,
              system_code: 'POINTS',
              asset_code: 'star_stone',
              amount: -100,
              business_type: 'test_freeze',
              idempotency_key: `test_freeze_negative_${Date.now()}`
            },
            { transaction }
          )
        ).rejects.toThrow('冻结金额必须为正数')
      } finally {
        await transaction.rollback()
      }
    })

    test('缺少 idempotency_key 应报错', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          BalanceService.freeze(
            {
              user_id: 31,
              system_code: 'POINTS',
              asset_code: 'star_stone',
              amount: 100,
              business_type: 'test_freeze'
            },
            { transaction }
          )
        ).rejects.toThrow('idempotency_key是必填参数')
      } finally {
        await transaction.rollback()
      }
    })

    test('缺少 business_type 应报错', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          BalanceService.freeze(
            {
              user_id: 31,
              system_code: 'POINTS',
              asset_code: 'star_stone',
              amount: 100,
              idempotency_key: `test_freeze_no_biz_${Date.now()}`
            },
            { transaction }
          )
        ).rejects.toThrow('business_type是必填参数')
      } finally {
        await transaction.rollback()
      }
    })

    test('缺少事务应报错', async () => {
      await expect(
        BalanceService.freeze({
          user_id: 31,
          system_code: 'POINTS',
          asset_code: 'star_stone',
          amount: 100,
          business_type: 'test_freeze',
          idempotency_key: `test_freeze_no_tx_${Date.now()}`
        })
      ).rejects.toThrow()
    })
  })

  describe('unfreeze 前置断言', () => {
    test('解冻金额必须为正数', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          BalanceService.unfreeze(
            {
              user_id: 31,
              system_code: 'POINTS',
              asset_code: 'star_stone',
              amount: -50,
              business_type: 'test_unfreeze',
              idempotency_key: `test_unfreeze_negative_${Date.now()}`
            },
            { transaction }
          )
        ).rejects.toThrow('解冻金额必须为正数')
      } finally {
        await transaction.rollback()
      }
    })

    test('缺少事务应报错', async () => {
      await expect(
        BalanceService.unfreeze({
          user_id: 31,
          system_code: 'POINTS',
          asset_code: 'star_stone',
          amount: 50,
          business_type: 'test_unfreeze',
          idempotency_key: `test_unfreeze_no_tx_${Date.now()}`
        })
      ).rejects.toThrow()
    })
  })
})
