/**
 * 数据库迁移：为活动压力策略和BxPx矩阵策略添加活动级开关
 *
 * 业务背景：
 *   活动压力（pressure）和 BxPx 矩阵（matrix）原来是固定启用的，
 *   运营无法按活动单独关闭。本迁移在 lottery_strategy_config 表新增：
 *   - pressure.enabled：关闭后固定返回 P0，压力乘数恒为 1.0
 *   - matrix.enabled：关闭后直接返回原始权重，所有乘数恒为 1.0
 *
 * 为所有 active/paused 状态的活动插入默认值（true = 保持现有行为不变）
 *
 * @see docs/抽奖策略与算法全览.md 决策5
 */
'use strict'

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* 获取所有需要配置的活动 */
      const [campaigns] = await queryInterface.sequelize.query(
        "SELECT lottery_campaign_id FROM lottery_campaigns WHERE status IN ('active', 'paused')",
        { transaction }
      )

      console.log(`  📋 为 ${campaigns.length} 个活动添加策略开关...`)

      for (const campaign of campaigns) {
        const cid = campaign.lottery_campaign_id

        /* 检查 pressure.enabled 是否已存在 */
        const [existP] = await queryInterface.sequelize.query(
          `SELECT lottery_strategy_config_id FROM lottery_strategy_config 
           WHERE lottery_campaign_id = ${cid} AND config_group = 'pressure' AND config_key = 'enabled'`,
          { transaction }
        )

        if (existP.length === 0) {
          await queryInterface.sequelize.query(
            `INSERT INTO lottery_strategy_config 
             (lottery_campaign_id, config_group, config_key, config_value, value_type, is_active, priority, created_by, updated_by, created_at, updated_at)
             VALUES (${cid}, 'pressure', 'enabled', 'true', 'boolean', 1, 10, 1, 1, NOW(), NOW())`,
            { transaction }
          )
          console.log(`    ✅ 活动${cid}: pressure.enabled = true`)
        }

        /* 检查 matrix.enabled 是否已存在 */
        const [existM] = await queryInterface.sequelize.query(
          `SELECT lottery_strategy_config_id FROM lottery_strategy_config 
           WHERE lottery_campaign_id = ${cid} AND config_group = 'matrix' AND config_key = 'enabled'`,
          { transaction }
        )

        if (existM.length === 0) {
          await queryInterface.sequelize.query(
            `INSERT INTO lottery_strategy_config 
             (lottery_campaign_id, config_group, config_key, config_value, value_type, is_active, priority, created_by, updated_by, created_at, updated_at)
             VALUES (${cid}, 'matrix', 'enabled', 'true', 'boolean', 1, 10, 1, 1, NOW(), NOW())`,
            { transaction }
          )
          console.log(`    ✅ 活动${cid}: matrix.enabled = true`)
        }
      }

      await transaction.commit()
      console.log('  ✅ 策略开关迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('  ❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.sequelize.query(
        "DELETE FROM lottery_strategy_config WHERE config_group = 'pressure' AND config_key = 'enabled'",
        { transaction }
      )
      await queryInterface.sequelize.query(
        "DELETE FROM lottery_strategy_config WHERE config_group = 'matrix' AND config_key = 'enabled'",
        { transaction }
      )
      await transaction.commit()
      console.log('  ✅ 策略开关已回滚')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
