'use strict'

/**
 * 移除签到积分配置项
 *
 * 业务决策：项目不包含签到送积分功能，
 * sign_in_points 配置项属于历史遗留的占位数据，需要清除。
 */
module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      "SELECT system_setting_id FROM system_settings WHERE setting_key = 'sign_in_points' AND category = 'points'"
    )

    if (existing.length > 0) {
      await queryInterface.sequelize.query(
        "DELETE FROM system_settings WHERE setting_key = 'sign_in_points' AND category = 'points'"
      )
      console.log('✅ 已删除 sign_in_points 配置项（system_setting_id:', existing[0].system_setting_id, '）')
    } else {
      console.log('ℹ️ sign_in_points 配置项不存在，跳过')
    }
  },

  async down(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      "SELECT system_setting_id FROM system_settings WHERE setting_key = 'sign_in_points' AND category = 'points'"
    )

    if (existing.length === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO system_settings (category, setting_key, setting_value, value_type, description, is_visible, is_readonly, created_at, updated_at)
         VALUES ('points', 'sign_in_points', '0', 'number', '每日签到奖励积分', 1, 0, NOW(), NOW())`
      )
      console.log('✅ 已恢复 sign_in_points 配置项')
    }
  }
}
