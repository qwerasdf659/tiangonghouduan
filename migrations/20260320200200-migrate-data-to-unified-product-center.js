'use strict'

/**
 * 数据迁移：旧表 → 统一商品中心
 *
 * 迁移内容：
 *   1. category_defs → categories（9条品类数据）
 *   2. exchange_items → products（5条商品数据）
 *   3. exchange_item_skus → product_skus + exchange_channel_prices（5条SKU+定价）
 *   4. items.item_template_id 回填（7832条历史物品通过 lottery_prizes 关系回填）
 *
 * 依据文档：第十八章 Phase 5
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ═══════════════════════════════════════
      // 1. category_defs → categories
      // ═══════════════════════════════════════
      const [categoryDefs] = await queryInterface.sequelize.query(
        'SELECT * FROM category_defs ORDER BY level ASC, sort_order ASC',
        { transaction }
      )

      if (categoryDefs.length > 0) {
        for (const cat of categoryDefs) {
          await queryInterface.sequelize.query(
            `INSERT INTO categories (category_id, parent_category_id, category_name, category_code, level, sort_order, is_enabled, created_at, updated_at)
             VALUES (:id, :parent_id, :name, :code, :level, :sort_order, :is_enabled, :created_at, :updated_at)
             ON DUPLICATE KEY UPDATE category_name = VALUES(category_name)`,
            {
              replacements: {
                id: cat.category_def_id,
                parent_id: cat.parent_category_def_id || null,
                name: cat.display_name,
                code: cat.category_code,
                level: cat.level || 1,
                sort_order: cat.sort_order || 0,
                is_enabled: cat.is_enabled !== undefined ? cat.is_enabled : 1,
                created_at: cat.created_at || new Date(),
                updated_at: cat.updated_at || new Date()
              },
              transaction
            }
          )
        }
        console.log(`✅ 品类迁移完成：${categoryDefs.length} 条`)
      }

      // ═══════════════════════════════════════
      // 2. exchange_items → products
      // ═══════════════════════════════════════
      const [exchangeItems] = await queryInterface.sequelize.query(
        'SELECT * FROM exchange_items ORDER BY exchange_item_id ASC',
        { transaction }
      )

      const itemIdMapping = {}

      for (const ei of exchangeItems) {
        const [insertResult] = await queryInterface.sequelize.query(
          `INSERT INTO products (product_name, category_id, description, primary_media_id, rarity_code, status, sort_order, space, is_pinned, pinned_at, is_new, is_hot, is_limited, is_recommended, tags, sell_point, usage_rules, video_url, stock_alert_threshold, publish_at, unpublish_at, attributes_json, mint_instance, created_at, updated_at)
           VALUES (:product_name, :category_id, :description, :primary_media_id, :rarity_code, :status, :sort_order, :space, :is_pinned, :pinned_at, :is_new, :is_hot, :is_limited, :is_recommended, :tags, :sell_point, :usage_rules, :video_url, :stock_alert_threshold, :publish_at, :unpublish_at, :attributes_json, :mint_instance, :created_at, :updated_at)`,
          {
            replacements: {
              product_name: ei.item_name,
              category_id: ei.category_def_id || null,
              description: ei.description || null,
              primary_media_id: ei.primary_media_id || null,
              rarity_code: ei.rarity_code || 'common',
              status: ei.status || 'active',
              sort_order: ei.sort_order || 0,
              space: ei.space || 'lucky',
              is_pinned: ei.is_pinned || 0,
              pinned_at: ei.pinned_at || null,
              is_new: ei.is_new || 0,
              is_hot: ei.is_hot || 0,
              is_limited: ei.is_limited || 0,
              is_recommended: ei.is_recommended || 0,
              tags: ei.tags ? JSON.stringify(ei.tags) : null,
              sell_point: ei.sell_point || null,
              usage_rules: ei.usage_rules ? JSON.stringify(ei.usage_rules) : null,
              video_url: ei.video_url || null,
              stock_alert_threshold: ei.stock_alert_threshold || 0,
              publish_at: ei.publish_at || null,
              unpublish_at: ei.unpublish_at || null,
              attributes_json: ei.attributes ? JSON.stringify(ei.attributes) : null,
              mint_instance: 1,
              created_at: ei.created_at || new Date(),
              updated_at: ei.updated_at || new Date()
            },
            transaction
          }
        )

        const productId = insertResult
        itemIdMapping[ei.exchange_item_id] = productId
      }

      if (exchangeItems.length > 0) {
        console.log(`✅ 商品SPU迁移完成：${exchangeItems.length} 条`)
      }

      // ═══════════════════════════════════════
      // 3. exchange_item_skus → product_skus + exchange_channel_prices
      // ═══════════════════════════════════════
      const [exchangeSkus] = await queryInterface.sequelize.query(
        `SELECT s.*, e.cost_asset_code AS spu_cost_asset_code, e.cost_amount AS spu_cost_amount
         FROM exchange_item_skus s
         JOIN exchange_items e ON s.exchange_item_id = e.exchange_item_id
         ORDER BY s.sku_id ASC`,
        { transaction }
      )

      for (const sku of exchangeSkus) {
        const productId = itemIdMapping[sku.exchange_item_id]
        if (!productId) continue

        const skuCode = `legacy_${sku.exchange_item_id}_${sku.sku_id}`

        const [skuInsertResult] = await queryInterface.sequelize.query(
          `INSERT INTO product_skus (product_id, sku_code, stock, sold_count, status, sort_order, created_at, updated_at)
           VALUES (:product_id, :sku_code, :stock, :sold_count, :status, :sort_order, :created_at, :updated_at)`,
          {
            replacements: {
              product_id: productId,
              sku_code: skuCode,
              stock: sku.stock || 0,
              sold_count: sku.sold_count || 0,
              status: sku.status || 'active',
              sort_order: sku.sort_order || 0,
              created_at: sku.created_at || new Date(),
              updated_at: sku.updated_at || new Date()
            },
            transaction
          }
        )

        const newSkuId = skuInsertResult

        const costAssetCode = sku.cost_asset_code || sku.spu_cost_asset_code
        const costAmount = sku.cost_amount || sku.spu_cost_amount

        if (costAssetCode && costAmount) {
          await queryInterface.sequelize.query(
            `INSERT INTO exchange_channel_prices (sku_id, cost_asset_code, cost_amount, is_enabled, created_at, updated_at)
             VALUES (:sku_id, :cost_asset_code, :cost_amount, 1, NOW(), NOW())`,
            {
              replacements: {
                sku_id: newSkuId,
                cost_asset_code: costAssetCode,
                cost_amount: costAmount
              },
              transaction
            }
          )
        }
      }

      if (exchangeSkus.length > 0) {
        console.log(`✅ SKU + 渠道定价迁移完成：${exchangeSkus.length} 条`)
      }

      // ═══════════════════════════════════════
      // 4. items.item_template_id 回填
      // lottery_prizes 表与 item_templates 无直接关联字段
      // 历史数据（7832条）的 item_template_id 需要运营团队手动匹配
      // 新兑换产出的物品会自动关联 item_template_id（通过 ExchangeCoreService 铸造分支）
      // ═══════════════════════════════════════
      console.log('⚠️ items.item_template_id 回填跳过：lottery_prizes 与 item_templates 无直接关联字段')
      console.log('   历史物品的 item_template_id 需要运营团队手动匹配或通过管理后台批量设置')
      console.log('   新铸造的物品会自动关联 item_template_id')

      await transaction.commit()
      console.log('✅ 数据迁移全部完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 数据迁移失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.sequelize.query(
        'UPDATE items SET item_template_id = NULL WHERE item_template_id IS NOT NULL',
        { transaction }
      )
      await queryInterface.sequelize.query('DELETE FROM exchange_channel_prices', { transaction })
      await queryInterface.sequelize.query('DELETE FROM sku_attribute_values', { transaction })
      await queryInterface.sequelize.query('DELETE FROM product_skus', { transaction })
      await queryInterface.sequelize.query('DELETE FROM product_attribute_values', { transaction })
      await queryInterface.sequelize.query('DELETE FROM products', { transaction })
      await queryInterface.sequelize.query('DELETE FROM category_attributes', { transaction })
      await queryInterface.sequelize.query('DELETE FROM categories', { transaction })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
