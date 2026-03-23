'use strict'

/**
 * 迁移：清理全部历史孤儿审核记录
 *
 * 修复内容：
 * 硬删除 consumption 类型中 auditable_id 引用了不存在的 consumption_record 的所有 CRR，
 * 包括 cancelled(445)、rejected(5)、approved(4) 三种状态，合计约 454 条。
 *
 * 产生原因：
 * 2026-01-09 ~ 2026-03-07 期间，CoreService.merchantSubmitConsumption() 直接创建 CRR
 * 与 ConsumptionRecord 在事务一致性上存在缺陷，导致 CRR 指向已不存在的消费记录。
 *
 * 前序迁移: 20260314205016 已清理 6 条 pending 孤儿
 * 本次迁移: 清理剩余全部非 pending 历史孤儿
 *
 * @see services/consumption/CoreService.js - merchantSubmitConsumption()（已修复）
 */
module.exports = {
  async up(queryInterface) {
    // 1. 统计待清理数量
    const [countResult] = await queryInterface.sequelize.query(`
      SELECT crr.audit_status, COUNT(*) as count
      FROM content_review_records crr
      LEFT JOIN consumption_records cr ON crr.auditable_id = cr.consumption_record_id
      WHERE crr.auditable_type = 'consumption'
        AND cr.consumption_record_id IS NULL
      GROUP BY crr.audit_status
    `)

    const totalCount = countResult.reduce((sum, r) => sum + parseInt(r.count), 0)

    if (totalCount === 0) {
      console.log('[迁移] 无历史孤儿 CRR，无需清理')
      return
    }

    console.log(`[迁移] 发现 ${totalCount} 条历史孤儿 CRR:`)
    countResult.forEach(r => console.log(`  ${r.audit_status}: ${r.count} 条`))

    // 2. 记录要删除的 ID 列表（审计追踪）
    const [orphanIds] = await queryInterface.sequelize.query(`
      SELECT crr.content_review_record_id
      FROM content_review_records crr
      LEFT JOIN consumption_records cr ON crr.auditable_id = cr.consumption_record_id
      WHERE crr.auditable_type = 'consumption'
        AND cr.consumption_record_id IS NULL
    `)

    const ids = orphanIds.map(r => r.content_review_record_id)
    console.log(`[迁移] 准备硬删除 ${ids.length} 条记录，ID范围: ${Math.min(...ids)}~${Math.max(...ids)}`)

    // 3. 分批删除（每批100条，避免长事务锁表）
    const batchSize = 100
    let deletedTotal = 0
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize)
      await queryInterface.sequelize.query(
        `DELETE FROM content_review_records WHERE content_review_record_id IN (:ids)`,
        { replacements: { ids: batch } }
      )
      deletedTotal += batch.length
      console.log(`[迁移] 已删除 ${deletedTotal}/${ids.length} 条`)
    }

    // 4. 验证
    const [remaining] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count
      FROM content_review_records crr
      LEFT JOIN consumption_records cr ON crr.auditable_id = cr.consumption_record_id
      WHERE crr.auditable_type = 'consumption'
        AND cr.consumption_record_id IS NULL
    `)
    console.log(`[迁移] 验证：剩余 consumption 类型孤儿 CRR = ${remaining[0].count}`)
  },

  async down() {
    console.log('[迁移] 回滚说明：历史孤儿 CRR 为无效数据，不可恢复')
  }
}
