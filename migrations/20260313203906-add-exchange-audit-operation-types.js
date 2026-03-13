'use strict'

/**
 * 数据库迁移：为 admin_operation_logs 表添加兑换订单细分审计操作类型
 *
 * 新增 ENUM 值：
 * - exchange_cancel: 兑换订单取消
 * - exchange_reject: 兑换订单拒绝
 * - exchange_ship: 兑换订单发货
 * - exchange_confirm_receipt: 兑换订单确认收货
 *
 * @since 2026-03-13
 * @see constants/AuditOperationTypes.js
 */

const { DB_ENUM_VALUES } = require('../constants/AuditOperationTypes')

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('admin_operation_logs', 'operation_type', {
      type: Sequelize.ENUM(...DB_ENUM_VALUES),
      allowNull: false,
      comment: '操作类型（同步 constants/AuditOperationTypes.js 枚举定义）'
    })
  },

  async down(queryInterface, Sequelize) {
    const oldValues = DB_ENUM_VALUES.filter(
      v =>
        !['exchange_cancel', 'exchange_reject', 'exchange_ship', 'exchange_confirm_receipt'].includes(v)
    )
    await queryInterface.changeColumn('admin_operation_logs', 'operation_type', {
      type: Sequelize.ENUM(...oldValues),
      allowNull: false
    })
  }
}
