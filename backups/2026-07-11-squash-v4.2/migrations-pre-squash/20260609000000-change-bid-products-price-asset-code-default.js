'use strict'

/**
 * 修改列默认值: bid_products.price_asset_code  DIAMOND → star_stone（BE-9）
 *
 * 创建时间: 2026-06-09（文档 §10.2-④ / §11.2 定案⑧）
 * 创建原因:
 * - 实测 bid_products.price_asset_code 列默认值为历史脏值 'DIAMOND'，
 *   该值不在 material_asset_types 资产码体系（体系全为小写蛇形码：star_stone/各色 shard·gem）。
 * - 模型 models/BidProduct.js 已声明 defaultValue: 'star_stone'，与 DB 默认值不一致（模型/DB 漂移）。
 * - is_biddable 白名单实测仅 star_stone=1，即唯一可竞价币就是 star_stone。
 * - 本迁移把 DB 默认值对齐为 'star_stone'：即便运营建竞价商品时漏填，也落到合法且唯一可竞价的币，
 *   消除"漏填→落非法 DIAMOND→竞价取币异常"的隐患。
 * - bid_products 当前 0 条，无存量脏数据需修复，是清债最佳窗口。
 *
 * 回滚: 默认值改回 'DIAMOND'（仅为可逆性，不建议长期保留脏默认）
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('bid_products', 'price_asset_code', {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: 'star_stone',
      comment: '竞价使用的资产类型（禁止 points/budget_points；默认 star_stone）'
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('bid_products', 'price_asset_code', {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: 'DIAMOND',
      comment: '竞价使用的资产类型'
    })
  }
}
