'use strict'

/**
 * 迁移：添加 anti_high_cooldown 字段到 lottery_user_experience_state 表
 *
 * 业务背景：
 * - AntiHighStreakHandler 触发降级后需要设置冷却期
 * - 冷却期内不再统计高价值次数，防止用户被长期锁定在中档
 * - 该字段在 ExperienceStateManager 中已被引用但数据库未创建
 * - 导致 AntiHigh 冷却机制完全失效
 *
 * @version 20260214235752
 * @description 添加 anti_high_cooldown 字段（修复 AntiHigh 冷却机制失效）
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    /* 检查字段是否已存在 */
    const [columns] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM lottery_user_experience_state LIKE 'anti_high_cooldown'"
    )

    if (columns.length === 0) {
      await queryInterface.addColumn('lottery_user_experience_state', 'anti_high_cooldown', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'AntiHigh冷却剩余次数（触发降级后N次抽奖不再检测，0=不在冷却期）',
        after: 'recent_high_count'
      })
      console.log('✅ 已添加 anti_high_cooldown 字段')
    } else {
      console.log('⏭️ anti_high_cooldown 字段已存在，跳过')
    }
  },

  async down(queryInterface, _Sequelize) {
    const [columns] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM lottery_user_experience_state LIKE 'anti_high_cooldown'"
    )

    if (columns.length > 0) {
      await queryInterface.removeColumn('lottery_user_experience_state', 'anti_high_cooldown')
      console.log('✅ 已删除 anti_high_cooldown 字段')
    }
  }
}
