'use strict'

/**
 * 修复P2阶段表的主键命名，使其符合项目规范
 *
 * 项目规范：主键字段命名格式为 {table_name}_id（如user_id、lottery_prize_id）
 *
 * 修复内容：
 * - reminder_rules: rule_id → reminder_rule_id
 * - reminder_history: history_id → reminder_history_id
 * - report_templates: template_id → report_template_id
 * - user_behavior_tracks: track_id → user_behavior_track_id
 *
 * 同时需要更新外键引用
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ==================== 1. 修复 reminder_rules 表主键 ====================
      console.log('📝 修复 reminder_rules 表主键: rule_id → reminder_rule_id')

      // 先删除 reminder_history 表中的外键约束（如果存在）
      try {
        await queryInterface.removeConstraint('reminder_history', 'reminder_history_ibfk_1', { transaction })
      } catch (e) {
        console.log('   ⚠️ 外键约束不存在或已删除')
      }

      // 重命名主键列
      await queryInterface.renameColumn('reminder_rules', 'rule_id', 'reminder_rule_id', { transaction })

      // 更新 reminder_history 表中的外键列名
      await queryInterface.renameColumn('reminder_history', 'rule_id', 'reminder_rule_id', { transaction })

      // 重新添加外键约束
      await queryInterface.addConstraint('reminder_history', {
        fields: ['reminder_rule_id'],
        type: 'foreign key',
        name: 'fk_reminder_history_rule',
        references: {
          table: 'reminder_rules',
          field: 'reminder_rule_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })

      // ==================== 2. 修复 reminder_history 表主键 ====================
      console.log('📝 修复 reminder_history 表主键: history_id → reminder_history_id')
      await queryInterface.renameColumn('reminder_history', 'history_id', 'reminder_history_id', { transaction })

      // ==================== 3. 修复 report_templates 表主键 ====================
      console.log('📝 修复 report_templates 表主键: template_id → report_template_id')
      await queryInterface.renameColumn('report_templates', 'template_id', 'report_template_id', { transaction })

      // ==================== 4. 修复 user_behavior_tracks 表主键 ====================
      console.log('📝 修复 user_behavior_tracks 表主键: track_id → user_behavior_track_id')
      await queryInterface.renameColumn('user_behavior_tracks', 'track_id', 'user_behavior_track_id', { transaction })

      await transaction.commit()
      console.log('✅ P2表主键命名修复完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚：恢复原来的列名

      // 1. user_behavior_tracks
      await queryInterface.renameColumn('user_behavior_tracks', 'user_behavior_track_id', 'track_id', { transaction })

      // 2. report_templates
      await queryInterface.renameColumn('report_templates', 'report_template_id', 'template_id', { transaction })

      // 3. reminder_history
      await queryInterface.renameColumn('reminder_history', 'reminder_history_id', 'history_id', { transaction })

      // 4. reminder_rules（先处理外键）
      try {
        await queryInterface.removeConstraint('reminder_history', 'fk_reminder_history_rule', { transaction })
      } catch (e) {
        console.log('   ⚠️ 外键约束不存在')
      }

      await queryInterface.renameColumn('reminder_history', 'reminder_rule_id', 'rule_id', { transaction })
      await queryInterface.renameColumn('reminder_rules', 'reminder_rule_id', 'rule_id', { transaction })

      // 重新添加原来的外键约束
      await queryInterface.addConstraint('reminder_history', {
        fields: ['rule_id'],
        type: 'foreign key',
        name: 'reminder_history_ibfk_1',
        references: {
          table: 'reminder_rules',
          field: 'rule_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
