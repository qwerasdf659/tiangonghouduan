'use strict'

/**
 * 抽奖策略活动级开关 + 活动1数据修正
 *
 * Phase 1（数据修正）：
 * 1. 修正活动1 high 档位奖品权重（1,090,000 → 1,000,000）
 * 2. 修正活动1 mid 档位奖品权重（600,000 → 1,000,000）
 * 3. 删除活动1测试遗留奖品「测试奖品_验证后删除」（lottery_prize_id=151）
 * 4. 为活动1指定 tier_fallback_lottery_prize_id = 119（参与有礼）
 * 5. 修正活动1 max_draws_per_user_daily 从 99 改为 3
 *
 * Phase 2（策略开关）：
 * 6. 在 lottery_strategy_config 表插入 pressure_tier.enabled 配置（默认 true）
 * 7. 在 lottery_strategy_config 表插入 matrix.enabled 配置（默认 true）
 *
 * @see docs/抽奖策略与算法全览.md 决策5
 */
module.exports = {
  async up(queryInterface, _Sequelize) {
    /* ========== Phase 1：修正活动1奖品权重 ========== */

    /**
     * 1. high 档位：总和 1,090,000 → 1,000,000
     *    最大权重奖品「500积分券」(id=6) 从 700,000 减至 610,000
     *    差额：700,000 - 610,000 = 90,000 = 1,090,000 - 1,000,000 ✓
     */
    await queryInterface.sequelize.query(
      `UPDATE lottery_prizes
       SET win_weight = 610000
       WHERE lottery_prize_id = 6
         AND lottery_campaign_id = 1
         AND win_weight = 700000`
    )

    /**
     * 2. mid 档位：总和 600,000 → 1,000,000（按原始比例等比放大）
     *    甜品1份 (id=3):    350,000 / 600,000 × 1,000,000 = 583,333 → 583,000
     *    精品首饰 (id=7):    150,000 / 600,000 × 1,000,000 = 250,000
     *    生腌拼盘158 (id=8): 100,000 / 600,000 × 1,000,000 = 166,667 → 167,000
     *    验证：583,000 + 250,000 + 167,000 = 1,000,000 ✓
     */
    await queryInterface.sequelize.query(
      `UPDATE lottery_prizes SET win_weight = 583000
       WHERE lottery_prize_id = 3 AND lottery_campaign_id = 1 AND win_weight = 350000`
    )
    await queryInterface.sequelize.query(
      `UPDATE lottery_prizes SET win_weight = 250000
       WHERE lottery_prize_id = 7 AND lottery_campaign_id = 1 AND win_weight = 150000`
    )
    await queryInterface.sequelize.query(
      `UPDATE lottery_prizes SET win_weight = 167000
       WHERE lottery_prize_id = 8 AND lottery_campaign_id = 1 AND win_weight = 100000`
    )

    /**
     * 3. 删除测试遗留奖品「测试奖品_验证后删除」
     *    该奖品导致 low 档位权重总和 1,050,000（超出 1,000,000）
     *    删除后 low 档位恢复为 1,000,000
     */
    await queryInterface.sequelize.query(
      `DELETE FROM lottery_prizes
       WHERE lottery_prize_id = 151
         AND lottery_campaign_id = 1
         AND prize_name = '测试奖品_验证后删除'`
    )

    /* ========== Phase 1：修正活动1配置字段 ========== */

    /**
     * 4. 指定档位降级保底奖品 = 参与有礼 (id=119, is_fallback=true, reward_tier=low)
     * 5. 每日抽奖次数从测试值 99 改为运营值 3
     */
    await queryInterface.sequelize.query(
      `UPDATE lottery_campaigns
       SET tier_fallback_lottery_prize_id = 119,
           max_draws_per_user_daily = 3
       WHERE lottery_campaign_id = 1`
    )

    /* ========== Phase 2：添加策略活动级开关 ========== */

    /**
     * 6. 活动压力策略开关：pressure_tier.enabled
     *    关闭后 PressureTierCalculator 固定返回 P0，乘数恒为 1.0
     */
    const [existPressure] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as cnt FROM lottery_strategy_config
       WHERE lottery_campaign_id = 1 AND config_group = 'pressure_tier' AND config_key = 'enabled'`
    )
    if (Number(existPressure[0].cnt) === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO lottery_strategy_config
          (lottery_campaign_id, config_group, config_key, config_value, value_type, is_active, priority, created_at, updated_at)
         VALUES
          (1, 'pressure_tier', 'enabled', 'true', 'boolean', 1, 0, NOW(), NOW())`
      )
    }

    /**
     * 7. BxPx矩阵策略开关：matrix.enabled
     *    关闭后 computeWeightAdjustment() 直接返回原始权重，所有乘数恒为 1.0
     */
    const [existMatrix] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as cnt FROM lottery_strategy_config
       WHERE lottery_campaign_id = 1 AND config_group = 'matrix' AND config_key = 'enabled'`
    )
    if (Number(existMatrix[0].cnt) === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO lottery_strategy_config
          (lottery_campaign_id, config_group, config_key, config_value, value_type, is_active, priority, created_at, updated_at)
         VALUES
          (1, 'matrix', 'enabled', 'true', 'boolean', 1, 0, NOW(), NOW())`
      )
    }
  },

  async down(queryInterface, _Sequelize) {
    /* 恢复 high 档位 500积分券权重 */
    await queryInterface.sequelize.query(
      `UPDATE lottery_prizes SET win_weight = 700000
       WHERE lottery_prize_id = 6 AND lottery_campaign_id = 1 AND win_weight = 610000`
    )

    /* 恢复 mid 档位权重 */
    await queryInterface.sequelize.query(
      `UPDATE lottery_prizes SET win_weight = 350000
       WHERE lottery_prize_id = 3 AND lottery_campaign_id = 1 AND win_weight = 583000`
    )
    await queryInterface.sequelize.query(
      `UPDATE lottery_prizes SET win_weight = 150000
       WHERE lottery_prize_id = 7 AND lottery_campaign_id = 1 AND win_weight = 250000`
    )
    await queryInterface.sequelize.query(
      `UPDATE lottery_prizes SET win_weight = 100000
       WHERE lottery_prize_id = 8 AND lottery_campaign_id = 1 AND win_weight = 167000`
    )

    /* 恢复活动1配置 */
    await queryInterface.sequelize.query(
      `UPDATE lottery_campaigns
       SET tier_fallback_lottery_prize_id = NULL,
           max_draws_per_user_daily = 99
       WHERE lottery_campaign_id = 1`
    )

    /* 删除策略开关配置 */
    await queryInterface.sequelize.query(
      `DELETE FROM lottery_strategy_config
       WHERE lottery_campaign_id = 1
         AND config_group = 'pressure_tier' AND config_key = 'enabled'`
    )
    await queryInterface.sequelize.query(
      `DELETE FROM lottery_strategy_config
       WHERE lottery_campaign_id = 1
         AND config_group = 'matrix' AND config_key = 'enabled'`
    )
  }
}
