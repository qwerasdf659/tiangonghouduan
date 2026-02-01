'use strict'

/**
 * 数据库迁移：修复技术外键命名规范
 *
 * 目的：将 preset_budget_debt 和 preset_inventory_debt 表中的 draw_id 字段
 *       重命名为 lottery_draw_id，符合 {table_name}_id 命名规范
 *
 * 影响表：
 * - preset_budget_debt: draw_id → lottery_draw_id
 * - preset_inventory_debt: draw_id → lottery_draw_id
 *
 * 关联文档：docs/技术债务修复-主键命名规范化方案.md
 *
 * 创建时间：2026-02-01
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始迁移：修复 draw_id → lottery_draw_id...')

      // 1. 重命名 preset_budget_debt.draw_id → lottery_draw_id
      console.log('  📝 重命名 preset_budget_debt.draw_id → lottery_draw_id')
      await queryInterface.renameColumn(
        'preset_budget_debt',
        'draw_id',
        'lottery_draw_id',
        { transaction }
      )

      // 2. 重命名 preset_inventory_debt.draw_id → lottery_draw_id
      console.log('  📝 重命名 preset_inventory_debt.draw_id → lottery_draw_id')
      await queryInterface.renameColumn(
        'preset_inventory_debt',
        'draw_id',
        'lottery_draw_id',
        { transaction }
      )

      // 3. 更新字段注释（可选，增强可读性）
      console.log('  📝 更新字段注释...')
      await queryInterface.sequelize.query(
        `ALTER TABLE preset_budget_debt 
         MODIFY COLUMN lottery_draw_id VARCHAR(50) NOT NULL 
         COMMENT '关联的抽奖记录ID（外键关联 lottery_draws.lottery_draw_id）'`,
        { transaction }
      )

      await queryInterface.sequelize.query(
        `ALTER TABLE preset_inventory_debt 
         MODIFY COLUMN lottery_draw_id VARCHAR(50) NOT NULL 
         COMMENT '关联的抽奖记录ID（外键关联 lottery_draws.lottery_draw_id）'`,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 迁移完成：draw_id → lottery_draw_id')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 回滚迁移：lottery_draw_id → draw_id...')

      // 1. 回滚 preset_budget_debt.lottery_draw_id → draw_id
      await queryInterface.renameColumn(
        'preset_budget_debt',
        'lottery_draw_id',
        'draw_id',
        { transaction }
      )

      // 2. 回滚 preset_inventory_debt.lottery_draw_id → draw_id
      await queryInterface.renameColumn(
        'preset_inventory_debt',
        'lottery_draw_id',
        'draw_id',
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 回滚完成：lottery_draw_id → draw_id')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
