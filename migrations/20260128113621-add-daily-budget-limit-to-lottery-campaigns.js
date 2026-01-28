'use strict'

/**
 * 数据库迁移：添加 daily_budget_limit 字段到 lottery_campaigns 表
 *
 * 业务背景：
 * - 运营后台需要展示每日预算进度监控
 * - daily_budget_limit 用于设置活动每日的预算上限
 * - 与 pool_budget_remaining 配合计算当日预算消耗进度
 *
 * 字段说明：
 * - daily_budget_limit: 每日预算上限（积分），NULL 表示不限制
 *
 * @see docs/后端API开发需求文档-抽奖运营后台.md ADR-002
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  /**
   * 执行迁移：添加 daily_budget_limit 字段
   * @param {import('sequelize').QueryInterface} queryInterface
   * @param {import('sequelize').Sequelize} Sequelize
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 检查字段是否已存在
      const [columns] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM lottery_campaigns LIKE 'daily_budget_limit'",
        { transaction }
      )

      if (columns.length > 0) {
        console.log('✅ daily_budget_limit 字段已存在，跳过添加')
        await transaction.commit()
        return
      }

      // 2. 添加 daily_budget_limit 字段
      await queryInterface.addColumn(
        'lottery_campaigns',
        'daily_budget_limit',
        {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: true,
          defaultValue: null,
          comment: '每日预算上限（积分），NULL表示不限制每日预算'
        },
        { transaction }
      )

      console.log('✅ 成功添加 daily_budget_limit 字段到 lottery_campaigns 表')

      // 3. 为现有活动设置默认的每日预算上限（可选）
      // 业务规则：如果活动使用 pool 预算模式，可根据总预算设置一个参考值
      // 这里暂不自动设置，由运营人员手动配置
      console.log('💡 提示：请通过运营后台为需要的活动配置 daily_budget_limit')

      await transaction.commit()
      console.log('✅ 迁移执行成功')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移执行失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：移除 daily_budget_limit 字段
   * @param {import('sequelize').QueryInterface} queryInterface
   * @param {import('sequelize').Sequelize} Sequelize
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 检查字段是否存在
      const [columns] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM lottery_campaigns LIKE 'daily_budget_limit'",
        { transaction }
      )

      if (columns.length === 0) {
        console.log('✅ daily_budget_limit 字段不存在，无需回滚')
        await transaction.commit()
        return
      }

      // 2. 移除 daily_budget_limit 字段
      await queryInterface.removeColumn('lottery_campaigns', 'daily_budget_limit', { transaction })

      console.log('✅ 成功移除 daily_budget_limit 字段')

      await transaction.commit()
      console.log('✅ 回滚执行成功')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚执行失败:', error.message)
      throw error
    }
  }
}


