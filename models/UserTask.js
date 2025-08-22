/**
 * 🔥 用户任务模型 v3.0
 * 创建时间：2025年08月22日 11:38 UTC
 * 功能：用户任务实例管理 - 任务分配、进度跟踪、奖励发放
 * 特点：实时进度计算 + 状态管理 + 过期处理
 */

'use strict'

module.exports = (sequelize, DataTypes) => {
  const UserTask = sequelize.define('UserTask', {
    // 基础信息
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: '用户任务ID'
    },
    task_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: '任务唯一标识符'
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '用户ID'
    },
    template_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '任务模板ID'
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
      comment: '任务标题'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '任务描述'
    },

    // 进度管理
    target_value: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '目标数值'
    },
    current_progress: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '当前进度'
    },
    completion_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0.0,
      comment: '完成百分比'
    },

    // 状态管理
    task_status: {
      type: DataTypes.ENUM('pending', 'active', 'completed', 'failed', 'expired', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
      comment: '任务状态'
    },

    // 时间管理
    assigned_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: '分配时间'
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '开始时间'
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '完成时间'
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '过期时间'
    },

    // 奖励管理
    reward_claimed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '是否已领取奖励'
    },
    reward_claimed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '奖励领取时间'
    },

    // 元数据
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '任务元数据'
    },

    // 时间戳
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: '创建时间'
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: '更新时间'
    }
  }, {
    tableName: 'user_tasks',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    comment: '用户任务表',

    // 数据验证
    validate: {
      // 验证进度数值
      progressValid () {
        if (this.current_progress < 0) {
          throw new Error('当前进度不能为负数')
        }
        if (this.current_progress > this.target_value) {
          throw new Error('当前进度不能超过目标数值')
        }
      },
      // 验证完成百分比
      percentageValid () {
        if (this.completion_percentage < 0 || this.completion_percentage > 100) {
          throw new Error('完成百分比必须在0-100之间')
        }
      }
    },

    // 钩子函数
    hooks: {
      // 保存前自动计算完成百分比
      beforeSave (task) {
        if (task.target_value > 0) {
          task.completion_percentage = (task.current_progress / task.target_value * 100).toFixed(2)
        }

        // 自动设置完成状态
        if (task.current_progress >= task.target_value && task.task_status === 'active') {
          task.task_status = 'completed'
          task.completed_at = new Date()
        }
      }
    },

    // 实例方法
    instanceMethods: {
      // 检查任务是否已过期
      isExpired () {
        if (!this.expires_at) return false
        return new Date() > this.expires_at
      },

      // 检查任务是否可以领取奖励
      canClaimReward () {
        return this.task_status === 'completed' && !this.reward_claimed
      },

      // 更新任务进度
      async updateProgress (amount, source = null) {
        const oldProgress = this.current_progress
        this.current_progress = Math.min(this.current_progress + amount, this.target_value)

        // 记录进度日志
        if (sequelize.models.TaskProgressLog) {
          await sequelize.models.TaskProgressLog.create({
            task_id: this.task_id,
            user_id: this.user_id,
            action_type: 'progress',
            progress_before: oldProgress,
            progress_after: this.current_progress,
            change_amount: amount,
            trigger_source: source,
            description: `任务进度更新：+${amount}`,
            metadata: {
              source,
              timestamp: new Date().toISOString()
            }
          })
        }

        await this.save()
        return this
      },

      // 获取剩余时间
      getTimeRemaining () {
        if (!this.expires_at) return null
        const now = new Date()
        if (this.expires_at <= now) return 0
        return Math.floor((this.expires_at - now) / 1000)
      },

      // 获取任务持续时间
      getDuration () {
        if (!this.started_at) return 0
        const endTime = this.completed_at || new Date()
        return Math.floor((endTime - this.started_at) / 1000)
      }
    }
  })

  // 关联关系
  UserTask.associate = function (models) {
    // 关联到用户
    UserTask.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    // 关联到任务模板
    UserTask.belongsTo(models.TaskTemplate, {
      foreignKey: 'template_id',
      targetKey: 'template_id',
      as: 'template'
    })

    // 关联到进度日志
    UserTask.hasMany(models.TaskProgressLog, {
      foreignKey: 'task_id',
      sourceKey: 'task_id',
      as: 'progressLogs'
    })
  }

  return UserTask
}
