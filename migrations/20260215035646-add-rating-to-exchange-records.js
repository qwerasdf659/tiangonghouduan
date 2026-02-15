'use strict'

/**
 * 迁移：为 exchange_records 表新增 rating 字段
 *
 * 业务需求（需求6）：
 * - 支持用户对已兑换的商品进行评分（1-5分）
 * - 在兑换商品列表查询时可聚合计算平均评分
 * - rating 字段允许为 NULL（用户未评分时）
 *
 * 字段设计：
 * - rating: TINYINT(1), 范围 1-5, 允许 NULL
 * - rated_at: DATETIME, 评分时间, 允许 NULL
 *
 * @module migrations/add-rating-to-exchange-records
 * @created 2026-02-15
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // 检查 rating 列是否已存在
    const tableDesc = await queryInterface.describeTable('exchange_records')

    if (!tableDesc.rating) {
      await queryInterface.addColumn('exchange_records', 'rating', {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: null,
        comment: '用户评分（1-5分，NULL表示未评分）'
      })
    }

    if (!tableDesc.rated_at) {
      await queryInterface.addColumn('exchange_records', 'rated_at', {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
        comment: '评分时间（用户提交评分的时间）'
      })
    }

    // 添加索引（用于聚合查询平均评分）
    const indexes = await queryInterface.showIndex('exchange_records')
    const hasRatingIndex = indexes.some(idx => idx.name === 'idx_exchange_records_rating')
    if (!hasRatingIndex) {
      await queryInterface.addIndex('exchange_records', ['exchange_item_id', 'rating'], {
        name: 'idx_exchange_records_rating',
        where: { rating: { [Sequelize.Op.not]: null } }
      })
    }
  },

  async down(queryInterface, _Sequelize) {
    const tableDesc = await queryInterface.describeTable('exchange_records')

    // 删除索引
    const indexes = await queryInterface.showIndex('exchange_records')
    const hasRatingIndex = indexes.some(idx => idx.name === 'idx_exchange_records_rating')
    if (hasRatingIndex) {
      await queryInterface.removeIndex('exchange_records', 'idx_exchange_records_rating')
    }

    if (tableDesc.rated_at) {
      await queryInterface.removeColumn('exchange_records', 'rated_at')
    }

    if (tableDesc.rating) {
      await queryInterface.removeColumn('exchange_records', 'rating')
    }
  }
}
