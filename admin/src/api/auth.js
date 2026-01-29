/**
 * 认证 API 模块
 *
 * @module api/auth
 * @description 用户认证、登录、Token 管理相关 API
 * @version 1.1.0
 * @date 2026-01-23
 *
 * @example
 * // 方式1：直接导入 AuthAPI 对象
 * import { AuthAPI } from '@/api/auth.js'
 *
 * // 登录
 * const result = await AuthAPI.login('13612345678', '123456')
 *
 * // 方式2：从统一入口导入
 * import { AuthAPI } from '@/api/index.js'
 */

import { logger } from '../utils/logger.js'
import { API_PREFIX, request, getToken, setToken, clearToken } from './base.js'

// ========== API 端点 ==========

/**
 * 认证相关 API 端点常量
 *
 * @description 定义所有认证相关的 API 路径
 * @type {Object}
 * @property {string} LOGIN - [POST] 用户登录 - Body: { mobile, verification_code }
 * @property {string} REGISTER - [POST] 用户注册 - Body: { mobile, verification_code, ... }
 * @property {string} LOGOUT - [POST] 用户登出 - Header: Authorization
 * @property {string} VERIFY - [GET] 验证 Token 有效性 - Header: Authorization
 * @property {string} REFRESH - [POST] 刷新 Token - Cookie: refresh_token
 * @property {string} CONSOLE_LOGIN - [POST] 控制台登录 - Body: { mobile, verification_code }
 * @property {string} CONSOLE_LOGOUT - [POST] 控制台登出 - Header: Authorization
 */
export const AUTH_ENDPOINTS = {
  /** @type {string} [POST] 用户登录 */
  LOGIN: `${API_PREFIX}/auth/login`,
  /** @type {string} [POST] 用户注册 */
  REGISTER: `${API_PREFIX}/auth/register`,
  /** @type {string} [POST] 用户登出 */
  LOGOUT: `${API_PREFIX}/auth/logout`,
  /** @type {string} [GET] 验证 Token */
  VERIFY: `${API_PREFIX}/auth/verify`,
  /** @type {string} [POST] 刷新 Token */
  REFRESH: `${API_PREFIX}/auth/refresh`,

  // 控制台认证
  /** @type {string} [POST] 控制台登录 */
  CONSOLE_LOGIN: `${API_PREFIX}/console/auth/login`,
  /** @type {string} [POST] 控制台登出 */
  CONSOLE_LOGOUT: `${API_PREFIX}/console/auth/logout`
}

// ========== 类型定义 ==========

/**
 * @typedef {Object} LoginUserInfo
 * @description 登录成功后返回的用户信息
 * @property {number} user_id - 用户唯一标识
 * @property {string} mobile - 手机号
 * @property {string|null} nickname - 用户昵称（可能为空）
 * @property {number} role_level - 角色级别（>=100 为管理员）
 * @property {string[]} roles - 角色标识列表（如 ['user', 'admin']）
 * @property {string} status - 账户状态（'active' | 'inactive' | 'banned'）
 * @property {string|null} last_login - 最后登录时间（ISO 8601 格式）
 * @property {number} login_count - 登录次数
 */

/**
 * @typedef {Object} LoginResponse
 * @description 登录接口响应数据
 * @property {boolean} success - 请求是否成功
 * @property {string} code - 业务状态码
 * @property {string} message - 响应消息
 * @property {Object} data - 响应数据
 * @property {string} data.access_token - JWT 访问令牌（7天有效）
 * @property {LoginUserInfo} data.user - 用户信息对象
 * @property {boolean} data.is_new_user - 是否为新注册用户
 * @property {number} data.expires_in - Token 有效期（秒）
 * @property {string} data.timestamp - 响应时间戳（北京时间 ISO 8601）
 */

/**
 * @typedef {Object} VerifyTokenResponse
 * @description Token 验证接口响应数据
 * @property {boolean} success - 请求是否成功
 * @property {string} code - 业务状态码（'TOKEN_VALID'）
 * @property {string} message - 响应消息
 * @property {Object} data - 响应数据
 * @property {number} data.user_id - 用户ID
 * @property {string} data.mobile - 手机号
 * @property {string|null} data.nickname - 用户昵称
 * @property {string} data.status - 账户状态
 * @property {string[]} data.roles - 角色标识列表
 * @property {number} data.role_level - 角色级别（>=100 为管理员）
 * @property {string} data.created_at - 注册时间（ISO 8601）
 * @property {string|null} data.last_login - 最后登录时间（ISO 8601）
 * @property {number} data.login_count - 登录次数
 * @property {boolean} data.valid - Token 有效标识
 * @property {boolean} data.token_valid - Token 有效标识（新字段）
 * @property {string} data.timestamp - 响应时间戳
 */

/**
 * @typedef {Object} RegisterData
 * @description 用户注册请求数据
 * @property {string} mobile - 手机号（必填，11位）
 * @property {string} verification_code - 短信验证码（必填）
 * @property {string} [nickname] - 用户昵称（可选）
 * @property {string} [avatar_url] - 头像URL（可选）
 */

// ========== API 调用方法 ==========

/**
 * 认证 API 服务对象
 *
 * @description 提供用户认证相关的所有 API 方法
 * @namespace AuthAPI
 */
export const AuthAPI = {
  /**
   * 用户登录
   *
   * @description 使用手机号和验证码登录，支持自动注册新用户
   * @async
   * @memberof AuthAPI
   * @param {string} mobile - 手机号（11位数字）
   * @param {string} verification_code - 短信验证码（开发环境使用 123456）
   * @returns {Promise<LoginResponse>} 登录响应对象
   *
   * @throws {Error} MOBILE_REQUIRED - 手机号为空
   * @throws {Error} VERIFICATION_CODE_REQUIRED - 验证码为空
   * @throws {Error} INVALID_VERIFICATION_CODE - 验证码错误
   * @throws {Error} USER_INACTIVE - 用户账户已被禁用
   *
   * @example
   * // 基本登录
   * const result = await AuthAPI.login('13612345678', '123456')
   * if (result.success) {
   *   logger.info('登录成功', result.data.user)
   *   // Token 已自动保存到 localStorage
   * }
   *
   * @example
   * // 处理新用户自动注册
   * const result = await AuthAPI.login('13612345678', '123456')
   * if (result.success && result.data.is_new_user) {
   *   logger.info('新用户已自动注册并登录')
   *   // 可引导用户完善资料
   * }
   *
   * @example
   * // 错误处理
   * try {
   *   const result = await AuthAPI.login('13612345678', '123456')
   *   if (!result.success) {
   *     switch (result.code) {
   *       case 'INVALID_VERIFICATION_CODE':
   *         showToast('验证码错误')
   *         break
   *       case 'USER_INACTIVE':
   *         showToast('账户已被禁用，请联系客服')
   *         break
   *       default:
   *         showToast(result.message)
   *     }
   *   }
   * } catch (error) {
   *   logger.error('网络错误', error)
   * }
   */
  async login(mobile, verification_code) {
    const result = await request({
      url: AUTH_ENDPOINTS.LOGIN,
      method: 'POST',
      data: { mobile, verification_code }
    })

    // 登录成功后保存 Token
    if (result.success && result.data?.access_token) {
      setToken(result.data.access_token)
    }

    return result
  },

  /**
   * 控制台登录（管理员登录）
   *
   * @description 管理后台专用登录接口，需要管理员权限（role_level >= 100）
   * @async
   * @memberof AuthAPI
   * @param {string} mobile - 管理员手机号（11位数字）
   * @param {string} verification_code - 短信验证码（开发环境使用 123456）
   * @returns {Promise<LoginResponse>} 登录响应对象
   *
   * @throws {Error} MOBILE_REQUIRED - 手机号为空
   * @throws {Error} INVALID_VERIFICATION_CODE - 验证码错误
   * @throws {Error} INSUFFICIENT_PERMISSION - 用户不具备管理员权限
   * @throws {Error} USER_INACTIVE - 用户账户已被禁用
   *
   * @example
   * // 管理员登录
   * const result = await AuthAPI.consoleLogin('13612345678', '123456')
   * if (result.success) {
   *   const { user } = result.data
   *   if (user.role_level >= 100) {
   *     logger.info('管理员登录成功', user.roles)
   *     // 跳转到管理后台
   *     window.location.href = '/admin/dashboard'
   *   }
   * }
   *
   * @example
   * // 权限检查
   * const result = await AuthAPI.consoleLogin('13612345678', '123456')
   * if (!result.success && result.code === 'INSUFFICIENT_PERMISSION') {
   *   showToast('您没有管理员权限，无法访问后台')
   * }
   */
  async consoleLogin(mobile, verification_code) {
    const result = await request({
      url: AUTH_ENDPOINTS.CONSOLE_LOGIN,
      method: 'POST',
      data: { mobile, verification_code }
    })

    if (result.success && result.data?.access_token) {
      setToken(result.data.access_token)
    }

    return result
  },

  /**
   * 用户注册
   *
   * @description 新用户注册接口（注：后端支持登录时自动注册，此接口为显式注册场景）
   * @async
   * @memberof AuthAPI
   * @param {RegisterData} data - 注册数据对象
   * @param {string} data.mobile - 手机号（必填，11位数字）
   * @param {string} data.verification_code - 短信验证码（必填）
   * @param {string} [data.nickname] - 用户昵称（可选）
   * @param {string} [data.avatar_url] - 头像URL（可选）
   * @returns {Promise<Object>} 注册响应对象
   *
   * @throws {Error} MOBILE_REQUIRED - 手机号为空
   * @throws {Error} MOBILE_EXISTS - 手机号已注册
   * @throws {Error} INVALID_VERIFICATION_CODE - 验证码错误
   *
   * @example
   * // 基本注册
   * const result = await AuthAPI.register({
   *   mobile: '13612345678',
   *   verification_code: '123456'
   * })
   *
   * @example
   * // 带昵称的注册
   * const result = await AuthAPI.register({
   *   mobile: '13612345678',
   *   verification_code: '123456',
   *   nickname: '新用户'
   * })
   * if (result.success) {
   *   showToast('注册成功，请登录')
   * }
   *
   * @example
   * // 处理已注册错误
   * const result = await AuthAPI.register({
   *   mobile: '13612345678',
   *   verification_code: '123456'
   * })
   * if (!result.success && result.code === 'MOBILE_EXISTS') {
   *   showToast('该手机号已注册，请直接登录')
   * }
   */
  async register(data) {
    return await request({
      url: AUTH_ENDPOINTS.REGISTER,
      method: 'POST',
      data
    })
  },

  /**
   * 用户登出
   *
   * @description 退出登录，清除本地 Token 和服务端会话
   * @async
   * @memberof AuthAPI
   * @returns {Promise<Object>} 登出响应对象
   *
   * @example
   * // 退出登录
   * const result = await AuthAPI.logout()
   * if (result.success) {
   *   // Token 已自动清除
   *   window.location.href = '/login'
   * }
   */
  async logout() {
    const result = await request({
      url: AUTH_ENDPOINTS.LOGOUT,
      method: 'POST'
    })

    // 登出后清除 Token
    clearToken()

    return result
  },

  /**
   * 控制台登出（管理员登出）
   *
   * @description 管理后台专用登出接口
   * @async
   * @memberof AuthAPI
   * @returns {Promise<Object>} 登出响应对象
   *
   * @example
   * // 管理员退出
   * await AuthAPI.consoleLogout()
   * window.location.href = '/admin/login'
   */
  async consoleLogout() {
    const result = await request({
      url: AUTH_ENDPOINTS.CONSOLE_LOGOUT,
      method: 'POST'
    })

    clearToken()

    return result
  },

  /**
   * 验证 Token 有效性
   *
   * @description 验证当前 Token 是否有效，并获取用户完整信息
   * @async
   * @memberof AuthAPI
   * @returns {Promise<VerifyTokenResponse>} Token 验证响应对象
   *
   * @throws {Error} MISSING_TOKEN - 未提供 Token
   * @throws {Error} INVALID_TOKEN - Token 无效或已过期
   * @throws {Error} USER_NOT_FOUND - 用户不存在
   * @throws {Error} USER_INACTIVE - 用户账户已被禁用
   *
   * @example
   * // 验证登录状态
   * const result = await AuthAPI.verifyToken()
   * if (result.success && result.data.token_valid) {
   *   logger.info('用户已登录', result.data.user_id)
   *   logger.info('角色级别', result.data.role_level)
   * } else {
   *   // Token 无效，跳转登录
   *   window.location.href = '/login'
   * }
   *
   * @example
   * // 检查管理员权限
   * const result = await AuthAPI.verifyToken()
   * if (result.success) {
   *   const isAdmin = result.data.role_level >= 100
   *   if (!isAdmin) {
   *     showToast('需要管理员权限')
   *     return
   *   }
   *   // 继续管理员操作...
   * }
   *
   * @example
   * // 页面初始化时验证
   * async function initPage() {
   *   const result = await AuthAPI.verifyToken()
   *   if (!result.success) {
   *     // 未登录或 Token 过期
   *     redirectToLogin()
   *     return
   *   }
   *   // 更新用户状态
   *   setUserState(result.data)
   * }
   */
  async verifyToken() {
    return await request({
      url: AUTH_ENDPOINTS.VERIFY,
      method: 'GET'
    })
  },

  /**
   * 刷新 Token
   *
   * @description 使用 refresh_token 刷新访问令牌（通过 HttpOnly Cookie 自动携带）
   * @async
   * @memberof AuthAPI
   * @returns {Promise<Object>} 刷新响应对象
   *
   * @throws {Error} REFRESH_TOKEN_REQUIRED - 未提供 refresh_token
   * @throws {Error} INVALID_REFRESH_TOKEN - refresh_token 无效
   *
   * @example
   * // Token 刷新
   * const result = await AuthAPI.refreshToken()
   * if (result.success) {
   *   // 新 Token 已自动保存
   *   logger.info('Token 已刷新')
   * } else {
   *   // 刷新失败，需要重新登录
   *   window.location.href = '/login'
   * }
   */
  async refreshToken() {
    const result = await request({
      url: AUTH_ENDPOINTS.REFRESH,
      method: 'POST'
    })

    if (result.success && result.data?.access_token) {
      setToken(result.data.access_token)
    }

    return result
  },

  /**
   * 检查是否已登录
   *
   * @description 检查本地是否存在有效的 Token（不验证服务端状态）
   * @memberof AuthAPI
   * @returns {boolean} 是否存在 Token
   *
   * @example
   * // 快速检查登录状态
   * if (!AuthAPI.isLoggedIn()) {
   *   window.location.href = '/login'
   * }
   *
   * @example
   * // 配合 verifyToken 使用
   * if (AuthAPI.isLoggedIn()) {
   *   // 有 Token，进一步验证有效性
   *   const result = await AuthAPI.verifyToken()
   *   if (!result.success) {
   *     // Token 已过期
   *     window.location.href = '/login'
   *   }
   * }
   */
  isLoggedIn() {
    return !!getToken()
  },

  /**
   * 获取当前 Token
   *
   * @description 获取存储在 localStorage 中的访问令牌
   * @memberof AuthAPI
   * @returns {string|null} Token 字符串或 null
   *
   * @example
   * // 获取 Token 用于自定义请求
   * const token = AuthAPI.getToken()
   * if (token) {
   *   fetch('/custom-api', {
   *     headers: {
   *         'Authorization': `Bearer ${token}`
   *     }
   *   })
   * }
   */
  getToken() {
    return getToken()
  }
}

export default AuthAPI
