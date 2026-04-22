/**
 * DIY 强制图片要求 — 数据治理迁移
 *
 * 业务背景：
 * - 模板缺少底图（base_image_media_id）和预览图（preview_media_id），
 *   导致小程序设计器渲染效果极差（纯几何占位）
 * - 珠子素材缺少图片（image_media_id），前端只能画虚线圈占位
 *
 * 迁移内容：
 * 1. 将无底图/无预览图的已发布模板降级为 draft，强制运营补图后才能重新发布
 * 2. 将无图片的珠子素材标记为 is_enabled=0，强制运营补图后才能重新启用
 *
 * @module migrations/20260408120000-diy-enforce-image-requirements
 */

'use strict'

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('🔧 [迁移] DIY 强制图片要求 — 开始执行...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========================================
      // 第1步：无底图/无预览图的已发布模板 → draft
      // ========================================
      const [templateResults] = await queryInterface.sequelize.query(
        `UPDATE diy_templates
         SET status = 'draft',
             updated_at = NOW()
         WHERE status = 'published'
           AND (base_image_media_id IS NULL OR preview_media_id IS NULL)`,
        { transaction }
      )
      const templateCount = templateResults.affectedRows || 0
      console.log(`  📋 模板降级为 draft: ${templateCount} 条（缺少底图或预览图）`)

      // ========================================
      // 第2步：无图片的珠子素材 → is_enabled=0
      // ========================================
      const [materialResults] = await queryInterface.sequelize.query(
        `UPDATE diy_materials
         SET is_enabled = 0,
             updated_at = NOW()
         WHERE image_media_id IS NULL
           AND is_enabled = 1`,
        { transaction }
      )
      const materialCount = materialResults.affectedRows || 0
      console.log(`  🔴 素材禁用: ${materialCount} 条（缺少图片）`)

      await transaction.commit()
      console.log('✅ [迁移] DIY 强制图片要求 — 执行完成')
      console.log(`   模板降级: ${templateCount} 条, 素材禁用: ${materialCount} 条`)
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [迁移] DIY 强制图片要求 — 执行失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 [回滚] DIY 强制图片要求 — 开始回滚...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚：将被降级的模板恢复为 published（仅恢复 is_enabled=1 的）
      await queryInterface.sequelize.query(
        `UPDATE diy_templates
         SET status = 'published',
             updated_at = NOW()
         WHERE status = 'draft'
           AND is_enabled = 1
           AND (base_image_media_id IS NULL OR preview_media_id IS NULL)`,
        { transaction }
      )

      // 回滚：将被禁用的素材恢复为 is_enabled=1
      await queryInterface.sequelize.query(
        `UPDATE diy_materials
         SET is_enabled = 1,
             updated_at = NOW()
         WHERE image_media_id IS NULL
           AND is_enabled = 0`,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ [回滚] DIY 强制图片要求 — 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [回滚] 执行失败:', error.message)
      throw error
    }
  }
}
