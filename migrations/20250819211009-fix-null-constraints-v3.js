'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    console.log('🔧 开始修复V3架构模型的NULL约束不匹配问题...')

    // 修复 user_points_accounts 表
    console.log('📊 修复 user_points_accounts 表的NULL约束...')
    // 跳过主键字段的修改，主键已经正确设置

    await queryInterface.changeColumn('user_points_accounts', 'account_level', {
      type: Sequelize.ENUM('bronze', 'silver', 'gold', 'diamond'),
      allowNull: true,
      defaultValue: 'bronze'
    })

    await queryInterface.changeColumn('user_points_accounts', 'is_active', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: true
    })

    await queryInterface.changeColumn('user_points_accounts', 'behavior_score', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: 0.0
    })

    await queryInterface.changeColumn('user_points_accounts', 'activity_level', {
      type: Sequelize.ENUM('low', 'medium', 'high', 'premium'),
      allowNull: true,
      defaultValue: 'medium'
    })

    await queryInterface.changeColumn('user_points_accounts', 'recommendation_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: true
    })

    // 修复 points_transactions 表
    console.log('💳 修复 points_transactions 表的NULL约束...')
    // 跳过主键字段transaction_id的修改

    await queryInterface.changeColumn('points_transactions', 'status', {
      type: Sequelize.ENUM('pending', 'completed', 'failed', 'cancelled'),
      allowNull: true,
      defaultValue: 'completed'
    })

    // 修复 lottery_campaigns 表
    console.log('🎲 修复 lottery_campaigns 表的NULL约束...')
    // 跳过主键字段campaign_id的修改

    await queryInterface.changeColumn('lottery_campaigns', 'max_draws_per_user_daily', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1
    })

    await queryInterface.changeColumn('lottery_campaigns', 'daily_reset_time', {
      type: Sequelize.TIME,
      allowNull: false,
      defaultValue: '00:00:00'
    })

    await queryInterface.changeColumn('lottery_campaigns', 'status', {
      type: Sequelize.ENUM('draft', 'active', 'paused', 'ended', 'cancelled'),
      allowNull: false,
      defaultValue: 'draft'
    })

    await queryInterface.changeColumn('lottery_campaigns', 'is_featured', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    })

    await queryInterface.changeColumn('lottery_campaigns', 'total_participants', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    })

    await queryInterface.changeColumn('lottery_campaigns', 'total_draws', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    })

    await queryInterface.changeColumn('lottery_campaigns', 'total_prizes_awarded', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    })

    // 修复 lottery_prizes 表
    console.log('🏆 修复 lottery_prizes 表的NULL约束...')
    // 跳过主键字段prize_id的修改

    // 修复 lottery_draws 表
    console.log('🎯 修复 lottery_draws 表的NULL约束...')
    // 跳过主键字段draw_id的修改

    await queryInterface.changeColumn('lottery_draws', 'prize_status', {
      type: Sequelize.ENUM('pending', 'awarded', 'delivered', 'received'),
      allowNull: true,
      defaultValue: 'pending'
    })

    // 修复 business_events 表
    console.log('📋 修复 business_events 表的NULL约束...')
    // 跳过主键字段event_id的修改

    await queryInterface.changeColumn('business_events', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: false
    })

    await queryInterface.changeColumn('business_events', 'event_status', {
      type: Sequelize.ENUM('pending', 'processing', 'completed', 'failed', 'retrying'),
      allowNull: false,
      defaultValue: 'pending'
    })

    await queryInterface.changeColumn('business_events', 'source_module', {
      type: Sequelize.STRING(100),
      allowNull: false,
      defaultValue: 'unknown'
    })

    console.log('✅ V3架构NULL约束修复完成！')
  },

  async down (_queryInterface, _Sequelize) {
    console.log('🔄 回滚V3架构NULL约束修复...')

    // 这里可以添加回滚操作，将字段改回原来的约束
    // 为了安全起见，暂时不实现回滚操作
    console.log('⚠️  NULL约束回滚操作需要手动实施')
  }
}
