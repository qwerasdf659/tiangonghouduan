'use strict'

/**
 * 迁移：为 lottery_simulation_records 添加 scheduled_at 字段
 *
 * 支持 Phase 7 运维闭环 — 定时生效功能：
 * - scheduled_at: 计划生效时间（用于定时应用模拟配置）
 * - status 字段扩展 'scheduled' 状态值
 *
 * @see docs/策略效果模拟分析页面-设计方案.md Section 4.12
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('lottery_simulation_records')

    if (!tableInfo.scheduled_at) {
      await queryInterface.addColumn('lottery_simulation_records', 'scheduled_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '计划生效时间（定时应用功能）'
      })
    }

    // 添加索引便于定时任务查询到期记录
    const indexes = await queryInterface.showIndex('lottery_simulation_records')
    const hasIdx = indexes.some(i => i.name === 'idx_simulation_scheduled')
    if (!hasIdx) {
      await queryInterface.addIndex('lottery_simulation_records', ['status', 'scheduled_at'], {
        name: 'idx_simulation_scheduled',
        where: { status: 'scheduled' },
        comment: '定时任务查询待生效记录'
      })
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeIndex('lottery_simulation_records', 'idx_simulation_scheduled')
    } catch { /* ignore */ }
    const tableInfo = await queryInterface.describeTable('lottery_simulation_records')
    if (tableInfo.scheduled_at) {
      await queryInterface.removeColumn('lottery_simulation_records', 'scheduled_at')
    }
  }
}
