'use strict'

/**
 * 迁移：seed 售后申诉自助发起防滥用风控配置（方案A 第13/2项二期）
 *
 * 新增 system_settings 配置项（默认 "0" = 不限制，由运营按真实业务填值）：
 * - dispute/self_service_cooldown_hours：两次自助申诉的冷却小时数
 * - dispute/self_service_monthly_limit：单用户每月自助申诉次数上限
 *
 * 与现有 exchange/refund_* 风控范式一致（同表、同 value_type、默认关闭）。
 * 幂等：已存在则跳过（INSERT ... 先查后插）。
 *
 * @version 1.0.0
 * @date 2026-06-02
 */
module.exports = {
  async up(queryInterface) {
    const now = new Date()
    const settings = [
      {
        category: 'dispute',
        setting_key: 'dispute/self_service_cooldown_hours',
        setting_value: '0',
        value_type: 'number',
        description: '自助申诉冷却期（小时）：同用户两次自助发起售后申诉的最小间隔，0=关闭。【需运营按真实业务填值】'
      },
      {
        category: 'dispute',
        setting_key: 'dispute/self_service_monthly_limit',
        setting_value: '0',
        value_type: 'number',
        description: '自助申诉月限（次/月）：单用户每月自助发起售后申诉次数上限，0=不限制。【需运营按真实业务填值】'
      }
    ]

    for (const s of settings) {
      const existing = await queryInterface.sequelize.query(
        'SELECT system_setting_id FROM system_settings WHERE setting_key = ? LIMIT 1',
        { replacements: [s.setting_key], type: queryInterface.sequelize.QueryTypes.SELECT }
      )
      if (existing.length > 0) continue

      await queryInterface.sequelize.query(
        `INSERT INTO system_settings
          (category, setting_key, setting_value, value_type, description, is_visible, is_readonly, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`,
        {
          replacements: [
            s.category,
            s.setting_key,
            s.setting_value,
            s.value_type,
            s.description,
            now,
            now
          ]
        }
      )
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM system_settings WHERE setting_key IN
        ('dispute/self_service_cooldown_hours', 'dispute/self_service_monthly_limit')`
    )
  }
}
