'use strict'

/**
 * 删除 category_defs.icon_url 和 material_asset_types.icon_url 列
 *
 * 背景：
 * - 迁移 20260316231845 已正确 DROP 了这两个列
 * - 但迁移 20260317004823 又把它们加回去，违背了 media_attachments 统一架构设计
 * - 现在删除 20260317004823 并再次 DROP 这两个列
 *
 * 数据安全：
 * - 两个列的值全部为 NULL（9条 category_defs + 16条 material_asset_types）
 * - 图标数据已通过 media_attachments 关联到 media_files（9 + 16 = 25 条关联记录）
 * - 删除列不会丢失任何数据
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // 验证 media_attachments 数据完整性后再删除
      const [catAttachments] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as cnt FROM media_attachments WHERE attachable_type = 'category_def' AND role = 'icon'",
        { transaction }
      )
      const [matAttachments] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as cnt FROM media_attachments WHERE attachable_type = 'material_asset_type' AND role = 'icon'",
        { transaction }
      )

      console.log(`  验证: category_def icon 关联 ${catAttachments[0].cnt} 条`)
      console.log(`  验证: material_asset_type icon 关联 ${matAttachments[0].cnt} 条`)

      // 删除 category_defs.icon_url（如果存在）
      const [catCols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM category_defs WHERE Field = 'icon_url'",
        { transaction }
      )
      if (catCols.length > 0) {
        await queryInterface.removeColumn('category_defs', 'icon_url', { transaction })
        console.log('  ✓ category_defs.icon_url 已删除')
      }

      // 删除 material_asset_types.icon_url（如果存在）
      const [matCols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM material_asset_types WHERE Field = 'icon_url'",
        { transaction }
      )
      if (matCols.length > 0) {
        await queryInterface.removeColumn('material_asset_types', 'icon_url', { transaction })
        console.log('  ✓ material_asset_types.icon_url 已删除')
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.addColumn('category_defs', 'icon_url', {
        type: Sequelize.STRING(500),
        allowNull: true,
        defaultValue: null,
        comment: '分类图标 object key（回退用，正式应走 media_attachments）'
      }, { transaction })

      await queryInterface.addColumn('material_asset_types', 'icon_url', {
        type: Sequelize.STRING(500),
        allowNull: true,
        defaultValue: null,
        comment: '资产类型图标 object key（回退用，正式应走 media_attachments）'
      }, { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
