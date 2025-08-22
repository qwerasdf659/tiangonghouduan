const { DataTypes, Model } = require('sequelize')

// 🔥 业务事件模型 - 跨模块通信机制
class BusinessEvent extends Model {
  static associate (models) {
    // 关联到用户
    BusinessEvent.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })
  }

  // 获取事件类型名称
  getEventTypeName () {
    const types = {
      points_earned: '积分获得',
      points_consumed: '积分消费',
      points_expired: '积分过期',
      points_refunded: '积分退还',
      lottery_drawn: '抽奖参与',
      lottery_won: '抽奖中奖',
      prize_delivered: '奖品发放',
      user_registered: '用户注册',
      user_login: '用户登录',
      system_operation: '系统操作'
    }
    return types[this.event_type] || '未知事件'
  }

  // 获取事件状态名称
  getEventStatusName () {
    const statuses = {
      pending: '待处理',
      processing: '处理中',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消'
    }
    return statuses[this.event_status] || '未知状态'
  }

  // 检查事件是否完成
  isCompleted () {
    return this.event_status === 'completed'
  }

  // 检查事件是否失败
  isFailed () {
    return this.event_status === 'failed'
  }

  // 更新事件状态
  async updateStatus (status, notes = null, transaction = null) {
    const updateData = {
      event_status: status,
      updated_at: new Date()
    }

    if (notes) {
      updateData.processing_notes = notes
    }

    if (status === 'processing') {
      updateData.processing_time = new Date()
    } else if (status === 'completed') {
      updateData.completed_time = new Date()
    } else if (status === 'failed') {
      updateData.failed_time = new Date()
    }

    await this.update(updateData, { transaction })
  }

  // 获取事件摘要信息
  toSummary () {
    return {
      event_id: this.event_id,
      event_type: this.event_type,
      event_type_name: this.getEventTypeName(),
      event_status: this.event_status,
      event_status_name: this.getEventStatusName(),
      user_id: this.user_id,
      event_time: this.event_time,
      is_completed: this.isCompleted(),
      is_failed: this.isFailed(),
      event_data: this.event_data
    }
  }

  // 验证事件数据
  static validateEvent (data) {
    const errors = []

    const validTypes = [
      'points_earned',
      'points_consumed',
      'points_expired',
      'points_refunded',
      'lottery_drawn',
      'lottery_won',
      'prize_delivered',
      'user_registered',
      'user_login',
      'system_operation'
    ]

    if (!data.event_type || !validTypes.includes(data.event_type)) {
      errors.push('事件类型无效')
    }

    if (data.user_id !== null && data.user_id !== undefined && data.user_id <= 0) {
      errors.push('用户ID无效')
    }

    return errors
  }

  // 创建业务事件
  static async createEvent (eventData, transaction = null) {
    const errors = BusinessEvent.validateEvent(eventData)
    if (errors.length > 0) {
      throw new Error(`事件数据验证失败: ${errors.join(', ')}`)
    }

    const event = await BusinessEvent.create(
      {
        event_type: eventData.event_type,
        user_id: eventData.user_id || null,
        event_data: eventData.event_data || {},
        event_time: new Date(),
        event_status: 'pending',
        source_module: eventData.source_module || 'unknown',
        correlation_id: eventData.correlation_id || null
      },
      { transaction }
    )

    return event
  }

  // 批量统计事件数据
  static async batchAnalyze (conditions = {}) {
    const baseWhere = { ...conditions }

    const [totalEvents, statusStats, typeStats] = await Promise.all([
      // 总事件数
      BusinessEvent.count({ where: baseWhere }),

      // 按状态统计
      BusinessEvent.findAll({
        attributes: [
          'event_status',
          [BusinessEvent.sequelize.fn('COUNT', BusinessEvent.sequelize.col('*')), 'count']
        ],
        where: baseWhere,
        group: ['event_status'],
        raw: true
      }),

      // 按类型统计
      BusinessEvent.findAll({
        attributes: [
          'event_type',
          [BusinessEvent.sequelize.fn('COUNT', BusinessEvent.sequelize.col('*')), 'count']
        ],
        where: baseWhere,
        group: ['event_type'],
        raw: true
      })
    ])

    return {
      total_events: totalEvents,
      status_stats: statusStats.reduce((acc, stat) => {
        acc[stat.event_status] = parseInt(stat.count)
        return acc
      }, {}),
      type_stats: typeStats.reduce((acc, stat) => {
        acc[stat.event_type] = parseInt(stat.count)
        return acc
      }, {})
    }
  }
}

module.exports = sequelize => {
  BusinessEvent.init(
    {
      event_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '事件唯一标识'
      },
      event_type: {
        type: DataTypes.ENUM(
          'points_earned',
          'points_consumed',
          'points_expired',
          'points_refunded',
          'lottery_drawn',
          'lottery_won',
          'prize_delivered',
          'user_registered',
          'user_login',
          'system_operation',
          'behavior_tracked',
          'recommendation_generated',
          'recommendation_clicked',
          'activity_detected',
          'preference_updated',
          'user_levelup',
          'prize_awarded'
        ),
        allowNull: false,
        comment: '事件类型'
      },
      event_source: {
        type: DataTypes.ENUM(
          'points_system',
          'lottery_system',
          'user_system',
          'admin_system',
          'behavior_system',
          'recommendation_system'
        ),
        allowNull: false,
        comment: '事件来源系统'
      },
      event_target: {
        type: DataTypes.ENUM(
          'points_system',
          'lottery_system',
          'user_system',
          'notification_system',
          'behavior_system',
          'recommendation_system',
          'analytics_system'
        ),
        allowNull: false,
        comment: '事件目标系统'
      },
      user_id: {
        type: DataTypes.INTEGER,
        comment: '关联用户ID（系统事件可为NULL）'
      },
      event_data: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '事件详细数据（JSON格式）'
      },
      correlation_id: {
        type: DataTypes.STRING(64),
        comment: '关联ID'
      },
      session_id: {
        type: DataTypes.STRING(64),
        comment: '会话ID'
      },
      device_info: {
        type: DataTypes.JSON,
        comment: '设备信息'
      },
      page_context: {
        type: DataTypes.JSON,
        comment: '页面上下文'
      },
      behavior_tags: {
        type: DataTypes.JSON,
        comment: '行为标签'
      },
      user_agent: {
        type: DataTypes.STRING(500),
        comment: '用户代理'
      },
      retry_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '重试次数'
      },
      max_retry_count: {
        type: DataTypes.INTEGER,
        defaultValue: 3,
        comment: '最大重试次数'
      },
      process_time: {
        type: DataTypes.DATE,
        comment: '处理时间'
      },
      complete_time: {
        type: DataTypes.DATE,
        comment: '完成时间'
      },
      next_retry_time: {
        type: DataTypes.DATE,
        comment: '下次重试时间'
      },
      process_result: {
        type: DataTypes.JSON,
        comment: '处理结果'
      },
      error_message: {
        type: DataTypes.TEXT,
        comment: '错误消息'
      },
      event_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '事件发生时间'
      },
      event_status: {
        type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '事件处理状态'
      },
      source_module: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: 'unknown',
        comment: '事件来源模块'
      },

      processing_time: {
        type: DataTypes.INTEGER,
        comment: '处理耗时（毫秒）'
      },
      completed_time: {
        type: DataTypes.DATE,
        comment: '完成处理时间'
      },
      failed_time: {
        type: DataTypes.DATE,
        comment: '失败时间'
      },
      processing_notes: {
        type: DataTypes.TEXT,
        comment: '处理备注'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      sequelize,
      modelName: 'BusinessEvent',
      tableName: 'business_events',
      timestamps: true,
      underscored: true,
      comment: '业务事件表',
      indexes: [
        {
          fields: ['event_type', 'event_time'],
          name: 'idx_be_type_time'
        },
        {
          fields: ['user_id', 'event_time'],
          name: 'idx_be_user_time'
        },
        {
          fields: ['event_status', 'event_time'],
          name: 'idx_be_status_time'
        },
        {
          fields: ['source_module', 'event_time'],
          name: 'idx_be_module_time'
        },
        {
          fields: ['correlation_id'],
          name: 'idx_be_correlation'
        }
      ]
    }
  )

  return BusinessEvent
}
