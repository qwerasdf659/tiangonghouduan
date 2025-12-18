/**
 * 餐厅积分抽奖系统 V4.2 - 数据库迁移
 *
 * 迁移内容：为 market_listings 表添加幂等键唯一约束
 *
 * 业务背景：
 * - 防止网络重试/超时导致的重复挂牌
 * - 实现幂等性保证（同一 business_id 重复请求返回同结果）
 * - 按卖家隔离幂等命名空间（避免跨用户碰撞）
 *
 * 约束设计（最终拍板）：
 * - 唯一索引：UNIQUE(seller_user_id, business_id)
 * - seller_user_id：卖家隔离（不同卖家可用相同 business_id）
 * - business_id：允许 NULL（兼容历史数据），新写入强制必填
 * - MySQL特性：UNIQUE 索引对 NULL 值不生效（多条 NULL 记录可共存）
 *
 * 行业对比：
 * - 美团支付：UNIQUE(user_id, idempotency_key)
 * - 阿里云API：UNIQUE(account_id, client_token)
 * - Stripe支付：UNIQUE(account, idempotency_key)
 *
 * 创建时间：2025年12月18日
 * 技术债务修复：P0级 - 幂等性保证
 *
 * @see docs/后端项目技术债务.md - 5.1 幂等键唯一约束
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加幂等键唯一约束
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize

    console.log('开始迁移：添加 market_listings 幂等键唯一约束...')

    // 1. 检查索引是否已存在（避免重复创建）
    const [existingIndexes] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM market_listings 
      WHERE Key_name = 'uk_market_listings_seller_business_id'
    `)

    if (existingIndexes.length > 0) {
      console.log('⚠️ 索引 uk_market_listings_seller_business_id 已存在，跳过创建')
      return
    }

    // 2. 检查是否存在旧的错误索引（技术债务遗留）
    const [oldIndexes] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM market_listings 
      WHERE Key_name = 'uniq_listing_business_id'
    `)

    if (oldIndexes.length > 0) {
      console.log('删除旧的错误索引: uniq_listing_business_id')
      await queryInterface.sequelize.query(`
        DROP INDEX uniq_listing_business_id ON market_listings
      `)
    }

    // 3. 创建正确的唯一索引（seller_user_id + business_id）
    console.log('创建唯一索引: uk_market_listings_seller_business_id')
    await queryInterface.addIndex('market_listings', {
      fields: ['seller_user_id', 'business_id'],
      unique: true,
      name: 'uk_market_listings_seller_business_id',
      type: 'UNIQUE'
    })

    console.log('✅ 幂等键唯一约束已添加')
    console.log('约束详情：')
    console.log('- 唯一维度：UNIQUE(seller_user_id, business_id)')
    console.log('- 隔离策略：按卖家隔离幂等命名空间')
    console.log('- 历史兼容：business_id 允许 NULL（MySQL UNIQUE 特性）')
    console.log('- 新写入要求：business_id 必填（应用层校验）')
  },

  /**
   * 回滚迁移：删除幂等键唯一约束
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    console.log('回滚迁移：删除 market_listings 幂等键唯一约束...')

    // 检查索引是否存在
    const [existingIndexes] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM market_listings 
      WHERE Key_name = 'uk_market_listings_seller_business_id'
    `)

    if (existingIndexes.length === 0) {
      console.log('⚠️ 索引 uk_market_listings_seller_business_id 不存在，无需删除')
      return
    }

    // 删除唯一索引
    await queryInterface.removeIndex('market_listings', 'uk_market_listings_seller_business_id')

    console.log('✅ 幂等键唯一约束已删除')
  }
}
