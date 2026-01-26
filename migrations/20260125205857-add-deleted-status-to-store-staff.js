'use strict'

/**
 * 员工管理删除逻辑优化 - 数据库迁移
 *
 * 变更内容：
 * 1. 扩展 store_staff.status ENUM 添加 'deleted' 值
 * 2. 新增 deleted_at 字段（删除时间）
 * 3. 新增 delete_reason 字段（删除原因）
 * 4. 添加 deleted 状态查询索引
 *
 * 业务场景：
 * - 区分"离职"和"删除"操作
 * - 离职（inactive）：员工正常离职，保留记录可重新入职
 * - 删除（deleted）：清理离职记录/录入错误，软删除不可恢复
 *
 * @since 2026-01-26
 * @see docs/员工管理删除逻辑优化方案.md
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🚀 开始执行迁移：扩展 store_staff 表删除功能')

      // 1. 扩展 status ENUM 添加 'deleted' 值
      console.log('📝 Step 1: 扩展 status ENUM...')
      await queryInterface.sequelize.query(
        `ALTER TABLE store_staff 
         MODIFY COLUMN status ENUM('active', 'inactive', 'pending', 'deleted') 
         NOT NULL DEFAULT 'pending' 
         COMMENT '状态：active=在职，inactive=离职，pending=待审核，deleted=已删除'`,
        { transaction }
      )

      // 2. 新增 deleted_at 字段
      console.log('📝 Step 2: 新增 deleted_at 字段...')
      await queryInterface.addColumn(
        'store_staff',
        'deleted_at',
        {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '删除时间（status=deleted 时设置）'
        },
        { transaction }
      )

      // 3. 新增 delete_reason 字段
      console.log('📝 Step 3: 新增 delete_reason 字段...')
      await queryInterface.addColumn(
        'store_staff',
        'delete_reason',
        {
          type: Sequelize.STRING(500),
          allowNull: true,
          comment: '删除原因'
        },
        { transaction }
      )

      // 4. 检查索引是否已存在，不存在则添加
      console.log('📝 Step 4: 添加 deleted 状态索引...')
      const [existingIndexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM store_staff WHERE Key_name = 'idx_store_staff_deleted'`,
        { transaction }
      )

      if (existingIndexes.length === 0) {
        await queryInterface.addIndex('store_staff', ['status', 'deleted_at'], {
          name: 'idx_store_staff_deleted',
          transaction
        })
        console.log('✅ 索引 idx_store_staff_deleted 已创建')
      } else {
        console.log('ℹ️ 索引 idx_store_staff_deleted 已存在，跳过创建')
      }

      await transaction.commit()
      console.log('✅ 迁移完成：store_staff 表删除功能已启用')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚迁移...')

      // 1. 删除索引
      const [existingIndexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM store_staff WHERE Key_name = 'idx_store_staff_deleted'`,
        { transaction }
      )

      if (existingIndexes.length > 0) {
        await queryInterface.removeIndex('store_staff', 'idx_store_staff_deleted', { transaction })
        console.log('✅ 索引 idx_store_staff_deleted 已删除')
      }

      // 2. 删除 delete_reason 字段
      await queryInterface.removeColumn('store_staff', 'delete_reason', { transaction })
      console.log('✅ 字段 delete_reason 已删除')

      // 3. 删除 deleted_at 字段
      await queryInterface.removeColumn('store_staff', 'deleted_at', { transaction })
      console.log('✅ 字段 deleted_at 已删除')

      // 4. 将 deleted 状态的记录改为 inactive（数据保护）
      await queryInterface.sequelize.query(
        `UPDATE store_staff SET status = 'inactive' WHERE status = 'deleted'`,
        { transaction }
      )
      console.log('✅ deleted 状态记录已转换为 inactive')

      // 5. 恢复 status ENUM（移除 'deleted'）
      await queryInterface.sequelize.query(
        `ALTER TABLE store_staff 
         MODIFY COLUMN status ENUM('active', 'inactive', 'pending') 
         NOT NULL DEFAULT 'pending' 
         COMMENT '状态：active=在职，inactive=离职，pending=待审核'`,
        { transaction }
      )
      console.log('✅ status ENUM 已恢复')

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
