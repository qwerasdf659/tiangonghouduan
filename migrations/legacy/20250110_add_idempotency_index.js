/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构
 * 数据库迁移：添加积分交易幂等性唯一索引
 *
 * 目的：防止重复扣款/加款，实现幂等性控制
 */

'use strict'

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('🔍 检查现有索引...')

    // 1. 检查索引是否已存在
    const [existingIndexes] = await queryInterface.sequelize.query(`
      SELECT INDEX_NAME
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'points_transactions'
        AND INDEX_NAME = 'idx_business_idempotency'
    `)

    if (existingIndexes.length > 0) {
      console.log('✅ 幂等性索引已存在，跳过创建')
      return
    }

    console.log('🔧 创建幂等性唯一索引...')

    // 2. 创建唯一索引
    await queryInterface.addIndex('points_transactions', ['user_id', 'business_type', 'business_id'], {
      unique: true,
      name: 'idx_business_idempotency',
      comment: '幂等性控制唯一索引'
    })

    console.log('✅ 幂等性唯一索引创建成功')
  },

  down: async (queryInterface, _Sequelize) => {
    await queryInterface.removeIndex('points_transactions', 'idx_business_idempotency')
    console.log('✅ 幂等性索引已删除')
  }
}
