/**
 * 餐厅积分抽奖系统 V4.0 - 数据库迁移
 *
 * 迁移名称：扩展points_transactions表business_type枚举（添加consumption_reward）
 * 迁移类型：alter-column（修改列）
 * 版本号：v4.1.0
 * 创建时间：2025-10-30
 *
 * 变更说明：
 * 1. 扩展business_type枚举值，添加'consumption_reward'（消费奖励）
 * 2. 这是实施商家扫码录入方案A所需的关键变更
 *
 * 依赖关系：
 * - 依赖points_transactions表已存在
 * - 需要在ConsumptionRecord功能之前执行
 *
 * 影响范围：
 * - 修改points_transactions表的business_type字段
 * - 允许创建类型为consumption_reward的积分交易记录
 */

'use strict'

module.exports = {
  /**
   * 执行迁移（up方向）
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize')} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始扩展points_transactions表的business_type枚举...')

      /*
       * ========================================
       * 扩展business_type枚举值
       * ========================================
       * MySQL的ENUM类型修改需要使用ALTER TABLE ... MODIFY COLUMN语句
       */
      await queryInterface.sequelize.query(
        `ALTER TABLE points_transactions 
         MODIFY COLUMN business_type ENUM(
           'task_complete',
           'lottery_consume',
           'admin_adjust',
           'refund',
           'expire',
           'behavior_reward',
           'recommendation_bonus',
           'activity_bonus',
           'consumption_reward'
         ) NOT NULL COMMENT '业务类型：task_complete-任务完成，lottery_consume-抽奖消耗，admin_adjust-管理员调整，refund-退款，expire-积分过期，behavior_reward-行为奖励，recommendation_bonus-推荐奖励，activity_bonus-活动奖励，consumption_reward-消费奖励'`,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ points_transactions表business_type枚举扩展完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移（down方向）
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize')} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始回滚points_transactions表的business_type枚举...')

      // 检查是否有consumption_reward类型的记录
      const [results] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as count FROM points_transactions WHERE business_type = 'consumption_reward'",
        { transaction }
      )

      if (results[0].count > 0) {
        console.warn(`⚠️ 警告：存在${results[0].count}条consumption_reward类型的记录`)
        console.warn('⚠️ 回滚将删除这些记录')

        // 删除consumption_reward类型的记录
        await queryInterface.sequelize.query(
          "DELETE FROM points_transactions WHERE business_type = 'consumption_reward'",
          { transaction }
        )
      }

      // 恢复原ENUM值（移除consumption_reward）
      await queryInterface.sequelize.query(
        `ALTER TABLE points_transactions 
         MODIFY COLUMN business_type ENUM(
           'task_complete',
           'lottery_consume',
           'admin_adjust',
           'refund',
           'expire',
           'behavior_reward',
           'recommendation_bonus',
           'activity_bonus'
         ) NOT NULL COMMENT '业务类型'`,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ points_transactions表business_type枚举回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
