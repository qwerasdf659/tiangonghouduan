'use strict'

/**
 * 完成钻石配额配置从 lottery_strategy_config → system_settings 的迁移
 *
 * 前置迁移 20260302184454 已将 diamond_quota 组的 config_key 重命名为短名称，
 * 本迁移完成剩余工作：
 *
 * 1. 向 system_settings 插入 diamond_quota_enabled（boolean）
 * 2. 向 system_settings 插入 diamond_quota_exhausted_action（string）
 * 3. 删除 lottery_strategy_config 中 config_group='diamond_quota' 的全部记录
 *
 * 迁移后配额读取路径统一为：
 *   AdminSystemService.getSettingValue('points', 'diamond_quota_*')
 *
 * @see docs/钻石配额配置修复与优化方案.md §7.1 / §17.1
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* ── 第1步：插入缺失的 system_settings 记录 ── */
      console.log('[Migration] 1/2 插入 diamond_quota_enabled + diamond_quota_exhausted_action 到 system_settings...')

      const new_settings = [
        {
          setting_key: 'diamond_quota_enabled',
          setting_value: 'true',
          value_type: 'boolean',
          category: 'points',
          description: '抽奖钻石配额控制（开启后配额不足的用户不会抽到钻石奖品）'
        },
        {
          setting_key: 'diamond_quota_exhausted_action',
          setting_value: 'filter',
          value_type: 'string',
          category: 'points',
          description: '配额不足策略（filter=移除全部钻石奖品，downgrade=保留最小额钻石）'
        }
      ]

      for (const setting of new_settings) {
        await queryInterface.sequelize.query(
          `INSERT INTO system_settings
             (setting_key, setting_value, value_type, category, description, created_at, updated_at)
           VALUES
             (:setting_key, :setting_value, :value_type, :category, :description, NOW(), NOW())
           ON DUPLICATE KEY UPDATE updated_at = NOW()`,
          { replacements: setting, transaction }
        )
        console.log(`[Migration]   → 插入 ${setting.setting_key} = ${setting.setting_value}`)
      }

      /* ── 第2步：删除 lottery_strategy_config 中的 diamond_quota 记录 ── */
      console.log('[Migration] 2/2 删除 lottery_strategy_config 中 config_group=diamond_quota 的记录...')

      const [, delete_meta] = await queryInterface.sequelize.query(
        `DELETE FROM lottery_strategy_config WHERE config_group = 'diamond_quota'`,
        { transaction }
      )
      const deleted_count = delete_meta.affectedRows || 0
      console.log(`[Migration]   → 删除 ${deleted_count} 条 diamond_quota 策略配置记录`)

      await transaction.commit()
      console.log('[Migration] ✅ 钻石配额配置迁移到 system_settings 完成')
    } catch (error) {
      await transaction.rollback()
      console.error('[Migration] ❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* 恢复 lottery_strategy_config 中的 diamond_quota 记录 */
      const [campaigns] = await queryInterface.sequelize.query(
        `SELECT DISTINCT lottery_campaign_id FROM lottery_strategy_config WHERE is_active = 1`,
        { transaction }
      )
      const campaign_ids = campaigns.map(r => r.lottery_campaign_id)

      for (const cid of campaign_ids) {
        const records = [
          { key: 'enabled', value: 'true', type: 'boolean', desc: '钻石配额开关' },
          { key: 'ratio', value: '1', type: 'number', desc: '钻石配额比例' },
          { key: 'exhausted_action', value: '"filter"', type: 'string', desc: '配额耗尽策略' }
        ]
        for (const r of records) {
          await queryInterface.sequelize.query(
            `INSERT INTO lottery_strategy_config
               (lottery_campaign_id, config_group, config_key, config_value, value_type, description, is_active, priority, created_at, updated_at)
             VALUES
               (:cid, 'diamond_quota', :key, :value, :type, :desc, 1, 0, NOW(), NOW())
             ON DUPLICATE KEY UPDATE updated_at = NOW()`,
            { replacements: { cid, ...r }, transaction }
          )
        }
      }

      /* 删除新增的 system_settings 记录 */
      await queryInterface.sequelize.query(
        `DELETE FROM system_settings
         WHERE category = 'points'
           AND setting_key IN ('diamond_quota_enabled', 'diamond_quota_exhausted_action')`,
        { transaction }
      )

      await transaction.commit()
      console.log('[Migration] ✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
