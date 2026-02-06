'use strict'

/**
 * P3阶段迁移：重命名 fallback_prize_id → fallback_lottery_prize_id
 *
 * 涉及表：
 * - lottery_campaigns.fallback_prize_id → fallback_lottery_prize_id
 * - lottery_campaigns.tier_fallback_prize_id → tier_fallback_lottery_prize_id
 *
 * 问题背景：
 * - 这两个字段都是指向 lottery_prizes.lottery_prize_id 的外键
 * - 字段名应包含完整的 lottery_prize 前缀，与引用的主键名称一致
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 禁用外键检查
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction })

      console.log('🔄 P3迁移：开始重命名 fallback_prize_id 相关字段')

      // 2. 检查并删除 fallback_prize_id 相关外键（如存在）
      const [fks1] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'lottery_campaigns' 
         AND COLUMN_NAME = 'fallback_prize_id' 
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
        { transaction }
      )

      for (const fk of fks1) {
        console.log(`  📌 删除外键约束: lottery_campaigns.${fk.CONSTRAINT_NAME}`)
        await queryInterface.sequelize.query(
          `ALTER TABLE lottery_campaigns DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
          { transaction }
        )
      }

      // 3. 检查并删除 tier_fallback_prize_id 相关外键（如存在）
      const [fks2] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'lottery_campaigns' 
         AND COLUMN_NAME = 'tier_fallback_prize_id' 
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
        { transaction }
      )

      for (const fk of fks2) {
        console.log(`  📌 删除外键约束: lottery_campaigns.${fk.CONSTRAINT_NAME}`)
        await queryInterface.sequelize.query(
          `ALTER TABLE lottery_campaigns DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
          { transaction }
        )
      }

      // 4. 检查并删除相关索引
      const [indexes1] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_campaigns WHERE Column_name = 'fallback_prize_id'`,
        { transaction }
      )

      for (const idx of indexes1) {
        if (idx.Key_name !== 'PRIMARY') {
          console.log(`  📌 删除索引: lottery_campaigns.${idx.Key_name}`)
          await queryInterface.sequelize.query(
            `DROP INDEX \`${idx.Key_name}\` ON lottery_campaigns`,
            { transaction }
          )
        }
      }

      const [indexes2] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_campaigns WHERE Column_name = 'tier_fallback_prize_id'`,
        { transaction }
      )

      for (const idx of indexes2) {
        if (idx.Key_name !== 'PRIMARY') {
          console.log(`  📌 删除索引: lottery_campaigns.${idx.Key_name}`)
          await queryInterface.sequelize.query(
            `DROP INDEX \`${idx.Key_name}\` ON lottery_campaigns`,
            { transaction }
          )
        }
      }

      // 5. 重命名 fallback_prize_id → fallback_lottery_prize_id
      console.log('  🔄 重命名: lottery_campaigns.fallback_prize_id → fallback_lottery_prize_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_campaigns 
         CHANGE COLUMN \`fallback_prize_id\` \`fallback_lottery_prize_id\` INT NULL DEFAULT NULL 
         COMMENT '兜底奖品ID（pick_method=fallback时使用，外键关联 lottery_prizes.lottery_prize_id）'`,
        { transaction }
      )

      // 6. 重命名 tier_fallback_prize_id → tier_fallback_lottery_prize_id
      console.log('  🔄 重命名: lottery_campaigns.tier_fallback_prize_id → tier_fallback_lottery_prize_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_campaigns 
         CHANGE COLUMN \`tier_fallback_prize_id\` \`tier_fallback_lottery_prize_id\` INT NULL DEFAULT NULL 
         COMMENT '档位保底奖品ID（所有档位无货时发放，外键关联 lottery_prizes.lottery_prize_id）'`,
        { transaction }
      )

      // 7. 添加索引
      const [existingIdx1] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_campaigns WHERE Key_name = 'idx_campaigns_fallback_prize'`,
        { transaction }
      )

      if (existingIdx1.length === 0) {
        console.log('  📌 创建索引: lottery_campaigns.idx_campaigns_fallback_prize')
        await queryInterface.sequelize.query(
          `CREATE INDEX idx_campaigns_fallback_prize ON lottery_campaigns(fallback_lottery_prize_id)`,
          { transaction }
        )
      }

      const [existingIdx2] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_campaigns WHERE Key_name = 'idx_campaigns_tier_fallback_prize'`,
        { transaction }
      )

      if (existingIdx2.length === 0) {
        console.log('  📌 创建索引: lottery_campaigns.idx_campaigns_tier_fallback_prize')
        await queryInterface.sequelize.query(
          `CREATE INDEX idx_campaigns_tier_fallback_prize ON lottery_campaigns(tier_fallback_lottery_prize_id)`,
          { transaction }
        )
      }

      // 8. 恢复外键检查
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction })

      await transaction.commit()
      console.log('✅ P3迁移完成：fallback_prize_id 相关字段重命名')
    } catch (error) {
      await transaction.rollback()
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
      console.error('❌ P3迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction })

      console.log('🔄 P3回滚：开始还原 fallback_lottery_prize_id 相关字段')

      // 删除索引
      const [indexes1] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_campaigns WHERE Key_name = 'idx_campaigns_fallback_prize'`,
        { transaction }
      )

      if (indexes1.length > 0) {
        console.log('  📌 删除索引: lottery_campaigns.idx_campaigns_fallback_prize')
        await queryInterface.sequelize.query(
          `DROP INDEX idx_campaigns_fallback_prize ON lottery_campaigns`,
          { transaction }
        )
      }

      const [indexes2] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM lottery_campaigns WHERE Key_name = 'idx_campaigns_tier_fallback_prize'`,
        { transaction }
      )

      if (indexes2.length > 0) {
        console.log('  📌 删除索引: lottery_campaigns.idx_campaigns_tier_fallback_prize')
        await queryInterface.sequelize.query(
          `DROP INDEX idx_campaigns_tier_fallback_prize ON lottery_campaigns`,
          { transaction }
        )
      }

      // 还原列名
      console.log('  🔄 还原: lottery_campaigns.fallback_lottery_prize_id → fallback_prize_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_campaigns 
         CHANGE COLUMN \`fallback_lottery_prize_id\` \`fallback_prize_id\` INT NULL DEFAULT NULL 
         COMMENT '兜底奖品ID'`,
        { transaction }
      )

      console.log('  🔄 还原: lottery_campaigns.tier_fallback_lottery_prize_id → tier_fallback_prize_id')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_campaigns 
         CHANGE COLUMN \`tier_fallback_lottery_prize_id\` \`tier_fallback_prize_id\` INT NULL DEFAULT NULL 
         COMMENT '档位保底奖品ID'`,
        { transaction }
      )

      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction })

      await transaction.commit()
      console.log('✅ P3回滚完成：fallback_lottery_prize_id → fallback_prize_id')
    } catch (error) {
      await transaction.rollback()
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
      console.error('❌ P3回滚失败:', error.message)
      throw error
    }
  }
}
