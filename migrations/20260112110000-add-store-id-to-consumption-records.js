'use strict'

/**
 * 商家员工域权限体系升级 - Phase 2.1
 * 为 consumption_records 表添加 store_id 字段
 *
 * 业务背景：
 * - 实现多门店管理，每笔消费记录需要关联到具体门店
 * - store_id 用于门店级权限验证和数据隔离
 *
 * 技术决策：
 * - store_id 初始为 NULL（兼容历史数据）
 * - 新增消费记录时会填充 store_id
 * - 后续可通过数据迁移脚本回填历史数据
 *
 * 表结构变更：
 * - 新增字段：store_id INT NULL（外键关联 stores 表）
 * - 新增索引：idx_consumption_store_status（store_id, status, created_at）
 *
 * 创建时间：2026年1月12日
 * @see docs/商家员工域权限体系升级方案.md Phase 2.1
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📝 [Migration] 开始添加 store_id 字段到 consumption_records 表...')

      // 1. 添加 store_id 字段（初始允许 NULL，兼容历史数据）
      await queryInterface.addColumn(
        'consumption_records',
        'store_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true, // 初始允许 NULL（兼容历史数据）
          comment: '门店ID（外键关联 stores 表，用于多门店管理和权限验证）',
          references: {
            model: 'stores',
            key: 'store_id'
          },
          onDelete: 'RESTRICT', // 禁止删除有消费记录的门店
          onUpdate: 'CASCADE'
        },
        { transaction }
      )
      console.log('✅ store_id 字段添加成功')

      // 2. 添加复合索引（门店+状态+时间 - 用于门店级查询）
      await queryInterface.addIndex('consumption_records', ['store_id', 'status', 'created_at'], {
        name: 'idx_consumption_store_status',
        comment: '门店级消费记录查询（store_id + 状态 + 时间）',
        transaction
      })
      console.log('✅ idx_consumption_store_status 索引添加成功')

      // 3. 添加门店+商家复合索引（用于商家门店维度统计）
      await queryInterface.addIndex(
        'consumption_records',
        ['store_id', 'merchant_id', 'created_at'],
        {
          name: 'idx_consumption_store_merchant',
          comment: '门店+商家维度消费记录查询',
          transaction
        }
      )
      console.log('✅ idx_consumption_store_merchant 索引添加成功')

      await transaction.commit()
      console.log('🎉 [Migration] consumption_records 表 store_id 字段添加完成')

      // 4. 验证迁移结果
      const [columns] = await queryInterface.sequelize.query(
        `SHOW COLUMNS FROM consumption_records WHERE Field = 'store_id'`
      )
      if (columns.length > 0) {
        console.log('✅ [Migration] 验证通过：store_id 字段已存在')
        console.log('   字段类型:', columns[0].Type)
        console.log('   允许NULL:', columns[0].Null)
      }

      const [indexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM consumption_records WHERE Key_name LIKE 'idx_consumption_store%'`
      )
      console.log(`✅ [Migration] 验证通过：新增 ${indexes.length} 个索引`)
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [Migration] 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📝 [Migration] 开始回滚 store_id 字段...')

      // 1. 删除索引
      await queryInterface.removeIndex('consumption_records', 'idx_consumption_store_merchant', {
        transaction
      })
      console.log('✅ idx_consumption_store_merchant 索引删除成功')

      await queryInterface.removeIndex('consumption_records', 'idx_consumption_store_status', {
        transaction
      })
      console.log('✅ idx_consumption_store_status 索引删除成功')

      // 2. 删除字段
      await queryInterface.removeColumn('consumption_records', 'store_id', { transaction })
      console.log('✅ store_id 字段删除成功')

      await transaction.commit()
      console.log('🎉 [Migration] 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [Migration] 回滚失败:', error.message)
      throw error
    }
  }
}
