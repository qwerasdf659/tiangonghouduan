'use strict'

/**
 * P4阶段迁移：重命名欠账和决策相关字段
 *
 * 涉及表：
 * - lottery_draws.decision_id → lottery_draw_decision_id
 * - lottery_draws.inventory_debt_id → preset_inventory_debt_id
 * - lottery_draws.budget_debt_id → preset_budget_debt_id
 *
 * 问题背景：
 * - 这些字段都是外键，但命名不包含引用表的完整主键名称
 * - decision_id 应为 lottery_draw_decision_id（引用 lottery_draw_decisions.lottery_draw_decision_id）
 * - inventory_debt_id 应为 preset_inventory_debt_id（引用 preset_inventory_debt.preset_inventory_debt_id）
 * - budget_debt_id 应为 preset_budget_debt_id（引用 preset_budget_debt.preset_budget_debt_id）
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 禁用外键检查
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction })

      console.log('🔄 P4迁移：开始重命名欠账和决策相关字段')

      // 2. 检查并删除 decision_id 相关外键（如存在）
      const [fks1] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'lottery_draws' 
         AND COLUMN_NAME = 'decision_id' 
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
        { transaction }
      )

      for (const fk of fks1) {
        console.log(`  📌 删除外键约束: lottery_draws.${fk.CONSTRAINT_NAME}`)
        await queryInterface.sequelize.query(
          `ALTER TABLE lottery_draws DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
          { transaction }
        )
      }

      // 3. 检查并删除 inventory_debt_id 相关外键（如存在）
      const [fks2] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'lottery_draws' 
         AND COLUMN_NAME = 'inventory_debt_id' 
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
        { transaction }
      )

      for (const fk of fks2) {
        console.log(`  📌 删除外键约束: lottery_draws.${fk.CONSTRAINT_NAME}`)
        await queryInterface.sequelize.query(
          `ALTER TABLE lottery_draws DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
          { transaction }
        )
      }

      // 4. 检查并删除 budget_debt_id 相关外键（如存在）
      const [fks3] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'lottery_draws' 
         AND COLUMN_NAME = 'budget_debt_id' 
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
        { transaction }
      )

      for (const fk of fks3) {
        console.log(`  📌 删除外键约束: lottery_draws.${fk.CONSTRAINT_NAME}`)
        await queryInterface.sequelize.query(
          `ALTER TABLE lottery_draws DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
          { transaction }
        )
      }

      // 5. 删除旧索引
      const fieldsToCheck = ['decision_id', 'inventory_debt_id', 'budget_debt_id']
      for (const field of fieldsToCheck) {
        const [indexes] = await queryInterface.sequelize.query(
          `SHOW INDEX FROM lottery_draws WHERE Column_name = '${field}'`,
          { transaction }
        )

        for (const idx of indexes) {
          if (idx.Key_name !== 'PRIMARY') {
            console.log(`  📌 删除索引: lottery_draws.${idx.Key_name}`)
            await queryInterface.sequelize.query(
              `DROP INDEX \`${idx.Key_name}\` ON lottery_draws`,
              { transaction }
            )
          }
        }
      }

      // 6. 重命名 decision_id → lottery_draw_decision_id
      console.log('  🔄 重命名: lottery_draws.decision_id → lottery_draw_decision_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_draws 
         CHANGE COLUMN \`decision_id\` \`lottery_draw_decision_id\` BIGINT NULL 
         COMMENT '关联决策快照ID（外键关联 lottery_draw_decisions.lottery_draw_decision_id）'`,
        { transaction }
      )

      // 7. 重命名 inventory_debt_id → preset_inventory_debt_id
      console.log('  🔄 重命名: lottery_draws.inventory_debt_id → preset_inventory_debt_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_draws 
         CHANGE COLUMN \`inventory_debt_id\` \`preset_inventory_debt_id\` INT NULL 
         COMMENT '关联库存欠账ID（外键关联 preset_inventory_debt.preset_inventory_debt_id）'`,
        { transaction }
      )

      // 8. 重命名 budget_debt_id → preset_budget_debt_id
      console.log('  🔄 重命名: lottery_draws.budget_debt_id → preset_budget_debt_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_draws 
         CHANGE COLUMN \`budget_debt_id\` \`preset_budget_debt_id\` INT NULL 
         COMMENT '关联预算欠账ID（外键关联 preset_budget_debt.preset_budget_debt_id）'`,
        { transaction }
      )

      // 9. 添加新索引
      const newIndexes = [
        ['idx_draws_decision', 'lottery_draw_decision_id'],
        ['idx_draws_inventory_debt', 'preset_inventory_debt_id'],
        ['idx_draws_budget_debt', 'preset_budget_debt_id']
      ]

      for (const [indexName, columnName] of newIndexes) {
        const [existingIdx] = await queryInterface.sequelize.query(
          `SHOW INDEX FROM lottery_draws WHERE Key_name = '${indexName}'`,
          { transaction }
        )

        if (existingIdx.length === 0) {
          console.log(`  📌 创建索引: lottery_draws.${indexName}`)
          await queryInterface.sequelize.query(
            `CREATE INDEX ${indexName} ON lottery_draws(${columnName})`,
            { transaction }
          )
        }
      }

      // 10. 恢复外键检查
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction })

      await transaction.commit()
      console.log('✅ P4迁移完成：欠账和决策字段重命名')
    } catch (error) {
      await transaction.rollback()
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
      console.error('❌ P4迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction })

      console.log('🔄 P4回滚：开始还原欠账和决策字段')

      // 删除新索引
      const indexesToDrop = ['idx_draws_decision', 'idx_draws_inventory_debt', 'idx_draws_budget_debt']
      for (const indexName of indexesToDrop) {
        const [indexes] = await queryInterface.sequelize.query(
          `SHOW INDEX FROM lottery_draws WHERE Key_name = '${indexName}'`,
          { transaction }
        )

        if (indexes.length > 0) {
          console.log(`  📌 删除索引: lottery_draws.${indexName}`)
          await queryInterface.sequelize.query(
            `DROP INDEX ${indexName} ON lottery_draws`,
            { transaction }
          )
        }
      }

      // 还原列名
      console.log('  🔄 还原: lottery_draws.lottery_draw_decision_id → decision_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_draws 
         CHANGE COLUMN \`lottery_draw_decision_id\` \`decision_id\` BIGINT NULL 
         COMMENT '关联决策快照ID'`,
        { transaction }
      )

      console.log('  🔄 还原: lottery_draws.preset_inventory_debt_id → inventory_debt_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_draws 
         CHANGE COLUMN \`preset_inventory_debt_id\` \`inventory_debt_id\` INT NULL 
         COMMENT '关联库存欠账ID'`,
        { transaction }
      )

      console.log('  🔄 还原: lottery_draws.preset_budget_debt_id → budget_debt_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_draws 
         CHANGE COLUMN \`preset_budget_debt_id\` \`budget_debt_id\` INT NULL 
         COMMENT '关联预算欠账ID'`,
        { transaction }
      )

      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction })

      await transaction.commit()
      console.log('✅ P4回滚完成：欠账和决策字段已还原')
    } catch (error) {
      await transaction.rollback()
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
      console.error('❌ P4回滚失败:', error.message)
      throw error
    }
  }
}
