/**
 * API 基础请求封装
 * 提供统一的 HTTP 请求方法，支持 Token 管理、错误处理等
 *
 * @module api/base
 * @since 2026-01-23
 */

// ============================================================================
// 类型定义 - API 通用类型
// ============================================================================

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

// ============================================================================
// Token 管理
// ============================================================================

const TOKEN_KEY = 'admin_token'

/**
 * 获取存储的 Token
 * @returns {string|null} Token 字符串或 null
 */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

/**
 * 设置 Token
 * @param {string} token - Token 字符串
 */
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

/**
 * 清除 Token
 */
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
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
 * 统一请求函数
 * @param {Object} options - 请求配置
 * @param {string} options.url - 请求 URL
 * @param {string} [options.method='GET'] - 请求方法
 * @param {Object} [options.data] - 请求数据
 * @param {Object} [options.params] - 查询参数
 * @param {Object} [options.pathParams] - 路径参数
 * @param {Object} [options.headers] - 自定义请求头
 * @async
 * @returns {Promise<Object>} 响应数据
 * @throws {Error} 未授权，请重新登录（401 错误时自动跳转登录页）
 * @throws {Error} 网络请求失败或服务器错误
 * @throws {Error} 响应解析失败
 */
export async function request(options) {
  const { url, method = 'GET', data, params, pathParams, headers = {} } = options

  // 构建完整 URL
  let fullUrl = pathParams ? buildURL(url, pathParams) : url
  if (params) {
    fullUrl += buildQueryString(params)
  }

  // 准备请求头
  const requestHeaders = {
    'Content-Type': 'application/json',
    ...headers
  }

  // 添加 Token
  const token = getToken()
  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`
  }

  // 准备请求配置
  const requestConfig = {
    method,
    headers: requestHeaders
  }

  // 添加请求体
  if (data && method !== 'GET') {
    requestConfig.body = JSON.stringify(data)
  }

  try {
    const response = await fetch(fullUrl, requestConfig)

    // 处理 401 未授权
    if (response.status === 401) {
      clearToken()
      // 跳转到登录页
      if (window.location.pathname !== '/admin/login.html') {
        window.location.href = '/admin/login.html'
      }
      throw new Error('未授权，请重新登录')
    }

    // 解析响应
    const result = await response.json()

    // 检查业务错误
    if (!response.ok) {
      throw new Error(result.message || `请求失败: ${response.status}`)
    }

    return result
  } catch (error) {
    console.error(`❌ API 请求失败: ${fullUrl}`, error)
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
   * @throws {Error} 网络请求失败或服务器错误
   */
  get: (url, params, options = {}) => request({ url, method: 'GET', params, ...options }),

  /**
   * POST 请求
   * @param {string} url - 请求 URL
   * @param {Object} [data] - 请求数据
   * @param {Object} [options] - 其他配置
   * @throws {Error} 请求数据验证失败
   * @throws {Error} 网络请求失败或服务器错误
   */
  post: (url, data, options = {}) => request({ url, method: 'POST', data, ...options }),

  /**
   * PUT 请求
   * @param {string} url - 请求 URL
   * @param {Object} [data] - 请求数据
   * @param {Object} [options] - 其他配置
   * @throws {Error} 资源不存在
   * @throws {Error} 网络请求失败或服务器错误
   */
  put: (url, data, options = {}) => request({ url, method: 'PUT', data, ...options }),

  /**
   * PATCH 请求
   * @param {string} url - 请求 URL
   * @param {Object} [data] - 请求数据
   * @param {Object} [options] - 其他配置
   * @throws {Error} 资源不存在
   * @throws {Error} 网络请求失败或服务器错误
   */
  patch: (url, data, options = {}) => request({ url, method: 'PATCH', data, ...options }),

  /**
   * DELETE 请求
   * @param {string} url - 请求 URL
   * @param {Object} [options] - 其他配置
   * @throws {Error} 资源不存在或无法删除
   * @throws {Error} 网络请求失败或服务器错误
   */
  delete: (url, options = {}) => request({ url, method: 'DELETE', ...options })
}

export default {
  getToken,
  setToken,
  clearToken,
  buildQueryString,
  buildURL,
  request,
  http
}
