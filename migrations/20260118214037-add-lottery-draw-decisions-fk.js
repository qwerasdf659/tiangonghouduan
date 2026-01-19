'use strict'

/**
 * 迁移文件：强化 lottery_draw_decisions 外键约束
 *
 * 基于《抽奖模块Strategy到Pipeline迁移方案》文档中 Phase 4 的要求
 * 添加 lottery_draw_decisions.draw_id 到 lottery_draws.draw_id 的外键约束
 *
 * 问题背景：
 * - lottery_draws.draw_id: utf8mb4_unicode_ci
 * - lottery_draw_decisions.draw_id: utf8mb4_0900_ai_ci
 * - 需要先统一排序规则，才能创建外键约束
 *
 * 业务场景：
 * - 确保决策快照记录与抽奖记录的 1:1 强关联
 * - 防止孤立的决策记录
 * - 支持级联删除（测试环境清理数据）
 *
 * 设计原则：
 * - 数据库层面强制约束 > 应用层控制
 * - 删除策略：CASCADE（决策记录随抽奖记录一起删除）
 *
 * 创建时间：2026-01-18
 * 作者：统一抽奖架构重构 - Phase 4
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 开始添加 lottery_draw_decisions 外键约束...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    // 辅助函数：安全添加外键约束
    async function safeAddConstraint(tableName, options) {
      try {
        const [constraints] = await queryInterface.sequelize.query(
          `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tableName}' 
           AND CONSTRAINT_NAME = '${options.name}'`,
          { transaction }
        )
        if (constraints.length === 0) {
          await queryInterface.addConstraint(tableName, { ...options, transaction })
          console.log(`    ✅ 约束 ${options.name} 创建成功`)
          return true
        } else {
          console.log(`    ⏭️ 约束 ${options.name} 已存在，跳过`)
          return false
        }
      } catch (err) {
        console.log(`    ⚠️ 约束 ${options.name} 创建失败: ${err.message}`)
        throw err
      }
    }

    try {
      // ============================================================
      // 步骤1：统一 draw_id 列的排序规则
      // lottery_draws.draw_id 使用 utf8mb4_unicode_ci
      // lottery_draw_decisions.draw_id 使用 utf8mb4_0900_ai_ci
      // 需要将 lottery_draw_decisions.draw_id 改为 utf8mb4_unicode_ci
      // ============================================================
      console.log('\n🔧 步骤1：统一 draw_id 排序规则为 utf8mb4_unicode_ci...')

      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_draw_decisions 
         MODIFY COLUMN draw_id VARCHAR(50) 
         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL 
         COMMENT '关联的抽奖记录ID（外键）'`,
        { transaction }
      )
      console.log('    ✅ draw_id 排序规则已统一')

      // ============================================================
      // 步骤2：添加外键约束
      // ============================================================
      console.log('\n🔗 步骤2：添加外键约束 fk_decisions_draw...')

      await safeAddConstraint('lottery_draw_decisions', {
        fields: ['draw_id'],
        type: 'foreign key',
        name: 'fk_decisions_draw',
        references: {
          table: 'lottery_draws',
          field: 'draw_id'
        },
        onDelete: 'CASCADE',  // 决策记录随抽奖记录删除
        onUpdate: 'CASCADE'
      })

      await transaction.commit()
      console.log('\n✅ 外键约束添加成功！')
      console.log('='.repeat(60))
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 开始回滚 lottery_draw_decisions 外键约束...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 步骤1：删除外键约束
      console.log('🔗 步骤1：删除外键约束...')
      try {
        await queryInterface.removeConstraint(
          'lottery_draw_decisions',
          'fk_decisions_draw',
          { transaction }
        )
        console.log('    ✅ 外键约束 fk_decisions_draw 已删除')
      } catch (err) {
        console.log(`    ⚠️ 外键约束删除失败（可能不存在）: ${err.message}`)
      }

      // 步骤2：恢复原排序规则（可选，但为了完整回滚）
      console.log('🔧 步骤2：恢复 draw_id 原排序规则...')
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_draw_decisions 
         MODIFY COLUMN draw_id VARCHAR(50) 
         CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL 
         COMMENT '关联的抽奖记录ID'`,
        { transaction }
      )
      console.log('    ✅ draw_id 排序规则已恢复')

      await transaction.commit()
      console.log('✅ 回滚成功')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
