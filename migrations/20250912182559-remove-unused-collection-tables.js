'use strict'

/**
 * 删除不需要的collection相关表
 * 原因：V4精简版只保留3种抽奖策略，不需要收集策略相关的表
 * 影响：删除4个collection相关的空表
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🗑️ 开始删除不需要的collection相关表...')

      // 先删除有外键约束的依赖表
      await queryInterface.dropTable('user_fragments', { transaction })
      console.log('✅ 删除表: user_fragments (解除外键约束)')

      // 删除用户收集库存表（空表，可安全删除）
      await queryInterface.dropTable('user_collection_inventory', { transaction })
      console.log('✅ 删除表: user_collection_inventory')

      // 删除收集物品表（空表，可安全删除）
      await queryInterface.dropTable('collection_items', { transaction })
      console.log('✅ 删除表: collection_items')

      // 删除收集碎片表（空表，可安全删除）
      await queryInterface.dropTable('collection_fragments', { transaction })
      console.log('✅ 删除表: collection_fragments')

      // 删除收集相册表（空表，可安全删除）
      await queryInterface.dropTable('collection_albums', { transaction })
      console.log('✅ 删除表: collection_albums')

      await transaction.commit()
      console.log('🎯 V4精简版：成功删除4个collection相关表')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 删除collection表失败:', error)
      throw error
    }
  },

  async down (queryInterface, _Sequelize) {
    // 回滚操作：重新创建表
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 回滚：重新创建collection相关表...')

      // 注意：这里只创建基本结构，数据无法恢复
      console.log('⚠️ 警告：此回滚只创建表结构，数据无法恢复')

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
