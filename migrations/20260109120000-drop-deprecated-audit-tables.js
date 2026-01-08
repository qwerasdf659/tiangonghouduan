'use strict'

/**
 * 删除废弃的审核审计表
 *
 * 业务背景（P1级 - 功能重复检查报告 2026-01-08）：
 * - merchant_points_reviews：商家积分审核表（0行，未使用）
 * - role_change_logs：角色变更日志表（0行，未使用）
 *
 * 决策依据（2026-01-09）：
 * 1. merchant_points_reviews：
 *    - 已决策迁移到统一审批流（ContentReviewRecord）
 *    - 表中无数据，可安全删除
 *    - 业务逻辑已迁移到 ContentAuditEngine
 *
 * 2. role_change_logs：
 *    - 已决策改用 UserRoleChangeRecord + AdminOperationLog 组合
 *    - 表中无数据，可安全删除
 *    - 避免与 user_role_change_records 形成重复
 *
 * 解决方案：
 * - 删除外键约束（如有）
 * - 删除表
 * - 删除对应的模型文件（需手动执行）
 *
 * 决策时间：2026-01-09
 * 风险等级：🟢 低风险（表中无数据，且已确认不再使用）
 *
 * @type {import('sequelize-cli').Migration}
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始执行：删除废弃的审核审计表（P1级）')

      // ==================== 1. 删除 merchant_points_reviews 表 ====================
      console.log('\n📊 步骤1：删除 merchant_points_reviews 表...')

      // 1.1 检查表是否存在
      const [merchantTables] = await queryInterface.sequelize.query(
        `SHOW TABLES LIKE 'merchant_points_reviews'`,
        { transaction }
      )

      if (merchantTables.length > 0) {
        // 1.2 检查表中是否有数据
        const [merchantCount] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) as count FROM merchant_points_reviews`,
          { transaction }
        )

        const count = merchantCount[0].count
        console.log(`   表中数据行数: ${count}`)

        if (count > 0) {
          throw new Error(
            `merchant_points_reviews 表中有 ${count} 行数据，不能删除。请先迁移数据。`
          )
        }

        // 1.3 查询并删除外键约束
        console.log('   检查外键约束...')
        const [foreignKeys] = await queryInterface.sequelize.query(
          `SELECT CONSTRAINT_NAME 
           FROM information_schema.KEY_COLUMN_USAGE 
           WHERE TABLE_SCHEMA = DATABASE() 
             AND TABLE_NAME = 'merchant_points_reviews' 
             AND REFERENCED_TABLE_NAME IS NOT NULL`,
          { transaction }
        )

        for (const fk of foreignKeys) {
          console.log(`   删除外键约束: ${fk.CONSTRAINT_NAME}`)
          await queryInterface.sequelize.query(
            `ALTER TABLE merchant_points_reviews DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`,
            { transaction }
          )
        }

        // 1.4 删除表
        await queryInterface.dropTable('merchant_points_reviews', { transaction })
        console.log('   ✅ merchant_points_reviews 表已删除')
      } else {
        console.log('   ⏭️ merchant_points_reviews 表不存在，跳过')
      }

      // ==================== 2. 删除 role_change_logs 表 ====================
      console.log('\n📊 步骤2：删除 role_change_logs 表...')

      // 2.1 检查表是否存在
      const [roleTables] = await queryInterface.sequelize.query(
        `SHOW TABLES LIKE 'role_change_logs'`,
        { transaction }
      )

      if (roleTables.length > 0) {
        // 2.2 检查表中是否有数据
        const [roleCount] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) as count FROM role_change_logs`,
          { transaction }
        )

        const count = roleCount[0].count
        console.log(`   表中数据行数: ${count}`)

        if (count > 0) {
          throw new Error(`role_change_logs 表中有 ${count} 行数据，不能删除。请先迁移数据。`)
        }

        // 2.3 查询并删除外键约束
        console.log('   检查外键约束...')
        const [foreignKeys] = await queryInterface.sequelize.query(
          `SELECT CONSTRAINT_NAME 
           FROM information_schema.KEY_COLUMN_USAGE 
           WHERE TABLE_SCHEMA = DATABASE() 
             AND TABLE_NAME = 'role_change_logs' 
             AND REFERENCED_TABLE_NAME IS NOT NULL`,
          { transaction }
        )

        for (const fk of foreignKeys) {
          console.log(`   删除外键约束: ${fk.CONSTRAINT_NAME}`)
          await queryInterface.sequelize.query(
            `ALTER TABLE role_change_logs DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`,
            { transaction }
          )
        }

        // 2.4 删除表
        await queryInterface.dropTable('role_change_logs', { transaction })
        console.log('   ✅ role_change_logs 表已删除')
      } else {
        console.log('   ⏭️ role_change_logs 表不存在，跳过')
      }

      // 3. 提交事务
      await transaction.commit()
      console.log('\n✅ 迁移完成：废弃的审核审计表已删除（P1级）')
      console.log('\n📝 后续手动操作：')
      console.log('   1. 删除模型文件: models/MerchantPointsReview.js')
      console.log('   2. 删除模型文件: models/RoleChangeLog.js')
      console.log('   3. 从 models/index.js 移除相关引用')
      console.log('   4. 删除服务文件: services/MerchantReviewService.js（业务逻辑已迁移）')
      console.log('   5. 删除路由文件: routes/v4/merchant/reviews.js（或改用统一审批流）')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('⚠️ 回滚操作：重新创建废弃的表')
    console.log('   警告：这些表已被废弃，不建议回滚')
    console.log('   如需回滚，请参考原始迁移文件手动创建表结构')
  }
}
