'use strict'

/**
 * 添加列: user_addresses 收货信息加密三列（PII 收货信息加密）
 *
 * 创建时间: 2026-06-08（路线B 合规改造 模块B·第5步）
 * 创建原因（第九节）:
 * - 收货人姓名/手机号/详细地址属敏感 PII，明文存储有合规风险。
 * - 改为 AES-256-GCM 密文列：receiver_name_encrypted / receiver_phone_encrypted / detail_address_encrypted。
 * - 实测 user_addresses 当前 0 行，无需回填；模型将原字段改为虚拟字段透明加解密，展示层脱敏。
 *
 * 与手机号方案一致（透明加解密），但收货信息无需盲索引（不按其等值查询）。
 *
 * 回滚: 删除三个密文列（原明文列保留未动）
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.addColumn(
        'user_addresses',
        'receiver_name_encrypted',
        { type: Sequelize.STRING(255), allowNull: true, comment: '收件人姓名密文（AES-256-GCM）' },
        { transaction }
      )
      await queryInterface.addColumn(
        'user_addresses',
        'receiver_phone_encrypted',
        { type: Sequelize.STRING(255), allowNull: true, comment: '收件人手机号密文（AES-256-GCM）' },
        { transaction }
      )
      await queryInterface.addColumn(
        'user_addresses',
        'detail_address_encrypted',
        { type: Sequelize.STRING(1024), allowNull: true, comment: '详细地址密文（AES-256-GCM）' },
        { transaction }
      )

      // 原三个明文列改为可空（虚拟字段不再直接写入明文列）
      await queryInterface.changeColumn(
        'user_addresses',
        'receiver_name',
        { type: Sequelize.STRING(50), allowNull: true, comment: '收件人姓名（已弃用明文列，保留待删）' },
        { transaction }
      )
      await queryInterface.changeColumn(
        'user_addresses',
        'receiver_phone',
        { type: Sequelize.STRING(20), allowNull: true, comment: '收件人手机号（已弃用明文列，保留待删）' },
        { transaction }
      )
      await queryInterface.changeColumn(
        'user_addresses',
        'detail_address',
        { type: Sequelize.STRING(500), allowNull: true, comment: '详细地址（已弃用明文列，保留待删）' },
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.removeColumn('user_addresses', 'receiver_name_encrypted', { transaction })
      await queryInterface.removeColumn('user_addresses', 'receiver_phone_encrypted', {
        transaction
      })
      await queryInterface.removeColumn('user_addresses', 'detail_address_encrypted', {
        transaction
      })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
