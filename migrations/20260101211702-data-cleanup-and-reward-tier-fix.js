'use strict'

/**
 * 数据库迁移：数据清理与 reward_tier 修复
 *
 * 迁移背景：
 * - 发现 750 条 prize_type=NULL 的脏数据需要删除
 * - prize_value_points 字段全是 0，需要用 prize_value 回填
 * - reward_tier 全是 low，需要基于正确的 prize_value_points 重新计算
 *
 * 执行步骤：
 * 1. 删除脏数据（prize_type=NULL 且 prize_name=NULL 的无效记录）
 * 2. 用 prize_value 回填 prize_value_points
 * 3. 基于 prize_value_points 重新计算 reward_tier
 *
 * 档位规则（来自《抽奖业务语义与口径统一规范》）：
 * - low: prize_value_points < 300
 * - mid: 300 <= prize_value_points < 700
 * - high: prize_value_points >= 700
 *
 * 创建时间：2026-01-01
 * 影响表：lottery_draws
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🎯 开始执行数据清理与 reward_tier 修复迁移...')

      // ========== 步骤1：统计迁移前状态 ==========
      console.log('\n📊 步骤1：统计迁移前状态...')

      const [[beforeStats]] = await queryInterface.sequelize.query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN prize_type IS NULL THEN 1 ELSE 0 END) as null_type_count,
          SUM(CASE WHEN prize_value_points = 0 OR prize_value_points IS NULL THEN 1 ELSE 0 END) as zero_points_count
        FROM lottery_draws`,
        { transaction }
      )
      console.log(`   迁移前状态：`)
      console.log(`   - 总记录数: ${beforeStats.total}`)
      console.log(`   - prize_type=NULL 记录: ${beforeStats.null_type_count}`)
      console.log(`   - prize_value_points=0 记录: ${beforeStats.zero_points_count}`)

      // ========== 步骤2：删除脏数据 ==========
      console.log('\n🗑️ 步骤2：删除脏数据（prize_type=NULL 且 prize_name=NULL）...')

      const [deleteResult] = await queryInterface.sequelize.query(
        `DELETE FROM lottery_draws
         WHERE prize_type IS NULL AND prize_name IS NULL`,
        { transaction }
      )
      console.log(`   已删除 ${deleteResult.affectedRows || 0} 条无效记录`)

      // ========== 步骤3：用 prize_value 回填 prize_value_points ==========
      console.log('\n💰 步骤3：用 prize_value 回填 prize_value_points...')

      // 将 prize_value（DECIMAL）转换为 prize_value_points（INT）
      await queryInterface.sequelize.query(
        `UPDATE lottery_draws
         SET prize_value_points = COALESCE(FLOOR(prize_value), 0)
         WHERE prize_value_points = 0 OR prize_value_points IS NULL`,
        { transaction }
      )

      // 统计回填结果
      const [pointsStats] = await queryInterface.sequelize.query(
        `SELECT
          MIN(prize_value_points) as min_points,
          MAX(prize_value_points) as max_points,
          AVG(prize_value_points) as avg_points
        FROM lottery_draws`,
        { transaction }
      )
      console.log(`   prize_value_points 回填完成：`)
      console.log(`   - 最小值: ${pointsStats[0].min_points}`)
      console.log(`   - 最大值: ${pointsStats[0].max_points}`)
      console.log(`   - 平均值: ${Math.round(pointsStats[0].avg_points)}`)

      // ========== 步骤4：重新计算 reward_tier ==========
      console.log('\n🏆 步骤4：基于 prize_value_points 重新计算 reward_tier...')

      // 档位规则：low(<300) / mid(300-699) / high(>=700)
      await queryInterface.sequelize.query(
        `UPDATE lottery_draws
         SET reward_tier = CASE
           WHEN prize_value_points < 300 THEN 'low'
           WHEN prize_value_points >= 300 AND prize_value_points < 700 THEN 'mid'
           ELSE 'high'
         END`,
        { transaction }
      )

      // 统计档位分布
      const [tierStats] = await queryInterface.sequelize.query(
        `SELECT reward_tier, COUNT(*) as count
         FROM lottery_draws
         GROUP BY reward_tier
         ORDER BY FIELD(reward_tier, 'low', 'mid', 'high')`,
        { transaction }
      )
      console.log(`   reward_tier 分布：`)
      tierStats.forEach(t => console.log(`   - ${t.reward_tier}: ${t.count} 条`))

      // ========== 步骤5：验证迁移结果 ==========
      console.log('\n✅ 步骤5：验证迁移结果...')

      const [[afterStats]] = await queryInterface.sequelize.query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN prize_type IS NULL THEN 1 ELSE 0 END) as null_type_count,
          SUM(CASE WHEN prize_value_points = 0 THEN 1 ELSE 0 END) as zero_points_count
        FROM lottery_draws`,
        { transaction }
      )
      console.log(`   迁移后状态：`)
      console.log(`   - 总记录数: ${afterStats.total}`)
      console.log(`   - prize_type=NULL 记录: ${afterStats.null_type_count}`)
      console.log(`   - prize_value_points=0 记录: ${afterStats.zero_points_count}`)

      await transaction.commit()
      console.log('\n🎉 数据清理与 reward_tier 修复迁移执行成功！')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移执行失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    // 此迁移为破坏性清理操作，不支持回滚
    console.log('⚠️ 此迁移删除了脏数据，无法回滚')
    console.log('如需恢复数据，请从备份中恢复')
  }
}
