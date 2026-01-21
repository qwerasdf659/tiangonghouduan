/**
 * 管理后台通用工具函数库
 *
 * ⚠️ 重要说明：
 * - 本文件是前端JavaScript文件，位于 public/admin/js/
 * - 不是后端Node.js模块，请勿混淆
 * - 在浏览器环境中运行，不能使用Node.js API
 *
 * @file public/admin/js/admin-common.js
 * @description 基于现有V4 API架构和UUID角色系统设计
 * @author 开发团队
 * @version 1.0.0
 * @date 2025-11-22
 */

// ==================== 类型定义 ====================

/**
 * 用户信息对象
 * @typedef {Object} User
 * @property {number} user_id - 用户ID
 * @property {string} nickname - 用户昵称
 * @property {string} mobile - 手机号（脱敏显示）
 * @property {Array<Object>} [roles] - 角色数组（UUID角色系统）
 */

/**
 * API响应对象
 * @typedef {Object} ApiResponse
 * @property {boolean} success - 请求是否成功
 * @property {string} message - 响应消息
 * @property {*} [data] - 响应数据（可选）
 */

// ==================== Token管理 ====================

/**
 * 获取本地存储的管理员Token
 *
 * 如果Token不存在，自动跳转到登录页面
 *
 * @returns {string|null} 管理员Token
 */
function getToken() {
  const token = localStorage.getItem('admin_token')
  if (!token) {
    window.location.href = '/admin/login.html'
    return null
  }
  return token
}

/**
 * 保存管理员Token到本地存储
 *
 * @param {string} token - JWT Token字符串
 */
function saveToken(token) {
  localStorage.setItem('admin_token', token)
}

/**
 * 清除所有本地存储的数据
 */
function clearToken() {
  localStorage.clear()
}

/**
 * 退出登录
 */
function logout() {
  clearToken()
  window.location.href = '/admin/login.html'
}

// ==================== 权限验证 ====================

/**
 * 检查管理员权限
 *
 * ✅ 基于实际后端返回的user.roles数组进行权限判断
 *
 * @returns {boolean} 是否有管理员权限
 */
function checkAdminPermission() {
  const userStr = localStorage.getItem('admin_user')
  if (!userStr) {
    logout()
    return false
  }

  try {
    const user = JSON.parse(userStr)

    // ✅ 权限检查：后端通过user_roles表关联查询，会在user对象中包含roles数组
    const hasAdminAccess =
      user.roles && user.roles.some(role => role.role_name === 'admin' || role.role_level >= 100)

    if (!hasAdminAccess) {
      alert('您没有管理员权限，请联系系统管理员分配权限')
      logout()
      return false
    }

    return true
  } catch (error) {
    console.error('权限检查失败:', error)
    logout()
    return false
  }
}

/**
 * 获取当前登录的管理员信息
 *
 * @returns {User|null} 用户信息对象
 */
function getCurrentUser() {
  const userStr = localStorage.getItem('admin_user')
  return userStr ? JSON.parse(userStr) : null
}

/**
 * 获取当前登录管理员的用户ID
 *
 * @returns {number|null} 用户ID
 */
function getCurrentUserId() {
  const user = getCurrentUser()
  return user ? user.user_id : null
}

// ==================== API请求封装 ====================

/**
 * 统一的API请求封装函数
 *
 * @async
 * @param {string} url - API接口URL
 * @param {Object} [options={}] - fetch请求选项
 * @returns {Promise<ApiResponse>} API响应对象
 */
async function apiRequest(url, options = {}) {
  const defaultOptions = {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    }
  }

  // 处理查询参数
  let finalUrl = url
  if (options.queryParams) {
    const queryString = Object.entries(options.queryParams)
      .filter(([_, value]) => value !== undefined && value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&')
    if (queryString) {
      finalUrl = `${url}?${queryString}`
    }
    delete options.queryParams
  }

  try {
    const response = await fetch(finalUrl, { ...defaultOptions, ...options })

    // 处理非JSON响应
    const contentType = response.headers.get('content-type')
    let result
    if (contentType && contentType.includes('application/json')) {
      result = await response.json()
    } else {
      result = { success: false, message: await response.text() }
    }

    // 详细的错误处理
    if (response.status === 401) {
      alert('登录已过期或权限不足，请重新登录')
      logout()
      return
    }

    if (response.status === 403) {
      alert('权限不足，请确认您有管理员权限')
      return
    }

    // 对于4xx业务错误（如400验证错误），返回结果而不是抛出异常
    // 这样前端可以正确显示后端返回的友好错误消息
    if (response.status >= 400 && response.status < 500) {
      return result // 返回包含 success: false 的结果
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${result.message || '请求失败'}`)
    }

    return result
  } catch (error) {
    console.error('API请求失败:', error)
    throw error
  }
}

// ==================== 日期时间处理 ====================

/**
 * 格式化日期时间为北京时间字符串
 * 支持后端返回的中文格式日期（如 "2026年1月9日星期五 08:25:48"）
 *
 * @param {string|Date} dateString - 日期字符串或Date对象
 * @returns {string} 格式化后的北京时间字符串
 */
function formatDate(dateString) {
  if (!dateString) return '-'

  // 如果已经是中文格式（包含"年"），直接返回（去掉星期几使显示更简洁）
  if (typeof dateString === 'string' && dateString.includes('年')) {
    return dateString.replace(/星期[一二三四五六日]/, '').trim()
  }

  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      return dateString // 解析失败，返回原始字符串
    }
    return date.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch (error) {
    console.error('日期格式化失败:', error)
    return dateString
  }
}

/**
 * 格式化日期时间为相对时间描述
 * 支持后端返回的中文格式日期
 *
 * @param {string|Date} dateString - 日期字符串或Date对象
 * @returns {string} 相对时间描述
 */
function formatRelativeTime(dateString) {
  if (!dateString) return '-'

  let past

  // 处理中文格式日期（如 "2026年1月9日星期五 08:25:48"）
  if (typeof dateString === 'string' && dateString.includes('年')) {
    const match = dateString.match(
      /(\d{4})年(\d{1,2})月(\d{1,2})日.*?(\d{1,2}):(\d{1,2}):?(\d{0,2})/
    )
    if (match) {
      const [, year, month, day, hour, minute, second] = match
      past = new Date(year, month - 1, day, hour, minute, second || 0)
    } else {
      return dateString // 无法解析，返回原始字符串
    }
  } else {
    past = new Date(dateString)
  }

  if (isNaN(past.getTime())) {
    return dateString // 解析失败，返回原始字符串
  }

  const now = new Date()
  const diffMs = now - past

  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays}天前`
  if (diffHours > 0) return `${diffHours}小时前`
  if (diffMinutes > 0) return `${diffMinutes}分钟前`
  return '刚刚'
}

// ==================== 数据格式化 ====================

/**
 * 格式化数字为千分位格式
 *
 * @param {number} num - 数字
 * @returns {string} 格式化后的字符串
 */
function formatNumber(num) {
  try {
    return num.toLocaleString('zh-CN')
  } catch (error) {
    console.error('数字格式化失败:', error)
    return num
  }
}

/**
 * 格式化手机号（脱敏显示）
 *
 * @param {string} phone - 手机号
 * @returns {string} 脱敏后的手机号
 */
function maskPhone(phone) {
  if (!phone || phone.length !== 11) return phone
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

// ==================== 数据验证 ====================

/**
 * 验证手机号格式
 *
 * @param {string} phone - 手机号码
 * @returns {boolean} 是否为有效手机号
 */
function validatePhone(phone) {
  const phoneRegex = /^1[3-9]\d{9}$/
  return phoneRegex.test(phone)
}

/**
 * 验证邮箱格式
 *
 * @param {string} email - 邮箱地址
 * @returns {boolean} 是否为有效邮箱
 */
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// ==================== 错误处理 ====================

/**
 * 错误处理帮助函数
 *
 * @param {Error} error - 错误对象
 * @param {string} [context=''] - 错误上下文
 */
function handleApiError(error, context = '') {
  console.error(`${context} API错误:`, error)

  if (error.message.includes('权限')) {
    alert('权限不足，请联系系统管理员')
  } else if (error.message.includes('网络')) {
    alert('网络连接异常，请检查网络后重试')
  } else {
    alert(`操作失败: ${error.message}`)
  }
}

// ==================== 页面初始化 ====================

/**
 * 页面初始化时自动检查权限
 */
document.addEventListener('DOMContentLoaded', function () {
  // 登录页面不需要检查权限
  if (window.location.pathname !== '/admin/login.html') {
    checkAdminPermission()
  }
})
