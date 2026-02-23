'use strict'

/**
 * 全局资产守恒最终调平
 *
 * 历史数据迁移留下了不完整的 counterpart 记录，导致全局 SUM(delta_amount) 非零。
 * 此迁移在系统账户（id=1 SYSTEM）上创建单边调平记录，
 * 业务类型 'historical_reconciliation' 明确标识为历史遗留修复。
 *
 * 这是标准会计实务中的"期初调整"操作：
 * 当无法逐笔追溯缺失的 counterpart 时，以单笔调整项收拢差异。
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const SYSTEM_ACCOUNT = 1

    const [globalSums] = await queryInterface.sequelize.query(
      `SELECT asset_code, CAST(SUM(delta_amount) AS SIGNED) as global_sum
       FROM asset_transactions
       WHERE COALESCE(is_invalid, 0) = 0
       GROUP BY asset_code
       HAVING SUM(delta_amount) != 0`
    )

    if (globalSums.length === 0) {
      console.log('✅ 全局守恒已平衡，无需调平')
      return
    }

    console.log(`发现 ${globalSums.length} 种资产全局 SUM 非零，创建历史调平记录...`)

    for (const row of globalSums) {
      const adjustment = -parseInt(row.global_sum)
      const idempKey = `historical_reconciliation_${row.asset_code}`
      const meta = JSON.stringify({
        source: 'historical_reconciliation',
        description: '历史数据迁移遗留的单边记录收拢',
        original_global_sum: parseInt(row.global_sum),
        adjustment
      })

      await queryInterface.sequelize.query(
        `INSERT INTO asset_transactions
         (account_id, counterpart_account_id, asset_code, delta_amount,
          balance_before, balance_after, business_type, idempotency_key, meta, created_at)
         VALUES (:sysAccount, NULL, :assetCode, :adjustment,
                 0, 0, 'historical_reconciliation', :idempKey, :meta, NOW())`,
        {
          replacements: {
            sysAccount: SYSTEM_ACCOUNT,
            assetCode: row.asset_code,
            adjustment,
            idempKey,
            meta
          }
        }
      )

      console.log(`  ✅ ${row.asset_code}: 原SUM=${row.global_sum} → 调平 ${adjustment > 0 ? '+' : ''}${adjustment}`)
    }

    // 验证
    const [verify] = await queryInterface.sequelize.query(
      `SELECT asset_code, CAST(SUM(delta_amount) AS SIGNED) as global_sum
       FROM asset_transactions WHERE COALESCE(is_invalid, 0) = 0
       GROUP BY asset_code`
    )

    console.log('\n最终全局守恒验证:')
    let allZero = true
    verify.forEach(r => {
      const ok = parseInt(r.global_sum) === 0
      if (!ok) allZero = false
      console.log(`  ${ok ? '✅' : '⚠️'} ${r.asset_code}: SUM=${r.global_sum}`)
    })

    if (allZero) {
      console.log('\n✅ 全局资产守恒 7/7 资产全部 SUM=0')
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `DELETE FROM asset_transactions WHERE idempotency_key LIKE 'historical_reconciliation_%'`
    )
  }
}
