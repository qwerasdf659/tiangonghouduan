/**
 * 角色权限管理模块
 *
 * @file admin/src/modules/user/composables/roles-permissions.js
 * @description 角色、权限的 CRUD 操作，用户角色分配
 * @version 2.1.0 - 完整实现角色 CRUD（匹配 HTML 模板）
 * @date 2026-01-26
 */

import { logger } from '../../../utils/logger.js'
import { USER_ENDPOINTS } from '../../../api/user.js'
import { buildURL } from '../../../api/base.js'

/**
 * 系统内置角色列表（不可删除/重命名）
 * 与后端 constants/PermissionResources.js 中的 SYSTEM_ROLES 保持一致
 */
const SYSTEM_ROLES = ['admin', 'user', 'system_job']

/**
 * 权限资源名称映射
 */
const RESOURCE_NAME_MAP = {
  lottery: '抽奖管理',
  prizes: '奖品管理',
  users: '用户管理',
  points: '积分管理',
  orders: '订单管理',
  products: '商品管理',
  analytics: '数据分析',
  system: '系统管理',
  content: '内容管理',
  market: '市场管理',
  finance: '财务管理',
  profile: '个人资料',
  notifications: '通知管理',
  settings: '设置管理',
  reports: '报表管理',
  audit: '审计日志',
  roles: '角色管理',
  permissions: '权限管理',
  '*': '全部资源'
}

/**
 * 操作类型名称映射
 */
const ACTION_NAME_MAP = {
  read: '查看',
  create: '创建',
  update: '更新',
  delete: '删除',
  participate: '参与',
  manage: '管理',
  export: '导出',
  import: '导入',
  approve: '审批',
  reject: '拒绝',
  '*': '全部操作'
}

/**
 * 判断是否为系统内置角色
 * @param {string} roleName - 角色名称
 * @returns {boolean}
 */
function isSystemRoleCheck(roleName) {
  return SYSTEM_ROLES.includes(roleName)
}

/**
 * 角色权限管理状态
 * @returns {Object} 状态对象
 */
export function useRolesPermissionsState() {
  return {
    /** @type {Array} 角色列表 */
    roles: [],
    /** @type {Array} 权限资源列表（从后端获取） */
    permissionResources: [],
    /** @type {Array} 权限列表（从角色中提取，只读展示用） */
    permissions: [],
    /** @type {Array} 用户角色分配列表 */
    userRoles: [],
    /** @type {Object} 用户角色筛选条件（手机号主导搜索） */
    userRoleFilters: { mobile: '', role_name: '' },
    /** @type {Object} 角色表单 */
    roleForm: {
      role_id: null,
      role_name: '',
      description: '',
      role_level: 10,
      permissions: {},
      is_active: true
    },
    /** @type {Object} 用户角色分配表单（手机号主导搜索） */
    userRoleForm: { mobile: '', role_name: '', reason: '' },
    /** @type {Object|null} 待删除的角色 */
    roleToDelete: null,
    /** @type {Object|null} 选中的角色（用于权限查看） */
    selectedRoleForPermissions: null,
    /** @type {Object} 权限配置临时存储（用于模态框编辑） */
    tempPermissions: {}
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
        const response = await this.apiGet(USER_ENDPOINTS.ROLES, {}, { showLoading: false })
        if (response?.success) {
          this.roles = response.data?.roles || response.data?.list || []
          logger.info('角色列表加载完成', { count: this.roles.length })
        }
      } catch (error) {
        logger.error('加载角色失败:', error)
        this.roles = []
      }
    },

    /**
     * 加载权限资源列表
     * @description 获取后端定义的所有可配置权限资源
     */
    async loadPermissionResources() {
      try {
        const response = await this.apiGet(
          USER_ENDPOINTS.PERMISSION_RESOURCES,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.permissionResources = response.data?.resources || []
          logger.info('权限资源列表加载完成', { count: this.permissionResources.length })
        }
      } catch (error) {
        logger.error('加载权限资源失败:', error)
        this.permissionResources = []
      }
    },

    /**
     * 打开创建角色模态框
     * @param {string} type - 创建类型（'role' 表示创建角色）
     */
    async openCreateModal(type) {
      if (type !== 'role') return

      this.roleForm = {
        role_id: null,
        role_name: '',
        description: '',
        role_level: 10,
        permissions: {},
        is_active: true
      }
      this.tempPermissions = {}

      // 加载权限资源列表
      if (!this.permissionResources || this.permissionResources.length === 0) {
        await this.loadPermissionResources()
      }

      this.showModal('roleEditModal')
    },

    /**
     * 编辑角色
     * @param {Object} role - 角色对象
     */
    async editRole(role) {
      this.roleForm = {
        role_id: role.role_id,
        role_name: role.role_name || '',
        description: role.description || '',
        role_level: role.role_level || 10,
        permissions: role.permissions || {},
        is_active: role.is_active !== false
      }

      // 复制权限到临时存储
      this.tempPermissions = JSON.parse(JSON.stringify(role.permissions || {}))

      // 加载权限资源列表
      if (!this.permissionResources || this.permissionResources.length === 0) {
        await this.loadPermissionResources()
      }

      this.showModal('roleEditModal')
    },

    /**
     * 提交角色表单（创建或更新）
     */
    async submitRoleForm() {
      // 表单验证
      if (!this.roleForm.role_name?.trim()) {
        this.showError('请输入角色名称')
        return
      }

      if (this.roleForm.role_level < 0 || this.roleForm.role_level > 999) {
        this.showError('角色级别必须在 0-999 之间')
        return
      }

      // 获取当前管理员的角色级别
      const currentAdmin = JSON.parse(localStorage.getItem('admin_user') || '{}')
      const myRoleLevel = currentAdmin.role_level || 0

      // 权限等级校验：不能创建/编辑比自己级别更高的角色
      if (this.roleForm.role_level > myRoleLevel) {
        this.showError(`不能创建/编辑权限级别高于您（${myRoleLevel}）的角色`)
        return
      }

      try {
        this.saving = true

        // 准备提交数据
        const submitData = {
          role_name: this.roleForm.role_name.trim(),
          description: this.roleForm.description?.trim() || '',
          role_level: parseInt(this.roleForm.role_level, 10),
          permissions: this.tempPermissions || {}
        }

        let response
        if (this.roleForm.role_id) {
          // 更新角色
          const url = buildURL(USER_ENDPOINTS.ROLE_UPDATE, { role_id: this.roleForm.role_id })
          response = await this.apiCall(url, { method: 'PUT', data: submitData })
        } else {
          // 创建角色
          response = await this.apiCall(USER_ENDPOINTS.ROLE_CREATE, {
            method: 'POST',
            data: submitData
          })
        }

        if (response?.success) {
          this.showSuccess(this.roleForm.role_id ? '角色更新成功' : '角色创建成功')
          this.hideModal('roleEditModal')
          await this.loadRoles()
        }
      } catch (error) {
        const errorMsg = error.response?.data?.message || error.message || '操作失败'
        this.showError(errorMsg)
        logger.error('角色保存失败:', error)
      } finally {
        this.saving = false
      }
    },

    /**
     * 确认删除角色（打开确认对话框）
     * @param {Object} role - 角色对象
     */
    confirmDeleteRole(role) {
      // 检查是否为系统角色
      if (isSystemRoleCheck(role.role_name)) {
        this.showError(`系统内置角色「${role.role_name}」不可删除`)
        return
      }

      this.roleToDelete = role
      this.showModal('roleDeleteModal')
    },

    /**
     * 执行删除角色（软删除）
     */
    async executeDeleteRole() {
      if (!this.roleToDelete) {
        this.showError('未选择要删除的角色')
        return
      }

      try {
        this.saving = true
        const url = buildURL(USER_ENDPOINTS.ROLE_DELETE, { role_id: this.roleToDelete.role_id })
        const response = await this.apiCall(url, { method: 'DELETE' })

        if (response?.success) {
          this.showSuccess('角色删除成功')
          this.hideModal('roleDeleteModal')
          this.roleToDelete = null
          await this.loadRoles()
        }
      } catch (error) {
        const errorMsg = error.response?.data?.message || error.message || '删除失败'
        this.showError(errorMsg)
        logger.error('角色删除失败:', error)
      } finally {
        this.saving = false
      }
    },

    // ==================== 权限配置辅助方法 ====================

    /**
     * 切换资源的某个操作权限
     * @param {string} resourceCode - 资源代码
     * @param {string} action - 操作类型
     */
    togglePermission(resourceCode, action) {
      if (!this.tempPermissions[resourceCode]) {
        this.tempPermissions[resourceCode] = []
      }

      const actions = this.tempPermissions[resourceCode]
      const index = actions.indexOf(action)

      if (index > -1) {
        // 移除权限
        actions.splice(index, 1)
        // 如果没有任何操作了，删除整个资源
        if (actions.length === 0) {
          delete this.tempPermissions[resourceCode]
        }
      } else {
        // 添加权限
        actions.push(action)
      }

      // 触发响应式更新
      this.tempPermissions = { ...this.tempPermissions }
    },

    /**
     * 检查是否有某个权限（用于模态框复选框）
     * @param {string} resourceCode - 资源代码
     * @param {string} action - 操作类型
     * @returns {boolean}
     */
    isPermissionSelected(resourceCode, action) {
      return this.tempPermissions[resourceCode]?.includes(action) || false
    },

    /**
     * 切换资源的所有操作权限
     * @param {string} resourceCode - 资源代码
     * @param {Array} allActions - 该资源的所有可用操作
     */
    toggleAllPermissions(resourceCode, allActions) {
      const currentActions = this.tempPermissions[resourceCode] || []

      if (currentActions.length === allActions.length) {
        // 已全选，取消全部
        delete this.tempPermissions[resourceCode]
      } else {
        // 未全选，选中全部
        this.tempPermissions[resourceCode] = [...allActions]
      }

      // 触发响应式更新
      this.tempPermissions = { ...this.tempPermissions }
    },

    /**
     * 检查资源是否全选
     * @param {string} resourceCode - 资源代码
     * @param {Array} allActions - 该资源的所有可用操作
     * @returns {boolean}
     */
    isAllSelected(resourceCode, allActions) {
      const currentActions = this.tempPermissions[resourceCode] || []
      return (
        currentActions.length === allActions.length &&
        allActions.every(a => currentActions.includes(a))
      )
    },

    /**
     * 获取资源的中文名称
     * @param {string} resourceCode - 资源代码
     * @returns {string}
     */
    getResourceName(resourceCode) {
      return RESOURCE_NAME_MAP[resourceCode] || resourceCode
    },

    /**
     * 获取操作的中文名称
     * @param {string} actionCode - 操作代码
     * @returns {string}
     */
    getActionName(actionCode) {
      return ACTION_NAME_MAP[actionCode] || actionCode
    },

    // ==================== 权限管理（只读展示） ====================

    /**
     * 加载权限列表（从角色中提取，用于只读展示）
     */
    async loadPermissions() {
      try {
        // 先确保角色列表已加载
        if (!this.roles || this.roles.length === 0) {
          await this.loadRoles()
        }

        // 从角色的 permissions 字段中提取权限信息
        const permissionMap = new Map()

        // 遍历所有角色，提取权限
        for (const role of this.roles) {
          let rolePermissions = role.permissions || {}

          // 处理 permissions 是字符串的情况
          if (typeof rolePermissions === 'string') {
            try {
              rolePermissions = JSON.parse(rolePermissions)
            } catch {
              logger.warn('解析权限字符串失败', {
                role: role.role_name,
                permissions: rolePermissions
              })
              continue
            }
          }

          // 确保是对象类型
          if (typeof rolePermissions !== 'object' || rolePermissions === null) {
            continue
          }

          for (const [resource, actions] of Object.entries(rolePermissions)) {
            // 跳过非权限字段
            if (resource === 'description' || !Array.isArray(actions)) {
              continue
            }

            if (!permissionMap.has(resource)) {
              const actionList = Array.isArray(actions) ? actions : [actions]
              permissionMap.set(resource, {
                permission_code: resource,
                permission_name: this.getResourceName(resource),
                description: `允许操作: ${actionList.map(a => this.getActionName(a)).join(', ')}`,
                actions: actionList,
                roles: [role.role_name]
              })
            } else {
              // 添加拥有此权限的角色
              const existing = permissionMap.get(resource)
              if (!existing.roles.includes(role.role_name)) {
                existing.roles.push(role.role_name)
              }
            }
          }
        }

        // 转换为数组
        this.permissions = Array.from(permissionMap.values())
        logger.info('权限列表加载完成（从角色提取）', { count: this.permissions.length })
      } catch (error) {
        logger.error('加载权限失败:', error)
        this.permissions = []
      }
    },

    // ==================== 用户角色分配 ====================

    /**
     * 加载用户角色分配列表
     */
    async loadUserRoles() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page || 1)
        params.append('page_size', this.page_size || 20)
        // 手机号 → resolve 获取 user_id
        if (this.userRoleFilters.mobile) {
          const user = await this.resolveUserByMobile(this.userRoleFilters.mobile)
          if (user) params.append('user_id', user.user_id)
        }
        if (this.userRoleFilters.role_name)
          params.append('role_name', this.userRoleFilters.role_name)

        const response = await this.apiGet(
          `${USER_ENDPOINTS.USER_ROLE_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.userRoles = response.data?.user_roles || response.data?.list || []
          if (response.data?.pagination) {
            this.total = response.data.pagination.total || 0
            this.total_pages = response.data.pagination.total_pages || 1
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
      this.userRoleForm = { mobile: '', role_name: '', reason: '' }
      // 确保角色列表已加载
      if (!this.roles || this.roles.length === 0) {
        this.loadRoles()
      }
      this.showModal('assignRoleModal')
    },

    /**
     * 提交角色分配（更新用户角色）
     */
    async submitAssignRole() {
      if (!this.userRoleForm.mobile || !this.userRoleForm.role_name) {
        this.showError('请填写手机号和选择角色')
        return
      }

      // 手机号 → resolve 获取 user_id
      const user = await this.resolveUserByMobile(this.userRoleForm.mobile)
      if (!user) return

      try {
        this.saving = true
        // 使用 UPDATE_ROLE API 更新用户角色
        const url = buildURL(USER_ENDPOINTS.UPDATE_ROLE, { user_id: user.user_id })
        const response = await this.apiCall(url, {
          method: 'PUT',
          data: {
            role_name: this.userRoleForm.role_name,
            reason: this.userRoleForm.reason || '管理员分配角色'
          }
        })

        if (response?.success) {
          this.showSuccess('用户角色更新成功')
          this.hideModal('assignRoleModal')
          await this.loadUserRoles()
        }
      } catch (error) {
        this.showError('角色更新失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 更改用户角色（快捷操作）
     * @param {Object} userRole - 用户角色记录
     * @param {string} newRoleName - 新角色名称
     */
    async changeUserRole(userRole, newRoleName) {
      if (!newRoleName) return

      // 获取当前角色名称
      const currentRoleName = userRole.role?.role_name || userRole.role_name || '未知'

      await this.confirmAndExecute(
        `确定将用户「${userRole.user?.nickname || userRole.user_id}」的角色从「${currentRoleName}」更改为「${newRoleName}」？`,
        async () => {
          const url = buildURL(USER_ENDPOINTS.UPDATE_ROLE, { user_id: userRole.user_id })
          const response = await this.apiCall(url, {
            method: 'PUT',
            data: {
              role_name: newRoleName,
              reason: `角色变更：${currentRoleName} -> ${newRoleName}`
            }
          })
          if (response?.success) {
            await this.loadUserRoles()
          }
        },
        { successMessage: '角色更新成功' }
      )
    },

    // ==================== 角色权限查看 ====================

    /**
     * 查看角色权限
     * @param {Object} role - 角色对象
     */
    manageRolePermissions(role) {
      this.selectedRoleForPermissions = role
      this.showModal('rolePermissionsModal')
    },

    /**
     * 检查是否为系统内置角色
     * @param {string} roleName - 角色名称
     * @returns {boolean}
     */
    isSystemRole(roleName) {
      return isSystemRoleCheck(roleName)
    }
  }
}

export default { useRolesPermissionsState, useRolesPermissionsMethods }
