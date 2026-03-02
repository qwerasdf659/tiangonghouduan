'use strict'

/**
 * 清理测试奖品 + 回填旧抽奖记录的档位审计字段
 *
 * 任务 1: 硬删除 win_weight=0 的测试/垃圾奖品（15条）
 *   - 所属测试活动: campaign 26 "再找找"、campaign 27 "12312"
 *   - 奖品名: "123", "1213", "自治州", "测试奖品A" 等
 *   - 无任何抽奖记录引用，仅1条预设引用需先删除
 *
 * 任务 2: 回填 2124 条旧抽奖记录的 pick_method / original_tier / final_tier
 *   - 这些记录产生于 2026-02-15 TierPickStage 审计修复之前
 *   - pick_method 设为 'legacy'（标识为遗留记录）
 *   - original_tier / final_tier 根据 reward_tier 推导
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* ========== 任务 1: 清理测试奖品 ========== */

      // 1a. 删除引用测试奖品的预设记录（prize_id=128 被1条预设引用）
      const test_prize_ids = [120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134]

      await queryInterface.sequelize.query(
        `DELETE FROM lottery_presets WHERE lottery_prize_id IN (${test_prize_ids.join(',')})`,
        { transaction }
      )

      // 1b. 硬删除 15 条 win_weight=0 的测试奖品
      await queryInterface.sequelize.query(
        `DELETE FROM lottery_prizes WHERE lottery_prize_id IN (${test_prize_ids.join(',')})`,
        { transaction }
      )

      /* ========== 任务 2: 回填旧抽奖记录的审计字段 ========== */

      /**
       * pick_method = 'legacy' 标识这些记录在 TierPickStage 审计修复之前产生
       *
       * original_tier 字段类型 ENUM('high','mid','low') — 不含 'fallback'：
       *   reward_tier='high'     → original_tier='high'
       *   reward_tier='mid'      → original_tier='mid'
       *   reward_tier='low'      → original_tier='low'
       *   reward_tier='fallback' → original_tier=NULL（ENUM 不支持）
       *
       * final_tier 字段类型 ENUM('high','mid','low','fallback')：
       *   直接取 reward_tier 的值
       */

      // 2a. 回填 pick_method
      await queryInterface.sequelize.query(
        `UPDATE lottery_draws
         SET pick_method = 'legacy'
         WHERE pick_method IS NULL`,
        { transaction }
      )

      // 2b. 回填 original_tier（排除 fallback/unknown，ENUM 不支持）
      await queryInterface.sequelize.query(
        `UPDATE lottery_draws
         SET original_tier = reward_tier
         WHERE original_tier IS NULL
           AND reward_tier IN ('high', 'mid', 'low')`,
        { transaction }
      )

      // 2c. 回填 final_tier
      await queryInterface.sequelize.query(
        `UPDATE lottery_draws
         SET final_tier = reward_tier
         WHERE final_tier IS NULL
           AND reward_tier IN ('high', 'mid', 'low', 'fallback')`,
        { transaction }
      )

      await transaction.commit()

      console.log('✅ 迁移完成: 清理 15 条测试奖品 + 回填旧抽奖记录审计字段')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    /**
     * 回滚说明：
     * - 测试奖品为垃圾数据，不恢复
     * - 审计字段回填为不可逆的数据修正操作（将 pick_method 还原为 NULL 无实际意义）
     *
     * 如确需回滚，执行以下 SQL 将审计字段重置为 NULL：
     */
    await queryInterface.sequelize.query(
      `UPDATE lottery_draws
       SET pick_method = NULL, original_tier = NULL, final_tier = NULL
       WHERE pick_method = 'legacy'`
    )

    console.log('⚠️ 回滚完成: 旧记录审计字段已重置为 NULL（测试奖品不恢复）')
  }
}
