/**
 * 用户管理模块
 *
 * @file admin/src/modules/user/composables/users.js
 * @description 用户的 CRUD 操作、筛选、统计
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { USER_ENDPOINTS } from '../../../api/user.js'
import { API_PREFIX, buildURL } from '../../../api/base.js'

/**
 * 用户管理状态
 * @returns {Object} 状态对象
 */
export function useUsersState() {
  return {
    /** @type {Array} 用户列表 */
    users: [],
    /** @type {Object} 用户筛选条件 */
    userFilters: { user_id: '', nickname: '', status: '' },
    /** @type {Object} 用户统计 - 直接使用后端字段名 */
    userStats: {
      total_users: 0,
      active_users: 0,
      total_roles: 0,
      total_permissions: 0,
      new_users_today: 0,
      new_users_last_7_days: 0,
      new_users_last_30_days: 0,
      active_users_today: 0,
      daily_growth_rate: 0,
      weekly_growth_rate: 0,
      active_rate: 0,
      status_distribution: {},
      role_distribution: [],
      recent_registrations: [],
      generated_at: null
    },
    /** @type {Object} 用户表单 */
    userForm: {
      user_id: '',
      nickname: '',
      avatar_url: '',
      status: 'active',
      description: ''
    },
    /** @type {number|string|null} 当前编辑的用户ID */
    editingUserId: null,
    /** @type {Object|null} 选中的用户详情 */
    selectedUserDetail: null,
    /** @type {boolean} 是否编辑模式 */
    isEditUser: false,

    // ==================== 分页状态（单一数据源）====================
    /** @type {Object} 分页对象 - 唯一数据源，HTML模板使用 pagination.xxx */
    pagination: { page: 1, page_size: 20, total: 0 },

    // Getter: 计算总页数
    get total_pages() {
      return Math.ceil(this.pagination.total / this.pagination.page_size) || 1
    },
    /** @type {Object|null} 选中的用户 - HTML模板使用 selectedUser */
    selectedUser: null,
    /** @type {Object} 编辑用户表单 - HTML模板使用 editUserForm */
    editUserForm: { user_id: '', nickname: '', status: 'active' },
    /** @type {Object|null} 选中的用户用于角色分配 */
    selectedUserForRole: null,
    /** @type {Object} 分配角色表单 - HTML模板使用 assignRoleForm */
    assignRoleForm: { user_id: '', role_code: '' },
    /** @type {string} 选中的角色代码 - HTML模板 x-model 使用 */
    selectedRoleCode: '',
    /** @type {Array} 奖品列表 - 概率调整需要 */
    allPrizes: [],
    /** @type {string} 概率预览HTML */
    probabilityPreviewHtml: '',
    /** @type {Object} 概率弹窗状态 */
    probabilityModal: {
      user_id: '',
      user_nickname: '',
      mode: 'global',
      multiplier: 1.0,
      target_prize_id: '',
      custom_probability: 0,
      duration: 60,
      reason: ''
    },
    /** @type {Object|null} 选中的高级用户 */
    selectedPremiumUser: null
  }
}

/**
 * 用户管理方法
 * @returns {Object} 方法对象
 */
export function useUsersMethods() {
  return {
    /**
     * 加载用户列表
     */
    async loadUsers() {
      try {
        const params = new URLSearchParams()
        // 使用 pagination 对象作为唯一数据源
        params.append('page', this.pagination.page)
        // 后端用户管理API使用 limit 而非 page_size
        params.append('limit', this.pagination.page_size)
        // 后端支持 search 字段进行模糊搜索（支持 mobile 和 nickname）
        if (this.userFilters.user_id) params.append('search', this.userFilters.user_id)
        if (this.userFilters.nickname) params.append('search', this.userFilters.nickname)
        // 后端使用 role_filter 而非 status 进行角色筛选
        if (this.userFilters.status) params.append('role_filter', this.userFilters.status)

        const response = await this.apiGet(
          `${USER_ENDPOINTS.LIST}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          this.users = response.data?.users || response.data?.list || []
          if (response.data?.pagination) {
            // 只更新 pagination 对象（单一数据源）
            this.pagination.total = response.data.pagination.total || 0
            // total_pages 由 getter 自动计算
          }
        }
      } catch (error) {
        logger.error('加载用户失败:', error)
        this.users = []
      }
    },

    /**
     * 加载用户统计
     * @description 从后端 API 获取用户管理统计数据
     */
    async loadUserStats() {
      // 调用后端 API: GET /api/v4/console/user-management/stats
      const response = await this.apiGet(`${API_PREFIX}/console/user-management/stats`)

      if (!response?.success) {
        throw new Error(response?.message || '获取用户统计失败')
      }

      const data = response.data

      // 确保角色列表已加载（用于计算 totalRoles 和 totalPermissions）
      if (!this.roles || this.roles.length === 0) {
        await this.loadRoles()
      }

      // 从角色的 permissions 字段中提取唯一权限数量
      const permissionSet = new Set()
      for (const role of this.roles || []) {
        let permissions = role.permissions || {}
        if (typeof permissions === 'string') {
          try {
            permissions = JSON.parse(permissions)
          } catch {
            continue
          }
        }
        if (typeof permissions === 'object' && permissions !== null) {
          Object.keys(permissions).forEach(p => {
            if (p !== 'description' && Array.isArray(permissions[p])) {
              permissionSet.add(p)
            }
          })
        }
      }

      // 使用后端返回的统计数据（直接使用后端字段名）
      this.userStats = {
        // 基础统计
        total_users: data.summary?.total_users || 0,
        active_users: data.summary?.active_users_last_7_days || 0,
        total_roles: this.roles?.length || 0,
        total_permissions: permissionSet.size,
        // 扩展统计
        new_users_today: data.summary?.new_users_today || 0,
        new_users_last_7_days: data.summary?.new_users_last_7_days || 0,
        new_users_last_30_days: data.summary?.new_users_last_30_days || 0,
        active_users_today: data.summary?.active_users_today || 0,
        // 增长率
        daily_growth_rate: data.growth_rates?.daily_growth_rate || 0,
        weekly_growth_rate: data.growth_rates?.weekly_growth_rate || 0,
        active_rate: data.growth_rates?.active_rate || 0,
        // 分布数据
        status_distribution: data.status_distribution || {},
        role_distribution: data.role_distribution || [],
        recent_registrations: data.recent_registrations || [],
        // 元数据
        generated_at: data.generated_at
      }

      logger.info('用户统计加载完成', {
        total_users: this.userStats.total_users,
        new_users_today: this.userStats.new_users_today
      })
    },

    /**
     * 搜索用户
     */
    searchUsers() {
      this.pagination.page = 1
      this.loadUsers()
    },

    /**
     * 重置用户筛选
     */
    resetUserFilters() {
      this.userFilters = { user_id: '', nickname: '', status: '' }
      this.pagination.page = 1
      this.loadUsers()
    },

    /**
     * 查看用户详情 - 打开用户360°视图抽屉
     * @param {Object} user - 用户对象
     */
    async viewUserDetail(user) {
      try {
        const userId = user.user_id || user.id
        const userData = {
          user_id: userId,
          nickname: user.nickname || '',
          mobile: user.mobile || '',
          status: user.status || 'active',
          role_name: user.role_name || '',
          created_at: user.created_at || ''
        }

        // P1-1: 使用用户360°视图抽屉
        if (window.Alpine?.store('userDrawer')) {
          window.Alpine.store('userDrawer').open(userData)
          logger.info('[viewUserDetail] 打开用户360°视图抽屉:', userId)
        } else {
          // 后备方案：使用原有弹窗
          logger.warn('[viewUserDetail] 用户抽屉未初始化，使用弹窗')
          const response = await this.apiGet(
            buildURL(USER_ENDPOINTS.DETAIL, { user_id: userId }),
            {},
            { showLoading: true }
          )
          if (response?.success) {
            const detailData = response.data?.user || response.data
            this.selectedUserDetail = detailData
            this.selectedUser = detailData
            this.editUserForm = {
              user_id: detailData.user_id || '',
              nickname: detailData.nickname || '',
              status: detailData.status || 'active'
            }
            this.showModal('userDetailModal')
          }
        }
      } catch (error) {
        logger.error('加载用户详情失败:', error)
        this.showError('加载用户详情失败')
      }
    },

    /**
     * 编辑用户 - 打开编辑弹窗
     * @param {Object} user - 用户对象
     */
    editUser(user) {
      this.editUserForm = {
        user_id: user.user_id || '',
        nickname: user.nickname || '',
        status: user.status || 'active'
      }
      this.selectedUser = user
      this.showModal('editUserModal')
    },

    /**
     * 提交编辑用户表单
     */
    async submitEditUser() {
      try {
        if (!this.editUserForm.user_id) {
          this.showError('用户ID不能为空')
          return
        }

        const response = await this.apiCall(
          buildURL(USER_ENDPOINTS.UPDATE_STATUS, { user_id: this.editUserForm.user_id }),
          {
            method: 'PUT',
            data: {
              status: this.editUserForm.status,
              nickname: this.editUserForm.nickname
            }
          }
        )

        if (response?.success) {
          this.showSuccess('用户信息已更新')
          this.hideModal('editUserModal')
          await this.loadUsers()
        }
      } catch (error) {
        logger.error('更新用户失败:', error)
        this.showError('更新用户失败')
      }
    },

    /**
     * 切换用户状态（启用/禁用）
     * @param {Object} user - 用户对象
     */
    async toggleUserStatus(user) {
      const newStatus = user.status === 'active' ? 'inactive' : 'active'
      await this.updateUserStatus(user, newStatus)
    },

    /**
     * 更新用户状态
     * @param {Object} user - 用户对象
     * @param {string} newStatus - 新状态
     */
    async updateUserStatus(user, newStatus) {
      const statusText = newStatus === 'active' ? '启用' : '禁用'
      await this.confirmAndExecute(
        `确定要${statusText}用户「${user.nickname || user.user_id}」吗？`,
        async () => {
          const response = await this.apiCall(
            buildURL(USER_ENDPOINTS.UPDATE_STATUS, { user_id: user.user_id }),
            { method: 'PUT', data: { status: newStatus } }
          )
          if (response?.success) {
            await this.loadUsers()
            await this.loadUserStats()
          }
        },
        { successMessage: `用户已${statusText}` }
      )
    },

    /**
     * 获取用户状态CSS类
     * @param {string} status - 用户状态
     * @returns {string} CSS类名
     */
    getUserStatusClass(status) {
      const map = {
        active: 'bg-green-500',
        inactive: 'bg-gray-500',
        banned: 'bg-red-500',
        pending: 'bg-yellow-500'
      }
      return map[status] || 'bg-gray-500'
    },

    /**
     * 获取用户状态文本
     * @param {string} status - 用户状态
     * @returns {string} 状态文本
     */
    // ✅ 已删除 getUserStatusText 映射函数 - 改用后端 _display 字段（P2 中文化）

    /**
     * 管理用户角色 - 打开角色分配弹窗
     * @param {Object} user - 用户对象
     */
    async manageUserRole(user) {
      this.selectedUserForRole = user
      this.selectedRoleCode = ''
      this.assignRoleForm = {
        user_id: user.user_id || '',
        role_code: ''
      }
      // 确保角色列表已加载（等待加载完成）
      if (!this.roles || this.roles.length === 0) {
        await this.loadRoles()
      }
      logger.info('[manageUserRole] 打开角色分配弹窗，角色数量:', this.roles?.length || 0)
      this.showModal('userRoleModal')
    },

    /**
     * 提交用户角色分配
     * @description 使用 PUT /api/v4/console/user-management/users/:user_id/role
     */
    async submitUserRole() {
      const userId = this.selectedUserForRole?.user_id
      const roleCode = this.selectedRoleCode

      if (!userId) {
        this.showError('用户信息不完整')
        return
      }

      if (!roleCode) {
        this.showError('请选择角色')
        return
      }

      // 从角色列表中查找角色名称
      const selectedRole = this.roles.find(
        r => (r.role_uuid || r.id) === roleCode || r.role_name === roleCode
      )
      const roleName = selectedRole?.role_name || roleCode

      try {
        this.saving = true
        const response = await this.apiCall(
          buildURL(USER_ENDPOINTS.UPDATE_ROLE, { user_id: userId }),
          {
            method: 'PUT',
            data: {
              role_name: roleName,
              reason: '管理员分配角色'
            }
          }
        )

        if (response?.success) {
          this.showSuccess(`角色分配成功：${roleName}`)
          this.hideModal('userRoleModal')
          await this.loadUsers()
        }
      } catch (error) {
        logger.error('角色分配失败:', error)
        this.showError('角色分配失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 打开用户概率配置弹窗
     * @param {Object} user - 用户对象
     */
    openProbabilityModal(user) {
      this.probabilityModal = {
        user_id: user.user_id || '',
        user_nickname: user.nickname || user.user_id || '',
        mode: 'global',
        multiplier: 1.0,
        target_prize_id: '',
        custom_probability: 0,
        duration: 60,
        reason: ''
      }
      this.selectedUser = user
      this.showModal('probabilityModal')
    },

    /**
     * 查看高级用户详情
     * @param {Object} user - 用户对象
     */
    viewPremiumDetail(user) {
      this.selectedUser = user
      this.showModal('premiumDetailModal')
    },

    /**
     * 上一页
     */
    prevPage() {
      if (this.pagination.page > 1) {
        this.pagination.page--
        this.loadUsers()
      }
    },

    /**
     * 下一页
     */
    nextPage() {
      // total_pages getter: Math.ceil(total / page_size)
      const total_pages = Math.ceil(this.pagination.total / this.pagination.page_size) || 1
      if (this.pagination.page < total_pages) {
        this.pagination.page++
        this.loadUsers()
      }
    },

    /**
     * 打开角色分配模态框
     * @param {Object} user - 用户对象
     */
    openAssignUserRoleModal(user) {
      this.selectedUserForRole = user
      this.assignRoleForm = {
        user_id: user.user_id || user.id || '',
        role_code: ''
      }
      this.showModal('userRoleModal')
    },

    /**
     * 打开编辑用户模态框
     * @param {Object} user - 用户对象
     */
    openEditUserModal(user) {
      this.selectedUser = user
      this.editUserForm = {
        user_id: user.user_id || '',
        nickname: user.nickname || '',
        status: user.status || 'active'
      }
      this.showModal('editUserModal')
    }
  }
}

export default { useUsersState, useUsersMethods }
