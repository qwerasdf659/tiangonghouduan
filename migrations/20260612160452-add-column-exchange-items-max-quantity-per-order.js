'use strict'

/**
 * 兑换商品增列：max_quantity_per_order（每单兑换数量上限）——议题四·P6=A
 *
 * 创建时间: 2026-06-12（docs/legal/微信小程序前端项目求证文档.md 议题四·P6=A/P7 已采纳）
 * 创建原因:
 * - 实测：exchange_items 无"每单数量上限"列；提交接口 routes/v4/exchange/index.js:317 硬编码「1-10」魔术数字，
 *   既非商品级可配业务规则，也未在详情/列表接口下发。
 * - 按"业务规则后端权威、可配置、消灭魔术数字、单一真相源"原则，将每单上限收编为商品级可配列：
 *   exchange_items.max_quantity_per_order INT NOT NULL DEFAULT 10（≥1，运营后台可配）。
 * - 详情/列表接口下发该列，提交接口改读该列（不再硬编码 10），限量商品可设每单 1 件、普通商品 10 件。
 *
 * 回滚(down): 删除该列。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('exchange_items', 'max_quantity_per_order', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 10,
      comment: '每单兑换数量上限（≥1，运营可配；提交接口据此校验，替代历史硬编码 1-10）'
    })
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('exchange_items', 'max_quantity_per_order')
  }
}
