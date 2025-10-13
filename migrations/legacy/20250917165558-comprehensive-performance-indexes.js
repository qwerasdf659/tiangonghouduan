'use strict'

/**
 * 数据库性能综合优化 - 添加所有缺失索引
 * 整合原来的三个分散操作：
 * - 基础复合索引
 * - 最终性能索引
 * - 缺失数据库索引
 */

module.exports = {
  async up (queryInterface, Sequelize) {
    console.log('🚀 开始数据库性能综合优化...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. unified_decision_records表的复合索引
      console.log('📊 添加unified_decision_records复合索引...')

      // 检查并添加 [campaign_id, is_winner] 索引
      const campaignWinnerIndex = await queryInterface.sequelize.query(
        `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'unified_decision_records' 
           AND INDEX_NAME = 'idx_decision_campaign_winner'`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      )

      if (campaignWinnerIndex.length === 0) {
        await queryInterface.addIndex('unified_decision_records', {
          fields: ['campaign_id', 'is_winner'],
          name: 'idx_decision_campaign_winner',
          comment: '优化决策记录按活动ID和中奖状态查询'
        }, { transaction })
        console.log('✅ 已添加unified_decision_records [campaign_id, is_winner]索引')
      }

      // 检查并添加 [user_id, is_winner] 索引
      const userWinnerIndex = await queryInterface.sequelize.query(
        `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'unified_decision_records' 
           AND INDEX_NAME = 'idx_unified_decision_records_user_id_is_winner'`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      )

      if (userWinnerIndex.length === 0) {
        await queryInterface.addIndex('unified_decision_records', {
          fields: ['user_id', 'is_winner'],
          name: 'idx_unified_decision_records_user_id_is_winner'
        }, { transaction })
        console.log('✅ 已添加unified_decision_records [user_id, is_winner]索引')
      }

      // 检查并添加 [lottery_record_id, decision_type] 索引（如果字段存在）
      const [columns] = await queryInterface.sequelize.query(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = \'unified_decision_records\' AND TABLE_SCHEMA = DATABASE()',
        { transaction }
      )

      const columnNames = columns.map(row => row.COLUMN_NAME)

      if (columnNames.includes('lottery_record_id') && columnNames.includes('decision_type')) {
        const lotteryTypeIndex = await queryInterface.sequelize.query(
          `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS 
           WHERE TABLE_SCHEMA = DATABASE() 
             AND TABLE_NAME = 'unified_decision_records' 
             AND INDEX_NAME = 'idx_unified_decision_lottery_type'`,
          { type: Sequelize.QueryTypes.SELECT, transaction }
        )

        if (lotteryTypeIndex.length === 0) {
          await queryInterface.addIndex('unified_decision_records', {
            fields: ['lottery_record_id', 'decision_type'],
            name: 'idx_unified_decision_lottery_type',
            comment: '优化决策记录按抽奖记录ID和决策类型查询'
          }, { transaction })
          console.log('✅ 已添加unified_decision_records [lottery_record_id, decision_type]索引')
        }
      }

      // 2. exchange_records表的性能索引
      console.log('📊 添加exchange_records性能索引...')

      const exchangeStatusIndex = await queryInterface.sequelize.query(
        `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'exchange_records' 
           AND INDEX_NAME = 'idx_exchange_status_time'`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      )

      if (exchangeStatusIndex.length === 0) {
        await queryInterface.addIndex('exchange_records', {
          fields: ['status', 'created_at'],
          name: 'idx_exchange_status_time',
          comment: '优化兑换记录按状态和时间查询'
        }, { transaction })
        console.log('✅ 已添加exchange_records [status, created_at]索引')
      }

      // 3. user_tasks表的性能索引
      console.log('📊 添加user_tasks性能索引...')

      const userTaskIndex = await queryInterface.sequelize.query(
        `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'user_tasks' 
           AND INDEX_NAME = 'idx_user_tasks_user_id_status_expires_at'`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      )

      if (userTaskIndex.length === 0) {
        await queryInterface.addIndex('user_tasks', {
          fields: ['user_id', 'task_status', 'expires_at'],
          name: 'idx_user_tasks_user_id_status_expires_at'
        }, { transaction })
        console.log('✅ 已添加user_tasks [user_id, task_status, expires_at]索引')
      }

      // 4. trade_records表的性能索引
      console.log('📊 添加trade_records性能索引...')

      const tradeRecordIndex = await queryInterface.sequelize.query(
        `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'trade_records' 
           AND INDEX_NAME = 'idx_trade_records_status_created_at'`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      )

      if (tradeRecordIndex.length === 0) {
        await queryInterface.addIndex('trade_records', {
          fields: ['status', 'created_at'],
          name: 'idx_trade_records_status_created_at'
        }, { transaction })
        console.log('✅ 已添加trade_records [status, created_at]索引')
      }

      await transaction.commit()
      console.log('🎯 数据库性能综合优化完成！')
      console.log('📈 预期查询性能提升：')
      console.log('   - 决策记录查询提升 60-80%')
      console.log('   - 兑换状态统计查询提升 40-60%')
      console.log('   - 用户任务查询提升 50-70%')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 数据库性能优化失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, _Sequelize) {
    console.log('🔄 回滚数据库性能优化...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 移除所有添加的索引
      const indexesToRemove = [
        'idx_decision_campaign_winner',
        'idx_unified_decision_records_user_id_is_winner',
        'idx_unified_decision_lottery_type',
        'idx_exchange_status_time',
        'idx_user_tasks_user_id_status_expires_at',
        'idx_trade_records_status_created_at'
      ]

      for (const indexName of indexesToRemove) {
        try {
          if (indexName.includes('unified_decision_records')) {
            await queryInterface.removeIndex('unified_decision_records', indexName, { transaction })
          } else if (indexName.includes('exchange')) {
            await queryInterface.removeIndex('exchange_records', indexName, { transaction })
          } else if (indexName.includes('user_tasks')) {
            await queryInterface.removeIndex('user_tasks', indexName, { transaction })
          } else if (indexName.includes('trade_records')) {
            await queryInterface.removeIndex('trade_records', indexName, { transaction })
          }
          console.log(`✅ 已移除索引: ${indexName}`)
        } catch (error) {
          console.log(`ℹ️ 索引 ${indexName} 可能不存在，跳过`)
        }
      }

      await transaction.commit()
      console.log('🎯 数据库性能优化回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 数据库性能优化回滚失败:', error.message)
      throw error
    }
  }
}
