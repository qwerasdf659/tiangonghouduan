'use strict'

/**
 * 审核链系统 — 清理不一致的历史审核数据
 *
 * 决策 #3：彻底清理
 *
 * 清理逻辑：
 * 1. content_review_records 中 auditable_type='consumption' AND audit_status='pending'
 *    且 auditable_id 在 consumption_records 中不存在或状态不是 pending → 标记为 cancelled
 * 2. 同理处理 merchant_points
 *
 * @migration 20260310100002
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // 1. 清理 consumption 类型的不一致记录
      const [consumptionResults] = await queryInterface.sequelize.query(`
        UPDATE content_review_records crr
        SET crr.audit_status = 'cancelled',
            crr.audit_reason = '数据清理: content_review_record与consumption_record状态不一致（2026-03-10审核链上线前清理）',
            crr.audited_at = NOW(),
            crr.updated_at = NOW()
        WHERE crr.auditable_type = 'consumption'
          AND crr.audit_status = 'pending'
          AND (
            crr.auditable_id NOT IN (SELECT consumption_record_id FROM consumption_records)
            OR crr.auditable_id IN (SELECT consumption_record_id FROM consumption_records WHERE status != 'pending')
          )
      `, { transaction })

      const consumptionCleaned = consumptionResults?.affectedRows || 0
      console.log(`🧹 消费审核记录清理: ${consumptionCleaned} 条不一致记录已标记为 cancelled`)

      // 2. 清理 merchant_points 类型的不一致记录（防御性清理）
      const [merchantResults] = await queryInterface.sequelize.query(`
        UPDATE content_review_records crr
        SET crr.audit_status = 'cancelled',
            crr.audit_reason = '数据清理: merchant_points审核记录不一致（2026-03-10审核链上线前清理）',
            crr.audited_at = NOW(),
            crr.updated_at = NOW()
        WHERE crr.auditable_type = 'merchant_points'
          AND crr.audit_status = 'pending'
          AND crr.created_at < '2026-03-01'
      `, { transaction })

      const merchantCleaned = merchantResults?.affectedRows || 0
      console.log(`🧹 商家积分审核记录清理: ${merchantCleaned} 条不一致记录已标记为 cancelled`)

      await transaction.commit()
      console.log(`✅ 历史审核数据清理完成: 消费=${consumptionCleaned}, 商家积分=${merchantCleaned}`)
    } catch (err) {
      await transaction.rollback()
      throw err
    }
  },

  async down() {
    console.log('⚠️ 数据清理迁移不可回滚（记录已标记为cancelled，不影响业务）')
  }
}
