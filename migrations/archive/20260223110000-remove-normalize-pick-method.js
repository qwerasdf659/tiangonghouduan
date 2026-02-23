'use strict'

/**
 * 移除 lottery_campaigns.pick_method ENUM 中的 'normalize' 值
 *
 * 背景：项目统一采用 tier_first 选奖方法，normalize 代码路径已全部清除。
 * 数据验证：当前所有 4 个活动均使用 tier_first，无 normalize 记录。
 * 模型同步：LotteryCampaign 模型将同步修改为 ENUM('tier_first')。
 */
module.exports = {
  async up(queryInterface) {
    const [campaigns] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) as cnt FROM lottery_campaigns WHERE pick_method = 'normalize'"
    )
    if (campaigns[0].cnt > 0) {
      throw new Error(`仍有 ${campaigns[0].cnt} 个活动使用 normalize 模式，不能移除 ENUM 值`)
    }

    await queryInterface.changeColumn('lottery_campaigns', 'pick_method', {
      type: queryInterface.sequelize.constructor.DataTypes.ENUM('tier_first'),
      allowNull: false,
      defaultValue: 'tier_first',
      comment: '选奖方法：tier_first=先选档位再选奖品'
    })
    console.log('✅ pick_method ENUM 已更新为仅 tier_first')
  },

  async down(queryInterface) {
    await queryInterface.changeColumn('lottery_campaigns', 'pick_method', {
      type: queryInterface.sequelize.constructor.DataTypes.ENUM('normalize', 'tier_first'),
      allowNull: false,
      defaultValue: 'tier_first',
      comment: '选奖方法：normalize=归一化百分比, tier_first=先选档位再选奖品'
    })
  }
}
