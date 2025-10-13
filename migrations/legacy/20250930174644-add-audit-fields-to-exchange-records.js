'use strict'

/**
 * 餐厅积分抽奖系统 V4.0 - 兑换记录审核功能迁移
 *
 * 功能说明：
 * - 给exchange_records表增加审核相关字段
 * - 支持大额交易人工审核机制
 * - 复用ImageResources的审核模式
 *
 * 创建时间：2025年09月30日
 * 使用模型：Claude Sonnet 4
 */

module.exports = {
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始迁移：给exchange_records表增加审核字段...')

      // 1. 增加审核相关字段
      await queryInterface.addColumn(
        'exchange_records',
        'requires_audit',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否需要审核（大额交易自动标记）'
        },
        { transaction }
      )

      await queryInterface.addColumn(
        'exchange_records',
        'audit_status',
        {
          type: Sequelize.ENUM('not_required', 'pending', 'approved', 'rejected'),
          allowNull: false,
          defaultValue: 'not_required',
          comment: '审核状态'
        },
        { transaction }
      )

      await queryInterface.addColumn(
        'exchange_records',
        'auditor_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '审核员ID',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        { transaction }
      )

      await queryInterface.addColumn(
        'exchange_records',
        'audit_reason',
        {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '审核意见/拒绝原因'
        },
        { transaction }
      )

      await queryInterface.addColumn(
        'exchange_records',
        'audited_at',
        {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '审核时间'
        },
        { transaction }
      )

      console.log('✅ 审核字段添加成功')

      // 2. 创建索引以优化查询性能
      await queryInterface.addIndex(
        'exchange_records',
        ['audit_status', 'created_at'],
        {
          name: 'idx_exchange_records_audit_status_created',
          transaction
        }
      )

      await queryInterface.addIndex(
        'exchange_records',
        ['requires_audit', 'status'],
        {
          name: 'idx_exchange_records_requires_audit_status',
          transaction
        }
      )

      await queryInterface.addIndex(
        'exchange_records',
        ['auditor_id'],
        {
          name: 'idx_exchange_records_auditor_id',
          transaction
        }
      )

      console.log('✅ 审核相关索引创建成功')

      // 3. 更新现有数据：将所有现有记录标记为不需要审核
      await queryInterface.sequelize.query(
        `UPDATE exchange_records 
         SET requires_audit = false, 
             audit_status = 'not_required' 
         WHERE requires_audit IS NULL OR audit_status IS NULL`,
        { transaction }
      )

      console.log('✅ 现有数据更新完成')

      await transaction.commit()
      console.log('✅ 迁移成功完成：exchange_records审核功能已启用')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始回滚：移除exchange_records审核字段...')

      // 删除索引
      await queryInterface.removeIndex(
        'exchange_records',
        'idx_exchange_records_audit_status_created',
        { transaction }
      )

      await queryInterface.removeIndex(
        'exchange_records',
        'idx_exchange_records_requires_audit_status',
        { transaction }
      )

      await queryInterface.removeIndex(
        'exchange_records',
        'idx_exchange_records_auditor_id',
        { transaction }
      )

      // 删除字段
      await queryInterface.removeColumn('exchange_records', 'audited_at', { transaction })
      await queryInterface.removeColumn('exchange_records', 'audit_reason', { transaction })
      await queryInterface.removeColumn('exchange_records', 'auditor_id', { transaction })
      await queryInterface.removeColumn('exchange_records', 'audit_status', { transaction })
      await queryInterface.removeColumn('exchange_records', 'requires_audit', { transaction })

      await transaction.commit()
      console.log('✅ 回滚成功完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
