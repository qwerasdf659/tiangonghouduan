/**
 * 🔥 任务进度记录模型 v3.0
 */

'use strict'

module.exports = (sequelize, DataTypes) => {
  const TaskProgressLog = sequelize.define('TaskProgressLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: '进度记录ID'
    },
    task_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '任务ID'
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '用户ID'
    },
    action_type: {
      type: DataTypes.ENUM('progress', 'bonus', 'penalty', 'reset', 'complete'),
      allowNull: false,
      comment: '操作类型'
    },
    progress_before: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '操作前进度'
    },
    progress_after: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '操作后进度'
    },
    change_amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '变化量'
    },
    trigger_source: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: '触发来源'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '变化描述'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '相关元数据'
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: '记录时间'
    }
  }, {
    tableName: 'task_progress_logs',
    timestamps: false,
    comment: '任务进度记录表'
  })

  TaskProgressLog.associate = function (models) {
    TaskProgressLog.belongsTo(models.UserTask, {
      foreignKey: 'task_id',
      targetKey: 'task_id',
      as: 'task'
    })

    TaskProgressLog.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })
  }

  return TaskProgressLog
}
