'use strict'

/**
 * 添加列: exchange_items.min_cost_asset_code（SPU 最低价对应的计价资产码，物化冗余列）
 *
 * 创建时间: 2026-06-11 北京时间
 * 创建原因（议题1·拍板项①方案②，已确认）:
 * - exchange_items 已走"SPU 冗余物化列"路线（stock/sold_count/min_cost_amount/max_cost_amount 均为物化列），
 *   但唯独"最低价对应的计价资产码"（points/star_stone/red_core_shard…）需实时 JOIN exchange_channel_prices 才能取到，
 *   造成"价格用冗余列、资产码却要实时 JOIN"的架构割裂。
 * - 本列把该资产码也物化为 SPU 列：列表查询只读 SPU 物化列，彻底不 JOIN SKU/渠道价表，
 *   SQL 更简单、更易缓存，且符合发送给小程序的数据脱敏要求（列表不碰 SKU/定价表结构）。
 * - 取值与 exchange_channel_prices.cost_asset_code 同规格（VARCHAR(50)），由 _updateSpuSummary 回填，
 *   即"min_cost_amount 来自哪条渠道价，min_cost_asset_code 就取那条的 cost_asset_code"。
 *
 * 同一迁移内顺带"全量重算"5 个 SPU 汇总列（含 inactive 商品），修复历史脏数据
 * （实测 22 个商品 SPU 汇总与 active SKU 聚合不一致，如 id=248 SPU=0 而 SKU=945）。
 *
 * 字符集: 随表 utf8mb4_unicode_ci。
 * 回滚: 删除该列（重算出的汇总列数据为真实值，回滚不还原旧脏数据，符合"账实一致"目标）。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. 加列：min_cost_asset_code（NULL=该 SPU 暂无可售渠道价）
    await queryInterface.addColumn('exchange_items', 'min_cost_asset_code', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'SPU最低价对应的计价资产码(points/star_stone等，物化冗余列，来源最低价SKU渠道价；NULL=无可售渠道价)'
    })

    // 2. 全量重算 5 个 SPU 汇总列（含 inactive 商品），账实一致
    //    stock/sold_count 来自该 SPU 下 active SKU 聚合；
    //    min/max_cost_amount + min_cost_asset_code 来自 active SKU 的 is_enabled 渠道价。
    //    无 active SKU 或无可售渠道价时，对应列回填为 0 / NULL。
    await queryInterface.sequelize.query(`
      UPDATE exchange_items ei
      LEFT JOIN (
        SELECT s.exchange_item_id,
               COALESCE(SUM(s.stock), 0)      AS sum_stock,
               COALESCE(SUM(s.sold_count), 0) AS sum_sold
        FROM exchange_item_skus s
        WHERE s.status = 'active'
        GROUP BY s.exchange_item_id
      ) agg ON agg.exchange_item_id = ei.exchange_item_id
      LEFT JOIN (
        SELECT s.exchange_item_id,
               MIN(cp.cost_amount) AS min_amount,
               MAX(cp.cost_amount) AS max_amount
        FROM exchange_item_skus s
        JOIN exchange_channel_prices cp ON cp.sku_id = s.sku_id AND cp.is_enabled = 1
        WHERE s.status = 'active'
        GROUP BY s.exchange_item_id
      ) price ON price.exchange_item_id = ei.exchange_item_id
      SET ei.stock           = COALESCE(agg.sum_stock, 0),
          ei.sold_count      = COALESCE(agg.sum_sold, 0),
          ei.min_cost_amount = price.min_amount,
          ei.max_cost_amount = price.max_amount
    `)

    // 3. 回填 min_cost_asset_code：取"最低价那条 is_enabled 渠道价"的 cost_asset_code
    //    用相关子查询保证与 min_cost_amount 同源（同一 SPU 下最低 cost_amount 的资产码）。
    await queryInterface.sequelize.query(`
      UPDATE exchange_items ei
      SET ei.min_cost_asset_code = (
        SELECT cp.cost_asset_code
        FROM exchange_item_skus s
        JOIN exchange_channel_prices cp ON cp.sku_id = s.sku_id AND cp.is_enabled = 1
        WHERE s.exchange_item_id = ei.exchange_item_id AND s.status = 'active'
        ORDER BY cp.cost_amount ASC
        LIMIT 1
      )
    `)
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('exchange_items', 'min_cost_asset_code')
  }
}
