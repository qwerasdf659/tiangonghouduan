/**
 * 层级化角色权限管理系统 - 数据库迁移
 *
 * 🎯 业务场景：区域负责人→业务经理→业务员三级管理结构
 * 🛡️ 核心需求：快速批量调整和关闭下级人员权限
 *
 * 📊 创建内容：
 * 1. stores表 - 门店信息管理
 * 2. user_hierarchy表 - 用户层级关系（简化版，不使用hierarchy_path）
 * 3. role_change_logs表 - 角色变更日志审计
 * 4. 初始化3个业务角色（regional_manager, business_manager, sales_staff）
 *
 * 创建时间：2025年11月07日
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 开始创建层级化角色权限管理系统...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      /*
       * ========================================
       * 第1部分：创建stores表（门店信息）
       * ========================================
       */
      console.log('\n📦 第1部分：创建stores表...')

      await queryInterface.createTable('stores', {
        store_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '门店ID（主键）'
        },
        store_name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '门店名称（如：某某餐厅XX店）'
        },
        store_code: {
          type: Sequelize.STRING(50),
          allowNull: true,
          unique: true,
          comment: '门店编号（唯一标识，如：ST20250101001）'
        },
        store_address: {
          type: Sequelize.STRING(200),
          allowNull: true,
          comment: '门店地址（详细地址）'
        },
        contact_name: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '门店联系人姓名'
        },
        contact_mobile: {
          type: Sequelize.STRING(20),
          allowNull: true,
          comment: '门店联系电话'
        },
        region: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '所属区域（如：东城区、西城区）'
        },
        status: {
          type: Sequelize.ENUM('active', 'inactive', 'pending'),
          allowNull: false,
          defaultValue: 'active',
          comment: '门店状态：active-正常营业，inactive-已关闭，pending-待审核'
        },
        assigned_to: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '分配给哪个业务员（外键关联users.user_id）'
        },
        merchant_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '商户ID（关联商家用户，外键关联users.user_id）'
        },
        notes: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '备注信息'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '创建时间（门店信息录入时间），时区：北京时间（GMT+8）'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
          comment: '更新时间（最后修改时间），时区：北京时间（GMT+8）'
        }
      }, {
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '门店信息表（用于记录合作商家门店，业务员分派依据）'
      })

      console.log('  ✅ stores表创建成功')

      /*
       * ========================================
       * 第2部分：创建user_hierarchy表（用户层级关系 - 简化版）
       * ========================================
       */
      console.log('\n📦 第2部分：创建user_hierarchy表（简化版）...')

      await queryInterface.createTable('user_hierarchy', {
        hierarchy_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '层级关系ID（主键）'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID（当前用户）'
        },
        superior_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '上级用户ID（NULL表示顶级区域负责人）'
        },
        role_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '当前角色ID（关联roles表）'
        },
        store_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '所属门店ID（仅业务员有值，业务经理和区域负责人为NULL）'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '层级关系是否有效（1=激活，0=已停用）'
        },
        activated_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '激活时间（首次激活或重新激活时记录），时区：北京时间（GMT+8）'
        },
        deactivated_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '停用时间（停用时记录），时区：北京时间（GMT+8）'
        },
        deactivated_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '停用操作人ID（谁停用的？外键关联users.user_id）'
        },
        deactivation_reason: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '停用原因（如：离职、调动、违规等）'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '创建时间，时区：北京时间（GMT+8）'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
          comment: '更新时间，时区：北京时间（GMT+8）'
        }
      }, {
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '用户层级关系表（简化版：仅保留核心字段和必要索引）'
      })

      console.log('  ✅ user_hierarchy表创建成功')

      /*
       * ========================================
       * 第3部分：创建role_change_logs表（角色变更日志）
       * ========================================
       */
      console.log('\n📦 第3部分：创建role_change_logs表...')

      await queryInterface.createTable('role_change_logs', {
        log_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '日志ID（主键）'
        },
        target_user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '目标用户ID（被操作的用户，如被停用权限的业务员）'
        },
        operator_user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '操作人ID（执行操作的用户，如区域负责人或业务经理）'
        },
        operation_type: {
          type: Sequelize.ENUM('activate', 'deactivate', 'role_change', 'batch_deactivate'),
          allowNull: false,
          comment: '操作类型：activate-激活权限，deactivate-停用权限，role_change-角色变更，batch_deactivate-批量停用'
        },
        old_role_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '原角色ID（角色变更时记录，如从业务员变为业务经理）'
        },
        new_role_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '新角色ID（角色变更时记录，如从业务员变为业务经理）'
        },
        affected_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
          comment: '影响的用户数量（批量操作时记录，如停用1个业务经理及其10个业务员，则为11）'
        },
        reason: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '操作原因（如：离职、调动、违规、权限调整等）'
        },
        ip_address: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '操作IP地址（用于安全审计）'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '日志记录时间，时区：北京时间（GMT+8）'
        }
      }, {
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '角色权限变更日志表（用于审计和追踪所有权限变更操作）'
      })

      console.log('  ✅ role_change_logs表创建成功')

      /*
       * ========================================
       * 第4部分：创建索引
       * ========================================
       */
      console.log('\n📦 第4部分：创建索引...')

      // stores表索引（store_code的唯一索引已在CREATE TABLE时自动创建，无需重复）
      await queryInterface.addIndex('stores', ['status'], {
        name: 'idx_stores_status',
        transaction
      })
      await queryInterface.addIndex('stores', ['region'], {
        name: 'idx_stores_region',
        transaction
      })
      await queryInterface.addIndex('stores', ['assigned_to'], {
        name: 'idx_stores_assigned_to',
        transaction
      })
      await queryInterface.addIndex('stores', ['merchant_id'], {
        name: 'idx_stores_merchant_id',
        transaction
      })

      // user_hierarchy表索引（简化版：仅核心索引）
      await queryInterface.addIndex('user_hierarchy', ['user_id', 'role_id'], {
        unique: true,
        name: 'uk_user_role',
        transaction
      })
      await queryInterface.addIndex('user_hierarchy', ['superior_user_id'], {
        name: 'idx_user_hierarchy_superior',
        transaction
      })
      await queryInterface.addIndex('user_hierarchy', ['is_active'], {
        name: 'idx_user_hierarchy_active',
        transaction
      })

      // role_change_logs表索引
      await queryInterface.addIndex('role_change_logs', ['target_user_id'], {
        name: 'idx_role_log_target',
        transaction
      })
      await queryInterface.addIndex('role_change_logs', ['operator_user_id'], {
        name: 'idx_role_log_operator',
        transaction
      })
      await queryInterface.addIndex('role_change_logs', ['operation_type'], {
        name: 'idx_role_log_type',
        transaction
      })
      await queryInterface.addIndex('role_change_logs', ['created_at'], {
        name: 'idx_role_log_created',
        transaction
      })

      console.log('  ✅ 索引创建完成')

      /*
       * ========================================
       * 第5部分：添加外键约束
       * ========================================
       */
      console.log('\n📦 第5部分：添加外键约束...')

      // stores表外键
      await queryInterface.addConstraint('stores', {
        fields: ['assigned_to'],
        type: 'foreign key',
        name: 'fk_store_assigned_to',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })

      await queryInterface.addConstraint('stores', {
        fields: ['merchant_id'],
        type: 'foreign key',
        name: 'fk_store_merchant',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })

      // user_hierarchy表外键
      await queryInterface.addConstraint('user_hierarchy', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_hierarchy_user',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })

      await queryInterface.addConstraint('user_hierarchy', {
        fields: ['superior_user_id'],
        type: 'foreign key',
        name: 'fk_user_hierarchy_superior',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })

      await queryInterface.addConstraint('user_hierarchy', {
        fields: ['role_id'],
        type: 'foreign key',
        name: 'fk_user_hierarchy_role',
        references: {
          table: 'roles',
          field: 'role_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })

      await queryInterface.addConstraint('user_hierarchy', {
        fields: ['store_id'],
        type: 'foreign key',
        name: 'fk_user_hierarchy_store',
        references: {
          table: 'stores',
          field: 'store_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })

      await queryInterface.addConstraint('user_hierarchy', {
        fields: ['deactivated_by'],
        type: 'foreign key',
        name: 'fk_user_hierarchy_deactivator',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })

      // role_change_logs表外键
      await queryInterface.addConstraint('role_change_logs', {
        fields: ['target_user_id'],
        type: 'foreign key',
        name: 'fk_role_log_target',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })

      await queryInterface.addConstraint('role_change_logs', {
        fields: ['operator_user_id'],
        type: 'foreign key',
        name: 'fk_role_log_operator',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })

      await queryInterface.addConstraint('role_change_logs', {
        fields: ['old_role_id'],
        type: 'foreign key',
        name: 'fk_role_log_old_role',
        references: {
          table: 'roles',
          field: 'role_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })

      await queryInterface.addConstraint('role_change_logs', {
        fields: ['new_role_id'],
        type: 'foreign key',
        name: 'fk_role_log_new_role',
        references: {
          table: 'roles',
          field: 'role_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })

      console.log('  ✅ 外键约束添加完成')

      /*
       * ========================================
       * 第6部分：插入初始角色数据
       * ========================================
       */
      console.log('\n📦 第6部分：插入层级管理业务角色...')

      const { v4: uuidv4 } = require('uuid')

      // 插入3个业务角色
      await queryInterface.bulkInsert('roles', [
        {
          role_uuid: uuidv4(),
          role_name: 'regional_manager',
          role_level: 80,
          permissions: JSON.stringify({
            users: ['read', 'create', 'update', 'delete'],
            stores: ['read', 'create', 'update', 'delete'],
            hierarchy: ['read', 'create', 'update', 'delete'],
            staff: ['read', 'create', 'update', 'delete'],
            consumption: ['read', 'create', 'update', 'delete'],
            reports: ['read']
          }),
          description: '区域负责人（可管理业务经理和业务员，查看所有业务数据，权限级别80）',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          role_uuid: uuidv4(),
          role_name: 'business_manager',
          role_level: 60,
          permissions: JSON.stringify({
            stores: ['read', 'update'],
            staff: ['read', 'create', 'update'],
            consumption: ['read', 'create', 'update', 'delete'],
            reports: ['read'],
            hierarchy: ['read']
          }),
          description: '业务经理（可管理业务员，录入和管理消费记录，查看业务报表，权限级别60）',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          role_uuid: uuidv4(),
          role_name: 'sales_staff',
          role_level: 40,
          permissions: JSON.stringify({
            stores: ['read'],
            consumption: ['read', 'create'],
            profile: ['read', 'update']
          }),
          description: '业务员（可录入消费记录，查看分配门店信息，管理个人信息，权限级别40）',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ], { transaction })

      console.log('  ✅ 业务角色插入完成（regional_manager, business_manager, sales_staff）')

      /*
       * ========================================
       * 第7部分：数据完整性验证
       * ========================================
       */
      console.log('\n📦 第7部分：数据完整性验证...')

      // 验证表创建
      const tables = await queryInterface.showAllTables()
      const requiredTables = ['stores', 'user_hierarchy', 'role_change_logs']
      const missingTables = requiredTables.filter(t => !tables.includes(t))

      if (missingTables.length > 0) {
        throw new Error(`缺少必需的表: ${missingTables.join(', ')}`)
      }
      console.log('  ✅ 所有必需表已创建')

      // 验证角色数据
      const [roles] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM roles WHERE role_name IN (\'regional_manager\', \'business_manager\', \'sales_staff\')',
        { transaction }
      )

      if (roles[0].count < 3) {
        throw new Error(`业务角色初始化不完整，期望3个，实际${roles[0].count}个`)
      }
      console.log(`  ✅ 业务角色初始化完整（${roles[0].count}个）`)

      /*
       * ========================================
       * 提交事务
       * ========================================
       */
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 层级化角色权限管理系统创建成功！')
      console.log('='.repeat(60))
      console.log('\n📊 创建摘要:')
      console.log('  - 新增表: 3 (stores, user_hierarchy, role_change_logs)')
      console.log('  - 新增索引: 14')
      console.log('  - 新增外键: 10')
      console.log('  - 新增角色: 3 (regional_manager=80, business_manager=60, sales_staff=40)')
      console.log('')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移失败:', error.message)
      console.error(error.stack)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 开始回滚层级化角色权限管理系统...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除业务角色
      await queryInterface.sequelize.query(
        'DELETE FROM roles WHERE role_name IN (\'regional_manager\', \'business_manager\', \'sales_staff\')',
        { transaction }
      )

      // 按照依赖关系逆序删除表
      await queryInterface.dropTable('role_change_logs', { transaction })
      await queryInterface.dropTable('user_hierarchy', { transaction })
      await queryInterface.dropTable('stores', { transaction })

      await transaction.commit()
      console.log('✅ 层级化角色权限管理系统回滚成功')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
