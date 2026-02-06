'use strict'

/**
 * 数据库迁移 - 表重命名
 *
 * 功能：将 exchange_market_records 表重命名为 exchange_records
 * 原因：API命名规范重构，简化命名，统一业务语义
 *
 * 变更内容：
 * - 表名：exchange_market_records → exchange_records
 * - 外键约束：更新指向新表名
 *
 * 相关代码变更：
 * - 模型：ExchangeMarketRecord → ExchangeRecord
 * - 服务：ExchangeMarketService → ExchangeService
 * - 路由：/api/v4/market → /api/v4/shop/exchange
 *
 * 创建时间：2025-12-22
 * 迁移类型：rename-table
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    // 1. 重命名表：exchange_market_records → exchange_records
    await queryInterface.renameTable('exchange_market_records', 'exchange_records')

    console.log('✅ 表重命名成功：exchange_market_records → exchange_records')
  },

  async down(queryInterface, _Sequelize) {
    // 回滚：将表名恢复为 exchange_market_records
    await queryInterface.renameTable('exchange_records', 'exchange_market_records')

    console.log('✅ 表重命名回滚成功：exchange_records → exchange_market_records')
  }
}
