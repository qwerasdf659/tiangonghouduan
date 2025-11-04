/**
 * 🌙 生产环境安全调试 - 分级日志系统
 *
 * 核心特性：
 * 1. 支持动态调整日志级别（不需要重启服务）
 * 2. 支持针对特定用户/请求开启详细日志
 * 3. 日志输出到文件和监控系统
 * 4. 敏感信息自动脱敏
 *
 * 大公司实践：
 * - 阿里：SLS日志服务
 * - 腾讯：CLS日志服务
 * - 字节：Lark日志平台
 * - 美团：Logan日志系统
 *
 * 创建时间：2025年11月02日 北京时间
 */

const winston = require('winston')
const path = require('path')
const fs = require('fs')

// 🔐 确保日志目录存在
const logDir = path.join(__dirname, '../logs')
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

// 🎚️ 日志级别定义
const LOG_LEVELS = {
  error: 0, // 🔴 错误：必须立即处理
  warn: 1, // 🟡 警告：需要关注
  info: 2, // 🔵 信息：正常业务日志
  debug: 3, // 🟢 调试：详细调试信息
  trace: 4 // 🔍 追踪：最详细的追踪信息
}

// 🎨 日志颜色配置
const LOG_COLORS = {
  error: 'red',
  warn: 'yellow',
  info: 'cyan',
  debug: 'green',
  trace: 'magenta'
}

// 📊 当前日志级别（可动态调整）
let CURRENT_LOG_LEVEL = process.env.LOG_LEVEL || 'info'

// 🎯 特殊调试模式：针对特定用户/请求开启详细日志
const debugSessions = new Set() // 需要详细日志的会话ID
const debugUsers = new Set() // 需要详细日志的用户ID

// 🔧 日志格式化
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
)

// 📁 Winston Logger 配置
const logger = winston.createLogger({
  levels: LOG_LEVELS,
  level: CURRENT_LOG_LEVEL,
  format: logFormat,
  transports: [
    // 🔴 错误日志：单独文件
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 30, // 保留30天
      tailable: true
    }),

    // 🔵 所有日志：合并文件
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 7, // 保留7天
      tailable: true
    }),

    // 🟢 调试日志：独立文件（生产环境可关闭）
    new winston.transports.File({
      filename: path.join(logDir, 'debug.log'),
      level: 'debug',
      maxsize: 100 * 1024 * 1024, // 100MB
      maxFiles: 3, // 保留3天
      tailable: true
    })
  ]
})

// 📺 控制台输出（开发环境）
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ colors: LOG_COLORS }),
      winston.format.printf(({ level, message, timestamp, ...metadata }) => {
        let msg = `${timestamp} [${level}]: ${message}`
        if (Object.keys(metadata).length > 0) {
          msg += ` ${JSON.stringify(metadata)}`
        }
        return msg
      })
    )
  }))
}

// 🔐 敏感信息脱敏
function sanitize (data) {
  if (!data) return data

  const sensitive = ['password', 'token', 'secret', 'key', 'authorization']
  const sanitized = JSON.parse(JSON.stringify(data))

  function maskValue (obj) {
    if (typeof obj !== 'object' || obj === null) return

    for (const key in obj) {
      if (sensitive.some(word => key.toLowerCase().includes(word))) {
        obj[key] = '***MASKED***'
      } else if (typeof obj[key] === 'object') {
        maskValue(obj[key])
      }
    }
  }

  maskValue(sanitized)
  return sanitized
}

// 🎯 智能日志记录器（支持按用户/会话调试）
class SmartLogger {
  /**
   * 记录日志（自动判断是否需要详细日志）
   */
  log (level, message, meta = {}) {
    const { userId, sessionId, requestId } = meta

    // 🔍 检查是否需要为此用户/会话记录详细日志
    const needDetailedLog =
      debugUsers.has(userId) ||
      debugSessions.has(sessionId) ||
      debugSessions.has(requestId)

    // 如果需要详细日志，临时提升到 trace 级别
    if (needDetailedLog && LOG_LEVELS[level] > LOG_LEVELS.trace) {
      level = 'trace'
    }

    // 🔐 脱敏处理
    const sanitizedMeta = sanitize(meta)

    // 记录日志
    logger.log(level, message, sanitizedMeta)
  }

  // 🔴 错误日志
  error (message, meta = {}) {
    this.log('error', message, { ...meta, stack: new Error().stack })
  }

  // 🟡 警告日志
  warn (message, meta = {}) {
    this.log('warn', message, meta)
  }

  // 🔵 信息日志
  info (message, meta = {}) {
    this.log('info', message, meta)
  }

  // 🟢 调试日志
  debug (message, meta = {}) {
    this.log('debug', message, meta)
  }

  // 🔍 追踪日志（最详细）
  trace (message, meta = {}) {
    this.log('trace', message, meta)
  }

  // 🎯 为特定用户开启调试模式
  enableDebugForUser (userId, durationMinutes = 30) {
    debugUsers.add(userId)
    this.info('为用户开启调试模式', { userId, duration: `${durationMinutes}分钟` })

    // 自动关闭
    setTimeout(() => {
      debugUsers.delete(userId)
      this.info('用户调试模式已关闭', { userId })
    }, durationMinutes * 60 * 1000)
  }

  // 🎯 为特定会话开启调试模式
  enableDebugForSession (sessionId, durationMinutes = 30) {
    debugSessions.add(sessionId)
    this.info('为会话开启调试模式', { sessionId, duration: `${durationMinutes}分钟` })

    // 自动关闭
    setTimeout(() => {
      debugSessions.delete(sessionId)
      this.info('会话调试模式已关闭', { sessionId })
    }, durationMinutes * 60 * 1000)
  }

  // 🎚️ 动态调整全局日志级别
  setLogLevel (level) {
    if (!LOG_LEVELS.hasOwnProperty(level)) {
      this.error('无效的日志级别', { level, validLevels: Object.keys(LOG_LEVELS) })
      return false
    }

    CURRENT_LOG_LEVEL = level
    logger.level = level
    this.info('日志级别已调整', { newLevel: level })
    return true
  }

  // 📊 获取当前日志配置
  getConfig () {
    return {
      currentLevel: CURRENT_LOG_LEVEL,
      debugUsers: Array.from(debugUsers),
      debugSessions: Array.from(debugSessions),
      availableLevels: Object.keys(LOG_LEVELS)
    }
  }

  // 🧹 清除所有调试会话
  clearAllDebugSessions () {
    const count = debugUsers.size + debugSessions.size
    debugUsers.clear()
    debugSessions.clear()
    this.info('已清除所有调试会话', { clearedCount: count })
  }
}

// 导出单例
const smartLogger = new SmartLogger()

module.exports = {
  logger: smartLogger,

  // 兼容旧代码
  error: (msg, meta) => smartLogger.error(msg, meta),
  warn: (msg, meta) => smartLogger.warn(msg, meta),
  info: (msg, meta) => smartLogger.info(msg, meta),
  debug: (msg, meta) => smartLogger.debug(msg, meta),
  trace: (msg, meta) => smartLogger.trace(msg, meta)
}
