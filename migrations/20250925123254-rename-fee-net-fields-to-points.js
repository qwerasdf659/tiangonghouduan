'use strict'

/**
 * 餐厅积分抽奖系统 V4.0 - 字段重命名迁移
 * 将交易记录中的手续费和净金额字段改为积分相关命名
 *
 * 变更内容：
 * - fee_points → fee_points_amount (手续积分)
 * - net_amount → net_points_amount (净积分)
 *
 * @description 统一积分字段命名规范，使字段含义更清晰
 * @date 2025-09-25 12:32:54
 */

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('🔄 开始重命名交易记录字段...')

    // 使用事务确保操作的原子性
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 重命名 fee_points 为 fee_points_amount
      console.log('📝 重命名 fee_points → fee_points_amount')
      await queryInterface.renameColumn('trade_records', 'fee_points', 'fee_points_amount', {
        transaction
      })

      // 2. 重命名 net_amount 为 net_points_amount
      console.log('📝 重命名 net_amount → net_points_amount')
      await queryInterface.renameColumn('trade_records', 'net_amount', 'net_points_amount', {
        transaction
      })

      // 提交事务
      await transaction.commit()
      console.log('✅ 字段重命名完成')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 字段重命名失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 开始回滚字段重命名...')

    // 使用事务确保操作的原子性
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 回滚 fee_points_amount 为 fee_points
      console.log('📝 回滚 fee_points_amount → fee_points')
      await queryInterface.renameColumn('trade_records', 'fee_points_amount', 'fee_points', {
        transaction
      })

      // 2. 回滚 net_points_amount 为 net_amount
      console.log('📝 回滚 net_points_amount → net_amount')
      await queryInterface.renameColumn('trade_records', 'net_points_amount', 'net_amount', {
        transaction
      })

      // 提交事务
      await transaction.commit()
      console.log('✅ 字段回滚完成')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 字段回滚失败:', error.message)
      throw error
    }
  }
}
