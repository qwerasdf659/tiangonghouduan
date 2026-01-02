'use strict'

/**
 * 数据库迁移：修复空 prize_type 数据 + 清理 lottery_prizes 枚举
 *
 * 迁移背景：
 * - lottery_draws 表中有 8 条 prize_type = '' (空字符串) 的历史脏数据
 * - 这些数据的 prize_id 对应的 lottery_prizes 表记录中 prize_type = 'physical'
 * - lottery_prizes 表的枚举仍包含 'empty'，需要移除
 *
 * 执行步骤：
 * 1. 根据 prize_id 从 lottery_prizes 表回填 prize_type
 * 2. 更新 lottery_prizes 表枚举定义（移除 empty）
 * 3. 验证数据完整性
 *
 * 创建时间：2026-01-01
 * 影响表：lottery_draws, lottery_prizes
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🎯 开始修复空 prize_type 数据和清理枚举...')

      // ========== 步骤1：统计迁移前状态 ==========
      console.log('\n📊 步骤1：统计迁移前状态...')

      const [beforeStats] = await queryInterface.sequelize.query(
        `SELECT
          (SELECT COUNT(*) FROM lottery_draws WHERE prize_type = '' OR prize_type IS NULL) as dirty_draws,
          (SELECT COUNT(*) FROM lottery_draws) as total_draws`,
        { transaction }
      )
      console.log(`   lottery_draws 表：`)
      console.log(`   - 总记录数: ${beforeStats[0].total_draws}`)
      console.log(`   - 空 prize_type 记录: ${beforeStats[0].dirty_draws}`)

      // 检查 lottery_prizes 表枚举
      const [prizesEnumInfo] = await queryInterface.sequelize.query(
        `SELECT COLUMN_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_prizes'
         AND COLUMN_NAME = 'prize_type'`,
        { transaction }
      )
      console.log(`   lottery_prizes.prize_type 枚举: ${prizesEnumInfo[0]?.COLUMN_TYPE || 'N/A'}`)

      // ========== 步骤2：根据 prize_id 回填 prize_type ==========
      console.log('\n🔧 步骤2：根据 prize_id 从 lottery_prizes 回填 prize_type...')

      // 使用 JOIN 从 lottery_prizes 表获取正确的 prize_type
      const [updateResult] = await queryInterface.sequelize.query(
        `UPDATE lottery_draws ld
         JOIN lottery_prizes lp ON ld.prize_id = lp.prize_id
         SET ld.prize_type = lp.prize_type
         WHERE ld.prize_type = '' OR ld.prize_type IS NULL`,
        { transaction }
      )
      console.log(`   已回填 ${updateResult.affectedRows || 0} 条记录的 prize_type`)

      // ========== 步骤3：更新 lottery_prizes 表枚举（移除 empty） ==========
      console.log('\n📝 步骤3：更新 lottery_prizes 表 prize_type 枚举...')

      // 先检查是否有 prize_type='empty' 的奖品（安全检查）
      const [emptyPrizes] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM lottery_prizes WHERE prize_type = 'empty'`,
        { transaction }
      )

      if (emptyPrizes[0].count > 0) {
        console.log(`   ⚠️ 发现 ${emptyPrizes[0].count} 条 prize_type='empty' 的奖品，跳过枚举修改`)
      } else {
        // 修改枚举（移除 empty）
        // 新枚举值：points, coupon, physical, virtual, service, product, special
        await queryInterface.sequelize.query(
          `ALTER TABLE lottery_prizes
           MODIFY COLUMN prize_type ENUM('points','coupon','physical','virtual','service','product','special')
           NOT NULL COMMENT '奖品类型（V4.0语义清理版 - 已移除empty）'`,
          { transaction }
        )
        console.log('   ✅ lottery_prizes.prize_type 枚举已更新（移除 empty）')
      }

      // ========== 步骤4：验证迁移结果 ==========
      console.log('\n✅ 步骤4：验证迁移结果...')

      const [afterStats] = await queryInterface.sequelize.query(
        `SELECT
          (SELECT COUNT(*) FROM lottery_draws WHERE prize_type = '' OR prize_type IS NULL) as dirty_draws`,
        { transaction }
      )

      if (afterStats[0].dirty_draws > 0) {
        throw new Error(`仍有 ${afterStats[0].dirty_draws} 条空 prize_type 记录，迁移失败`)
      }
      console.log('   - lottery_draws 表：无空 prize_type 记录 ✅')

      // 验证新枚举
      const [newEnumInfo] = await queryInterface.sequelize.query(
        `SELECT COLUMN_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_prizes'
         AND COLUMN_NAME = 'prize_type'`,
        { transaction }
      )
      console.log(`   - lottery_prizes.prize_type 新枚举: ${newEnumInfo[0]?.COLUMN_TYPE || 'N/A'}`)

      // 验证 prize_type 分布
      const [typeDistribution] = await queryInterface.sequelize.query(
        `SELECT prize_type, COUNT(*) as count
         FROM lottery_draws
         GROUP BY prize_type
         ORDER BY count DESC`,
        { transaction }
      )
      console.log('   - lottery_draws.prize_type 分布:')
      typeDistribution.forEach(t => {
        console.log(`     ${t.prize_type}: ${t.count} 条`)
      })

      await transaction.commit()
      console.log('\n🎉 迁移执行成功！')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移执行失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('⚠️ 开始回滚：恢复 lottery_prizes 枚举（添加 empty）...')

      // 恢复枚举（添加回 empty）
      await queryInterface.sequelize.query(
        `ALTER TABLE lottery_prizes
         MODIFY COLUMN prize_type ENUM('points','coupon','physical','virtual','service','product','special','empty')
         NOT NULL COMMENT '奖品类型'`,
        { transaction }
      )
      console.log('✅ lottery_prizes.prize_type 枚举已恢复')

      // 注意：不恢复空 prize_type 数据（无意义）

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
