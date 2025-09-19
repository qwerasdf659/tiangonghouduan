/**
 * V4统一抽奖引擎执行日志模型
 * 记录所有抽奖执行的详细日志信息
 *
 * @description 抽奖执行日志表模型，支持性能监控和问题追踪
 * @version 4.0.0
 * @date 2025-09-11
 */

const { DataTypes } = require('sequelize')
const moment = require('moment-timezone')

module.exports = sequelize => {
  const LotteryExecutionLog = sequelize.define(
    'LotteryExecutionLog',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '执行日志ID'
      },
      execution_id: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: {
            msg: '执行ID不能为空'
          },
          len: {
            args: [10, 100],
            msg: '执行ID长度必须在10-100字符之间'
          }
        },
        comment: '执行唯一标识'
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          isInt: {
            msg: '用户ID必须是整数'
          },
          min: {
            args: [1],
            msg: '用户ID必须大于0'
          }
        },
        comment: '用户ID'
      },
      activity_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          isInt: {
            msg: '活动ID必须是整数'
          },
          min: {
            args: [1],
            msg: '活动ID必须大于0'
          }
        },
        comment: '活动ID'
      },
      strategy_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          notEmpty: {
            msg: '策略类型不能为空'
          },
          isIn: {
            args: [['basic_lottery', 'guarantee', 'management']],
            msg: '无效的策略类型'
          }
        },
        comment: '使用的策略类型'
      },
      pool_type: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
          isIn: {
            args: [['basic', null]], // ✅ V4简化：只保留基础奖池类型
            msg: '无效的奖池类型'
          }
        },
        comment: '奖池类型（多池系统使用）'
      },
      execution_params: {
        type: DataTypes.JSON,
        allowNull: false,
        validate: {
          isValidParams (value) {
            if (!value || typeof value !== 'object') {
              throw new Error('执行参数必须是有效的JSON对象')
            }
            // 验证必需参数
            if (!value.user_id || !value.activity_id) {
              throw new Error('执行参数必须包含user_id和activity_id')
            }
          }
        },
        get () {
          const rawValue = this.getDataValue('execution_params')
          return rawValue || {}
        },
        comment: '执行参数'
      },
      execution_result: {
        type: DataTypes.JSON,
        allowNull: false,
        validate: {
          isValidResult (value) {
            if (!value || typeof value !== 'object') {
              throw new Error('执行结果必须是有效的JSON对象')
            }
            // 验证结果结构
            if (value.success === undefined) {
              throw new Error('执行结果必须包含success字段')
            }
          }
        },
        get () {
          const rawValue = this.getDataValue('execution_result')
          return rawValue || {}
        },
        comment: '执行结果'
      },
      execution_time: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false,
        validate: {
          isDecimal: {
            msg: '执行时间必须是数字'
          },
          min: {
            args: [0],
            msg: '执行时间不能为负数'
          }
        },
        get () {
          const value = this.getDataValue('execution_time')
          return parseFloat(value) || 0
        },
        comment: '执行时间（毫秒）'
      },
      success: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        validate: {
          isBoolean: {
            msg: '执行成功状态必须是布尔值'
          }
        },
        comment: '是否执行成功'
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
        validate: {
          len: {
            args: [0, 5000],
            msg: '错误信息长度不能超过5000字符'
          }
        },
        comment: '错误信息'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        get () {
          return moment(this.getDataValue('created_at'))
            .tz('Asia/Shanghai')
            .format('YYYY-MM-DD HH:mm:ss')
        },
        comment: '创建时间（北京时间）'
      }
    },
    {
      tableName: 'lottery_execution_logs',
      comment: 'V4抽奖执行日志表',
      indexes: [
        {
          unique: false,
          fields: ['user_id', 'strategy_type']
        },
        {
          unique: false,
          fields: ['execution_id']
        },
        {
          unique: false,
          fields: ['created_at']
        },
        {
          unique: false,
          fields: ['success']
        },
        {
          unique: false,
          fields: ['strategy_type']
        }
      ],
      hooks: {
        beforeCreate: (instance, _options) => {
          const now = moment().tz('Asia/Shanghai').toDate()
          instance.created_at = now
        }
      }
    }
  )

  /**
   * 模型关联定义
   */
  LotteryExecutionLog.associate = function (models) {
    // 与用户表的关联
    if (models.User) {
      LotteryExecutionLog.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user'
      })
    }

    // 与活动表的关联
    if (models.LotteryCampaign) {
      LotteryExecutionLog.belongsTo(models.LotteryCampaign, {
        foreignKey: 'activity_id',
        as: 'campaign'
      })
    }

    // 与引擎配置的关联
    if (models.LotteryEngineConfig) {
      LotteryExecutionLog.belongsTo(models.LotteryEngineConfig, {
        foreignKey: 'strategy_type',
        targetKey: 'strategy_type',
        as: 'engine_config'
      })
    }
  }

  /**
   * 实例方法
   */

  /**
   * 获取执行摘要信息
   * @returns {Object} 执行摘要
   */
  LotteryExecutionLog.prototype.getExecutionSummary = function () {
    const result = this.execution_result || {}
    return {
      execution_id: this.execution_id,
      user_id: this.user_id,
      strategy_type: this.strategy_type,
      pool_type: this.pool_type,
      success: this.success,
      execution_time: this.execution_time,
      won_prize: result.prize_won || false,
      prize_info: result.prize || null,
      points_cost: result.points_cost || 0,
      created_at: this.created_at,
      error_message: this.error_message
    }
  }

  /**
   * 判断是否为长时间执行
   * @param {number} threshold - 阈值（毫秒），默认5000ms
   * @returns {boolean} 是否为长时间执行
   */
  LotteryExecutionLog.prototype.isLongExecution = function (threshold = 5000) {
    return parseFloat(this.execution_time) > threshold
  }

  /**
   * 获取执行性能等级
   * @returns {string} 性能等级：excellent, good, fair, poor
   */
  LotteryExecutionLog.prototype.getPerformanceLevel = function () {
    const time = parseFloat(this.execution_time)
    if (time < 100) return 'excellent'
    if (time < 500) return 'good'
    if (time < 2000) return 'fair'
    return 'poor'
  }

  /**
   * 静态方法
   */

  /**
   * 根据执行ID获取日志
   * @param {string} executionId - 执行ID
   * @returns {Promise<LotteryExecutionLog|null>} 日志实例
   */
  LotteryExecutionLog.getByExecutionId = function (executionId) {
    return this.findOne({
      where: { execution_id: executionId }
    })
  }

  /**
   * 获取用户执行历史
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Array<LotteryExecutionLog>>} 执行历史
   */
  LotteryExecutionLog.getUserExecutionHistory = function (userId, options = {}) {
    const { strategy_type, success, limit = 50, offset = 0, start_date, end_date } = options

    const where = { user_id: userId }
    if (strategy_type) where.strategy_type = strategy_type
    if (success !== undefined) where.success = success
    if (start_date || end_date) {
      where.created_at = {}
      if (start_date) where.created_at[sequelize.Sequelize.Op.gte] = start_date
      if (end_date) where.created_at[sequelize.Sequelize.Op.lte] = end_date
    }

    return this.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset
    })
  }

  /**
   * 获取策略执行统计
   * @param {string} strategyType - 策略类型
   * @param {Date} startDate - 开始时间
   * @param {Date} endDate - 结束时间
   * @returns {Promise<Object>} 统计结果
   */
  LotteryExecutionLog.getStrategyStats = async function (strategyType, startDate, endDate) {
    const where = { strategy_type: strategyType }
    if (startDate || endDate) {
      where.created_at = {}
      if (startDate) where.created_at[sequelize.Sequelize.Op.gte] = startDate
      if (endDate) where.created_at[sequelize.Sequelize.Op.lte] = endDate
    }

    const [totalResult, successResult, avgTimeResult] = await Promise.all([
      // 总执行次数
      this.count({ where }),
      // 成功次数
      this.count({ where: { ...where, success: true } }),
      // 平均执行时间
      this.findOne({
        where,
        attributes: [
          [sequelize.fn('AVG', sequelize.col('execution_time')), 'avg_time'],
          [sequelize.fn('MIN', sequelize.col('execution_time')), 'min_time'],
          [sequelize.fn('MAX', sequelize.col('execution_time')), 'max_time']
        ],
        raw: true
      })
    ])

    const total = totalResult || 0
    const success = successResult || 0

    return {
      strategy_type: strategyType,
      total_executions: total,
      successful_executions: success,
      success_rate: total > 0 ? ((success / total) * 100).toFixed(2) : 0,
      average_time: parseFloat(avgTimeResult?.avg_time || 0).toFixed(3),
      min_time: parseFloat(avgTimeResult?.min_time || 0).toFixed(3),
      max_time: parseFloat(avgTimeResult?.max_time || 0).toFixed(3),
      time_period: {
        start: startDate,
        end: endDate
      }
    }
  }

  /**
   * 获取性能监控数据
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 性能监控数据
   */
  LotteryExecutionLog.getPerformanceMetrics = async function (options = {}) {
    const {
      strategy_type,
      time_period = '1hour', // 1hour, 1day, 1week
      limit = 100
    } = options

    let timeThreshold
    const now = new Date()
    switch (time_period) {
    case '1hour':
      timeThreshold = new Date(now.getTime() - 60 * 60 * 1000)
      break
    case '1day':
      timeThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      break
    case '1week':
      timeThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    default:
      timeThreshold = new Date(now.getTime() - 60 * 60 * 1000)
    }

    const where = {
      created_at: { [sequelize.Sequelize.Op.gte]: timeThreshold }
    }
    if (strategy_type) where.strategy_type = strategy_type

    const [logs, slowLogs, errorLogs] = await Promise.all([
      // 所有执行记录
      this.findAll({
        where,
        order: [['created_at', 'DESC']],
        limit
      }),
      // 慢执行记录
      this.findAll({
        where: {
          ...where,
          execution_time: { [sequelize.Sequelize.Op.gt]: 5000 }
        },
        order: [['execution_time', 'DESC']],
        limit: 20
      }),
      // 错误执行记录
      this.findAll({
        where: {
          ...where,
          success: false
        },
        order: [['created_at', 'DESC']],
        limit: 20
      })
    ])

    return {
      time_period,
      strategy_type,
      total_logs: logs.length,
      performance_distribution: this.calculatePerformanceDistribution(logs),
      slow_executions: slowLogs.map(log => log.getExecutionSummary()),
      error_executions: errorLogs.map(log => log.getExecutionSummary()),
      recommendations: this.generatePerformanceRecommendations(logs)
    }
  }

  /**
   * 计算性能分布
   * @param {Array<LotteryExecutionLog>} logs - 执行日志数组
   * @returns {Object} 性能分布统计
   */
  LotteryExecutionLog.calculatePerformanceDistribution = function (logs) {
    const distribution = {
      excellent: 0, // < 100ms
      good: 0, // 100ms - 500ms
      fair: 0, // 500ms - 2000ms
      poor: 0 // > 2000ms
    }

    logs.forEach(log => {
      const level = log.getPerformanceLevel()
      distribution[level]++
    })

    const total = logs.length
    return {
      ...distribution,
      percentages: {
        excellent: total > 0 ? ((distribution.excellent / total) * 100).toFixed(2) : 0,
        good: total > 0 ? ((distribution.good / total) * 100).toFixed(2) : 0,
        fair: total > 0 ? ((distribution.fair / total) * 100).toFixed(2) : 0,
        poor: total > 0 ? ((distribution.poor / total) * 100).toFixed(2) : 0
      }
    }
  }

  /**
   * 生成性能改进建议
   * @param {Array<LotteryExecutionLog>} logs - 执行日志数组
   * @returns {Array<string>} 改进建议列表
   */
  LotteryExecutionLog.generatePerformanceRecommendations = function (logs) {
    const recommendations = []
    const totalLogs = logs.length

    if (totalLogs === 0) return recommendations

    const slowLogs = logs.filter(log => log.isLongExecution(2000))
    const errorLogs = logs.filter(log => !log.success)
    const avgTime = logs.reduce((sum, log) => sum + parseFloat(log.execution_time), 0) / totalLogs

    if (slowLogs.length > totalLogs * 0.1) {
      recommendations.push('存在较多慢执行记录，建议优化算法性能或增加缓存机制')
    }

    if (errorLogs.length > totalLogs * 0.05) {
      recommendations.push('错误率较高，建议检查错误处理逻辑和输入参数验证')
    }

    if (avgTime > 1000) {
      recommendations.push('平均执行时间较长，建议进行性能优化')
    }

    const strategyStats = {}
    logs.forEach(log => {
      if (!strategyStats[log.strategy_type]) {
        strategyStats[log.strategy_type] = []
      }
      strategyStats[log.strategy_type].push(parseFloat(log.execution_time))
    })

    Object.keys(strategyStats).forEach(strategy => {
      const times = strategyStats[strategy]
      const avgStrategyTime = times.reduce((sum, time) => sum + time, 0) / times.length
      if (avgStrategyTime > 2000) {
        recommendations.push(`${strategy}策略执行时间偏长，建议针对性优化`)
      }
    })

    if (recommendations.length === 0) {
      recommendations.push('系统性能表现良好，继续保持')
    }

    return recommendations
  }

  return LotteryExecutionLog
}
