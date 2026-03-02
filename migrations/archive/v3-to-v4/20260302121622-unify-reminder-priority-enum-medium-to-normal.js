'use strict'

/**
 * 迁移：统一 reminder_rules.notification_priority 枚举值
 *
 * 问题：ReminderRule 使用 low/medium/high/urgent，
 *       AdminNotification 使用 low/normal/high/urgent，
 *       两套枚举在提醒→通知链路中语义不一致。
 *
 * 方案：将 reminder_rules 表的 notification_priority 枚举
 *       从 medium 改为 normal，与 admin_notifications.priority 统一。
 *
 * 影响范围：仅 reminder_rules 表，不影响 feedbacks / content_audit_records
 *          等使用 high/medium/low 三级优先级的独立业务表。
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Step 1: 扩展 ENUM，同时包含 medium 和 normal（允许数据迁移过渡）
    await queryInterface.sequelize.query(
      `ALTER TABLE reminder_rules
       MODIFY COLUMN notification_priority
       ENUM('low','medium','normal','high','urgent')
       NOT NULL DEFAULT 'normal'
       COMMENT '通知优先级（low=低, normal=普通, high=高, urgent=紧急）'`
    )

    // Step 2: 将所有 medium 数据更新为 normal（语义等价：中等 → 普通）
    await queryInterface.sequelize.query(
      `UPDATE reminder_rules SET notification_priority = 'normal' WHERE notification_priority = 'medium'`
    )

    // Step 3: 收缩 ENUM，移除已废弃的 medium 值
    await queryInterface.sequelize.query(
      `ALTER TABLE reminder_rules
       MODIFY COLUMN notification_priority
       ENUM('low','normal','high','urgent')
       NOT NULL DEFAULT 'normal'
       COMMENT '通知优先级（low=低, normal=普通, high=高, urgent=紧急）与 admin_notifications.priority 枚举一致'`
    )
  },

  async down(queryInterface) {
    // 回滚：normal → medium
    await queryInterface.sequelize.query(
      `ALTER TABLE reminder_rules
       MODIFY COLUMN notification_priority
       ENUM('low','medium','normal','high','urgent')
       NOT NULL DEFAULT 'medium'
       COMMENT '通知优先级'`
    )

    await queryInterface.sequelize.query(
      `UPDATE reminder_rules SET notification_priority = 'medium' WHERE notification_priority = 'normal'`
    )

    await queryInterface.sequelize.query(
      `ALTER TABLE reminder_rules
       MODIFY COLUMN notification_priority
       ENUM('low','medium','high','urgent')
       NOT NULL DEFAULT 'medium'
       COMMENT '通知优先级'`
    )
  }
}
