'use strict'

/**
 * 数据库迁移：为lottery_campaigns表添加条件配置字段
 *
 * @file migrations/20251126201553-add-activity-conditions.js
 * @description 添加participation_conditions和condition_error_messages字段
 * @业务场景 支持多活动条件参与系统，管理员可配置活动参与门槛
 * @技术方案 JSON配置方案（零技术债务）
 * @创建时间 2025-11-26
 */

module.exports = {
  /**
   * 执行迁移：添加JSON字段
   * @param {QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    // 添加参与条件配置字段
    await queryInterface.addColumn('lottery_campaigns', 'participation_conditions', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: null,
      comment:
        '参与条件配置（JSON格式，用途：存储活动参与条件规则，如用户积分≥100、用户类型=VIP等，业务场景：管理员在Web后台配置，用户端API自动验证，NULL表示无条件限制所有用户可参与）'
    })

    // 添加条件错误提示语字段
    await queryInterface.addColumn('lottery_campaigns', 'condition_error_messages', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: null,
      comment:
        '条件不满足时的提示语（JSON格式，用途：存储每个条件对应的用户友好错误提示，业务场景：用户不满足条件时显示具体原因，如"您的积分不足100分，快去消费获取积分吧！"）'
    })

    console.log('✅ 成功添加活动条件配置字段')
  },

  /**
   * 回滚迁移：删除字段
   * @param {QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('lottery_campaigns', 'participation_conditions')
    await queryInterface.removeColumn('lottery_campaigns', 'condition_error_messages')

    console.log('✅ 成功删除活动条件配置字段')
  }
}
