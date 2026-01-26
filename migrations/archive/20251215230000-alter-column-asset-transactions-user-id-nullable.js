/**
 * 迁移文件：修复 asset_transactions.user_id 为可空（支持系统账户交易）
 *
 * 业务背景：
 * - 系统账户（SYSTEM_PLATFORM_FEE、SYSTEM_MINT、SYSTEM_BURN、SYSTEM_ESCROW）的交易记录需要 user_id=NULL
 * - 原始迁移 20251215080200 将 user_id 设为 NOT NULL，导致系统账户交易无法记录
 * - 升级迁移 20251215160200 添加了 account_id 字段，但未修改 user_id 的 NULL 约束
 *
 * 修复内容：
 * 1. 修改 user_id 字段为 allowNull: true（允许 NULL）
 * 2. 保留外键约束（user_id 非空时仍关联 users.user_id）
 * 3. 移除 user_id 的 NOT NULL 约束
 *
 * 数据影响：
 * - 不影响现有数据（历史记录的 user_id 仍为非空）
 * - 允许新增系统账户交易记录（user_id=NULL, account_id=系统账户ID）
 *
 * 命名规范（snake_case）：
 * - 字段：user_id
 *
 * 创建时间：2025-12-15 23:00:00
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：修改 user_id 为可空
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>} 无返回值，执行数据库迁移
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始修复 asset_transactions.user_id 可空约束...')

      // 修改 user_id 字段为可空（保留外键约束）
      await queryInterface.changeColumn(
        'asset_transactions',
        'user_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true, // 🔴 P0-3 修复：改为允许 NULL
          comment: '用户ID（流水所属用户）：用户账户交易必填，系统账户交易为NULL',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT' // 用户删除时保护流水数据
        },
        { transaction }
      )

      console.log('✅ user_id 字段已修改为可空')

      await transaction.commit()
      console.log('✅ asset_transactions.user_id 可空约束修复完成')
      console.log('📋 修改字段: user_id (allowNull: false → true)')
      console.log('💡 系统账户交易现在可以记录 user_id=NULL')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：恢复 user_id 为 NOT NULL
   *
   * 注意：
   * - 回滚会将 user_id 恢复为 NOT NULL
   * - 如果存在 user_id=NULL 的记录，回滚会失败
   * - 回滚前需要确保所有系统账户交易记录已删除或已填充 user_id
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>} 无返回值，执行数据库回滚
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚 asset_transactions.user_id 可空约束...')

      // 检查是否存在 user_id=NULL 的记录
      const [nullRecords] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM asset_transactions WHERE user_id IS NULL',
        { transaction }
      )

      if (nullRecords[0].count > 0) {
        throw new Error(
          `❌ 回滚失败：存在 ${nullRecords[0].count} 条 user_id=NULL 的记录，无法恢复 NOT NULL 约束`
        )
      }

      // 恢复 user_id 字段为 NOT NULL
      await queryInterface.changeColumn(
        'asset_transactions',
        'user_id',
        {
          type: Sequelize.INTEGER,
          allowNull: false, // 恢复为 NOT NULL
          comment: '用户ID（流水所属用户）',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        { transaction }
      )

      console.log('✅ user_id 字段已恢复为 NOT NULL')

      await transaction.commit()
      console.log('✅ asset_transactions.user_id 可空约束回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
