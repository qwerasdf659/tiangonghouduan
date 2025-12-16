/**
 * 迁移文件：为 market_listings 添加 business_id 字段和唯一索引（幂等保证）
 *
 * 业务背景：
 * - 可叠加资产（如材料）挂牌市场时，需要严格的幂等性保证
 * - 客户端可能重试挂牌请求，需要通过 business_id 避免重复挂牌
 * - 配合 AssetService.freeze() 的 business_id，形成完整的幂等链路
 *
 * 添加内容：
 * 1. 添加 business_id 字段（VARCHAR(128)，允许 NULL 兼容历史数据和物品实例挂牌）
 * 2. 创建唯一索引 uniq_listing_business_id（保证同一 business_id 只能挂牌一次）
 * 3. 配合 AssetService.freeze() 的 business_id，实现完整幂等链路
 *
 * 幂等规则：
 * - 物品实例（item_instance）挂牌：不使用 business_id（直接转移所有权，天然幂等）
 * - 可叠加资产（fungible_asset）挂牌：必须提供 business_id（冻结资产 + 挂牌记录一次性完成）
 * - 业务冲突：同一 business_id 重复请求返回已挂牌的 listing_id（而非 409 冲突）
 *
 * 命名规范（snake_case）：
 * - 字段：business_id
 * - 索引：uniq_listing_business_id
 *
 * 创建时间：2025-12-15 23:01:00
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加 business_id 字段和唯一索引
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>} 无返回值，执行数据库迁移
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始为 market_listings 添加 business_id 幂等字段...')

      // 1. 添加 business_id 字段
      await queryInterface.addColumn(
        'market_listings',
        'business_id',
        {
          type: Sequelize.STRING(128),
          allowNull: true, // 允许 NULL（兼容历史数据和物品实例挂牌）
          comment:
            '业务ID（Business ID - 幂等键）：可叠加资产挂牌时必填，用于幂等保证；物品实例挂牌可为空（天然幂等）'
        },
        { transaction }
      )
      console.log('✅ 添加 business_id 字段成功')

      // 2. 创建唯一索引（保证幂等性）
      await queryInterface.addIndex('market_listings', ['business_id'], {
        unique: true,
        name: 'uniq_listing_business_id',
        where: {
          business_id: { [Sequelize.Op.ne]: null } // 部分唯一索引：仅对非 NULL 值生效
        },
        transaction,
        comment: '唯一索引：business_id（保证同一业务ID只能挂牌一次，NULL 值不受约束）'
      })
      console.log('✅ 创建 uniq_listing_business_id 唯一索引成功')

      await transaction.commit()
      console.log('✅ market_listings 幂等字段添加完成')
      console.log('📋 新增字段: business_id (VARCHAR(128), NULL)')
      console.log('📋 新增索引: uniq_listing_business_id (UNIQUE, 部分索引)')
      console.log('💡 可叠加资产挂牌现在支持严格幂等性')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除 business_id 字段和唯一索引
   *
   * 注意：
   * - 回滚会删除 business_id 字段（丢失幂等保证）
   * - 回滚后可叠加资产挂牌失去幂等性保护
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} _Sequelize - Sequelize对象（未使用）
   * @returns {Promise<void>} 无返回值，执行数据库回滚
   */
  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚 market_listings.business_id 幂等字段...')

      // 1. 删除唯一索引
      await queryInterface.removeIndex('market_listings', 'uniq_listing_business_id', {
        transaction
      })
      console.log('✅ 删除 uniq_listing_business_id 唯一索引成功')

      // 2. 删除 business_id 字段
      await queryInterface.removeColumn('market_listings', 'business_id', {
        transaction
      })
      console.log('✅ 删除 business_id 字段成功')

      await transaction.commit()
      console.log('✅ market_listings.business_id 幂等字段回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
