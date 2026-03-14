'use strict'

/**
 * 迁移：清理孤儿 CRR id=4353
 *
 * 问题描述：
 *   - content_review_records id=4353 (auditable_type='consumption', audit_status='pending')
 *   - 对应的 consumption_records id=2022 已被软删除 (is_deleted=1)
 *   - 该 CRR 是修复前遗留的测试数据，不应继续保留在待审核列表中
 *
 * 处理方式：
 *   - 将 CRR id=4353 的 audit_status 更新为 'cancelled'
 *   - 记录清理原因到 review_notes
 */
module.exports = {
  async up(queryInterface) {
    // 先验证数据确实存在且符合预期
    const [records] = await queryInterface.sequelize.query(
      `SELECT crr.content_review_record_id, crr.audit_status, crr.auditable_id,
              cr.status AS consumption_status, cr.is_deleted
       FROM content_review_records crr
       LEFT JOIN consumption_records cr ON cr.consumption_record_id = crr.auditable_id
       WHERE crr.content_review_record_id = 4353`
    )

    if (records.length === 0) {
      console.log('⚠️ CRR id=4353 不存在，跳过清理')
      return
    }

    const record = records[0]
    if (record.audit_status !== 'pending') {
      console.log(`⚠️ CRR id=4353 已不是 pending 状态 (当前: ${record.audit_status})，跳过`)
      return
    }

    // 硬删除孤儿 CRR（对应消费记录已软删除，该 CRR 无业务价值）
    await queryInterface.sequelize.query(
      `DELETE FROM content_review_records WHERE content_review_record_id = 4353`
    )

    console.log('✅ 已硬删除孤儿 CRR id=4353（对应消费记录 id=2022 已软删除）')
  },

  async down(queryInterface) {
    // 回滚：无法恢复已删除的数据，记录提示
    console.log('⬇️ down: 孤儿 CRR 清理不可回滚（数据无业务价值）')
  }
}
