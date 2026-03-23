'use strict'

/**
 * 修复资产守恒异常
 *
 * 问题7: 多种资产的SUM(delta_amount)!=0，违反双录记账守恒性
 * 根因: data_migration/opening_balance/test_* 等操作的贷方和借方不等额
 *
 * 修复方案: 为每种不平衡的资产创建一笔系统平衡调整交易
 * 将差额写入 SYSTEM_RESERVE 账户（系统储备金账户），使全局净额归零
 */

module.exports = {
  up: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 查询所有不平衡的资产
      const [imbalances] = await queryInterface.sequelize.query(
        'SELECT asset_code, SUM(delta_amount) as net FROM asset_transactions GROUP BY asset_code HAVING SUM(delta_amount) != 0',
        { transaction }
      )

      if (imbalances.length === 0) {
        console.log('✅ 资产守恒正常，无需修复')
        await transaction.commit()
        return
      }

      // 获取 SYSTEM_RESERVE 账户
      const [reserveAccounts] = await queryInterface.sequelize.query(
        "SELECT account_id FROM accounts WHERE system_code = 'SYSTEM_RESERVE' LIMIT 1",
        { transaction }
      )

      let reserveAccountId
      if (reserveAccounts.length === 0) {
        console.log('⚠️ SYSTEM_RESERVE 账户不存在，使用 SYSTEM_MINT 账户')
        const [mintAccounts] = await queryInterface.sequelize.query(
          "SELECT account_id FROM accounts WHERE system_code = 'SYSTEM_MINT' LIMIT 1",
          { transaction }
        )
        reserveAccountId = mintAccounts[0]?.account_id
      } else {
        reserveAccountId = reserveAccounts[0].account_id
      }

      if (!reserveAccountId) {
        throw new Error('无法找到系统账户用于平衡调整')
      }

      // 为每种不平衡的资产创建一笔补偿交易
      for (const { asset_code, net } of imbalances) {
        const netAmount = Number(net)
        const compensationAmount = -netAmount

        await queryInterface.sequelize.query(
          `INSERT INTO asset_transactions (
            account_id, asset_code, delta_amount, balance_after, 
            business_type, idempotency_key, meta, created_at
          ) VALUES (
            :account_id, :asset_code, :delta_amount, 0,
            'system_conservation_fix', :idempotency_key, :meta, NOW()
          )`,
          {
            replacements: {
              account_id: reserveAccountId,
              asset_code,
              delta_amount: compensationAmount,
              idempotency_key: `conservation_fix_${asset_code}_20260320`,
              meta: JSON.stringify({
                reason: '资产守恒修复：补偿data_migration/opening_balance/test_*操作的双录不对称',
                original_net: netAmount,
                compensation: compensationAmount,
                fix_date: '2026-03-20'
              })
            },
            transaction
          }
        )

        console.log(`  ${asset_code}: 净额 ${netAmount} → 补偿 ${compensationAmount}`)
      }

      console.log(`✅ 资产守恒修复完成: ${imbalances.length} 种资产已平衡`)

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 资产守恒修复失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      "DELETE FROM asset_transactions WHERE business_type = 'system_conservation_fix' AND idempotency_key LIKE 'conservation_fix_%_20260320'"
    )
  }
}
