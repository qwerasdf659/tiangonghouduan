/**
 * P2阶段数据库变更完善迁移
 *
 * 任务内容：
 * 1. DB-3: 创建 admin_notifications 表（管理员通知消息表）
 * 2. DB-4: 为 admin_operation_logs 添加回滚相关字段
 *
 * 业务场景：
 * 1. admin_notifications：管理员消息中心，存储系统通知、告警提醒、任务通知等
 * 2. admin_operation_logs 扩展：支持操作回滚功能，记录影响范围和回滚状态
 *
 * 创建时间：2026年02月01日
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 开始执行P2阶段数据库变更完善迁移...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========================================
      // 第1部分：创建 admin_notifications 表
      // ========================================
      console.log('\n📦 第1部分：创建管理员通知表 (admin_notifications)...')

      // 检查表是否已存在
      const [existingTables] = await queryInterface.sequelize.query(
        "SHOW TABLES LIKE 'admin_notifications'",
        { transaction }
      )

      if (existingTables.length === 0) {
        await queryInterface.createTable(
          'admin_notifications',
          {
            /**
             * 通知ID（主键）
             * @type {number}
             * 命名规范：{table_name}_id
             */
            notification_id: {
              type: Sequelize.INTEGER,
              primaryKey: true,
              autoIncrement: true,
              comment: '通知ID（主键）'
            },

            /**
             * 接收管理员ID
             * @type {number}
             * 外键关联 users 表
             */
            admin_id: {
              type: Sequelize.INTEGER,
              allowNull: false,
              comment: '接收管理员ID',
              references: {
                model: 'users',
                key: 'user_id'
              },
              onUpdate: 'CASCADE',
              onDelete: 'CASCADE'
            },

            /**
             * 通知标题
             * @type {string}
             */
            title: {
              type: Sequelize.STRING(200),
              allowNull: false,
              comment: '通知标题'
            },

            /**
             * 通知内容
             * @type {string|null}
             */
            content: {
              type: Sequelize.TEXT,
              allowNull: true,
              comment: '通知内容（详细描述）'
            },

            /**
             * 通知类型
             * @type {string}
             * 枚举：system(系统通知), alert(告警), reminder(提醒), task(任务)
             */
            notification_type: {
              type: Sequelize.ENUM('system', 'alert', 'reminder', 'task'),
              allowNull: false,
              defaultValue: 'system',
              comment: '通知类型（system=系统通知, alert=告警, reminder=提醒, task=任务）'
            },

            /**
             * 优先级
             * @type {string}
             * 枚举：low(低), normal(普通), high(高), urgent(紧急)
             */
            priority: {
              type: Sequelize.ENUM('low', 'normal', 'high', 'urgent'),
              allowNull: false,
              defaultValue: 'normal',
              comment: '优先级（low=低, normal=普通, high=高, urgent=紧急）'
            },

            /**
             * 是否已读
             * @type {boolean}
             */
            is_read: {
              type: Sequelize.BOOLEAN,
              allowNull: false,
              defaultValue: false,
              comment: '是否已读'
            },

            /**
             * 阅读时间
             * @type {Date|null}
             */
            read_at: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '阅读时间'
            },

            /**
             * 来源类型
             * @type {string|null}
             * 用于标识通知来源，如：lottery_alert, consumption, reminder_rule
             */
            source_type: {
              type: Sequelize.STRING(50),
              allowNull: true,
              comment: '来源类型（如：lottery_alert, consumption, reminder_rule）'
            },

            /**
             * 来源ID
             * @type {number|null}
             * 关联来源实体的ID
             */
            source_id: {
              type: Sequelize.INTEGER,
              allowNull: true,
              comment: '来源ID（关联来源实体）'
            },

            /**
             * 附加数据
             * @type {Object|null}
             * 存储额外的业务数据，如跳转链接、操作按钮等
             */
            extra_data: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '附加数据（JSON格式，如跳转链接、操作按钮等）'
            },

            /**
             * 过期时间
             * @type {Date|null}
             * 超过此时间后通知自动标记为过期
             */
            expires_at: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '过期时间（超时后自动标记过期）'
            },

            /**
             * 创建时间
             * @type {Date}
             */
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
              comment: '创建时间'
            },

            /**
             * 更新时间
             * @type {Date}
             */
            updated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
              comment: '更新时间'
            }
          },
          {
            transaction,
            comment: '管理员通知消息表 - 存储系统通知、告警提醒、任务通知等'
          }
        )

        // 创建索引
        console.log('   创建 admin_notifications 索引...')

        await queryInterface.addIndex('admin_notifications', ['admin_id', 'is_read'], {
          name: 'idx_admin_notifications_admin_read',
          transaction
        })

        await queryInterface.addIndex('admin_notifications', ['notification_type', 'created_at'], {
          name: 'idx_admin_notifications_type_created',
          transaction
        })

        await queryInterface.addIndex('admin_notifications', ['priority', 'is_read'], {
          name: 'idx_admin_notifications_priority_read',
          transaction
        })

        await queryInterface.addIndex('admin_notifications', ['source_type', 'source_id'], {
          name: 'idx_admin_notifications_source',
          transaction
        })

        console.log('   ✅ admin_notifications 表创建完成')
      } else {
        console.log('   ⏭️ admin_notifications 表已存在，跳过创建')
      }

      // ========================================
      // 第2部分：扩展 admin_operation_logs 表字段
      // ========================================
      console.log('\n📦 第2部分：扩展 admin_operation_logs 表字段...')
      console.log('   📋 说明：表中已有 is_reversible/is_reversed 等字段，本次添加补充字段')

      // 获取现有字段
      const [existingColumns] = await queryInterface.sequelize.query(
        'DESCRIBE admin_operation_logs',
        { transaction }
      )
      const columnNames = existingColumns.map(col => col.Field)

      // 添加 affected_users 字段（影响用户数统计）
      if (!columnNames.includes('affected_users')) {
        await queryInterface.addColumn(
          'admin_operation_logs',
          'affected_users',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0,
            comment: '影响用户数（用于评估操作影响范围）'
          },
          { transaction }
        )
        console.log('   ✅ 添加字段: affected_users')
      } else {
        console.log('   ⏭️ 字段 affected_users 已存在')
      }

      // 添加 affected_amount 字段（影响金额统计）
      if (!columnNames.includes('affected_amount')) {
        await queryInterface.addColumn(
          'admin_operation_logs',
          'affected_amount',
          {
            type: Sequelize.BIGINT,
            allowNull: true,
            defaultValue: 0,
            comment: '影响金额/积分数（分为单位，用于评估财务影响）'
          },
          { transaction }
        )
        console.log('   ✅ 添加字段: affected_amount')
      } else {
        console.log('   ⏭️ 字段 affected_amount 已存在')
      }

      // 添加 rollback_deadline 字段（回滚截止时间）
      if (!columnNames.includes('rollback_deadline')) {
        await queryInterface.addColumn(
          'admin_operation_logs',
          'rollback_deadline',
          {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '回滚截止时间（超时后不可回滚，与 is_reversible 配合使用）'
          },
          { transaction }
        )
        console.log('   ✅ 添加字段: rollback_deadline')
      } else {
        console.log('   ⏭️ 字段 rollback_deadline 已存在')
      }

      // 添加影响范围索引
      console.log('   创建影响范围索引...')

      const [affectedIndexes] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM admin_operation_logs WHERE Key_name = 'idx_operation_logs_affected'",
        { transaction }
      )

      if (affectedIndexes.length === 0) {
        await queryInterface.addIndex('admin_operation_logs', ['affected_users', 'affected_amount'], {
          name: 'idx_operation_logs_affected',
          transaction
        })
        console.log('   ✅ 创建索引: idx_operation_logs_affected')
      } else {
        console.log('   ⏭️ 索引 idx_operation_logs_affected 已存在')
      }

      // 检查回滚截止时间索引
      const [deadlineIndexes] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM admin_operation_logs WHERE Key_name = 'idx_operation_logs_deadline'",
        { transaction }
      )

      if (deadlineIndexes.length === 0) {
        await queryInterface.addIndex('admin_operation_logs', ['is_reversible', 'rollback_deadline'], {
          name: 'idx_operation_logs_deadline',
          transaction
        })
        console.log('   ✅ 创建索引: idx_operation_logs_deadline')
      } else {
        console.log('   ⏭️ 索引 idx_operation_logs_deadline 已存在')
      }

      console.log('   ✅ admin_operation_logs 扩展完成')

      // ========================================
      // 提交事务
      // ========================================
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ P2阶段数据库变更完善迁移执行成功！')
      console.log('='.repeat(60))

      // 输出变更摘要
      console.log('\n📋 变更摘要：')
      console.log('   1. 创建 admin_notifications 表（管理员通知消息）')
      console.log('   2. admin_operation_logs 新增3个字段：affected_users, affected_amount, rollback_deadline')
      console.log('   3. 创建相关索引优化查询性能')
      console.log('   📝 注意：回滚功能已通过 is_reversible/is_reversed 等字段实现')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚P2阶段数据库变更...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚 admin_operation_logs 扩展字段
      console.log('   移除 admin_operation_logs 扩展字段...')

      const fieldsToRemove = ['affected_users', 'affected_amount', 'rollback_deadline']

      const [existingColumns] = await queryInterface.sequelize.query(
        'DESCRIBE admin_operation_logs',
        { transaction }
      )
      const columnNames = existingColumns.map(col => col.Field)

      for (const field of fieldsToRemove) {
        if (columnNames.includes(field)) {
          await queryInterface.removeColumn('admin_operation_logs', field, { transaction })
          console.log(`   ✅ 移除字段: ${field}`)
        }
      }

      // 移除索引
      try {
        await queryInterface.removeIndex('admin_operation_logs', 'idx_operation_logs_affected', {
          transaction
        })
        console.log('   ✅ 移除索引: idx_operation_logs_affected')
      } catch (e) {
        // 索引不存在，忽略
      }

      try {
        await queryInterface.removeIndex('admin_operation_logs', 'idx_operation_logs_deadline', {
          transaction
        })
        console.log('   ✅ 移除索引: idx_operation_logs_deadline')
      } catch (e) {
        // 索引不存在，忽略
      }

      // 删除 admin_notifications 表
      console.log('   删除 admin_notifications 表...')
      await queryInterface.dropTable('admin_notifications', { transaction })
      console.log('   ✅ admin_notifications 表已删除')

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
