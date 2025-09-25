/**
 * 统一日志工具类 - Winston增强版
 * 提供结构化的日志记录功能，替代分散的console输出
 *
 * @version 4.1.0
 * @date 2025-09-22
 * @enhancement 集成Winston，统一全项目日志管理
 */

const winston = require('winston')
const path = require('path')
const BeijingTimeHelper = require('../../../utils/timeHelper')

class Logger {
  constructor (module = 'System') {
    this.module = module
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    }
    this.currentLevel = process.env.LOG_LEVEL === 'debug' ? 3 : 2

    // 初始化Winston实例
    this.winstonLogger = this.createWinstonLogger()
  }

  /**
   * 创建Winston日志器实例
   * 支持控制台和文件双重输出
   */
  createWinstonLogger () {
    // 确保logs目录存在
    const logsDir = path.join(process.cwd(), 'logs')

    // 自定义日志格式 - 保持原有北京时间格式
    const customFormat = winston.format.combine(
      winston.format.timestamp({
        format: () => BeijingTimeHelper.nowLocale()
      }),
      winston.format.printf(({ timestamp, level, message, module, ...meta }) => {
        const prefix = `[${timestamp}] ${level.toUpperCase()}[${module || this.module}]:`
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta, null, 2)}` : ''
        return `${prefix} ${message}${metaStr}`
      })
    )

    // 控制台格式 - 添加颜色
    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      customFormat
    )

    return winston.createLogger({
      level: this.getWinstonLevel(),
      format: customFormat,
      transports: [
        // 控制台输出 - 彩色格式
        new winston.transports.Console({
          format: consoleFormat,
          level: this.getWinstonLevel()
        }),

        // 组合日志文件 - 所有级别
        new winston.transports.File({
          filename: path.join(logsDir, 'combined.log'),
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 10,
          format: customFormat
        }),

        // 错误日志文件 - 仅错误
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          format: customFormat
        }),

        // 模块专用日志文件
        new winston.transports.File({
          filename: path.join(logsDir, `${this.module.toLowerCase()}.log`),
          maxsize: 20 * 1024 * 1024, // 20MB
          maxFiles: 3,
          format: customFormat
        })
      ]
    })
  }

  /**
   * 转换内部日志级别到Winston级别
   */
  getWinstonLevel () {
    const levelMap = {
      0: 'error',
      1: 'warn',
      2: 'info',
      3: 'debug'
    }
    return levelMap[this.currentLevel] || 'info'
  }

  /**
   * 格式化日志输出 - 使用Winston替代console
   * 保持原有接口兼容性
   */
  formatLog (level, message, data = {}) {
    const timestamp = BeijingTimeHelper.nowLocale()
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      module: this.module,
      message,
      ...data
    }

    // 使用Winston输出，替代原有的console.log
    this.winstonLogger[level](message, {
      module: this.module,
      ...data
    })

    return logEntry
  }

  /**
   * 错误级别日志
   */
  error (message, data = {}) {
    if (this.currentLevel >= this.levels.error) {
      return this.formatLog('error', message, data)
    }
  }

  /**
   * 警告级别日志
   */
  warn (message, data = {}) {
    if (this.currentLevel >= this.levels.warn) {
      return this.formatLog('warn', message, data)
    }
  }

  /**
   * 信息级别日志
   */
  info (message, data = {}) {
    if (this.currentLevel >= this.levels.info) {
      return this.formatLog('info', message, data)
    }
  }

  /**
   * 调试级别日志
   */
  debug (message, data = {}) {
    if (this.currentLevel >= this.levels.debug) {
      return this.formatLog('debug', message, data)
    }
  }

  /**
   * 静态方法：获取全局日志器实例
   * 方便在其他模块中直接使用
   */
  static getInstance (module = 'Global') {
    if (!Logger.globalInstances) {
      Logger.globalInstances = new Map()
    }

    if (!Logger.globalInstances.has(module)) {
      Logger.globalInstances.set(module, new Logger(module))
    }

    return Logger.globalInstances.get(module)
  }

  /**
   * 静态方法：快速创建日志器
   * 用于替换项目中的console调用
   */
  static create (module) {
    return new Logger(module)
  }

  /**
   * 静态便捷方法 - 用于快速替换console.log
   */
  static log (message, data = {}) {
    const globalLogger = Logger.getInstance('QuickLog')
    return globalLogger.info(message, data)
  }

  static error (message, data = {}) {
    const globalLogger = Logger.getInstance('QuickLog')
    return globalLogger.error(message, data)
  }

  static warn (message, data = {}) {
    const globalLogger = Logger.getInstance('QuickLog')
    return globalLogger.warn(message, data)
  }

  static info (message, data = {}) {
    const globalLogger = Logger.getInstance('QuickLog')
    return globalLogger.info(message, data)
  }
}

module.exports = Logger
