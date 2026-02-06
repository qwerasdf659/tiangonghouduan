'use strict'

/**
 * P5阶段迁移：重命名业务标识符字段
 *
 * 涉及表：
 * - lottery_draws.batch_id → lottery_batch_id
 * - lottery_draws.batch_draw_id → lottery_batch_draw_id
 * - user_behavior_tracks.session_id → behavior_session_id
 *
 * 问题背景：
 * - batch_id/batch_draw_id 应添加 lottery_ 前缀，明确属于抽奖业务域
 * - session_id 过于通用，应改为 behavior_session_id，明确属于用户行为追踪域
 *
 * 注意：这些是业务标识符字段（VARCHAR），不是外键，但仍需遵循命名规范
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 禁用外键检查
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction })

      console.log('🔄 P5迁移：开始重命名业务标识符字段')

      // === lottery_draws 表字段 ===

      // 2. 删除 batch_id 相关索引
      const [batchIdIndexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_draws WHERE Column_name = 'batch_id'`,
        { transaction }
      )

      for (const idx of batchIdIndexes) {
        if (idx.Key_name !== 'PRIMARY') {
          console.log(`  📌 删除索引: lottery_draws.${idx.Key_name}`)
          await queryInterface.sequelize.query(
            `DROP INDEX \`${idx.Key_name}\` ON lottery_draws`,
            { transaction }
          )
        }
      }

      // 3. 删除 batch_draw_id 相关索引
      const [batchDrawIdIndexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_draws WHERE Column_name = 'batch_draw_id'`,
        { transaction }
      )

      for (const idx of batchDrawIdIndexes) {
        if (idx.Key_name !== 'PRIMARY') {
          console.log(`  📌 删除索引: lottery_draws.${idx.Key_name}`)
          await queryInterface.sequelize.query(
            `DROP INDEX \`${idx.Key_name}\` ON lottery_draws`,
            { transaction }
          )
        }
      }

      // 4. 重命名 batch_id → lottery_batch_id
      console.log('  🔄 重命名: lottery_draws.batch_id → lottery_batch_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_draws 
         CHANGE COLUMN \`batch_id\` \`lottery_batch_id\` VARCHAR(50) NULL 
         COMMENT '抽奖批次ID（用于关联同一批次的多次抽奖）'`,
        { transaction }
      )

      // 5. 重命名 batch_draw_id → lottery_batch_draw_id
      console.log('  🔄 重命名: lottery_draws.batch_draw_id → lottery_batch_draw_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_draws 
         CHANGE COLUMN \`batch_draw_id\` \`lottery_batch_draw_id\` VARCHAR(50) NULL 
         COMMENT '批次内抽奖序号ID（连抽时区分同一批次内的每次抽奖）'`,
        { transaction }
      )

      // 6. 添加新索引
      const [existingBatchIdx] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_draws WHERE Key_name = 'idx_draws_lottery_batch'`,
        { transaction }
      )

      if (existingBatchIdx.length === 0) {
        console.log('  📌 创建索引: lottery_draws.idx_draws_lottery_batch')
        await queryInterface.sequelize.query(
          `CREATE INDEX idx_draws_lottery_batch ON lottery_draws(lottery_batch_id)`,
          { transaction }
        )
      }

      // === user_behavior_tracks 表字段 ===

      // 7. 删除 session_id 相关索引
      const [sessionIdIndexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM user_behavior_tracks WHERE Column_name = 'session_id'`,
        { transaction }
      )

      for (const idx of sessionIdIndexes) {
        if (idx.Key_name !== 'PRIMARY') {
          console.log(`  📌 删除索引: user_behavior_tracks.${idx.Key_name}`)
          await queryInterface.sequelize.query(
            `DROP INDEX \`${idx.Key_name}\` ON user_behavior_tracks`,
            { transaction }
          )
        }
      }

      // 8. 重命名 session_id → behavior_session_id
      console.log('  🔄 重命名: user_behavior_tracks.session_id → behavior_session_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE user_behavior_tracks 
         CHANGE COLUMN \`session_id\` \`behavior_session_id\` VARCHAR(100) NULL 
         COMMENT '用户行为会话ID（关联同一次会话内的多个行为记录）'`,
        { transaction }
      )

      // 9. 添加新索引
      const [existingSessionIdx] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM user_behavior_tracks WHERE Key_name = 'idx_behavior_tracks_session'`,
        { transaction }
      )

      if (existingSessionIdx.length === 0) {
        console.log('  📌 创建索引: user_behavior_tracks.idx_behavior_tracks_session')
        await queryInterface.sequelize.query(
          `CREATE INDEX idx_behavior_tracks_session ON user_behavior_tracks(behavior_session_id)`,
          { transaction }
        )
      }

      // 10. 恢复外键检查
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction })

      await transaction.commit()
      console.log('✅ P5迁移完成：业务标识符字段重命名')
    } catch (error) {
      await transaction.rollback()
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
      console.error('❌ P5迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction })

      console.log('🔄 P5回滚：开始还原业务标识符字段')

      // === lottery_draws 表 ===

      // 删除新索引
      const [batchIdx] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_draws WHERE Key_name = 'idx_draws_lottery_batch'`,
        { transaction }
      )

      if (batchIdx.length > 0) {
        console.log('  📌 删除索引: lottery_draws.idx_draws_lottery_batch')
        await queryInterface.sequelize.query(
          `DROP INDEX idx_draws_lottery_batch ON lottery_draws`,
          { transaction }
        )
      }

      // 还原列名
      console.log('  🔄 还原: lottery_draws.lottery_batch_id → batch_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_draws 
         CHANGE COLUMN \`lottery_batch_id\` \`batch_id\` VARCHAR(50) NULL 
         COMMENT '批次ID'`,
        { transaction }
      )

      console.log('  🔄 还原: lottery_draws.lottery_batch_draw_id → batch_draw_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_draws 
         CHANGE COLUMN \`lottery_batch_draw_id\` \`batch_draw_id\` VARCHAR(50) NULL 
         COMMENT '批次抽奖ID'`,
        { transaction }
      )

      // 重建旧索引
      const [existingOldBatchIdx] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_draws WHERE Key_name = 'idx_batch_id'`,
        { transaction }
      )

      if (existingOldBatchIdx.length === 0) {
        console.log('  📌 创建索引: lottery_draws.idx_batch_id')
        await queryInterface.sequelize.query(
          `CREATE INDEX idx_batch_id ON lottery_draws(batch_id)`,
          { transaction }
        )
      }

      // === user_behavior_tracks 表 ===

      // 删除新索引
      const [sessionIdx] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM user_behavior_tracks WHERE Key_name = 'idx_behavior_tracks_session'`,
        { transaction }
      )

      if (sessionIdx.length > 0) {
        console.log('  📌 删除索引: user_behavior_tracks.idx_behavior_tracks_session')
        await queryInterface.sequelize.query(
          `DROP INDEX idx_behavior_tracks_session ON user_behavior_tracks`,
          { transaction }
        )
      }

      // 还原列名
      console.log('  🔄 还原: user_behavior_tracks.behavior_session_id → session_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE user_behavior_tracks 
         CHANGE COLUMN \`behavior_session_id\` \`session_id\` VARCHAR(100) NULL 
         COMMENT '会话ID'`,
        { transaction }
      )

      // 重建旧索引
      const [existingOldSessionIdx] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM user_behavior_tracks WHERE Key_name = 'idx_behavior_tracks_session'`,
        { transaction }
      )

      if (existingOldSessionIdx.length === 0) {
        console.log('  📌 创建索引: user_behavior_tracks.idx_behavior_tracks_session')
        await queryInterface.sequelize.query(
          `CREATE INDEX idx_behavior_tracks_session ON user_behavior_tracks(session_id)`,
          { transaction }
        )
      }

      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction })

      await transaction.commit()
      console.log('✅ P5回滚完成：业务标识符字段已还原')
    } catch (error) {
      await transaction.rollback()
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
      console.error('❌ P5回滚失败:', error.message)
      throw error
    }
  }
}
