'use strict'

/**
 * 清理剩余测试抽奖数据 + 重置用户体验状态
 *
 * 背景：前次迁移清理了 3750 条旧测试数据，但之后 user_id=31 又进行了 8 次
 * 测试抽奖（全部为 fallback 结果）。本迁移彻底清除所有 campaign_id=1 的
 * 测试痕迹，确保正式上线时统计数据干净。
 *
 * 执行内容：
 * 1. 删除 lottery_draw_decisions（子表先删）
 * 2. 删除 lottery_draws（campaign_id=1 全部记录）
 * 3. 删除 lottery_user_daily_draw_quota（campaign_id=1）
 * 4. 重置 lottery_user_experience_state（campaign_id=1）
 * 5. 重置 lottery_user_global_state（测试用户 user_id=31）
 * 6. 重置奖品的 total_win_count / daily_win_count
 *
 * @module migrations/20260304195213-clean-remaining-test-draws-reset-state
 */

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* ── 1. 删除 lottery_draw_decisions ── */
      console.log('[Migration] 1/6 清理 lottery_draw_decisions ...')
      const [, decMeta] = await queryInterface.sequelize.query(
        `DELETE FROM lottery_draw_decisions
         WHERE lottery_draw_id IN (
           SELECT lottery_draw_id FROM lottery_draws WHERE lottery_campaign_id = 1
         )`,
        { transaction }
      )
      console.log(`[Migration]   → 删除 ${decMeta.affectedRows || 0} 条 draw_decisions`)

      /* ── 2. 删除 lottery_draws ── */
      console.log('[Migration] 2/6 清理 lottery_draws (campaign_id=1) ...')
      const [, drawMeta] = await queryInterface.sequelize.query(
        'DELETE FROM lottery_draws WHERE lottery_campaign_id = 1',
        { transaction }
      )
      console.log(`[Migration]   → 删除 ${drawMeta.affectedRows || 0} 条 draws`)

      /* ── 3. 删除 lottery_user_daily_draw_quota ── */
      console.log('[Migration] 3/6 清理 lottery_user_daily_draw_quota ...')
      const [, quotaMeta] = await queryInterface.sequelize.query(
        'DELETE FROM lottery_user_daily_draw_quota WHERE lottery_campaign_id = 1',
        { transaction }
      )
      console.log(`[Migration]   → 删除 ${quotaMeta.affectedRows || 0} 条配额记录`)

      /* ── 4. 重置 lottery_user_experience_state ── */
      console.log('[Migration] 4/6 重置 lottery_user_experience_state (campaign_id=1) ...')
      const [, expMeta] = await queryInterface.sequelize.query(
        `UPDATE lottery_user_experience_state
         SET empty_streak = 0,
             recent_high_count = 0,
             anti_high_cooldown = 0,
             max_empty_streak = 0,
             total_draw_count = 0,
             total_empty_count = 0,
             pity_trigger_count = 0,
             last_draw_at = NULL,
             last_draw_tier = NULL,
             updated_at = NOW()
         WHERE lottery_campaign_id = 1`,
        { transaction }
      )
      console.log(`[Migration]   → 重置 ${expMeta.affectedRows || 0} 条体验状态`)

      /* ── 5. 重置 lottery_user_global_state（测试用户） ── */
      console.log('[Migration] 5/6 重置 lottery_user_global_state (user_id=31) ...')
      const [, glbMeta] = await queryInterface.sequelize.query(
        `UPDATE lottery_user_global_state
         SET global_draw_count = 0,
             global_empty_count = 0,
             historical_empty_rate = 0,
             luck_debt_level = 'neutral',
             luck_debt_multiplier = 1.0,
             global_high_count = 0,
             global_mid_count = 0,
             global_low_count = 0,
             last_draw_at = NULL,
             updated_at = NOW()
         WHERE user_id = 31`,
        { transaction }
      )
      console.log(`[Migration]   → 重置 ${glbMeta.affectedRows || 0} 条全局状态`)

      /* ── 6. 重置奖品统计 ── */
      console.log('[Migration] 6/6 重置奖品 total_win_count / daily_win_count ...')
      const [, prizeMeta] = await queryInterface.sequelize.query(
        `UPDATE lottery_prizes
         SET total_win_count = 0, daily_win_count = 0, updated_at = NOW()
         WHERE lottery_campaign_id = 1
           AND (total_win_count > 0 OR daily_win_count > 0)`,
        { transaction }
      )
      console.log(`[Migration]   → 重置 ${prizeMeta.affectedRows || 0} 个奖品的统计`)

      await transaction.commit()
      console.log('[Migration] ✅ 测试数据清理完成')
    } catch (error) {
      await transaction.rollback()
      console.error('[Migration] ❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    console.log('[Migration] ⚠️ 测试数据清理不支持回滚，如需恢复请使用数据库备份')
  }
}
