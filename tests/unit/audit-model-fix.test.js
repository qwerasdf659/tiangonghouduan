/**
 * 审核管理核心修复验证（最简化版）
 *
 * 仅验证核心修复：
 * 1. approve/reject方法接受外部事务参数
 * 2. 不会创建嵌套事务
 *
 * 使用模型：Claude Sonnet 4.5
 * 创建时间：2025-11-08
 */

const models = require('../../models')

describe('审核方法外部事务支持（核心修复）', () => {
  jest.setTimeout(30000)

  test('approve方法应该接受外部事务参数', async () => {
    // 创建一个外部事务
    const transaction = await models.sequelize.transaction()

    try {
      // 创建测试数据
      const user = await models.User.findOne({ where: { mobile: '13612227930' } })
      const product = await models.Product.findOne({ limit: 1 })

      const exchangeRecord = await models.ExchangeRecords.create({
        user_id: user.user_id,
        product_id: product.product_id,
        product_snapshot: {
          name: product.name,
          category: product.category,
          exchange_points: product.exchange_points
        },
        quantity: 1,
        total_points: product.exchange_points,
        exchange_code: `TESTAPPROVE${Date.now()}`,
        status: 'pending',
        space: 'lucky',
        requires_audit: true,
        audit_status: 'pending',
        exchange_time: new Date()
      }, { transaction })

      // 🎯 核心测试：调用approve传入外部事务
      await exchangeRecord.approve(user.user_id, '测试外部事务', { transaction })

      // 验证状态已更新
      expect(exchangeRecord.audit_status).toBe('approved')
      expect(exchangeRecord.status).toBe('distributed')

      await transaction.commit()

      console.log('✅ approve方法正确接受外部事务参数')

      // 清理
      await models.ExchangeRecords.destroy({
        where: { exchange_id: exchangeRecord.exchange_id },
        force: true
      })
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  })

  test('reject方法应该接受外部事务参数', async () => {
    const transaction = await models.sequelize.transaction()

    try {
      const user = await models.User.findOne({ where: { mobile: '13612227930' } })
      const product = await models.Product.findOne({ limit: 1 })

      const exchangeRecord = await models.ExchangeRecords.create({
        user_id: user.user_id,
        product_id: product.product_id,
        product_snapshot: {
          name: product.name,
          category: product.category,
          exchange_points: product.exchange_points
        },
        quantity: 1,
        total_points: product.exchange_points,
        exchange_code: `TESTREJECT${Date.now()}`,
        status: 'pending',
        space: 'lucky',
        requires_audit: true,
        audit_status: 'pending',
        exchange_time: new Date()
      }, { transaction })

      // 🎯 核心测试：调用reject传入外部事务
      await exchangeRecord.reject(user.user_id, '测试外部事务拒绝', { transaction })

      // 验证状态已更新
      expect(exchangeRecord.audit_status).toBe('rejected')
      expect(exchangeRecord.status).toBe('cancelled')

      await transaction.commit()

      console.log('✅ reject方法正确接受外部事务参数')

      // 清理
      await models.ExchangeRecords.destroy({
        where: { exchange_id: exchangeRecord.exchange_id },
        force: true
      })
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  })

  test('approve方法应该能在没有外部事务时自行创建事务', async () => {
    const user = await models.User.findOne({ where: { mobile: '13612227930' } })
    const product = await models.Product.findOne({ limit: 1 })

    const exchangeRecord = await models.ExchangeRecords.create({
      user_id: user.user_id,
      product_id: product.product_id,
      product_snapshot: {
        name: product.name,
        category: product.category,
        exchange_points: product.exchange_points
      },
      quantity: 1,
      total_points: product.exchange_points,
      exchange_code: `TESTINTERNAL${Date.now()}`,
      status: 'pending',
      space: 'lucky',
      requires_audit: true,
      audit_status: 'pending',
      exchange_time: new Date()
    })

    try {
      // 🎯 核心测试：不传外部事务，方法应该自行创建
      await exchangeRecord.approve(user.user_id, '测试内部事务')

      // 验证状态已更新
      expect(exchangeRecord.audit_status).toBe('approved')
      expect(exchangeRecord.status).toBe('distributed')

      console.log('✅ approve方法能在没有外部事务时自行创建事务')
    } finally {
      // 清理
      await models.ExchangeRecords.destroy({
        where: { exchange_id: exchangeRecord.exchange_id },
        force: true
      })
    }
  })
})
