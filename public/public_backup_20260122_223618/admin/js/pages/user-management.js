/**
 * 用户管理中心 - Alpine.js Mixin 重构版
 * 
 * @file public/admin/js/pages/user-management.js
 * @description 用户管理中心页面（Tab 导航整合多个子模块）
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * 
 * 重构说明：
 * - 使用 createPageMixin 组合 Mixin
 * - 整合用户管理相关的多个子模块
 * - 保留 Tab 导航和 URL 参数同步
 * 
 * 包含子模块：
 * - 用户列表管理
 * - 角色管理
 * - 权限管理
 * - 用户角色分配
 * - 用户统计
 */

document.addEventListener('alpine:init', () => {
  console.log('[UserManagement] 注册 Alpine 组件 (Mixin v3.0)...')

  // 全局 Store: 当前页面状态
  Alpine.store('userPage', 'user-list')

  // ==================== 导航组件 ====================
  Alpine.data('userNavigation', () => ({
    ...createPageMixin(),

    /** 当前页面 */
    currentPage: 'user-list',

    /** 子页面配置 */
    subPages: [
      { id: 'user-list', title: '用户列表', icon: 'bi-people' },
      { id: 'role-list', title: '角色管理', icon: 'bi-shield' },
      { id: 'permission-list', title: '权限管理', icon: 'bi-key' },
      { id: 'user-roles', title: '角色分配', icon: 'bi-person-badge' },
      { id: 'user-stats', title: '用户统计', icon: 'bi-graph-up' }
    ],

    /**
     * 初始化
     */
    init() {
      console.log('✅ 用户管理导航初始化 (Mixin v3.0)')

      // 权限检查
      if (!this.checkAuth()) return

      // 从 URL 参数获取当前页面
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'user-list'
      Alpine.store('userPage', this.currentPage)
    },

    /**
     * 切换页面
     */
    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('userPage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  // ==================== 页面内容组件 ====================
  Alpine.data('userPageContent', () => ({
    ...createPageMixin(),

    // ==================== 数据状态 ====================

    /** 用户列表 */
    users: [],

    /** 角色列表 */
    roles: [],

    /** 权限列表 */
    permissions: [],

    /** 用户角色分配列表 */
    userRoles: [],

    /** 用户筛选条件 */
    userFilters: { user_id: '', nickname: '', status: '' },

    /** 用户角色筛选条件 */
    userRoleFilters: { user_id: '', role_code: '' },

    /** 统计数据 */
    userStats: {
      totalUsers: 0,
      activeUsers: 0,
      totalRoles: 0,
      totalPermissions: 0
    },

    /** 选中的用户（用于详情/编辑） */
    selectedUser: null,

    /** 编辑用户表单 */
    editUserForm: { user_id: '', nickname: '', status: '' },

    /** 选中的用户（用于角色管理） */
    selectedUserForRole: null,

    /** 选中的角色代码 */
    selectedRoleCode: '',

    /** 分配角色表单 */
    assignRoleForm: { user_id: '', role_code: '' },

    /** 概率调整相关数据 */
    allPrizes: [],
    probabilityModal: {
      userId: null,
      userNickname: '',
      mode: 'global',
      multiplier: 2.0,
      targetPrizeId: '',
      customProbability: 50,
      duration: 60,
      reason: ''
    },
    probabilityPreviewHtml: '<p class="text-muted mb-0">请选择奖品并设置概率</p>',

    /** 保存中状态 */
    saving: false,

    // Modal 由 modalMixin 统一管理

    // ==================== 计算属性 ====================

    /**
     * 获取当前页面
     */
    get currentPage() {
      return Alpine.store('userPage')
    },

    // ==================== 生命周期 ====================

    /**
     * 初始化
     */
    init() {
      console.log('✅ 用户管理内容初始化 (Mixin v3.0)')

      // Modal 由 modalMixin 统一管理，无需手动初始化

      // 初始加载数据
      this.loadAllData()

      // 监听页面切换
      this.$watch('$store.userPage', () => this.loadAllData())
    },

    // ==================== 数据加载 ====================

    /**
     * 加载所有数据
     */
    async loadAllData() {
      await this.withLoading(async () => {
        await Promise.all([
          this.loadUsers(),
          this.loadRoles(),
          this.loadPermissions(),
          this.loadUserRoles()
        ])
        this.calculateStats()
      }, { loadingText: '加载用户数据...' })
    },

    /**
     * 加载用户列表
     */
    async loadUsers() {
      try {
        let url = API_ENDPOINTS.USER?.LIST || '/api/v4/admin/users'
        const params = new URLSearchParams()
        if (this.userFilters.user_id) params.append('user_id', this.userFilters.user_id)
        if (this.userFilters.nickname) params.append('nickname', this.userFilters.nickname)
        if (this.userFilters.status) params.append('status', this.userFilters.status)
        if (params.toString()) url += '?' + params.toString()

        const response = await this.apiGet(url, {}, { showLoading: false })
        if (response && response.success) {
          this.users = response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('[UserManagement] 加载用户失败:', error)
        this.users = []
      }
    },

    /**
     * 加载角色列表
     */
    async loadRoles() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.ROLE?.LIST || '/api/v4/admin/roles',
          {},
          { showLoading: false }
        )
        if (response && response.success) {
          this.roles = response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('[UserManagement] 加载角色失败:', error)
        this.roles = []
      }
    },

    /**
     * 加载权限列表
     */
    async loadPermissions() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.PERMISSION?.LIST || '/api/v4/admin/permissions',
          {},
          { showLoading: false }
        )
        if (response && response.success) {
          this.permissions = response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('[UserManagement] 加载权限失败:', error)
        this.permissions = []
      }
    },

    /**
     * 加载用户角色分配
     */
    async loadUserRoles() {
      try {
        let url = API_ENDPOINTS.USER_ROLE?.LIST || '/api/v4/admin/user-roles'
        const params = new URLSearchParams()
        if (this.userRoleFilters.user_id) params.append('user_id', this.userRoleFilters.user_id)
        if (this.userRoleFilters.role_code) params.append('role_code', this.userRoleFilters.role_code)
        if (params.toString()) url += '?' + params.toString()

        const response = await this.apiGet(url, {}, { showLoading: false })
        if (response && response.success) {
          this.userRoles = response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('[UserManagement] 加载用户角色失败:', error)
        this.userRoles = []
      }
    },

    // ==================== 统计计算 ====================

    /**
     * 计算统计数据
     */
    calculateStats() {
      this.userStats = {
        totalUsers: this.users.length,
        activeUsers: this.users.filter(u => u.status === 'active').length,
        totalRoles: this.roles.length,
        totalPermissions: this.permissions.length
      }
    },

    // ==================== 工具方法 ====================

    /**
     * 获取用户状态样式类
     */
    getUserStatusClass(status) {
      const map = {
        active: 'bg-success',
        inactive: 'bg-secondary',
        banned: 'bg-danger'
      }
      return map[status] || 'bg-secondary'
    },

    /**
     * 获取用户状态文本
     */
    getUserStatusText(status) {
      const map = {
        active: '正常',
        inactive: '禁用',
        banned: '封禁'
      }
      return map[status] || status
    },

    // ==================== 用户操作 ====================

    /**
     * 打开创建模态框
     */
    openCreateModal(type) {
      // 目前只支持通过分配角色来添加管理员用户
      if (type === 'user') {
        this.showInfo('新用户通过前端注册，如需添加管理员请使用"角色分配"功能')
      } else if (type === 'role') {
        this.showInfo('角色创建功能需要通过系统配置，请联系超级管理员')
      } else if (type === 'permission') {
        this.showInfo('权限由系统预设，如需新增请联系开发人员')
      }
    },

    /**
     * 查看用户详情
     */
    async viewUserDetail(user) {
      try {
        // 获取用户详情
        const response = await this.apiGet(
          API_ENDPOINTS.USER?.DETAIL?.replace('{user_id}', user.user_id) || 
          `/api/v4/admin/users/${user.user_id}`,
          {},
          { showLoading: true }
        )
        
        if (response && response.success) {
          this.selectedUser = response.data?.user || response.data || user
        } else {
          // 如果 API 失败，使用列表中的数据
          this.selectedUser = user
        }
        
        this.showModal('userDetailModal')
      } catch (error) {
        console.error('[UserManagement] 获取用户详情失败:', error)
        // 使用列表中的数据作为后备
        this.selectedUser = user
        this.showModal('userDetailModal')
      }
    },

    /**
     * 编辑用户
     */
    editUser(user) {
      this.editUserForm = {
        user_id: user.user_id,
        nickname: user.nickname || '',
        status: user.status || 'active'
      }
      this.showModal('editUserModal')
    },

    /**
     * 提交编辑用户
     */
    async submitEditUser() {
      if (this.saving) return
      this.saving = true

      try {
        const response = await this.apiPost(
          API_ENDPOINTS.USER?.UPDATE?.replace('{user_id}', this.editUserForm.user_id) || 
          `/api/v4/admin/users/${this.editUserForm.user_id}`,
          {
            nickname: this.editUserForm.nickname,
            status: this.editUserForm.status
          },
          { method: 'PUT' }
        )

        if (response && response.success) {
          this.showSuccess('用户信息已更新')
          this.hideModal('editUserModal')
          await this.loadUsers()
        } else {
          this.showError(response?.message || '更新失败')
        }
      } catch (error) {
        console.error('[UserManagement] 更新用户失败:', error)
        this.showError(error.message || '更新失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 切换用户状态
     */
    async toggleUserStatus(user) {
      const newStatus = user.status === 'active' ? 'banned' : 'active'
      const action = newStatus === 'banned' ? '封禁' : '解封'

      await this.confirmAndExecute(
        `确定要${action}用户 ${user.nickname || user.user_id} 吗？`,
        async () => {
          const response = await this.apiPost(
            API_ENDPOINTS.USER?.UPDATE_STATUS?.replace('{user_id}', user.user_id) || 
            `/api/v4/admin/users/${user.user_id}/status`,
            {
              status: newStatus,
              reason: `管理员手动${action}`
            },
            { method: 'PUT' }
          )

          if (response && response.success) {
            this.showSuccess(`用户已${action}`)
            await this.loadUsers()
          } else {
            this.showError(response?.message || `${action}失败`)
          }
        },
        { title: `${action}用户`, confirmText: `确认${action}` }
      )
        },

    /**
     * 管理用户角色
     */
    async manageUserRole(user) {
      this.selectedUserForRole = user
      this.selectedRoleCode = ''

      // 尝试获取用户当前角色
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.USER?.DETAIL?.replace('{user_id}', user.user_id) || 
          `/api/v4/admin/users/${user.user_id}`,
          {},
          { showLoading: false }
        )
        
        if (response && response.success) {
          const userData = response.data?.user || response.data
          if (userData.roles && userData.roles.length > 0) {
            const firstRole = userData.roles[0]
            this.selectedRoleCode = typeof firstRole === 'string' ? firstRole : firstRole.role_code
          }
        }
      } catch (error) {
        console.error('[UserManagement] 获取用户角色失败:', error)
      }

      this.showModal('userRoleModal')
    },

    /**
     * 提交用户角色更新
     */
    async submitUserRole() {
      if (!this.selectedRoleCode) {
        this.showError('请选择一个角色')
        return
      }

      if (this.saving) return
      this.saving = true

      try {
        const response = await this.apiPost(
          API_ENDPOINTS.USER?.UPDATE_ROLE?.replace('{user_id}', this.selectedUserForRole.user_id) || 
          `/api/v4/admin/users/${this.selectedUserForRole.user_id}/role`,
          {
            role_code: this.selectedRoleCode,
            reason: '管理员手动更新角色'
          },
          { method: 'PUT' }
        )

        if (response && response.success) {
          this.showSuccess('用户角色已更新')
          this.hideModal('userRoleModal')
          await this.loadUsers()
          await this.loadUserRoles()
        } else {
          this.showError(response?.message || '更新角色失败')
        }
      } catch (error) {
        console.error('[UserManagement] 更新用户角色失败:', error)
        this.showError(error.message || '更新角色失败')
      } finally {
        this.saving = false
      }
    },

    // ==================== 角色操作 ====================

    /**
     * 编辑角色
     */
    editRole(role) {
      // 角色编辑通常需要更高权限，这里提供提示
      this.showInfo(`角色 "${role.role_name}" 的编辑功能需要超级管理员权限`)
    },

    /**
     * 管理角色权限
     */
    manageRolePermissions(role) {
      // 角色权限管理通常需要更高权限
      this.showInfo(`角色 "${role.role_name}" 包含 ${role.permission_level || 0} 级权限，详细权限管理请联系超级管理员`)
    },

    // ==================== 权限操作 ====================

    /**
     * 编辑权限
     */
    editPermission(perm) {
      // 权限编辑需要开发人员参与
      this.showInfo(`权限 "${perm.permission_name}" (${perm.permission_code}) 由系统预设，如需修改请联系开发人员`)
    },

    // ==================== 用户角色操作 ====================

    /**
     * 打开分配角色模态框
     */
    openAssignRoleModal() {
      this.assignRoleForm = { user_id: '', role_code: '' }
      this.showModal('assignRoleModal')
    },

    /**
     * 提交分配角色
     */
    async submitAssignRole() {
      if (!this.assignRoleForm.user_id || !this.assignRoleForm.role_code) {
        this.showError('请填写用户ID和选择角色')
        return
      }

      if (this.saving) return
      this.saving = true

      try {
        const response = await this.apiPost(
          API_ENDPOINTS.USER_ROLE?.ASSIGN || '/api/v4/admin/user-roles',
          {
            user_id: parseInt(this.assignRoleForm.user_id),
            role_code: this.assignRoleForm.role_code,
            reason: '管理员手动分配角色'
          }
        )

        if (response && response.success) {
          this.showSuccess('角色分配成功')
          this.hideModal('assignRoleModal')
          await this.loadUserRoles()
        } else {
          this.showError(response?.message || '分配角色失败')
        }
      } catch (error) {
        console.error('[UserManagement] 分配角色失败:', error)
        this.showError(error.message || '分配角色失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 撤销用户角色
     */
    async revokeUserRole(ur) {
      await this.confirmAndExecute(
        `确定要撤销用户 ${ur.user_nickname || ur.user_id} 的 ${ur.role_name || ur.role_code} 角色吗？`,
        async () => {
          const response = await this.apiPost(
            API_ENDPOINTS.USER_ROLE?.REVOKE?.replace('{id}', ur.id) || 
            `/api/v4/admin/user-roles/${ur.id}`,
            { reason: '管理员手动撤销' },
            { method: 'DELETE' }
          )

          if (response && response.success) {
            this.showSuccess('角色已撤销')
            await this.loadUserRoles()
          } else {
            this.showError(response?.message || '撤销角色失败')
          }
        },
        { title: '撤销角色', confirmText: '确认撤销', type: 'danger' }
      )
    },

    // ==================== 概率调整操作 ====================

    /**
     * 打开概率调整模态框
     */
    async openProbabilityModal(user) {
      this.probabilityModal = {
        userId: user.user_id,
        userNickname: user.nickname || user.mobile || `用户${user.user_id}`,
        mode: 'global',
        multiplier: 2.0,
        targetPrizeId: '',
        customProbability: 50,
        duration: 60,
        reason: ''
      }
      this.probabilityPreviewHtml = '<p class="text-muted mb-0">请选择奖品并设置概率</p>'

      // 加载奖品列表
      await this.loadPrizesForProbability()

      this.showModal('probabilityModal')
    },

    /**
     * 加载奖品列表（用于特定奖品调整）
     */
    async loadPrizesForProbability() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.PRIZE?.LIST || '/api/v4/admin/prizes',
          {}, { showLoading: false, showError: false }
        )
        if (response?.success) {
          this.allPrizes = response.data?.prizes || response.data?.list || []
        }
      } catch (error) {
        console.error('加载奖品列表失败:', error)
        this.allPrizes = []
      }
    },

    /**
     * 更新概率预览
     */
    updateProbabilityPreview() {
      const selectedPrizeId = parseInt(this.probabilityModal.targetPrizeId)
      const newProbability = parseFloat(this.probabilityModal.customProbability) / 100

      if (!selectedPrizeId || !newProbability) {
        this.probabilityPreviewHtml = '<p class="text-muted mb-0">请选择奖品并设置概率</p>'
        return
      }

      const targetPrize = this.allPrizes.find(p => (p.prize_id || p.id) === selectedPrizeId)
      if (!targetPrize) return

      const otherPrizesTotalProb = this.allPrizes
        .filter(p => (p.prize_id || p.id) !== selectedPrizeId)
        .reduce((sum, p) => sum + parseFloat(p.win_probability || p.probability || 0), 0)

      const remainingProb = 1.0 - newProbability
      const scaleFactor = otherPrizesTotalProb > 0 ? remainingProb / otherPrizesTotalProb : 0

      let previewHtml = '<table class="table table-sm mb-0">'
      previewHtml += '<thead><tr><th>奖品</th><th>原概率</th><th>→</th><th>新概率</th></tr></thead>'
      previewHtml += '<tbody>'

      this.allPrizes.forEach(prize => {
        const prizeId = prize.prize_id || prize.id
        const originalProb = parseFloat(prize.win_probability || prize.probability || 0)
        let adjustedProb
        let isTarget = false

        if (prizeId === selectedPrizeId) {
          adjustedProb = newProbability
          isTarget = true
        } else {
          adjustedProb = originalProb * scaleFactor
        }

        const className = isTarget ? 'table-info' : ''
        const prizeName = prize.prize_name || prize.name
        previewHtml += `
          <tr class="${className}">
            <td>${prizeName}${isTarget ? ' 🎯' : ''}</td>
            <td>${(originalProb * 100).toFixed(1)}%</td>
            <td><i class="bi bi-arrow-right"></i></td>
            <td class="fw-bold ${isTarget ? 'text-info' : ''}">${(adjustedProb * 100).toFixed(1)}%</td>
          </tr>
        `
      })

      const totalAdjusted = this.allPrizes.reduce((sum, prize) => {
        const prizeId = prize.prize_id || prize.id
        if (prizeId === selectedPrizeId) return sum + newProbability
        const originalProb = parseFloat(prize.win_probability || prize.probability || 0)
        return sum + originalProb * scaleFactor
      }, 0)

      previewHtml += `
        <tr class="table-light fw-bold">
          <td>总计</td>
          <td>100%</td>
          <td></td>
          <td>${(totalAdjusted * 100).toFixed(1)}%</td>
        </tr>
      `
      previewHtml += '</tbody></table>'

      this.probabilityPreviewHtml = previewHtml
    },

    /**
     * 保存概率调整设置
     */
    async saveProbabilityAdjustment() {
      if (!this.probabilityModal.userId) {
        this.showError('未选择用户')
        return
      }

      let requestData = {
        user_id: this.probabilityModal.userId,
        duration_minutes: parseInt(this.probabilityModal.duration) || 60,
        reason: this.probabilityModal.reason || '管理员概率调整'
      }

      if (this.probabilityModal.mode === 'global') {
        const multiplier = parseFloat(this.probabilityModal.multiplier)
        if (!multiplier || multiplier < 0.1 || multiplier > 10) {
          this.showError('概率倍数必须在0.1-10之间')
          return
        }
        requestData.probability_multiplier = multiplier
      } else {
        const prizeId = parseInt(this.probabilityModal.targetPrizeId)
        const customProb = parseFloat(this.probabilityModal.customProbability) / 100

        if (!prizeId) {
          this.showError('请选择要调整的奖品')
          return
        }

        if (!customProb || customProb < 0.01 || customProb > 1.0) {
          this.showError('自定义概率必须在1%-100%之间')
          return
        }

        requestData.prize_id = prizeId
        requestData.custom_probability = customProb
      }

      if (this.saving) return
      this.saving = true

      try {
        const response = await this.apiPost(
          API_ENDPOINTS.PROBABILITY?.ADJUST || '/api/v4/admin/probability/adjust',
          requestData
        )

        if (response && response.success) {
          this.showSuccess(response.message || '用户概率调整成功')
          this.hideModal('probabilityModal')
        } else {
          this.showError(response?.message || '概率调整失败')
        }
      } catch (error) {
        console.error('概率调整失败:', error)
        this.showError(error.message || '概率调整失败')
      } finally {
        this.saving = false
      }
    }
  }))

  console.log('✅ [UserManagementPage] Alpine 组件已注册 (Mixin v3.0)')
})

console.log('📦 [UserManagement] 页面脚本已加载 (Mixin v3.0)')
