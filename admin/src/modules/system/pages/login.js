/**
 * 登录页面 - Alpine.js 组件
 *
 * @file admin/src/modules/system/pages/login.js
 * @module LoginPage
 * @version 3.0.0
 * @date 2026-01-23
 * @author Admin System
 *
 * @description
 * 管理员登录页面，提供以下功能：
 * - 手机号+验证码登录方式
 * - 登录状态检测和自动跳转
 * - 管理员权限验证（role_level >= 100 或 admin/super_admin角色）
 * - Token存储和用户信息缓存
 *
 * @note 登录页面不使用 auth-guard mixin，因为本身就是认证入口
 *       使用独立的 API 请求逻辑，不依赖 admin-common.js
 *
 * @requires USER_ENDPOINTS - 用户管理API端点配置
 *
 * @example
 * // HTML中使用
 * <form x-data="loginPage" @submit.prevent="handleLogin">
 *   <input x-model="phone" type="tel" placeholder="手机号">
 *   <input x-model="code" type="text" placeholder="验证码">
 *   <button type="submit" :disabled="loading">登录</button>
 * </form>
 */

import { logger } from '../../../utils/logger.js'
import { USER_ENDPOINTS } from '../../../api/user.js'
import { AUTH_ENDPOINTS } from '../../../api/auth.js'
import {
  getToken,
  setToken,
  clearToken,
  setUser,
  clearUser,
  checkBrowserSession,
  request
} from '../../../api/base.js'

/**
 * 登录页面Alpine.js组件工厂函数
 * @function loginPage
 * @returns {Object} Alpine.js组件配置对象
 *
 * @property {string} phone - 用户输入的手机号
 * @property {string} code - 用户输入的验证码
 * @property {boolean} loading - 是否正在加载/登录中
 * @property {string} message - 提示消息内容
 * @property {boolean} isError - 消息是否为错误类型
 */
function loginPage() {
  return {
    // ==================== 页面状态 ====================

    /** @type {string} 用户输入的手机号 */
    phone: '',

    /** @type {string} 用户输入的验证码 */
    code: '',

    /** @type {boolean} 是否正在加载/登录中 */
    loading: false,

    /** @type {string} 提示消息内容 */
    message: '',

    /** @type {boolean} 消息是否为错误类型 */
    isError: false,

    // ==================== 生命周期 ====================

    /**
     * 初始化登录页面
     * @method init
     * @description 组件挂载时自动调用，检测是否存在有效登录会话
     * @returns {void}
     *
     * @example
     * // Alpine.js自动调用
     * x-init="init()"
     */
    init() {
      logger.info('登录页面初始化 (v3.2)')
      checkBrowserSession()

      // 检查 URL 参数中的会话失效原因（由 401 拦截器传递）
      const urlParams = new URLSearchParams(window.location.search)
      const reason = urlParams.get('reason')
      if (reason) {
        const reasonMessages = {
          SESSION_REPLACED: '您的账号已在其他设备登录，请重新登录',
          SESSION_EXPIRED: '登录会话已过期，请重新登录',
          SESSION_NOT_FOUND: '登录状态已失效，请重新登录',
          TOKEN_EXPIRED: '登录已过期，请重新登录',
          INVALID_TOKEN: '登录凭证无效，请重新登录'
        }
        const msg = reasonMessages[reason]
        if (msg) {
          this.showMessage(msg, true)
          logger.info(`登录页显示会话失效原因: ${reason}`)
        }
        // 清除 URL 参数，避免刷新页面重复显示
        window.history.replaceState({}, '', '/admin/login.html')
      }

      this.checkExistingSession()
    },

    /**
     * 检查是否已存在有效会话
     * @method checkExistingSession
     * @async
     * @description
     * 检查sessionStorage中是否存在admin_token，并验证其有效性。
     * 如果token有效且用户是管理员，则自动跳转到仪表盘。
     * 如果token无效或已过期，则清除token并留在登录页。
     * 注意：使用sessionStorage存储，关闭浏览器后需要重新登录。
     * @returns {Promise<void>} 无返回值
     */
    async checkExistingSession() {
      const token = getToken()
      if (!token) {
        logger.debug('无现有token，留在登录页')
        return
      }

      logger.info('检测到现有token，验证有效性...')

      try {
        // 调用后端验证接口（使用统一 request()，自动注入 Token）
        const result = await request({ url: AUTH_ENDPOINTS.VERIFY })

        // 检查用户是否有管理员权限
        const userData = result.data
        const isAdmin = this.checkAdminAccess(userData)

        if (!isAdmin) {
          logger.warn('用户不具备管理员权限，清除token')
          clearToken()
          clearUser()
          this.showMessage('您没有管理后台访问权限', true)
          return
        }

        // Token有效且是管理员，跳转到仪表盘
        logger.info('Token验证成功，用户是管理员，准备跳转')
        this.showMessage('已登录，正在跳转...', false)
        setTimeout(() => {
          // 确保在顶层窗口跳转，避免 workspace 被嵌套
          const targetUrl = '/admin/workspace.html?fresh=1'
          if (window.self !== window.top) {
            window.top.location.href = targetUrl
          } else {
            window.location.href = targetUrl
          }
        }, 500)
      } catch (error) {
        logger.error('Token验证请求失败:', error)
        // 验证请求失败时，清除token让用户重新登录
        clearToken()
        clearUser()
      }
    },

    // ==================== 消息提示 ====================

    /**
     * 显示消息提示
     * @method showMessage
     * @param {string} msg - 要显示的消息内容
     * @param {boolean} [isError=false] - 是否为错误消息，影响样式显示
     * @returns {void}
     *
     * @example
     * // 显示成功消息
     * this.showMessage('登录成功', false)
     *
     * // 显示错误消息
     * this.showMessage('手机号格式错误', true)
     */
    showMessage(msg, isError = false) {
      this.message = msg
      this.isError = isError
    },

    /**
     * 清除消息提示
     * @method clearMessage
     * @description 重置消息内容和错误状态
     * @returns {void}
     */
    clearMessage() {
      this.message = ''
      this.isError = false
    },

    // ==================== 登录处理 ====================

    /**
     * 处理用户登录
     * @async
     * @method handleLogin
     * @description
     * 处理登录表单提交，完成以下流程：
     * 1. 验证手机号和验证码输入
     * 2. 调用后端登录API (POST /api/v4/auth/login)
     * 3. 存储返回的Token到sessionStorage（关闭浏览器后自动清除）
     * 4. 存储用户信息到sessionStorage
     * 5. 验证管理员权限
     * 6. 成功后跳转到仪表盘页面
     *
     * @returns {Promise<void>} 无返回值
     * @throws {Error} 登录失败时显示错误消息
     *
     * @example
     * // HTML表单中使用
     * <form @submit.prevent="handleLogin">...</form>
     */
    async handleLogin() {
      this.clearMessage()

      // 验证手机号
      if (!this.phone) {
        this.showMessage('请输入手机号', true)
        return
      }

      // 验证码
      if (!this.code) {
        this.showMessage('请输入验证码', true)
        return
      }

      this.loading = true

      try {
        // 发送登录请求（使用统一 request()）
        const result = await request({
          url: USER_ENDPOINTS.AUTH_LOGIN,
          method: 'POST',
          data: {
            mobile: this.phone,
            verification_code: this.code
          }
        })

        if (!result.success) {
          throw new Error(result.message || '登录失败')
        }

        // 登录成功
        const data = result.data
        const token = data.access_token || data.token

        if (!token) {
          throw new Error('服务器未返回有效的 Token')
        }

        // 存储 Token（使用 sessionStorage，关闭浏览器后自动清除）
        setToken(token)

        // 存储用户信息
        if (data.user) {
          setUser(data.user)
        }

        // 检查管理员权限
        const isAdmin = this.checkAdminAccess(data.user)
        if (!isAdmin) {
          clearToken()
          clearUser()
          throw new Error('您没有管理后台访问权限')
        }

        this.showMessage('登录成功，正在跳转...', false)

        // 跳转到仪表盘（确保在顶层窗口跳转，避免 workspace 被嵌套）
        setTimeout(() => {
          const targetUrl = '/admin/workspace.html?fresh=1'
          if (window.self !== window.top) {
            window.top.location.href = targetUrl
          } else {
            window.location.href = targetUrl
          }
        }, 500)
      } catch (error) {
        logger.error('登录失败:', error)
        this.showMessage(error.message || '登录失败，请稍后重试', true)
      } finally {
        this.loading = false
      }
    },

    /**
     * 检查用户是否具有后台访问权限
     * @method checkAdminAccess
     * @param {Object|null} user - 用户对象，来自登录API响应
     * @param {number} [user.role_level] - 用户角色等级
     * @param {Array<Object>} [user.roles] - 用户角色列表
     * @param {string} user.roles[].role_name - 角色名称
     * @param {number} user.roles[].role_level - 角色等级
     * @param {string} user.roles[].role_uuid - 角色UUID
     * @returns {boolean} 是否具有后台访问权限
     *
     * @description
     * 后台访问权限判断标准（2026-01-27 更新）：
     * - role_level > 0 即可登录后台
     * - 登录后根据 role_level 显示不同的菜单（权限过滤）
     *   - role_level >= 100: 管理员，看到所有菜单
     *   - role_level >= 30: 运营，看到运营相关菜单（只读）
     *   - role_level >= 1: 客服，只看到客服相关菜单
     *
     * @example
     * // 验证用户权限
     * const hasAccess = this.checkAdminAccess(userData)
     * if (!hasAccess) {
     *   throw new Error('无后台访问权限')
     * }
     */
    checkAdminAccess(user) {
      if (!user) return false

      // 方式1：检查 role_level（role_level > 0 即可登录后台）
      if (user.role_level > 0) {
        return true
      }

      // 方式2：检查 roles 对象数组中是否有任何有效角色
      if (Array.isArray(user.roles) && user.roles.length > 0) {
        // 任何 role_level > 0 的角色都允许登录
        const hasValidRole = user.roles.some(role => role.role_level > 0)
        if (hasValidRole) {
          return true
        }
      }

      return false
    }
  }
}

// ==================== Alpine.js 组件注册 ====================

/**
 * 注册Alpine.js组件
 * @description 监听alpine:init事件，注册loginPage组件到Alpine
 * @listens alpine:init
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('loginPage', loginPage)
  logger.info('[LoginPage] Alpine 组件已注册 (v3.0)')
})
