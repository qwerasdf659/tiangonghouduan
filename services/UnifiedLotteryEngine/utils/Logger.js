/**
 * 统一日志工具类
 * 提供结构化的日志记录功能
 *
 * @version 4.0.0
 * @date 2025-09-10
 */

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
  }

  /**
   * 格式化日志输出 - 使用北京时间
   */
  formatLog (level, message, data = {}) {
    const timestamp = BeijingTimeHelper.nowLocale() // 使用北京时间
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      module: this.module,
      message,
      ...data
    }

    const prefix = `[${timestamp}] ${level.toUpperCase()}[${this.module}]:`

    if (Object.keys(data).length > 0) {
      console.log(prefix, message, JSON.stringify(data, null, 2))
    } else {
      console.log(prefix, message)
    }

    return logEntry
  }

  error (message, data = {}) {
    if (this.currentLevel >= this.levels.error) {
      return this.formatLog('error', message, data)
    }
  }

  warn (message, data = {}) {
    if (this.currentLevel >= this.levels.warn) {
      return this.formatLog('warn', message, data)
    }
  }

  info (message, data = {}) {
    if (this.currentLevel >= this.levels.info) {
      return this.formatLog('info', message, data)
    }
  }

  debug (message, data = {}) {
    if (this.currentLevel >= this.levels.debug) {
      return this.formatLog('debug', message, data)
    }
  }
}

module.exports = Logger
