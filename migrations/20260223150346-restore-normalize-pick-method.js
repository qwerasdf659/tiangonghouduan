'use strict'

/**
 * 恢复 lottery_campaigns.pick_method ENUM 中的 'normalize' 值
 *
 * 背景：normalize 百分比选奖模式需要重新启用。
 * 之前的迁移 20260223110000 错误地将 normalize 从 ENUM 中移除。
 * 本迁移恢复 normalize 枚举值，支持两种选奖方法：
 *   - tier_first: 先选档位再选奖品（按 reward_tier + win_weight）
 *   - normalize: 归一化百分比选奖（按 win_probability 归一化随机抽取，跳过档位）
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.changeColumn('lottery_campaigns', 'pick_method', {
      type: queryInterface.sequelize.constructor.DataTypes.ENUM('normalize', 'tier_first'),
      allowNull: false,
      defaultValue: 'tier_first',
      comment: '选奖方法：normalize=归一化百分比选奖, tier_first=先选档位再选奖品'
    })
    console.log('✅ pick_method ENUM 已恢复 normalize 枚举值')
  },

  async down(queryInterface) {
    const [campaigns] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) as cnt FROM lottery_campaigns WHERE pick_method = 'normalize'"
    )
    if (campaigns[0].cnt > 0) {
      throw new Error(`仍有 ${campaigns[0].cnt} 个活动使用 normalize 模式，不能回滚`)
    }

    await queryInterface.changeColumn('lottery_campaigns', 'pick_method', {
      type: queryInterface.sequelize.constructor.DataTypes.ENUM('tier_first'),
      allowNull: false,
      defaultValue: 'tier_first',
      comment: '选奖方法：tier_first=先选档位再选奖品'
    })
  }
}
