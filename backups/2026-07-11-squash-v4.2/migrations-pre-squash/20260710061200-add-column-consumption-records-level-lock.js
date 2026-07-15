'use strict'

/**
 * 添加列: consumption_records.level_key_locked + earn_multiplier_locked（提交时锁定，拍板⑬-(a)/§9-2）
 *
 * 创建时间: 2026-07-10（北京时间）
 * 背景（以物易物与会员成长等级功能启用方案 §2.4-5）:
 * - 等级倍数「提交时锁定」：小票提交时点派生用户成长等级并锁定发放倍数，
 *   与 points_award_ratio 现有「提交时锁定，保证用户承诺一致」原则完全对齐，
 *   杜绝「审核快慢影响到账金额」客诉。
 * - consumption_records 现有列中无任何倍数字段，锁定必须落表。
 *
 * 字段说明:
 * - level_key_locked       VARCHAR(32)  NULL  提交时点用户成长等级码（NULL=按无等级/1.0 处理，兼容存量记录）
 * - earn_multiplier_locked DECIMAL(4,2) NULL  提交时点锁定的发放倍数（NULL=按 1.00 处理，兼容存量记录）
 *
 * 回滚: 删除两列。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      await queryInterface.addColumn(
        'consumption_records',
        'level_key_locked',
        {
          type: Sequelize.STRING(32),
          allowNull: true,
          comment: '提交时点锁定的成长等级码（关联 user_growth_levels.level_key，NULL=存量记录按1.0）'
        },
        { transaction }
      )
      await queryInterface.addColumn(
        'consumption_records',
        'earn_multiplier_locked',
        {
          type: Sequelize.DECIMAL(4, 2),
          allowNull: true,
          comment: '提交时点锁定的等级发放倍数（审核发分按此值执行，NULL=存量记录按1.00）'
        },
        { transaction }
      )
      await transaction.commit()
      console.log('✅ consumption_records 等级锁定两列添加完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('consumption_records', 'earn_multiplier_locked')
    await queryInterface.removeColumn('consumption_records', 'level_key_locked')
    console.log('⏪ consumption_records 等级锁定两列已删除')
  }
}
