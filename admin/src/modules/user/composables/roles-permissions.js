/**
 * 角色权限管理模块
 *
 * @file admin/src/modules/user/composables/roles-permissions.js
 * @description 角色、权限的 CRUD 操作，用户角色分配
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { USER_ENDPOINTS } from '../../../api/user.js'
import { buildURL } from '../../../api/base.js'

/**
 * 角色权限管理状态
 * @returns {Object} 状态对象
 */
export function useRolesPermissionsState() {
  return {
    /** @type {Array} 角色列表 */
    roles: [],
    /** @type {Array} 权限列表 */
    permissions: [],
    /** @type {Array} 用户角色分配列表 */
    userRoles: [],
    /** @type {Object} 用户角色筛选条件 */
    userRoleFilters: { user_id: '', role_code: '' },
    /** @type {Object} 角色表单 */
    roleForm: {
      role_code: '',
      role_name: '',
      description: '',
      role_level: 0,
      is_active: true
    },
    /** @type {Object} 权限表单 */
    permissionForm: {
      permission_code: '',
      permission_name: '',
      description: '',
      category: '',
      is_active: true
    },
    /** @type {Object} 用户角色分配表单 */
    userRoleForm: { user_id: '', role_code: '' },
    /** @type {number|string|null} 当前编辑的角色ID */
    editingRoleId: null,
    /** @type {number|string|null} 当前编辑的权限ID */
    editingPermissionId: null,
    /** @type {boolean} 是否编辑角色 */
    isEditRole: false,
    /** @type {boolean} 是否编辑权限 */
    isEditPermission: false,
    /** @type {Object|null} 选中的角色详情 */
    selectedRole: null,
    /** @type {Array} 角色的权限列表 */
    rolePermissions: [],
    /** @type {Array} 可分配的权限列表 */
    availablePermissions: []
  }
}

/**
 * 角色权限管理方法
 * @returns {Object} 方法对象
 */
export function useRolesPermissionsMethods() {
  return {
    // ==================== 角色管理 ====================

    /**
     * 加载角色列表
     */
    async loadRoles() {
      try {
        const response = await this.apiGet(USER_ENDPOINTS.ROLE_LIST, {}, { showLoading: false })
        if (response?.success) {
          this.roles = response.data?.roles || response.data?.list || []
        }
      } catch (error) {
        logger.error('加载角色失败:', error)
        this.roles = []
      }
    },

    /**
     * 打开创建角色模态框
     */
    openCreateRoleModal() {
      this.isEditRole = false
      this.editingRoleId = null
      this.roleForm = {
        role_code: '',
        role_name: '',
        description: '',
        role_level: 0,
        is_active: true
      }
      this.showModal('roleModal')
    },

    /**
     * 编辑角色
     * @param {Object} role - 角色对象
     */
    editRole(role) {
      this.isEditRole = true
      this.editingRoleId = role.role_id || role.id
      this.roleForm = {
        role_code: role.role_code || '',
        role_name: role.role_name || '',
        description: role.description || '',
        role_level: role.role_level || 0,
        is_active: role.is_active !== false
      }
      this.showModal('roleModal')
    },

    /**
     * 提交角色表单
     */
    async submitRoleForm() {
      if (!this.roleForm.role_code || !this.roleForm.role_name) {
        this.showError('请填写角色编码和名称')
        return
      }

      try {
        this.saving = true
        const url = this.isEditRole
          ? `${USER_ENDPOINTS.ROLE_LIST}/${this.editingRoleId}`
          : USER_ENDPOINTS.ROLE_LIST

        const response = await this.apiCall(url, {
          method: this.isEditRole ? 'PUT' : 'POST',
          data: this.roleForm
        })

        if (response?.success) {
          this.showSuccess(this.isEditRole ? '角色更新成功' : '角色创建成功')
          this.hideModal('roleModal')
          await this.loadRoles()
        }
      } catch (error) {
        this.showError('保存角色失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 删除角色
     * @param {Object} role - 角色对象
     */
    async deleteRole(role) {
      await this.confirmAndExecute(
        `确定删除角色「${role.role_name}」？此操作不可恢复`,
        async () => {
          const response = await this.apiCall(
            `${USER_ENDPOINTS.ROLE_LIST}/${role.role_id || role.id}`,
            { method: 'DELETE' }
          )
          if (response?.success) {
            await this.loadRoles()
          }
        },
        { successMessage: '角色已删除', confirmText: '确认删除' }
      )
    },

    // ==================== 权限管理 ====================

    /**
     * 加载权限列表
     */
    async loadPermissions() {
      try {
        const response = await this.apiGet(
          USER_ENDPOINTS.PERMISSION_LIST,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.permissions = response.data?.permissions || response.data?.list || []
        }
      } catch (error) {
        logger.error('加载权限失败:', error)
        this.permissions = []
      }
    },

    /**
     * 打开创建权限模态框
     */
    openCreatePermissionModal() {
      this.isEditPermission = false
      this.editingPermissionId = null
      this.permissionForm = {
        permission_code: '',
        permission_name: '',
        description: '',
        category: '',
        is_active: true
      }
      this.showModal('permissionModal')
    },

    /**
     * 编辑权限
     * @param {Object} permission - 权限对象
     */
    editPermission(permission) {
      this.isEditPermission = true
      this.editingPermissionId = permission.permission_id || permission.id
      this.permissionForm = {
        permission_code: permission.permission_code || '',
        permission_name: permission.permission_name || '',
        description: permission.description || '',
        category: permission.category || '',
        is_active: permission.is_active !== false
      }
      this.showModal('permissionModal')
    },

    /**
     * 提交权限表单
     */
    async submitPermissionForm() {
      if (!this.permissionForm.permission_code || !this.permissionForm.permission_name) {
        this.showError('请填写权限编码和名称')
        return
      }

      try {
        this.saving = true
        const url = this.isEditPermission
          ? `${USER_ENDPOINTS.PERMISSION_LIST}/${this.editingPermissionId}`
          : USER_ENDPOINTS.PERMISSION_LIST

        const response = await this.apiCall(url, {
          method: this.isEditPermission ? 'PUT' : 'POST',
          data: this.permissionForm
        })

        if (response?.success) {
          this.showSuccess(this.isEditPermission ? '权限更新成功' : '权限创建成功')
          this.hideModal('permissionModal')
          await this.loadPermissions()
        }
      } catch (error) {
        this.showError('保存权限失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 删除权限
     * @param {Object} permission - 权限对象
     */
    async deletePermission(permission) {
      await this.confirmAndExecute(
        `确定删除权限「${permission.permission_name}」？`,
        async () => {
          const response = await this.apiCall(
            `${USER_ENDPOINTS.PERMISSION_LIST}/${permission.permission_id || permission.id}`,
            { method: 'DELETE' }
          )
          if (response?.success) {
            await this.loadPermissions()
          }
        },
        { successMessage: '权限已删除', confirmText: '确认删除' }
      )
    },

    // ==================== 用户角色分配 ====================

    /**
     * 加载用户角色分配列表
     */
    async loadUserRoles() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.userRoleFilters.user_id) params.append('user_id', this.userRoleFilters.user_id)
        if (this.userRoleFilters.role_code) params.append('role_code', this.userRoleFilters.role_code)

        const response = await this.apiGet(
          `${USER_ENDPOINTS.USER_ROLE_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.userRoles = response.data?.user_roles || response.data?.list || []
          if (response.data?.pagination) {
            this.total = response.data.pagination.total || 0
            this.totalPages = response.data.pagination.total_pages || 1
          }
        }
      } catch (error) {
        logger.error('加载用户角色失败:', error)
        this.userRoles = []
      }
    },

    /**
     * 打开分配角色模态框
     */
    openAssignRoleModal() {
      this.userRoleForm = { user_id: '', role_code: '' }
      this.showModal('assignRoleModal')
    },

    /**
     * 提交角色分配
     */
    async submitAssignRole() {
      if (!this.userRoleForm.user_id || !this.userRoleForm.role_code) {
        this.showError('请选择用户和角色')
        return
      }

      try {
        this.saving = true
        const response = await this.apiCall(USER_ENDPOINTS.USER_ROLE_ASSIGN, {
          method: 'POST',
          data: this.userRoleForm
        })

        if (response?.success) {
          this.showSuccess('角色分配成功')
          this.hideModal('assignRoleModal')
          await this.loadUserRoles()
        }
      } catch (error) {
        this.showError('角色分配失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 移除用户角色
     * @param {Object} userRole - 用户角色对象
     */
    async removeUserRole(userRole) {
      await this.confirmAndExecute(
        `确定移除用户「${userRole.user_id}」的角色「${userRole.role_name || userRole.role_code}」？`,
        async () => {
          const response = await this.apiCall(USER_ENDPOINTS.USER_ROLE_REMOVE, {
            method: 'DELETE',
            data: { user_id: userRole.user_id, role_code: userRole.role_code }
          })
          if (response?.success) {
            await this.loadUserRoles()
          }
        },
        { successMessage: '角色已移除' }
      )
    },

    // ==================== 角色权限管理 ====================

    /**
     * 查看角色权限
     * @param {Object} role - 角色对象
     */
    async viewRolePermissions(role) {
      this.selectedRole = role
      try {
        const response = await this.apiGet(
          buildURL(USER_ENDPOINTS.ROLE_PERMISSIONS, { role_id: role.role_id || role.id }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.rolePermissions = response.data?.permissions || []
          this.showModal('rolePermissionsModal')
        }
      } catch (error) {
        logger.error('加载角色权限失败:', error)
        this.showError('加载角色权限失败')
      }
    },

    /**
     * 分配权限给角色
     * @param {string} permissionCode - 权限编码
     */
    async assignPermissionToRole(permissionCode) {
      if (!this.selectedRole) return

      try {
        const response = await this.apiCall(
          buildURL(USER_ENDPOINTS.ROLE_ASSIGN_PERMISSION, {
            role_id: this.selectedRole.role_id || this.selectedRole.id
          }),
          { method: 'POST', data: { permission_code: permissionCode } }
        )

        if (response?.success) {
          this.showSuccess('权限分配成功')
          await this.viewRolePermissions(this.selectedRole)
        }
      } catch (error) {
        this.showError('权限分配失败: ' + (error.message || '未知错误'))
      }
    },

    /**
     * 从角色移除权限
     * @param {string} permissionCode - 权限编码
     */
    async removePermissionFromRole(permissionCode) {
      if (!this.selectedRole) return

      await this.confirmAndExecute(
        `确定从角色中移除此权限？`,
        async () => {
          const response = await this.apiCall(
            buildURL(USER_ENDPOINTS.ROLE_REMOVE_PERMISSION, {
              role_id: this.selectedRole.role_id || this.selectedRole.id
            }),
            { method: 'DELETE', data: { permission_code: permissionCode } }
          )

          if (response?.success) {
            await this.viewRolePermissions(this.selectedRole)
          }
        },
        { successMessage: '权限已移除' }
      )
    }
  }
}

export default { useRolesPermissionsState, useRolesPermissionsMethods }

