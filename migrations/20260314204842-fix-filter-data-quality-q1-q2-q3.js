'use strict'

/**
 * 数据库迁移：筛选系统数据质量修复（Q1/Q2/Q3）
 *
 * 修复三个 P0 级数据质量问题，直接导致筛选功能不可用：
 *
 * Q1: exchange_items 全部 6 条商品 category=null
 *     → 根据商品名称和业务含义分配启用的分类代码
 *
 * Q2: 21 条在售 market_listings 使用已禁用的 voucher 分类
 *     → 将 offer_item_category_code 从 'voucher' 更新为 'other'（启用分类）
 *
 * Q3: 21 条在售 market_listings 的 offer_item_rarity 全部为 null
 *     → 根据关联 items 表的实际 rarity_code 回填
 *
 * 前置条件：
 * - category_defs 表中 home_life/lifestyle/food/collectible/other 处于启用状态
 * - rarity_defs 表中 common/uncommon/rare/epic/legendary 处于启用状态
 *
 * @since 2026-03-14
 * @see docs/筛选系统设计方案分析报告.md
 */
module.exports = {
  async up(queryInterface) {
    // ── Q1：修复 exchange_items.category = null ──
    // 根据商品名称和业务含义分配分类（均为 category_defs 中 is_enabled=1 的分类）
    await queryInterface.sequelize.query(`
      UPDATE exchange_items SET category = 'home_life'
      WHERE exchange_item_id = 234 AND category IS NULL
    `)
    await queryInterface.sequelize.query(`
      UPDATE exchange_items SET category = 'collectible'
      WHERE exchange_item_id = 235 AND category IS NULL
    `)
    await queryInterface.sequelize.query(`
      UPDATE exchange_items SET category = 'other'
      WHERE exchange_item_id IN (196, 209, 215, 220) AND category IS NULL
    `)

    // ── Q2：修复 market_listings 使用已禁用的 voucher 分类 ──
    // voucher 在 category_defs 中 is_enabled=0，将在售挂单迁移到 'other' 分类
    await queryInterface.sequelize.query(`
      UPDATE market_listings
      SET offer_item_category_code = 'other'
      WHERE status = 'on_sale'
        AND offer_item_category_code = 'voucher'
    `)

    // ── Q3：修复 market_listings.offer_item_rarity = null ──
    // 从关联的 items 表回填实际的 rarity_code
    await queryInterface.sequelize.query(`
      UPDATE market_listings ml
      INNER JOIN items i ON ml.offer_item_id = i.item_id
      SET ml.offer_item_rarity = i.rarity_code
      WHERE ml.status = 'on_sale'
        AND ml.offer_item_rarity IS NULL
        AND i.rarity_code IS NOT NULL
    `)
  },

  async down(queryInterface) {
    // 回滚：恢复 exchange_items.category 为 null
    await queryInterface.sequelize.query(`
      UPDATE exchange_items SET category = NULL
      WHERE exchange_item_id IN (196, 209, 215, 220, 234, 235)
    `)

    // 回滚：恢复 market_listings.offer_item_category_code 为 voucher
    await queryInterface.sequelize.query(`
      UPDATE market_listings
      SET offer_item_category_code = 'voucher'
      WHERE status = 'on_sale'
        AND offer_item_category_code = 'other'
    `)

    // 回滚：恢复 market_listings.offer_item_rarity 为 null
    await queryInterface.sequelize.query(`
      UPDATE market_listings
      SET offer_item_rarity = NULL
      WHERE status = 'on_sale'
    `)
  }
}
