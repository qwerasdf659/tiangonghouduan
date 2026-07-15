'use strict'

/**
 * 存量清理: 删除 c2c_marketplace_enabled 开关 + 收窄 budget_tier 枚举（技术债务方案 五.4 / 3.3，2026-07-11）
 *
 * 背景:
 * 1. c2c_marketplace_enabled（is_enabled=0）：C2C 市场服务与表已物理删除，
 *    读取该开关的代码已全部清零（2026-07-11 grep 复核），feature_flags 存量行为死配置；
 * 2. lottery_tier_matrix_config.budget_tier 枚举含 B0/B1/B2/B3 旧档位「保留供回滚」，
 *    Pressure Tier 重构后 budget_tier 固定为 'ALL'（直连库核对：数据仅 ALL 一种值），
 *    原定「下次 squash 收窄」——本次 squash 前置执行。
 *
 * 变更内容:
 * 1. DELETE feature_flags 中 flag_key='c2c_marketplace_enabled' 的行
 * 2. budget_tier 枚举由 (B0,B1,B2,B3,ALL) 收窄为 (ALL)
 *
 * 回滚: 重建 flag 行（is_enabled=0）与旧枚举。
 */

module.exports = {
  async up(queryInterface) {
    const [deleted] = await queryInterface.sequelize.query(
      "DELETE FROM feature_flags WHERE flag_key = 'c2c_marketplace_enabled'"
    )
    console.log(`✅ feature_flags.c2c_marketplace_enabled 死配置已删除（${deleted.affectedRows} 行）`)

    // 前置校验：确认 budget_tier 无 B0-B3 存量
    const [rows] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) AS legacy_count FROM lottery_tier_matrix_config WHERE budget_tier != 'ALL'"
    )
    if (rows[0].legacy_count > 0) {
      throw new Error(
        `lottery_tier_matrix_config 存在 ${rows[0].legacy_count} 条非 ALL 的 budget_tier 记录，需先确认再收窄枚举`
      )
    }
    await queryInterface.sequelize.query(
      "ALTER TABLE lottery_tier_matrix_config MODIFY COLUMN budget_tier ENUM('ALL') NOT NULL DEFAULT 'ALL' COMMENT '预算档位（Pressure Tier 重构后固定 ALL，矩阵仅按 pressure_tier 维度配置）'"
    )
    console.log('✅ lottery_tier_matrix_config.budget_tier 枚举已收窄为 (ALL)')
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO feature_flags (flag_key, flag_name, is_enabled, description, created_at, updated_at)
      VALUES ('c2c_marketplace_enabled', 'C2C交易市场', 0, 'C2C 交易市场总开关（已下线）', NOW(), NOW())
      ON DUPLICATE KEY UPDATE is_enabled = 0
    `)
    await queryInterface.sequelize.query(
      "ALTER TABLE lottery_tier_matrix_config MODIFY COLUMN budget_tier ENUM('B0','B1','B2','B3','ALL') NOT NULL DEFAULT 'ALL' COMMENT '预算档位'"
    )
    console.log('⏪ c2c flag 与 budget_tier 旧枚举已恢复')
  }
}
