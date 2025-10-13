/**
 * 修复user_roles表缺失字段
 *
 * 创建时间: 2025年10月13日 20:00:00 (北京时间)
 * 创建原因: 数据库检查发现user_roles表缺失3个字段
 *
 * 问题描述:
 * - UserRole模型定义了assigned_at, assigned_by, is_active字段
 * - 但数据库表user_roles中缺失这些字段
 * - 这是由于迁移使用sequelize.sync()创建表时字段未同步
 *
 * 修复内容:
 * 1. 添加assigned_at字段 - 记录角色分配时间
 * 2. 添加assigned_by字段 - 记录角色分配者ID
 * 3. 添加is_active字段 - 记录角色是否激活
 * 4. 创建相关索引和外键约束
 *
 * 影响范围:
 * - 表: user_roles
 * - 模型: UserRole
 * - 服务: 用户角色管理相关服务
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔧 开始修复user_roles表缺失字段...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 添加assigned_at字段 - 角色分配时间
      console.log('📝 添加字段: assigned_at')
      await queryInterface.addColumn(
        'user_roles',
        'assigned_at',
        {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '角色分配时间',
          after: 'role_id'
        },
        { transaction }
      )

      // 2. 添加assigned_by字段 - 角色分配者ID
      console.log('📝 添加字段: assigned_by')
      await queryInterface.addColumn(
        'user_roles',
        'assigned_by',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '角色分配者ID（关联users表）',
          after: 'assigned_at'
        },
        { transaction }
      )

      // 3. 添加is_active字段 - 角色是否激活
      console.log('📝 添加字段: is_active')
      await queryInterface.addColumn(
        'user_roles',
        'is_active',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '角色是否激活',
          after: 'assigned_by'
        },
        { transaction }
      )

      // 4. 为已存在的记录设置默认值
      console.log('🔄 更新现有记录...')
      await queryInterface.sequelize.query(
        `UPDATE user_roles 
         SET assigned_at = created_at, 
             is_active = 1 
         WHERE assigned_at IS NULL`,
        { transaction }
      )

      // 5. 创建is_active索引（提升角色状态查询性能）
      console.log('📊 创建索引: idx_user_roles_is_active')
      await queryInterface.addIndex('user_roles', ['is_active'], {
        name: 'idx_user_roles_is_active',
        transaction
      })

      // 6. 添加外键约束 - assigned_by关联到users表
      console.log('🔗 添加外键约束: fk_user_roles_assigned_by')
      await queryInterface.addConstraint('user_roles', {
        fields: ['assigned_by'],
        type: 'foreign key',
        name: 'fk_user_roles_assigned_by',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })

      await transaction.commit()

      console.log('')
      console.log('='.repeat(60))
      console.log('✅ user_roles表字段修复完成')
      console.log('='.repeat(60))
      console.log('📊 修复统计:')
      console.log('   - 新增字段: 3个 (assigned_at, assigned_by, is_active)')
      console.log('   - 新增索引: 1个 (idx_user_roles_is_active)')
      console.log('   - 新增外键: 1个 (fk_user_roles_assigned_by)')
      console.log('   - 更新记录: 设置现有记录的默认值')
      console.log('='.repeat(60))
    } catch (error) {
      await transaction.rollback()
      console.error('')
      console.error('='.repeat(60))
      console.error('❌ 迁移执行失败')
      console.error('='.repeat(60))
      console.error('错误信息:', error.message)
      console.error('错误堆栈:', error.stack)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 开始回滚user_roles表字段修复...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 删除外键约束
      console.log('🗑️  删除外键约束: fk_user_roles_assigned_by')
      await queryInterface.removeConstraint('user_roles', 'fk_user_roles_assigned_by', {
        transaction
      })

      // 2. 删除索引
      console.log('🗑️  删除索引: idx_user_roles_is_active')
      await queryInterface.removeIndex('user_roles', 'idx_user_roles_is_active', { transaction })

      // 3. 删除字段
      console.log('🗑️  删除字段: is_active')
      await queryInterface.removeColumn('user_roles', 'is_active', { transaction })

      console.log('🗑️  删除字段: assigned_by')
      await queryInterface.removeColumn('user_roles', 'assigned_by', { transaction })

      console.log('🗑️  删除字段: assigned_at')
      await queryInterface.removeColumn('user_roles', 'assigned_at', { transaction })

      await transaction.commit()

      console.log('')
      console.log('='.repeat(60))
      console.log('✅ 回滚完成')
      console.log('='.repeat(60))
    } catch (error) {
      await transaction.rollback()
      console.error('')
      console.error('='.repeat(60))
      console.error('❌ 回滚失败')
      console.error('='.repeat(60))
      console.error('错误信息:', error.message)
      throw error
    }
  }
}
