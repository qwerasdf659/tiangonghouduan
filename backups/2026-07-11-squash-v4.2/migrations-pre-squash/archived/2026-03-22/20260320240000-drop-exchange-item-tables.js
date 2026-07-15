'use strict'

/**
 * 迁移：删除旧 exchange_items / exchange_item_skus 表
 *
 * 前提：20260320200200-migrate-data-to-unified-product-center.js 已将
 *       5 条 SPU → products、5 条 SKU → product_skus + exchange_channel_prices
 *
 * 本迁移：
 *   1. 移除 exchange_records 中的 exchange_item_id 外键约束（数据保留）
 *   2. DROP exchange_item_skus
 *   3. DROP exchange_items
 */

module.exports = {
  up: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 安全检查：确保 products 表已有数据（前置迁移已执行）
      const [products] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) AS cnt FROM products',
        { transaction }
      )
      if (!products[0] || Number(products[0].cnt) === 0) {
        throw new Error(
          '❌ products 表为空，请先运行 20260320200200-migrate-data-to-unified-product-center'
        )
      }
      console.log(`✅ products 表已有 ${products[0].cnt} 条数据，继续删除旧表`)

      // 1. 移除 exchange_records.exchange_item_id 的外键约束（如果存在）
      const [fks] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'exchange_records'
           AND COLUMN_NAME = 'exchange_item_id'
           AND REFERENCED_TABLE_NAME = 'exchange_items'`,
        { transaction }
      )
      for (const fk of fks) {
        await queryInterface.sequelize.query(
          `ALTER TABLE exchange_records DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
          { transaction }
        )
        console.log(`✅ 移除外键约束 ${fk.CONSTRAINT_NAME}`)
      }

      // 2. DROP exchange_item_skus（子表先删）
      await queryInterface.dropTable('exchange_item_skus', { transaction })
      console.log('✅ 已删除 exchange_item_skus 表')

      // 3. DROP exchange_items
      await queryInterface.dropTable('exchange_items', { transaction })
      console.log('✅ 已删除 exchange_items 表')

      await transaction.commit()
      console.log('✅ 旧兑换商品表清理完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 重建 exchange_items 表
      await queryInterface.createTable(
        'exchange_items',
        {
          exchange_item_id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
          },
          item_name: { type: Sequelize.STRING(100), allowNull: false },
          description: { type: Sequelize.TEXT, allowNull: true },
          cost_asset_code: { type: Sequelize.STRING(50), allowNull: true },
          cost_amount: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
          cost_price: { type: Sequelize.DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
          stock: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          sold_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'active' },
          primary_media_id: { type: Sequelize.INTEGER, allowNull: true },
          category_def_id: { type: Sequelize.INTEGER, allowNull: true },
          rarity_code: { type: Sequelize.STRING(20), allowNull: true, defaultValue: 'common' },
          space: { type: Sequelize.STRING(20), allowNull: true, defaultValue: 'lucky' },
          original_price: { type: Sequelize.INTEGER, allowNull: true },
          tags: { type: Sequelize.JSON, allowNull: true },
          is_new: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          is_hot: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          is_lucky: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          is_limited: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          is_recommended: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          is_pinned: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          pinned_at: { type: Sequelize.DATE, allowNull: true },
          has_warranty: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          free_shipping: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          sell_point: { type: Sequelize.STRING(200), allowNull: true },
          usage_rules: { type: Sequelize.JSON, allowNull: true },
          mint_instance: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          item_template_id: { type: Sequelize.INTEGER, allowNull: true },
          video_url: { type: Sequelize.STRING(500), allowNull: true },
          stock_alert_threshold: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
          publish_at: { type: Sequelize.DATE, allowNull: true },
          unpublish_at: { type: Sequelize.DATE, allowNull: true },
          min_cost_amount: { type: Sequelize.INTEGER, allowNull: true },
          max_cost_amount: { type: Sequelize.INTEGER, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false }
        },
        { transaction }
      )

      // 重建 exchange_item_skus 表
      await queryInterface.createTable(
        'exchange_item_skus',
        {
          sku_id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
          },
          exchange_item_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'exchange_items', key: 'exchange_item_id' }
          },
          spec_values: { type: Sequelize.JSON, allowNull: true },
          cost_asset_code: { type: Sequelize.STRING(50), allowNull: true },
          cost_amount: { type: Sequelize.INTEGER, allowNull: true },
          stock: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          sold_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'active' },
          sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          image_id: { type: Sequelize.INTEGER, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false }
        },
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 旧表已恢复（无数据）')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
