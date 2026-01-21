'use strict'

/**
 * 迁移脚本：为抽奖指标表添加 empty_count 字段
 *
 * 业务背景：
 * Decision 4 - 分离 empty 与 fallback 统计
 * - empty（真正的空奖）应与 fallback（保底奖品）分开统计
 * - empty 触发时需要运营预警（表示系统异常或配置问题）
 * - fallback 是正常的保底机制，不应与异常空奖混淆
 *
 * 变更内容：
 * 1. lottery_hourly_metrics 表添加 empty_count 字段
 * 2. lottery_daily_metrics 表添加 empty_count 字段
 *
 * @module migrations/add-empty-count-to-lottery-metrics
 * @since 2026-01-21
 */

module.exports = {
  /**
   * 执行迁移：添加 empty_count 字段
   * @param {QueryInterface} queryInterface - Sequelize 查询接口
   * @param {Sequelize} Sequelize - Sequelize 对象
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 为 lottery_hourly_metrics 表添加 empty_count 字段
      await queryInterface.addColumn(
        'lottery_hourly_metrics',
        'empty_count',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '真正空奖次数（系统异常导致的空奖，与正常fallback保底分开统计）'
        },
        { transaction }
      )

      console.log('✅ lottery_hourly_metrics.empty_count 字段添加成功')

      // 2. 为 lottery_daily_metrics 表添加 empty_count 字段
      await queryInterface.addColumn(
        'lottery_daily_metrics',
        'empty_count',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '真正空奖次数（系统异常导致的空奖，与正常fallback保底分开统计）'
        },
        { transaction }
      )

      console.log('✅ lottery_daily_metrics.empty_count 字段添加成功')

      await transaction.commit()
      console.log('✅ 迁移完成：empty_count 字段已添加到两个指标表')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：移除 empty_count 字段
   * @param {QueryInterface} queryInterface - Sequelize 查询接口
   * @param {Sequelize} Sequelize - Sequelize 对象
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 从 lottery_hourly_metrics 表移除 empty_count 字段
      await queryInterface.removeColumn('lottery_hourly_metrics', 'empty_count', { transaction })
      console.log('✅ lottery_hourly_metrics.empty_count 字段移除成功')

      // 2. 从 lottery_daily_metrics 表移除 empty_count 字段
      await queryInterface.removeColumn('lottery_daily_metrics', 'empty_count', { transaction })
      console.log('✅ lottery_daily_metrics.empty_count 字段移除成功')

      await transaction.commit()
      console.log('✅ 回滚完成：empty_count 字段已从两个指标表移除')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
