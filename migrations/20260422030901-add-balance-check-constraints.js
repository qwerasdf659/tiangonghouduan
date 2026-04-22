'use strict'

/**
 * 迁移：为 account_asset_balances 添加 CHECK 约束
 *
 * 业务背景：
 * - frozen_amount 和 available_amount 出现负值是数据一致性问题
 * - SYSTEM_MINT 账户的 available_amount 允许为负（表示已铸造总量）
 * - 其他账户的 frozen_amount 必须 >= 0
 *
 * 注意：MySQL 8.0.16+ 才支持 CHECK 约束
 */
module.exports = {
  async up(queryInterface) {
    // 添加 frozen_amount >= 0 的 CHECK 约束
    await queryInterface.sequelize.query(`
      ALTER TABLE account_asset_balances
      ADD CONSTRAINT chk_frozen_amount_non_negative
      CHECK (frozen_amount >= 0)
    `)

    // available_amount 不加 CHECK，因为 SYSTEM_MINT 账户允许负值
    // 业务层通过 BalanceService 控制非铸币账户的余额不为负
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE account_asset_balances
      DROP CONSTRAINT chk_frozen_amount_non_negative
    `)
  }
}
