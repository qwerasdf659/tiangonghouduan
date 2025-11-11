/**
 * 数据库迁移：为UserInventory表添加转让追踪字段
 *
 * 业务场景（Business Scenario - 业务场景）：
 * 支持物品转让历史追溯，记录物品"最后一次从哪里转来"和"最后转让时间"
 *
 * 变更内容（Changes - 变更内容）：
 * 1. 添加 last_transfer_at 字段：记录物品最后一次被转让的时间（北京时间）
 * 2. 添加 last_transfer_from 字段：记录物品最后一次从哪个用户转让而来
 *
 * 业务价值（Business Value - 业务价值）：
 * - 快速查询：无需JOIN TradeRecord表即可获取最后转让信息（性能提升）
 * - 数据完整性：UserInventory自包含转让信息，支持快速追溯
 * - 双重追溯：与TradeRecord配合，提供完整的转让链条追溯能力
 *
 * 相关文档（Related Documentation - 相关文档）：
 * 库存转让历史实施方案.md - 方案A：添加字段到UserInventory模型（推荐方案）
 *
 * 创建时间：2025年11月09日 23:42:20
 * 创建人：系统管理员
 * 迁移版本：20251109234220
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加转让追踪字段
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize类型定义
   */
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始添加转让追踪字段到user_inventory表...')

      // 1. 添加 last_transfer_at 字段（最后转让时间）
      await queryInterface.addColumn(
        'user_inventory', // 表名
        'last_transfer_at', // 字段名
        {
          type: Sequelize.DATE,
          allowNull: true,
          comment:
            '最后转让时间（Last Transfer Time - 记录物品最后一次被转让的北京时间）：' +
            '业务规则：每次转让时更新为当前时间；' +
            '初始值为NULL表示未转让或首次获得；' +
            '用途：追溯物品流转历史、转让频率分析、数据审计'
        },
        { transaction }
      )
      console.log('✅ 成功添加 last_transfer_at 字段')

      // 2. 添加 last_transfer_from 字段（最后转让来源用户）
      await queryInterface.addColumn(
        'user_inventory', // 表名
        'last_transfer_from', // 字段名
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment:
            '最后转让来源用户ID（Last Transfer From User ID - 记录物品最后一次从哪个用户转让而来）：' +
            '业务规则：每次转让时更新为转让方用户ID；' +
            '初始值为NULL表示未转让或首次获得；' +
            '外键关联：users.user_id（转让来源用户）；' +
            '用途：追溯物品来源、转让链条分析、用户关系网络分析',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE', // 用户ID更新时同步更新
          onDelete: 'SET NULL' // 用户删除时设置为NULL（保留转让记录）
        },
        { transaction }
      )
      console.log('✅ 成功添加 last_transfer_from 字段')

      // 3. 创建索引以提升查询性能
      await queryInterface.addIndex(
        'user_inventory',
        ['last_transfer_at'],
        {
          name: 'idx_user_inventory_last_transfer_at',
          transaction
        }
      )
      console.log('✅ 成功创建 last_transfer_at 索引')

      await queryInterface.addIndex(
        'user_inventory',
        ['last_transfer_from'],
        {
          name: 'idx_user_inventory_last_transfer_from',
          transaction
        }
      )
      console.log('✅ 成功创建 last_transfer_from 索引')

      await transaction.commit()
      console.log('✅ 迁移成功完成：转让追踪字段已添加到user_inventory表')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除转让追踪字段
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize类型定义
   */
  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚：删除转让追踪字段...')

      // 1. 删除索引
      await queryInterface.removeIndex('user_inventory', 'idx_user_inventory_last_transfer_from', {
        transaction
      })
      console.log('✅ 删除 last_transfer_from 索引')

      await queryInterface.removeIndex('user_inventory', 'idx_user_inventory_last_transfer_at', {
        transaction
      })
      console.log('✅ 删除 last_transfer_at 索引')

      // 2. 删除字段
      await queryInterface.removeColumn('user_inventory', 'last_transfer_from', { transaction })
      console.log('✅ 删除 last_transfer_from 字段')

      await queryInterface.removeColumn('user_inventory', 'last_transfer_at', { transaction })
      console.log('✅ 删除 last_transfer_at 字段')

      await transaction.commit()
      console.log('✅ 回滚成功完成：转让追踪字段已从user_inventory表删除')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
