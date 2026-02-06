/**
 * 餐厅积分抽奖系统 - 数据库迁移
 *
 * 迁移内容：修复 market_listings 表的索引名称遗留问题
 *
 * 问题描述：
 * - 字段 business_id 已重命名为 idempotency_key
 * - 但联合唯一索引名仍为 uk_market_listings_seller_business_id
 * - 需要重命名为 uk_market_listings_seller_idempotency
 *
 * 创建时间：2026年01月02日
 * 方案类型：索引重命名（无破坏性变更）
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：重命名索引
   */
  async up(queryInterface, Sequelize) {
    console.log('开始迁移：修复 market_listings 索引名称遗留问题...')

    // 检查旧索引是否存在
    const [oldIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM market_listings
      WHERE Key_name = 'uk_market_listings_seller_business_id'
    `)

    if (oldIndex.length > 0) {
      // 删除旧索引
      await queryInterface.removeIndex('market_listings', 'uk_market_listings_seller_business_id')
      console.log('✅ 已删除旧索引: uk_market_listings_seller_business_id')

      // 创建新索引（名称符合字段语义）
      await queryInterface.addIndex('market_listings', {
        fields: ['seller_user_id', 'idempotency_key'],
        unique: true,
        name: 'uk_market_listings_seller_idempotency'
      })
      console.log('✅ 已创建新索引: uk_market_listings_seller_idempotency')
    } else {
      console.log('⚠️ 旧索引 uk_market_listings_seller_business_id 不存在，跳过')
    }

    console.log('✅ 索引名称修复迁移完成')
  },

  /**
   * 回滚迁移：恢复原索引名
   */
  async down(queryInterface, Sequelize) {
    console.log('回滚迁移：恢复 market_listings 索引名称...')

    // 检查新索引是否存在
    const [newIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM market_listings
      WHERE Key_name = 'uk_market_listings_seller_idempotency'
    `)

    if (newIndex.length > 0) {
      // 删除新索引
      await queryInterface.removeIndex('market_listings', 'uk_market_listings_seller_idempotency')

      // 恢复旧索引
      await queryInterface.addIndex('market_listings', {
        fields: ['seller_user_id', 'idempotency_key'],
        unique: true,
        name: 'uk_market_listings_seller_business_id'
      })
      console.log('✅ 已恢复旧索引: uk_market_listings_seller_business_id')
    }

    console.log('✅ 回滚完成')
  }
}
