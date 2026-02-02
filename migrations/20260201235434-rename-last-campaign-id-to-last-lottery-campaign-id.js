'use strict'

/**
 * P2阶段迁移：重命名 last_campaign_id → last_lottery_campaign_id
 *
 * 涉及表：
 * - lottery_user_global_state.last_campaign_id → last_lottery_campaign_id
 *
 * 问题背景：
 * - last_campaign_id 缺少 lottery_ 前缀，与其他 campaign 相关外键命名不一致
 * - 应统一为 last_lottery_campaign_id，明确表示这是抽奖活动的引用
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 禁用外键检查
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction })

      console.log('🔄 P2迁移：开始重命名 last_campaign_id → last_lottery_campaign_id')

      // 2. 检查并删除相关外键（如存在）
      const [fks] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'lottery_user_global_state' 
         AND COLUMN_NAME = 'last_campaign_id' 
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
        { transaction }
      )

      for (const fk of fks) {
        console.log(`  📌 删除外键约束: lottery_user_global_state.${fk.CONSTRAINT_NAME}`)
        await queryInterface.sequelize.query(
          `ALTER TABLE lottery_user_global_state DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
          { transaction }
        )
      }

      // 3. 检查并删除相关索引
      const [indexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_user_global_state WHERE Column_name = 'last_campaign_id'`,
        { transaction }
      )

      for (const idx of indexes) {
        if (idx.Key_name !== 'PRIMARY') {
          console.log(`  📌 删除索引: lottery_user_global_state.${idx.Key_name}`)
          await queryInterface.sequelize.query(
            `DROP INDEX \`${idx.Key_name}\` ON lottery_user_global_state`,
            { transaction }
          )
        }
      }

      // 4. 重命名列
      console.log('  🔄 重命名: lottery_user_global_state.last_campaign_id → last_lottery_campaign_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_user_global_state 
         CHANGE COLUMN \`last_campaign_id\` \`last_lottery_campaign_id\` INT NULL 
         COMMENT '最后一次抽奖的活动ID（外键关联 lottery_campaigns.lottery_campaign_id）'`,
        { transaction }
      )

      // 5. 添加索引
      const [existingIdx] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_user_global_state WHERE Key_name = 'idx_global_state_last_campaign'`,
        { transaction }
      )

      if (existingIdx.length === 0) {
        console.log('  📌 创建索引: lottery_user_global_state.idx_global_state_last_campaign')
        await queryInterface.sequelize.query(
          `CREATE INDEX idx_global_state_last_campaign ON lottery_user_global_state(last_lottery_campaign_id)`,
          { transaction }
        )
      }

      // 6. 恢复外键检查
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction })

      await transaction.commit()
      console.log('✅ P2迁移完成：last_campaign_id → last_lottery_campaign_id')
    } catch (error) {
      await transaction.rollback()
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
      console.error('❌ P2迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction })

      console.log('🔄 P2回滚：开始还原 last_lottery_campaign_id → last_campaign_id')

      // 删除索引
      const [indexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_user_global_state WHERE Key_name = 'idx_global_state_last_campaign'`,
        { transaction }
      )

      if (indexes.length > 0) {
        console.log('  📌 删除索引: lottery_user_global_state.idx_global_state_last_campaign')
        await queryInterface.sequelize.query(
          `DROP INDEX idx_global_state_last_campaign ON lottery_user_global_state`,
          { transaction }
        )
      }

      // 还原列名
      console.log('  🔄 还原: lottery_user_global_state.last_lottery_campaign_id → last_campaign_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_user_global_state 
         CHANGE COLUMN \`last_lottery_campaign_id\` \`last_campaign_id\` INT NULL 
         COMMENT '最后一次抽奖的活动ID'`,
        { transaction }
      )

      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction })

      await transaction.commit()
      console.log('✅ P2回滚完成：last_lottery_campaign_id → last_campaign_id')
    } catch (error) {
      await transaction.rollback()
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
      console.error('❌ P2回滚失败:', error.message)
      throw error
    }
  }
}
