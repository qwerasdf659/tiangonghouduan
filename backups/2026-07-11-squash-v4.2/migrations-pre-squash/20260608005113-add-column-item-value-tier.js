'use strict'

/**
 * 添加列: item_templates.value_tier（高价值实物复合门槛判定字段）
 *
 * 创建时间: 2026-06-08（路线B 合规改造 模块C·第2步）
 * 创建原因（决策 17.4）:
 * - 高价值实物不以"固定碎片数"直兑（防碎片被锚定成提货券/类货币、射幸性回归）
 * - 不用价格阈值反推价值（实测 reference_price_points 跨度 0~5000 且有一批实物参考价为 0，会漏判）
 * - 改为显式枚举字段 value_tier，由运营在 admin 配置，代码按字段判定而非猜价格：
 *   low  = 日常物（碎片直兑，风险可接受）
 *   mid  = 中档（轻门槛：成长等级）
 *   high = 高档（全复合门槛：等级 + 多资产 + 消耗指定道具）
 * - 默认 low：存量数据零行为变化（仍碎片直兑），运营再逐步标 mid/high
 *
 * 回滚: 删除 value_tier 列（不影响其他字段）
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.addColumn(
        'item_templates',
        'value_tier',
        {
          type: Sequelize.ENUM('low', 'mid', 'high'),
          allowNull: false,
          defaultValue: 'low',
          comment: '价值档位（运营配置）：low-日常物碎片直兑 / mid-中档轻门槛 / high-高档复合门槛'
        },
        { transaction }
      )

      await queryInterface.addIndex('item_templates', ['value_tier'], {
        name: 'idx_item_templates_value_tier',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.removeIndex('item_templates', 'idx_item_templates_value_tier', {
        transaction
      })
      await queryInterface.removeColumn('item_templates', 'value_tier', { transaction })
      // 清理 ENUM 类型（MySQL 在列删除后自动清理，PG 需显式 drop type；本项目 MySQL，无需额外处理）
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
