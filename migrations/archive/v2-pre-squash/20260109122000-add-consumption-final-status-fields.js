'use strict'

/**
 * 为 consumption_records 添加业务结果态字段
 *
 * 业务背景（P1级 - 功能重复检查报告 2026-01-09）：
 * - consumption_records 作为业务主表，需要记录业务最终状态
 * - ContentReviewRecord 作为审批流表，记录审批流程状态
 * - 两者职责分离：业务主表记录业务结果，审批流表记录审批过程
 *
 * 决策依据（2026-01-09）：
 * - 审批状态以 ContentReviewRecord.audit_status 为准
 * - consumption_records 只保留业务结果态：final_status 和 settled_at
 * - 审批通过/拒绝后才落地业务结果态
 *
 * 新增字段：
 * - final_status: 业务最终状态（pending_review/approved/rejected）
 * - settled_at: 结算时间（审批通过/拒绝时落地）
 *
 * 决策时间：2026-01-09
 * 风险等级：🟢 低风险（表中无数据，新增字段不影响现有逻辑）
 *
 * @type {import('sequelize-cli').Migration}
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始执行：添加 consumption_records 业务结果态字段（P1级）')

      // 1. 检查表是否存在
      console.log('📊 步骤1：检查表是否存在...')
      const [tables] = await queryInterface.sequelize.query(
        `SHOW TABLES LIKE 'consumption_records'`,
        { transaction }
      )

      if (tables.length === 0) {
        console.log('   ⏭️ consumption_records 表不存在，跳过')
        await transaction.commit()
        return
      }

      // 2. 检查字段是否已存在
      console.log('📊 步骤2：检查字段是否已存在...')
      const [columns] = await queryInterface.sequelize.query(
        `SHOW COLUMNS FROM consumption_records WHERE Field IN ('final_status', 'settled_at')`,
        { transaction }
      )

      const existingFields = columns.map(col => col.Field)

      // 3. 添加 final_status 字段
      if (!existingFields.includes('final_status')) {
        console.log('📊 步骤3：添加 final_status 字段...')
        await queryInterface.addColumn(
          'consumption_records',
          'final_status',
          {
            type: Sequelize.ENUM('pending_review', 'approved', 'rejected'),
            allowNull: false,
            defaultValue: 'pending_review',
            comment: '业务最终状态（审批通过/拒绝后落地）'
          },
          { transaction }
        )
        console.log('   ✅ final_status 字段已添加')
      } else {
        console.log('   ⏭️ final_status 字段已存在，跳过')
      }

      // 4. 添加 settled_at 字段
      if (!existingFields.includes('settled_at')) {
        console.log('📊 步骤4：添加 settled_at 字段...')
        await queryInterface.addColumn(
          'consumption_records',
          'settled_at',
          {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '结算时间（审批完成时落地，北京时间）'
          },
          { transaction }
        )
        console.log('   ✅ settled_at 字段已添加')
      } else {
        console.log('   ⏭️ settled_at 字段已存在，跳过')
      }

      // 5. 创建索引（优化查询性能）
      console.log('📊 步骤5：创建索引...')
      const [indexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM consumption_records WHERE Key_name = 'idx_consumption_final_status'`,
        { transaction }
      )

      if (indexes.length === 0) {
        await queryInterface.addIndex('consumption_records', ['final_status', 'settled_at'], {
          name: 'idx_consumption_final_status',
          transaction
        })
        console.log('   ✅ 索引 idx_consumption_final_status 已创建')
      } else {
        console.log('   ⏭️ 索引已存在，跳过')
      }

      // 6. 提交事务
      await transaction.commit()
      console.log('✅ 迁移完成：consumption_records 业务结果态字段已添加（P1级）')
      console.log('\n📝 效果：')
      console.log('   - 业务主表记录业务最终状态（final_status）')
      console.log('   - 审批流表记录审批过程状态（ContentReviewRecord.audit_status）')
      console.log('   - 职责清晰分离，避免状态混淆')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('⚠️ 回滚操作：删除业务结果态字段')

      // 1. 删除索引
      await queryInterface.removeIndex('consumption_records', 'idx_consumption_final_status', {
        transaction
      })
      console.log('   ✅ 索引已删除')

      // 2. 删除字段
      await queryInterface.removeColumn('consumption_records', 'settled_at', { transaction })
      await queryInterface.removeColumn('consumption_records', 'final_status', { transaction })
      console.log('   ✅ 字段已删除')

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
