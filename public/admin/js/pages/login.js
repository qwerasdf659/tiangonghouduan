/**
 * 登录页面 - Alpine.js CSP 版本
 * 
 * @file public/admin/js/pages/login.js
 * @description 使用 Alpine.js CSP 版本重写的登录页面逻辑
 * @version 2.1.0
 * @date 2026-01-22
 * 
 * 注意：
 * 1. 登录页面不依赖 admin-common.js，因为用户尚未登录
 * 2. 使用 Alpine.data() 注册组件以兼容 CSP 策略
 */

/**
 * 登录页面 Alpine.js 组件定义
 */
function loginPage() {
  return {
    // ========== 状态 ==========
    phone: '13800138000',  // 开发环境默认值
    code: '123456',        // 开发环境默认值
    loading: false,
    message: '',
    isError: false,

    // ========== 初始化 ==========
    init() {
      console.log('[LoginPage] 初始化')
      this.checkExistingSession()
    },

    // ========== 检查已有会话 ==========
    checkExistingSession() {
      const token = localStorage.getItem('admin_token')
      const user = localStorage.getItem('admin_user')

      if (token && user) {
        this.showMessage('检测到已登录状态，正在跳转...')
        setTimeout(() => {
          window.location.href = '/admin/dashboard.html'
        }, 500)
      }
    },

    // ========== 显示消息 ==========
    showMessage(msg, isError = false) {
      this.message = msg
      this.isError = isError
    },

    // ========== 清除消息 ==========
    clearMessage() {
      this.message = ''
      this.isError = false
    },

    // ========== 登录处理 ==========
    async handleLogin() {
      // 清除之前的消息
      this.clearMessage()

      // 基础验证
      const phone = this.phone.trim()
      const code = this.code.trim()

      if (!phone) {
        this.showMessage('请输入手机号', true)
        return
      }

      if (!code) {
        this.showMessage('请输入验证码', true)
        return
      }

      // 手机号格式验证
      if (!/^1[3-9]\d{9}$/.test(phone)) {
        this.showMessage('请输入正确的手机号格式', true)
        return
      }

      // 开始登录
      this.loading = true
      this.showMessage('正在登录...')

      try {
        const response = await fetch(API_ENDPOINTS.CONSOLE_AUTH.LOGIN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mobile: phone,
            verification_code: code
          })
        })

        const result = await response.json()
        console.log('[LoginPage] 登录响应:', result)

        if (result.success && result.data?.access_token) {
          const user = result.data.user

          // 权限检查
          if (this.checkAdminAccess(user)) {
            this.showMessage('✅ 登录成功，正在跳转...')

            // 保存 Token 和用户信息
            localStorage.setItem('admin_token', result.data.access_token)
            localStorage.setItem('admin_user', JSON.stringify(user))

            // 延迟跳转
            setTimeout(() => {
              window.location.href = '/admin/dashboard.html'
            }, 1000)
          } else {
            this.showMessage('❌ 此账号没有管理员权限，请联系系统管理员', true)
          }
        } else {
          this.showMessage(`❌ 登录失败: ${result.message || '未知错误'}`, true)
        }
      } catch (error) {
        console.error('[LoginPage] 登录错误:', error)
        this.showMessage(`❌ 网络错误: ${error.message}`, true)
      } finally {
        this.loading = false
      }
    },

    // ========== 权限检查 ==========
    /**
     * 检查用户是否有管理员权限
     * role_level >= 100 为管理员
     */
    checkAdminAccess(user) {
      if (!user) return false

      // 检查 role_level 字段
      if (user.role_level >= 100) return true

      // 检查 roles 数组
      if (user.roles && Array.isArray(user.roles)) {
        return user.roles.some(role => {
          if (typeof role === 'object') {
            return role.role_level >= 100
          }
          return false
        })
      }

      return false
    }
  }
}

// ========== Alpine.js CSP 兼容注册 ==========
// 必须在 Alpine 初始化之前注册组件
document.addEventListener('alpine:init', () => {
  Alpine.data('loginPage', loginPage)
  console.log('✅ [LoginPage] Alpine 组件已注册')
})

console.log('📦 登录页面 (Alpine.js CSP) 已加载')
