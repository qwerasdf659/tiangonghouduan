/**
 * 修复consumption_records.record_id的AUTO_INCREMENT属性
 *
 * 问题：record_id字段缺少AUTO_INCREMENT，导致插入记录时失败
 * 解决方案：为record_id添加AUTO_INCREMENT属性
 */

'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始修复consumption_records.record_id的AUTO_INCREMENT属性...')

      // 修改record_id字段，添加AUTO_INCREMENT
      await queryInterface.sequelize.query(
        "ALTER TABLE `consumption_records` MODIFY COLUMN `record_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '消费记录ID（主键，自增）'",
        { transaction }
      )

      console.log('✅ record_id字段AUTO_INCREMENT属性已添加')

      await transaction.commit()
      console.log('✅ 迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('回滚：移除AUTO_INCREMENT属性...')

      await queryInterface.sequelize.query(
        "ALTER TABLE `consumption_records` MODIFY COLUMN `record_id` BIGINT NOT NULL COMMENT '消费记录ID（主键）'",
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
