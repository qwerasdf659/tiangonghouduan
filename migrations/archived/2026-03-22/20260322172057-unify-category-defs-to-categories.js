'use strict'

/**
 * 统一品类表：category_defs → categories
 *
 * 背景：
 *   EAV 商品中心已使用 categories 表，但 item_templates 和 market_listings
 *   仍通过 FK 指向旧表 category_defs。两张表数据完全一致（25 条，ID 一一对应），
 *   并存造成开发者困惑。
 *
 * 操作：
 *   1. item_templates：新增 category_id → categories，从 category_def_id 回填，删除旧列
 *   2. market_listings：新增 offer_category_id → categories，从 offer_category_def_id 回填，删除旧列
 *   3. DROP category_defs
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========================================

      // 1a. 添加新列
      await queryInterface.sequelize.query(
        'ALTER TABLE item_templates ADD COLUMN category_id INT NULL',
        { transaction }
      )

      // 1b. 回填数据（category_def_id 与 category_id 一一对应）
      await queryInterface.sequelize.query(
        'UPDATE item_templates SET category_id = category_def_id WHERE category_def_id IS NOT NULL',
        { transaction }
      )

      // 1c. 删除旧 FK
      await queryInterface.sequelize.query(
        'ALTER TABLE item_templates DROP FOREIGN KEY fk_item_templates_category_def',
        { transaction }
      )

      // 1d. 删除旧列
      await queryInterface.removeColumn('item_templates', 'category_def_id', { transaction })

      // 1e. 添加新 FK + 索引
      await queryInterface.sequelize.query(
        'ALTER TABLE item_templates ADD CONSTRAINT fk_item_templates_category FOREIGN KEY (category_id) REFERENCES categories(category_id) ON UPDATE CASCADE ON DELETE SET NULL',
        { transaction }
      )

      // ========================================

      // 2a. 添加新列
      await queryInterface.sequelize.query(
        'ALTER TABLE market_listings ADD COLUMN offer_category_id INT NULL',
        { transaction }
      )

      // 2b. 回填数据
      await queryInterface.sequelize.query(
        'UPDATE market_listings SET offer_category_id = offer_category_def_id WHERE offer_category_def_id IS NOT NULL',
        { transaction }
      )

      // 2c. 删除旧 FK
      await queryInterface.sequelize.query(
        'ALTER TABLE market_listings DROP FOREIGN KEY fk_market_listings_offer_category_def',
        { transaction }
      )

      // 2d. 删除旧列
      await queryInterface.removeColumn('market_listings', 'offer_category_def_id', { transaction })

      // 2e. 添加新 FK + 索引
      await queryInterface.sequelize.query(
        'ALTER TABLE market_listings ADD CONSTRAINT fk_market_listings_offer_category FOREIGN KEY (offer_category_id) REFERENCES categories(category_id) ON UPDATE CASCADE ON DELETE SET NULL',
        { transaction }
      )

      // ========================================

      await queryInterface.sequelize.query(
        'ALTER TABLE category_defs DROP FOREIGN KEY fk_category_parent_def',
        { transaction }
      )

      await queryInterface.dropTable('category_defs', { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 重建 category_defs 表
      await queryInterface.sequelize.query(`
        CREATE TABLE category_defs (
          category_def_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          category_code VARCHAR(50) NOT NULL UNIQUE,
          display_name VARCHAR(100) NOT NULL,
          description VARCHAR(500) NULL,
          sort_order INT NOT NULL DEFAULT 0,
          is_enabled TINYINT(1) NOT NULL DEFAULT 1,
          level TINYINT NOT NULL DEFAULT 1,
          parent_category_def_id INT NULL,
          created_at DATETIME NOT NULL,
          updated_at DATETIME NOT NULL,
          INDEX idx_category_defs_level (level),
          INDEX idx_category_defs_parent (parent_category_def_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `, { transaction })

      // 从 categories 回填数据
      await queryInterface.sequelize.query(`
        INSERT INTO category_defs (category_def_id, category_code, display_name, description, sort_order, is_enabled, level, parent_category_def_id, created_at, updated_at)
        SELECT category_id, category_code, category_name, description, sort_order, is_enabled, level, parent_category_id, created_at, updated_at
        FROM categories
      `, { transaction })

      // 添加自引用 FK
      await queryInterface.sequelize.query(
        'ALTER TABLE category_defs ADD CONSTRAINT fk_category_parent_def FOREIGN KEY (parent_category_def_id) REFERENCES category_defs(category_def_id)',
        { transaction }
      )

      // market_listings: 恢复 offer_category_def_id
      await queryInterface.sequelize.query(
        'ALTER TABLE market_listings DROP FOREIGN KEY fk_market_listings_offer_category',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE market_listings ADD COLUMN offer_category_def_id INT NULL',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'UPDATE market_listings SET offer_category_def_id = offer_category_id WHERE offer_category_id IS NOT NULL',
        { transaction }
      )
      await queryInterface.removeColumn('market_listings', 'offer_category_id', { transaction })
      await queryInterface.sequelize.query(
        'ALTER TABLE market_listings ADD CONSTRAINT fk_market_listings_offer_category_def FOREIGN KEY (offer_category_def_id) REFERENCES category_defs(category_def_id)',
        { transaction }
      )

      // item_templates: 恢复 category_def_id
      await queryInterface.sequelize.query(
        'ALTER TABLE item_templates DROP FOREIGN KEY fk_item_templates_category',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE item_templates ADD COLUMN category_def_id INT NULL',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'UPDATE item_templates SET category_def_id = category_id WHERE category_id IS NOT NULL',
        { transaction }
      )
      await queryInterface.removeColumn('item_templates', 'category_id', { transaction })
      await queryInterface.sequelize.query(
        'ALTER TABLE item_templates ADD CONSTRAINT fk_item_templates_category_def FOREIGN KEY (category_def_id) REFERENCES category_defs(category_def_id) ON UPDATE CASCADE ON DELETE SET NULL',
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
