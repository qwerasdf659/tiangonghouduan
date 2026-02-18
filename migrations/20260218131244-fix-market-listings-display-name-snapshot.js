'use strict'

/**
 * 修复 market_listings 历史快照中的材料显示名称
 *
 * 业务背景：
 * - market_listings 表存储挂牌时刻的快照名称（offer_asset_display_name）
 * - material_asset_types.display_name 已在迁移 20260218000001 中更新为「红水晶碎片」
 * - 但 234 条历史挂牌记录的快照仍为「红色碎片」，需同步更新
 *
 * 影响范围：
 * - 仅影响 offer_asset_code = 'red_shard' 且 offer_asset_display_name = '红色碎片' 的记录
 * - 不影响任何业务逻辑，仅修正显示名称一致性
 *
 * @date 2026-02-18
 */
module.exports = {
  async up(queryInterface) {
    const [results] = await queryInterface.sequelize.query(
      `UPDATE market_listings
       SET offer_asset_display_name = '红水晶碎片'
       WHERE offer_asset_code = 'red_shard'
         AND offer_asset_display_name = '红色碎片'`
    )

    const affectedRows = results.affectedRows || results.changedRows || 0
    console.log(`✅ 已更新 ${affectedRows} 条 market_listings 快照名称：红色碎片 → 红水晶碎片`)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE market_listings
       SET offer_asset_display_name = '红色碎片'
       WHERE offer_asset_code = 'red_shard'
         AND offer_asset_display_name = '红水晶碎片'`
    )

    console.log('✅ 已恢复 market_listings 快照名称为「红色碎片」')
  }
}
