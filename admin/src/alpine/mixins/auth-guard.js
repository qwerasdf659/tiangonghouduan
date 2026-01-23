/**
 * 认证守卫 Mixin（ES Module 版本）
 *
 * @description 提供登录状态检查、权限验证和页面访问控制
 * @version 2.0.0
 * @date 2026-01-23
 *
 * @example
 * import { authGuardMixin } from '@/alpine/mixins/index.js'
 *
 * function protectedPage() {
 *   return {
 *     ...authGuardMixin(),
 *     init() {
 *       if (!this.checkAuth()) return
 *       this.loadData()
 *     }
 *   }
 * }
 */


import { logger } from '../../utils/logger.js'
import { getToken, clearToken } from '@/api/base.js'

export function authGuardMixin() {
  return {
    // ========== 用户状态 ==========

    /** 当前用户信息 */
    currentUser: null,

    /** 用户信息（向后兼容别名） */
    userInfo: null,

    /** 是否已认证 */
    isAuthenticated: false,

    // ========== 方法 ==========

    /**
     * 检查登录状态
     * 如果未登录则跳转到登录页
     *
     * @param {string} [redirectUrl='/login.html'] - 跳转地址
     * @returns {boolean} 是否已登录
     */
    checkAuth(redirectUrl = '/login.html') {
      const token = getToken()

      if (!token) {
        logger.warn('[AuthGuard] 用户未登录，跳转到登录页')
        window.location.href = redirectUrl
        return false
      }

      this.isAuthenticated = true

      // 加载用户信息
      this._loadUserInfo()

      return true
    },

    /**
     * 内部方法：加载用户信息到 currentUser 和 userInfo
     */
    _loadUserInfo() {
      try {
        const userInfoStr = localStorage.getItem('user_info') || localStorage.getItem('admin_user')
        if (userInfoStr) {
          const user = JSON.parse(userInfoStr)
          this.currentUser = user
          this.userInfo = user // 向后兼容
        }
      } catch (error) {
        logger.error('[AuthGuard] 加载用户信息失败:', error)
      }
    },

    /**
     * 获取当前用户信息
     * 从 localStorage 或 API 获取
     *
     * @returns {Object|null} 用户信息
     */
    getCurrentUser() {
      if (this.currentUser) {
        return this.currentUser
      }

      try {
        const userInfo = localStorage.getItem('user_info')
        if (userInfo) {
          this.currentUser = JSON.parse(userInfo)
          return this.currentUser
        }
      } catch (error) {
        logger.error('[AuthGuard] 解析用户信息失败:', error)
      }

      return null
    },

    /**
     * 检查用户是否有指定权限
     *
     * @param {string|Array} permissions - 权限名或权限列表
     * @param {boolean} [requireAll=false] - 是否需要全部权限
     * @returns {boolean}
     */
    hasPermission(permissions, requireAll = false) {
      const user = this.getCurrentUser()
      if (!user || !user.permissions) return false

      const permList = Array.isArray(permissions) ? permissions : [permissions]

      if (requireAll) {
        return permList.every(p => user.permissions.includes(p))
      }

      return permList.some(p => user.permissions.includes(p))
    },

    /**
     * 检查用户是否有指定角色
     *
     * @param {string|Array} roles - 角色名或角色列表
     * @returns {boolean}
     */
    hasRole(roles) {
      const user = this.getCurrentUser()
      if (!user || !user.role) return false

      const roleList = Array.isArray(roles) ? roles : [roles]
      return roleList.includes(user.role)
    },

    /**
     * 检查是否是管理员
     * @returns {boolean}
     */
    isAdmin() {
      return this.hasRole(['admin', 'super_admin'])
    },

    /**
     * 登出
     */
    logout() {
      clearToken()
      localStorage.removeItem('user_info')
      this.currentUser = null
      this.isAuthenticated = false
      window.location.href = '/login.html'
    },

    /**
     * 保存用户信息到 localStorage
     *
     * @param {Object} userInfo - 用户信息
     */
    setCurrentUser(userInfo) {
      this.currentUser = userInfo
      localStorage.setItem('user_info', JSON.stringify(userInfo))
    },

    /**
     * 刷新用户信息
     * 从 API 重新获取
     */
    async refreshUserInfo() {
      try {
        const response = await fetch('/api/v4/auth/me', {
          headers: { Authorization: `Bearer ${getToken()}` }
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data) {
            this.setCurrentUser(data.data)
          }
        }
      } catch (error) {
        logger.error('[AuthGuard] 刷新用户信息失败:', error)
      }
    }
  }
}
