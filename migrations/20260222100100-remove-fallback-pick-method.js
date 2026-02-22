'use strict'

/**
 * 清理废弃的 fallback 选奖模式
 *
 * 业务背景：
 * - fallback 是"事后降级"方案，用户体验差（抽中好东西后告知没库存了）
 * - tier_first 已用"事前过滤"完整替代（抽之前就排除无库存奖品）
 * - is_fallback 字段 + pity 保底系统已完整替代 fallback 的所有功能
 * - 数据库确认：SELECT COUNT(*) FROM lottery_campaigns WHERE pick_method = 'fallback' = 0
 *
 * 变更内容：
 * - pick_method ENUM 从 ('normalize','fallback','tier_first') 改为 ('normalize','tier_first')
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* 安全检查：确认无活动使用 fallback */
      const [rows] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as cnt FROM lottery_campaigns WHERE pick_method = 'fallback'",
        { transaction }
      )
      if (rows[0].cnt > 0) {
        throw new Error(`仍有 ${rows[0].cnt} 个活动使用 fallback，无法安全移除`)
      }

      /* 修改 ENUM：移除 fallback */
      await queryInterface.changeColumn(
        'lottery_campaigns',
        'pick_method',
        {
          type: Sequelize.ENUM('normalize', 'tier_first'),
          allowNull: false,
          defaultValue: 'tier_first',
          comment: '选奖方式：normalize=百分比直选, tier_first=先选档位再选奖品'
        },
        { transaction }
      )

      await transaction.commit()
      console.log('✅ pick_method ENUM 已移除 fallback 值')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('lottery_campaigns', 'pick_method', {
      type: Sequelize.ENUM('normalize', 'fallback', 'tier_first'),
      allowNull: false,
      defaultValue: 'tier_first',
      comment: '选奖方式'
    })
  }
}
