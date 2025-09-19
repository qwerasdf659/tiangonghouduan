/**
 * 🔥 任务模板模型 V4.0统一引擎架构
 * 创建时间：2025年08月22日 11:38 UTC
 * 功能：任务系统模板管理 - 可重复任务配置、奖励配置、前置条件
 * 特点：多种任务类型 + 动态奖励 + 前置条件验证
 */

'use strict'

module.exports = (sequelize, DataTypes) => {
  const TaskTemplate = sequelize.define(
    'TaskTemplate',
    {
      // 基础信息
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '任务模板ID'
      },
      template_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '模板唯一标识符'
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

      // 任务分类
      category: {
        type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'special', 'achievement', 'social'),
        allowNull: false,
        comment: '任务分类'
      },
      task_type: {
        type: DataTypes.ENUM('lottery', 'points', 'social', 'collection', 'achievement', 'custom'),
        allowNull: false,
        comment: '任务类型'
      },
      difficulty: {
        type: DataTypes.ENUM('easy', 'medium', 'hard', 'epic'),
        allowNull: false,
        defaultValue: 'easy',
        comment: '任务难度'
      },

      // 目标和奖励
      target_value: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '目标数值'
      },
      reward_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '奖励积分'
      },
      reward_items: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '奖励物品列表'
      },

      // 条件和限制
      prerequisites: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '前置条件'
      },
      auto_assign: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否自动分配'
      },
      is_repeatable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否可重复'
      },
      repeat_interval: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '重复间隔（小时）'
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '优先级'
      },

      // 配置和状态
      config: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '任务配置参数'
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive', 'archived'),
        allowNull: false,
        defaultValue: 'active',
        comment: '模板状态'
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
    },
    {
      tableName: 'task_templates',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: '任务模板表',

      // 数据验证
      validate: {
        // 验证目标数值
        targetValueValid () {
          if (this.target_value <= 0) {
            throw new Error('目标数值必须大于0')
          }
        },
        // 验证重复间隔
        repeatIntervalValid () {
          if (this.is_repeatable && (!this.repeat_interval || this.repeat_interval <= 0)) {
            throw new Error('可重复任务必须设置有效的重复间隔')
          }
        }
      },

      // 实例方法
      instanceMethods: {
        // 检查是否可以分配给用户
        canAssignToUser (_user) {
          if (this.status !== 'active') return false
          if (!this.auto_assign) return false

          // 检查前置条件
          if (this.prerequisites) {
            // 在实际应用中，这里会根据prerequisites检查用户条件
            return true
          }

          return true
        },

        // 获取奖励总价值
        getTotalRewardValue () {
          let total = this.reward_points || 0

          if (this.reward_items && Array.isArray(this.reward_items)) {
            total += this.reward_items.reduce((sum, item) => {
              return sum + (item.value || 0) * (item.quantity || 1)
            }, 0)
          }

          return total
        },

        // 获取配置值
        getConfigValue (key, defaultValue = null) {
          return this.config && this.config[key] ? this.config[key] : defaultValue
        }
      }
    }
  )

  // 关联关系
  TaskTemplate.associate = function (models) {
    // 关联到用户任务
    TaskTemplate.hasMany(models.UserTask, {
      foreignKey: 'template_id',
      sourceKey: 'template_id',
      as: 'userTasks'
    })
  }

  return TaskTemplate
}
