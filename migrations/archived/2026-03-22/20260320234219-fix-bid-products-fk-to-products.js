'use strict'

/**
 * 修复 bid_products.exchange_item_id 外键：exchange_items → products
 *
 * 原因：exchange_items 表已迁移到 products 表并删除，
 * 但 bid_products 的外键约束仍指向旧表。
 */
module.exports = {
  async up(queryInterface) {
    // 删除指向已不存在的 exchange_items 表的旧外键
    await queryInterface.sequelize.query(
      'ALTER TABLE `bid_products` DROP FOREIGN KEY `bid_products_ibfk_1`'
    )

    // 添加指向 products 表的新外键
    await queryInterface.addConstraint('bid_products', {
      fields: ['exchange_item_id'],
      type: 'foreign key',
      name: 'fk_bid_products_product',
      references: {
        table: 'products',
        field: 'product_id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('bid_products', 'fk_bid_products_product')
    // 回滚时不恢复旧外键（exchange_items 表可能不存在）
  }
}
