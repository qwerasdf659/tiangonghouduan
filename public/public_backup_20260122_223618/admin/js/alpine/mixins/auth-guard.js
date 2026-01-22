/**
 * 认证守卫 Mixin
 * 解决：每个页面重复的认证检查逻辑（约 20 行/页面）
 * 
 * @file public/admin/js/alpine/mixins/auth-guard.js
 * @description 提供统一的认证检查、权限验证和用户信息管理
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * @example
 * function myPage() {
 *   return {
 *     ...authGuardMixin(),
 *     init() {
 *       if (!this.checkAuth()) return
 *       // 继续初始化...
 *     }
 *   }
 * }
 */
function authGuardMixin() {
  return {
    // ========== 状态 ==========
    
    /** 当前用户信息 */
    userInfo: null,
    
    /** 认证检查是否完成 */
    authChecked: false,
    
    // ========== 方法 ==========
    
    /**
     * 执行认证检查
     * 检查 Token 和管理员权限
     * 
     * @returns {boolean} 是否通过认证
     */
    checkAuth() {
      // 获取用户信息
      this.userInfo = typeof getCurrentUser === 'function' 
        ? getCurrentUser() 
        : JSON.parse(localStorage.getItem('admin_user') || 'null')
      
      // Token 检查
      const token = typeof getToken === 'function' 
        ? getToken() 
        : localStorage.getItem('admin_token')
        
      if (!token) {
        console.warn('[AuthGuard] 未登录，跳转到登录页')
        window.location.href = '/admin/login.html'
        return false
      }
      
      // 权限检查
      if (!this._checkAdminPermission()) {
        console.warn('[AuthGuard] 无管理员权限')
        this.$toast?.error('您没有访问此页面的权限')
        return false
      }
      
      this.authChecked = true
      console.log('[AuthGuard] 认证检查通过')
      return true
    },
    
    /**
     * 检查管理员权限
     * @private
     * @returns {boolean} 是否有管理员权限
     */
    _checkAdminPermission() {
      if (!this.userInfo) return false
      
      // 检查 role_level（直接在 user 对象上）
      if (this.userInfo.role_level >= 100) return true
      
      // 检查 roles 数组
      if (this.userInfo.roles && Array.isArray(this.userInfo.roles)) {
        return this.userInfo.roles.some(role => 
          role.role_name === 'admin' || role.role_level >= 100
        )
      }
      
      return false
    },
    
    /**
     * 获取用户显示名称
     * @returns {string} 用户昵称或手机号
     */
    get displayName() {
      return this.userInfo?.nickname || this.userInfo?.mobile || '管理员'
    },
    
    /**
     * 获取用户ID
     * @returns {number|null} 用户ID
     */
    get currentUserId() {
      return this.userInfo?.user_id || null
    },
    
    /**
     * 检查是否是超级管理员
     * @returns {boolean} 是否是超级管理员
     */
    get isSuperAdmin() {
      if (!this.userInfo) return false
      return this.userInfo.role_level >= 200 || 
             this.userInfo.roles?.some(r => r.role_name === 'super_admin')
    },
    
    /**
     * 退出登录
     */
    logout() {
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_user')
      window.location.href = '/admin/login.html'
    },
    
    /**
     * 刷新用户信息
     * @returns {Promise<boolean>} 是否刷新成功
     */
    async refreshUserInfo() {
      try {
        const response = await apiRequest('/api/v4/user/profile')
        if (response?.success && response.data) {
          this.userInfo = response.data
          localStorage.setItem('admin_user', JSON.stringify(response.data))
          return true
        }
      } catch (error) {
        console.error('[AuthGuard] 刷新用户信息失败:', error)
      }
      return false
    }
  }
}

// 导出到全局作用域
window.authGuardMixin = authGuardMixin

console.log('✅ AuthGuard Mixin 已加载')

