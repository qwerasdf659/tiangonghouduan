/**
 * 🔥 修复字段不一致问题的数据库迁移
 * 修复 business_events.event_status 和 points_transactions.source_type 字段问题
 */

'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始修复数据库字段不一致问题...')

      // 1. 修复 business_events 表：将 status 字段重命名为 event_status
      try {
        // 检查字段是否存在
        const businessEventsDesc = await queryInterface.describeTable('business_events')

        if (businessEventsDesc.status && !businessEventsDesc.event_status) {
          // 重命名字段
          await queryInterface.renameColumn('business_events', 'status', 'event_status', {
            transaction
          })
          console.log('✅ business_events.status 已重命名为 event_status')
        } else if (businessEventsDesc.event_status) {
          console.log('✅ business_events.event_status 字段已存在，跳过')
        }
      } catch (error) {
        console.error('❌ 修复 business_events 表失败:', error.message)
      }

      // 2. 为 points_transactions 表添加 source_type 字段
      try {
        const pointsTransactionsDesc = await queryInterface.describeTable('points_transactions')

        if (!pointsTransactionsDesc.source_type) {
          await queryInterface.addColumn(
            'points_transactions',
            'source_type',
            {
              type: Sequelize.ENUM('system', 'user', 'admin', 'api', 'batch'),
              allowNull: true,
              defaultValue: 'system',
              comment: '积分来源类型',
              after: 'business_type'
            },
            { transaction }
          )
          console.log('✅ points_transactions.source_type 字段已添加')
        } else {
          console.log('✅ points_transactions.source_type 字段已存在，跳过')
        }
      } catch (error) {
        console.error('❌ 添加 source_type 字段失败:', error.message)
      }

      // 3. 添加必要的索引
      try {
        await queryInterface.addIndex('business_events', ['event_status'], {
          name: 'idx_business_events_event_status',
          transaction
        })
        console.log('✅ business_events.event_status 索引已添加')
      } catch (error) {
        if (error.original && error.original.code === 'ER_DUP_KEYNAME') {
          console.log('⚠️ business_events.event_status 索引已存在，跳过')
        } else {
          console.error('❌ 添加索引失败:', error.message)
        }
      }

      try {
        await queryInterface.addIndex('points_transactions', ['source_type'], {
          name: 'idx_points_transactions_source_type',
          transaction
        })
        console.log('✅ points_transactions.source_type 索引已添加')
      } catch (error) {
        if (error.original && error.original.code === 'ER_DUP_KEYNAME') {
          console.log('⚠️ points_transactions.source_type 索引已存在，跳过')
        } else {
          console.error('❌ 添加索引失败:', error.message)
        }
      }

      await transaction.commit()
      console.log('✅ 字段不一致问题修复完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error)
      throw error
    }
  },

  async down (queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚字段修复...')

      // 回滚 business_events 表
      try {
        await queryInterface.renameColumn('business_events', 'event_status', 'status', {
          transaction
        })
        console.log('✅ business_events.event_status 已回滚为 status')
      } catch (error) {
        console.error('❌ 回滚 business_events 表失败:', error.message)
      }

      // 删除 source_type 字段
      try {
        await queryInterface.removeColumn('points_transactions', 'source_type', { transaction })
        console.log('✅ points_transactions.source_type 字段已删除')
      } catch (error) {
        console.error('❌ 删除 source_type 字段失败:', error.message)
      }

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error)
      throw error
    }
  }
}
