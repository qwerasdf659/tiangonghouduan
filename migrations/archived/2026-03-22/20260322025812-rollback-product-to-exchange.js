'use strict'

/**
 * Product → Exchange 全量回改迁移
 *
 * 操作概述：
 *   products → exchange_items（表重命名 + PK/字段重命名）
 *   product_skus → exchange_item_skus（表重命名 + FK 列重命名）
 *   product_attribute_values → exchange_item_attribute_values（表重命名 + FK 列重命名）
 *   exchange_records 删除冗余 product_id 列（exchange_item_id 为唯一 FK）
 *
 * FK 处理：先删除全部 13 个 FK 约束，改表改列后重建 11 个（product_id 列删除导致减少 2 个）
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ==========================================
      await queryInterface.sequelize.query(
        'ALTER TABLE bid_products DROP FOREIGN KEY fk_bid_products_product',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_records DROP FOREIGN KEY exchange_records_product_id_foreign_idx',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_records DROP FOREIGN KEY exchange_records_sku_id_foreign_idx',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE product_attribute_values DROP FOREIGN KEY product_attribute_values_ibfk_1',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE product_attribute_values DROP FOREIGN KEY product_attribute_values_ibfk_2',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE product_skus DROP FOREIGN KEY product_skus_ibfk_1',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE product_skus DROP FOREIGN KEY product_skus_ibfk_2',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_channel_prices DROP FOREIGN KEY exchange_channel_prices_ibfk_1',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE sku_attribute_values DROP FOREIGN KEY sku_attribute_values_ibfk_1',
        { transaction }
      )

      // ==========================================
      await queryInterface.sequelize.query(
        'ALTER TABLE products DROP FOREIGN KEY products_ibfk_1',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE products DROP FOREIGN KEY products_ibfk_2',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE products DROP FOREIGN KEY products_ibfk_3',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE products DROP FOREIGN KEY products_ibfk_4',
        { transaction }
      )

      // ==========================================
      await queryInterface.renameTable('products', 'exchange_items', { transaction })
      await queryInterface.renameTable('product_skus', 'exchange_item_skus', { transaction })
      await queryInterface.renameTable('product_attribute_values', 'exchange_item_attribute_values', { transaction })

      // ==========================================
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_items CHANGE COLUMN product_id exchange_item_id BIGINT NOT NULL AUTO_INCREMENT',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_items CHANGE COLUMN product_name item_name VARCHAR(200) NOT NULL',
        { transaction }
      )

      // ==========================================
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_item_skus CHANGE COLUMN product_id exchange_item_id BIGINT NOT NULL',
        { transaction }
      )

      // ==========================================
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_item_attribute_values CHANGE COLUMN product_id exchange_item_id BIGINT NOT NULL',
        { transaction }
      )

      // ==========================================
      await queryInterface.sequelize.query(
        'DROP INDEX idx_exchange_records_product_sku ON exchange_records',
        { transaction }
      )
      await queryInterface.removeColumn('exchange_records', 'product_id', { transaction })

      // ==========================================
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_items ADD CONSTRAINT exchange_items_ibfk_1 FOREIGN KEY (category_id) REFERENCES categories(category_id)',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_items ADD CONSTRAINT exchange_items_ibfk_2 FOREIGN KEY (primary_media_id) REFERENCES media_files(media_id)',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_items ADD CONSTRAINT exchange_items_ibfk_3 FOREIGN KEY (item_template_id) REFERENCES item_templates(item_template_id)',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_items ADD CONSTRAINT exchange_items_ibfk_4 FOREIGN KEY (rarity_code) REFERENCES rarity_defs(rarity_code)',
        { transaction }
      )

      // ==========================================
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_item_skus ADD CONSTRAINT exchange_item_skus_ibfk_1 FOREIGN KEY (exchange_item_id) REFERENCES exchange_items(exchange_item_id)',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_item_skus ADD CONSTRAINT exchange_item_skus_ibfk_2 FOREIGN KEY (image_id) REFERENCES media_files(media_id)',
        { transaction }
      )

      // ==========================================
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_item_attribute_values ADD CONSTRAINT exchange_item_attribute_values_ibfk_1 FOREIGN KEY (exchange_item_id) REFERENCES exchange_items(exchange_item_id)',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_item_attribute_values ADD CONSTRAINT exchange_item_attribute_values_ibfk_2 FOREIGN KEY (attribute_id) REFERENCES attributes(attribute_id)',
        { transaction }
      )

      // ==========================================
      await queryInterface.sequelize.query(
        'ALTER TABLE bid_products ADD CONSTRAINT fk_bid_products_exchange_item FOREIGN KEY (exchange_item_id) REFERENCES exchange_items(exchange_item_id)',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_records ADD CONSTRAINT exchange_records_exchange_item_id_fk FOREIGN KEY (exchange_item_id) REFERENCES exchange_items(exchange_item_id)',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_records ADD CONSTRAINT exchange_records_sku_id_fk FOREIGN KEY (sku_id) REFERENCES exchange_item_skus(sku_id)',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_channel_prices ADD CONSTRAINT exchange_channel_prices_ibfk_1 FOREIGN KEY (sku_id) REFERENCES exchange_item_skus(sku_id)',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE sku_attribute_values ADD CONSTRAINT sku_attribute_values_ibfk_1 FOREIGN KEY (sku_id) REFERENCES exchange_item_skus(sku_id)',
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 反向操作：Exchange → Product

      // 删除所有 FK
      await queryInterface.sequelize.query('ALTER TABLE bid_products DROP FOREIGN KEY fk_bid_products_exchange_item', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_records DROP FOREIGN KEY exchange_records_exchange_item_id_fk', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_records DROP FOREIGN KEY exchange_records_sku_id_fk', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_channel_prices DROP FOREIGN KEY exchange_channel_prices_ibfk_1', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE sku_attribute_values DROP FOREIGN KEY sku_attribute_values_ibfk_1', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_item_attribute_values DROP FOREIGN KEY exchange_item_attribute_values_ibfk_1', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_item_attribute_values DROP FOREIGN KEY exchange_item_attribute_values_ibfk_2', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_item_skus DROP FOREIGN KEY exchange_item_skus_ibfk_1', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_item_skus DROP FOREIGN KEY exchange_item_skus_ibfk_2', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_items DROP FOREIGN KEY exchange_items_ibfk_1', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_items DROP FOREIGN KEY exchange_items_ibfk_2', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_items DROP FOREIGN KEY exchange_items_ibfk_3', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_items DROP FOREIGN KEY exchange_items_ibfk_4', { transaction })

      // 恢复列名
      await queryInterface.sequelize.query('ALTER TABLE exchange_item_attribute_values CHANGE COLUMN exchange_item_id product_id BIGINT NOT NULL', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_item_skus CHANGE COLUMN exchange_item_id product_id BIGINT NOT NULL', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_items CHANGE COLUMN item_name product_name VARCHAR(200) NOT NULL', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_items CHANGE COLUMN exchange_item_id product_id BIGINT NOT NULL AUTO_INCREMENT', { transaction })

      // 恢复 exchange_records.product_id 列
      await queryInterface.addColumn('exchange_records', 'product_id', {
        type: 'BIGINT',
        allowNull: true
      }, { transaction })

      // 恢复表名
      await queryInterface.renameTable('exchange_items', 'products', { transaction })
      await queryInterface.renameTable('exchange_item_skus', 'product_skus', { transaction })
      await queryInterface.renameTable('exchange_item_attribute_values', 'product_attribute_values', { transaction })

      // 重建原 FK
      await queryInterface.sequelize.query('ALTER TABLE products ADD CONSTRAINT products_ibfk_1 FOREIGN KEY (category_id) REFERENCES categories(category_id)', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE products ADD CONSTRAINT products_ibfk_2 FOREIGN KEY (primary_media_id) REFERENCES media_files(media_id)', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE products ADD CONSTRAINT products_ibfk_3 FOREIGN KEY (item_template_id) REFERENCES item_templates(item_template_id)', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE products ADD CONSTRAINT products_ibfk_4 FOREIGN KEY (rarity_code) REFERENCES rarity_defs(rarity_code)', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE product_skus ADD CONSTRAINT product_skus_ibfk_1 FOREIGN KEY (product_id) REFERENCES products(product_id)', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE product_skus ADD CONSTRAINT product_skus_ibfk_2 FOREIGN KEY (image_id) REFERENCES media_files(media_id)', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE product_attribute_values ADD CONSTRAINT product_attribute_values_ibfk_1 FOREIGN KEY (product_id) REFERENCES products(product_id)', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE product_attribute_values ADD CONSTRAINT product_attribute_values_ibfk_2 FOREIGN KEY (attribute_id) REFERENCES attributes(attribute_id)', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE bid_products ADD CONSTRAINT fk_bid_products_product FOREIGN KEY (exchange_item_id) REFERENCES products(product_id)', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_records ADD CONSTRAINT exchange_records_product_id_foreign_idx FOREIGN KEY (product_id) REFERENCES products(product_id)', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_records ADD CONSTRAINT exchange_records_sku_id_foreign_idx FOREIGN KEY (sku_id) REFERENCES product_skus(sku_id)', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE exchange_channel_prices ADD CONSTRAINT exchange_channel_prices_ibfk_1 FOREIGN KEY (sku_id) REFERENCES product_skus(sku_id)', { transaction })
      await queryInterface.sequelize.query('ALTER TABLE sku_attribute_values ADD CONSTRAINT sku_attribute_values_ibfk_1 FOREIGN KEY (sku_id) REFERENCES product_skus(sku_id)', { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
