/**
 * 数据库迁移：扩展 admin_operation_logs 表的 operation_type ENUM
 *
 * 迁移名称：extend-admin-operation-logs-enum-audit-unification
 * 版本：V4.5.0（审计统一入口整合）
 *
 * 目的：
 * - 添加 6 个新的操作类型到 operation_type ENUM
 * - 统一审计操作类型定义，消除多处硬编码不一致
 *
 * 新增操作类型：
 * 1. asset_adjustment - 资产调整（管理员调整用户资产）
 * 2. lottery_force_win - 强制中奖
 * 3. lottery_force_lose - 强制不中奖
 * 4. lottery_probability_adjust - 概率调整
 * 5. lottery_user_queue - 用户队列
 * 6. lottery_clear_settings - 清除设置
 *
 * 依赖：constants/AuditOperationTypes.js 统一枚举定义
 *
 * 创建时间：2026-01-08
 */

'use strict'

const { DB_ENUM_VALUES } = require('../constants/AuditOperationTypes')

module.exports = {
  /**
   * 执行迁移：扩展 ENUM 类型
   *
   * @param {Object} queryInterface - Sequelize QueryInterface
   * @param {Object} Sequelize - Sequelize 对象
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    /**
     * MySQL ALTER ENUM 的正确方式：
     * 1. ALTER TABLE ... MODIFY COLUMN ... ENUM(...)
     * 2. 必须包含所有现有值 + 新值
     *
     * 注意：MySQL 的 ENUM 类型扩展不会影响现有数据
     */

    // 完整的 ENUM 值列表（来自统一枚举定义）
    const enumValuesSQL = DB_ENUM_VALUES.map(v => `'${v}'`).join(', ')

    console.log('========================================')
    console.log('[迁移] 扩展 admin_operation_logs.operation_type ENUM')
    console.log(`[迁移] 新的 ENUM 值列表（共 ${DB_ENUM_VALUES.length} 个）:`)
    console.log(DB_ENUM_VALUES)
    console.log('========================================')

    // 执行 ALTER TABLE 修改 ENUM 类型
    await queryInterface.sequelize.query(`
      ALTER TABLE admin_operation_logs
      MODIFY COLUMN operation_type ENUM(${enumValuesSQL})
      NOT NULL
      COMMENT '操作类型（V4.5.0统一枚举定义）'
    `)

    console.log('[迁移] admin_operation_logs.operation_type ENUM 扩展完成')

    // 验证迁移结果
    const [columns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_operation_logs'
        AND COLUMN_NAME = 'operation_type'
    `)

    if (columns.length > 0) {
      console.log('[迁移] 验证结果 - 当前 ENUM 定义:')
      console.log(columns[0].COLUMN_TYPE)
    }
  },

  /**
   * 回滚迁移：恢复到原始 ENUM 类型
   *
   * @param {Object} queryInterface - Sequelize QueryInterface
   * @param {Object} Sequelize - Sequelize 对象
   * @returns {Promise<void>}
   *
   * 注意：回滚时需要确保没有使用新增 ENUM 值的记录，否则会失败
   */
  async down(queryInterface, Sequelize) {
    // 原始 18 个 ENUM 值（回滚到迁移前的状态）
    const originalEnumValues = [
      'points_adjust',
      'exchange_audit',
      'product_update',
      'product_create',
      'product_delete',
      'user_status_change',
      'prize_config',
      'prize_create',
      'prize_delete',
      'prize_stock_adjust',
      'campaign_config',
      'role_assign',
      'role_change',
      'system_config',
      'session_assign',
      'inventory_operation',
      'inventory_transfer',
      'consumption_audit'
    ]

    const enumValuesSQL = originalEnumValues.map(v => `'${v}'`).join(', ')

    console.log('========================================')
    console.log('[回滚] 恢复 admin_operation_logs.operation_type ENUM')
    console.log('========================================')

    // 检查是否有使用新增值的记录
    const newEnumValues = [
      'asset_adjustment',
      'lottery_force_win',
      'lottery_force_lose',
      'lottery_probability_adjust',
      'lottery_user_queue',
      'lottery_clear_settings'
    ]

    const newValuesSQL = newEnumValues.map(v => `'${v}'`).join(', ')

    const [existingRecords] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count
      FROM admin_operation_logs
      WHERE operation_type IN (${newValuesSQL})
    `)

    if (existingRecords[0].count > 0) {
      throw new Error(
        `[回滚失败] 存在 ${existingRecords[0].count} 条使用新增 ENUM 值的记录，` +
          '请先删除或更新这些记录后再回滚'
      )
    }

    // 执行回滚
    await queryInterface.sequelize.query(`
      ALTER TABLE admin_operation_logs
      MODIFY COLUMN operation_type ENUM(${enumValuesSQL})
      NOT NULL
      COMMENT '操作类型'
    `)

    console.log('[回滚] admin_operation_logs.operation_type ENUM 已恢复')
  }
}
