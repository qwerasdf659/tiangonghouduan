'use strict'

/**
 * 修复用户间（peer-to-peer）交易的 counterpart 记录双重计算问题
 *
 * 问题：
 * - 用户↔系统操作（抽奖、兑换等）：需要 counterpart 记录实现双录守恒
 * - 用户↔用户操作（交易结算）：freeze→settle→credit 链路已天然平衡，
 *   额外的 counterpart 记录导致同一笔钱被记录两次（双重计算）
 *
 * 判断规则：
 * - counterpart 记录的 account_id 指向用户账户（account_type='user'）→ 属于 peer-to-peer → 删除
 * - counterpart 记录的 account_id 指向系统账户（account_type='system'）→ 属于 user-system → 保留
 *
 * 守恒公式：SUM(delta_amount) GROUP BY asset_code = 0（排除 is_invalid）
 * - 用户↔系统：user(-X) + system_counterpart(+X) = 0 ✓
 * - 用户↔用户：buyer_freeze(-X) + settle(0) + seller_credit(+net) + fee(+fee) = 0 ✓
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 查找并删除用户间的 counterpart 记录
      // 规则：counterpart 记录的 account_id 是用户账户（非系统账户）
      const [result] = await queryInterface.sequelize.query(`
        SELECT at.asset_transaction_id, at.business_type, at.asset_code,
          CAST(at.delta_amount AS CHAR) as delta_amount
        FROM asset_transactions at
        JOIN accounts a ON a.account_id = at.account_id
        WHERE at.business_type LIKE '%_counterpart'
          AND a.account_type = 'user'
      `, { transaction })

      console.log(`📊 发现 ${result.length} 条用户间 counterpart 记录（将被删除）`)

      if (result.length > 0) {
        // 统计将被删除的记录
        const typeCount = {}
        for (const r of result) {
          typeCount[r.business_type] = (typeCount[r.business_type] || 0) + 1
        }
        for (const [type, count] of Object.entries(typeCount)) {
          console.log(`  ${type}: ${count} 条`)
        }

        // 批量删除
        await queryInterface.sequelize.query(`
          DELETE at FROM asset_transactions at
          JOIN accounts a ON a.account_id = at.account_id
          WHERE at.business_type LIKE '%_counterpart'
            AND a.account_type = 'user'
        `, { transaction })

        console.log(`✅ 已删除 ${result.length} 条用户间 counterpart 记录`)
      }

      // 同时删除 is_invalid=1 的 counterpart 记录（溢出数据的 counterpart）
      const [, invalidMeta] = await queryInterface.sequelize.query(`
        DELETE FROM asset_transactions
        WHERE business_type LIKE '%_counterpart'
          AND is_invalid = 1
      `, { transaction })
      if (invalidMeta?.affectedRows > 0) {
        console.log(`✅ 已删除 ${invalidMeta.affectedRows} 条 is_invalid counterpart 记录`)
      }

      await transaction.commit()
      console.log('✅ peer-to-peer counterpart 清理完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down() {
    console.log('⚠️ 此迁移不可自动回滚（counterpart 记录需要重新生成）')
    console.log('如需回滚，请重新执行 20260223101921-backfill-missing-counterpart-records')
  }
}
