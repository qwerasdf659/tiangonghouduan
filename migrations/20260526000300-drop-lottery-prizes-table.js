'use strict'

/**
 * 删除旧 lottery_prizes 表
 *
 * 业务背景：
 * - 集中奖品目录方案已完全实施
 * - 所有服务已切换到 prize_definitions + lottery_campaign_prizes
 * - lottery_draws.lottery_prize_id 保留为历史字段（无 FK 约束）
 * - 旧表数据已完整迁移到新表
 */

module.exports = {
  async up(queryInterface) {
    console.log('🚀 开始删除旧 lottery_prizes 表...')

    // 删除所有指向 lottery_prizes 的 FK 约束
    const fkConstraints = [
      { table: 'lottery_draws', constraint: 'lottery_draws_ibfk_4' },
      { table: 'preset_inventory_debt', constraint: 'fk_inv_debt_prize_id' }
    ]

    for (const { table, constraint } of fkConstraints) {
      try {
        await queryInterface.removeConstraint(table, constraint)
        console.log(`  ✅ 删除 ${table}.${constraint}`)
      } catch (e) {
        console.log(`  ⚠️ ${table}.${constraint} 不存在或已删除`)
      }
    }

    await queryInterface.dropTable('lottery_prizes')
    console.log('  ✅ lottery_prizes 表已删除')
    console.log('\n✅ 旧表清理完成')
  },

  async down(queryInterface, Sequelize) {
    // 回滚时重建表（仅结构，不含数据）
    await queryInterface.createTable('lottery_prizes', {
      lottery_prize_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      lottery_campaign_id: { type: Sequelize.INTEGER, allowNull: false },
      prize_name: { type: Sequelize.STRING(100) },
      prize_type: { type: Sequelize.STRING(50) },
      status: { type: Sequelize.STRING(20), defaultValue: 'active' },
      created_at: { type: Sequelize.DATE },
      updated_at: { type: Sequelize.DATE },
      deleted_at: { type: Sequelize.DATE }
    })
  }
}
