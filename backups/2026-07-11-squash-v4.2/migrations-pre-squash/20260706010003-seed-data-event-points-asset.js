'use strict'

/**
 * 新增「活动代币」资产 event_points（水晶奖品倍率活动设计方案 §18.2 / D-6 / §12.7）
 *
 * 双层货币模型的可见层（入场券）：
 * - 短期限时翻倍活动期间发放的活动专属可见代币，只能在对应活动内抽奖，到期清零。
 * - 按 lottery_campaign_id 分桶复用 account_asset_balances（同 budget_points 分桶范式），
 *   一种 event_points 服务所有活动，不为每个活动新造货币类型（避免货币泛滥）。
 *
 * 归类（求证真实库后校准 C4）：
 * - 新增独立资产分组 event（group_type=system），语义清晰，与全局 points/budget_points 区隔。
 * - form=quota（受限，不可自由交易）、is_tradable=0、is_biddable=0、is_enabled=1（须启用才能参与余额/展示）。
 * - budget_value_points 置 NULL（活动代币是"入场券"，不参与水晶成本折算口径）。
 *
 * 事务化 up/down，幂等安全（重复执行不会重复插入）。
 */

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      // 1. 新增资产分组 event（若不存在）
      const [groupRows] = await sequelize.query(
        `SELECT group_code FROM asset_group_defs WHERE group_code = 'event'`,
        { transaction }
      )
      if (groupRows.length === 0) {
        await sequelize.query(
          `INSERT INTO asset_group_defs
             (group_code, display_name, description, group_type, color_hex, sort_order, is_enabled, is_tradable, created_at, updated_at)
           VALUES
             ('event', '活动代币', '活动专属可见代币（限时翻倍活动入场券，按活动分桶、到期清零）', 'system', '#FF5722', 3, 1, 0, NOW(), NOW())`,
          { transaction }
        )
      }

      // 2. 新增 event_points 资产类型（若不存在）
      const [assetRows] = await sequelize.query(
        `SELECT asset_code FROM material_asset_types WHERE asset_code = 'event_points'`,
        { transaction }
      )
      if (assetRows.length === 0) {
        await sequelize.query(
          `INSERT INTO material_asset_types
             (asset_code, display_name, group_code, form, tier, sort_order,
              visible_value_points, budget_value_points, is_enabled, is_tradable, is_biddable, merchant_id, created_at, updated_at)
           VALUES
             ('event_points', '活动积分', 'event', 'quota', 1, 99,
              NULL, NULL, 1, 0, 0, NULL, NOW(), NOW())`,
          { transaction }
        )
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      await sequelize.query(
        `DELETE FROM material_asset_types WHERE asset_code = 'event_points'`,
        { transaction }
      )
      await sequelize.query(`DELETE FROM asset_group_defs WHERE group_code = 'event'`, {
        transaction
      })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
