'use strict'

/**
 * 删除 audit_records 空表
 *
 * 业务背景（P2级 - 功能重复检查报告 2026-01-09）：
 * - audit_records 表中无数据（0行）
 * - 无 Sequelize 模型定义
 * - 无代码引用
 * - 可安全删除
 *
 * 决策依据（2026-01-09）：
 * - 表中无数据，可安全删除
 * - 无模型和代码引用，不影响业务
 * - 减少数据库维护成本
 *
 * 决策时间：2026-01-09
 * 风险等级：🟢 低风险（无数据、无引用）
 *
 * @type {import('sequelize-cli').Migration}
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始执行：删除 audit_records 空表（P2级）')

      // 1. 检查表是否存在
      console.log('📊 步骤1：检查表是否存在...')
      const [tables] = await queryInterface.sequelize.query(`SHOW TABLES LIKE 'audit_records'`, {
        transaction
      })

      if (tables.length === 0) {
        console.log('   ⏭️ audit_records 表不存在，跳过')
        await transaction.commit()
        return
      }

      // 2. 检查表中是否有数据
      console.log('📊 步骤2：检查表中是否有数据...')
      const [count] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM audit_records`,
        { transaction }
      )

      const rowCount = count[0].count
      console.log(`   表中数据行数: ${rowCount}`)

      if (rowCount > 0) {
        throw new Error(`audit_records 表中有 ${rowCount} 行数据，不能删除。请先迁移数据。`)
      }

      // 3. 检查外键约束
      console.log('📊 步骤3：检查外键约束...')
      const [foreignKeys] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME 
         FROM information_schema.KEY_COLUMN_USAGE 
         WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'audit_records' 
           AND REFERENCED_TABLE_NAME IS NOT NULL`,
        { transaction }
      )

      for (const fk of foreignKeys) {
        console.log(`   删除外键约束: ${fk.CONSTRAINT_NAME}`)
        await queryInterface.sequelize.query(
          `ALTER TABLE audit_records DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`,
          { transaction }
        )
      }

      // 4. 删除表
      await queryInterface.dropTable('audit_records', { transaction })
      console.log('   ✅ audit_records 表已删除')

      // 5. 提交事务
      await transaction.commit()
      console.log('✅ 迁移完成：audit_records 空表已删除（P2级）')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('⚠️ 回滚操作：不重新创建 audit_records 表')
    console.log('   原因：该表已被废弃，不建议回滚')
    console.log('   如需回滚，请参考原始迁移文件手动创建表结构')
  }
}
