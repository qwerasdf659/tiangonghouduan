'use strict'

/**
 * 迁移脚本：为 users 表添加 last_active_at 字段
 *
 * 背景：
 * - TierPickStage 中的用户分群规则（segment_rules.js v4 版本）需要使用 last_active_at 字段
 * - 用于区分高活跃用户、中等活跃用户、不活跃用户
 * - 之前因字段缺失导致警告："Unknown column 'last_active_at' in 'field list'"
 *
 * 业务含义：
 * - last_active_at: 用户最后一次活跃时间（登录、抽奖、访问等操作时更新）
 * - 与 updated_at 不同：updated_at 在任何字段更新时都会变化，
 *   而 last_active_at 只在用户主动操作时更新
 *
 * @module migrations/20260128060000-add-user-last-active-at
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      console.log('🔧 开始为 users 表添加 last_active_at 字段...')

      // 检查字段是否已存在
      const [columns] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM users LIKE 'last_active_at'",
        { transaction }
      )

      if (columns.length > 0) {
        console.log('⚠️ last_active_at 字段已存在，跳过添加')
        await transaction.commit()
        return
      }

      // 添加 last_active_at 字段
      await queryInterface.addColumn(
        'users',
        'last_active_at',
        {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
          comment: '用户最后活跃时间（登录、抽奖等操作时更新，用于用户分群）'
        },
        { transaction }
      )
      console.log('✅ 添加 last_active_at 字段成功')

      // 初始化数据：将现有用户的 last_active_at 设为 updated_at 或 created_at
      await queryInterface.sequelize.query(
        `UPDATE users 
         SET last_active_at = COALESCE(updated_at, created_at)
         WHERE last_active_at IS NULL`,
        { transaction }
      )
      console.log('✅ 初始化现有用户的 last_active_at 数据')

      // 添加索引以提升分群查询性能
      await queryInterface.addIndex('users', ['last_active_at'], {
        name: 'idx_users_last_active_at',
        transaction
      })
      console.log('✅ 添加 idx_users_last_active_at 索引')

      await transaction.commit()
      console.log('✅ 迁移完成：users.last_active_at 字段已添加')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      console.log('⏪ 回滚：移除 users.last_active_at 字段...')

      // 检查字段是否存在
      const [columns] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM users LIKE 'last_active_at'",
        { transaction }
      )

      if (columns.length === 0) {
        console.log('⚠️ last_active_at 字段不存在，跳过移除')
        await transaction.commit()
        return
      }

      // 移除索引
      try {
        await queryInterface.removeIndex('users', 'idx_users_last_active_at', { transaction })
        console.log('✅ 移除 idx_users_last_active_at 索引')
      } catch (e) {
        console.log('⚠️ 索引可能不存在:', e.message)
      }

      // 移除字段
      await queryInterface.removeColumn('users', 'last_active_at', { transaction })
      console.log('✅ 移除 last_active_at 字段')

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}










