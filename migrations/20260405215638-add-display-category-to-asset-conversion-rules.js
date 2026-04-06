'use strict'

/**
 * 迁移：asset_conversion_rules 表新增 display_category 字段
 *
 * 背景：文档方案 D+（元数据自动推导 + 运营可选覆盖）
 * - 前端通过 tier 比较自动推导 conversion_type（compose/decompose/exchange）
 * - 运营可通过 display_category 手动覆盖推导结果
 * - 优先级：display_category > tier 推导
 *
 * 字段说明：
 * - NULL = 使用自动推导（默认）
 * - 'compose' = 合成
 * - 'decompose' = 分解
 * - 'exchange' = 兑换
 * - 自定义值也允许（VARCHAR 不做 ENUM 限制，方便扩展）
 *
 * 安全说明：
 * - asset_conversion_rules 是配置表，不在互锁体系内，可直接改
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('asset_conversion_rules', 'display_category', {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: null,
      comment: '展示分类（运营覆盖）：compose/decompose/exchange，NULL=自动推导'
    })
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('asset_conversion_rules', 'display_category')
  }
}
