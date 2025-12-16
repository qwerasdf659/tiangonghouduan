/**
 * 迁移：创建 accounts 表（账户主体：用户账户 + 系统账户）
 *
 * 业务场景：
 * - 统一账户体系：用户账户（account_type=user）+ 系统账户（account_type=system）
 * - 系统账户：SYSTEM_PLATFORM_FEE（平台手续费）、SYSTEM_MINT（系统发放）、SYSTEM_BURN（系统销毁）等
 * - 替换旧方案：不再使用 PLATFORM_USER_ID（真实用户）承接手续费
 *
 * 表名：accounts
 * 主键：account_id（BIGINT，自增）
 * 唯一约束：
 * - user_id（当 account_type=user 时唯一）
 * - system_code（当 account_type=system 时唯一）
 *
 * 关联关系：
 * - user_id → users.user_id（CASCADE更新，RESTRICT删除）
 *
 * 创建时间：2025-12-15
 * 迁移版本：v4.2.0
 * 对应文档：生产级资产与物品交易统一方案 - Phase 1
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：创建 accounts 表
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始创建 accounts 表...')

      // 创建 accounts 表
      await queryInterface.createTable(
        'accounts',
        {
          // ==================== 主键 ====================
          account_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '账户ID（主键，自增）'
          },

          // ==================== 账户类型 ====================
          account_type: {
            type: Sequelize.ENUM('user', 'system'),
            allowNull: false,
            comment:
              '账户类型（Account Type）：user-用户账户（关联真实用户，user_id必填）| system-系统账户（平台运营账户，system_code必填）'
          },

          // ==================== 用户账户关联 ====================
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment:
              '用户ID（User ID）：当 account_type=user 时必填且唯一；当 account_type=system 时为NULL；外键关联 users.user_id',
            references: {
              model: 'users',
              key: 'user_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },

          // ==================== 系统账户标识 ====================
          system_code: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment:
              '系统账户代码（System Code）：当 account_type=system 时必填且唯一；预定义系统账户：SYSTEM_PLATFORM_FEE（平台手续费）、SYSTEM_MINT（系统发放）、SYSTEM_BURN（系统销毁）、SYSTEM_ESCROW（托管/争议）'
          },

          // ==================== 账户状态 ====================
          status: {
            type: Sequelize.ENUM('active', 'disabled'),
            allowNull: false,
            defaultValue: 'active',
            comment:
              '账户状态（Account Status）：active-活跃（可正常交易）| disabled-禁用（冻结状态，禁止任何交易）'
          },

          // ==================== 时间戳 ====================
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间）'
          },

          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间）'
          }
        },
        {
          transaction,
          comment: '账户表（统一用户账户与系统账户）'
        }
      )

      console.log('✅ accounts 表创建成功')

      // ==================== 创建索引 ====================
      console.log('🔄 创建索引...')

      // 唯一索引：user_id（用户账户唯一约束）
      await queryInterface.addIndex('accounts', {
        name: 'uk_accounts_user_id',
        fields: ['user_id'],
        unique: true,
        where: {
          account_type: 'user',
          user_id: {
            [Sequelize.Op.not]: null
          }
        },
        transaction
      })
      console.log('✅ 创建唯一索引：uk_accounts_user_id')

      // 唯一索引：system_code（系统账户唯一约束）
      await queryInterface.addIndex('accounts', {
        name: 'uk_accounts_system_code',
        fields: ['system_code'],
        unique: true,
        where: {
          account_type: 'system',
          system_code: {
            [Sequelize.Op.not]: null
          }
        },
        transaction
      })
      console.log('✅ 创建唯一索引：uk_accounts_system_code')

      // 普通索引：account_type + status（查询优化）
      await queryInterface.addIndex('accounts', {
        name: 'idx_accounts_type_status',
        fields: ['account_type', 'status'],
        transaction
      })
      console.log('✅ 创建索引：idx_accounts_type_status')

      // ==================== 插入系统账户 ====================
      console.log('🔄 插入预定义系统账户...')

      const systemAccounts = [
        {
          account_type: 'system',
          system_code: 'SYSTEM_PLATFORM_FEE',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          account_type: 'system',
          system_code: 'SYSTEM_MINT',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          account_type: 'system',
          system_code: 'SYSTEM_BURN',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          account_type: 'system',
          system_code: 'SYSTEM_ESCROW',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date()
        }
      ]

      await queryInterface.bulkInsert('accounts', systemAccounts, {
        transaction
      })
      console.log(
        `✅ 成功插入 ${systemAccounts.length} 个系统账户（SYSTEM_PLATFORM_FEE、SYSTEM_MINT、SYSTEM_BURN、SYSTEM_ESCROW）`
      )

      await transaction.commit()
      console.log('✅ accounts 表创建完成（含系统账户初始化）')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 创建 accounts 表失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除 accounts 表
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚：删除 accounts 表...')

      // 删除表
      await queryInterface.dropTable('accounts', { transaction })

      await transaction.commit()
      console.log('✅ accounts 表已删除')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 删除 accounts 表失败:', error.message)
      throw error
    }
  }
}
