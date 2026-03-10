'use strict'

/**
 * 审核链系统 — 初始化默认模板和节点配置
 *
 * 决策 #2：同时 Seed 单级+多级配置
 * 决策 #6：初审使用 business_manager(role_id=102) 兼任
 *
 * 配置清单：
 *   1. consumption_default — 消费审核默认链（1级，admin终审），priority=0 兜底
 *   2. consumption_large   — 消费审核大额链（2级，business_manager初审 → admin终审），priority=10
 *   3. merchant_points_default — 商家积分审核默认链（1级，admin终审），priority=0
 *
 * @migration 20260310100001
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      const now = new Date()

      // ========== 模板 1: consumption_default ==========
      await queryInterface.sequelize.query(`
        INSERT INTO approval_chain_templates
          (template_code, template_name, auditable_type, description, total_nodes, is_active, priority, match_conditions, created_at, updated_at)
        VALUES
          ('consumption_default', '消费审核-默认链', 'consumption', '所有消费记录的默认审核链（1级admin终审），兜底配置', 1, 1, 0, '{}', :now, :now)
      `, { replacements: { now }, transaction })

      const [[{ template_id: t1Id }]] = await queryInterface.sequelize.query(
        `SELECT template_id FROM approval_chain_templates WHERE template_code = 'consumption_default'`,
        { transaction }
      )

      // 节点：步骤9=admin终审
      await queryInterface.sequelize.query(`
        INSERT INTO approval_chain_nodes
          (template_id, step_number, node_name, assignee_type, assignee_role_id, is_final, timeout_hours, timeout_action, sort_order, created_at, updated_at)
        VALUES
          (:template_id, 9, '管理员终审', 'role', 2, 1, 12, 'notify', 1, :now, :now)
      `, { replacements: { template_id: t1Id, now }, transaction })

      // ========== 模板 2: consumption_large ==========
      await queryInterface.sequelize.query(`
        INSERT INTO approval_chain_templates
          (template_code, template_name, auditable_type, description, total_nodes, is_active, priority, match_conditions, created_at, updated_at)
        VALUES
          ('consumption_large', '消费审核-大额链', 'consumption', '消费金额≥200元的审核链（2级：业务经理初审→admin终审）', 2, 1, 10, '{"min_amount": 200}', :now, :now)
      `, { replacements: { now }, transaction })

      const [[{ template_id: t2Id }]] = await queryInterface.sequelize.query(
        `SELECT template_id FROM approval_chain_templates WHERE template_code = 'consumption_large'`,
        { transaction }
      )

      // 节点1：步骤3=business_manager初审（实际 role_id=7, role_level=60）
      await queryInterface.sequelize.query(`
        INSERT INTO approval_chain_nodes
          (template_id, step_number, node_name, assignee_type, assignee_role_id, is_final, timeout_hours, timeout_action, sort_order, created_at, updated_at)
        VALUES
          (:template_id, 3, '业务经理初审', 'role', 7, 0, 12, 'escalate', 1, :now, :now)
      `, { replacements: { template_id: t2Id, now }, transaction })

      // 节点2：步骤9=admin终审
      await queryInterface.sequelize.query(`
        INSERT INTO approval_chain_nodes
          (template_id, step_number, node_name, assignee_type, assignee_role_id, is_final, timeout_hours, timeout_action, sort_order, created_at, updated_at)
        VALUES
          (:template_id, 9, '管理员终审', 'role', 2, 1, 12, 'notify', 2, :now, :now)
      `, { replacements: { template_id: t2Id, now }, transaction })

      // ========== 模板 3: merchant_points_default ==========
      await queryInterface.sequelize.query(`
        INSERT INTO approval_chain_templates
          (template_code, template_name, auditable_type, description, total_nodes, is_active, priority, match_conditions, created_at, updated_at)
        VALUES
          ('merchant_points_default', '商家积分审核-默认链', 'merchant_points', '商家积分申请的默认审核链（1级admin终审）', 1, 1, 0, '{}', :now, :now)
      `, { replacements: { now }, transaction })

      const [[{ template_id: t3Id }]] = await queryInterface.sequelize.query(
        `SELECT template_id FROM approval_chain_templates WHERE template_code = 'merchant_points_default'`,
        { transaction }
      )

      await queryInterface.sequelize.query(`
        INSERT INTO approval_chain_nodes
          (template_id, step_number, node_name, assignee_type, assignee_role_id, is_final, timeout_hours, timeout_action, sort_order, created_at, updated_at)
        VALUES
          (:template_id, 9, '管理员终审', 'role', 2, 1, 12, 'notify', 1, :now, :now)
      `, { replacements: { template_id: t3Id, now }, transaction })

      await transaction.commit()
      console.log('✅ 审核链默认模板和节点配置 Seed 完成（3个模板，4个节点）')
    } catch (err) {
      await transaction.rollback()
      throw err
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.sequelize.query(
        `DELETE FROM approval_chain_nodes WHERE template_id IN (SELECT template_id FROM approval_chain_templates WHERE template_code IN ('consumption_default','consumption_large','merchant_points_default'))`,
        { transaction }
      )
      await queryInterface.sequelize.query(
        `DELETE FROM approval_chain_templates WHERE template_code IN ('consumption_default','consumption_large','merchant_points_default')`,
        { transaction }
      )
      await transaction.commit()
    } catch (err) {
      await transaction.rollback()
      throw err
    }
  }
}
