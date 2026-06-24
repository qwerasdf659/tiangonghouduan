'use strict'

/**
 * 消费审核链重配：店员提交 → 店长审 → 管理员终审（2026-06-25）
 *
 * 业务背景（详见 docs/消费审核链重配方案-店员提交店长审管理员终审.md）：
 * - 原消费默认链（template_id=5）只有单节点「管理员终审」(role=admin)，缺店长审核环节；
 *   原大额链（template_id=6，min_amount=200）为「业务经理初审 → 管理员终审」。
 * - 业务目标（已拍板）：所有消费统一走「店长审本店 → 管理员终审」两级，删除大额链（金额不再分级）。
 *
 * 本迁移动作（仅改 consumption 审核链，不动 merchant_points 模板7/9）：
 * 1) 模板5 新增「店长审核」节点（assignee_type='submitter_manager'，按提交人门店动态派在职店长，审本店）；
 *    原「管理员终审」节点保持为终审，调整 sort_order/step_number 使店长节点在前。
 * 2) 停用模板6大额链（is_active=0）：消费金额不再分级，全部走模板5两级链。
 *    （模板6 现有 4 条实例均为 completed，无进行中实例；停用不影响历史，仅不再新匹配。）
 *
 * 设计依据（直读 ApprovalChainService 真实逻辑）：
 * - submitter_manager 节点不预置 assignee_*，由 store_id + store_staff 动态反查在职 manager（谁的店谁审）；
 * - exclude_parties=1 当事人回避（店长不能审自己提交的单）；
 * - admin(lv≥100) 仍可兜底越级审任意节点（留痕）。
 *
 * 数据现状（连真实库 restaurant_points_dev 核实）：
 * - 模板5：node_id=5「管理员终审」role=2(admin) sort_order=1 step_number=9 is_final=1。
 * - 模板6：is_active=1，min_amount=200，4 条 completed 实例。
 *
 * ⚠️ step_number 语义（直读 ApprovalChainService.createChainInstance 核实）：
 *   审核节点筛选条件是 step_number > 1（step_number=1 为「提交位」会被排除）。
 *   故审核节点的 step_number 必须 ≥ 2（对照模板6/7/9 用的是 3/9）。
 *   本迁移：店长审核 step_number=2，管理员终审 step_number=3（均为审核位，会被正确纳入流程）。
 *
 * 进行中实例不受影响：步骤 assignee 在创建实例时已固化到 approval_chain_steps，
 * 节点变更只影响"新建实例"（见 ApprovalChainService.createInstance）。
 */

const CONSUMPTION_DEFAULT_TEMPLATE_ID = 5
const CONSUMPTION_LARGE_TEMPLATE_ID = 6

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      /*
       * 1. 模板5：把原「管理员终审」节点排到第 2 步（终审在后），
       *    在其前插入「店长审核」节点（submitter_manager）。
       *    step_number：店长=2、管理员终审=3（均 > 1，确保被 createChainInstance 纳入审核流程）；
       *    sort_order：店长=0、管理员终审=1（决定同模板内的展示/推进顺序）。
       */
      // 1.1 原管理员终审节点：step_number=3、sort_order=1，保持 is_final=1 终审
      await sequelize.query(
        `UPDATE approval_chain_nodes
           SET step_number = 3, sort_order = 1, is_final = 1, node_name = '管理员终审',
               updated_at = NOW()
         WHERE template_id = :tpl AND assignee_type = 'role' AND assignee_role_id = 2`,
        { replacements: { tpl: CONSUMPTION_DEFAULT_TEMPLATE_ID }, transaction }
      )

      // 1.2 幂等：若店长节点已存在则不重复插入
      const [existManager] = await sequelize.query(
        `SELECT node_id FROM approval_chain_nodes
          WHERE template_id = :tpl AND assignee_type = 'submitter_manager'`,
        { replacements: { tpl: CONSUMPTION_DEFAULT_TEMPLATE_ID }, transaction }
      )

      if (existManager.length === 0) {
        await sequelize.query(
          `INSERT INTO approval_chain_nodes
             (template_id, step_number, node_name, assignee_type, assignee_role_id, assignee_user_id,
              is_final, approve_mode, required_approvals, exclude_parties,
              auto_approve_enabled, timeout_hours, timeout_action, sort_order, created_at, updated_at)
           VALUES
             (:tpl, 2, '店长审核', 'submitter_manager', NULL, NULL,
              0, 'single', 1, 1,
              0, 12, 'notify', 0, NOW(), NOW())`,
          { replacements: { tpl: CONSUMPTION_DEFAULT_TEMPLATE_ID }, transaction }
        )
      }

      // 2. 停用模板6大额链（金额不再分级，全部走模板5两级链）
      await sequelize.query(
        `UPDATE approval_chain_templates
            SET is_active = 0, updated_at = NOW()
          WHERE template_id = :tpl`,
        { replacements: { tpl: CONSUMPTION_LARGE_TEMPLATE_ID }, transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      // 回滚 1：删除店长审核节点
      await sequelize.query(
        `DELETE FROM approval_chain_nodes
          WHERE template_id = :tpl AND assignee_type = 'submitter_manager'`,
        { replacements: { tpl: CONSUMPTION_DEFAULT_TEMPLATE_ID }, transaction }
      )

      // 回滚 2：管理员终审节点恢复为单节点（step_number=9, sort_order=1，与原始一致）
      await sequelize.query(
        `UPDATE approval_chain_nodes
            SET step_number = 9, sort_order = 1, is_final = 1, node_name = '管理员终审',
                updated_at = NOW()
          WHERE template_id = :tpl AND assignee_type = 'role' AND assignee_role_id = 2`,
        { replacements: { tpl: CONSUMPTION_DEFAULT_TEMPLATE_ID }, transaction }
      )

      // 回滚 3：重新启用模板6大额链
      await sequelize.query(
        `UPDATE approval_chain_templates
            SET is_active = 1, updated_at = NOW()
          WHERE template_id = :tpl`,
        { replacements: { tpl: CONSUMPTION_LARGE_TEMPLATE_ID }, transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
