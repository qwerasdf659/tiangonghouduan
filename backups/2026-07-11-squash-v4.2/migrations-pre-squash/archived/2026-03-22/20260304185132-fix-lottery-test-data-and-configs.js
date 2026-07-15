'use strict'

/**
 * D10/D12/P1 修复迁移 —— 清理测试数据 + 修正策略配置
 *
 * 执行内容：
 * 1. D10: 清理 campaign_id=1 的 3750 条测试抽奖记录及关联数据
 * 2. D12: 将 DB 中 anti_empty.empty_streak_threshold 从 3 改为 5
 * 3. P1:  将 tier_fallback.prize_id 从 119（旧奖品）修正为 170（当前 fallback 奖品）
 * 4. 重置旧奖品的 total_win_count / daily_win_count（测试数据污染）
 * 5. 清理测试用户配额记录
 *
 * 注意：asset_transactions 中 is_test_data=1 的记录 及 account_asset_balances
 * 属于"互锁组"数据，本迁移仅标记/清理明确的测试痕迹。
 *
 * @module migrations/20260304185132-fix-lottery-test-data-and-configs
 */

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* ── 第1步：清理 lottery_draw_decisions（先删子表） ── */
      console.log('[Migration] 1/7 清理 lottery_draw_decisions ...')
      const [, decMeta] = await queryInterface.sequelize.query(
        `DELETE FROM lottery_draw_decisions
         WHERE lottery_draw_id IN (
           SELECT lottery_draw_id FROM lottery_draws WHERE lottery_campaign_id = 1
         )`,
        { transaction }
      )
      console.log(`[Migration]   → 删除 ${decMeta.affectedRows || 0} 条 draw_decisions`)

      /* ── 第2步：清理 lottery_draws ── */
      console.log('[Migration] 2/7 清理 lottery_draws (campaign_id=1) ...')
      const [, drawMeta] = await queryInterface.sequelize.query(
        `DELETE FROM lottery_draws WHERE lottery_campaign_id = 1`,
        { transaction }
      )
      console.log(`[Migration]   → 删除 ${drawMeta.affectedRows || 0} 条 draws`)

      /* ── 第3步：清理 lottery_user_daily_draw_quota ── */
      console.log('[Migration] 3/7 清理 lottery_user_daily_draw_quota ...')
      const [, quotaMeta] = await queryInterface.sequelize.query(
        `DELETE FROM lottery_user_daily_draw_quota WHERE lottery_campaign_id = 1`,
        { transaction }
      )
      console.log(`[Migration]   → 删除 ${quotaMeta.affectedRows || 0} 条配额记录`)

      /* ── 第4步：重置所有奖品的中奖统计 ── */
      console.log('[Migration] 4/7 重置奖品 total_win_count / daily_win_count ...')
      const [, prizeMeta] = await queryInterface.sequelize.query(
        `UPDATE lottery_prizes
         SET total_win_count = 0, daily_win_count = 0, updated_at = NOW()
         WHERE total_win_count > 0 OR daily_win_count > 0`,
        { transaction }
      )
      console.log(`[Migration]   → 重置 ${prizeMeta.affectedRows || 0} 个奖品的统计数据`)

      /* ── 第5步：D12 修正 anti_empty.empty_streak_threshold → 5 ── */
      console.log('[Migration] 5/7 D12: empty_streak_threshold 3 → 5 ...')
      const [, esMeta] = await queryInterface.sequelize.query(
        `UPDATE lottery_strategy_config
         SET config_value = CAST(5 AS JSON), updated_at = NOW()
         WHERE config_group = 'anti_empty'
           AND config_key = 'empty_streak_threshold'
           AND config_value = CAST(3 AS JSON)`,
        { transaction }
      )
      console.log(`[Migration]   → 更新 ${esMeta.affectedRows || 0} 条记录`)

      /* ── 第6步：修正 tier_fallback.prize_id 119 → 170 ── */
      console.log('[Migration] 6/7 tier_fallback.prize_id 119 → 170 ...')
      const [, tfMeta] = await queryInterface.sequelize.query(
        `UPDATE lottery_strategy_config
         SET config_value = CAST(170 AS JSON), updated_at = NOW()
         WHERE config_group = 'tier_fallback'
           AND config_key = 'prize_id'
           AND config_value = CAST(119 AS JSON)`,
        { transaction }
      )
      console.log(`[Migration]   → 更新 ${tfMeta.affectedRows || 0} 条记录`)

      /* ── 第7步：标记测试 asset_transactions ── */
      console.log('[Migration] 7/7 标记测试资产流水 ...')
      const [, atMeta] = await queryInterface.sequelize.query(
        `UPDATE asset_transactions
         SET is_test_data = 1
         WHERE asset_code = 'BUDGET_POINTS'
           AND is_test_data = 0
           AND business_type IN ('admin_adjustment', 'opening_balance',
                                 'admin_adjustment_counterpart', 'opening_balance_counterpart',
                                 'data_migration', 'data_migration_counterpart',
                                 'historical_reconciliation', 'system_reconciliation')`,
        { transaction }
      )
      console.log(`[Migration]   → 标记 ${atMeta.affectedRows || 0} 条测试流水`)

      await transaction.commit()
      console.log('[Migration] ✅ 迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('[Migration] ❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    console.log('[Migration] ⚠️ 此迁移（测试数据清理）不支持回滚')
    console.log('[Migration]   已删除的测试数据无法自动恢复，如需恢复请使用数据库备份')
  }
}
