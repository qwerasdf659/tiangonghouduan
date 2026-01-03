/**
 * 餐厅积分抽奖系统 V4.0 - 数据库迁移
 *
 * 迁移名称：为points_transactions表添加reference关联字段
 * 迁移类型：add-column（添加列）
 * 版本号：v4.1.1
 * 创建时间：2025-10-30
 *
 * 变更说明：
 * 1. 添加reference_type字段（关联业务类型）
 * 2. 添加reference_id字段（关联业务ID）
 * 3. 为这两个字段创建联合索引，优化查询性能
 *
 * 业务场景：
 * - 消费奖励：reference_type='consumption_record', reference_id指向consumption_records.record_id
 * - 支持未来扩展其他业务类型的关联
 *
 * 依赖关系：
 * - 依赖20251030000001-extend-points-transactions-business-type.js
 */

'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始为points_transactions表添加reference关联字段...')

      // 1. 添加reference_type字段
      await queryInterface.addColumn(
        'points_transactions',
        'reference_type',
        {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '关联业务类型（如：consumption_record、lottery_draw等）'
        },
        { transaction }
      )
      console.log('✅ 添加reference_type字段成功')

      // 2. 添加reference_id字段
      await queryInterface.addColumn(
        'points_transactions',
        'reference_id',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '关联业务ID（如：consumption_records.record_id）'
        },
        { transaction }
      )
      console.log('✅ 添加reference_id字段成功')

      // 3. 创建联合索引，优化查询性能
      await queryInterface.addIndex('points_transactions', ['reference_type', 'reference_id'], {
        name: 'idx_reference_type_id',
        transaction
      })
      console.log('✅ 创建idx_reference_type_id索引成功')

      await transaction.commit()
      console.log('✅ points_transactions表reference字段添加完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始回滚points_transactions表的reference字段...')

      // 1. 删除索引
      await queryInterface.removeIndex('points_transactions', 'idx_reference_type_id', {
        transaction
      })
      console.log('✅ 删除idx_reference_type_id索引成功')

      // 2. 删除reference_id字段
      await queryInterface.removeColumn('points_transactions', 'reference_id', { transaction })
      console.log('✅ 删除reference_id字段成功')

      // 3. 删除reference_type字段
      await queryInterface.removeColumn('points_transactions', 'reference_type', { transaction })
      console.log('✅ 删除reference_type字段成功')

      await transaction.commit()
      console.log('✅ points_transactions表reference字段回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
