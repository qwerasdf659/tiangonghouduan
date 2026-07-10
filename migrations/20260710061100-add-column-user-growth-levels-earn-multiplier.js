'use strict'

/**
 * 添加列: user_growth_levels.earn_multiplier（成长等级发放线倍数，拍板②）
 *
 * 创建时间: 2026-07-10（北京时间）
 * 背景（以物易物与会员成长等级功能启用方案 §2.4-1）:
 * - 等级权益 = 发放线九档阶梯：消费审核通过时「可用积分 + 预算积分」按等级倍数放大。
 * - 倍数与等级定义同表存储（配置不分家），管理后台等级管理页可编辑。
 * - 应急回滚（拍板⑬-(b)）：九档全部改回 1.00 = 加成笔归零，系统行为完全回到现状。
 *
 * 字段说明:
 * - earn_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00
 *   取值范围 1.00~3.00（写入口校验，与拍板⑮-(d) 可用积分总倍数硬封顶 3.0 同值）。
 *
 * 九档阶梯初始值（拍板②）: v1 1.00 / v2 1.05 / v3 1.10 / v4 1.15 / v5 1.20 /
 *                          v6 1.25 / v7 1.30 / v8 1.40 / v9 1.50
 *
 * 回滚: 删除该列（等价于全部回到 1.0 行为）。
 */

/** 九档发放倍数（拍板②终稿） */
const EARN_MULTIPLIER_LADDER = {
  v1: 1.0,
  v2: 1.05,
  v3: 1.1,
  v4: 1.15,
  v5: 1.2,
  v6: 1.25,
  v7: 1.3,
  v8: 1.4,
  v9: 1.5
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      await queryInterface.addColumn(
        'user_growth_levels',
        'earn_multiplier',
        {
          type: Sequelize.DECIMAL(4, 2),
          allowNull: false,
          defaultValue: 1.0,
          comment: '发放线倍数（消费审核发分时可用积分/预算积分按此放大，1.00=无加成，范围1.00~3.00）'
        },
        { transaction }
      )

      // 九档阶梯写值（按 level_key 定位，等级行不存在时跳过——列默认 1.00 安全）
      for (const [levelKey, multiplier] of Object.entries(EARN_MULTIPLIER_LADDER)) {
        // eslint-disable-next-line no-await-in-loop
        await sequelize.query(
          'UPDATE user_growth_levels SET earn_multiplier = ? WHERE level_key = ?',
          { replacements: [multiplier, levelKey], transaction }
        )
      }

      // 回读验证
      const [rows] = await sequelize.query(
        "SELECT level_key, earn_multiplier FROM user_growth_levels WHERE status='active' ORDER BY sort_order",
        { transaction }
      )
      console.log('✅ earn_multiplier 九档写值完成:', JSON.stringify(rows))

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('user_growth_levels', 'earn_multiplier')
    console.log('⏪ user_growth_levels.earn_multiplier 已删除')
  }
}
