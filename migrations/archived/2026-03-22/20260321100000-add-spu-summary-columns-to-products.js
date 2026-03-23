'use strict'

/**
 * 给 products 表加回 SPU 汇总列：stock / sold_count / min_cost_amount / max_cost_amount
 *
 * 背景：ExchangeItem → Product 迁移后，价格/库存被拆分到 product_skus + exchange_channel_prices，
 * 但 AdminService / QueryService 大量代码仍读写 products 上的汇总字段。
 * 方案 A 决策：加回冗余汇总列，由 _updateSpuSummary() 在 SKU 变更时自动刷新。
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.addColumn('products', 'stock', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'SPU 汇总库存（= SUM(product_skus.stock)）'
      }, { transaction })

      await queryInterface.addColumn('products', 'sold_count', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'SPU 汇总已售（= SUM(product_skus.sold_count)）'
      }, { transaction })

      await queryInterface.addColumn('products', 'min_cost_amount', {
        type: Sequelize.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: 'SPU 最低兑换价（= MIN(exchange_channel_prices.cost_amount)）'
      }, { transaction })

      await queryInterface.addColumn('products', 'max_cost_amount', {
        type: Sequelize.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: 'SPU 最高兑换价（= MAX(exchange_channel_prices.cost_amount)）'
      }, { transaction })

      // 回填现有 products 的汇总值
      await queryInterface.sequelize.query(`
        UPDATE products p
        LEFT JOIN (
          SELECT
            ps.product_id,
            COALESCE(SUM(ps.stock), 0) AS total_stock,
            COALESCE(SUM(ps.sold_count), 0) AS total_sold
          FROM product_skus ps
          WHERE ps.status = 'active'
          GROUP BY ps.product_id
        ) sku_agg ON p.product_id = sku_agg.product_id
        LEFT JOIN (
          SELECT
            ps2.product_id,
            MIN(ecp.cost_amount) AS min_cost,
            MAX(ecp.cost_amount) AS max_cost
          FROM product_skus ps2
          JOIN exchange_channel_prices ecp ON ecp.sku_id = ps2.sku_id AND ecp.is_enabled = 1
          WHERE ps2.status = 'active'
          GROUP BY ps2.product_id
        ) price_agg ON p.product_id = price_agg.product_id
        SET
          p.stock = COALESCE(sku_agg.total_stock, 0),
          p.sold_count = COALESCE(sku_agg.total_sold, 0),
          p.min_cost_amount = price_agg.min_cost,
          p.max_cost_amount = price_agg.max_cost
      `, { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.removeColumn('products', 'stock', { transaction })
      await queryInterface.removeColumn('products', 'sold_count', { transaction })
      await queryInterface.removeColumn('products', 'min_cost_amount', { transaction })
      await queryInterface.removeColumn('products', 'max_cost_amount', { transaction })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
