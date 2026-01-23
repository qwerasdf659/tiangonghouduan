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
import {
  loadECharts,
  isEChartsLoaded,
  getECharts,
  preloadECharts
} from './echarts-lazy.js'
export {
  loadECharts,
  isEChartsLoaded,
  getECharts,
  preloadECharts
}

// ========== 确认对话框 ==========
// 从 Alpine Store 导出便捷函数
import { $confirm, $confirmDanger } from '../alpine/stores/confirm-dialog.js'
export { $confirm, $confirmDanger }

// ========== 格式化函数 ==========

/**
 * 格式化日期
 * @param {string|Date} date - 日期
 * @param {string} format - 格式模板
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!date) return '-'

  const d = new Date(date)
  if (isNaN(d.getTime())) return '-'

  const pad = n => String(n).padStart(2, '0')

  const replacements = {
    YYYY: d.getFullYear(),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds())
  }

  let result = format
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(key, value)
  }

  return result
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
  // 格式化
  formatDate,
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

