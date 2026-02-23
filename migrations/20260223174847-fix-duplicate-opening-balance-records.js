'use strict'

/**
 * 修复重复 opening_balance 记录（D2-2/D2-3）
 *
 * 根因：opening_balance 迁移脚本在 2/22 和 2/23 各执行了一次，
 * 导致 34 个 (account_id, asset_code) 组合有 2-3 份重复的 opening_balance 记录。
 * 全局 SUM(delta_amount) 被膨胀到 2-3 倍实际余额，造成：
 *   - 全局资产守恒不通过（7 个资产 SUM≠0）
 *   - 余额与流水不一致（12 个账户）
 *
 * 修复策略：
 * 1. 每个 (account_id, asset_code) 只保留最早一条 opening_balance，删除其余
 * 2. 同步删除对应的 opening_balance_counterpart 重复记录
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [results] = await queryInterface.sequelize.query(
      `SELECT account_id, asset_code, COUNT(*) as cnt,
              MIN(asset_transaction_id) as keep_id
       FROM asset_transactions
       WHERE business_type = 'opening_balance'
       GROUP BY account_id, asset_code
       HAVING cnt > 1`
    )

    if (results.length === 0) {
      console.log('✅ 无重复 opening_balance 记录，跳过')
      return
    }

    console.log(`发现 ${results.length} 组重复 opening_balance 记录，开始清理...`)

    let totalDeleted = 0

    for (const row of results) {
      const [deleted] = await queryInterface.sequelize.query(
        `DELETE FROM asset_transactions
         WHERE business_type = 'opening_balance'
           AND account_id = :accountId
           AND asset_code = :assetCode
           AND asset_transaction_id != :keepId`,
        {
          replacements: {
            accountId: row.account_id,
            assetCode: row.asset_code,
            keepId: row.keep_id
          }
        }
      )

      const deletedCount = deleted.affectedRows || 0
      totalDeleted += deletedCount

      console.log(
        `  account=${row.account_id} asset=${row.asset_code}: 保留 id=${row.keep_id}, 删除 ${deletedCount} 条重复`
      )
    }

    // 清理对应的 counterpart 重复记录
    const [cpResults] = await queryInterface.sequelize.query(
      `SELECT account_id, asset_code, COUNT(*) as cnt,
              MIN(asset_transaction_id) as keep_id
       FROM asset_transactions
       WHERE business_type = 'opening_balance_counterpart'
       GROUP BY account_id, asset_code
       HAVING cnt > 1`
    )

    let cpDeleted = 0
    for (const row of cpResults) {
      const [deleted] = await queryInterface.sequelize.query(
        `DELETE FROM asset_transactions
         WHERE business_type = 'opening_balance_counterpart'
           AND account_id = :accountId
           AND asset_code = :assetCode
           AND asset_transaction_id != :keepId`,
        {
          replacements: {
            accountId: row.account_id,
            assetCode: row.asset_code,
            keepId: row.keep_id
          }
        }
      )
      cpDeleted += (deleted.affectedRows || 0)
    }

    console.log(`✅ 清理完成: 删除 ${totalDeleted} 条重复 opening_balance + ${cpDeleted} 条 counterpart`)

    // 验证：重新检查全局守恒
    const [verification] = await queryInterface.sequelize.query(
      `SELECT asset_code, CAST(SUM(delta_amount) AS SIGNED) as global_sum
       FROM asset_transactions
       WHERE COALESCE(is_invalid, 0) = 0
       GROUP BY asset_code`
    )

    console.log('清理后全局守恒检查:')
    verification.forEach(r => {
      const status = parseInt(r.global_sum) === 0 ? '✅' : '⚠️'
      console.log(`  ${status} ${r.asset_code}: SUM=${r.global_sum}`)
    })
  },

  async down(queryInterface, Sequelize) {
    console.log('⚠️ 此迁移为数据修复，无法自动回滚（需从备份恢复）')
  }
}
