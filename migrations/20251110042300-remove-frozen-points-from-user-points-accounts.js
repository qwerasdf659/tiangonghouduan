/**
 * 数据库迁移：从user_points_accounts表删除frozen_points冗余字段
 *
 * 迁移说明：
 * - 删除frozen_points字段（DECIMAL(10,2)）
 * - 该字段是冗余的，frozen_points应该从points_transactions表动态计算
 * - 符合《获取当前用户积分余额API实施方案.md》的设计原则
 *
 * 业务逻辑：
 * - frozen_points（冻结积分）= SUM(points_amount) WHERE status='pending' AND business_type='consumption_reward'
 * - 冻结积分是动态数据，随审核状态变化，不应存储在账户表
 * - getUserPointsOverview服务已通过查询points_transactions表动态计算
 *
 * 数据安全：
 * - frozen_points字段当前未被任何代码读取或更新
 * - 删除该字段不影响任何业务功能
 * - API返回的frozen_points来自动态计算，不依赖此字段
 *
 * 创建时间：2025-11-10
 * 影响表：user_points_accounts
 * 兼容性：向后兼容（删除未使用的冗余字段）
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：删除frozen_points字段
   */
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始删除冗余frozen_points字段...')

      // 1. 检查字段是否存在
      const [columns] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'user_points_accounts'
           AND COLUMN_NAME = 'frozen_points'`,
        { transaction }
      )

      if (columns.length === 0) {
        console.log('⏭️ frozen_points字段不存在，跳过删除')
        await transaction.commit()
        return
      }

      console.log('📋 找到frozen_points字段：')
      console.log(JSON.stringify(columns[0], null, 2))

      // 2. 验证字段未被使用（检查是否有非零值）
      const [nonZeroCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM user_points_accounts WHERE frozen_points != 0',
        { transaction }
      )

      if (nonZeroCount[0].count > 0) {
        console.warn(
          `⚠️ 警告：有${nonZeroCount[0].count}个账户的frozen_points字段不为0，但该字段不影响业务逻辑`
        )
        console.warn('   frozen_points值已从points_transactions表动态计算')
      }

      // 3. 删除frozen_points字段
      await queryInterface.removeColumn('user_points_accounts', 'frozen_points', { transaction })
      console.log('✅ frozen_points字段删除成功')

      // 4. 验证字段删除结果
      const [verifyColumns] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'user_points_accounts'
           AND COLUMN_NAME = 'frozen_points'`,
        { transaction }
      )

      if (verifyColumns.length === 0) {
        console.log('✅ 验证成功：frozen_points字段已彻底删除')
      } else {
        throw new Error('验证失败：frozen_points字段仍然存在')
      }

      await transaction.commit()
      console.log('\n🎉 迁移执行成功！')
      console.log(
        '📝 说明：frozen_points现在通过getUserPointsOverview()从points_transactions表动态计算'
      )
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移执行失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：恢复frozen_points字段
   */
  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚：恢复frozen_points字段...')

      // 1. 检查字段是否已存在
      const [columns] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'user_points_accounts'
           AND COLUMN_NAME = 'frozen_points'`,
        { transaction }
      )

      if (columns.length > 0) {
        console.log('⏭️ frozen_points字段已存在，跳过恢复')
        await transaction.commit()
        return
      }

      // 2. 恢复frozen_points字段（作为遗留字段，默认值为0）
      await queryInterface.addColumn(
        'user_points_accounts',
        'frozen_points',
        {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0.0,
          comment: '冻结积分（遗留字段，不推荐使用，应从points_transactions动态计算）- DEPRECATED',
          after: 'available_points'
        },
        { transaction }
      )
      console.log('✅ frozen_points字段恢复成功')

      await transaction.commit()
      console.log('\n🎉 回滚执行成功！')
      console.warn('⚠️ 注意：frozen_points是遗留字段，业务逻辑应使用动态计算的值')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 回滚执行失败:', error.message)
      throw error
    }
  }
}
