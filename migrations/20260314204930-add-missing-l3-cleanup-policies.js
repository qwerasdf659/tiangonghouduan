'use strict'

/**
 * 迁移：补充 5 张 L3 表的自动清理策略
 *
 * 设计文档第四节 L3 列出了 21 张可自动清理的表，
 * 但 system_configs.data_cleanup_policies 仅有 16 条策略。
 * 本迁移补充以下缺失表：
 *
 * | 表名                        | 保留天数 |
 * |-----------------------------|----------|
 * | ad_report_daily_snapshots   | 180      |
 * | ad_dau_daily_stats          | 180      |
 * | alert_silence_rules         | 90       |
 * | system_dictionary_history   | 180      |
 * | ad_billing_records          | 365      |
 *
 * @see docs/数据一键删除功能设计方案.md 第四节
 */

const MISSING_POLICIES = [
  { table: 'ad_report_daily_snapshots', retention_days: 180, batch_size: 1000, enabled: true },
  { table: 'ad_dau_daily_stats', retention_days: 180, batch_size: 1000, enabled: true },
  { table: 'alert_silence_rules', retention_days: 90, batch_size: 1000, enabled: true },
  { table: 'system_dictionary_history', retention_days: 180, batch_size: 1000, enabled: true },
  { table: 'ad_billing_records', retention_days: 365, batch_size: 500, enabled: true }
]

module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      "SELECT config_value FROM system_configs WHERE config_key = 'data_cleanup_policies'"
    )

    if (rows.length === 0) {
      console.log('[迁移] data_cleanup_policies 配置不存在，跳过')
      return
    }

    const config =
      typeof rows[0].config_value === 'string'
        ? JSON.parse(rows[0].config_value)
        : rows[0].config_value

    const existingTables = new Set((config.policies || []).map(p => p.table))
    let addedCount = 0

    for (const policy of MISSING_POLICIES) {
      if (!existingTables.has(policy.table)) {
        config.policies.push(policy)
        addedCount++
        console.log(`[迁移] 添加清理策略: ${policy.table} (保留 ${policy.retention_days} 天)`)
      }
    }

    if (addedCount > 0) {
      await queryInterface.sequelize.query(
        'UPDATE system_configs SET config_value = :value, updated_at = NOW() WHERE config_key = :key',
        {
          replacements: {
            value: JSON.stringify(config),
            key: 'data_cleanup_policies'
          }
        }
      )
      console.log(`[迁移] 共添加 ${addedCount} 条清理策略`)
    } else {
      console.log('[迁移] 所有策略已存在，无需添加')
    }
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      "SELECT config_value FROM system_configs WHERE config_key = 'data_cleanup_policies'"
    )

    if (rows.length === 0) return

    const config =
      typeof rows[0].config_value === 'string'
        ? JSON.parse(rows[0].config_value)
        : rows[0].config_value

    const tablesToRemove = new Set(MISSING_POLICIES.map(p => p.table))
    config.policies = (config.policies || []).filter(p => !tablesToRemove.has(p.table))

    await queryInterface.sequelize.query(
      'UPDATE system_configs SET config_value = :value, updated_at = NOW() WHERE config_key = :key',
      {
        replacements: {
          value: JSON.stringify(config),
          key: 'data_cleanup_policies'
        }
      }
    )
    console.log('[迁移回滚] 已移除 5 条补充的清理策略')
  }
}
