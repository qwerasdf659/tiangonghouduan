'use strict'

/**
 * 审核链分级配置补齐（trade_dispute 分级 + merchant_points 大额链）
 *
 * 创建时间: 2026-06-13 北京时间
 * 创建原因（审核链"当事人审自己"·路线A 分级 + 商家积分按金额分级，已拍板）:
 *
 * 1) trade_dispute（交易纠纷仲裁，模板8）当前是"单级 admin 终审"。
 *    补一个 step_number=3 的"业务经理初审"节点（business_manager lv60，role_id=7），
 *    形成"业务经理初审(lv60) → admin终审(lv100)"两级链，与大额消费链（模板6）体系一致。
 *    当事人即使持 admin，也得先过一个他不属于的 lv60 初审环节。
 *
 * 2) merchant_points（商家积分）当前只有默认单级链（模板7）。
 *    新增"商家积分大额链"模板（merchant_points_large，priority=10，match_conditions={min_amount:1000}）：
 *    申请积分 ≥1000 命中两级链（业务经理初审 → admin终审），<1000 走默认单级链。
 *    阈值 1000、初审角色 business_manager(lv60) 均已拍板。
 *    ⚠️ 配套代码改动（本迁移不含）：ApprovalChainService._matchConditions 需支持读 points_amount，
 *       否则金额字段名对不上（consumption 传 consumption_amount、merchant_points 传 points_amount），
 *       大额申请不会命中大额链。该改动在 Service 层完成。
 *
 * 角色 role_id 实测：admin=2(lv100)、business_manager=7(lv60)。
 * exclude_parties 默认 1（回避制对所有新节点生效）。
 * 字符集: 随表 utf8mb4_unicode_ci。
 * 回滚: 删除新增的 merchant_points_large 模板及其节点 + trade_dispute 初审节点，模板8 total_nodes 还原为 1。
 */

module.exports = {
  async up(queryInterface) {
    const now = new Date()
    const t = await queryInterface.sequelize.transaction()
    try {
      // ===== 1) trade_dispute（模板8）补"业务经理初审"节点（step_number=3）=====
      const [existInitial] = await queryInterface.sequelize.query(
        "SELECT node_id FROM approval_chain_nodes WHERE template_id = 8 AND step_number = 3 LIMIT 1",
        { transaction: t }
      )
      if (!existInitial.length) {
        await queryInterface.bulkInsert(
          'approval_chain_nodes',
          [
            {
              template_id: 8,
              step_number: 3,
              node_name: '业务经理初审（交易纠纷）',
              assignee_type: 'role',
              assignee_role_id: 7, // business_manager(lv60)
              assignee_user_id: null,
              is_final: 0,
              auto_approve_enabled: 0,
              timeout_hours: 12,
              timeout_action: 'escalate',
              exclude_parties: 1,
              sort_order: 0,
              created_at: now,
              updated_at: now
            }
          ],
          { transaction: t }
        )
        // 模板8 总节点数 1 → 2
        await queryInterface.sequelize.query(
          "UPDATE approval_chain_templates SET total_nodes = 2, description = '交易纠纷仲裁审核链（2级：业务经理初审→admin终审）', updated_at = :now WHERE template_id = 8",
          { replacements: { now }, transaction: t }
        )
      }

      // ===== 2) 新增"商家积分大额链"模板 + 2 节点 =====
      const [existLarge] = await queryInterface.sequelize.query(
        "SELECT template_id FROM approval_chain_templates WHERE template_code = 'merchant_points_large' LIMIT 1",
        { transaction: t }
      )
      if (!existLarge.length) {
        await queryInterface.bulkInsert(
          'approval_chain_templates',
          [
            {
              template_code: 'merchant_points_large',
              template_name: '商家积分审核-大额链',
              auditable_type: 'merchant_points',
              description: '商家积分申请≥1000的审核链（2级：业务经理初审→admin终审）',
              total_nodes: 2,
              is_active: 1,
              priority: 10,
              match_conditions: JSON.stringify({ min_amount: 1000 }),
              created_at: now,
              updated_at: now
            }
          ],
          { transaction: t }
        )
        const [newTpl] = await queryInterface.sequelize.query(
          "SELECT template_id FROM approval_chain_templates WHERE template_code = 'merchant_points_large' LIMIT 1",
          { transaction: t }
        )
        const tplId = newTpl[0].template_id
        await queryInterface.bulkInsert(
          'approval_chain_nodes',
          [
            {
              template_id: tplId,
              step_number: 3,
              node_name: '业务经理初审（商家积分大额）',
              assignee_type: 'role',
              assignee_role_id: 7, // business_manager(lv60)
              assignee_user_id: null,
              is_final: 0,
              auto_approve_enabled: 0,
              timeout_hours: 12,
              timeout_action: 'escalate',
              exclude_parties: 1,
              sort_order: 0,
              created_at: now,
              updated_at: now
            },
            {
              template_id: tplId,
              step_number: 9,
              node_name: '管理员终审（商家积分大额）',
              assignee_type: 'role',
              assignee_role_id: 2, // admin(lv100)
              assignee_user_id: null,
              is_final: 1,
              auto_approve_enabled: 0,
              timeout_hours: 12,
              timeout_action: 'notify',
              exclude_parties: 1,
              sort_order: 1,
              created_at: now,
              updated_at: now
            }
          ],
          { transaction: t }
        )
      }

      await t.commit()
    } catch (e) {
      await t.rollback()
      throw e
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction()
    try {
      // 回滚 merchant_points_large 模板及其节点
      const [tpl] = await queryInterface.sequelize.query(
        "SELECT template_id FROM approval_chain_templates WHERE template_code = 'merchant_points_large' LIMIT 1",
        { transaction: t }
      )
      if (tpl.length) {
        const tplId = tpl[0].template_id
        await queryInterface.sequelize.query(
          'DELETE FROM approval_chain_nodes WHERE template_id = :tplId',
          { replacements: { tplId }, transaction: t }
        )
        await queryInterface.sequelize.query(
          'DELETE FROM approval_chain_templates WHERE template_id = :tplId',
          { replacements: { tplId }, transaction: t }
        )
      }
      // 回滚 trade_dispute 初审节点，模板8 还原单级
      await queryInterface.sequelize.query(
        "DELETE FROM approval_chain_nodes WHERE template_id = 8 AND step_number = 3"
      )
      await queryInterface.sequelize.query(
        "UPDATE approval_chain_templates SET total_nodes = 1, description = '交易纠纷仲裁-默认链（1级admin终审）' WHERE template_id = 8",
        { transaction: t }
      )
      await t.commit()
    } catch (e) {
      await t.rollback()
      throw e
    }
  }
}
