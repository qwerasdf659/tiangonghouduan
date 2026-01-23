/**
 * 前端主入口文件（ES Module）
 *
 * @description Vite 打包入口，初始化所有核心模块
 * @version 2.0.0
 * @date 2026-01-23
 */

// ========== 样式导入 ==========
import './styles/index.css'

// ========== ECharts 懒加载模块 ==========
// 改为动态导入，非图表页面不加载 ECharts，减少首屏体积
// 使用方法: const echarts = await loadECharts()
import { loadECharts, isEChartsLoaded, preloadECharts } from './utils/echarts-lazy.js'

// ========== Alpine.js 初始化 ==========
import { initAlpine } from './alpine/index.js'

// ========== API 模块导入 ==========
import { API, API_ENDPOINTS } from './api/index.js'
import { request, buildURL, buildQueryString } from './api/base.js'

// 导入 api-config.js 以兼容旧代码
import './api/api-config.js'

// ========== 全局工具函数 ==========

/**
 * 显示 Toast 消息
 * @param {string} message - 消息内容
 * @param {string} type - 消息类型: success, error, warning, info
 */
window.showToast = function (message, type = 'info') {
  // 创建 toast 容器（如果不存在）
  let container = document.getElementById('toast-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'toast-container'
    container.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2'
    document.body.appendChild(container)
  }

  // 创建 toast 元素
  const toast = document.createElement('div')

  // 类型对应的样式
  const typeStyles = {
    success: 'bg-green-500 text-white',
    error: 'bg-red-500 text-white',
    warning: 'bg-yellow-500 text-black',
    info: 'bg-blue-500 text-white'
  }

  // 类型对应的图标
  const typeIcons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  }

  toast.className = `px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transform translate-x-full transition-transform duration-300 ${typeStyles[type] || typeStyles.info}`
  toast.innerHTML = `
    <span class="text-lg">${typeIcons[type] || typeIcons.info}</span>
    <span>${message}</span>
  `

  container.appendChild(toast)

  // 触发动画
  requestAnimationFrame(() => {
    toast.classList.remove('translate-x-full')
    toast.classList.add('translate-x-0')
  })

  // 3秒后移除
  setTimeout(() => {
    toast.classList.remove('translate-x-0')
    toast.classList.add('translate-x-full')
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}

/**
 * 格式化日期
 * @param {string|Date} date - 日期
 * @param {string} format - 格式
 * @returns {string}
 */
window.formatDate = function (date, format = 'YYYY-MM-DD HH:mm:ss') {
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
 * 格式化金额
 * @param {number} amount - 金额（分）
 * @returns {string}
 */
window.formatAmount = function (amount) {
  if (amount === null || amount === undefined) return '0.00'
  return (amount / 100).toFixed(2)
}

/**
 * 格式化数字（千分位）
 * @param {number} num - 数字
 * @returns {string}
 */
window.formatNumber = function (num) {
  if (num === null || num === undefined) return '0'
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// ========== 全局 API 挂载 ==========
window.API = API
window.API_ENDPOINTS = API_ENDPOINTS
window.request = request
window.buildURL = buildURL
window.buildQueryString = buildQueryString

// ========== ECharts 懒加载函数挂载 ==========
window.loadECharts = loadECharts
window.isEChartsLoaded = isEChartsLoaded
window.preloadECharts = preloadECharts

/**
 * 全局 API 请求函数（兼容旧代码）
 * @param {string} url - API URL
 * @param {Object} options - 请求选项
 * @returns {Promise} API 响应
 */
window.apiRequest = async function (url, options = {}) {
  return await request({
    url,
    method: options.method || 'GET',
    data: options.body || options.data,
    headers: options.headers
  })
}

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  // 初始化 Alpine.js
  initAlpine()

  console.log('🚀 前端应用已初始化')
  console.log('📦 Vite + Alpine.js + Tailwind CSS')
})
