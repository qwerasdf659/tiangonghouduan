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
import { buildURL } from '../../../api/base.js'

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
    /** @type {Object} 用户统计 */
    userStats: { totalUsers: 0, activeUsers: 0, totalRoles: 0, totalPermissions: 0 },
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
    isEditUser: false
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
        params.append('page', this.page)
        // 后端用户管理API使用 limit 而非 page_size
        params.append('limit', this.pageSize)
        // 后端支持 search 字段进行模糊搜索（支持 mobile 和 nickname）
        if (this.userFilters.user_id) params.append('search', this.userFilters.user_id)
        if (this.userFilters.nickname) params.append('search', this.userFilters.nickname)
        // 后端使用 role_filter 而非 status 进行角色筛选
        if (this.userFilters.status) params.append('role_filter', this.userFilters.status)

        const response = await this.apiGet(
          `${USER_ENDPOINTS.USER_LIST}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          this.users = response.data?.users || response.data?.list || []
          if (response.data?.pagination) {
            this.total = response.data.pagination.total || 0
            this.totalPages = response.data.pagination.total_pages || 1
          }
        }
      } catch (error) {
        logger.error('加载用户失败:', error)
        this.users = []
      }
    },

    /**
     * 加载用户统计
     */
    async loadUserStats() {
      try {
        const response = await this.apiGet(
          USER_ENDPOINTS.USER_STATS,
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success && response.data) {
          this.userStats = {
            totalUsers: response.data.total_users ?? response.data.totalUsers ?? 0,
            activeUsers: response.data.active_users ?? response.data.activeUsers ?? 0,
            totalRoles: response.data.total_roles ?? response.data.totalRoles ?? 0,
            totalPermissions: response.data.total_permissions ?? response.data.totalPermissions ?? 0
          }
        }
      } catch (error) {
        logger.error('加载用户统计失败:', error)
      }
    },

    /**
     * 搜索用户
     */
    searchUsers() {
      this.page = 1
      this.loadUsers()
    },

    /**
     * 重置用户筛选
     */
    resetUserFilters() {
      this.userFilters = { user_id: '', nickname: '', status: '' }
      this.page = 1
      this.loadUsers()
    },

    /**
     * 查看用户详情
     * @param {Object} user - 用户对象
     */
    async viewUserDetail(user) {
      try {
        const userId = user.user_id || user.id
        const response = await this.apiGet(
          buildURL(USER_ENDPOINTS.USER_DETAIL, { user_id: userId }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.selectedUserDetail = response.data
          this.showModal('userDetailModal')
        }
      } catch (error) {
        logger.error('加载用户详情失败:', error)
        this.showError('加载用户详情失败')
      }
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
            buildURL(USER_ENDPOINTS.USER_UPDATE_STATUS, { user_id: user.user_id }),
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
        active: 'bg-success',
        inactive: 'bg-secondary',
        banned: 'bg-danger',
        pending: 'bg-warning'
      }
      return map[status] || 'bg-secondary'
    },

    /**
     * 获取用户状态文本
     * @param {string} status - 用户状态
     * @returns {string} 状态文本
     */
    getUserStatusText(status) {
      const map = { active: '正常', inactive: '禁用', banned: '封禁', pending: '待审核' }
      return map[status] || status
    }
  }
}

export default { useUsersState, useUsersMethods }

