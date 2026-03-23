'use strict'

/**
 * 档位门控重构迁移 —— 去预算门控，改资源级过滤
 *
 * 执行内容：
 * 1. DIAMOND 奖品 prize_value_points 清零（id=168, active）
 *    - 根因：pvp=1 导致 _filterByBudget 在预算耗尽时误杀 DIAMOND 奖品
 *    - 清零后：DIAMOND 奖品不再受 BUDGET_POINTS 门控，仅受 DIAMOND_QUOTA 控制
 *    - 连锁收益：SettleStage 条件 `pvp > 0` 自然跳过 DIAMOND 的预算扣减
 *
 * 2. BxPx 矩阵 B0 行 low_multiplier 从 0.00 → 1.00（3 行）
 *    - 根因：B0 时 low_multiplier=0.00 导致 TierPickStage 永不选中 low 档
 *    - 修复后：概率层不做资格门控，资格检查由 _filterByResourceEligibility 唯一负责
 *    - 安全性：资源级过滤后 B0 的 low 档只剩 pvp=0 的免费奖品，经济上安全
 *
 * 关联代码改动：BuildPrizePoolStage.js（同版本提交）
 *
 * @module migrations/20260304192803-remove-tier-budget-gating-add-resource-filter
 */

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* ── 第1步：DIAMOND 奖品 prize_value_points 清零 ── */
      console.log('[Migration] 1/2 DIAMOND 奖品 prize_value_points → 0 ...')
      const [, pvpMeta] = await queryInterface.sequelize.query(
        `UPDATE lottery_prizes
         SET prize_value_points = 0, updated_at = NOW()
         WHERE material_asset_code = 'DIAMOND'
           AND prize_value_points != 0`,
        { transaction }
      )
      console.log(`[Migration]   → 更新 ${pvpMeta.affectedRows || 0} 条 DIAMOND 奖品`)

      /* ── 第2步：BxPx 矩阵 B0 行 low_multiplier → 1.00 ── */
      console.log('[Migration] 2/2 BxPx 矩阵 B0.low_multiplier 0.00 → 1.00 ...')
      const [, matrixMeta] = await queryInterface.sequelize.query(
        `UPDATE lottery_tier_matrix_config
         SET low_multiplier = 1.00, updated_at = NOW()
         WHERE budget_tier = 'B0'
           AND low_multiplier = 0.00`,
        { transaction }
      )
      console.log(`[Migration]   → 更新 ${matrixMeta.affectedRows || 0} 条 B0 矩阵行`)

      await transaction.commit()
      console.log('[Migration] ✅ 档位门控重构迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('[Migration] ❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* ── 回滚第1步：DIAMOND 奖品 prize_value_points 恢复为 1 ── */
      console.log('[Rollback] 1/2 恢复 DIAMOND 奖品 pvp=1 (id=168) ...')
      await queryInterface.sequelize.query(
        `UPDATE lottery_prizes
         SET prize_value_points = 1, updated_at = NOW()
         WHERE lottery_prize_id = 168
           AND material_asset_code = 'DIAMOND'`,
        { transaction }
      )

      /* ── 回滚第2步：BxPx 矩阵 B0 行 low_multiplier 恢复为 0.00 ── */
      console.log('[Rollback] 2/2 恢复 B0.low_multiplier → 0.00 ...')
      await queryInterface.sequelize.query(
        `UPDATE lottery_tier_matrix_config
         SET low_multiplier = 0.00, updated_at = NOW()
         WHERE budget_tier = 'B0'`,
        { transaction }
      )

      await transaction.commit()
      console.log('[Rollback] ✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('[Rollback] ❌ 回滚失败:', error.message)
      throw error
    }
  }
}
