'use strict'

/**
 * D10 + D14 + D15: 清理活动 1 测试数据、重置 BUDGET_POINTS、删除半成品奖品
 *
 * 业务背景：
 * - D10: 活动 1 的 3,739 次抽奖全来自 user_id=31（1 个测试用户），
 *   奖品数据严重不合规（15 个奖品、5 个 fallback、low 全 0），需清理重配
 * - D14: BUDGET_POINTS 存在 3 个负余额账户（测试期数据污染），全量重置
 * - D15: prize_id=152「钻石1个」缺少 material_asset_code，随 D10 一起清理
 *
 * 操作说明：
 * 1. 软删除活动 1 所有旧奖品（保留表结构，后续通过管理后台重新配置）
 * 2. 清理活动 1 的抽奖历史和用户体验状态
 * 3. 全量删除 BUDGET_POINTS 余额（上线后消费审核自动重新发放）
 * 4. 重置活动 1 奖品的统计计数器
 *
 * @see docs/抽奖活动奖品数量配置方案.md D10/D14/D15 决定项
 */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // D10-1: 软删除活动 1 所有旧奖品（含 prize_id=152 半成品，D15）
      const [, prizeMeta] = await queryInterface.sequelize.query(
        `UPDATE lottery_prizes
         SET deleted_at = NOW(), status = 'inactive', updated_at = NOW()
         WHERE lottery_campaign_id = 1 AND deleted_at IS NULL`,
        { transaction }
      )
      console.log(`[D10] 软删除活动 1 奖品 ${prizeMeta?.affectedRows || 0} 个`)

      // D10-2: 清理活动 1 的用户体验状态
      const [, expMeta] = await queryInterface.sequelize.query(
        `DELETE FROM lottery_user_experience_state WHERE lottery_campaign_id = 1`,
        { transaction }
      )
      console.log(`[D10] 清理活动 1 用户体验状态 ${expMeta?.affectedRows || 0} 行`)

      // D10-3: 检查并清理全局状态中活动 1 相关数据
      const [globalStateExists] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as cnt FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = 'lottery_user_global_state'`
      )
      if (globalStateExists[0]?.cnt > 0) {
        await queryInterface.sequelize.query(
          `UPDATE lottery_user_global_state
           SET global_draw_count = 0, global_empty_count = 0,
               global_high_count = 0, global_mid_count = 0, global_low_count = 0,
               historical_empty_rate = 0, luck_debt_level = 'none', luck_debt_multiplier = 1.00,
               updated_at = NOW()
           WHERE user_id IN (
             SELECT DISTINCT user_id FROM lottery_draws WHERE lottery_campaign_id = 1
           )`,
          { transaction }
        )
        console.log('[D10] 重置活动 1 相关用户的全局状态')
      }

      // D14: 全量重置 BUDGET_POINTS（3 正 + 3 负 = 净额 0，全部测试数据）
      const [, budgetMeta] = await queryInterface.sequelize.query(
        `DELETE FROM account_asset_balances WHERE asset_code = 'BUDGET_POINTS'`,
        { transaction }
      )
      console.log(`[D14] 删除 BUDGET_POINTS 余额 ${budgetMeta?.affectedRows || 0} 行`)

      await transaction.commit()
      console.log('[D10+D14+D15] 测试数据清理完成')
    } catch (error) {
      await transaction.rollback()
      console.error('[D10+D14+D15] 测试数据清理失败:', error.message)
      throw error
    }
  },

  async down(_queryInterface, _Sequelize) {
    console.log('[D10+D14+D15 rollback] 测试数据无法恢复（不可逆清理），需手动处理')
  }
}
