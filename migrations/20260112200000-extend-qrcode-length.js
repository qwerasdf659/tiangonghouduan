/**
 * 迁移文件：扩展 qr_code 字段长度以支持 v2 动态二维码
 *
 * 业务背景：
 * - v2 动态二维码包含 base64 编码的 payload + HMAC 签名
 * - 典型长度约 200-250 字符
 * - 原字段 varchar(150) 不足以存储 v2 格式
 *
 * 变更内容：
 * - consumption_records.qr_code: varchar(150) → varchar(300)
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md AC1.2
 */

'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('📝 开始迁移：扩展 qr_code 字段长度')

    await queryInterface.changeColumn('consumption_records', 'qr_code', {
      type: Sequelize.STRING(300),
      allowNull: false,
      comment: '用户动态二维码（v2格式: QRV2_{payload}_{signature}，约200-250字符）'
    })

    console.log('✅ qr_code 字段已扩展至 varchar(300)')
  },

  async down(queryInterface, Sequelize) {
    console.log('📝 回滚：恢复 qr_code 字段长度')

    await queryInterface.changeColumn('consumption_records', 'qr_code', {
      type: Sequelize.STRING(150),
      allowNull: false,
      comment: '用户二维码'
    })

    console.log('✅ qr_code 字段已恢复至 varchar(150)')
  }
}
