/**
 * 角色管理页面 - Alpine.js 版本
 *
 * @file public/admin/js/pages/roles.js
 * @description 角色列表展示、搜索过滤等功能
 * @version 2.0.0 (Alpine.js 重构版)
 * @date 2026-01-22
 */

/**
 * 角色管理页面 Alpine.js 组件
 */
function rolesPage() {
  return {
    // ==================== 状态数据 ====================
    
    /** 用户信息 */
    userInfo: null,
    
    /** 角色列表 */
    roles: [],
    
    /** 过滤后的角色列表 */
    filteredRoles: [],
    
    /** 加载状态 */
    loading: true,
    
    /** 全局加载状态 */
    globalLoading: false,
    
    /** 搜索关键词 */
    searchKeyword: '',
    
    /** 数据加载时间 */
    loadTime: '-',
    
    /** 统计数据 */
    statistics: {
      totalRoles: '-',
      maxRoleLevel: '-',
      roleTypes: '-'
    },
    
    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    init() {
      console.log('✅ 角色管理页面 Alpine.js 组件初始化')
      
      // 获取用户信息
      this.userInfo = getCurrentUser()
      
      // 加载角色列表
      this.loadRoles()
    },
    
    // ==================== 数据加载方法 ====================
    
    /**
     * 加载角色列表
     */
    async loadRoles() {
      this.loading = true
      const startTime = Date.now()
      
      try {
        const response = await apiRequest(API_ENDPOINTS.ROLE.LIST)
        
        if (response && response.success) {
          this.roles = response.data.roles || response.data || []
          this.filteredRoles = [...this.roles]
          this.updateStats()
          
          // 显示加载时间
          this.loadTime = `${Date.now() - startTime}ms`
        } else {
          this.showError('加载失败', response?.message || '获取角色列表失败')
        }
      } catch (error) {
        console.error('加载角色失败:', error)
        this.showError('加载失败', error.message)
      } finally {
        this.loading = false
      }
    },
    
    // ==================== 业务方法 ====================
    
    /**
     * 更新统计信息
     */
    updateStats() {
      // 角色总数
      this.statistics.totalRoles = this.roles.length
      
      // 最高权限级别
      this.statistics.maxRoleLevel = this.roles.length > 0 
        ? Math.max(...this.roles.map(r => r.role_level || 0))
        : 0
      
      // 角色类型统计
      const highLevel = this.roles.filter(r => (r.role_level || 0) >= 80).length
      const midLevel = this.roles.filter(r => (r.role_level || 0) >= 40 && (r.role_level || 0) < 80).length
      const lowLevel = this.roles.filter(r => (r.role_level || 0) < 40).length
      this.statistics.roleTypes = `${highLevel}高/${midLevel}中/${lowLevel}低`
    },
    
    /**
     * 搜索过滤角色
     */
    filterRoles() {
      const search = this.searchKeyword.toLowerCase()
      this.filteredRoles = this.roles.filter(r => 
        (r.role_name || '').toLowerCase().includes(search) ||
        (r.description || '').toLowerCase().includes(search)
      )
    },
    
    /**
     * 获取角色级别的CSS类
     */
    getRoleLevelClass(level) {
      if (level >= 80) return 'role-level-high'
      if (level >= 40) return 'role-level-medium'
      return 'role-level-low'
    },
    
    /**
     * 获取角色级别描述
     */
    getRoleLevelDescription(level) {
      if (level >= 100) return '超级管理员权限'
      if (level >= 80) return '高级管理权限'
      if (level >= 60) return '业务管理权限'
      if (level >= 40) return '运营操作权限'
      if (level >= 20) return '基础操作权限'
      return '普通用户权限'
    },
    
    // ==================== 工具方法 ====================
    
    /**
     * 显示错误提示
     */
    showError(title, message) {
      alert(`❌ ${title}\n${message}`)
    },
    
    /**
     * 退出登录
     */
    logout() {
      if (typeof window.logout === 'function') {
        window.logout()
      }
    }
  }
}

// 注册 Alpine.js 组件
document.addEventListener('alpine:init', () => {
  Alpine.data('rolesPage', rolesPage)
})

