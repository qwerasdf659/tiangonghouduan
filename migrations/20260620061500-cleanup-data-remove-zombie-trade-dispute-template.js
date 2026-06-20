'use strict'

/**
 * 数据清理：删除僵尸审核链模板 trade_dispute_default（交易纠纷-默认链）
 *
 * 创建时间: 2026-06-20 北京时间
 *
 * 背景（直连真实库 restaurant_points_dev 核对）:
 * - 审核链引擎 ContentAuditEngine 的 validTypes 仅支持
 *   ['exchange','feedback','consumption','merchant_points']，不含 trade_dispute。
 * - 交易纠纷走独立的 TradeDisputeService，不经审核链，故 auditable_type='trade_dispute'
 *   的审核链模板永远不会被任何业务触发，属僵尸配置。
 * - 实测：trade_dispute 模板 1 条（template_id=8, code=trade_dispute_default），
 *   其下 2 个节点（node_id 11/12），审核链实例 0 条、content_review_records 0 条，
 *   从未被使用，可安全硬删（孤儿配置数据按硬删处理）。
 * - 前端审核链页面"业务类型"下拉的 trade_dispute 脏选项已于 2026-06-20 移除。
 *
 * 清理逻辑（按 auditable_type 定位，避免硬编码 template_id）:
 * 1. 先删该模板下的节点（approval_chain_nodes）
 * 2. 再删模板本身（approval_chain_templates）
 * 幂等：无 trade_dispute 模板时不报错。
 *
 * 回滚: down 为安全空实现（僵尸数据不恢复）。
 */

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction()
    try {
      // 定位所有 trade_dispute 模板ID（理论上仅 1 条，用集合兜底）
      const [tpls] = await queryInterface.sequelize.query(
        "SELECT template_id FROM approval_chain_templates WHERE auditable_type = 'trade_dispute'",
        { transaction: t }
      )

      if (tpls.length === 0) {
        // eslint-disable-next-line no-console
        console.log('[migrate] 无 trade_dispute 审核链模板，无需清理')
        await t.commit()
        return
      }

      const templateIds = tpls.map(r => r.template_id)

      // 安全校验：确认这些模板无任何审核链实例（有实例则中止，避免误删在用数据）
      const [instCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) AS n FROM approval_chain_instances WHERE template_id IN (:ids)',
        { replacements: { ids: templateIds }, transaction: t }
      )
      if (Number(instCount[0].n) > 0) {
        throw new Error(
          `trade_dispute 模板存在 ${instCount[0].n} 个审核链实例，中止删除（需人工确认）`
        )
      }

      // 1. 删节点
      const [nodeRes] = await queryInterface.sequelize.query(
        'DELETE FROM approval_chain_nodes WHERE template_id IN (:ids)',
        { replacements: { ids: templateIds }, transaction: t }
      )

      // 2. 删模板
      await queryInterface.sequelize.query(
        'DELETE FROM approval_chain_templates WHERE template_id IN (:ids)',
        { replacements: { ids: templateIds }, transaction: t }
      )

      // eslint-disable-next-line no-console
      console.log(
        `[migrate] 已删除僵尸 trade_dispute 审核链模板 ${templateIds.length} 个及其节点（affectedRows=${nodeRes?.affectedRows ?? 'n/a'}）`
      )
      await t.commit()
    } catch (e) {
      await t.rollback()
      throw e
    }
  },

  async down() {
    // 僵尸配置数据清理，不恢复
  }
}
