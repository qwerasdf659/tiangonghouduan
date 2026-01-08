/**
 * 迁移文件：创建审计相关业务记录表
 *
 * 业务场景：解决"无天然业务主键"的关键操作审计问题
 * 根据《审计统一入口整合方案》决策9：
 *   - 对于 role_change、user_status_change 等操作，无明确业务主键
 *   - 需要创建专用的业务记录表，主键作为审计日志的 target_id
 *
 * 创建的表：
 *   1. user_status_change_records - 用户状态变更记录
 *   2. user_role_change_records - 用户角色变更记录
 *
 * 版本：v1.0.0
 * 创建时间：2026-01-08
 */

'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 开始创建审计业务记录表...')

    // ========================
    // 1. 创建用户状态变更记录表
    // ========================
    const [statusTables] = await queryInterface.sequelize.query(
      `SHOW TABLES LIKE 'user_status_change_records'`
    )

    if (statusTables.length === 0) {
      await queryInterface.createTable(
        'user_status_change_records',
        {
          // 主键：变更记录ID（自增）- 作为审计日志的 target_id
          record_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '变更记录ID（作为审计日志 target_id）'
          },

          // 被变更的用户ID
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'users',
              key: 'user_id'
            },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
            comment: '被变更状态的用户ID'
          },

          // 操作员ID（执行状态变更的管理员）
          operator_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'users',
              key: 'user_id'
            },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
            comment: '执行变更的操作员ID'
          },

          // 变更前状态
          old_status: {
            type: Sequelize.ENUM('active', 'inactive', 'banned', 'pending'),
            allowNull: false,
            comment: '变更前状态：active=活跃/inactive=禁用/banned=封禁/pending=待激活'
          },

          // 变更后状态
          new_status: {
            type: Sequelize.ENUM('active', 'inactive', 'banned', 'pending'),
            allowNull: false,
            comment: '变更后状态：active=活跃/inactive=禁用/banned=封禁/pending=待激活'
          },

          // 变更原因
          reason: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '状态变更原因（管理员备注）'
          },

          // 幂等键（防止重复操作）
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: false,
            unique: true,
            comment: '幂等键（格式：status_change_{user_id}_{timestamp}_{operator_id}）'
          },

          // 元数据（JSON格式）
          metadata: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '额外元数据（IP地址、用户代理等）'
          },

          // 创建时间
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '用户状态变更记录表（为审计日志提供业务主键）'
        }
      )
      console.log('✅ user_status_change_records 表创建成功')

      // 创建索引
      const statusIndexes = [
        { name: 'idx_uscr_user_id', fields: ['user_id'] },
        { name: 'idx_uscr_operator_id', fields: ['operator_id'] },
        { name: 'idx_uscr_created_at', fields: ['created_at'] }
      ]

      for (const idx of statusIndexes) {
        await queryInterface.addIndex('user_status_change_records', idx.fields, { name: idx.name })
        console.log(`✅ 索引 ${idx.name} 添加成功`)
      }
    } else {
      console.log('⏭️ user_status_change_records 表已存在，跳过创建')
    }

    // ========================
    // 2. 创建用户角色变更记录表
    // ========================
    const [roleTables] = await queryInterface.sequelize.query(
      `SHOW TABLES LIKE 'user_role_change_records'`
    )

    if (roleTables.length === 0) {
      await queryInterface.createTable(
        'user_role_change_records',
        {
          // 主键：变更记录ID（自增）- 作为审计日志的 target_id
          record_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '变更记录ID（作为审计日志 target_id）'
          },

          // 被变更的用户ID
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'users',
              key: 'user_id'
            },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
            comment: '被变更角色的用户ID'
          },

          // 操作员ID（执行角色变更的管理员）
          operator_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'users',
              key: 'user_id'
            },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
            comment: '执行变更的操作员ID'
          },

          // 变更前角色
          old_role: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '变更前角色名（如 user、admin、merchant 等）'
          },

          // 变更后角色
          new_role: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '变更后角色名（如 user、admin、merchant 等）'
          },

          // 变更原因
          reason: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '角色变更原因（管理员备注）'
          },

          // 幂等键（防止重复操作）
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: false,
            unique: true,
            comment: '幂等键（格式：role_change_{user_id}_{new_role}_{operator_id}_{timestamp}）'
          },

          // 元数据（JSON格式）
          metadata: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '额外元数据（IP地址、用户代理等）'
          },

          // 创建时间
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '用户角色变更记录表（为审计日志提供业务主键）'
        }
      )
      console.log('✅ user_role_change_records 表创建成功')

      // 创建索引
      const roleIndexes = [
        { name: 'idx_urcr_user_id', fields: ['user_id'] },
        { name: 'idx_urcr_operator_id', fields: ['operator_id'] },
        { name: 'idx_urcr_created_at', fields: ['created_at'] }
      ]

      for (const idx of roleIndexes) {
        await queryInterface.addIndex('user_role_change_records', idx.fields, { name: idx.name })
        console.log(`✅ 索引 ${idx.name} 添加成功`)
      }
    } else {
      console.log('⏭️ user_role_change_records 表已存在，跳过创建')
    }

    console.log('🎉 审计业务记录表创建完成')
  },

  async down(queryInterface) {
    console.log('🔙 回滚：删除审计业务记录表...')

    // 删除用户角色变更记录表
    await queryInterface.dropTable('user_role_change_records')
    console.log('✅ user_role_change_records 表删除成功')

    // 删除用户状态变更记录表
    await queryInterface.dropTable('user_status_change_records')
    console.log('✅ user_status_change_records 表删除成功')

    console.log('🎉 审计业务记录表回滚完成')
  }
}
