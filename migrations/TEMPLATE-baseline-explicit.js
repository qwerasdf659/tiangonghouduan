/**
 * 基准迁移模板 - 显式版本（不使用sync）
 *
 * 🎯 核心原则：
 * 1. 显式定义每个表的完整结构
 * 2. 明确定义所有索引和外键
 * 3. 插入完整的初始数据
 * 4. 验证数据完整性
 *
 * ⚠️ 避免使用：
 * - sequelize.sync() - 对复杂关联表处理不完整
 * - 依赖ORM自动创建 - 可能跳过业务字段
 *
 * 创建时间：2025年10月13日
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 开始执行显式基准迁移...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========================================
      // 第1部分：创建基础表
      // ========================================
      console.log('\n📦 第1部分：创建基础表...')

      // 1. roles表 - 角色管理
      console.log('  📋 创建roles表...')
      await queryInterface.createTable('roles', {
        role_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '角色ID'
        },
        role_uuid: {
          type: Sequelize.STRING(36),
          allowNull: false,
          unique: true,
          comment: 'UUID角色标识'
        },
        role_name: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
          comment: '角色名称（英文）'
        },
        role_display_name: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '角色显示名称（中文）'
        },
        role_level: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '角色级别'
        },
        permissions: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '权限配置'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '是否激活'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      }, {
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '角色管理表'
      })

      // 2. users表 - 用户基础信息
      console.log('  📋 创建users表...')
      await queryInterface.createTable('users', {
        user_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '用户ID'
        },
        mobile: {
          type: Sequelize.STRING(20),
          allowNull: false,
          unique: true,
          comment: '手机号'
        },
        nickname: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '用户昵称'
        },
        status: {
          type: Sequelize.ENUM('active', 'inactive', 'banned'),
          allowNull: false,
          defaultValue: 'active',
          comment: '用户状态'
        },
        consecutive_fail_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '连续失败次数'
        },
        history_total_points: {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false,
          defaultValue: 0,
          comment: '历史累计积分'
        },
        last_login: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '最后登录时间'
        },
        login_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '登录次数'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      }, {
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '用户基础信息表'
      })

      // 3. user_roles表 - 用户角色关联（关键！完整定义）
      console.log('  📋 创建user_roles表（完整版本）...')
      await queryInterface.createTable('user_roles', {
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          primaryKey: true,
          comment: '用户ID'
        },
        role_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          primaryKey: true,
          comment: '角色ID'
        },
        assigned_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '角色分配时间'
        },
        assigned_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '角色分配者ID'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '角色是否激活'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      }, {
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '用户角色关联表'
      })

      console.log('  ✅ 基础表创建完成')

      // ========================================
      // 第2部分：创建索引
      // ========================================
      console.log('\n📦 第2部分：创建索引...')

      await queryInterface.addIndex('roles', ['role_uuid'], {
        name: 'idx_roles_uuid',
        unique: true,
        transaction
      })

      await queryInterface.addIndex('roles', ['role_name'], {
        name: 'idx_roles_name',
        unique: true,
        transaction
      })

      await queryInterface.addIndex('users', ['mobile'], {
        name: 'idx_users_mobile',
        unique: true,
        transaction
      })

      await queryInterface.addIndex('users', ['status'], {
        name: 'idx_users_status',
        transaction
      })

      await queryInterface.addIndex('user_roles', ['user_id'], {
        name: 'idx_user_roles_user',
        transaction
      })

      await queryInterface.addIndex('user_roles', ['role_id'], {
        name: 'idx_user_roles_role',
        transaction
      })

      await queryInterface.addIndex('user_roles', ['is_active'], {
        name: 'idx_user_roles_active',
        transaction
      })

      console.log('  ✅ 索引创建完成')

      // ========================================
      // 第3部分：添加外键约束
      // ========================================
      console.log('\n📦 第3部分：添加外键约束...')

      await queryInterface.addConstraint('user_roles', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_roles_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })

      await queryInterface.addConstraint('user_roles', {
        fields: ['role_id'],
        type: 'foreign key',
        name: 'fk_user_roles_role_id',
        references: {
          table: 'roles',
          field: 'role_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })

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

      console.log('  ✅ 外键约束添加完成')

      // ========================================
      // 第4部分：插入初始数据
      // ========================================
      console.log('\n📦 第4部分：插入初始数据...')

      const { v4: uuidv4 } = require('uuid')

      // 插入角色数据（使用英文名称）
      await queryInterface.bulkInsert('roles', [
        {
          role_id: 1,
          role_uuid: uuidv4(),
          role_name: 'super_admin',
          role_display_name: '超级管理员',
          role_level: 100,
          permissions: JSON.stringify({ all: ['*'] }),
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          role_id: 2,
          role_uuid: uuidv4(),
          role_name: 'admin',
          role_display_name: '管理员',
          role_level: 50,
          permissions: JSON.stringify({ management: ['read', 'write'] }),
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          role_id: 3,
          role_uuid: uuidv4(),
          role_name: 'user',
          role_display_name: '普通用户',
          role_level: 0,
          permissions: JSON.stringify({ basic: ['read'] }),
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ], { transaction })

      console.log('  ✅ 初始数据插入完成')

      // ========================================
      // 第5部分：数据完整性验证
      // ========================================
      console.log('\n📦 第5部分：数据完整性验证...')

      // 验证表创建
      const tables = await queryInterface.showAllTables()
      const requiredTables = ['roles', 'users', 'user_roles']
      const missingTables = requiredTables.filter(t => !tables.includes(t))

      if (missingTables.length > 0) {
        throw new Error(`缺少必需的表: ${missingTables.join(', ')}`)
      }
      console.log('  ✅ 所有必需表已创建')

      // 验证表结构
      const userRolesFields = await queryInterface.describeTable('user_roles')
      const requiredFields = ['user_id', 'role_id', 'assigned_at', 'assigned_by', 'is_active']
      const missingFields = requiredFields.filter(f => !userRolesFields[f])

      if (missingFields.length > 0) {
        throw new Error(`user_roles表缺少字段: ${missingFields.join(', ')}`)
      }
      console.log('  ✅ user_roles表结构完整')

      // 验证初始数据
      const [roles] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM roles',
        { transaction }
      )

      if (roles[0].count < 3) {
        throw new Error(`roles表初始数据不完整，期望3条，实际${roles[0].count}条`)
      }
      console.log(`  ✅ roles表初始数据完整（${roles[0].count}条）`)

      // ========================================
      // 提交事务
      // ========================================
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 显式基准迁移执行成功！')
      console.log('='.repeat(60))
      console.log('\n📊 创建摘要:')
      console.log(`  - 表数量: ${requiredTables.length}`)
      console.log('  - 索引数量: 7')
      console.log('  - 外键约束: 3')
      console.log('  - 初始角色: 3')
      console.log('')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移失败:', error.message)
      console.error(error.stack)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚基准迁移...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 按照依赖关系逆序删除
      await queryInterface.dropTable('user_roles', { transaction })
      await queryInterface.dropTable('users', { transaction })
      await queryInterface.dropTable('roles', { transaction })

      await transaction.commit()
      console.log('✅ 基准迁移回滚成功')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
