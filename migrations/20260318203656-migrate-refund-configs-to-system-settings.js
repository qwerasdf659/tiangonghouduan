'use strict'

/**
 * 退款防刷配置迁移：system_configs → system_settings
 *
 * @description 将3个退款防刷配置从 system_configs 迁移到 system_settings（白名单管控）
 *
 * 迁移内容：
 * - refund_cooldown_hours → exchange/refund_cooldown_hours
 * - refund_monthly_limit → exchange/refund_monthly_limit
 * - refund_approval_threshold → exchange/refund_approval_threshold
 */
module.exports = {
  async up(queryInterface) {
    // 1. 扩展 category 枚举，增加 'exchange' 值
    await queryInterface.sequelize.query(
      "ALTER TABLE system_settings MODIFY COLUMN category ENUM('basic','points','notification','security','marketplace','redemption','exchange') NOT NULL"
    )

    // 2. 迁移退款配置
    const configMapping = [
      { oldKey: 'refund_cooldown_hours', newKey: 'exchange/refund_cooldown_hours', defaultValue: '0', desc: '退款冷却期（小时）：同用户同商品退款后 N 小时内不可再次兑换，0=关闭' },
      { oldKey: 'refund_monthly_limit', newKey: 'exchange/refund_monthly_limit', defaultValue: '0', desc: '单用户每月退款上限（次），0=不限' },
      { oldKey: 'refund_approval_threshold', newKey: 'exchange/refund_approval_threshold', defaultValue: '0', desc: '退款大额审批阈值（材料数量）：退款金额超过此值需二次审批，0=关闭' }
    ]

    for (const { oldKey, newKey, defaultValue, desc } of configMapping) {
      // 读取旧值
      const [rows] = await queryInterface.sequelize.query(
        'SELECT config_value FROM system_configs WHERE config_key = ? AND is_active = 1 LIMIT 1',
        { replacements: [oldKey] }
      )
      const value = rows.length > 0 ? JSON.parse(rows[0].config_value) : defaultValue

      // 检查 system_settings 是否已存在（幂等）
      const [existing] = await queryInterface.sequelize.query(
        'SELECT system_setting_id FROM system_settings WHERE setting_key = ? LIMIT 1',
        { replacements: [newKey] }
      )

      if (existing.length === 0) {
        await queryInterface.sequelize.query(
          'INSERT INTO system_settings (category, setting_key, setting_value, value_type, description, is_visible, is_readonly, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, NOW(), NOW())',
          { replacements: ['exchange', newKey, String(value), 'number', desc] }
        )
      }

      // 删除 system_configs 中的旧记录
      await queryInterface.sequelize.query(
        'DELETE FROM system_configs WHERE config_key = ?',
        { replacements: [oldKey] }
      )
    }
  },

  async down(queryInterface) {
    const configMapping = [
      { oldKey: 'refund_cooldown_hours', newKey: 'exchange/refund_cooldown_hours', desc: '退款冷却期（小时）' },
      { oldKey: 'refund_monthly_limit', newKey: 'exchange/refund_monthly_limit', desc: '单用户每月退款上限（次）' },
      { oldKey: 'refund_approval_threshold', newKey: 'exchange/refund_approval_threshold', desc: '退款大额审批阈值' }
    ]

    for (const { oldKey, newKey, desc } of configMapping) {
      const [rows] = await queryInterface.sequelize.query(
        'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
        { replacements: [newKey] }
      )
      const value = rows.length > 0 ? rows[0].setting_value : '0'

      const [existing] = await queryInterface.sequelize.query(
        'SELECT config_key FROM system_configs WHERE config_key = ? LIMIT 1',
        { replacements: [oldKey] }
      )

      if (existing.length === 0) {
        await queryInterface.sequelize.query(
          'INSERT INTO system_configs (config_key, config_value, description, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
          { replacements: [oldKey, JSON.stringify(value), desc] }
        )
      }

      await queryInterface.sequelize.query(
        'DELETE FROM system_settings WHERE setting_key = ?',
        { replacements: [newKey] }
      )
    }

    // 回滚 category 枚举
    await queryInterface.sequelize.query(
      "ALTER TABLE system_settings MODIFY COLUMN category ENUM('basic','points','notification','security','marketplace','redemption') NOT NULL"
    )
  }
}
