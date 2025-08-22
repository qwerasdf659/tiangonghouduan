'use strict'

/**
 * 🔧 数据库一致性修复迁移 - V3正确版本
 * 修复问题：
 * 1. 修正NULL约束不匹配（之前的修复有误）
 * 2. 清理重复索引
 * 3. 确保用户行为检测系统表的正确配置
 * 4. 优化索引性能
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    console.log('🔧 开始正确修复V3架构数据库一致性问题...')

    // 🔥 第一步：修复 user_points_accounts 表的NULL约束
    console.log('📊 正确修复 user_points_accounts 表的NULL约束...')

    // 先将现有NULL值设置为默认值，然后改为NOT NULL
    await queryInterface.sequelize.query(`
      UPDATE user_points_accounts 
      SET account_level = 'bronze' 
      WHERE account_level IS NULL
    `)

    await queryInterface.sequelize.query(`
      UPDATE user_points_accounts 
      SET is_active = true 
      WHERE is_active IS NULL
    `)

    await queryInterface.sequelize.query(`
      UPDATE user_points_accounts 
      SET behavior_score = 0.00 
      WHERE behavior_score IS NULL
    `)

    await queryInterface.sequelize.query(`
      UPDATE user_points_accounts 
      SET activity_level = 'medium' 
      WHERE activity_level IS NULL
    `)

    await queryInterface.sequelize.query(`
      UPDATE user_points_accounts 
      SET recommendation_enabled = true 
      WHERE recommendation_enabled IS NULL
    `)

    // 现在将字段改为NOT NULL（与模型定义一致）
    await queryInterface.changeColumn('user_points_accounts', 'account_level', {
      type: Sequelize.ENUM('bronze', 'silver', 'gold', 'diamond'),
      allowNull: false,
      defaultValue: 'bronze'
    })

    await queryInterface.changeColumn('user_points_accounts', 'is_active', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true
    })

    await queryInterface.changeColumn('user_points_accounts', 'behavior_score', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0.0
    })

    await queryInterface.changeColumn('user_points_accounts', 'activity_level', {
      type: Sequelize.ENUM('low', 'medium', 'high', 'premium'),
      allowNull: false,
      defaultValue: 'medium'
    })

    await queryInterface.changeColumn('user_points_accounts', 'recommendation_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true
    })

    // 🔥 第二步：清理重复索引
    console.log('🗂️ 清理重复索引...')

    try {
      // points_transactions 表重复索引清理
      await queryInterface.removeIndex('points_transactions', 'points_transactions_business_type')
      console.log('   ✅ 删除重复索引: points_transactions_business_type')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在:', error.message)
    }

    try {
      await queryInterface.removeIndex('points_transactions', 'points_transactions_status_1')
      console.log('   ✅ 删除重复索引: points_transactions_status_1')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在:', error.message)
    }

    try {
      await queryInterface.removeIndex(
        'points_transactions',
        'points_transactions_transaction_type_1'
      )
      console.log('   ✅ 删除重复索引: points_transactions_transaction_type_1')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在:', error.message)
    }

    try {
      // lottery_campaigns 表重复索引清理
      await queryInterface.removeIndex('lottery_campaigns', 'lottery_campaigns_campaign_code_1')
      console.log('   ✅ 删除重复索引: lottery_campaigns_campaign_code_1')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在:', error.message)
    }

    try {
      await queryInterface.removeIndex('lottery_campaigns', 'lottery_campaigns_status_1')
      console.log('   ✅ 删除重复索引: lottery_campaigns_status_1')
    } catch (error) {
      console.log('   ⚠️ 索引可能不存在:', error.message)
    }

    // 🔥 第三步：修复analytics表的NULL约束
    console.log('📈 修复用户行为检测系统表的NULL约束...')

    // 确保analytics_behaviors表的关键字段NOT NULL
    await queryInterface.changeColumn('analytics_behaviors', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: false
    })

    await queryInterface.changeColumn('analytics_behaviors', 'session_id', {
      type: Sequelize.STRING(64),
      allowNull: false
    })

    await queryInterface.changeColumn('analytics_behaviors', 'event_type', {
      type: Sequelize.STRING(50),
      allowNull: false
    })

    await queryInterface.changeColumn('analytics_behaviors', 'event_data', {
      type: Sequelize.JSON,
      allowNull: false
    })

    // 确保analytics_user_profiles表的关键字段NOT NULL
    await queryInterface.changeColumn('analytics_user_profiles', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      unique: true
    })

    await queryInterface.changeColumn('analytics_user_profiles', 'behavior_summary', {
      type: Sequelize.JSON,
      allowNull: false
    })

    await queryInterface.changeColumn('analytics_user_profiles', 'last_analysis_at', {
      type: Sequelize.DATE,
      allowNull: false
    })

    // 确保analytics_recommendations表的关键字段NOT NULL
    await queryInterface.changeColumn('analytics_recommendations', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: false
    })

    await queryInterface.changeColumn('analytics_recommendations', 'rec_type', {
      type: Sequelize.ENUM('lottery_campaign', 'points_task', 'product', 'activity'),
      allowNull: false
    })

    await queryInterface.changeColumn('analytics_recommendations', 'rec_items', {
      type: Sequelize.JSON,
      allowNull: false
    })

    await queryInterface.changeColumn('analytics_recommendations', 'rec_scores', {
      type: Sequelize.JSON,
      allowNull: false
    })

    await queryInterface.changeColumn('analytics_recommendations', 'generated_at', {
      type: Sequelize.DATE(3),
      allowNull: false
    })

    await queryInterface.changeColumn('analytics_recommendations', 'expires_at', {
      type: Sequelize.DATE(3),
      allowNull: false
    })

    // 🔥 第四步：优化关键索引
    console.log('⚡ 优化关键性能索引...')

    // 为用户行为检测系统添加复合索引
    try {
      await queryInterface.addIndex(
        'analytics_behaviors',
        ['user_id', 'event_type', 'created_at'],
        {
          name: 'idx_analytics_behaviors_user_event_time'
        }
      )
      console.log('   ✅ 添加复合索引: analytics_behaviors (user_id, event_type, created_at)')
    } catch (error) {
      console.log('   ⚠️ 索引可能已存在:', error.message)
    }

    try {
      await queryInterface.addIndex(
        'analytics_recommendations',
        ['user_id', 'rec_type', 'expires_at'],
        {
          name: 'idx_analytics_recommendations_user_type_expires'
        }
      )
      console.log('   ✅ 添加复合索引: analytics_recommendations (user_id, rec_type, expires_at)')
    } catch (error) {
      console.log('   ⚠️ 索引可能已存在:', error.message)
    }

    // 🔥 第五步：验证修复结果
    console.log('🔍 验证修复结果...')

    const [userPointsAccountCheck] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count 
      FROM user_points_accounts 
      WHERE account_level IS NULL 
         OR is_active IS NULL 
         OR behavior_score IS NULL 
         OR activity_level IS NULL 
         OR recommendation_enabled IS NULL
    `)

    if (userPointsAccountCheck[0].count > 0) {
      throw new Error(
        `❌ user_points_accounts表仍有${userPointsAccountCheck[0].count}条记录包含NULL值`
      )
    }

    console.log('✅ V3架构数据库一致性修复完成！')
    console.log('   ✅ NULL约束已正确设置')
    console.log('   ✅ 重复索引已清理')
    console.log('   ✅ 用户行为检测系统表已优化')
    console.log('   ✅ 性能索引已优化')
  },

  async down (_queryInterface, _Sequelize) {
    console.log('🔄 回滚数据库一致性修复...')

    // 注意：回滚操作需要谨慎，这里只提供基本框架
    console.log('⚠️ 数据库一致性修复的回滚需要手动实施')
    console.log('⚠️ 建议在回滚前备份数据库')

    // 可以添加具体的回滚操作，但要非常小心
    // 因为修改NULL约束可能涉及数据完整性
  }
}
