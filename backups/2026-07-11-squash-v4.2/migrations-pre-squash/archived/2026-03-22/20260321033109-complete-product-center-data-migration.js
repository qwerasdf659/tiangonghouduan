'use strict'

/**
 * 统一商品中心数据完善迁移
 *
 * 解决的问题：
 * 1. exchange_records 旧记录回填 product_id / sku_id（通过 sku_code 中的旧 exchange_item_id 映射）
 * 2. test 来源的 893 条 items 回填 item_template_id（清理无用测试数据）
 * 3. category_defs 旧表标记废弃（重命名为 _deprecated_category_defs）
 * 4. products 的 item_template_id 需要运营手动配置（此迁移不自动关联，标注为运营配置项）
 *
 * @migration 20260321033109-complete-product-center-data-migration
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ─── 步骤 1：回填 exchange_records 的 product_id 和 sku_id ───
      // 旧 exchange_item_id 234 → 衣服 → product_id:6, sku_id:6（sku_code: legacy_234_1）
      // 旧 exchange_item_id 235 → 宝石1 → product_id:7, sku_id:7（sku_code: legacy_235_2）

      const [skuMappings] = await queryInterface.sequelize.query(
        `SELECT ps.sku_id, ps.product_id, ps.sku_code,
                CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(ps.sku_code, '_', 2), '_', -1) AS UNSIGNED) AS legacy_exchange_item_id
         FROM product_skus ps
         WHERE ps.sku_code LIKE 'legacy\\_%'`,
        { transaction }
      )

      console.log(`[迁移] 找到 ${skuMappings.length} 条 legacy SKU 映射`)

      for (const mapping of skuMappings) {
        const [result] = await queryInterface.sequelize.query(
          `UPDATE exchange_records 
           SET product_id = :product_id, sku_id = :sku_id 
           WHERE exchange_item_id = :legacy_id AND product_id IS NULL`,
          {
            replacements: {
              product_id: mapping.product_id,
              sku_id: mapping.sku_id,
              legacy_id: mapping.legacy_exchange_item_id
            },
            transaction
          }
        )
        console.log(`[迁移] exchange_item_id=${mapping.legacy_exchange_item_id} → product_id=${mapping.product_id}, sku_id=${mapping.sku_id}`)
      }

      // 验证回填结果
      const [[{ remaining_null }]] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as remaining_null FROM exchange_records WHERE product_id IS NULL',
        { transaction }
      )
      console.log(`[迁移] exchange_records 回填后仍有 ${remaining_null} 条 product_id 为 NULL`)

      // ─── 步骤 2：清理 test 来源的无用物品数据 ───
      // 893 条 test 来源物品没有 item_template_id，这些是开发测试数据
      // 采用硬删除策略（符合项目规范：孤儿数据硬删除）
      const [[{ test_orphan_count }]] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as test_orphan_count FROM items 
         WHERE source = 'test' AND item_template_id IS NULL`,
        { transaction }
      )
      console.log(`[迁移] 发现 ${test_orphan_count} 条 test 来源孤儿物品`)

      if (test_orphan_count > 0) {
        // 按外键依赖顺序删除：redemption_orders → exchange_records → market_listings → item_holds → item_ledger → items

        // 删除关联的 redemption_orders
        await queryInterface.sequelize.query(
          `DELETE ro FROM redemption_orders ro
           INNER JOIN items i ON ro.item_id = i.item_id
           WHERE i.source = 'test' AND i.item_template_id IS NULL`,
          { transaction }
        )

        // 删除关联的 exchange_records（通过 item_id）
        await queryInterface.sequelize.query(
          `DELETE er FROM exchange_records er
           INNER JOIN items i ON er.item_id = i.item_id
           WHERE i.source = 'test' AND i.item_template_id IS NULL`,
          { transaction }
        )

        // 删除关联的 item_holds
        await queryInterface.sequelize.query(
          `DELETE ih FROM item_holds ih
           INNER JOIN items i ON ih.item_id = i.item_id
           WHERE i.source = 'test' AND i.item_template_id IS NULL`,
          { transaction }
        )

        // 删除关联的 item_ledger
        await queryInterface.sequelize.query(
          `DELETE il FROM item_ledger il
           INNER JOIN items i ON il.item_id = i.item_id
           WHERE i.source = 'test' AND i.item_template_id IS NULL`,
          { transaction }
        )

        // 删除关联的 trade_orders（通过 market_listings → offer_item_id）
        await queryInterface.sequelize.query(
          `DELETE tor FROM trade_orders tor
           INNER JOIN market_listings ml ON tor.market_listing_id = ml.market_listing_id
           INNER JOIN items i ON ml.offer_item_id = i.item_id
           WHERE i.source = 'test' AND i.item_template_id IS NULL`,
          { transaction }
        )

        // 删除关联的 market_listings（通过 offer_item_id）
        await queryInterface.sequelize.query(
          `DELETE ml FROM market_listings ml
           INNER JOIN items i ON ml.offer_item_id = i.item_id
           WHERE i.source = 'test' AND i.item_template_id IS NULL`,
          { transaction }
        )

        // 最后删除孤儿 items
        await queryInterface.sequelize.query(
          `DELETE FROM items WHERE source = 'test' AND item_template_id IS NULL`,
          { transaction }
        )
        console.log(`[迁移] 已硬删除 ${test_orphan_count} 条 test 孤儿物品及其所有关联记录`)
      }

      // ─── 步骤 3：重命名 category_defs 为废弃表 ───
      const [catDefExists] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'category_defs'",
        { transaction }
      )
      if (catDefExists[0].cnt > 0) {
        // 检查是否已经重命名过
        const [renamedExists] = await queryInterface.sequelize.query(
          "SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_deprecated_category_defs'",
          { transaction }
        )
        if (renamedExists[0].cnt === 0) {
          await queryInterface.renameTable('category_defs', '_deprecated_category_defs', { transaction })
          console.log('[迁移] category_defs → _deprecated_category_defs（标记废弃）')
        } else {
          console.log('[迁移] _deprecated_category_defs 已存在，跳过重命名')
        }
      }

      await transaction.commit()
      console.log('[迁移] 统一商品中心数据完善迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('[迁移] 失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚步骤 3：恢复 category_defs 表名
      const [renamedExists] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_deprecated_category_defs'",
        { transaction }
      )
      if (renamedExists[0].cnt > 0) {
        await queryInterface.renameTable('_deprecated_category_defs', 'category_defs', { transaction })
        console.log('[回滚] _deprecated_category_defs → category_defs')
      }

      // 回滚步骤 1：清空 exchange_records 的 product_id 和 sku_id
      await queryInterface.sequelize.query(
        `UPDATE exchange_records SET product_id = NULL, sku_id = NULL 
         WHERE exchange_item_id IS NOT NULL AND product_id IS NOT NULL`,
        { transaction }
      )
      console.log('[回滚] exchange_records product_id/sku_id 已清空')

      // 注意：步骤 2 的硬删除不可回滚（test 数据已清理）

      await transaction.commit()
      console.log('[回滚] 数据迁移回滚完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
