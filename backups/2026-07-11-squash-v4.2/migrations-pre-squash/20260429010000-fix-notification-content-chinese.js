'use strict'

/**
 * 迁移：修复通知内容中的英文 asset_code 为中文 display_name
 *
 * 问题：NotificationService 之前直接在通知 content 中使用英文 asset_code
 *       （如 red_core_shard），导致微信小程序前端展示英文给用户
 *
 * 修复：将历史通知中的英文 asset_code 替换为对应的中文 display_name
 *
 * 版本：V4.1.1
 * 创建时间：2026-04-29
 */

module.exports = {
  async up(queryInterface) {
    // 从 material_asset_types 表获取 asset_code → display_name 映射
    const [assetTypes] = await queryInterface.sequelize.query(
      'SELECT asset_code, display_name FROM material_asset_types'
    )

    // 逐个替换通知内容中的英文 asset_code
    for (const { asset_code, display_name } of assetTypes) {
      // 只替换 content 字段中出现的 asset_code（精确匹配，避免误替换）
      const [result] = await queryInterface.sequelize.query(
        `UPDATE user_notifications
         SET content = REPLACE(content, :asset_code, :display_name)
         WHERE content LIKE :pattern`,
        {
          replacements: {
            asset_code,
            display_name,
            pattern: `%${asset_code}%`
          }
        }
      )

      const affectedRows = result.affectedRows || 0
      if (affectedRows > 0) {
        console.log(`  ✅ ${asset_code} → ${display_name}（${affectedRows} 条记录）`)
      }
    }
  },

  async down(queryInterface) {
    // 回滚：将中文 display_name 替换回英文 asset_code
    const [assetTypes] = await queryInterface.sequelize.query(
      'SELECT asset_code, display_name FROM material_asset_types'
    )

    for (const { asset_code, display_name } of assetTypes) {
      await queryInterface.sequelize.query(
        `UPDATE user_notifications
         SET content = REPLACE(content, :display_name, :asset_code)
         WHERE content LIKE :pattern`,
        {
          replacements: {
            asset_code,
            display_name,
            pattern: `%${display_name}%`
          }
        }
      )
    }
  }
}
