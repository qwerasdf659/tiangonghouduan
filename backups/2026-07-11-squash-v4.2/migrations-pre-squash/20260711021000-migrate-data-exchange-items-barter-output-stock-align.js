'use strict'

/**
 * 数据迁移: 换物产出商品 stock 物化列对齐（库存口径拍板，2026-07-11）
 *
 * 背景（配方总量 vs 商品库存 对账口径拍板）:
 * - exchange_items.stock 是「SKU 聚合物化列」（= SUM(exchange_item_skus.stock WHERE status='active')），
 *   属兑换商城购买链路；每日凌晨 3:20 的 SPU 物化列对账任务会全量重算回写；
 * - 换物（barter）发放总量的唯一权威 = 配方 total_limit（BarterService._assertRecipeLimits
 *   并发安全计数），换物链路不读不写 stock——杜绝"两套库存"账实漂移；
 * - 试点产出商品「毛巾礼盒（换物）」创建时曾直写 stock=100，但该商品无 SKU，
 *   按聚合口径物化列应为 0（否则今晚对账任务会将其判为 drift 并强制归零，
 *   等于留下一条已知必然漂移的数据）。本迁移主动对齐，消除口径冲突。
 *
 * 变更内容:
 * 1. 将「无任何 active SKU 且 stock≠0」的换物专供产出商品（毛巾礼盒（换物））stock 归 0；
 *    对齐 SQL 口径与 scripts/reconcile-items.js executeSpuSummaryReconciliation 完全一致。
 *
 * 回滚: 无需回滚（物化列以 SKU 聚合为唯一真相，回写任何非聚合值都会被对账任务再次纠正）。
 */

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const [result] = await sequelize.query(
      `UPDATE exchange_items ei
       LEFT JOIN (
         SELECT s.exchange_item_id, COALESCE(SUM(s.stock), 0) AS sum_stock
         FROM exchange_item_skus s WHERE s.status = 'active'
         GROUP BY s.exchange_item_id
       ) agg ON agg.exchange_item_id = ei.exchange_item_id
       SET ei.stock = 0, ei.updated_at = NOW()
       WHERE ei.item_name = '毛巾礼盒（换物）'
         AND COALESCE(agg.sum_stock, 0) = 0
         AND ei.stock <> 0`
    )
    console.log(
      `✅ 换物产出商品 stock 物化列已对齐（受影响行数: ${result?.affectedRows ?? 'N/A'}）——发放总量以配方 total_limit 为唯一权威`
    )
  },

  async down() {
    // 物化列唯一真相 = SKU 聚合；回写非聚合值会被每日 SPU 对账任务再次纠正，故不回滚
    console.log('⏪ 无需回滚：stock 物化列以 SKU 聚合为唯一真相')
  }
}
