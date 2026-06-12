'use strict'

/**
 * 数据清理：硬删除孤儿审核链实例 414（trade_dispute 测试残留）
 *
 * 创建时间: 2026-06-13 北京时间
 * 背景（直连真实库 restaurant_points_dev 核对）:
 * - approval_chain_instances#414（auditable_type=trade_dispute, auditable_id=1）是 2026-06-01 的测试残留：
 *   ① trade_disputes 表为空（0 行），auditable_id=1 指向的纠纷记录根本不存在；
 *   ② content_review_record_id 为 NULL（无审核记录闭环）；
 *   ③ 无任何 trade_disputes 行的 approval_chain_instance_id 指向它；
 *   ④ 其唯一步骤 step_id=414 从未被审核（actioned_by=NULL）。
 * - 即它是一条不挂任何真实业务的孤儿实例。按项目规则"孤儿数据硬删除"清理，而非保留/升级。
 *
 * 删除范围（按外键顺序：先步骤后实例，再清理松散引用的通知）:
 * - approval_chain_steps WHERE instance_id=414（FK fk_acs_instance，必须先删）
 * - approval_chain_instances WHERE instance_id=414
 * - admin_notifications WHERE source_type='approval_chain' AND source_id=414（5 条孤儿通知，无外键约束）
 *
 * 幂等: 以 instance_id=414 + 校验 trade_disputes 仍为空为前提；若实例已不存在则跳过。
 * 回滚: 测试残留数据，硬删除后不恢复（down 为安全空实现，不重建孤儿数据）。
 */

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction()
    try {
      // 安全校验：仅当 414 确为孤儿（trade_disputes 表无对应记录）才删除
      const [inst] = await queryInterface.sequelize.query(
        "SELECT instance_id, auditable_id, content_review_record_id FROM approval_chain_instances WHERE instance_id = 414 AND auditable_type = 'trade_dispute'",
        { transaction: t }
      )
      if (!inst.length) {
        await t.commit()
        return
      }
      const [dispute] = await queryInterface.sequelize.query(
        'SELECT trade_dispute_id FROM trade_disputes WHERE trade_dispute_id = :aid LIMIT 1',
        { replacements: { aid: inst[0].auditable_id }, transaction: t }
      )
      if (dispute.length) {
        // 对应纠纷真实存在 → 不是孤儿，安全起见不删除
        await t.commit()
        return
      }

      await queryInterface.sequelize.query(
        'DELETE FROM approval_chain_steps WHERE instance_id = 414',
        { transaction: t }
      )
      await queryInterface.sequelize.query(
        'DELETE FROM approval_chain_instances WHERE instance_id = 414',
        { transaction: t }
      )
      await queryInterface.sequelize.query(
        "DELETE FROM admin_notifications WHERE source_type = 'approval_chain' AND source_id = 414",
        { transaction: t }
      )
      await t.commit()
    } catch (e) {
      await t.rollback()
      throw e
    }
  },

  async down() {
    // 孤儿测试数据硬删除，不重建
  }
}
