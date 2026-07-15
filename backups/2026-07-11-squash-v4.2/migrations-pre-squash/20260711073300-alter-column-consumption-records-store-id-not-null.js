'use strict'

/**
 * 收紧列约束: consumption_records.store_id NOT NULL（技术债务方案 3.3，2026-07-11）
 *
 * 背景:
 * - store_id 原 allowNull:true 为「兼容历史数据」的过渡设计；
 * - 直连库核对（2026-07-11）：15 条存量记录 store_id NULL 0 条，历史兼容前提已消失；
 * - 业务语义：消费小票必然发生在某一门店，store_id 是提交时的必填参数（门店扫码链路），
 *   数据库层面强制约束 > 应用层控制。
 *
 * 变更内容:
 * 1. consumption_records.store_id 由 NULL 收紧为 NOT NULL（外键 stores.store_id 保持不变）
 *
 * 回滚: 恢复 allowNull:true。
 */

module.exports = {
  async up(queryInterface) {
    // 前置校验：确认无 NULL 存量（有则中止，避免迁移失败留下半完成状态）
    const [rows] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS null_count FROM consumption_records WHERE store_id IS NULL'
    )
    if (rows[0].null_count > 0) {
      throw new Error(
        `consumption_records 存在 ${rows[0].null_count} 条 store_id NULL 记录，需先补数据再收紧约束`
      )
    }
    // MODIFY 保持类型与外键不变，仅收紧 NULL 约束
    await queryInterface.sequelize.query(
      "ALTER TABLE consumption_records MODIFY COLUMN store_id INT NOT NULL COMMENT '门店ID（外键关联 stores 表，消费小票必属某一门店）'"
    )
    console.log('✅ consumption_records.store_id 已收紧为 NOT NULL')
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TABLE consumption_records MODIFY COLUMN store_id INT NULL COMMENT '门店ID（外键关联 stores 表）'"
    )
    console.log('⏪ consumption_records.store_id 已恢复为允许 NULL')
  }
}
