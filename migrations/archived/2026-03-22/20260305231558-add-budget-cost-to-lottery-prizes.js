'use strict'

/**
 * 迁移：lottery_prizes 表新增 budget_cost 字段
 *
 * 业务背景：
 * prize_value_points（pvp）原本被"一值三用"——同时承担分层阈值标记、资格过滤判据、配额扣减金额。
 * 新增 budget_cost 字段后职责分离：
 *   - pvp：仅用于 BudgetTierCalculator 的档位准入计算（分层阈值标记）
 *   - budget_cost：用于 BuildPrizePoolStage 的资格过滤 和 SettleStage 的配额扣减
 *
 * 回填规则：
 *   - 传统奖品（material_asset_code IS NULL）：budget_cost = pvp（当前数量均为 1，值一致）
 *   - DIAMOND 奖品：budget_cost = 0（走 DIAMOND_QUOTA 独立通道，不消耗 BUDGET_POINTS）
 *   - 保底奖品（is_fallback=1）：budget_cost = 0（保底不消耗预算）
 *   - 碎片奖品：由运营创建时后端自动计算 material_amount × budget_value_points
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. 新增 budget_cost 字段，放在 prize_value_points 之后
    await queryInterface.addColumn('lottery_prizes', 'budget_cost', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '奖品总预算成本（过滤+扣减用），pvp 仅管分层阈值',
      after: 'prize_value_points'
    })

    // 2. 回填：传统奖品 budget_cost = pvp（当前数量均为 1，值一致）
    await queryInterface.sequelize.query(
      `UPDATE lottery_prizes
       SET budget_cost = prize_value_points
       WHERE (material_asset_code IS NULL OR material_asset_code = '')
         AND is_fallback = 0`
    )

    // 3. 回填：DIAMOND 奖品 budget_cost = 0（走 DIAMOND_QUOTA 独立通道）
    await queryInterface.sequelize.query(
      `UPDATE lottery_prizes SET budget_cost = 0 WHERE material_asset_code = 'DIAMOND'`
    )

    // 4. 回填：保底奖品 budget_cost = 0（保底不消耗预算）
    await queryInterface.sequelize.query(
      'UPDATE lottery_prizes SET budget_cost = 0 WHERE is_fallback = 1'
    )
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('lottery_prizes', 'budget_cost')
  }
}
