'use strict'

/**
 * 清理废弃的 fallback 选奖模式
 *
 * 业务背景：
 * - fallback 是 pick_method 枚举中的一个值，原始设想是"抽中后发现没货换保底"
 * - 该设计已被 is_fallback 字段 + tier_first 档位降级机制完整替代
 * - 数据库确认：无活动使用 pick_method='fallback'（COUNT=0）
 * - 同时标记废弃字段 fallback_lottery_prize_id（仅 pick_method=fallback 时使用）
 *
 * 变更内容：
 * 1. lottery_campaigns.pick_method ENUM 移除 'fallback' 值
 * 2. lottery_campaigns.fallback_lottery_prize_id 添加废弃注释
 *
 * @version 4.2.0
 * @date 2026-02-22
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 安全检查：确认无活动使用 fallback
      const [[{ count }]] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as count FROM lottery_campaigns WHERE pick_method = 'fallback'",
        { transaction }
      )
      if (count > 0) {
        throw new Error(`仍有 ${count} 个活动使用 pick_method='fallback'，请先迁移后再删除枚举值`)
      }

      // 修改 ENUM：移除 'fallback'，只保留 'normalize' 和 'tier_first'
      await queryInterface.changeColumn(
        'lottery_campaigns',
        'pick_method',
        {
          type: Sequelize.ENUM('normalize', 'tier_first'),
          allowNull: false,
          defaultValue: 'tier_first',
          comment: '选奖方法：normalize=百分比归一化, tier_first=先选档位再选奖品（推荐）'
        },
        { transaction }
      )
      console.log('  ✅ pick_method ENUM 已移除 fallback 值')

      // 标记 fallback_lottery_prize_id 为废弃（修改注释）
      await queryInterface.changeColumn(
        'lottery_campaigns',
        'fallback_lottery_prize_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: null,
          comment: '【已废弃】原 pick_method=fallback 使用的兜底奖品ID，现由 tier_fallback_lottery_prize_id 和 is_fallback 字段替代'
        },
        { transaction }
      )
      console.log('  ✅ fallback_lottery_prize_id 字段已标记废弃')

      await transaction.commit()
      console.log('✅ 迁移完成：清理 fallback 选奖模式')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败：', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 恢复 ENUM：重新添加 'fallback'
      await queryInterface.changeColumn(
        'lottery_campaigns',
        'pick_method',
        {
          type: Sequelize.ENUM('normalize', 'fallback', 'tier_first'),
          allowNull: false,
          defaultValue: 'tier_first',
          comment: '选奖方法：normalize=归一化, fallback=保底, tier_first=先选档位（推荐）'
        },
        { transaction }
      )

      await queryInterface.changeColumn(
        'lottery_campaigns',
        'fallback_lottery_prize_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: null,
          comment: '兜底奖品ID（pick_method=fallback时使用，外键关联 lottery_prizes.lottery_prize_id）'
        },
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 回滚完成：恢复 fallback 选奖模式')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
