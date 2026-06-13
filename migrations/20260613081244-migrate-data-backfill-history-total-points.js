'use strict'

/**
 * 数据回填：按资产流水重算 users.history_total_points（历史累计获得积分）
 *
 * 创建时间: 2026-06-13 北京时间
 *
 * 背景（直连真实库 restaurant_points_dev 核对）:
 * - users.history_total_points 是「臻选空间解锁(≥10万门槛)」与「成长等级派生」的单一数据源。
 * - 历史上该字段无任何业务代码维护（LotteryUserService.updateHistoryTotalPoints 为从未被调用的死代码），
 *   导致字段长期停留在种子初始值，与用户真实累计获得的积分严重不符。
 *   实测：测试账号(user_id=32) 余额 121878、正向流水累计 132108，而 history_total_points 仅 1082。
 *
 * 本次治理（方案B：写时增量维护 + 一次性回填）:
 * - BalanceService.changeBalance（积分变动唯一写收口）已改为：用户账户 + points + 正向入账时，
 *   在同一事务内原子累加 history_total_points（后续新增自动维护，无同步债）。
 * - 本迁移负责回填存量：以 asset_transactions 为权威账本，按「用户账户 + points + 正向变动」
 *   求和重算每个用户的累计获得，覆盖写回 users.history_total_points。
 *
 * 口径（与会员等级行业通用语义一致，业主已确认）:
 * - 统计所有正向积分入账之和（含 admin_adjustment 运营发放），消费(负向)不扣减，单调只增。
 * - 仅统计 account_type='user' 的账户；系统账户(铸币/销毁/托管等)不计入用户累计。
 *
 * 幂等性: up 为「按账本重算后覆盖写入」，可安全重复执行（结果稳定）。
 * 回滚: down 为安全空实现（历史脏值无保留价值，不予恢复）。
 */

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction()
    try {
      // 以资产流水为权威账本，按用户账户聚合 points 正向入账之和
      const [rows] = await queryInterface.sequelize.query(
        `SELECT a.user_id AS user_id,
                COALESCE(SUM(CASE WHEN tx.delta_amount > 0 THEN tx.delta_amount ELSE 0 END), 0) AS earned
         FROM asset_transactions tx
         JOIN accounts a ON a.account_id = tx.account_id
         WHERE a.account_type = 'user'
           AND a.user_id IS NOT NULL
           AND tx.asset_code = 'points'
         GROUP BY a.user_id`,
        { transaction: t }
      )

      let updated = 0
      for (const row of rows) {
        const earned = Number(row.earned) || 0
        // eslint-disable-next-line no-await-in-loop
        const [, meta] = await queryInterface.sequelize.query(
          `UPDATE users SET history_total_points = :earned
           WHERE user_id = :user_id AND history_total_points <> :earned`,
          { replacements: { earned, user_id: row.user_id }, transaction: t }
        )
        if (meta && (meta.affectedRows || meta.rowCount)) updated += 1
      }

      // eslint-disable-next-line no-console
      console.log(
        `[migrate] history_total_points 回填完成：扫描用户 ${rows.length} 个，实际修正 ${updated} 个`
      )
      await t.commit()
    } catch (e) {
      await t.rollback()
      throw e
    }
  },

  async down() {
    // 历史脏值无保留价值，不予恢复（回填结果可由 up 幂等重算）
  }
}
