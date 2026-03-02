'use strict'

/**
 * 迁移：删除 item_templates 表的废弃图片字段
 *
 * 业务背景：图片资源已统一迁移到 Sealos 对象存储，
 * image_url 和 thumbnail_url 字段已无数据（13行全为NULL/空），可安全删除
 *
 * @module migrations/drop-item-templates-image-fields
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn('item_templates', 'image_url')
    await queryInterface.removeColumn('item_templates', 'thumbnail_url')
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('item_templates', 'image_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
      defaultValue: null,
      comment: '物品图片URL（已废弃，图片迁移到对象存储）'
    })
    await queryInterface.addColumn('item_templates', 'thumbnail_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
      defaultValue: null,
      comment: '物品缩略图URL（已废弃，图片迁移到对象存储）'
    })
  }
}
