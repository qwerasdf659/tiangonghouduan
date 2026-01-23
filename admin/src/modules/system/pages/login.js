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
      logger.info('登录页面初始化 (v3.0)')
      this.checkExistingSession()
    },

    /**
     * 检查是否已存在有效会话
     * @method checkExistingSession
     * @description
     * 检查localStorage中是否存在admin_token，
     * 如果存在则认为用户已登录，显示提示后自动跳转到仪表盘。
     * @returns {void}
     */
    checkExistingSession() {
      const token = localStorage.getItem('admin_token')
      if (token) {
        // 已经登录，跳转到仪表盘
        this.showMessage('已登录，正在跳转...', false)
        setTimeout(() => {
          window.location.href = '/admin/dashboard.html'
        }, 500)
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
     * 3. 存储返回的Token到localStorage
     * 4. 存储用户信息到localStorage
     * 5. 验证管理员权限
     * 6. 成功后跳转到仪表盘页面
     *
     * @returns {Promise<void>}
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
        // 发送登录请求
        const response = await fetch(USER_ENDPOINTS.AUTH_LOGIN, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            mobile: this.phone,
            verification_code: this.code
          })
        })

        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.message || '登录失败')
        }

        // 登录成功
        const data = result.data
        const token = data.access_token || data.token

        if (!token) {
          throw new Error('服务器未返回有效的 Token')
        }

        // 存储 Token
        localStorage.setItem('admin_token', token)

        // 存储用户信息
        if (data.user) {
          localStorage.setItem('admin_user', JSON.stringify(data.user))
        }

        // 检查管理员权限
        const isAdmin = this.checkAdminAccess(data.user)
        if (!isAdmin) {
          localStorage.removeItem('admin_token')
          localStorage.removeItem('admin_user')
          throw new Error('您没有管理后台访问权限')
        }

        this.showMessage('登录成功，正在跳转...', false)

        // 跳转到仪表盘
        setTimeout(() => {
          window.location.href = '/admin/dashboard.html'
        }, 500)
      } catch (error) {
        logger.error('登录失败:', error)
        this.showMessage(error.message || '登录失败，请稍后重试', true)
      } finally {
        this.loading = false
      }
    },

    /**
     * 检查用户是否具有管理员访问权限
     * @method checkAdminAccess
     * @param {Object|null} user - 用户对象，来自登录API响应
     * @param {number} [user.role_level] - 用户角色等级，>=100为管理员
     * @param {Array<Object>} [user.roles] - 用户角色列表
     * @param {string} user.roles[].role_name - 角色名称
     * @param {number} user.roles[].role_level - 角色等级
     * @param {string} user.roles[].role_uuid - 角色UUID
     * @returns {boolean} 是否具有管理员权限
     *
     * @description
     * 管理员判断标准（以后端数据库为准）：
     * 1. 用户直接的 role_level >= 100
     * 2. 用户的 roles 数组中包含 role_name 为 'admin' 或 'super_admin' 的角色
     * 3. 用户的 roles 数组中包含 role_level >= 100 的角色
     *
     * @example
     * // 验证用户权限
     * const hasAccess = this.checkAdminAccess(userData)
     * if (!hasAccess) {
     *   throw new Error('无管理员权限')
     * }
     */
    checkAdminAccess(user) {
      if (!user) return false

      // 方式1：检查 role_level（后端标准：>= 100 为管理员）
      if (user.role_level >= 100) {
        return true
      }

      // 方式2：检查 roles 对象数组中是否包含管理员角色
      if (Array.isArray(user.roles) && user.roles.length > 0) {
        const adminRoles = ['admin', 'super_admin']
        const hasAdminRole = user.roles.some(
          role => adminRoles.includes(role.role_name) || role.role_level >= 100
        )
        if (hasAdminRole) {
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
