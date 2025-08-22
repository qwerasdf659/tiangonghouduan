/**
 * 用户行为数据模型
 * 用于记录和分析用户在系统中的各种行为数据
 * 深度集成v3.0分离式架构，支持用户行为追踪和智能分析
 * 创建时间：2025年08月19日
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const AnalyticsBehavior = sequelize.define(
    'AnalyticsBehavior',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '行为记录ID'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID',
        validate: {
          notEmpty: true,
          isInt: true
        }
      },

      session_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: '会话ID',
        validate: {
          notEmpty: true,
          len: [10, 64]
        }
      },

      event_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '事件类型',
        validate: {
          notEmpty: true,
          isIn: {
            args: [
              [
                'page_view',
                'click',
                'draw',
                'earn_points',
                'consume_points',
                'login',
                'logout',
                'search',
                'share',
                'favorite'
              ]
            ],
            msg: '无效的事件类型'
          }
        }
      },

      event_data: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '事件详细数据',
        validate: {
          notEmpty: true,
          isValidJSON (value) {
            if (typeof value !== 'object' || value === null) {
              throw new Error('event_data必须是有效的JSON对象')
            }
          }
        }
      },

      // 页面信息
      page_path: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '页面路径',
        validate: {
          len: [0, 255]
        }
      },

      referrer_path: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '来源页面',
        validate: {
          len: [0, 255]
        }
      },

      // 设备和环境信息
      device_info: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '设备信息(浏览器/OS/屏幕等)'
      },

      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: 'IP地址（已脱敏处理）',
        validate: {
          len: [0, 45]
        }
      },

      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'User Agent字符串（已脱敏处理）'
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '行为发生时间'
      }
    },
    {
      tableName: 'analytics_behaviors',
      timestamps: false, // 只使用created_at
      underscored: true,
      indexes: [
        {
          name: 'idx_analytics_behaviors_user_time',
          fields: ['user_id', 'created_at']
        },
        {
          name: 'idx_analytics_behaviors_event_type',
          fields: ['event_type']
        },
        {
          name: 'idx_analytics_behaviors_session',
          fields: ['session_id']
        },
        {
          name: 'idx_analytics_behaviors_created_time',
          fields: ['created_at']
        }
      ],
      comment: '用户行为数据表'
    }
  )

  // 🔥 定义模型关联关系
  AnalyticsBehavior.associate = models => {
    // 🔥 关联现有用户模型
    AnalyticsBehavior.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE'
    })
  }

  /**
   * 🔥 获取用户特定时间范围的行为数据
   * @param {number} userId - 用户ID
   * @param {Date} startDate - 开始时间
   * @param {Date} endDate - 结束时间
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 行为数据列表
   */
  AnalyticsBehavior.getUserBehaviors = async function (userId, startDate, endDate, options = {}) {
    const { limit = 1000, eventTypes = null, include = [] } = options

    const whereClause = {
      user_id: userId,
      created_at: {
        [sequelize.Sequelize.Op.between]: [startDate, endDate]
      }
    }

    if (eventTypes && eventTypes.length > 0) {
      whereClause.event_type = {
        [sequelize.Sequelize.Op.in]: eventTypes
      }
    }

    return await this.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit,
      include
    })
  }

  /**
   * 🔥 获取热门事件类型统计
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 事件类型统计
   */
  AnalyticsBehavior.getPopularEventTypes = async function (options = {}) {
    const { limit = 10, timeRange = null } = options

    const whereClause = {}
    if (timeRange) {
      whereClause.created_at = {
        [sequelize.Sequelize.Op.gte]: timeRange
      }
    }

    return await this.findAll({
      attributes: ['event_type', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      where: whereClause,
      group: ['event_type'],
      order: [[sequelize.literal('count'), 'DESC']],
      limit,
      raw: true
    })
  }

  /**
   * 🔥 获取用户行为会话统计
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 会话统计数据
   */
  AnalyticsBehavior.getUserSessionStats = async function (userId, options = {}) {
    const { days = 7 } = options
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const sessionStats = await this.findAll({
      attributes: [
        'session_id',
        [sequelize.fn('COUNT', sequelize.col('id')), 'event_count'],
        [sequelize.fn('MIN', sequelize.col('created_at')), 'session_start'],
        [sequelize.fn('MAX', sequelize.col('created_at')), 'session_end']
      ],
      where: {
        user_id: userId,
        created_at: {
          [sequelize.Sequelize.Op.gte]: startDate
        }
      },
      group: ['session_id'],
      order: [['session_start', 'DESC']],
      raw: true
    })

    return {
      total_sessions: sessionStats.length,
      avg_events_per_session:
        sessionStats.length > 0
          ? Math.round(
            sessionStats.reduce((sum, s) => sum + parseInt(s.event_count), 0) /
                sessionStats.length
          )
          : 0,
      sessions: sessionStats
    }
  }

  /**
   * 🔥 批量创建行为记录（高性能）
   * @param {Array} behaviorsData - 行为数据数组
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<Array>} 创建的记录
   */
  AnalyticsBehavior.bulkCreateBehaviors = async function (behaviorsData, transaction = null) {
    const options = {
      validate: true,
      returning: true
    }

    if (transaction) {
      options.transaction = transaction
    }

    // 数据预处理和验证
    const processedData = behaviorsData.map(data => ({
      user_id: data.user_id,
      session_id: data.session_id,
      event_type: data.event_type.toLowerCase(),
      event_data: data.event_data,
      page_path: data.page_path || null,
      referrer_path: data.referrer_path || null,
      device_info: data.device_info || null,
      ip_address: data.ip_address || null,
      user_agent: data.user_agent || null,
      created_at: data.created_at || new Date()
    }))

    return await this.bulkCreate(processedData, options)
  }

  return AnalyticsBehavior
}
