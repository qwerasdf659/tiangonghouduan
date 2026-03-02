'use strict'

/**
 * 添加用户级别的最大上架数量配置字段
 *
 * @description 为 users 表添加 max_active_listings 字段，支持运营对单个用户
 *              的上架数量进行个性化调整。NULL 表示使用全局默认值。
 *
 * 业务场景：
 * - 运营可以为优质商家提高上架额度
 * - 运营可以限制违规用户的上架数量
 * - NULL 值表示使用 system_settings 中的全局 max_active_listings 配置
 *
 * @version 1.0.0
 * @created 2026-02-18
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 检查字段是否已存在，避免重复添加
    const tableDescription = await queryInterface.describeTable('users')

    if (!tableDescription.max_active_listings) {
      await queryInterface.addColumn('users', 'max_active_listings', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: '用户个性化最大上架数量限制（NULL=使用全局默认值）'
      })

      console.log('✅ 已添加 users.max_active_listings 字段')
    } else {
      console.log('⚠️ users.max_active_listings 字段已存在，跳过')
    }
  },

  async down(queryInterface) {
    const tableDescription = await queryInterface.describeTable('users')

    if (tableDescription.max_active_listings) {
      await queryInterface.removeColumn('users', 'max_active_listings')
      console.log('✅ 已移除 users.max_active_listings 字段')
    }
  }
}
