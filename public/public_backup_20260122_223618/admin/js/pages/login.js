/**
 * 登录页面 - Alpine.js 组件
 *
 * @file public/admin/js/pages/login.js
 * @description 管理员登录（手机号+验证码）
 * @version 3.0.0 (代码规范化)
 * @date 2026-01-23
 * 
 * @note 登录页面不使用 auth-guard mixin，因为本身就是认证入口
 *       使用独立的 API 请求逻辑，不依赖 admin-common.js
 */

function loginPage() {
  return {
    // ==================== 页面状态 ====================
    
    /** 手机号 */
    phone: '',
    
    /** 验证码 */
    code: '',
    
    /** 加载中 */
    loading: false,
    
    /** 消息提示 */
    message: '',
    
    /** 是否错误 */
    isError: false,

    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    init() {
      console.log('✅ 登录页面初始化 (v3.0)')
      this.checkExistingSession()
    },

    /**
     * 检查已存在的会话
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
     * 显示消息
     */
    showMessage(msg, isError = false) {
      this.message = msg
      this.isError = isError
    },

    /**
     * 清除消息
     */
    clearMessage() {
      this.message = ''
      this.isError = false
    },

    // ==================== 登录处理 ====================
    
    /**
     * 处理登录
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
        const response = await fetch('/api/v4/auth/login', {
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
        console.error('登录失败:', error)
        this.showMessage(error.message || '登录失败，请稍后重试', true)
      } finally {
        this.loading = false
      }
    },

    /**
     * 检查管理员权限
     * 
     * 后端返回数据结构：
     * - role_level: number (>= 100 为管理员)
     * - roles: Array<{ role_name: string, role_level: number, role_uuid: string }>
     * 
     * 管理员判断标准（以后端为准）：
     * 1. role_level >= 100
     * 2. roles 数组中包含 role_name 为 'admin' 或 'super_admin' 的角色
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
        const hasAdminRole = user.roles.some(role => 
          adminRoles.includes(role.role_name) || role.role_level >= 100
        )
        if (hasAdminRole) {
          return true
        }
      }

      return false
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('loginPage', loginPage)
  console.log('✅ [LoginPage] Alpine 组件已注册 (v3.0)')
})
