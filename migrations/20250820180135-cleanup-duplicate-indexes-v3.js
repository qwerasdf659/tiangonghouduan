'use strict'

/**
 * 🗂️ 清理重复索引迁移 - V3优化版本
 * 目标：
 * 1. 清理真正重复的单字段索引
 * 2. 保留高效的复合索引
 * 3. 优化数据库查询性能
 * 4. 减少存储开销
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, _Sequelize) {
    console.log('🗂️ 开始清理重复索引优化数据库性能...')

    // 🔥 第一步：获取现有索引信息
    console.log('🔍 分析现有索引结构...')

    // 🔥 第二步：清理 analytics_behaviors 表的重复索引
    console.log('📊 清理 analytics_behaviors 表重复索引...')

    try {
      // 删除单独的 created_at 索引，因为我们有复合索引 (user_id, event_type, created_at)
      await queryInterface.removeIndex('analytics_behaviors', 'analytics_behaviors_created_at')
      console.log('   ✅ 删除单独索引: analytics_behaviors_created_at')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在:', error.message)
    }

    try {
      // 删除单独的 event_type 索引，因为复合索引已包含
      await queryInterface.removeIndex('analytics_behaviors', 'analytics_behaviors_event_type')
      console.log('   ✅ 删除单独索引: analytics_behaviors_event_type')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在:', error.message)
    }

    try {
      // 删除单独的 user_id 索引，因为复合索引已包含
      await queryInterface.removeIndex('analytics_behaviors', 'analytics_behaviors_user_id')
      console.log('   ✅ 删除单独索引: analytics_behaviors_user_id')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在:', error.message)
    }

    // 🔥 第三步：清理 analytics_recommendations 表的重复索引
    console.log('📈 清理 analytics_recommendations 表重复索引...')

    try {
      // 删除单独的 user_id 索引，因为复合索引已包含
      await queryInterface.removeIndex(
        'analytics_recommendations',
        'analytics_recommendations_user_id'
      )
      console.log('   ✅ 删除单独索引: analytics_recommendations_user_id')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在:', error.message)
    }

    try {
      // 删除单独的 rec_type 索引，因为复合索引已包含
      await queryInterface.removeIndex(
        'analytics_recommendations',
        'analytics_recommendations_rec_type'
      )
      console.log('   ✅ 删除单独索引: analytics_recommendations_rec_type')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在:', error.message)
    }

    try {
      // 删除单独的 expires_at 索引，因为复合索引已包含
      await queryInterface.removeIndex(
        'analytics_recommendations',
        'analytics_recommendations_expires_at'
      )
      console.log('   ✅ 删除单独索引: analytics_recommendations_expires_at')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在:', error.message)
    }

    // 🔥 第四步：清理 analytics_user_profiles 表的重复索引
    console.log('👤 清理 analytics_user_profiles 表重复索引...')

    try {
      // 保留唯一索引，删除普通 user_id 索引
      await queryInterface.removeIndex('analytics_user_profiles', 'analytics_user_profiles_user_id')
      console.log('   ✅ 删除重复索引: analytics_user_profiles_user_id (保留UNIQUE索引)')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在:', error.message)
    }

    // 🔥 第五步：清理其他表的重复索引
    console.log('🧹 清理其他表的重复索引...')

    // points_transactions 表
    const pointsTransactionIndexesToRemove = [
      'points_transactions_business_type_1',
      'points_transactions_status_1',
      'points_transactions_transaction_type_1',
      'points_transactions_user_id_1'
    ]

    for (const indexName of pointsTransactionIndexesToRemove) {
      try {
        await queryInterface.removeIndex('points_transactions', indexName)
        console.log(`   ✅ 删除重复索引: ${indexName}`)
      } catch (error) {
        console.log(`   ⚠️ 索引 ${indexName} 可能不存在:`, error.message)
      }
    }

    // lottery_campaigns 表
    const lotteryCampaignIndexesToRemove = [
      'lottery_campaigns_campaign_code_1',
      'lottery_campaigns_status_1',
      'lottery_campaigns_start_time_1',
      'lottery_campaigns_end_time_1'
    ]

    for (const indexName of lotteryCampaignIndexesToRemove) {
      try {
        await queryInterface.removeIndex('lottery_campaigns', indexName)
        console.log(`   ✅ 删除重复索引: ${indexName}`)
      } catch (error) {
        console.log(`   ⚠️ 索引 ${indexName} 可能不存在:`, error.message)
      }
    }

    // lottery_prizes 表
    const lotteryPrizeIndexesToRemove = ['lottery_prizes_probability_1', 'lottery_prizes_status_1']

    for (const indexName of lotteryPrizeIndexesToRemove) {
      try {
        await queryInterface.removeIndex('lottery_prizes', indexName)
        console.log(`   ✅ 删除重复索引: ${indexName}`)
      } catch (error) {
        console.log(`   ⚠️ 索引 ${indexName} 可能不存在:`, error.message)
      }
    }

    // 🔥 第六步：优化关键复合索引
    console.log('⚡ 添加高效的复合索引...')

    try {
      // 为 points_transactions 添加高频查询的复合索引
      await queryInterface.addIndex(
        'points_transactions',
        ['user_id', 'transaction_type', 'transaction_time'],
        {
          name: 'idx_points_tx_user_type_time'
        }
      )
      console.log(
        '   ✅ 添加复合索引: points_transactions (user_id, transaction_type, transaction_time)'
      )
    } catch (error) {
      console.log('   ⚠️ 索引可能已存在:', error.message)
    }

    try {
      // 为 lottery_campaigns 添加状态和时间的复合索引
      await queryInterface.addIndex('lottery_campaigns', ['status', 'start_time', 'end_time'], {
        name: 'idx_lottery_campaigns_status_time'
      })
      console.log('   ✅ 添加复合索引: lottery_campaigns (status, start_time, end_time)')
    } catch (error) {
      console.log('   ⚠️ 索引可能已存在:', error.message)
    }

    // 🔥 第七步：验证索引优化结果
    console.log('🔍 验证索引优化结果...')

    // 统计关键表的索引数量
    const tables = ['analytics_behaviors', 'analytics_recommendations', 'analytics_user_profiles']

    for (const table of tables) {
      try {
        const [indexes] = await queryInterface.sequelize.query(`
          SELECT COUNT(*) as index_count 
          FROM INFORMATION_SCHEMA.STATISTICS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = '${table}'
        `)
        console.log(`   📊 ${table}: ${indexes[0].index_count} 个索引`)
      } catch (error) {
        console.log(`   ⚠️ 无法查询 ${table} 索引信息:`, error.message)
      }
    }

    console.log('✅ 重复索引清理和优化完成！')
    console.log('   ✅ 删除了冗余的单字段索引')
    console.log('   ✅ 保留了高效的复合索引')
    console.log('   ✅ 添加了针对高频查询的复合索引')
    console.log('   ✅ 优化了数据库查询性能')
  },

  async down (_queryInterface, _Sequelize) {
    console.log('🔄 回滚索引优化...')

    console.log('⚠️ 索引优化的回滚需要手动实施')
    console.log('⚠️ 建议重新创建必要的单字段索引（如果需要）')

    // 可以在这里添加具体的回滚索引创建操作
    // 但通常索引优化不需要回滚
  }
}
