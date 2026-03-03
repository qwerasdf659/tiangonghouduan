'use strict'

/**
 * D9: 删除 lottery_strategy_config 表中所有 budget_tier 静态阈值配置
 *
 * 业务背景：
 * - 三层修复（A+B+C）落地后，阈值 100% 由 BudgetTierCalculator._calculateDynamicThresholds()
 *   从奖品 prize_value_points 动态推导，与美团/阿里全自动方案一致
 * - DB 中 config_group='budget_tier' 的 threshold_high/mid/low 不再有任何代码路径读取
 * - 保留这些行只会误导维护者，形成技术债务
 *
 * 影响范围：删除 4 个 campaign × 3 个阈值 = 12 行
 *
 * @see docs/抽奖活动奖品数量配置方案.md D9 决定项
 */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as cnt FROM lottery_strategy_config
       WHERE config_group = 'budget_tier'
         AND config_key IN ('threshold_high', 'threshold_mid', 'threshold_low')`
    )
    const count = existing[0]?.cnt || 0
    console.log(`[D9] 找到 ${count} 行 budget_tier 静态阈值配置，准备删除...`)

    if (count > 0) {
      await queryInterface.sequelize.query(
        `DELETE FROM lottery_strategy_config
         WHERE config_group = 'budget_tier'
           AND config_key IN ('threshold_high', 'threshold_mid', 'threshold_low')`
      )
      console.log(`[D9] 已删除 ${count} 行 budget_tier 静态阈值配置`)
    }
  },

  async down(queryInterface, _Sequelize) {
    const [campaigns] = await queryInterface.sequelize.query(
      'SELECT DISTINCT lottery_campaign_id FROM lottery_strategy_config ORDER BY lottery_campaign_id'
    )

    for (const { lottery_campaign_id } of campaigns) {
      const rows = [
        { config_key: 'threshold_high', config_value: '1000', description: 'B3 阈值（已废弃：三层修复后由奖品数据动态推导）' },
        { config_key: 'threshold_mid', config_value: '500', description: 'B2 阈值（已废弃）' },
        { config_key: 'threshold_low', config_value: '100', description: 'B1 阈值（已废弃）' }
      ]

      for (const row of rows) {
        await queryInterface.sequelize.query(
          `INSERT IGNORE INTO lottery_strategy_config
           (lottery_campaign_id, config_group, config_key, config_value, value_type, description, is_active, priority, created_at, updated_at)
           VALUES (?, 'budget_tier', ?, ?, 'number', ?, 1, 0, NOW(), NOW())`,
          { replacements: [lottery_campaign_id, row.config_key, row.config_value, row.description] }
        )
      }
    }
    console.log('[D9 rollback] 已恢复 budget_tier 静态阈值配置')
  }
}
