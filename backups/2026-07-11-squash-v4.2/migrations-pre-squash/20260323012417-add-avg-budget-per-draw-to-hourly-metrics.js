'use strict'

/**
 * 迁移：为 lottery_hourly_metrics 表添加 avg_budget_per_draw 列
 *
 * 原因：hourly-lottery-metrics-aggregation.js 在 findOrCreate 时
 * 写入 avg_budget_per_draw 字段，但表中缺少此列导致 Sequelize 警告
 * "Unknown attributes (avg_budget_per_draw) passed to defaults"
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('lottery_hourly_metrics')
    if (!tableInfo.avg_budget_per_draw) {
      await queryInterface.addColumn('lottery_hourly_metrics', 'avg_budget_per_draw', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '该小时内平均每次抽奖预算消耗'
      })
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('lottery_hourly_metrics')
    if (tableInfo.avg_budget_per_draw) {
      await queryInterface.removeColumn('lottery_hourly_metrics', 'avg_budget_per_draw')
    }
  }
}
