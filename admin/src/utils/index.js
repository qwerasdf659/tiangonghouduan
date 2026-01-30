/**
 * 工具函数统一导出入口（ES Module 版本）
 *
 * @description 聚合所有工具函数并提供统一导出
 * @version 1.0.1
 * @date 2026-01-24
 *
 * @example
 * // 按需导入
 * import { formatDate, formatAmount, showToast } from '@/utils/index.js'
 *
 * // 或全部导入
 * import * as utils from '@/utils/index.js'
 */

// ========== 日志工具 ==========
// 注意：必须先 import 再 re-export，这样才能在 default export 中使用
import { logger, LOG_LEVELS } from './logger.js'
export { logger, LOG_LEVELS }

// ========== ECharts 懒加载 ==========
// 同理，先 import 再 re-export
import { loadECharts, isEChartsLoaded, getECharts, preloadECharts } from './echarts-lazy.js'
export { loadECharts, isEChartsLoaded, getECharts, preloadECharts }

// ========== 确认对话框 ==========
// 从 Alpine Store 导出便捷函数
import { $confirm, $confirmDanger } from '../alpine/stores/confirm-dialog.js'
export { $confirm, $confirmDanger }

// ========== 格式化函数 ==========

/**
 * 北京时间配置（全局统一）
 * @constant {Object} BEIJING_TIMEZONE_CONFIG
 */
const BEIJING_TIMEZONE_CONFIG = {
  timeZone: 'Asia/Shanghai',
  locale: 'zh-CN'
}

/**
 * 格式化日期为北京时间（强制使用 Asia/Shanghai 时区）
 *
 * 重要说明：
 * - 数据库配置 dateStrings: true + timezone: '+08:00'
 * - 数据库返回的日期字符串（如 '2026-01-25 20:10:36'）已经是北京时间
 * - UTC 格式（如 '2026-01-25T20:10:36.000Z'）需要转换为北京时间
 *
 * @param {string|Date|Object} dateValue - 日期值（支持字符串、Date对象、后端时间对象）
 * @param {Object} options - 格式化选项
 * @param {boolean} options.showSeconds - 是否显示秒，默认 true
 * @param {boolean} options.dateOnly - 是否只显示日期，默认 false
 * @returns {string} 格式化后的北京时间字符串
 *
 * @example
 * formatDate('2026-01-25T20:10:36.000Z') // '2026/01/26 04:10:36'（UTC转北京时间）
 * formatDate('2026-01-25 20:10:36')      // '2026/01/25 20:10:36'（已是北京时间，直接格式化）
 * formatDate(new Date())                 // 当前北京时间
 */
export function formatDate(dateValue, options = {}) {
  if (!dateValue) return '-'

  const { showSeconds = true, dateOnly = false } = options

  try {
    // 处理后端返回的时间对象格式 { iso, beijing, timestamp, relative }
    let dateStr = dateValue
    if (typeof dateValue === 'object' && dateValue !== null && !(dateValue instanceof Date)) {
      // 优先使用 beijing 格式（已经是北京时间字符串）
      if (dateValue.beijing) return dateValue.beijing
      // 使用 iso 格式
      dateStr = dateValue.iso || dateValue.timestamp || dateValue
    }

    // 检查是否是数据库返回的纯日期字符串（无时区信息，已是北京时间）
    // 格式如: '2026-01-25 20:10:36' 或 '2026-01-25'
    if (typeof dateStr === 'string') {
      // 如果没有 T、Z 或 +/-时区偏移，说明是数据库返回的北京时间字符串
      const isPlainDbFormat =
        !dateStr.includes('T') && !dateStr.includes('Z') && !dateStr.match(/[+-]\d{2}:\d{2}$/)

      if (isPlainDbFormat) {
        // 数据库返回的已经是北京时间，直接格式化显示
        // 将 '2026-01-25 20:10:36' 转换为 '2026/01/25 20:10:36'
        const parts = dateStr.match(/(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}):?(\d{2})?)?/)
        if (parts) {
          const [, year, month, day, hour = '00', minute = '00', second = '00'] = parts
          if (dateOnly) {
            return `${year}/${month}/${day}`
          }
          if (showSeconds) {
            return `${year}/${month}/${day} ${hour}:${minute}:${second}`
          }
          return `${year}/${month}/${day} ${hour}:${minute}`
        }
      }
    }

    // 处理带时区的日期（UTC、ISO格式等）
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '-'

    // 构建格式化选项 - 强制使用北京时间
    const formatOptions = {
      timeZone: BEIJING_TIMEZONE_CONFIG.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }

    if (!dateOnly) {
      formatOptions.hour = '2-digit'
      formatOptions.minute = '2-digit'
      if (showSeconds) {
        formatOptions.second = '2-digit'
      }
      formatOptions.hour12 = false
    }

    return date.toLocaleString(BEIJING_TIMEZONE_CONFIG.locale, formatOptions)
  } catch (e) {
    logger.warn('[formatDate] 日期格式化失败:', dateValue, e)
    return '-'
  }
}

/**
 * 格式化日期时间为北京时间（包含秒）
 * @param {string|Date|Object} dateValue - 日期值
 * @returns {string} 格式化后的北京时间字符串
 */
export function formatDateTime(dateValue) {
  return formatDate(dateValue, { showSeconds: true })
}

/**
 * 格式化日期（仅日期，不含时间）
 * @param {string|Date|Object} dateValue - 日期值
 * @returns {string} 格式化后的日期字符串 (如 '2026/01/25')
 */
export function formatDateOnly(dateValue) {
  return formatDate(dateValue, { dateOnly: true })
}

/**
 * 格式化日期时间（不含秒）
 * @param {string|Date|Object} dateValue - 日期值
 * @returns {string} 格式化后的日期时间字符串 (如 '2026/01/25 20:10')
 */
export function formatDateTimeShort(dateValue) {
  return formatDate(dateValue, { showSeconds: false })
}

/**
 * 格式化日期为 datetime-local 输入框格式（北京时间）
 * @param {string|Date} dateValue - 日期值
 * @returns {string} ISO格式的本地日期时间 (如 '2026-01-25T20:10')
 */
export function formatDateTimeLocal(dateValue) {
  if (!dateValue) return ''
  try {
    const date = new Date(dateValue)
    if (isNaN(date.getTime())) return ''

    // 转换为北京时间
    const beijingDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))

    const year = beijingDate.getFullYear()
    const month = String(beijingDate.getMonth() + 1).padStart(2, '0')
    const day = String(beijingDate.getDate()).padStart(2, '0')
    const hours = String(beijingDate.getHours()).padStart(2, '0')
    const minutes = String(beijingDate.getMinutes()).padStart(2, '0')

    return `${year}-${month}-${day}T${hours}:${minutes}`
  } catch {
    return ''
  }
}

/**
 * 获取当前北京时间
 * @returns {Date} 北京时间 Date 对象
 */
export function getBeijingNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
}

/**
 * 格式化相对时间（如：刚刚、5分钟前、2小时前）
 * @param {string|Date} dateValue - 日期值
 * @returns {string} 相对时间描述
 */
export function formatRelativeTime(dateValue) {
  if (!dateValue) return '-'

  try {
    const date = new Date(dateValue)
    if (isNaN(date.getTime())) return '-'

    const now = new Date()
    const diffMs = now - date
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffSeconds < 60) return '刚刚'
    if (diffMinutes < 60) return `${diffMinutes}分钟前`
    if (diffHours < 24) return `${diffHours}小时前`
    if (diffDays < 7) return `${diffDays}天前`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`

    // 超过30天显示具体日期
    return formatDate(date, { showSeconds: false })
  } catch {
    return '-'
  }
}

/**
 * 格式化金额（分转元）
 * @param {number} amount - 金额（分）
 * @returns {string} 格式化后的金额字符串
 */
export function formatAmount(amount) {
  if (amount === null || amount === undefined) return '0.00'
  return (amount / 100).toFixed(2)
}

/**
 * 格式化数字（千分位）
 * @param {number} num - 数字
 * @returns {string} 格式化后的数字字符串
 */
export function formatNumber(num) {
  if (num === null || num === undefined) return '0'
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的文件大小
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 格式化百分比
 * @param {number} value - 数值
 * @param {number} decimals - 小数位数
 * @returns {string} 格式化后的百分比
 */
export function formatPercent(value, decimals = 2) {
  if (value === null || value === undefined) return '0%'
  return (value * 100).toFixed(decimals) + '%'
}

// ========== Toast 消息 ==========

/**
 * 显示 Toast 消息
 * @param {string} message - 消息内容
 * @param {string} type - 消息类型: success, error, warning, info
 * @param {number} duration - 显示时长（毫秒）
 */
export function showToast(message, type = 'info', duration = 3000) {
  // 优先使用 Alpine.store('notification')
  if (typeof Alpine !== 'undefined' && Alpine.store && Alpine.store('notification')) {
    return Alpine.store('notification').showToast(message, type, duration)
  }
  // 降级方案
  alert(`[${type.toUpperCase()}] ${message}`)
}

/**
 * 显示成功消息
 * @param {string} message - 消息内容
 */
export function showSuccess(message) {
  showToast(message, 'success')
}

/**
 * 显示错误消息
 * @param {string} message - 消息内容
 */
export function showError(message) {
  showToast(message, 'error')
}

/**
 * 显示警告消息
 * @param {string} message - 消息内容
 */
export function showWarning(message) {
  showToast(message, 'warning')
}

/**
 * 显示信息消息
 * @param {string} message - 消息内容
 */
export function showInfo(message) {
  showToast(message, 'info')
}

// ========== 通用工具 ==========

/**
 * 防抖函数
 * @param {Function} fn - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(fn, delay = 300) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}

/**
 * 节流函数
 * @param {Function} fn - 要节流的函数
 * @param {number} limit - 时间限制（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(fn, limit = 300) {
  let inThrottle = false
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

/**
 * 深拷贝对象
 * @param {Object} obj - 要拷贝的对象
 * @returns {Object} 拷贝后的对象
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  try {
    return JSON.parse(JSON.stringify(obj))
  } catch (e) {
    return obj
  }
}

/**
 * 生成 UUID
 * @returns {string} UUID 字符串
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * 解析 URL 查询参数
 * @param {string} url - URL 字符串
 * @returns {Object} 参数对象
 */
export function parseQueryParams(url = window.location.search) {
  const params = new URLSearchParams(url)
  const result = {}
  for (const [key, value] of params) {
    result[key] = value
  }
  return result
}

/**
 * 构建查询字符串
 * @param {Object} params - 参数对象
 * @returns {string} 查询字符串
 */
export function buildQueryString(params) {
  if (!params || typeof params !== 'object') return ''
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      searchParams.append(key, value)
    }
  }
  return searchParams.toString()
}

/**
 * 构建完整 URL
 * @param {string} baseUrl - 基础 URL
 * @param {Object} params - 查询参数
 * @returns {string} 完整 URL
 */
export function buildURL(baseUrl, params) {
  const queryString = buildQueryString(params)
  if (!queryString) return baseUrl
  return baseUrl.includes('?') ? `${baseUrl}&${queryString}` : `${baseUrl}?${queryString}`
}

// ========== 默认导出 ==========
export default {
  // 日志
  logger,
  LOG_LEVELS,
  // ECharts
  loadECharts,
  isEChartsLoaded,
  getECharts,
  preloadECharts,
  // 日期格式化（北京时间）
  formatDate,
  formatDateTime,
  formatDateOnly,
  formatDateTimeShort,
  formatDateTimeLocal,
  formatRelativeTime,
  getBeijingNow,
  // 数字格式化
  formatAmount,
  formatNumber,
  formatFileSize,
  formatPercent,
  // Toast
  showToast,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  // 确认对话框
  $confirm,
  $confirmDanger,
  // 通用
  debounce,
  throttle,
  deepClone,
  generateUUID,
  parseQueryParams,
  buildQueryString,
  buildURL
}
