'use strict'

/**
 * P1阶段迁移：重命名 preset_id → lottery_preset_id
 *
 * 涉及表：
 * - lottery_draws.preset_id → lottery_preset_id (外键关联 lottery_presets.lottery_preset_id)
 * - lottery_draw_decisions.preset_id → lottery_preset_id (外键关联 lottery_presets.lottery_preset_id)
 *
 * 问题背景：
 * - lottery_draw_decisions 模型中关联定义使用 lottery_preset_id，但数据库字段是 preset_id
 * - 导致 include 查询时字段名不一致，可能引发查询错误
 *
 * 迁移策略：
 * 1. 禁用外键检查
 * 2. 删除相关索引（如存在）
 * 3. 重命名列
 * 4. 添加外键约束
 * 5. 重建索引
 * 6. 恢复外键检查
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 禁用外键检查
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction })

      console.log('🔄 P1迁移：开始重命名 preset_id → lottery_preset_id')

      // 2. 检查并删除 lottery_draws 相关的外键（如存在）
      const [drawsFks] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'lottery_draws' 
         AND COLUMN_NAME = 'preset_id' 
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
        { transaction }
      )

      for (const fk of drawsFks) {
        console.log(`  📌 删除外键约束: lottery_draws.${fk.CONSTRAINT_NAME}`)
        await queryInterface.sequelize.query(
          `ALTER TABLE lottery_draws DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
          { transaction }
        )
      }

      // 3. 检查并删除 lottery_draw_decisions 相关的外键（如存在）
      const [decisionsFks] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'lottery_draw_decisions' 
         AND COLUMN_NAME = 'preset_id' 
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
        { transaction }
      )

      for (const fk of decisionsFks) {
        console.log(`  📌 删除外键约束: lottery_draw_decisions.${fk.CONSTRAINT_NAME}`)
        await queryInterface.sequelize.query(
          `ALTER TABLE lottery_draw_decisions DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
          { transaction }
        )
      }

      // 4. 检查并删除相关索引
      const [drawsIndexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_draws WHERE Column_name = 'preset_id'`,
        { transaction }
      )

      for (const idx of drawsIndexes) {
        if (idx.Key_name !== 'PRIMARY') {
          console.log(`  📌 删除索引: lottery_draws.${idx.Key_name}`)
          await queryInterface.sequelize.query(
            `DROP INDEX \`${idx.Key_name}\` ON lottery_draws`,
            { transaction }
          )
        }
      }

      const [decisionsIndexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_draw_decisions WHERE Column_name = 'preset_id'`,
        { transaction }
      )

      for (const idx of decisionsIndexes) {
        if (idx.Key_name !== 'PRIMARY') {
          console.log(`  📌 删除索引: lottery_draw_decisions.${idx.Key_name}`)
          await queryInterface.sequelize.query(
            `DROP INDEX \`${idx.Key_name}\` ON lottery_draw_decisions`,
            { transaction }
          )
        }
      }

      // 5. 重命名 lottery_draws.preset_id → lottery_preset_id
      // 字段类型：INT, 允许NULL
      console.log('  🔄 重命名: lottery_draws.preset_id → lottery_preset_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_draws 
         CHANGE COLUMN \`preset_id\` \`lottery_preset_id\` INT NULL 
         COMMENT '关联预设ID（外键关联 lottery_presets.lottery_preset_id）'`,
        { transaction }
      )

      // 6. 重命名 lottery_draw_decisions.preset_id → lottery_preset_id
      // 字段类型：VARCHAR(50), 允许NULL
      console.log('  🔄 重命名: lottery_draw_decisions.preset_id → lottery_preset_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_draw_decisions 
         CHANGE COLUMN \`preset_id\` \`lottery_preset_id\` VARCHAR(50) NULL 
         COMMENT '使用的预设ID（如果是预设发放，关联 lottery_presets）'`,
        { transaction }
      )

      // 7. 添加索引（用于查询优化）
      // 检查索引是否已存在
      const [existingDrawsIdx] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_draws WHERE Key_name = 'idx_draws_lottery_preset_id'`,
        { transaction }
      )

      if (existingDrawsIdx.length === 0) {
        console.log('  📌 创建索引: lottery_draws.idx_draws_lottery_preset_id')
        await queryInterface.sequelize.query(
          `CREATE INDEX idx_draws_lottery_preset_id ON lottery_draws(lottery_preset_id)`,
          { transaction }
        )
      }

      const [existingDecisionsIdx] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_draw_decisions WHERE Key_name = 'idx_decisions_lottery_preset_id'`,
        { transaction }
      )

      if (existingDecisionsIdx.length === 0) {
        console.log('  📌 创建索引: lottery_draw_decisions.idx_decisions_lottery_preset_id')
        await queryInterface.sequelize.query(
          `CREATE INDEX idx_decisions_lottery_preset_id ON lottery_draw_decisions(lottery_preset_id)`,
          { transaction }
        )
      }

      // 8. 恢复外键检查
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction })

      await transaction.commit()
      console.log('✅ P1迁移完成：preset_id → lottery_preset_id')
    } catch (error) {
      await transaction.rollback()
      // 确保恢复外键检查
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
      console.error('❌ P1迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 禁用外键检查
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction })

      console.log('🔄 P1回滚：开始还原 lottery_preset_id → preset_id')

      // 2. 删除索引
      const [drawsIndexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_draws WHERE Key_name = 'idx_draws_lottery_preset_id'`,
        { transaction }
      )

      if (drawsIndexes.length > 0) {
        console.log('  📌 删除索引: lottery_draws.idx_draws_lottery_preset_id')
        await queryInterface.sequelize.query(
          `DROP INDEX idx_draws_lottery_preset_id ON lottery_draws`,
          { transaction }
        )
      }

      const [decisionsIndexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_draw_decisions WHERE Key_name = 'idx_decisions_lottery_preset_id'`,
        { transaction }
      )

      if (decisionsIndexes.length > 0) {
        console.log('  📌 删除索引: lottery_draw_decisions.idx_decisions_lottery_preset_id')
        await queryInterface.sequelize.query(
          `DROP INDEX idx_decisions_lottery_preset_id ON lottery_draw_decisions`,
          { transaction }
        )
      }

      // 3. 还原 lottery_draws.lottery_preset_id → preset_id
      console.log('  🔄 还原: lottery_draws.lottery_preset_id → preset_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_draws 
         CHANGE COLUMN \`lottery_preset_id\` \`preset_id\` INT NULL 
         COMMENT '关联预设ID（lottery_presets.preset_id）'`,
        { transaction }
      )

      // 4. 还原 lottery_draw_decisions.lottery_preset_id → preset_id
      console.log('  🔄 还原: lottery_draw_decisions.lottery_preset_id → preset_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_draw_decisions 
         CHANGE COLUMN \`lottery_preset_id\` \`preset_id\` VARCHAR(50) NULL 
         COMMENT '使用的预设ID（如果是预设发放）'`,
        { transaction }
      )

      // 5. 恢复外键检查
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction })

      await transaction.commit()
      console.log('✅ P1回滚完成：lottery_preset_id → preset_id')
    } catch (error) {
      await transaction.rollback()
      // 确保恢复外键检查
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
      console.error('❌ P1回滚失败:', error.message)
      throw error
    }
  }
}
