'use strict'

/**
 * 迁移：为 exchange_items 添加定时上下架字段和商品参数表字段
 *
 * 新增字段：
 * - publish_at: 定时上架时间（到达时间后自动将 status 设为 active）
 * - unpublish_at: 定时下架时间（到达时间后自动将 status 设为 inactive）
 * - attributes: 商品参数表（结构化 JSON，如 {"材质":"纯棉","产地":"中国"}）
 * - stock_alert_threshold: 库存预警阈值（低于此值触发告警，0=不告警）
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      const tableDesc = await queryInterface.describeTable('exchange_items')

      if (!tableDesc.publish_at) {
        await queryInterface.addColumn('exchange_items', 'publish_at', {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
          comment: '定时上架时间（到达后自动上架）'
        }, { transaction })
      }

      if (!tableDesc.unpublish_at) {
        await queryInterface.addColumn('exchange_items', 'unpublish_at', {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
          comment: '定时下架时间（到达后自动下架）'
        }, { transaction })
      }

      if (!tableDesc.attributes) {
        await queryInterface.addColumn('exchange_items', 'attributes', {
          type: Sequelize.JSON,
          allowNull: true,
          defaultValue: null,
          comment: '商品参数表（结构化JSON，如{"材质":"纯棉","产地":"中国"}）'
        }, { transaction })
      }

      if (!tableDesc.stock_alert_threshold) {
        await queryInterface.addColumn('exchange_items', 'stock_alert_threshold', {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '库存预警阈值（低于此值触发告警，0=不告警）'
        }, { transaction })
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.removeColumn('exchange_items', 'publish_at', { transaction })
      await queryInterface.removeColumn('exchange_items', 'unpublish_at', { transaction })
      await queryInterface.removeColumn('exchange_items', 'attributes', { transaction })
      await queryInterface.removeColumn('exchange_items', 'stock_alert_threshold', { transaction })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
