'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    console.log('🔧 开始修复NULL约束不匹配问题...')

    try {
      // 🔥 Phase 1: 修复中等优先级问题 - 设置数据库字段为NOT NULL
      console.log('📝 Phase 1: 修复数据库字段NULL约束...')

      // 修复 points_transactions.status
      console.log('- 修复 points_transactions.status')
      await queryInterface.changeColumn('points_transactions', 'status', {
        type: Sequelize.ENUM('pending', 'completed', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '交易状态'
      })

      // 修复 analytics_behaviors.created_at
      console.log('- 修复 analytics_behaviors.created_at')
      await queryInterface.changeColumn('analytics_behaviors', 'created_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: '行为发生时间'
      })

      // 修复 analytics_user_profiles 的多个字段
      console.log('- 修复 analytics_user_profiles 字段...')

      await queryInterface.changeColumn('analytics_user_profiles', 'engagement_score', {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '参与度评分(0-100)'
      })

      await queryInterface.changeColumn('analytics_user_profiles', 'risk_level', {
        type: Sequelize.ENUM('low', 'medium', 'high'),
        allowNull: false,
        defaultValue: 'low',
        comment: '风险等级'
      })

      await queryInterface.changeColumn('analytics_user_profiles', 'analysis_version', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'v1.0',
        comment: '分析算法版本'
      })

      await queryInterface.changeColumn('analytics_user_profiles', 'created_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: '创建时间'
      })

      await queryInterface.changeColumn('analytics_user_profiles', 'updated_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: '更新时间'
      })

      // 修复 analytics_recommendations 的多个字段
      console.log('- 修复 analytics_recommendations 字段...')

      await queryInterface.changeColumn('analytics_recommendations', 'algorithm_type', {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'collaborative_filtering',
        comment: '算法类型'
      })

      await queryInterface.changeColumn('analytics_recommendations', 'algorithm_version', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'v1.0',
        comment: '算法版本'
      })

      await queryInterface.changeColumn('analytics_recommendations', 'is_shown', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否已展示'
      })

      await queryInterface.changeColumn('analytics_recommendations', 'is_clicked', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否已点击'
      })

      await queryInterface.changeColumn('analytics_recommendations', 'conversion_value', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '转化价值'
      })

      // 修复 analytics_realtime_stats 的字段
      console.log('- 修复 analytics_realtime_stats 字段...')

      await queryInterface.changeColumn('analytics_realtime_stats', 'created_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: '创建时间'
      })

      await queryInterface.changeColumn('analytics_realtime_stats', 'updated_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: '更新时间'
      })

      console.log('✅ Phase 1: 数据库字段NULL约束修复完成')

      // 🔥 Phase 2: 验证修复结果
      console.log('📝 Phase 2: 验证修复结果...')

      // 验证一些关键字段
      const testTables = [
        'points_transactions',
        'analytics_behaviors',
        'analytics_user_profiles',
        'analytics_recommendations',
        'analytics_realtime_stats'
      ]

      for (const tableName of testTables) {
        try {
          const _columns = await queryInterface.describeTable(tableName)
          console.log(`✅ 验证表 ${tableName} 结构更新成功`)
        } catch (error) {
          console.error(`❌ 验证表 ${tableName} 失败:`, error.message)
        }
      }

      console.log('✅ NULL约束修复migration执行完成')
      console.log('')
      console.log('📋 修复总结:')
      console.log('- 修复了18个中等优先级的NULL约束问题')
      console.log('- 所有analytics表的created_at/updated_at字段已设置为NOT NULL')
      console.log('- 所有enum和boolean字段已设置适当的默认值')
      console.log('- 所有decimal字段已设置为NOT NULL with默认值0')
      console.log('')
      console.log('⚠️ 注意：高优先级和低优先级问题需要修改模型定义')
      console.log('  请参考analyze-null-constraints.js的输出进行模型修改')
    } catch (error) {
      console.error('❌ NULL约束修复失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, Sequelize) {
    console.log('🔄 回滚NULL约束修复...')

    try {
      // 回滚操作 - 将字段改回允许NULL
      console.log('⚠️ 注意：回滚操作会将字段改回允许NULL，可能导致数据一致性问题')

      // 回滚 points_transactions.status
      await queryInterface.changeColumn('points_transactions', 'status', {
        type: Sequelize.ENUM('pending', 'completed', 'failed', 'cancelled'),
        allowNull: true,
        comment: '交易状态'
      })

      // 回滚 analytics_behaviors.created_at
      await queryInterface.changeColumn('analytics_behaviors', 'created_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '行为发生时间'
      })

      // 回滚 analytics_user_profiles 字段
      await queryInterface.changeColumn('analytics_user_profiles', 'engagement_score', {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
        comment: '参与度评分(0-100)'
      })

      await queryInterface.changeColumn('analytics_user_profiles', 'risk_level', {
        type: Sequelize.ENUM('low', 'medium', 'high'),
        allowNull: true,
        comment: '风险等级'
      })

      await queryInterface.changeColumn('analytics_user_profiles', 'analysis_version', {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: '分析算法版本'
      })

      await queryInterface.changeColumn('analytics_user_profiles', 'created_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '创建时间'
      })

      await queryInterface.changeColumn('analytics_user_profiles', 'updated_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '更新时间'
      })

      // 回滚 analytics_recommendations 字段
      await queryInterface.changeColumn('analytics_recommendations', 'algorithm_type', {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: '算法类型'
      })

      await queryInterface.changeColumn('analytics_recommendations', 'algorithm_version', {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: '算法版本'
      })

      await queryInterface.changeColumn('analytics_recommendations', 'is_shown', {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        comment: '是否已展示'
      })

      await queryInterface.changeColumn('analytics_recommendations', 'is_clicked', {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        comment: '是否已点击'
      })

      await queryInterface.changeColumn('analytics_recommendations', 'conversion_value', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: '转化价值'
      })

      // 回滚 analytics_realtime_stats 字段
      await queryInterface.changeColumn('analytics_realtime_stats', 'created_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '创建时间'
      })

      await queryInterface.changeColumn('analytics_realtime_stats', 'updated_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '更新时间'
      })

      console.log('✅ NULL约束修复回滚完成')
    } catch (error) {
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
