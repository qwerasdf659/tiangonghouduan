'use strict'

/**
 * 添加余额非负 CHECK 约束
 *
 * 业务背景：account_asset_balances 表的 frozen_amount 和 available_amount
 * 不应出现负值（负值意味着资产系统出现了不一致）
 *
 * 前置条件：现有负值数据已通过业务接口修正（见 docs/_snapshots/pre-cleanup-2026-04-22.json）
 *
 * @see 文档 7.13/7.18 决策：DB 层守卫
 */
module.exports = {
  async up(queryInterface) {
    // 先将现有负值归零（这些是历史脏数据，已备份到 docs/_snapshots/）
    await queryInterface.sequelize.query(
      'UPDATE account_asset_balances SET available_amount = 0 WHERE available_amount < 0'
    )
    await queryInterface.sequelize.query(
      'UPDATE account_asset_balances SET frozen_amount = 0 WHERE frozen_amount < 0'
    )

    // 添加 CHECK 约束
    await queryInterface.sequelize.query(
      'ALTER TABLE account_asset_balances ADD CONSTRAINT chk_frozen_non_negative CHECK (frozen_amount >= 0)'
    )
    await queryInterface.sequelize.query(
      'ALTER TABLE account_asset_balances ADD CONSTRAINT chk_available_non_negative CHECK (available_amount >= 0)'
    )
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE account_asset_balances DROP CONSTRAINT chk_frozen_non_negative'
    ).catch(() => {})
    await queryInterface.sequelize.query(
      'ALTER TABLE account_asset_balances DROP CONSTRAINT chk_available_non_negative'
    ).catch(() => {})
  }
}
