'use strict';

/**
 * P2 数据库迁移：裸名字段重命名
 * 
 * 修改内容：
 * - exchange_items.name → item_name
 * - products.name → product_name
 * 
 * 原因：
 * - 裸名字段（name、type）在多表 JOIN 场景下容易产生歧义
 * - 符合项目命名规范：字段名应包含业务前缀
 * 
 * @see docs/技术债务排查-语义优先原则全项目排查报告.md
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('📝 开始迁移：重命名裸名字段');

    // 1. exchange_items.name → item_name
    console.log('  1️⃣ exchange_items.name → item_name');
    const [exchangeItemsField] = await queryInterface.sequelize.query(
      `SHOW FULL COLUMNS FROM exchange_items WHERE Field = 'name';`
    );

    if (exchangeItemsField.length > 0) {
      await queryInterface.sequelize.query(
        `ALTER TABLE exchange_items 
         CHANGE COLUMN name item_name VARCHAR(200) NOT NULL 
         COMMENT '商品名称（兑换商品的显示名称）'`
      );
      console.log('  ✅ exchange_items.name → item_name 完成');
    } else {
      // 检查是否已迁移
      const [newField] = await queryInterface.sequelize.query(
        `SHOW FULL COLUMNS FROM exchange_items WHERE Field = 'item_name';`
      );
      if (newField.length > 0) {
        console.log('  ⏭️ exchange_items.item_name 已存在，跳过');
      } else {
        console.log('  ⚠️ exchange_items 表中 name 字段不存在');
      }
    }

    // 2. products.name → product_name
    console.log('  2️⃣ products.name → product_name');
    const [productsField] = await queryInterface.sequelize.query(
      `SHOW FULL COLUMNS FROM products WHERE Field = 'name';`
    );

    if (productsField.length > 0) {
      await queryInterface.sequelize.query(
        `ALTER TABLE products 
         CHANGE COLUMN name product_name VARCHAR(200) NOT NULL 
         COMMENT '商品名称（产品的显示名称）'`
      );
      console.log('  ✅ products.name → product_name 完成');
    } else {
      // 检查是否已迁移
      const [newField] = await queryInterface.sequelize.query(
        `SHOW FULL COLUMNS FROM products WHERE Field = 'product_name';`
      );
      if (newField.length > 0) {
        console.log('  ⏭️ products.product_name 已存在，跳过');
      } else {
        console.log('  ⚠️ products 表中 name 字段不存在');
      }
    }

    console.log('✅ P2 裸名字段迁移完成');
  },

  async down(queryInterface, Sequelize) {
    console.log('📝 回滚迁移：恢复裸名字段');

    // 1. exchange_items.item_name → name
    console.log('  1️⃣ exchange_items.item_name → name');
    const [exchangeItemsField] = await queryInterface.sequelize.query(
      `SHOW FULL COLUMNS FROM exchange_items WHERE Field = 'item_name';`
    );

    if (exchangeItemsField.length > 0) {
      await queryInterface.sequelize.query(
        `ALTER TABLE exchange_items 
         CHANGE COLUMN item_name name VARCHAR(200) NOT NULL 
         COMMENT '商品名称'`
      );
      console.log('  ✅ exchange_items.item_name → name 完成');
    } else {
      console.log('  ⏭️ exchange_items.item_name 不存在，跳过');
    }

    // 2. products.product_name → name
    console.log('  2️⃣ products.product_name → name');
    const [productsField] = await queryInterface.sequelize.query(
      `SHOW FULL COLUMNS FROM products WHERE Field = 'product_name';`
    );

    if (productsField.length > 0) {
      await queryInterface.sequelize.query(
        `ALTER TABLE products 
         CHANGE COLUMN product_name name VARCHAR(200) NOT NULL 
         COMMENT '商品名称'`
      );
      console.log('  ✅ products.product_name → name 完成');
    } else {
      console.log('  ⏭️ products.product_name 不存在，跳过');
    }

    console.log('✅ P2 裸名字段回滚完成');
  }
};

