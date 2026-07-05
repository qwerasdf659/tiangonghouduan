'use strict'

/**
 * 数据订正：red_core_gem.budget_value_points 0 → 10（D-9 / 水晶奖品倍率活动设计方案 §22.8）
 *
 * 业务背景：
 * - 全色系预算价值锚点规律为「每色系 gem = shard × 10」
 *   （orange 10/100、yellow 20/200、green 40/400、blue 80/800、purple 160/1600）。
 * - 唯 red 破例：red_core_shard=1、red_core_gem=0，形态更高反而更便宜，业务不成立。
 * - 定性为「数据漏填」，按规律订正 red_core_gem.budget_value_points = red_shard(1) × 10 = 10。
 *
 * 订正后所有 16 条水晶 budget_value_points 均非零且符合 ×10 规律，
 * 水晶奖品倍率的成本折算（extra_cost = (final-base) × budget_value_points）对全部色系统一有效。
 *
 * ⚠️ 本迁移仅订正数据，不改表结构；事务化 up/down，可回滚。
 */

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      // 仅在仍为漏填值 0 时订正，幂等安全（重复执行不会覆盖运营后续调整）
      await sequelize.query(
        `UPDATE material_asset_types
            SET budget_value_points = 10, updated_at = NOW()
          WHERE asset_code = 'red_core_gem' AND budget_value_points = 0`,
        { transaction }
      )

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
      // 回滚为原漏填值 0（保持可逆）
      await sequelize.query(
        `UPDATE material_asset_types
            SET budget_value_points = 0, updated_at = NOW()
          WHERE asset_code = 'red_core_gem'`,
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
