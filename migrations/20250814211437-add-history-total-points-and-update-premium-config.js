'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    console.log('🔧 开始迁移：添加历史累计积分字段并更新臻选空间配置...')

    // 1. 在users表中添加history_total_points字段（如果不存在）
    console.log('📋 检查并添加history_total_points字段到users表...')
    try {
      await queryInterface.addColumn('users', 'history_total_points', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '历史累计总积分（只增不减，用于解锁条件）'
      })
      console.log('✅ history_total_points字段添加成功')
    } catch (error) {
      if (error.message.includes('Duplicate column name')) {
        console.log('ℹ️ history_total_points字段已存在，跳过添加')
      } else {
        throw error
      }
    }

    // 2. 计算现有用户的历史累计积分
    console.log('📊 计算现有用户的历史累计积分...')
    await queryInterface.sequelize.query(`
      UPDATE users 
      SET history_total_points = (
        SELECT COALESCE(SUM(points), 0) 
        FROM points_records 
        WHERE points_records.user_id = users.user_id 
        AND points > 0
      )
    `)

    // 3. 更新premium_space_access表的配置值
    console.log('⚙️ 更新臻选空间解锁配置...')

    // 更新累计积分要求：50万 -> 10万
    await queryInterface.sequelize.query(`
      UPDATE premium_space_access 
      SET required_cumulative_points = 100000 
      WHERE required_cumulative_points = 500000
    `)

    // 更新解锁费用：100 -> 1000积分
    await queryInterface.sequelize.query(`
      UPDATE premium_space_access 
      SET unlock_cost_points = 1000 
      WHERE unlock_cost_points = 100
    `)

    // 更新解锁时长：24 -> 48小时
    await queryInterface.sequelize.query(`
      UPDATE premium_space_access 
      SET unlock_duration_hours = 48 
      WHERE unlock_duration_hours = 24
    `)

    // 4. 清除所有过期的解锁状态（因为配置变更）
    console.log('🧹 清除过期的解锁状态...')
    await queryInterface.sequelize.query(`
      UPDATE premium_space_access 
      SET is_unlocked = false, unlock_time = NULL, expiry_time = NULL
      WHERE is_unlocked = true AND (
        expiry_time IS NULL OR 
        expiry_time < NOW()
      )
    `)

    console.log('✅ 迁移完成：臻选空间解锁功能已更新')
  },

  async down (queryInterface, _Sequelize) {
    console.log('🔄 开始回滚：恢复臻选空间配置...')

    // 1. 回滚premium_space_access表的配置值
    console.log('⚙️ 恢复臻选空间解锁配置...')

    // 恢复累计积分要求：10万 -> 50万
    await queryInterface.sequelize.query(`
      UPDATE premium_space_access 
      SET required_cumulative_points = 500000 
      WHERE required_cumulative_points = 100000
    `)

    // 恢复解锁费用：1000 -> 100积分
    await queryInterface.sequelize.query(`
      UPDATE premium_space_access 
      SET unlock_cost_points = 100 
      WHERE unlock_cost_points = 1000
    `)

    // 恢复解锁时长：48 -> 24小时
    await queryInterface.sequelize.query(`
      UPDATE premium_space_access 
      SET unlock_duration_hours = 24 
      WHERE unlock_duration_hours = 48
    `)

    // 2. 删除history_total_points字段
    console.log('📋 删除history_total_points字段...')
    await queryInterface.removeColumn('users', 'history_total_points')

    console.log('✅ 回滚完成')
  }
}
