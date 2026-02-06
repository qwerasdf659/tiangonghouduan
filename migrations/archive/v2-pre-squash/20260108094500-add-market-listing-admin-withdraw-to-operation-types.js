'use strict'

/**
 * 添加 market_listing_admin_withdraw 到 admin_operation_logs 的 operation_type 枚举
 *
 * 业务背景：
 * - C2C 材料交易 Phase 2 需要客服强制撤回功能
 * - 强制撤回操作需要记录审计日志
 * - operation_type 需要新增 market_listing_admin_withdraw 值
 *
 * 解决方案：
 * - 修改 operation_type 枚举，添加 market_listing_admin_withdraw 值
 *
 * 决策时间：2026-01-08
 * 风险等级：🟢 低风险（仅添加枚举值，不影响现有数据）
 *
 * @type {import('sequelize-cli').Migration}
 */

// 从统一枚举定义获取所有值
const { DB_ENUM_VALUES } = require('../constants/AuditOperationTypes')

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始执行：添加 market_listing_admin_withdraw 到 operation_type 枚举')

      // 1. 检查当前枚举值
      console.log('📊 步骤1：检查当前枚举值...')
      const [columns] = await queryInterface.sequelize.query(
        `SHOW COLUMNS FROM admin_operation_logs WHERE Field = 'operation_type'`,
        { transaction }
      )

      if (columns.length === 0) {
        throw new Error('operation_type 字段不存在')
      }

      const currentType = columns[0].Type
      console.log(`   当前类型: ${currentType}`)

      // 检查是否已包含 market_listing_admin_withdraw
      if (currentType.includes('market_listing_admin_withdraw')) {
        console.log('   ⏭️ market_listing_admin_withdraw 已存在于枚举中，跳过修改')
        await transaction.commit()
        return
      }

      // 2. 构建新的枚举值列表
      console.log('📊 步骤2：修改 operation_type 枚举...')
      const enumValuesList = DB_ENUM_VALUES.map(v => `'${v}'`).join(', ')

      await queryInterface.sequelize.query(
        `ALTER TABLE admin_operation_logs 
         MODIFY COLUMN operation_type ENUM(${enumValuesList}) 
         NOT NULL 
         COMMENT '操作类型（V4.5.0统一枚举定义 - 详见 constants/AuditOperationTypes.js）'`,
        { transaction }
      )
      console.log('   ✅ operation_type 枚举修改成功')

      // 3. 提交事务
      await transaction.commit()
      console.log('✅ 迁移完成：market_listing_admin_withdraw 操作类型已添加')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    // 由于只是添加枚举值，回滚操作可以简单地保留现有枚举
    // 删除枚举值需要确保没有数据使用该值
    console.log('⚠️ 回滚操作：不删除 market_listing_admin_withdraw，保持现有枚举')
    console.log('   原因：删除枚举值需要先检查是否有数据使用该值')
    console.log('   如需删除，请手动执行数据库操作')
  }
}
