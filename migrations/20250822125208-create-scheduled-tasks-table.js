'use strict'

/**
 * 🔥 定时任务系统数据库迁移 v3.0
 * 创建时间：2025年08月22日 12:52 UTC
 * 功能：创建定时任务表，支持Cron表达式调度
 * 架构：基于现有V3架构，支持任务持久化和恢复
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🚀 开始创建定时任务系统表...')

      // 创建定时任务表
      await queryInterface.createTable('scheduled_tasks', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '任务ID'
        },
        name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '任务名称'
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '任务描述'
        },
        task_type: {
          type: Sequelize.ENUM(
            'lottery_campaign_start',
            'lottery_campaign_end',
            'daily_reset',
            'vip_expiry_check',
            'social_room_cleanup',
            'points_settlement',
            'system_maintenance',
            'custom'
          ),
          allowNull: false,
          comment: '任务类型'
        },
        cron_expression: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: 'Cron表达式（如：0 0 * * *）'
        },
        task_data: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '任务数据JSON（参数、配置等）'
        },
        status: {
          type: Sequelize.ENUM('active', 'paused', 'completed', 'error'),
          defaultValue: 'active',
          comment: '任务状态'
        },
        is_recurring: {
          type: Sequelize.BOOLEAN,
          defaultValue: true,
          comment: '是否重复执行'
        },
        max_retries: {
          type: Sequelize.INTEGER,
          defaultValue: 3,
          comment: '最大重试次数'
        },
        timeout_minutes: {
          type: Sequelize.INTEGER,
          defaultValue: 30,
          comment: '任务超时时间（分钟）'
        },
        created_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '创建人用户ID'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '创建时间'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
          comment: '更新时间'
        },
        last_execution: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '最后执行时间'
        },
        next_execution: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '下次执行时间'
        },
        execution_count: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '执行次数'
        },
        error_count: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '错误次数'
        },
        last_error: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '最后错误信息'
        },
        last_duration_ms: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '最后执行耗时（毫秒）'
        }
      }, {
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '定时任务表 - 支持Cron表达式调度和任务恢复'
      })

      console.log('📊 创建定时任务表索引...')

      // 创建索引
      await queryInterface.addIndex('scheduled_tasks', {
        fields: ['status'],
        name: 'idx_scheduled_tasks_status',
        transaction
      })

      await queryInterface.addIndex('scheduled_tasks', {
        fields: ['next_execution'],
        name: 'idx_scheduled_tasks_next_execution',
        transaction
      })

      await queryInterface.addIndex('scheduled_tasks', {
        fields: ['task_type'],
        name: 'idx_scheduled_tasks_task_type',
        transaction
      })

      await queryInterface.addIndex('scheduled_tasks', {
        fields: ['created_at'],
        name: 'idx_scheduled_tasks_created_at',
        transaction
      })

      await queryInterface.addIndex('scheduled_tasks', {
        fields: ['status', 'next_execution'],
        name: 'idx_scheduled_tasks_status_next_execution',
        transaction
      })

      console.log('📝 插入默认定时任务...')

      // 插入默认系统任务
      await queryInterface.bulkInsert('scheduled_tasks', [
        {
          name: '每日积分重置',
          description: '每天凌晨重置用户每日积分和任务',
          task_type: 'daily_reset',
          cron_expression: '0 0 * * *', // 每天00:00
          task_data: JSON.stringify({
            reset_daily_points: true,
            reset_daily_tasks: true,
            reset_daily_draws: true
          }),
          status: 'active',
          is_recurring: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          name: 'VIP到期检查',
          description: '每小时检查VIP会员到期状态',
          task_type: 'vip_expiry_check',
          cron_expression: '0 * * * *', // 每小时
          task_data: JSON.stringify({
            check_expiry: true,
            send_notifications: true,
            auto_downgrade: true
          }),
          status: 'active',
          is_recurring: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          name: '社交房间清理',
          description: '每5分钟清理过期的社交抽奖房间',
          task_type: 'social_room_cleanup',
          cron_expression: '*/5 * * * *', // 每5分钟
          task_data: JSON.stringify({
            cleanup_expired_rooms: true,
            refund_points: true,
            notify_participants: true
          }),
          status: 'active',
          is_recurring: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          name: '积分结算任务',
          description: '每周日凌晨进行积分结算和统计',
          task_type: 'points_settlement',
          cron_expression: '0 0 * * 0', // 每周日00:00
          task_data: JSON.stringify({
            settlement_weekly_bonus: true,
            update_vip_progress: true,
            generate_reports: true
          }),
          status: 'active',
          is_recurring: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ], { transaction })

      await transaction.commit()
      console.log('✅ 定时任务系统表创建完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 创建定时任务表失败:', error)
      throw error
    }
  },

  async down (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🗑️ 删除定时任务系统表...')

      await queryInterface.dropTable('scheduled_tasks', { transaction })

      await transaction.commit()
      console.log('✅ 定时任务系统表删除完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 删除定时任务表失败:', error)
      throw error
    }
  }
}
