'use strict'

/**
 * 数据库迁移：lottery_draws 表添加 points_deducted 审计字段
 *
 * 业务背景：
 * - SettleStage 结算时已在代码中写入 points_deducted 字段（实际积分扣减金额）
 * - 但 lottery_draws 表缺少该列，Sequelize 静默忽略该字段导致数据丢失
 * - 该字段用于完整审计链路：记录每次抽奖实际扣减的积分金额
 * - 与 cost_points（单次抽奖定价）区别：
 *   - cost_points：抽奖定价（配置值）
 *   - points_deducted：实际扣减金额（连抽场景中可能为 0，因为由外层统一扣减）
 *
 * 变更内容：
 * - lottery_draws 新增 points_deducted 列（INTEGER, NOT NULL, DEFAULT 0）
 *
 * 回滚方案：
 * - down() 删除 points_deducted 列
 *
 * @date 2026-02-16
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('📦 [迁移] 开始：lottery_draws 添加 points_deducted 审计字段...')

    // 先检查字段是否已存在（防御性编程）
    const [columns] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM lottery_draws WHERE Field = 'points_deducted'"
    )

    if (columns.length > 0) {
      console.log('  ⚠️ points_deducted 字段已存在，跳过添加')
      return
    }

    // 添加 points_deducted 列（放在 budget_points_after 之后，审计字段聚集）
    await queryInterface.addColumn('lottery_draws', 'points_deducted', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '实际积分扣减金额（连抽时子请求可能为0，由外层统一扣减）',
      after: 'budget_points_after'
    })

    console.log('  ✅ 已添加 points_deducted 列')
    console.log('📦 [迁移] 完成：points_deducted 审计字段已添加')
  },

  async down(queryInterface, _Sequelize) {
    console.log('📦 [回滚] 开始：删除 lottery_draws.points_deducted 字段...')

    await queryInterface.removeColumn('lottery_draws', 'points_deducted')

    console.log('  ✅ 已删除 points_deducted 列')
    console.log('📦 [回滚] 完成：points_deducted 字段已删除')
  }
}

