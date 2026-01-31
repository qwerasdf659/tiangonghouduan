'use strict'

/**
 * 迁移：添加 avatar_url 和 icon_url 字段
 * 
 * 背景：
 * - users 表缺少 avatar_url 字段，客服系统需要显示用户头像
 * - material_asset_types 表缺少 icon_url 字段，市场列表需要显示资产图标
 * 
 * 这些字段在业务上是需要的，之前因为遗漏没有添加到数据库。
 * 
 * @version V4.7.0
 * @date 2026-01-31
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    
    try {
      console.log('📦 开始添加 avatar_url 和 icon_url 字段...')
      
      // 1. 检查并添加 users.avatar_url 字段
      const [userColumns] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM users LIKE 'avatar_url'",
        { transaction }
      )
      
      if (userColumns.length === 0) {
        console.log('  - 添加 users.avatar_url 字段')
        await queryInterface.addColumn('users', 'avatar_url', {
          type: Sequelize.STRING(500),
          allowNull: true,
          defaultValue: null,
          comment: '用户头像URL（微信头像或自定义头像）'
        }, { transaction })
      } else {
        console.log('  - users.avatar_url 字段已存在，跳过')
      }
      
      // 2. 检查并添加 material_asset_types.icon_url 字段
      const [matColumns] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM material_asset_types LIKE 'icon_url'",
        { transaction }
      )
      
      if (matColumns.length === 0) {
        console.log('  - 添加 material_asset_types.icon_url 字段')
        await queryInterface.addColumn('material_asset_types', 'icon_url', {
          type: Sequelize.STRING(500),
          allowNull: true,
          defaultValue: null,
          comment: '资产图标URL（用于市场列表展示）'
        }, { transaction })
      } else {
        console.log('  - material_asset_types.icon_url 字段已存在，跳过')
      }
      
      await transaction.commit()
      console.log('✅ 字段添加完成')
      
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    
    try {
      console.log('📦 回滚：移除 avatar_url 和 icon_url 字段...')
      
      // 1. 移除 users.avatar_url 字段
      const [userColumns] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM users LIKE 'avatar_url'",
        { transaction }
      )
      
      if (userColumns.length > 0) {
        console.log('  - 移除 users.avatar_url 字段')
        await queryInterface.removeColumn('users', 'avatar_url', { transaction })
      }
      
      // 2. 移除 material_asset_types.icon_url 字段
      const [matColumns] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM material_asset_types LIKE 'icon_url'",
        { transaction }
      )
      
      if (matColumns.length > 0) {
        console.log('  - 移除 material_asset_types.icon_url 字段')
        await queryInterface.removeColumn('material_asset_types', 'icon_url', { transaction })
      }
      
      await transaction.commit()
      console.log('✅ 回滚完成')
      
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
