/**
 * 修改 market_listings 外键：user_inventory → item_instances
 *
 * Phase 3 - P3-3：将 market_listings.offer_item_instance_id 外键指向新的 item_instances 表
 *
 * 修改内容：
 * - 删除旧的外键约束（fk_market_listings_offer_item_instance_id）
 * - 添加新的外键约束指向 item_instances 表
 *
 * 硬约束（来自文档）：
 * - **单一真相**：物品所有权只能来自 item_instances 表
 * - **外键级联**：ON DELETE RESTRICT（禁止删除已上架物品），ON UPDATE CASCADE
 *
 * 创建时间：2025-12-15 22:01:03
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：更新外键约束
   *
   * @param {Sequelize.QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>} 无返回值
   */
  up: async (queryInterface, Sequelize) => {
    console.log('🔄 开始修改 market_listings 外键指向 item_instances')

    try {
      // 1. 检查旧外键约束是否存在
      const [constraints] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME 
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
        WHERE TABLE_SCHEMA = 'restaurant_points_dev'
        AND TABLE_NAME = 'market_listings'
        AND COLUMN_NAME = 'offer_item_instance_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL
      `)

      // 2. 删除旧的外键约束（如果存在）
      if (constraints.length > 0) {
        for (const constraint of constraints) {
          console.log(`🗑️ 删除旧外键约束: ${constraint.CONSTRAINT_NAME}`)
          await queryInterface.removeConstraint('market_listings', constraint.CONSTRAINT_NAME)
        }
      } else {
        console.log('ℹ️ 未找到旧的外键约束，跳过删除步骤')
      }

      // 3. 修改 offer_item_instance_id 字段类型为 BIGINT（与 item_instances.item_instance_id 一致）
      console.log('🔧 修改 offer_item_instance_id 字段类型为 BIGINT')
      await queryInterface.changeColumn('market_listings', 'offer_item_instance_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        comment: '挂牌标的物品实例ID（关联 item_instances.item_instance_id）'
      })

      // 4. 添加新的外键约束指向 item_instances
      console.log('✅ 添加新外键约束指向 item_instances')
      await queryInterface.addConstraint('market_listings', {
        fields: ['offer_item_instance_id'],
        type: 'foreign key',
        name: 'fk_market_listings_offer_item_instance_id',
        references: {
          table: 'item_instances',
          field: 'item_instance_id'
        },
        onDelete: 'RESTRICT', // 禁止删除已上架物品
        onUpdate: 'CASCADE'
      })

      console.log('✅ market_listings 外键已更新指向 item_instances')
    } catch (error) {
      console.error('❌ 外键修改失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：恢复外键指向 user_inventory
   *
   * @param {Sequelize.QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>} 无返回值
   */
  down: async (queryInterface, Sequelize) => {
    console.log('🔄 回滚：恢复外键指向 user_inventory')

    try {
      // 1. 删除指向 item_instances 的外键
      await queryInterface.removeConstraint(
        'market_listings',
        'fk_market_listings_offer_item_instance_id'
      )

      // 2. 恢复指向 user_inventory 的外键
      await queryInterface.addConstraint('market_listings', {
        fields: ['offer_item_instance_id'],
        type: 'foreign key',
        name: 'fk_market_listings_offer_item_instance_id',
        references: {
          table: 'user_inventory',
          field: 'inventory_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      })

      console.log('✅ 外键已恢复指向 user_inventory')
    } catch (error) {
      console.error('❌ 外键回滚失败:', error.message)
      throw error
    }
  }
}
