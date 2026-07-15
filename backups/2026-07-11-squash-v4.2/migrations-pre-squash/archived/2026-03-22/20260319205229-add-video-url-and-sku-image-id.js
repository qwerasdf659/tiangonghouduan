'use strict'

/**
 * 迁移：补全商品详情增强字段和 SKU 专属图片字段
 *
 * 新增字段：
 * - exchange_items.video_url: 商品视频 URL（支持商品视频上传展示）
 * - exchange_item_skus.image_id: SKU 专属图片 ID（不同规格对应不同图片，如不同颜色）
 *
 * 文档依据：5.2.6 商品详情增强、5.2.7 多 SKU / 规格管理
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // 1. exchange_items 新增 video_url 字段
      const eiDesc = await queryInterface.describeTable('exchange_items')
      if (!eiDesc.video_url) {
        await queryInterface.addColumn('exchange_items', 'video_url', {
          type: Sequelize.STRING(500),
          allowNull: true,
          defaultValue: null,
          comment: '商品视频 URL（支持视频展示）'
        }, { transaction })
      }

      // 2. exchange_item_skus 新增 image_id 字段
      const skuDesc = await queryInterface.describeTable('exchange_item_skus')
      if (!skuDesc.image_id) {
        await queryInterface.addColumn('exchange_item_skus', 'image_id', {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: null,
          comment: 'SKU 专属图片 ID（不同规格对应不同图片，如不同颜色）'
        }, { transaction })
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      const skuDesc = await queryInterface.describeTable('exchange_item_skus')
      if (skuDesc.image_id) {
        await queryInterface.removeColumn('exchange_item_skus', 'image_id', { transaction })
      }

      const eiDesc = await queryInterface.describeTable('exchange_items')
      if (eiDesc.video_url) {
        await queryInterface.removeColumn('exchange_items', 'video_url', { transaction })
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
