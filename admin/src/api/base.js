/**
 * API 基础请求封装
 * 提供统一的 HTTP 请求方法，支持 Token 管理、错误处理等
 *
 * @module api/base
 * @since 2026-01-23
 * @updated 2026-01-29 - 添加 API 版本常量
 */

import { logger } from '../utils/logger.js'

/*
 * ============================================================================
 * API 版本配置
 * ============================================================================
 */

/**
 * API 版本号
 * @description 统一管理 API 版本，便于全局升级
 * @constant {string}
 */
export const API_VERSION = 'v4'

/**
 * API 基础路径前缀
 * @constant {string}
 */
export const API_PREFIX = `/api/${API_VERSION}`

/*
 * ============================================================================
 * 类型定义 - API 通用类型
 * ============================================================================
 */

/**
 * 标准 API 响应结构
 * @typedef {Object} ApiResponse
 * @property {boolean} success - 请求是否成功
 * @property {string} code - 业务状态码（如 'SUCCESS', 'NOT_FOUND', 'UNAUTHORIZED'）
 * @property {string} message - 响应消息
 * @property {*} [data] - 响应数据（成功时返回）
 * @property {string} [timestamp] - 响应时间戳（ISO 8601 格式）
 * @property {string} [request_id] - 请求追踪 ID
 */

/**
 * 分页响应数据结构
 * @typedef {Object} PaginatedData
 * @property {Array} list - 数据列表
 * @property {number} total - 总记录数
 * @property {number} page - 当前页码
 * @property {number} page_size - 每页数量
 * @property {number} total_pages - 总页数
 */

/**
 * 分页请求参数
 * @typedef {Object} PaginationParams
 * @property {number} [page=1] - 页码（从 1 开始）
 * @property {number} [page_size=20] - 每页数量（默认 20，最大 100）
 */

/**
 * 排序参数
 * @typedef {Object} SortParams
 * @property {string} [sort_by] - 排序字段
 * @property {'asc'|'desc'} [sort_order='desc'] - 排序方向
 */

/**
 * 时间范围筛选参数
 * @typedef {Object} DateRangeParams
 * @property {string} [start_date] - 开始日期（ISO 8601 格式）
 * @property {string} [end_date] - 结束日期（ISO 8601 格式）
 */

/**
 * HTTP 请求配置选项
 * @typedef {Object} RequestOptions
 * @property {string} url - 请求 URL
 * @property {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} [method='GET'] - 请求方法
 * @property {Object} [data] - 请求体数据（POST/PUT/PATCH）
 * @property {Object} [params] - 查询参数
 * @property {Object} [pathParams] - 路径参数（用于替换 URL 中的 :param）
 * @property {Object} [headers] - 自定义请求头
 */

/**
 * API 错误信息
 * @typedef {Object} ApiError
 * @property {string} code - 错误码
 * @property {string} message - 错误消息
 * @property {Object} [details] - 错误详情
 * @property {string} [request_id] - 请求追踪 ID
 */

/**
 * 用户信息基础结构
 * @typedef {Object} UserBasicInfo
 * @property {number} user_id - 用户 ID
 * @property {string} mobile - 手机号
 * @property {string} [nickname] - 昵称
 * @property {string} [avatar] - 头像 URL
 * @property {string} status - 用户状态（active/inactive/banned）
 */

/**
 * 操作结果响应
 * @typedef {Object} OperationResult
 * @property {boolean} success - 操作是否成功
 * @property {string} message - 结果消息
 * @property {number} [affected_count] - 影响的记录数
 */

/*
 * ============================================================================
 * Token 管理
 * 策略：localStorage 存储 Token + Session Cookie 标记浏览器会话
 * - 同一浏览器窗口内的多个标签页共享登录状态（Cookie 跨标签页共享）
 * - 关闭整个浏览器后需要重新登录（Session Cookie 自动清除）
 * ============================================================================
 */

const TOKEN_KEY = 'admin_token'
const USER_KEY = 'admin_user'
const SESSION_COOKIE_NAME = 'admin_browser_session'

/**
 * 获取 Cookie 值
 * @param {string} name - Cookie 名称
 * @returns {string|null} Cookie 值或 null
 */
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

/**
 * 设置 Session Cookie（关闭浏览器后自动清除）
 * @param {string} name - Cookie 名称
 * @param {string} value - Cookie 值
 * @returns {void} 无返回值
 */
function setSessionCookie(name, value) {
  // 不设置 expires 或 max-age，这样就是 Session Cookie，关闭浏览器后自动清除
  document.cookie = `${name}=${value}; path=/; SameSite=Lax`
}

/**
 * 删除 Cookie
 * @param {string} name - Cookie 名称
 * @returns {void} 无返回值
 */
function deleteCookie(name) {
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

/**
 * 检查并初始化浏览器会话
 * @description 使用 Session Cookie 检测浏览器是否被关闭过
 * @returns {void} 无返回值
 */
export function checkBrowserSession() {
  const hasSessionCookie = getCookie(SESSION_COOKIE_NAME)
  const hasToken = localStorage.getItem(TOKEN_KEY)

  if (hasToken && !hasSessionCookie) {
    /*
     * localStorage 有 token 但没有 Session Cookie
     * 说明浏览器曾被关闭（Cookie 已自动清除），需要重新登录
     */
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    logger.info('[Auth] 检测到浏览器已重启，已清除登录数据')
  }

  // 设置/刷新 Session Cookie（确保当前浏览器会话有效）
  if (hasToken || hasSessionCookie) {
    setSessionCookie(SESSION_COOKIE_NAME, 'active')
  }
}

/**
 * 获取存储的 Token
 * @description 使用 localStorage 存储，跨标签页共享；结合 sessionStorage 检测浏览器会话
 * @returns {string|null} Token 字符串或 null
 */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

/**
 * 设置 Token
 * @description 存储到 localStorage（跨标签页共享），同时设置 Session Cookie
 * @param {string} token - Token 字符串
 * @returns {void} 无返回值
 */
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
  setSessionCookie(SESSION_COOKIE_NAME, 'active')
}

/**
 * 清除 Token
 * @returns {void} 无返回值
 */
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  deleteCookie(SESSION_COOKIE_NAME)
}

/**
 * 获取存储的用户信息
 * @returns {Object|null} 用户信息对象或 null
 */
export function getUser() {
  const userStr = localStorage.getItem(USER_KEY)
  if (!userStr) return null
  try {
    return JSON.parse(userStr)
  } catch {
    return null
  }
}

/**
 * 设置用户信息
 * @param {Object} user - 用户信息对象
 * @returns {void} 无返回值
 */
export function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

/**
 * 清除用户信息
 * @returns {void} 无返回值
 */
export function clearUser() {
  localStorage.removeItem(USER_KEY)
}

/*
 * ============================================================================
 * 设备标识（设备级多会话，docs/会话认证体系最终方案-设备级多会话.md 第七节）
 * - 前端生成并持久化一个 UUID 作为 device_id，所有请求带 X-Device-Id 头
 * - 后端据 (user_id, device_id) 做会话隔离：同设备重登替换、不同设备并存不互踢
 * - device_id 不参与安全判定，仅用于隔离与"我的设备列表"展示
 * ============================================================================
 */

const DEVICE_ID_KEY = 'admin_device_id'

/**
 * 获取（或首次生成并持久化）当前浏览器的设备标识
 * @returns {string} 设备 UUID
 */
export function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) {
    // 优先用标准 crypto.randomUUID（本项目目标浏览器均支持），降级用时间戳+随机串
    const cryptoObj = typeof window !== 'undefined' ? window.crypto : undefined
    deviceId =
      cryptoObj && cryptoObj.randomUUID
        ? cryptoObj.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }
  return deviceId
}

/**
 * 构建查询字符串
 * @param {Object} params - 查询参数对象
 * @returns {string} 查询字符串
 */
export function buildQueryString(params = {}) {
  const filtered = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})

  if (Object.keys(filtered).length === 0) {
    return ''
  }

  return '?' + new URLSearchParams(filtered).toString()
}

/**
 * 构建完整 URL（处理路径参数）
 * @param {string} endpoint - API 端点（如 /api/v4/users/:user_id）
 * @param {Object} pathParams - 路径参数对象
 * @returns {string} 完整 URL
 *
 * @example
 * buildURL('/api/v4/users/:user_id', { user_id: 123 })
 * // 返回: '/api/v4/users/123'
 */
export function buildURL(endpoint, pathParams = {}) {
  let url = endpoint

  Object.entries(pathParams).forEach(([key, value]) => {
    url = url.replace(`:${key}`, encodeURIComponent(value))
  })

  return url
}

/**
 * 构建带版本的 API URL
 * @param {string} path - API 路径（不含版本前缀，如 /users/:user_id）
 * @param {Object} [pathParams] - 路径参数对象
 * @returns {string} 完整 URL
 *
 * @example
 * buildApiURL('/users/:user_id', { user_id: 123 })
 * // 返回: '/api/v4/users/123'
 */
export function buildApiURL(path, pathParams = {}) {
  const endpoint = `${API_PREFIX}${path}`
  return buildURL(endpoint, pathParams)
}

/**
 * 统一请求函数
 * @param {Object} options - 请求配置
 * @param {string} options.url - 请求 URL
 * @param {string} [options.method='GET'] - 请求方法
 * @param {Object|FormData} [options.data] - 请求数据（JSON 对象或 FormData 实例）
 * @param {Object} [options.params] - 查询参数
 * @param {Object} [options.pathParams] - 路径参数
 * @param {Object} [options.headers] - 自定义请求头
 * @param {'json'|'blob'} [options.responseType='json'] - 响应类型（blob 用于文件下载）
 * @async
 * @returns {Promise<Object|Blob>} 响应数据（JSON 对象或 Blob）
 * @throws {Error} 未授权，请重新登录（401 错误时自动跳转登录页）
 * @throws {Error} 网络请求失败或服务器错误
 * @throws {Error} 响应解析失败
 */
export async function request(options) {
  const {
    url,
    method = 'GET',
    data,
    params,
    pathParams,
    headers = {},
    responseType = 'json'
  } = options

  let fullUrl = pathParams ? buildURL(url, pathParams) : url
  if (params) {
    fullUrl += buildQueryString(params)
  }

  const isFormData = data instanceof FormData
  const requestHeaders = { ...headers }

  /* FormData 时不设置 Content-Type，浏览器自动添加 multipart/form-data + boundary */
  if (!isFormData) {
    requestHeaders['Content-Type'] = 'application/json'
  }

  const token = getToken()
  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`
  }

  // 设备级多会话：所有请求注入 X-Device-Id（值取/生成自 localStorage）
  requestHeaders['X-Device-Id'] = getDeviceId()

  const requestConfig = {
    method,
    headers: requestHeaders
  }

  if (data && method !== 'GET') {
    requestConfig.body = isFormData ? data : JSON.stringify(data)
  }

  try {
    const response = await fetch(fullUrl, requestConfig)

    if (response.status === 401) {
      let errorCode = 'UNAUTHORIZED'
      let errorMessage = '未授权，请重新登录'
      try {
        const errorData = await response.clone().json()
        errorCode = errorData.code || errorCode
        errorMessage = errorData.message || errorMessage
      } catch (_) {
        // 响应体解析失败，使用默认值
      }

      clearToken()

      if (window.location.pathname !== '/admin/login.html') {
        const qp = new URLSearchParams({ reason: errorCode })
        /*
         * 会话失效类错误码统一把后端 message 透传给登录页展示（设备级多会话）：
         * SESSION_REVOKED（设备管理踢下线/登出/同设备替换）/ SESSION_EXPIRED（超时）/ SESSION_NOT_FOUND（记录清理）
         */
        const SESSION_ERROR_CODES = ['SESSION_REVOKED', 'SESSION_EXPIRED', 'SESSION_NOT_FOUND']
        if (SESSION_ERROR_CODES.includes(errorCode) && errorMessage !== '未授权，请重新登录') {
          qp.set('message', errorMessage)
        }
        const redirectUrl = `/admin/login.html?${qp.toString()}`
        if (window.self !== window.top) {
          try {
            window.top.location.href = redirectUrl
          } catch (e) {
            logger.warn('[Auth] 无法直接跳转顶层窗口，尝试 postMessage', e)
            window.parent.postMessage(
              { type: 'AUTH_EXPIRED', redirect: redirectUrl, code: errorCode },
              '*'
            )
          }
        } else {
          window.location.href = redirectUrl
        }
      }
      throw new Error(errorMessage)
    }

    /* Blob 响应（文件下载场景） */
    if (responseType === 'blob') {
      if (!response.ok) {
        throw new Error(`文件下载失败: ${response.status}`)
      }
      return await response.blob()
    }

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.message || `请求失败: ${response.status}`)
    }

    return result
  } catch (error) {
    logger.error(`❌ API 请求失败: ${fullUrl}`, error)
    throw error
  }
}

/**
 * HTTP 方法封装
 */
export const http = {
  /**
   * GET 请求
   * @param {string} url - 请求 URL
   * @param {Object} [params] - 查询参数
   * @param {Object} [options] - 其他配置
   * @returns {Promise<Object>} API 响应数据
   * @throws {Error} 网络请求失败或服务器错误
   */
  get: (url, params, options = {}) => request({ url, method: 'GET', params, ...options }),

  /**
   * POST 请求
   * @param {string} url - 请求 URL
   * @param {Object} [data] - 请求数据
   * @param {Object} [options] - 其他配置
   * @returns {Promise<Object>} API 响应数据
   * @throws {Error} 请求数据验证失败
   * @throws {Error} 网络请求失败或服务器错误
   */
  post: (url, data, options = {}) => request({ url, method: 'POST', data, ...options }),

  /**
   * PUT 请求
   * @param {string} url - 请求 URL
   * @param {Object} [data] - 请求数据
   * @param {Object} [options] - 其他配置
   * @returns {Promise<Object>} API 响应数据
   * @throws {Error} 资源不存在
   * @throws {Error} 网络请求失败或服务器错误
   */
  put: (url, data, options = {}) => request({ url, method: 'PUT', data, ...options }),

  /**
   * PATCH 请求
   * @param {string} url - 请求 URL
   * @param {Object} [data] - 请求数据
   * @param {Object} [options] - 其他配置
   * @returns {Promise<Object>} API 响应数据
   * @throws {Error} 资源不存在
   * @throws {Error} 网络请求失败或服务器错误
   */
  patch: (url, data, options = {}) => request({ url, method: 'PATCH', data, ...options }),

  /**
   * DELETE 请求
   * @param {string} url - 请求 URL
   * @param {Object} [options] - 其他配置
   * @returns {Promise<Object>} API 响应数据
   * @throws {Error} 资源不存在或无法删除
   * @throws {Error} 网络请求失败或服务器错误
   */
  delete: (url, options = {}) => request({ url, method: 'DELETE', ...options })
}

/*
 * ============================================================================
 * 简化API调用辅助函数
 * ============================================================================
 */

/**
 * 生成带Token的认证请求头
 * @returns {Object} 包含Authorization和Content-Type的请求头对象
 * @example
 * const headers = authHeaders()
 * // { 'Content-Type': 'application/json', 'Authorization': 'Bearer xxx' }
 */
export function authHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  }
  const token = getToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  // 设备级多会话：注入 X-Device-Id（与 request() 保持一致）
  headers['X-Device-Id'] = getDeviceId()
  return headers
}

/**
 * 处理fetch响应，统一错误处理
 * @param {Response} response - fetch响应对象
 * @returns {Promise<Object>} 解析后的JSON数据
 * @throws {Error} 响应状态非2xx或解析失败
 * @example
 * const response = await fetch(url, { headers: authHeaders() })
 * const data = await handleResponse(response)
 */
export async function handleResponse(response) {
  // 处理 401 未授权（区分会话失效原因）
  if (response.status === 401) {
    let errorCode = 'UNAUTHORIZED'
    let errorMessage = '未授权，请重新登录'
    try {
      const errorData = await response.clone().json()
      errorCode = errorData.code || errorCode
      errorMessage = errorData.message || errorMessage
    } catch (_) {
      // 响应体解析失败
    }

    clearToken()
    if (window.location.pathname !== '/admin/login.html') {
      const params = new URLSearchParams({ reason: errorCode })
      // 会话失效类错误码统一透传后端 message（设备级多会话）
      const SESSION_ERROR_CODES = ['SESSION_REVOKED', 'SESSION_EXPIRED', 'SESSION_NOT_FOUND']
      if (SESSION_ERROR_CODES.includes(errorCode) && errorMessage !== '未授权，请重新登录') {
        params.set('message', errorMessage)
      }
      const redirectUrl = `/admin/login.html?${params.toString()}`
      if (window.self !== window.top) {
        try {
          window.top.location.href = redirectUrl
        } catch (_e) {
          window.parent.postMessage(
            { type: 'AUTH_EXPIRED', redirect: redirectUrl, code: errorCode },
            '*'
          )
        }
      } else {
        window.location.href = redirectUrl
      }
    }
    throw new Error(errorMessage)
  }

  // 解析响应
  const result = await response.json()

  // 检查业务错误
  if (!response.ok) {
    throw new Error(result.message || `请求失败: ${response.status}`)
  }

  return result
}

export default {
  API_VERSION,
  API_PREFIX,
  getToken,
  setToken,
  clearToken,
  buildQueryString,
  buildURL,
  buildApiURL,
  request,
  http,
  authHeaders,
  handleResponse
}
