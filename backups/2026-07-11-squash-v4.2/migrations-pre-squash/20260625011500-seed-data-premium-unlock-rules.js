'use strict'

/**
 * 初始化臻选空间（高级空间）解锁规则的运营可调配置（2026-06-25）
 *
 * 业务背景（详见 docs/臻选空间解锁条件不显示问题-根因定位与后端修复文档.md §6.1）：
 * - 原 PremiumService.js 把"历史积分门槛 10万 / 解锁费用 100 / 有效期 24h"写死为常量，运营改不了、要发版；
 * - 本次改为运营在 Web 后台「臻选空间」分类可动态调整（改配置不发版），复用现有 system_settings 机制。
 *
 * 设计（与现有 points/* 配置同一机制，零表变更）：
 * - 存 system_settings：category='premium'，setting_key 不带前缀（与 points 分类一致：
 *   history_points_threshold / unlock_cost / validity_hours）；
 * - 白名单已在 config/system-settings-whitelist.js 注册（premium/history_points_threshold 等，含范围约束）；
 * - PremiumService 经 AdminSystemService.getSettingValue('premium', key, 默认值) 读取，缺行时回落默认值（与原硬编码一致）。
 *
 * 数据现状（连真实库 restaurant_points_dev 核实）：premium 分类当前无任何配置行，需插入初始 3 行。
 * 初始值与原硬编码常量完全一致，保证行为不变：10万 / 100 / 24。
 */

const ROWS = [
  {
    category: 'premium',
    setting_key: 'history_points_threshold',
    setting_value: '100000',
    value_type: 'number',
    description: '臻选空间解锁条件①：历史累计积分门槛（达到该值才可解锁）'
  },
  {
    category: 'premium',
    setting_key: 'unlock_cost',
    setting_value: '100',
    value_type: 'number',
    description: '臻选空间解锁费用 / 条件②：解锁需扣除并要求当前可用积分≥该值'
  },
  {
    category: 'premium',
    setting_key: 'validity_hours',
    setting_value: '24',
    value_type: 'number',
    description: '臻选空间解锁后有效期（小时），过期需重新解锁'
  }
]

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      for (const row of ROWS) {
        // 幂等：已存在则不重复插入
        // eslint-disable-next-line no-await-in-loop
        const [existing] = await sequelize.query(
          'SELECT system_setting_id FROM system_settings WHERE category = :c AND setting_key = :k',
          { replacements: { c: row.category, k: row.setting_key }, transaction }
        )

        if (existing.length === 0) {
          // eslint-disable-next-line no-await-in-loop
          await sequelize.query(
            `INSERT INTO system_settings
               (category, setting_key, setting_value, value_type, description,
                is_visible, is_readonly, created_at, updated_at)
             VALUES
               (:c, :k, :v, :t, :d, 1, 0, NOW(), NOW())`,
            {
              replacements: {
                c: row.category,
                k: row.setting_key,
                v: row.setting_value,
                t: row.value_type,
                d: row.description
              },
              transaction
            }
          )
        }
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize
    await sequelize.query("DELETE FROM system_settings WHERE category = 'premium'")
  }
}
