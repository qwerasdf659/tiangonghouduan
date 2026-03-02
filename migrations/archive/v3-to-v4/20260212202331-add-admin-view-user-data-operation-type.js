'use strict'

/**
 * 数据库迁移：新增 admin_view_user_data 审计操作类型
 *
 * 业务背景：
 * - 路由分离方案（抽奖接口安全改造）将用户端和管理端路由分离
 * - 管理端新增3个查看用户数据的接口（抽奖历史、积分、统计）
 * - 需要新增审计操作类型，记录管理员查看用户数据的行为
 *
 * 变更内容：
 * - admin_operation_logs.operation_type ENUM 新增 'admin_view_user_data' 值
 *
 * 对应常量文件：constants/AuditOperationTypes.js（SSOT 已同步更新）
 *
 * @date 2026-02-12
 */

const { DB_ENUM_VALUES } = require('../constants/AuditOperationTypes')

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('📦 [迁移] 开始：新增 admin_view_user_data 审计操作类型...')

    // 修改 admin_operation_logs.operation_type ENUM，使用常量文件作为唯一真相源
    await queryInterface.changeColumn('admin_operation_logs', 'operation_type', {
      type: Sequelize.ENUM(...DB_ENUM_VALUES),
      allowNull: false,
      comment: '操作类型（审计操作类型枚举，SSOT: constants/AuditOperationTypes.js）'
    })

    console.log('✅ [迁移] 完成：admin_view_user_data 已添加到 operation_type ENUM')
    console.log(`   当前 ENUM 值总数：${DB_ENUM_VALUES.length}`)
  },

  async down(queryInterface, Sequelize) {
    console.log('⏪ [回滚] 开始：移除 admin_view_user_data 审计操作类型...')

    // 回滚时使用不含 admin_view_user_data 的枚举值列表
    const rollbackValues = DB_ENUM_VALUES.filter(val => val !== 'admin_view_user_data')

    await queryInterface.changeColumn('admin_operation_logs', 'operation_type', {
      type: Sequelize.ENUM(...rollbackValues),
      allowNull: false,
      comment: '操作类型（审计操作类型枚举，SSOT: constants/AuditOperationTypes.js）'
    })

    console.log('✅ [回滚] 完成：admin_view_user_data 已从 operation_type ENUM 移除')
  }
}
