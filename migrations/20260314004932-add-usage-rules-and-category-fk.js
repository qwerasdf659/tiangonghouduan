'use strict'

/**
 * 数据库迁移：兑换详情页 B+C 混合方案 — 数据库层变更
 *
 * 变更内容：
 * 1. exchange_items 表新增 usage_rules JSON 列（使用说明条目数组）
 * 2. exchange_items.category 添加外键约束指向 category_defs.category_code
 *
 * 前置条件：
 * - category_defs 表已存在（baseline 迁移创建）
 * - exchange_items.category 为 VARCHAR(50)，与 category_defs.category_code 类型一致
 *
 * @since 2026-03-14
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // B1: 新增 usage_rules JSON 列（使用说明条目数组）
    await queryInterface.addColumn('exchange_items', 'usage_rules', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: null,
      comment: '使用说明条目数组，如 ["兑换后物品自动进入背包","虚拟物品一经兑换不可退还"]',
      after: 'sell_point'
    })

    // B2: exchange_items.category 添加外键约束指向 category_defs.category_code
    // 先检查外键是否已存在，避免重复创建
    const [existingFks] = await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_NAME = 'exchange_items'
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        AND CONSTRAINT_NAME = 'fk_exchange_items_category'
        AND TABLE_SCHEMA = DATABASE()
    `)

    if (existingFks.length === 0) {
      await queryInterface.addConstraint('exchange_items', {
        fields: ['category'],
        type: 'foreign key',
        name: 'fk_exchange_items_category',
        references: {
          table: 'category_defs',
          field: 'category_code'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      })
    }
  },

  async down(queryInterface) {
    // 回滚：先移除外键约束，再删除列
    const [existingFks] = await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_NAME = 'exchange_items'
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        AND CONSTRAINT_NAME = 'fk_exchange_items_category'
        AND TABLE_SCHEMA = DATABASE()
    `)

    if (existingFks.length > 0) {
      await queryInterface.removeConstraint('exchange_items', 'fk_exchange_items_category')
    }

    await queryInterface.removeColumn('exchange_items', 'usage_rules')
  }
}

