'use strict'

/**
 * 迁移：清理孤儿消费审核链实例（历史测试数据残留）
 *
 * 背景（2026-06-12 消费审核收口审核链后排查发现）：
 *   存在 118 个 auditable_type='consumption'、status='in_progress' 的审核链实例，
 *   但其 auditable_id 指向的 consumption_records 记录已不存在（历史测试数据被删，实例未级联清理）。
 *   这些实例永远卡在 pending step，无业务价值，属孤儿数据。
 *
 * 清理范围（严格限定，绝不误删有效数据）：
 *   - 仅清理"消费类型 + in_progress + 对应消费记录不存在"的实例
 *   - 关联 approval_chain_steps 由外键 ON DELETE CASCADE 自动删除
 *   - 关联 content_review_records（同样指向不存在的消费记录）一并清理
 *   - 不动：消费记录仍存在的实例（如 517/518）、非消费类型实例（trade_dispute 等）
 *
 * 删除策略：孤儿数据硬删除（符合项目规则）
 * 版本：V4.1.2
 * 创建时间：2026-06-12（北京时间）
 */

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      // 1. 锁定孤儿实例 ID（消费类型 + in_progress + 对应消费记录不存在）
      const [orphanInstances] = await sequelize.query(
        `SELECT i.instance_id, i.content_review_record_id
           FROM approval_chain_instances i
           LEFT JOIN consumption_records cr
             ON cr.consumption_record_id = i.auditable_id
          WHERE i.auditable_type = 'consumption'
            AND i.status = 'in_progress'
            AND cr.consumption_record_id IS NULL`,
        { transaction }
      )

      if (orphanInstances.length === 0) {
        console.log('  ℹ️ 无孤儿消费审核链实例，跳过')
        await transaction.commit()
        return
      }

      const instanceIds = orphanInstances.map(r => r.instance_id)
      const reviewIds = orphanInstances.map(r => r.content_review_record_id).filter(Boolean)
      console.log(`  🔍 命中孤儿审核链实例 ${instanceIds.length} 个`)

      // 2. 删除孤儿实例（approval_chain_steps 经 ON DELETE CASCADE 自动删除）
      const [, instMeta] = await sequelize.query(
        `DELETE FROM approval_chain_instances WHERE instance_id IN (:instanceIds)`,
        { replacements: { instanceIds }, transaction }
      )
      console.log(`  ✅ 已删除审核链实例 ${instMeta?.affectedRows ?? instanceIds.length} 个（含级联步骤）`)

      // 3. 删除孤立的 content_review_records（再次校验其 auditable 消费记录确实不存在）
      if (reviewIds.length > 0) {
        const [, crMeta] = await sequelize.query(
          `DELETE crr FROM content_review_records crr
             LEFT JOIN consumption_records cr
               ON cr.consumption_record_id = crr.auditable_id
            WHERE crr.content_review_record_id IN (:reviewIds)
              AND crr.auditable_type = 'consumption'
              AND cr.consumption_record_id IS NULL`,
          { replacements: { reviewIds }, transaction }
        )
        console.log(`  ✅ 已删除孤立审核记录 ${crMeta?.affectedRows ?? 0} 条`)
      }

      await transaction.commit()
      console.log('  🎉 孤儿消费审核链清理完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down() {
    /*
     * 不可逆：被清理的是"对应消费记录已不存在"的孤儿审核链实例与审核记录，
     * 无业务价值且无法重建关联，故 down 不做恢复（符合孤儿数据硬删除策略）。
     */
    console.log('  ⚠️ 本迁移清理的是孤儿数据，不可逆，down 无操作')
  }
}
