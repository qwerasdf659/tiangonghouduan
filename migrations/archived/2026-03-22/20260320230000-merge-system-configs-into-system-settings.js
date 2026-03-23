'use strict'

/**
 * 完全合并 system_configs → system_settings 并删除 system_configs 表
 *
 * 1. 将 category 列从 ENUM 改为 VARCHAR(50) 以支持所有类别
 * 2. 将所有 is_active=1 的行迁移到 system_settings（跳过已存在的 setting_key）
 * 3. 删除 system_configs 表
 */
module.exports = {
  async up(queryInterface) {
    // Step 1: Change category column from ENUM to VARCHAR(50)
    await queryInterface.sequelize.query(
      'ALTER TABLE system_settings MODIFY COLUMN category VARCHAR(50) NOT NULL'
    )

    // Step 2: Migrate all active rows from system_configs, skip duplicates
    const [rows] = await queryInterface.sequelize.query(
      'SELECT config_key, config_value, config_category FROM system_configs WHERE is_active = 1'
    )

    for (const row of rows) {
      const { config_key, config_value, config_category } = row

      const [existing] = await queryInterface.sequelize.query(
        'SELECT system_setting_id FROM system_settings WHERE setting_key = ? LIMIT 1',
        { replacements: [config_key] }
      )

      if (existing.length > 0) continue

      const serialized = typeof config_value === 'object'
        ? JSON.stringify(config_value)
        : String(config_value)

      await queryInterface.sequelize.query(
        `INSERT INTO system_settings
           (category, setting_key, setting_value, value_type, description, is_visible, is_readonly, created_at, updated_at)
         VALUES (?, ?, ?, 'json', NULL, 1, 0, NOW(), NOW())`,
        { replacements: [config_category || 'general', config_key, serialized] }
      )
    }

    // Step 3: Drop the system_configs table
    await queryInterface.dropTable('system_configs')
  },

  async down(queryInterface, Sequelize) {
    // Re-create system_configs table
    await queryInterface.createTable('system_configs', {
      system_config_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      config_key: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      config_value: {
        type: Sequelize.JSON,
        allowNull: true
      },
      config_category: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      description: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    })

    // Revert category to ENUM
    await queryInterface.sequelize.query(
      "ALTER TABLE system_settings MODIFY COLUMN category ENUM('basic','points','notification','security','marketplace','redemption','exchange') NOT NULL"
    )
  }
}
