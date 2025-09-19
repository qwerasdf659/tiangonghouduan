'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * 状态枚举综合标准化
     * 整合原来的三个分散操作，统一业务语义：completed → distributed
     * 影响表：
     * - user_specific_prize_queues
     * - prize_distributions
     * - exchange_records
     */

    console.log('📊 开始状态枚举综合标准化...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 更新user_specific_prize_queues表
      console.log('🔄 更新user_specific_prize_queues状态枚举...')

      await queryInterface.changeColumn('user_specific_prize_queues', 'status', {
        type: Sequelize.ENUM('pending', 'distributed', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '队列状态：待发放/已分发/已过期/已取消'
      }, { transaction })

      await queryInterface.sequelize.query(
        `UPDATE user_specific_prize_queues 
         SET status = 'distributed' 
         WHERE status = 'completed'`,
        { transaction }
      )

      // 2. 更新prize_distributions表
      console.log('🔄 更新prize_distributions状态枚举...')

      await queryInterface.changeColumn('prize_distributions', 'distribution_status', {
        type: Sequelize.ENUM('pending', 'processing', 'distributed', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '分发状态：pending-待分发，processing-分发中，distributed-已分发，failed-失败，cancelled-已取消'
      }, { transaction })

      await queryInterface.sequelize.query(
        `UPDATE prize_distributions 
         SET distribution_status = 'distributed' 
         WHERE distribution_status = 'completed'`,
        { transaction }
      )

      // 3. 更新exchange_records表
      console.log('🔄 更新exchange_records状态枚举...')

      await queryInterface.changeColumn('exchange_records', 'status', {
        type: Sequelize.ENUM('pending', 'distributed', 'used', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'distributed',
        comment: '兑换状态：pending-待处理，distributed-已分发，used-已使用，expired-已过期，cancelled-已取消'
      }, { transaction })

      await queryInterface.sequelize.query(
        `UPDATE exchange_records 
         SET status = 'distributed' 
         WHERE status = 'completed'`,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 状态枚举综合标准化完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 状态枚举标准化失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, Sequelize) {
    /**
     * 回滚操作：恢复原来的completed状态
     */

    console.log('🔄 回滚状态枚举标准化...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚user_specific_prize_queues表
      await queryInterface.sequelize.query(
        `UPDATE user_specific_prize_queues 
         SET status = 'completed' 
         WHERE status = 'distributed'`,
        { transaction }
      )

      await queryInterface.changeColumn('user_specific_prize_queues', 'status', {
        type: Sequelize.ENUM('pending', 'completed', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '队列状态：待发放/已发放/已过期/已取消'
      }, { transaction })

      // 回滚prize_distributions表
      await queryInterface.sequelize.query(
        `UPDATE prize_distributions 
         SET distribution_status = 'completed' 
         WHERE distribution_status = 'distributed'`,
        { transaction }
      )

      await queryInterface.changeColumn('prize_distributions', 'distribution_status', {
        type: Sequelize.ENUM('pending', 'processing', 'completed', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '分发状态：pending-待分发，processing-分发中，completed-已完成，failed-失败，cancelled-已取消'
      }, { transaction })

      // 回滚exchange_records表
      await queryInterface.sequelize.query(
        `UPDATE exchange_records 
         SET status = 'completed' 
         WHERE status = 'distributed'`,
        { transaction }
      )

      await queryInterface.changeColumn('exchange_records', 'status', {
        type: Sequelize.ENUM('pending', 'completed', 'used', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'completed',
        comment: '兑换状态：pending-待处理，completed-已完成，used-已使用，expired-已过期，cancelled-已取消'
      }, { transaction })

      await transaction.commit()
      console.log('✅ 状态枚举标准化回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
