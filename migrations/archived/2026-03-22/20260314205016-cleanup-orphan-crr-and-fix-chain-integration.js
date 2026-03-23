'use strict'

/**
 * 迁移：清理孤儿审核记录 + 确保审核链端到端集成
 *
 * 修复内容：
 * 1. 硬删除 consumption 类型的孤儿 CRR（auditable_id 指向不存在的 consumption_record）
 * 2. 为 content_review_records 添加外键约束验证说明
 *
 * 根因分析：
 * CoreService.merchantSubmitConsumption() 原先直接创建 CRR，
 * 已改为通过 ContentAuditEngine.submitForAudit() 统一创建，
 * 后者在同一事务内同时匹配审核链模板并创建实例。
 *
 * @see services/consumption/CoreService.js - merchantSubmitConsumption()
 * @see services/ContentAuditEngine.js - submitForAudit()
 */
module.exports = {
  async up(queryInterface) {
    // 1. 查询并记录要删除的孤儿 CRR（便于审计追踪）
    const [orphanRecords] = await queryInterface.sequelize.query(`
      SELECT crr.content_review_record_id, crr.auditable_id, crr.created_at
      FROM content_review_records crr
      LEFT JOIN consumption_records cr ON crr.auditable_id = cr.consumption_record_id
      WHERE crr.auditable_type = 'consumption'
        AND crr.audit_status = 'pending'
        AND cr.consumption_record_id IS NULL
    `)

    if (orphanRecords.length > 0) {
      const orphanIds = orphanRecords.map(r => r.content_review_record_id)
      console.log(
        `[迁移] 发现 ${orphanRecords.length} 条孤儿 CRR，准备硬删除: IDs=[${orphanIds.join(',')}]`
      )

      // 2. 硬删除孤儿 CRR
      await queryInterface.sequelize.query(
        `DELETE FROM content_review_records WHERE content_review_record_id IN (:ids)`,
        { replacements: { ids: orphanIds } }
      )

      console.log(`[迁移] 已硬删除 ${orphanRecords.length} 条孤儿 CRR`)
    } else {
      console.log('[迁移] 未发现孤儿 CRR，无需清理')
    }

    // 3. 验证清理结果
    const [remaining] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count
      FROM content_review_records crr
      LEFT JOIN consumption_records cr ON crr.auditable_id = cr.consumption_record_id
      WHERE crr.auditable_type = 'consumption'
        AND cr.consumption_record_id IS NULL
    `)
    console.log(`[迁移] 验证：剩余孤儿 CRR 数量 = ${remaining[0].count}`)
  },

  async down() {
    console.log('[迁移] 回滚说明：孤儿 CRR 为无效数据，不可恢复（已记录原始ID供审计）')
  }
}
