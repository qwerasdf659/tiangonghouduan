'use strict'

/**
 * 策略开关体系统一迁移
 *
 * 本迁移执行四项变更：
 * 1. 为所有活动补充 tier_fallback.enabled 记录（B2 修复）
 * 2. 重命名 diamond_quota 组的 config_key：去掉冗余前缀（B3 规范化）
 * 3. 修正 value_type='boolean' 但 JSON 存储为 STRING 的记录（B4 数据质量）
 * 4. 修正 value_type='number' 但 JSON 存储为 STRING 的记录（B7 数据质量）
 *
 * 背景：lottery_strategy_config 表有 14 个 config_group，其中 diamond_quota
 * 是唯一一个 config_key 带 group 前缀的（如 diamond_quota_enabled），
 * 不符合项目内其他 13 个 group 的命名规范。
 *
 * @module migrations/20260302184454-unify-strategy-switches
 */

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* ── 第1步：为所有活动补充 tier_fallback.enabled 记录 ── */
      console.log('[Migration] 1/4 补充 tier_fallback.enabled 记录...')

      const [campaign_rows] = await queryInterface.sequelize.query(
        `SELECT DISTINCT lottery_campaign_id FROM lottery_strategy_config WHERE is_active = 1`,
        { transaction }
      )
      const campaign_ids = campaign_rows.map(r => r.lottery_campaign_id)

      for (const cid of campaign_ids) {
        await queryInterface.sequelize.query(
          `INSERT INTO lottery_strategy_config
             (lottery_campaign_id, config_group, config_key, config_value, value_type, description, is_active, priority, created_at, updated_at)
           VALUES
             (:cid, 'tier_fallback', 'enabled', 'true', 'boolean', '档位兜底策略开关', 1, 0, NOW(), NOW())
           ON DUPLICATE KEY UPDATE updated_at = NOW()`,
          { replacements: { cid }, transaction }
        )
      }
      console.log(`[Migration]   → 已为 ${campaign_ids.length} 个活动补充 tier_fallback.enabled`)

      /* ── 第2步：重命名 diamond_quota 组的 config_key（去掉冗余前缀） ── */
      console.log('[Migration] 2/4 重命名 diamond_quota config_key...')

      const key_renames = [
        { old_key: 'diamond_quota_enabled', new_key: 'enabled' },
        { old_key: 'diamond_quota_ratio', new_key: 'ratio' },
        { old_key: 'quota_exhausted_action', new_key: 'exhausted_action' }
      ]

      for (const { old_key, new_key } of key_renames) {
        const [, meta] = await queryInterface.sequelize.query(
          `UPDATE lottery_strategy_config
           SET config_key = :new_key, updated_at = NOW()
           WHERE config_group = 'diamond_quota' AND config_key = :old_key`,
          { replacements: { old_key, new_key }, transaction }
        )
        console.log(`[Migration]   → ${old_key} → ${new_key}（${meta.changedRows || 0} 行）`)
      }

      /* ── 第3步：修正 boolean 类型 JSON 存储为 STRING 的记录 ── */
      console.log('[Migration] 3/4 修正 boolean 类型 JSON 存储...')

      const [bool_true_result] = await queryInterface.sequelize.query(
        `UPDATE lottery_strategy_config
         SET config_value = CAST('true' AS JSON), updated_at = NOW()
         WHERE value_type = 'boolean'
           AND JSON_TYPE(config_value) = 'STRING'
           AND JSON_UNQUOTE(config_value) = 'true'`,
        { transaction }
      )
      const bool_true_count = bool_true_result.changedRows || 0

      const [bool_false_result] = await queryInterface.sequelize.query(
        `UPDATE lottery_strategy_config
         SET config_value = CAST('false' AS JSON), updated_at = NOW()
         WHERE value_type = 'boolean'
           AND JSON_TYPE(config_value) = 'STRING'
           AND JSON_UNQUOTE(config_value) = 'false'`,
        { transaction }
      )
      const bool_false_count = bool_false_result.changedRows || 0
      console.log(`[Migration]   → 修正 ${bool_true_count + bool_false_count} 条 boolean 记录（true:${bool_true_count}, false:${bool_false_count}）`)

      /* ── 第4步：修正 number 类型 JSON 存储为 STRING 的记录 ── */
      console.log('[Migration] 4/4 修正 number 类型 JSON 存储...')

      const [num_result] = await queryInterface.sequelize.query(
        `UPDATE lottery_strategy_config
         SET config_value = CAST(JSON_UNQUOTE(config_value) AS JSON), updated_at = NOW()
         WHERE value_type = 'number'
           AND JSON_TYPE(config_value) = 'STRING'
           AND config_value IS NOT NULL`,
        { transaction }
      )
      const num_count = num_result.changedRows || 0
      console.log(`[Migration]   → 修正 ${num_count} 条 number 记录`)

      await transaction.commit()
      console.log('[Migration] ✅ 策略开关体系统一迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('[Migration] ❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* 还原 diamond_quota config_key 前缀 */
      const key_restores = [
        { old_key: 'enabled', new_key: 'diamond_quota_enabled' },
        { old_key: 'ratio', new_key: 'diamond_quota_ratio' },
        { old_key: 'exhausted_action', new_key: 'quota_exhausted_action' }
      ]
      for (const { old_key, new_key } of key_restores) {
        await queryInterface.sequelize.query(
          `UPDATE lottery_strategy_config
           SET config_key = :new_key, updated_at = NOW()
           WHERE config_group = 'diamond_quota' AND config_key = :old_key`,
          { replacements: { old_key, new_key }, transaction }
        )
      }

      /* 删除 tier_fallback.enabled 记录 */
      await queryInterface.sequelize.query(
        `DELETE FROM lottery_strategy_config
         WHERE config_group = 'tier_fallback' AND config_key = 'enabled'`,
        { transaction }
      )

      await transaction.commit()
      console.log('[Migration] ✅ 策略开关体系统一迁移已回滚')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
