/**
 * 统一日志工具类
 *
 * @description 替代 console.log 的统一日志系统，支持日志级别控制
 * @version 1.0.0
 * @date 2026-01-24
 *
 * @example
 * import { logger } from '@/utils/logger.js'
 *
 * logger.debug('调试信息', { data: xxx })
 * logger.info('普通信息')
 * logger.warn('警告信息')
 * logger.error('错误信息', error)
 */

/**
 * 日志级别定义
 * @constant
 */
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4
}

/**
 * 日志级别名称映射
 * @constant
 */
const LEVEL_NAMES = {
  [LOG_LEVELS.DEBUG]: 'DEBUG',
  [LOG_LEVELS.INFO]: 'INFO',
  [LOG_LEVELS.WARN]: 'WARN',
  [LOG_LEVELS.ERROR]: 'ERROR'
}

/**
 * 日志级别样式映射（用于浏览器控制台美化输出）
 * @constant
 */
const LEVEL_STYLES = {
  [LOG_LEVELS.DEBUG]: 'color: #6B7280; font-weight: normal;',
  [LOG_LEVELS.INFO]: 'color: #3B82F6; font-weight: normal;',
  [LOG_LEVELS.WARN]: 'color: #F59E0B; font-weight: bold;',
  [LOG_LEVELS.ERROR]: 'color: #EF4444; font-weight: bold;'
}

/**
 * 日志级别图标映射
 * @constant
 */
const LEVEL_ICONS = {
  [LOG_LEVELS.DEBUG]: '🔍',
  [LOG_LEVELS.INFO]: 'ℹ️',
  [LOG_LEVELS.WARN]: '⚠️',
  [LOG_LEVELS.ERROR]: '❌'
}

/**
 * 根据环境变量确定当前日志级别
 * - 生产环境：只显示 WARN 和 ERROR
 * - 开发环境：显示所有日志
 */
const getCurrentLevel = () => {
  // Vite 使用 import.meta.env，但在某些情况下可能不可用
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env.PROD ? LOG_LEVELS.WARN : LOG_LEVELS.DEBUG
    }
  } catch (e) {
    // 忽略错误
  }

  // 回退判断：检查 URL 是否包含 localhost 或 127.0.0.1
  const isLocal =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  return isLocal ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN
}

/**
 * 当前日志级别
 */
let currentLevel = getCurrentLevel()

/**
 * 格式化时间戳
 * @returns {string} 格式化的时间字符串
 */
const formatTimestamp = () => {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, '0')}`
}

/**
 * 格式化日志消息
 * @param {number} level - 日志级别
 * @param {string} message - 消息内容
 * @returns {string} 格式化的消息
 */
const formatMessage = (level, message) => {
  const timestamp = formatTimestamp()
  const levelName = LEVEL_NAMES[level]
  const icon = LEVEL_ICONS[level]
  return `${icon} [${timestamp}] [${levelName}] ${message}`
}

/**
 * 核心日志输出函数
 * @param {number} level - 日志级别
 * @param {string} message - 消息内容
 * @param {...any} args - 附加参数
 */
const log = (level, message, ...args) => {
  if (level < currentLevel) return

  const formattedMessage = formatMessage(level, message)
  const style = LEVEL_STYLES[level]

  switch (level) {
    case LOG_LEVELS.DEBUG:
      console.log(`%c${formattedMessage}`, style, ...args)
      break
    case LOG_LEVELS.INFO:
      console.info(`%c${formattedMessage}`, style, ...args)
      break
    case LOG_LEVELS.WARN:
      console.warn(`%c${formattedMessage}`, style, ...args)
      break
    case LOG_LEVELS.ERROR:
      console.error(`%c${formattedMessage}`, style, ...args)
      break
    default:
      console.log(formattedMessage, ...args)
  }
}

/**
 * Logger 实例
 * @type {Object}
 */
export const logger = {
  /**
   * 输出调试日志
   * @param {string} message - 消息内容
   * @param {...any} args - 附加参数
   */
  debug(message, ...args) {
    log(LOG_LEVELS.DEBUG, message, ...args)
  },

  /**
   * 输出普通信息日志
   * @param {string} message - 消息内容
   * @param {...any} args - 附加参数
   */
  info(message, ...args) {
    log(LOG_LEVELS.INFO, message, ...args)
  },

  /**
   * 输出警告日志
   * @param {string} message - 消息内容
   * @param {...any} args - 附加参数
   */
  warn(message, ...args) {
    log(LOG_LEVELS.WARN, message, ...args)
  },

  /**
   * 输出错误日志
   * @param {string} message - 消息内容
   * @param {...any} args - 附加参数
   */
  error(message, ...args) {
    log(LOG_LEVELS.ERROR, message, ...args)
  },

  /**
   * 设置日志级别
   * @param {number} level - 日志级别
   */
  setLevel(level) {
    if (level >= LOG_LEVELS.DEBUG && level <= LOG_LEVELS.SILENT) {
      currentLevel = level
    }
  },

  /**
   * 获取当前日志级别
   * @returns {number} 当前日志级别
   */
  getLevel() {
    return currentLevel
  },

  /**
   * 创建带命名空间的 Logger
   * @param {string} namespace - 命名空间
   * @returns {Object} 带命名空间的 Logger 实例
   */
  createNamespace(namespace) {
    return {
      debug: (message, ...args) => logger.debug(`[${namespace}] ${message}`, ...args),
      info: (message, ...args) => logger.info(`[${namespace}] ${message}`, ...args),
      warn: (message, ...args) => logger.warn(`[${namespace}] ${message}`, ...args),
      error: (message, ...args) => logger.error(`[${namespace}] ${message}`, ...args)
    }
  },

  /**
   * 分组日志输出
   * @param {string} label - 分组标签
   * @param {Function} fn - 分组内执行的函数
   */
  group(label, fn) {
    if (currentLevel > LOG_LEVELS.DEBUG) return

    console.group(`📁 ${label}`)
    try {
      fn()
    } finally {
      console.groupEnd()
    }
  },

  /**
   * 计时器开始
   * @param {string} label - 计时器标签
   */
  time(label) {
    if (currentLevel > LOG_LEVELS.DEBUG) return
    console.time(`⏱️ ${label}`)
  },

  /**
   * 计时器结束
   * @param {string} label - 计时器标签
   */
  timeEnd(label) {
    if (currentLevel > LOG_LEVELS.DEBUG) return
    console.timeEnd(`⏱️ ${label}`)
  }
}

// 默认导出 logger 实例
export default logger
