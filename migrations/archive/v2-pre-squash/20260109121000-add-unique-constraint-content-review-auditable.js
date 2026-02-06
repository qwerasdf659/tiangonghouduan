'use strict'

/**
 * 为 content_review_records 添加 auditable 唯一约束
 *
 * 业务背景（P1级 - 功能重复检查报告 2026-01-09）：
 * - 确保 consumption_records 与 ContentReviewRecord 1:1 强制关联
 * - 防止同一个业务记录被重复创建审批流
 *
 * 决策依据（2026-01-09）：
 * - 每条需要审核的业务记录必须对应唯一一条 ContentReviewRecord
 * - 通过数据库层唯一约束强制保证（而非仅应用层控制）
 *
 * 解决方案：
 * - 删除现有的普通索引 idx_audit_records_auditable
 * - 创建唯一索引 uk_content_review_auditable
 *
 * 决策时间：2026-01-09
 * 风险等级：🟢 低风险（表中无数据，且业务逻辑已确保不重复）
 *
 * @type {import('sequelize-cli').Migration}
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始执行：添加 content_review_records 唯一约束（P1级）')

      // 1. 检查表是否存在
      console.log('📊 步骤1：检查表是否存在...')
      const [tables] = await queryInterface.sequelize.query(
        `SHOW TABLES LIKE 'content_review_records'`,
        { transaction }
      )

      if (tables.length === 0) {
        console.log('   ⏭️ content_review_records 表不存在，跳过')
        await transaction.commit()
        return
      }

      // 2. 检查是否有重复数据
      console.log('📊 步骤2：检查是否有重复数据...')
      const [duplicates] = await queryInterface.sequelize.query(
        `SELECT auditable_type, auditable_id, COUNT(*) as count
         FROM content_review_records
         GROUP BY auditable_type, auditable_id
         HAVING COUNT(*) > 1`,
        { transaction }
      )

      if (duplicates.length > 0) {
        console.error('   ❌ 发现重复数据，不能添加唯一约束:')
        duplicates.forEach(dup => {
          console.error(`      ${dup.auditable_type}:${dup.auditable_id} 有 ${dup.count} 条记录`)
        })
        throw new Error('存在重复数据，请先清理后再添加唯一约束')
      }
      console.log('   ✅ 无重复数据')

      // 3. 删除现有的普通索引
      console.log('📊 步骤3：删除现有的普通索引...')
      const [indexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM content_review_records WHERE Key_name = 'idx_audit_records_auditable'`,
        { transaction }
      )

      if (indexes.length > 0) {
        await queryInterface.sequelize.query(
          `ALTER TABLE content_review_records DROP INDEX idx_audit_records_auditable`,
          { transaction }
        )
        console.log('   ✅ 已删除普通索引 idx_audit_records_auditable')
      } else {
        console.log('   ⏭️ 普通索引不存在，跳过删除')
      }

      // 4. 创建唯一索引
      console.log('📊 步骤4：创建唯一索引...')
      await queryInterface.addIndex('content_review_records', ['auditable_type', 'auditable_id'], {
        unique: true,
        name: 'uk_content_review_auditable',
        transaction
      })
      console.log('   ✅ 唯一索引 uk_content_review_auditable 已创建')

      // 5. 提交事务
      await transaction.commit()
      console.log('✅ 迁移完成：content_review_records 唯一约束已添加（P1级）')
      console.log('\n📝 效果：')
      console.log('   - 防止同一个业务记录被重复创建审批流')
      console.log('   - 确保 consumption_records 与 ContentReviewRecord 1:1 关联')
      console.log('   - 数据库层强制约束，比应用层控制更可靠')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('⚠️ 回滚操作：删除唯一约束，恢复普通索引')

      // 1. 删除唯一索引
      await queryInterface.removeIndex('content_review_records', 'uk_content_review_auditable', {
        transaction
      })
      console.log('   ✅ 唯一索引已删除')

      // 2. 恢复普通索引
      await queryInterface.addIndex('content_review_records', ['auditable_type', 'auditable_id'], {
        name: 'idx_audit_records_auditable',
        transaction
      })
      console.log('   ✅ 普通索引已恢复')

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
