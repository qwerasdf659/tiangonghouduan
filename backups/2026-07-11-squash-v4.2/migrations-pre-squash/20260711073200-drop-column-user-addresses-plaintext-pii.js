'use strict'

/**
 * 删除 PII 明文残留列: user_addresses 明文三列（技术债务方案 拍板 19 / 删40，2026-07-11）
 *
 * 背景:
 * - PII 加密改造已走完「双写→回填→切读」三步：模型层 receiver_name/receiver_phone/detail_address
 *   均为 VIRTUAL 虚拟字段（读写 *_encrypted 密文列，AES-256-GCM），物理明文列已无任何读写；
 * - 直连库核对（2026-07-11）：明文三列 0 条有值，加密列 100% 覆盖；
 * - 个保法/等保合规标准动作的最后一刀：drop 明文列（美团/滴滴数据安全改造同模式）。
 *
 * 变更内容:
 * 1. 删除 user_addresses.receiver_name（明文，密文列 receiver_name_encrypted 保留）
 * 2. 删除 user_addresses.receiver_phone（明文，密文列 receiver_phone_encrypted 保留）
 * 3. 删除 user_addresses.detail_address（明文，密文列 detail_address_encrypted 保留）
 *
 * 回滚: 重建三列为空列（明文数据本就为空，无信息损失）。
 */

module.exports = {
  async up(queryInterface) {
    const tableDefinition = await queryInterface.describeTable('user_addresses')
    for (const column of ['receiver_name', 'receiver_phone', 'detail_address']) {
      if (tableDefinition[column]) {
        await queryInterface.removeColumn('user_addresses', column)
        console.log(`✅ user_addresses.${column} 明文列已删除（密文列 ${column}_encrypted 为唯一存储）`)
      } else {
        console.log(`⏭️ user_addresses.${column} 列不存在，跳过`)
      }
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('user_addresses', 'receiver_name', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: '收件人姓名（已废弃：密文存 receiver_name_encrypted）'
    })
    await queryInterface.addColumn('user_addresses', 'receiver_phone', {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: '收件人手机号（已废弃：密文存 receiver_phone_encrypted）'
    })
    await queryInterface.addColumn('user_addresses', 'detail_address', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: '详细地址（已废弃：密文存 detail_address_encrypted）'
    })
    console.log('⏪ user_addresses 明文三列已重建（空列，原数据本为空）')
  }
}
