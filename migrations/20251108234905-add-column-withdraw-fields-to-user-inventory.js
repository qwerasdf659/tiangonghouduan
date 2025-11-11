/**
 * 添加撤回功能相关字段到user_inventory表
 *
 * 创建时间: 2025-11-08 23:49:05 (北京时间)
 * 创建原因: 修复数据库列缺失问题 - withdraw_count, last_withdraw_at, last_withdraw_reason
 * 作者: System
 *
 * 业务背景:
 * - 市场功能需要记录用户撤回上架商品的统计数据
 * - 防止用户滥用撤回功能刷新商品排序
 * - 提供撤回冷却时间检查（建议4小时）
 *
 * 相关API: POST /api/v4/inventory/market/products/:id/withdraw
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 添加撤回次数统计字段
      await queryInterface.addColumn(
        'user_inventory',
        'withdraw_count',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '撤回次数统计：每次撤回操作后+1；用途：防滥用监控（超过5次可能异常）、用户行为分析'
        },
        { transaction }
      )

      console.log('✅ 添加字段: withdraw_count (INTEGER, DEFAULT 0)')

      // 2. 添加最后撤回时间字段
      await queryInterface.addColumn(
        'user_inventory',
        'last_withdraw_at',
        {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '最后撤回时间：记录最后撤回的北京时间；用途：防滥用冷却检查（建议4小时冷却）'
        },
        { transaction }
      )

      console.log('✅ 添加字段: last_withdraw_at (TIMESTAMP, NULLABLE)')

      // 3. 添加最后撤回原因字段
      await queryInterface.addColumn(
        'user_inventory',
        'last_withdraw_reason',
        {
          type: Sequelize.STRING(200),
          allowNull: true,
          comment: '最后撤回原因：用户可选填写撤回原因；用途：撤回原因分析、用户行为研究'
        },
        { transaction }
      )

      console.log('✅ 添加字段: last_withdraw_reason (VARCHAR(200), NULLABLE)')

      await transaction.commit()
      console.log('✅ 迁移成功: 添加撤回功能相关字段')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚：删除添加的字段（按相反顺序）
      await queryInterface.removeColumn('user_inventory', 'last_withdraw_reason', { transaction })
      console.log('✅ 删除字段: last_withdraw_reason')

      await queryInterface.removeColumn('user_inventory', 'last_withdraw_at', { transaction })
      console.log('✅ 删除字段: last_withdraw_at')

      await queryInterface.removeColumn('user_inventory', 'withdraw_count', { transaction })
      console.log('✅ 删除字段: withdraw_count')

      await transaction.commit()
      console.log('✅ 回滚成功: 删除撤回功能相关字段')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
