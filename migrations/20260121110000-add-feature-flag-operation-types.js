'use strict'

/**
 * 添加 Feature Flag 操作类型到 admin_operation_logs 表的 ENUM
 *
 * 新增操作类型：
 * - feature_flag_create: 功能开关创建
 * - feature_flag_update: 功能开关更新
 * - feature_flag_delete: 功能开关删除
 * - feature_flag_toggle: 功能开关启用/禁用
 *
 * @migration 20260121110000-add-feature-flag-operation-types
 * @author Feature Flag 灰度发布模块
 * @since 2026-01-21
 * @see docs/Feature-Flag灰度发布功能实施方案.md
 */

const { DB_ENUM_VALUES } = require('../constants/AuditOperationTypes')

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📝 开始更新 admin_operation_logs.operation_type ENUM...')

      // 获取当前 ENUM 值
      const [enumResult] = await queryInterface.sequelize.query(`
        SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'admin_operation_logs'
          AND COLUMN_NAME = 'operation_type'
      `, { transaction })

      if (enumResult.length === 0) {
        console.log('⚠️ admin_operation_logs 表或 operation_type 列不存在，跳过迁移')
        await transaction.commit()
        return
      }

      const columnType = enumResult[0].COLUMN_TYPE || ''
      console.log('📋 当前 ENUM 类型:', columnType.substring(0, 100) + '...')

      // 检查是否已包含新类型
      if (columnType.includes('feature_flag_create')) {
        console.log('✅ ENUM 已包含 feature_flag 操作类型，跳过迁移')
        await transaction.commit()
        return
      }

      // 构建新的 ENUM 值列表
      const enumValuesStr = DB_ENUM_VALUES.map(v => `'${v}'`).join(',')

      // 修改 ENUM 类型
      await queryInterface.sequelize.query(`
        ALTER TABLE admin_operation_logs
        MODIFY COLUMN operation_type ENUM(${enumValuesStr})
        NOT NULL
        COMMENT '操作类型（含 Feature Flag 操作）'
      `, { transaction })

      console.log('✅ admin_operation_logs.operation_type ENUM 更新成功')
      console.log('📊 新增操作类型：feature_flag_create, feature_flag_update, feature_flag_delete, feature_flag_toggle')

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      console.error('❌ ENUM 更新失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    // 回滚时不删除 ENUM 值（可能已有数据使用）
    console.log('⚠️ ENUM 类型回滚需要手动处理（可能已有数据使用这些类型）')
    console.log('💡 如需回滚，请先删除使用这些操作类型的审计日志记录')
  }
}

