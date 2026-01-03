/**
 * 数据库迁移：重命名模型表名以提升语义清晰度
 *
 * 创建原因：解决模型命名混淆问题,降低长期维护成本
 * 迁移类型：rename-table（表重命名）
 * 创建时间：2025-10-14 18:10:55 北京时间
 *
 * 重命名说明：
 * 1. audit_logs → admin_operation_logs（管理员操作日志）
 * 2. audit_records → content_review_records（内容审核记录）
 * 3. customer_sessions → customer_service_sessions（客服会话）
 * 4. user_sessions → authentication_sessions（认证会话）
 *
 * 影响范围：4个表重命名，数据完整性保持
 * 数据安全：仅重命名表名，不修改数据和结构
 * 回滚方案：完整实现down方法，可安全回滚
 */

'use strict'

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始重命名模型表名（提升语义清晰度）...\n')

      // 1. 重命名 audit_logs → admin_operation_logs
      console.log('📋 [1/4] 重命名表: audit_logs → admin_operation_logs')
      await queryInterface.renameTable('audit_logs', 'admin_operation_logs', { transaction })
      console.log('✅ 完成: audit_logs → admin_operation_logs\n')

      // 2. 重命名 audit_records → content_review_records
      console.log('📋 [2/4] 重命名表: audit_records → content_review_records')
      await queryInterface.renameTable('audit_records', 'content_review_records', { transaction })
      console.log('✅ 完成: audit_records → content_review_records\n')

      // 3. 重命名 customer_sessions → customer_service_sessions
      console.log('📋 [3/4] 重命名表: customer_sessions → customer_service_sessions')
      await queryInterface.renameTable('customer_sessions', 'customer_service_sessions', {
        transaction
      })
      console.log('✅ 完成: customer_sessions → customer_service_sessions\n')

      // 4. 重命名 user_sessions → authentication_sessions
      console.log('📋 [4/4] 重命名表: user_sessions → authentication_sessions')
      await queryInterface.renameTable('user_sessions', 'authentication_sessions', { transaction })
      console.log('✅ 完成: user_sessions → authentication_sessions\n')

      await transaction.commit()
      console.log('🎉 所有表重命名完成，数据完整性保持')
      console.log('📊 重命名统计: 4个表成功重命名')
      console.log('✅ 迁移成功完成\n')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 表重命名失败，已回滚:', error.message)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚表名重命名...\n')

      // 回滚操作：恢复原表名（顺序与up相反）
      console.log('📋 [1/4] 回滚: authentication_sessions → user_sessions')
      await queryInterface.renameTable('authentication_sessions', 'user_sessions', { transaction })
      console.log('✅ 完成\n')

      console.log('📋 [2/4] 回滚: customer_service_sessions → customer_sessions')
      await queryInterface.renameTable('customer_service_sessions', 'customer_sessions', {
        transaction
      })
      console.log('✅ 完成\n')

      console.log('📋 [3/4] 回滚: content_review_records → audit_records')
      await queryInterface.renameTable('content_review_records', 'audit_records', { transaction })
      console.log('✅ 完成\n')

      console.log('📋 [4/4] 回滚: admin_operation_logs → audit_logs')
      await queryInterface.renameTable('admin_operation_logs', 'audit_logs', { transaction })
      console.log('✅ 完成\n')

      await transaction.commit()
      console.log('🔄 表名已成功回滚到原始状态')
      console.log('✅ 回滚完成\n')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 表名回滚失败:', error.message)
      throw error
    }
  }
}
