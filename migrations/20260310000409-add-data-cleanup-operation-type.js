'use strict'

/**
 * 数据清理功能 - 数据库变更迁移
 *
 * 变更内容：
 * 1. admin_operation_logs.operation_type ENUM 新增 'data_cleanup'
 * 2. system_configs 插入默认自动清理策略
 * 3. feature_flags 插入清档模式开关
 * 4. DROP 迁移遗留 legacy 表（决策 6）
 *
 */

const { DB_ENUM_VALUES } = require('../constants/AuditOperationTypes')

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========== 1. 扩展 operation_type ENUM ==========
      await queryInterface.changeColumn(
        'admin_operation_logs',
        'operation_type',
        {
          type: Sequelize.ENUM(...DB_ENUM_VALUES),
          allowNull: false,
          comment: '操作类型（新增 data_cleanup）'
        },
        { transaction }
      )

      // ========== 2. 插入默认自动清理策略到 system_configs ==========
      const [existingPolicy] = await queryInterface.sequelize.query(
        "SELECT system_config_id FROM system_configs WHERE config_key = 'data_cleanup_policies' LIMIT 1",
        { transaction }
      )

      if (existingPolicy.length === 0) {
        const now = new Date()
        await queryInterface.bulkInsert(
          'system_configs',
          [
            {
              config_key: 'data_cleanup_policies',
              config_category: 'data_management',
              config_value: JSON.stringify({
                policies: [
                  { table: 'api_idempotency_requests', retention_days: 7, enabled: true, batch_size: 1000 },
                  { table: 'websocket_startup_logs', retention_days: 7, enabled: true, batch_size: 1000 },
                  { table: 'authentication_sessions', retention_days: 30, enabled: true, batch_size: 500 },
                  { table: 'admin_operation_logs', retention_days: 90, enabled: true, batch_size: 500 },
                  { table: 'ad_impression_logs', retention_days: 90, enabled: true, batch_size: 500 },
                  { table: 'ad_click_logs', retention_days: 90, enabled: true, batch_size: 500 },
                  { table: 'ad_interaction_logs', retention_days: 90, enabled: true, batch_size: 500 },
                  { table: 'ad_bid_logs', retention_days: 90, enabled: true, batch_size: 500 },
                  { table: 'ad_antifraud_logs', retention_days: 90, enabled: true, batch_size: 500 },
                  { table: 'ad_attribution_logs', retention_days: 90, enabled: true, batch_size: 500 },
                  { table: 'reminder_history', retention_days: 90, enabled: true, batch_size: 500 },
                  { table: 'merchant_operation_logs', retention_days: 90, enabled: true, batch_size: 500 },
                  { table: 'batch_operation_logs', retention_days: 90, enabled: true, batch_size: 500 },
                  { table: 'user_role_change_records', retention_days: 180, enabled: true, batch_size: 500 },
                  { table: 'user_status_change_records', retention_days: 180, enabled: true, batch_size: 500 },
                  { table: 'risk_alerts', retention_days: 90, enabled: true, batch_size: 500 }
                ],
                schedule_cron: '0 3 * * *',
                max_execution_time_seconds: 300
              }),
              is_active: true,
              description: '数据自动清理策略配置（保留天数/批量大小/启用开关）',
              created_at: now,
              updated_at: now
            }
          ],
          { transaction }
        )
      }

      // ========== 3. 插入清档模式 feature_flag ==========
      const [existingFlag] = await queryInterface.sequelize.query(
        "SELECT feature_flag_id FROM feature_flags WHERE flag_key = 'data_pre_launch_wipe' LIMIT 1",
        { transaction }
      )

      if (existingFlag.length === 0) {
        const now = new Date()
        await queryInterface.bulkInsert(
          'feature_flags',
          [
            {
              flag_key: 'data_pre_launch_wipe',
              flag_name: '上线前清档模式',
              description: '启用后允许执行上线前全量清档操作（NODE_ENV !== production 时生效）',
              is_enabled: false,
              rollout_percentage: 100,
              rollout_strategy: 'all',
              created_by: 'system',
              created_at: now,
              updated_at: now
            }
          ],
          { transaction }
        )
      }

      // ========== 4. DROP legacy 遗留表（决策 6）==========
      await queryInterface.sequelize.query(
        'DROP TABLE IF EXISTS `item_instance_events_legacy`',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'DROP TABLE IF EXISTS `item_instances_legacy`',
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚：重新读取当前 ENUM（data_cleanup 已移除）执行 changeColumn
      const currentEnumValues = DB_ENUM_VALUES.filter(v => v !== 'data_cleanup')
      await queryInterface.changeColumn(
        'admin_operation_logs',
        'operation_type',
        {
          type: Sequelize.ENUM(...currentEnumValues),
          allowNull: false
        },
        { transaction }
      )

      await queryInterface.bulkDelete(
        'system_configs',
        { config_key: 'data_cleanup_policies' },
        { transaction }
      )

      await queryInterface.bulkDelete(
        'feature_flags',
        { flag_key: 'data_pre_launch_wipe' },
        { transaction }
      )

      // 重建 legacy 表（从 baseline 复制）
      await queryInterface.createTable(
        'item_instances_legacy',
        {
          item_instance_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
          item_template_id: { type: Sequelize.INTEGER, allowNull: false },
          owner_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'users', key: 'user_id' },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE'
          },
          status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'available' },
          source_type: { type: Sequelize.STRING(20), allowNull: true },
          source_id: { type: Sequelize.INTEGER, allowNull: true },
          acquired_at: { type: Sequelize.DATE, allowNull: true },
          expires_at: { type: Sequelize.DATE, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false }
        },
        { transaction }
      )

      await queryInterface.createTable(
        'item_instance_events_legacy',
        {
          event_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
          item_instance_id: { type: Sequelize.INTEGER, allowNull: false },
          event_type: { type: Sequelize.STRING(30), allowNull: false },
          operator_id: { type: Sequelize.INTEGER, allowNull: true },
          details: { type: Sequelize.JSON, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false }
        },
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}

