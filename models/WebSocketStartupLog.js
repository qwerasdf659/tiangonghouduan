/**
 * 餐厅积分抽奖系统 V4.0 - WebSocket服务启动日志模型（WebSocketStartupLog）
 *
 * 功能说明：
 * - 记录WebSocket服务的启动、停止事件
 * - 用于审计和稳定性分析
 * - 支持uptime运行时长计算
 * - 记录服务重启历史
 *
 * 业务场景：
 * - 客服聊天系统监控（实时显示在线客服数，合理分配客服资源）
 * - 系统健康检查（监控WebSocket服务是否正常，服务挂了立即告警）
 * - 管理后台仪表板（展示在线用户数、客服数、服务运行时长）
 * - 负载评估决策（当连接数>4000时触发扩容告警）
 * - 服务稳定性监控（uptime<1小时且之前>10小时=频繁重启=服务不稳定）
 * - SLA统计（服务可用性统计，99.5%目标）
 *
 * 设计模式：
 * - 与AdminOperationLog、RoleChangeLog保持一致
 * - 数据持久化：永久保存启动/停止记录
 * - 审计追踪：记录服务启动时间、停止时间、运行时长
 * - 不可删除：只能创建和更新（与AdminOperationLog一致）
 *
 * 创建时间：2025-01-08
 * 最后更新：2025-01-08
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const WebSocketStartupLog = sequelize.define(
    'WebSocketStartupLog',
    {
      // 主键
      websocket_startup_log_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '日志ID（主键）'
      },

      // 启动信息
      start_time: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '服务启动时间（北京时间）',
        /**
         * 获取格式化后的服务启动时间（北京时间）
         *
         * @returns {string|null} 格式化后的时间字符串；无值返回 null
         */
        get() {
          const rawValue = this.getDataValue('start_time')
          return rawValue ? BeijingTimeHelper.formatChinese(rawValue) : null
        }
      },
      process_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '进程ID（process.pid）'
      },
      server_ip: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '服务器IP地址'
      },
      server_hostname: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '服务器主机名'
      },

      // 状态信息
      status: {
        type: DataTypes.ENUM('running', 'stopped', 'crashed'),
        defaultValue: 'running',
        comment: '服务状态：running-运行中，stopped-正常停止，crashed-异常崩溃'
      },
      stop_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '服务停止时间（北京时间）',
        /**
         * 获取格式化后的服务停止时间（北京时间）
         *
         * @returns {string|null} 格式化后的时间字符串；无值返回 null
         */
        get() {
          const rawValue = this.getDataValue('stop_time')
          return rawValue ? BeijingTimeHelper.formatChinese(rawValue) : null
        }
      },
      stop_reason: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '停止原因（如：部署、重启、崩溃等）'
      },

      // 运行时长（冗余字段，方便查询）
      uptime_seconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '运行时长（秒），stop_time - start_time'
      },

      // 连接统计（停止时记录）
      peak_connections: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '峰值连接数（服务运行期间的最大连接数）'
      },
      total_messages: {
        type: DataTypes.BIGINT,
        defaultValue: 0,
        comment: '总消息数（服务运行期间的总消息数）'
      },

      // 审计信息（与AdminOperationLog保持一致）
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '记录创建时间（北京时间）',
        /**
         * 获取格式化后的记录创建时间（北京时间）
         *
         * @returns {string|null} 格式化后的时间字符串；无值返回 null
         */
        get() {
          const rawValue = this.getDataValue('created_at')
          return rawValue ? BeijingTimeHelper.formatChinese(rawValue) : null
        }
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '记录更新时间（服务停止时更新）',
        /**
         * 获取格式化后的记录更新时间（北京时间）
         *
         * @returns {string|null} 格式化后的时间字符串；无值返回 null
         */
        get() {
          const rawValue = this.getDataValue('updated_at')
          return rawValue ? BeijingTimeHelper.formatChinese(rawValue) : null
        }
      }
    },
    {
      sequelize,
      modelName: 'WebSocketStartupLog',
      tableName: 'websocket_startup_logs',
      timestamps: true, // 支持created_at和updated_at
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: 'WebSocket服务启动日志表（记录所有启动/停止事件）',

      indexes: [
        { name: 'idx_start_time', fields: ['start_time'], comment: '启动时间索引' },
        { name: 'idx_status', fields: ['status'], comment: '状态索引' },
        { name: 'idx_created_at', fields: ['created_at'], comment: '创建时间索引' },
        { name: 'idx_process_id', fields: ['process_id'], comment: '进程ID索引' }
      ],

      hooks: {
        beforeCreate: record => {
          record.created_at = BeijingTimeHelper.createDatabaseTime()
          record.start_time = BeijingTimeHelper.createDatabaseTime()
        },
        beforeUpdate: record => {
          record.updated_at = BeijingTimeHelper.createDatabaseTime()

          // 计算运行时长（如果stop_time存在）
          if (record.stop_time && record.start_time) {
            const start = new Date(record.start_time).getTime()
            const stop = new Date(record.stop_time).getTime()
            record.uptime_seconds = Math.floor((stop - start) / 1000)
          }
        }
      }
    }
  )

  /**
   * 实例方法：获取运行时长描述
   * @returns {String} 运行时长描述（如："12小时30分钟"）
   */
  WebSocketStartupLog.prototype.getUptimeDescription = function () {
    if (!this.uptime_seconds) return '运行中'

    const hours = Math.floor(this.uptime_seconds / 3600)
    const minutes = Math.floor((this.uptime_seconds % 3600) / 60)
    return `${hours}小时${minutes}分钟`
  }

  /**
   * 实例方法：获取状态描述
   * @returns {String} 状态描述（如："运行中"）
   */
  WebSocketStartupLog.prototype.getStatusDescription = function () {
    const statusMap = {
      running: '运行中',
      stopped: '已停止',
      crashed: '异常崩溃'
    }
    return statusMap[this.status] || '未知'
  }

  /**
   * 类方法：记录服务启动
   * @param {Object} serverInfo - 服务器信息 {ip, hostname}
   * @returns {Promise<WebSocketStartupLog>} 创建的启动日志记录
   */
  WebSocketStartupLog.recordStartup = async function (serverInfo = {}) {
    return await WebSocketStartupLog.create({
      start_time: BeijingTimeHelper.createDatabaseTime(),
      process_id: process.pid.toString(),
      server_ip: serverInfo.ip || null,
      server_hostname: serverInfo.hostname || require('os').hostname(),
      status: 'running'
    })
  }

  /**
   * 类方法：记录服务停止
   * @param {Number} logId - 启动日志ID
   * @param {Object} stopInfo - 停止信息 {reason, crashed, peak_connections, total_messages}
   * @returns {Promise<WebSocketStartupLog>} 更新后的启动日志记录
   */
  WebSocketStartupLog.recordStop = async function (logId, stopInfo = {}) {
    const log = await WebSocketStartupLog.findByPk(logId)
    if (!log) throw new Error(`启动日志不存在: ${logId}`)

    await log.update({
      status: stopInfo.crashed ? 'crashed' : 'stopped',
      stop_time: BeijingTimeHelper.createDatabaseTime(),
      stop_reason: stopInfo.reason || '正常停止',
      peak_connections: stopInfo.peak_connections || 0,
      total_messages: stopInfo.total_messages || 0
    })

    return log
  }

  /**
   * 类方法：获取当前运行中的服务
   * @returns {Promise<WebSocketStartupLog|null>} 当前运行中的服务日志
   */
  WebSocketStartupLog.getCurrentRunning = async function () {
    return await WebSocketStartupLog.findOne({
      where: { status: 'running' },
      order: [['start_time', 'DESC']]
    })
  }

  /**
   * 类方法：获取历史启动记录
   * @param {Number} limit - 返回记录数量（默认10条）
   * @returns {Promise<Array<WebSocketStartupLog>>} 历史启动记录列表
   */
  WebSocketStartupLog.getHistory = async function (limit = 10) {
    return await WebSocketStartupLog.findAll({
      order: [['start_time', 'DESC']],
      limit
    })
  }

  return WebSocketStartupLog
}
