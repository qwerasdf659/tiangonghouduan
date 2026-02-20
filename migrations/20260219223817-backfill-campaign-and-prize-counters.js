'use strict'

/**
 * 数据回填迁移：修复活动计数器和奖品计数器
 *
 * 问题根因：
 * SettleStage 原实现中遗漏了 lottery_campaigns.total_draws / total_prizes_awarded
 * 和 lottery_prizes.total_win_count 的原子递增操作，导致这些计数器始终为 0。
 *
 * 修复内容：
 * 1. 从 lottery_draws 真实数据回填 lottery_campaigns 的 total_draws / total_prizes_awarded
 * 2. 从 lottery_draws 真实数据回填 lottery_prizes 的 total_win_count
 *
 * @module migrations/20260219223817-backfill-campaign-and-prize-counters
 */
module.exports = {
  async up(queryInterface) {
    // 1. 回填活动计数器：total_draws 和 total_prizes_awarded
    await queryInterface.sequelize.query(`
      UPDATE lottery_campaigns c
      INNER JOIN (
        SELECT lottery_campaign_id,
               COUNT(*) AS actual_draws,
               COUNT(lottery_prize_id) AS actual_prizes
        FROM lottery_draws
        GROUP BY lottery_campaign_id
      ) d ON c.lottery_campaign_id = d.lottery_campaign_id
      SET c.total_draws = d.actual_draws,
          c.total_prizes_awarded = d.actual_prizes,
          c.updated_at = NOW()
    `)

    // 2. 回填奖品计数器：total_win_count
    await queryInterface.sequelize.query(`
      UPDATE lottery_prizes p
      INNER JOIN (
        SELECT lottery_prize_id,
               COUNT(*) AS actual_wins
        FROM lottery_draws
        GROUP BY lottery_prize_id
      ) d ON p.lottery_prize_id = d.lottery_prize_id
      SET p.total_win_count = d.actual_wins,
          p.updated_at = NOW()
    `)
  },

  async down(queryInterface) {
    // 回滚：将计数器重置为 0（仅用于开发环境回退）
    await queryInterface.sequelize.query(`
      UPDATE lottery_campaigns SET total_draws = 0, total_prizes_awarded = 0
    `)
    await queryInterface.sequelize.query(`
      UPDATE lottery_prizes SET total_win_count = 0
    `)
  }
}
