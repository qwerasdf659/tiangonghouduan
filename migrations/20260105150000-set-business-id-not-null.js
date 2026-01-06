/**
 * 设置 business_id 字段 NOT NULL 约束
 *
 * 背景：幂等性保护现状核查报告（2026-01-05）
 * - 历史数据已回填完成
 * - 模型已更新为 allowNull: false
 * - 现需同步数据库约束
 *
 * 涉及表：
 * - lottery_draws
 * - consumption_records
 * - exchange_records
 * - trade_orders
 */

'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始设置 business_id NOT NULL 约束...')

      // 1. 检查是否有 NULL 数据（安全检查）
      const tables = ['lottery_draws', 'consumption_records', 'exchange_records', 'trade_orders']

      for (const table of tables) {
        const [nullRecords] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) as cnt FROM \`${table}\` WHERE business_id IS NULL`,
          { transaction }
        )

        if (nullRecords[0].cnt > 0) {
          throw new Error(
            `表 ${table} 仍有 ${nullRecords[0].cnt} 条 business_id 为 NULL 的记录，请先回填数据`
          )
        }

        console.log(`✅ ${table}: 无 NULL 数据`)
      }

      // 2. 设置 NOT NULL 约束
      await queryInterface.sequelize.query(
        "ALTER TABLE `lottery_draws` MODIFY COLUMN `business_id` VARCHAR(150) NOT NULL COMMENT '业务唯一键（格式：lottery_draw_{user_id}_{session_id}_{draw_index}）- 必填'",
        { transaction }
      )
      console.log('✅ lottery_draws.business_id 已设置 NOT NULL')

      await queryInterface.sequelize.query(
        "ALTER TABLE `consumption_records` MODIFY COLUMN `business_id` VARCHAR(150) NOT NULL COMMENT '业务唯一键（格式：consumption_{merchant_id}_{timestamp}_{random}）- 必填'",
        { transaction }
      )
      console.log('✅ consumption_records.business_id 已设置 NOT NULL')

      await queryInterface.sequelize.query(
        "ALTER TABLE `exchange_records` MODIFY COLUMN `business_id` VARCHAR(150) NOT NULL COMMENT '业务唯一键（格式：exchange_{user_id}_{item_id}_{timestamp}）- 必填'",
        { transaction }
      )
      console.log('✅ exchange_records.business_id 已设置 NOT NULL')

      await queryInterface.sequelize.query(
        "ALTER TABLE `trade_orders` MODIFY COLUMN `business_id` VARCHAR(150) NOT NULL COMMENT '业务唯一键（格式：trade_order_{buyer_id}_{listing_id}_{timestamp}）- 必填'",
        { transaction }
      )
      console.log('✅ trade_orders.business_id 已设置 NOT NULL')

      await transaction.commit()
      console.log('✅ 迁移完成：所有 business_id 字段已设置 NOT NULL 约束')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('回滚：移除 business_id NOT NULL 约束...')

      await queryInterface.sequelize.query(
        "ALTER TABLE `lottery_draws` MODIFY COLUMN `business_id` VARCHAR(150) NULL COMMENT '业务唯一键'",
        { transaction }
      )

      await queryInterface.sequelize.query(
        "ALTER TABLE `consumption_records` MODIFY COLUMN `business_id` VARCHAR(150) NULL COMMENT '业务唯一键'",
        { transaction }
      )

      await queryInterface.sequelize.query(
        "ALTER TABLE `exchange_records` MODIFY COLUMN `business_id` VARCHAR(150) NULL COMMENT '业务唯一键'",
        { transaction }
      )

      await queryInterface.sequelize.query(
        "ALTER TABLE `trade_orders` MODIFY COLUMN `business_id` VARCHAR(150) NULL COMMENT '业务唯一键'",
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
