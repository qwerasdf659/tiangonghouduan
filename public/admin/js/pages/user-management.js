/**
 * 用户管理中心 - Alpine.js 组件
 * 
 * @file public/admin/js/pages/user-management.js
 * @description 用户管理中心页面的 Alpine.js 组件定义
 * @version 2.0.0
 * @date 2026-01-22
 * 
 * 包含模块：
 * - 用户列表管理
 * - 角色管理
 * - 权限管理
 * - 用户角色分配
 * - 用户统计
 */

document.addEventListener('alpine:init', () => {
  console.log('[UserManagement] 注册 Alpine 组件...')

  // 全局 Store: 当前页面状态
  Alpine.store('userPage', 'user-list')

  /**
   * 导航组件
   */
  Alpine.data('userNavigation', () => ({
    currentPage: 'user-list',
    subPages: [
      { id: 'user-list', title: '用户列表', icon: 'bi-people' },
      { id: 'role-list', title: '角色管理', icon: 'bi-shield' },
      { id: 'permission-list', title: '权限管理', icon: 'bi-key' },
      { id: 'user-roles', title: '角色分配', icon: 'bi-person-badge' },
      { id: 'user-stats', title: '用户统计', icon: 'bi-graph-up' }
    ],

    init() {
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'user-list'
      Alpine.store('userPage', this.currentPage)
    },

    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('userPage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  /**
   * 页面内容组件
   */
  Alpine.data('userPageContent', () => ({
    // 数据
    users: [],
    roles: [],
    permissions: [],
    userRoles: [],

    // 筛选器
    userFilters: { user_id: '', nickname: '', status: '' },
    userRoleFilters: { user_id: '', role_code: '' },

    // 统计数据
    userStats: { totalUsers: 0, activeUsers: 0, totalRoles: 0, totalPermissions: 0 },

    // 计算属性：当前页面
    get currentPage() {
      return Alpine.store('userPage')
    },

    // 初始化
    init() {
      this.loadAllData()
      this.$watch('$store.userPage', () => this.loadAllData())
    },

    // 加载所有数据
    async loadAllData() {
      showLoading()
      try {
        await Promise.all([
          this.loadUsers(),
          this.loadRoles(),
          this.loadPermissions(),
          this.loadUserRoles()
        ])
        this.calculateStats()
      } catch (error) {
        console.error('[UserManagement] 加载数据失败:', error)
      } finally {
        hideLoading()
      }
    },

    // 加载用户列表
    async loadUsers() {
      try {
        let url = API_ENDPOINTS.USER?.LIST || '/api/v4/admin/users'
        const params = new URLSearchParams()
        if (this.userFilters.user_id) params.append('user_id', this.userFilters.user_id)
        if (this.userFilters.nickname) params.append('nickname', this.userFilters.nickname)
        if (this.userFilters.status) params.append('status', this.userFilters.status)
        if (params.toString()) url += '?' + params.toString()
        
        const response = await apiRequest(url)
        if (response && response.success) {
          this.users = response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('[UserManagement] 加载用户失败:', error)
        this.users = []
      }
    },

    // 加载角色列表
    async loadRoles() {
      try {
        const response = await apiRequest(API_ENDPOINTS.ROLE?.LIST || '/api/v4/admin/roles')
        if (response && response.success) {
          this.roles = response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('[UserManagement] 加载角色失败:', error)
        this.roles = []
      }
    },

    // 加载权限列表
    async loadPermissions() {
      try {
        const response = await apiRequest(API_ENDPOINTS.PERMISSION?.LIST || '/api/v4/admin/permissions')
        if (response && response.success) {
          this.permissions = response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('[UserManagement] 加载权限失败:', error)
        this.permissions = []
      }
    },

    // 加载用户角色分配
    async loadUserRoles() {
      try {
        let url = API_ENDPOINTS.USER_ROLE?.LIST || '/api/v4/admin/user-roles'
        const params = new URLSearchParams()
        if (this.userRoleFilters.user_id) params.append('user_id', this.userRoleFilters.user_id)
        if (this.userRoleFilters.role_code) params.append('role_code', this.userRoleFilters.role_code)
        if (params.toString()) url += '?' + params.toString()
        
        const response = await apiRequest(url)
        if (response && response.success) {
          this.userRoles = response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('[UserManagement] 加载用户角色失败:', error)
        this.userRoles = []
      }
    },

    // 计算统计数据
    calculateStats() {
      this.userStats = {
        totalUsers: this.users.length,
        activeUsers: this.users.filter(u => u.status === 'active').length,
        totalRoles: this.roles.length,
        totalPermissions: this.permissions.length
      }
    },

    // 获取用户状态样式类
    getUserStatusClass(status) {
      const map = { active: 'bg-success', inactive: 'bg-secondary', banned: 'bg-danger' }
      return map[status] || 'bg-secondary'
    },

    // 获取用户状态文本
    getUserStatusText(status) {
      const map = { active: '正常', inactive: '禁用', banned: '封禁' }
      return map[status] || status
    },

    // 打开创建模态框
    openCreateModal(type) {
      this.$toast.info(`创建${type}功能开发中`)
    },

    // 查看用户详情
    viewUserDetail(user) {
      this.$toast.info(`用户详情: ${user.user_id}`)
    },

    // 编辑用户
    editUser(user) {
      this.$toast.info(`编辑用户: ${user.user_id}`)
    },

    // 切换用户状态
    toggleUserStatus(user) {
      const action = user.status === 'active' ? '禁用' : '启用'
      if (confirm(`确定要${action}用户 ${user.nickname || user.user_id} 吗？`)) {
        this.$toast.info(`${action}用户功能开发中`)
      }
    },

    // 编辑角色
    editRole(role) {
      this.$toast.info(`编辑角色: ${role.role_name}`)
    },

    // 管理角色权限
    manageRolePermissions(role) {
      this.$toast.info(`管理角色权限: ${role.role_name}`)
    },

    // 编辑权限
    editPermission(perm) {
      this.$toast.info(`编辑权限: ${perm.permission_name}`)
    },

    // 打开分配角色模态框
    openAssignRoleModal() {
      this.$toast.info('分配角色功能开发中')
    },

    // 撤销用户角色
    revokeUserRole(ur) {
      if (confirm(`确定要撤销用户 ${ur.user_nickname || ur.user_id} 的 ${ur.role_name || ur.role_code} 角色吗？`)) {
        this.$toast.info('撤销角色功能开发中')
      }
    }
  }))

  console.log('✅ [UserManagement] Alpine 组件注册完成')
})

console.log('📦 [UserManagement] 页面脚本已加载')
