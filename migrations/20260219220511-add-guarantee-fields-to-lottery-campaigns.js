'use strict'

/**
 * 迁移：为 lottery_campaigns 表添加固定间隔保底配置字段
 *
 * 业务背景：运营可按活动配置"每N次必出指定奖品"的营销保底机制
 * 与 Pity 系统（体验兜底）独立，解决不同业务场景
 *
 * 新增字段：
 *   guarantee_enabled    - 是否启用固定间隔保底（默认关闭）
 *   guarantee_threshold  - 保底触发间隔（每N次触发，默认10）
 *   guarantee_prize_id   - 保底奖品ID（NULL=自动选最高档有库存奖品）
 *
 * guarantee_prize_id 外键关联 lottery_prizes.lottery_prize_id
 * ON DELETE SET NULL（删除奖品时自动降级为"自动选最高档"）
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('lottery_campaigns', 'guarantee_enabled', {
      type: Sequelize.TINYINT(1),
      allowNull: false,
      defaultValue: 0,
      comment: '是否启用固定间隔保底：0=关闭(默认), 1=开启',
      after: 'background_image_url'
    })

    await queryInterface.addColumn('lottery_campaigns', 'guarantee_threshold', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 10,
      comment: '保底触发间隔（每N次抽奖触发一次保底）',
      after: 'guarantee_enabled'
    })

    await queryInterface.addColumn('lottery_campaigns', 'guarantee_prize_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: '保底奖品ID（NULL=自动选最高档有库存奖品），FK→lottery_prizes.lottery_prize_id',
      after: 'guarantee_threshold',
      references: {
        model: 'lottery_prizes',
        key: 'lottery_prize_id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    })
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('lottery_campaigns', 'guarantee_prize_id')
    await queryInterface.removeColumn('lottery_campaigns', 'guarantee_threshold')
    await queryInterface.removeColumn('lottery_campaigns', 'guarantee_enabled')
  }
}
