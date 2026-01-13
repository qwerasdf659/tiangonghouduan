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
  logger.add(
    new winston.transports.Console({
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
    })
  )
}

// 🔐 敏感信息脱敏（架构决策5：结构化日志 + 强制脱敏）
/**
 * 🚫 绝不允许落日志（黑名单）
 *
 * 这些字段包含敏感信息，必须完全从日志中移除，标记为 [REDACTED]
 * 2026-01-13 执行策略拍板：严格脱敏
 *
 * @constant {string[]}
 */
const BLACKLIST_FIELDS = [
  'authorization', // HTTP 认证头
  'Authorization', // HTTP 认证头（大写）
  'token', // 各类 token
  'password', // 密码
  'secret', // 密钥
  'qr_code', // ✅ 完整二维码绝不落日志（可能被重放）
  'nonce', // ✅ 一次性随机数绝不落日志
  'signature', // ✅ 签名信息绝不落日志
  'payment_info', // 支付信息
  'card_number', // 银行卡号
  'cvv', // 卡验证码
  'private_key', // 私钥
  'api_key' // API 密钥
]

/**
 * 脱敏手机号：保留前3后4，中间4位打码
 * @param {string|null} mobile - 手机号
 * @returns {string|null} 脱敏后的手机号（示例：13612227930 → 136****7930）
 */
function sanitizeMobile(mobile) {
  return mobile ? mobile.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : null
}

/**
 * 脱敏用户UUID：仅保留前8位
 * @param {string|null} uuid - 用户UUID
 * @returns {string|null} 脱敏后的UUID（示例：abc12345-xxxx → abc12345...）
 */
function sanitizeUserUuid(uuid) {
  return uuid ? uuid.substring(0, 8) + '...' : null
}

/**
 * IP地址：保留完整（便于风控，非敏感信息）
 * @param {string|null} ip - IP地址
 * @returns {string|null} 原始IP地址
 */
function sanitizeIp(ip) {
  return ip
}

/**
 * 脱敏商家备注：截断到100字符
 * @param {string|null} notes - 商家备注
 * @returns {string|null} 截断后的备注
 */
function sanitizeMerchantNotes(notes) {
  return notes ? notes.substring(0, 100) : null
}

/**
 * 脱敏幂等键：截断到50字符
 * @param {string|null} key - 幂等键
 * @returns {string|null} 截断后的幂等键
 */
function sanitizeIdempotencyKey(key) {
  return key ? key.substring(0, 50) : null
}

/**
 * ⚠️ 允许部分脱敏落日志（灰名单规则）
 *
 * 这些字段可以记录，但需要脱敏处理
 * 每个规则函数接受原始值，返回脱敏后的值
 *
 * @constant {Object.<string, function>}
 */
const SANITIZE_RULES = {
  mobile: sanitizeMobile,
  user_uuid: sanitizeUserUuid,
  ip: sanitizeIp,
  merchant_notes: sanitizeMerchantNotes,
  idempotency_key: sanitizeIdempotencyKey
}

/**
 * 敏感信息脱敏（Sanitize）
 *
 * 业务场景：
 * - 日志中可能包含 password/token 等敏感字段，必须脱敏后再输出
 * - 该函数会对对象进行深拷贝并递归脱敏
 *
 * 架构决策5（2026-01-13）：
 * - 黑名单字段：完全移除，替换为 [REDACTED]
 * - 灰名单字段：按规则脱敏处理
 *
 * @param {Object|null} data - 待脱敏的对象（可为空）
 * @returns {Object|null} 脱敏后的对象（若入参为空则原样返回）
 */
function sanitize(data) {
  if (!data) return data

  // 处理字符串类型直接返回
  if (typeof data !== 'object') return data

  const sanitized = JSON.parse(JSON.stringify(data))

  /**
   * 递归脱敏对象中的敏感字段
   *
   * @param {Object|null} obj - 待处理对象
   * @returns {void} 无返回值，直接修改 obj
   */
  function maskValue(obj) {
    if (typeof obj !== 'object' || obj === null) return

    for (const key in obj) {
      // 黑名单字段：完全移除
      if (BLACKLIST_FIELDS.includes(key)) {
        obj[key] = '[REDACTED]'
        continue
      }

      // 灰名单字段：按规则脱敏
      if (key === 'mobile' && SANITIZE_RULES.mobile) {
        obj[key] = SANITIZE_RULES.mobile(obj[key])
      } else if (key === 'user_uuid' && SANITIZE_RULES.user_uuid) {
        obj[key] = SANITIZE_RULES.user_uuid(obj[key])
      } else if (key === 'merchant_notes' && SANITIZE_RULES.merchant_notes) {
        obj[key] = SANITIZE_RULES.merchant_notes(obj[key])
      } else if (key === 'idempotency_key' && SANITIZE_RULES.idempotency_key) {
        obj[key] = SANITIZE_RULES.idempotency_key(obj[key])
      } else if (typeof obj[key] === 'object') {
        // 递归处理嵌套对象
        maskValue(obj[key])
      }
    }
  }

  maskValue(sanitized)
  return sanitized
}

/**
 * 对象脱敏快捷函数
 *
 * @param {Object} obj - 待脱敏对象
 * @returns {Object} 脱敏后的对象
 */
sanitize.object = obj => sanitize(obj)

/**
 * 手机号脱敏快捷函数
 */
sanitize.mobile = SANITIZE_RULES.mobile

/**
 * user_uuid 脱敏快捷函数
 */
sanitize.user_uuid = SANITIZE_RULES.user_uuid

/**
 * 商家备注脱敏快捷函数
 */
sanitize.merchant_notes = SANITIZE_RULES.merchant_notes

/**
 * 幂等键脱敏快捷函数
 */
sanitize.idempotency_key = SANITIZE_RULES.idempotency_key

/**
 * IP地址脱敏快捷函数
 */
sanitize.ip = SANITIZE_RULES.ip

// 🎯 智能日志记录器（支持按用户/会话调试）
/**
 * 智能日志记录器（SmartLogger）
 *
 * 业务场景：
 * - 支持按 userId/sessionId/requestId 临时开启更详细的日志
 * - 统一封装 error/warn/info/debug/trace 五级日志方法
 */
class SmartLogger {
  /**
   * 记录日志（自动判断是否需要详细日志）
   *
   * @param {string} level - 日志级别（error/warn/info/debug/trace）
   * @param {string} message - 日志消息（中文描述）
   * @param {Object} meta - 附加信息（会被脱敏后输出）
   * @returns {void} 无返回值
   */
  log(level, message, meta = {}) {
    const { userId, sessionId, requestId } = meta

    // 🔍 检查是否需要为此用户/会话记录详细日志
    const needDetailedLog =
      debugUsers.has(userId) || debugSessions.has(sessionId) || debugSessions.has(requestId)

    // 如果需要详细日志，临时提升到 trace 级别
    if (needDetailedLog && LOG_LEVELS[level] > LOG_LEVELS.trace) {
      level = 'trace'
    }

    // 🔐 脱敏处理
    const sanitizedMeta = sanitize(meta)

    // 记录日志
    logger.log(level, message, sanitizedMeta)
  }

  /**
   * 错误日志
   *
   * @param {string} message - 日志消息
   * @param {Object} meta - 附加信息
   * @returns {void} 无返回值
   */
  error(message, meta = {}) {
    this.log('error', message, { ...meta, stack: new Error().stack })
  }

  /**
   * 警告日志
   *
   * @param {string} message - 日志消息
   * @param {Object} meta - 附加信息
   * @returns {void} 无返回值
   */
  warn(message, meta = {}) {
    this.log('warn', message, meta)
  }

  /**
   * 信息日志
   *
   * @param {string} message - 日志消息
   * @param {Object} meta - 附加信息
   * @returns {void} 无返回值
   */
  info(message, meta = {}) {
    this.log('info', message, meta)
  }

  /**
   * 调试日志
   *
   * @param {string} message - 日志消息
   * @param {Object} meta - 附加信息
   * @returns {void} 无返回值
   */
  debug(message, meta = {}) {
    this.log('debug', message, meta)
  }

  /**
   * 追踪日志（最详细）
   *
   * @param {string} message - 日志消息
   * @param {Object} meta - 附加信息
   * @returns {void} 无返回值
   */
  trace(message, meta = {}) {
    this.log('trace', message, meta)
  }

  /**
   * 为特定用户开启调试模式（临时）
   *
   * @param {number|string} userId - 用户ID
   * @param {number} durationMinutes - 开启时长（分钟，默认30）
   * @returns {void} 无返回值
   */
  enableDebugForUser(userId, durationMinutes = 30) {
    debugUsers.add(userId)
    this.info('为用户开启调试模式', { userId, duration: `${durationMinutes}分钟` })

    // 自动关闭
    setTimeout(
      () => {
        debugUsers.delete(userId)
        this.info('用户调试模式已关闭', { userId })
      },
      durationMinutes * 60 * 1000
    )
  }

  /**
   * 为特定会话开启调试模式（临时）
   *
   * @param {string} sessionId - 会话ID
   * @param {number} durationMinutes - 开启时长（分钟，默认30）
   * @returns {void} 无返回值
   */
  enableDebugForSession(sessionId, durationMinutes = 30) {
    debugSessions.add(sessionId)
    this.info('为会话开启调试模式', { sessionId, duration: `${durationMinutes}分钟` })

    // 自动关闭
    setTimeout(
      () => {
        debugSessions.delete(sessionId)
        this.info('会话调试模式已关闭', { sessionId })
      },
      durationMinutes * 60 * 1000
    )
  }

  /**
   * 动态调整全局日志级别
   *
   * 业务场景：生产环境临时提升/降低日志级别（无需重启）
   *
   * @param {string} level - 日志级别（error/warn/info/debug/trace）
   * @returns {boolean} 是否设置成功
   */
  setLogLevel(level) {
    if (!Object.prototype.hasOwnProperty.call(LOG_LEVELS, level)) {
      this.error('无效的日志级别', { level, validLevels: Object.keys(LOG_LEVELS) })
      return false
    }

    CURRENT_LOG_LEVEL = level
    logger.level = level
    this.info('日志级别已调整', { newLevel: level })
    return true
  }

  /**
   * 获取当前日志配置
   *
   * @returns {Object} 当前配置（currentLevel/debugUsers/debugSessions/availableLevels）
   */
  getConfig() {
    return {
      currentLevel: CURRENT_LOG_LEVEL,
      debugUsers: Array.from(debugUsers),
      debugSessions: Array.from(debugSessions),
      availableLevels: Object.keys(LOG_LEVELS)
    }
  }

  /**
   * 清除所有调试会话
   *
   * @returns {void} 无返回值
   */
  clearAllDebugSessions() {
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

  // 快捷方法导出
  error: (msg, meta) => smartLogger.error(msg, meta),
  warn: (msg, meta) => smartLogger.warn(msg, meta),
  info: (msg, meta) => smartLogger.info(msg, meta),
  debug: (msg, meta) => smartLogger.debug(msg, meta),
  trace: (msg, meta) => smartLogger.trace(msg, meta),

  // 脱敏工具导出（架构决策5：供外部模块使用）
  sanitize,
  BLACKLIST_FIELDS,
  SANITIZE_RULES
}
