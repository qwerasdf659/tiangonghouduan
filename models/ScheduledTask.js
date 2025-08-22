/**
 * 🔥 定时任务模型 v3.0
 * 功能：定义scheduled_tasks表的Sequelize模型
 * 架构：基于现有V3模型规范，支持JSON字段和ENUM类型
 */

const { DataTypes } = require('sequelize')

module.exports = (sequelize) => {
  const ScheduledTask = sequelize.define('ScheduledTask', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: '任务ID'
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '任务名称'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '任务描述'
    },
    task_type: {
      type: DataTypes.ENUM(
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
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Cron表达式（如：0 0 * * *）'
    },
    task_data: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '任务数据JSON（参数、配置等）',
      get () {
        const rawValue = this.getDataValue('task_data')
        return rawValue ? (typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue) : null
      },
      set (value) {
        this.setDataValue('task_data', value ? JSON.stringify(value) : null)
      }
    },
    status: {
      type: DataTypes.ENUM('active', 'paused', 'completed', 'error'),
      defaultValue: 'active',
      comment: '任务状态'
    },
    is_recurring: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: '是否重复执行'
    },
    max_retries: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
      comment: '最大重试次数'
    },
    timeout_minutes: {
      type: DataTypes.INTEGER,
      defaultValue: 30,
      comment: '任务超时时间（分钟）'
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: '创建人用户ID'
    },
    last_execution: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '最后执行时间'
    },
    next_execution: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '下次执行时间'
    },
    execution_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: '执行次数'
    },
    error_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: '错误次数'
    },
    last_error: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '最后错误信息'
    },
    last_duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: '最后执行耗时（毫秒）'
    }
  }, {
    tableName: 'scheduled_tasks',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    comment: '定时任务表 - 支持Cron表达式调度和任务恢复',
    indexes: [
      {
        name: 'idx_scheduled_tasks_status',
        fields: ['status']
      },
      {
        name: 'idx_scheduled_tasks_next_execution',
        fields: ['next_execution']
      },
      {
        name: 'idx_scheduled_tasks_task_type',
        fields: ['task_type']
      },
      {
        name: 'idx_scheduled_tasks_created_at',
        fields: ['created_at']
      },
      {
        name: 'idx_scheduled_tasks_status_next_execution',
        fields: ['status', 'next_execution']
      }
    ],
    hooks: {
      beforeCreate: (scheduledTask) => {
        // 创建前验证Cron表达式
        const cron = require('node-cron')
        if (!cron.validate(scheduledTask.cron_expression)) {
          throw new Error(`无效的Cron表达式: ${scheduledTask.cron_expression}`)
        }
      },
      beforeUpdate: (scheduledTask) => {
        // 更新前验证Cron表达式（如果有变更）
        if (scheduledTask.changed('cron_expression')) {
          const cron = require('node-cron')
          if (!cron.validate(scheduledTask.cron_expression)) {
            throw new Error(`无效的Cron表达式: ${scheduledTask.cron_expression}`)
          }
        }
      }
    }
  })

  // 定义关联关系
  ScheduledTask.associate = function (models) {
    // 与用户表的关联（创建者）
    ScheduledTask.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator',
      onDelete: 'SET NULL'
    })
  }

  // 实例方法
  ScheduledTask.prototype.toJSON = function () {
    const values = Object.assign({}, this.get())

    // 格式化时间字段
    if (values.created_at) {
      values.created_at = new Date(values.created_at).toISOString()
    }
    if (values.updated_at) {
      values.updated_at = new Date(values.updated_at).toISOString()
    }
    if (values.last_execution) {
      values.last_execution = new Date(values.last_execution).toISOString()
    }
    if (values.next_execution) {
      values.next_execution = new Date(values.next_execution).toISOString()
    }

    return values
  }

  // 类方法
  ScheduledTask.findActiveTasks = function () {
    return this.findAll({
      where: { status: 'active' },
      order: [['created_at', 'ASC']]
    })
  }

  ScheduledTask.findTasksByType = function (taskType) {
    return this.findAll({
      where: { task_type: taskType },
      order: [['created_at', 'DESC']]
    })
  }

  ScheduledTask.getTaskStatistics = function () {
    return sequelize.query(`
      SELECT 
        status,
        COUNT(*) as count,
        AVG(last_duration_ms) as avg_duration,
        MAX(last_execution) as last_execution
      FROM scheduled_tasks 
      GROUP BY status
    `, {
      type: sequelize.QueryTypes.SELECT
    })
  }

  return ScheduledTask
}
