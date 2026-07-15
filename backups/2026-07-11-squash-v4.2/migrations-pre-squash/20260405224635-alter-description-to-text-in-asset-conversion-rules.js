'use strict'

/**
 * 修改 asset_conversion_rules.description 列类型
 *
 * 变更：VARCHAR(500) → TEXT
 * 原因：文档 DDL 定义为 TEXT，实际建表时误用 VARCHAR(500)，
 *       TEXT 更适合存储不定长的规则描述文本
 *
 * 影响：无数据丢失风险（TEXT 兼容 VARCHAR 的所有现有数据）
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('asset_conversion_rules', 'description', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
      comment: '规则描述（运营备注）'
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('asset_conversion_rules', 'description', {
      type: Sequelize.STRING(500),
      allowNull: true,
      defaultValue: null,
      comment: '规则描述（运营备注）'
    })
  }
}
