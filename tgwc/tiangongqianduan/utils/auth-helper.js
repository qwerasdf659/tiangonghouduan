/**
 * 🔐 认证助手模块 - V4.0统一认证系统
 *
 * @file 提取认证检查逻辑,消除页面重复代码
 * @version 1.0.0
 * @author Restaurant Lottery Team
 * @since 2025-10-14
 *
 * 📋 功能清单:
 * - checkAuth() - 检查用户登录状态
 * - checkAdmin() - 检查管理员权限
 * - getAccessToken() - 获取当前access_token
 * - getUserInfo() - 获取当前用户信息
 * - clearAuthData() - 清理认证数据
 */

// 🔧 延迟获取app实例,避免模块加载时调用getApp()
let appInstance = null
function getAppInstance() {
  if (!appInstance && typeof getApp !== 'undefined') {
    try {
      appInstance = getApp()
    } catch (error) {
      console.warn('⚠️ 无法获取App实例:', error)
    }
  }
  return appInstance
}

/**
 * 🔐 检查用户登录状态
 *
 * @param {object} options - 配置选项
 * @param {boolean} options.redirect - 未登录时是否自动跳转到登录页 (默认true)
 * @param {String} options.redirectUrl - 自定义跳转URL (默认'/pages/auth/auth')
 * @param {Boolean} options.showToast - 未登录时是否显示提示 (默认false)
 * @returns {Boolean} 是否已登录
 *
 * @example
 * // 基础用法
 * if (!checkAuth()) return;
 *
 * // 自定义配置
 * if (!checkAuth({ redirect: false, showToast: true })) {
 *   console.log('用户未登录');
 *   return;
 * }
 */
function checkAuth(options = {}) {
  const { redirect = true, redirectUrl = '/pages/auth/auth', showToast = false } = options

  // 🔴 V4.0规范: 从storage和全局状态检查access_token
  const token = wx.getStorageSync('access_token')
  const app = getAppInstance()
  const globalToken = app?.globalData?.access_token
  const isLoggedIn = app?.globalData?.isLoggedIn

  // 🔍 详细的登录状态检查
  const hasValidToken =
    token && typeof token === 'string' && token.trim() !== '' && token !== 'undefined'

  const isAuthenticated = hasValidToken && isLoggedIn && globalToken

  console.log('🔍 认证状态检查:', {
    hasToken: !!token,
    hasGlobalToken: !!globalToken,
    isLoggedIn,
    isAuthenticated
  })

  // ❌ 未登录处理
  if (!isAuthenticated) {
    console.warn('⚠️ 用户未登录或Token无效')

    if (showToast) {
      wx.showToast({
        title: '请先登录',
        icon: 'none',
        duration: 2000
      })
    }

    if (redirect) {
      console.log('🔄 跳转到登录页:', redirectUrl)
      // 使用redirectTo清空页面栈,确保用户必须重新登录
      wx.redirectTo({
        url: redirectUrl,
        fail: error => {
          console.error('❌ 跳转登录页失败:', error)
          // 备用方案: 使用reLaunch
          wx.reLaunch({
            url: redirectUrl
          })
        }
      })
    }

    return false
  }

  console.log('✅ 认证检查通过')
  return true
}

/**
 * 🔐 检查管理员权限
 *
 * @param {object} options - 配置选项
 * @param {boolean} options.showToast - 无权限时是否显示提示 (默认true)
 * @param {boolean} options.navigateBack - 无权限时是否返回上一页 (默认true)
 * @returns {Boolean} 是否为管理员
 *
 * @example
 * // 基础用法
 * if (!checkAdmin()) return;
 *
 * // 自定义配置
 * if (!checkAdmin({ showToast: true, navigateBack: false })) {
 *   console.log('用户无管理员权限');
 *   return;
 * }
 */
function checkAdmin(options = {}) {
  const { showToast = true, navigateBack = true } = options

  // 🔴 先检查登录状态
  if (!checkAuth({ redirect: true, showToast: false })) {
    return false
  }

  // 🔴 V4.0规范: 从JWT Token和用户信息检查管理员标识
  const app = getAppInstance()
  const userInfo = app?.globalData?.userInfo || wx.getStorageSync('user_info')

  // 🔍 检查管理员标识 - V4.0标准: is_admin 或 role_level >= 100
  const isAdmin = userInfo?.is_admin === true || userInfo?.role_level >= 100

  console.log('🔍 管理员权限检查:', {
    hasUserInfo: !!userInfo,
    is_admin: userInfo?.is_admin,
    role_level: userInfo?.role_level,
    isAdmin
  })

  // ❌ 无权限处理
  if (!isAdmin) {
    console.warn('⚠️ 用户无管理员权限')

    if (showToast) {
      wx.showToast({
        title: '无权限访问',
        icon: 'none',
        duration: 2000
      })
    }

    if (navigateBack) {
      setTimeout(() => {
        wx.navigateBack({
          fail: () => {
            // 如果无法返回,跳转到首页
            wx.switchTab({
              url: '/pages/lottery/lottery'
            })
          }
        })
      }, 1500)
    }

    return false
  }

  console.log('✅ 管理员权限检查通过')
  return true
}

/**
 * 🔑 获取当前access_token
 *
 * @returns {string | null} access_token或null
 *
 * @example
 * const token = getAccessToken();
 * if (token) {
 *   console.log('Token:', token);
 * }
 */
function getAccessToken() {
  const token = wx.getStorageSync('access_token')
  return token || null
}

/**
 * 👤 获取当前用户信息
 *
 * @returns {Object | null} 用户信息对象或null
 *
 * @example
 * const userInfo = getUserInfo();
 * if (userInfo) {
 *   console.log('用户昵称:', userInfo.nickname);
 *   console.log('用户ID:', userInfo.user_id);
 * }
 */
function getUserInfo() {
  const app = getAppInstance()
  const userInfo = app?.globalData?.userInfo || wx.getStorageSync('user_info')
  return userInfo || null
}

/**
 * 🧹 清理认证数据
 *
 * @param {Object} options - 配置选项
 * @param {Boolean} options.clearStorage - 是否清理本地存储 (默认true)
 * @param {Boolean} options.clearGlobal - 是否清理全局状态 (默认true)
 *
 * @example
 * // 退出登录时清理所有认证数据
 * clearAuthData();
 *
 * // 只清理全局状态
 * clearAuthData({ clearStorage: false });
 */
function clearAuthData(options = {}) {
  const { clearStorage = true, clearGlobal = true } = options

  console.log('🧹 清理认证数据:', options)

  // 清理本地存储
  if (clearStorage) {
    try {
      wx.removeStorageSync('access_token')
      wx.removeStorageSync('refresh_token')
      wx.removeStorageSync('user_info')
      console.log('✅ 本地存储已清理')
    } catch (error) {
      console.error('❌ 清理本地存储失败:', error)
    }
  }

  // 清理全局状态
  if (clearGlobal) {
    try {
      const app = getAppInstance()
      if (app && app.globalData) {
        app.globalData.access_token = null
        app.globalData.refresh_token = null
        app.globalData.userInfo = null
        app.globalData.isLoggedIn = false
        app.globalData.points_balance = 0
        console.log('✅ 全局状态已清理')
      }
    } catch (error) {
      console.error('❌ 清理全局状态失败:', error)
    }
  }

  console.log('✅ 认证数据清理完成')
}

// 🔴 refreshToken 函数已删除
// 原因：api.js 的 APIClient 类已有完整的 Token 自动刷新机制 (handleTokenExpired)
// Token 过期时会自动触发刷新，无需手动调用
// 参考文档：《auth-helper循环依赖问题解决方案文档.md》 - 方案1

// ============================================================================
// 🔴 导出模块
// ============================================================================

module.exports = {
  // 认证检查
  checkAuth,
  checkAdmin,

  // Token管理
  getAccessToken,
  // refreshToken 已删除 - 使用 api.js 的 APIClient.handleTokenExpired() 自动刷新机制

  // 用户信息
  getUserInfo,

  // 数据清理
  clearAuthData
}
