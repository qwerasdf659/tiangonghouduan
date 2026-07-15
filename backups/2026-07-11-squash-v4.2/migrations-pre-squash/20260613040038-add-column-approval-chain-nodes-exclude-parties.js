'use strict'

/**
 * 添加列: approval_chain_nodes.exclude_parties（当事人回避开关）
 *
 * 创建时间: 2026-06-13 北京时间
 * 创建原因（trade_dispute 审核链"当事人审自己"问题·路线B 通用回避）:
 * - 现状：审核链终审节点为 admin 角色池，_verifyOperatorPermission 中 role_level>=100 直接放行，
 *   没有"当事人不能审自己"的回避校验。当事人（如消费者/纠纷发起方）若恰好持 admin 角色，
 *   即可审到与自己相关的业务（破坏仲裁中立性、积分申请"自己批自己"）。
 * - 方案：在审核节点上增加可配置的"当事人回避"开关，默认开启（1）。
 *   开启时，ApprovalChainService._verifyOperatorPermission 会拒绝"操作人=该业务当事人"的审核，
 *   即使操作人持 admin 角色也不放行。
 *
 * 字段语义:
 *   exclude_parties = 1（默认）→ 该节点排除当事人审核（回避制生效）
 *   exclude_parties = 0        → 该节点不做回避（极小团队/特殊节点可关闭）
 *
 * 适用范围: 全部审核链节点（消费 5/6、商家积分 7、交易纠纷 8 + 未来新节点）通用。
 * 字符集: 随表 utf8mb4_unicode_ci。
 * 回滚: 删除该列。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('approval_chain_nodes', 'exclude_parties', {
      type: Sequelize.TINYINT,
      allowNull: false,
      defaultValue: 1,
      comment: '当事人回避开关(1=排除当事人审核,默认;0=不回避)。开启时操作人为该业务当事人则拒绝审核,即使持admin角色'
    })
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('approval_chain_nodes', 'exclude_parties')
  }
}
