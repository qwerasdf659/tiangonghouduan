'use strict'

/**
 * 迁移：删除lottery_prizes表的probability冗余字段
 *
 * 背景：
 * - 项目中存在两个概率字段：probability和win_probability
 * - probability原用于转盘显示概率，win_probability用于实际中奖概率
 * - 经过业务分析，两者是冗余的，统一使用win_probability
 *
 * 变更内容：
 * - 删除lottery_prizes表的probability列
 *
 * 回滚说明：
 * - 恢复probability列（DECIMAL(6,4)）
 * - 数据恢复使用win_probability的值
 *
 * 创建时间：2025-12-26
 * 创建原因：暴力重构清理方案 - 删除冗余概率字段
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 删除probability列
    await queryInterface.removeColumn('lottery_prizes', 'probability')

    console.log('✅ 已删除lottery_prizes.probability列')
  },

  async down(queryInterface, Sequelize) {
    // 恢复probability列
    await queryInterface.addColumn('lottery_prizes', 'probability', {
      type: Sequelize.DECIMAL(6, 4),
      allowNull: false,
      defaultValue: 0.0,
      comment: '中奖概率（已废弃，使用win_probability）'
    })

    // 使用win_probability的值填充probability
    await queryInterface.sequelize.query(`
      UPDATE lottery_prizes
      SET probability = win_probability
    `)

    console.log('✅ 已恢复lottery_prizes.probability列')
  }
}
