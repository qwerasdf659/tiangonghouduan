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
    /** @type {Object} 用户角色筛选条件（后端使用 role_name） */
    userRoleFilters: { user_id: '', role_name: '' },
    /** @type {Object} 角色表单（后端只读，暂不支持创建/编辑） */
    roleForm: {
      role_name: '',
      description: '',
      role_level: 0,
      is_active: true
    },
    /** @type {Object} 权限表单（后端使用嵌入式权限，无独立表） */
    permissionForm: {
      permission_code: '',
      permission_name: '',
      description: '',
      category: '',
      is_active: true
    },
    /** @type {Object} 用户角色分配表单（使用 UPDATE_ROLE API，需要 role_name） */
    userRoleForm: { user_id: '', role_name: '', reason: '' },
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
     * @description 后端暂未实现角色创建接口
     */
    openCreateRoleModal() {
      this.showError('角色创建功能后端暂未开放，请联系技术支持')
    },

    /**
     * 编辑角色
     * @description 后端暂未实现角色编辑接口
     * @param {Object} role - 角色对象
     */
    editRole(role) {
      this.showError('角色编辑功能后端暂未开放，请联系技术支持')
    },

    /**
     * 提交角色表单
     * @description 后端暂未实现角色CRUD接口，显示提示信息
     */
    async submitRoleForm() {
      // 后端暂未实现角色创建/编辑接口
      this.showError('角色管理功能后端暂未开放，请联系技术支持')
      this.hideModal('roleModal')
    },

    /**
     * 删除角色
     * @description 后端暂未实现角色删除接口
     * @param {Object} role - 角色对象
     */
    async deleteRole(role) {
      // 后端暂未实现角色删除接口
      this.showError('角色删除功能后端暂未开放，请联系技术支持')
    },

    // ==================== 权限管理 ====================

    /**
     * 加载权限列表
     * 📌 注意：后端设计中，权限是嵌入在角色的 permissions JSON 字段中
     *    没有独立的权限表和CRUD API
     *    此方法从角色列表中提取权限信息用于展示
     */
    async loadPermissions() {
      try {
        // 先确保角色列表已加载
        if (!this.roles || this.roles.length === 0) {
          await this.loadRoles()
        }

        // 从角色的 permissions 字段中提取权限信息
        // 后端 Role 模型的 permissions 字段格式：
        // { "lottery": ["read", "participate"], "profile": ["read", "update"] }
        const permissionMap = new Map()

        // 定义常见权限的中文名称映射
        const permissionNameMap = {
          lottery: '抽奖管理',
          profile: '个人资料',
          points: '积分管理',
          users: '用户管理',
          analytics: '数据分析',
          prizes: '奖品管理',
          '*': '全部权限'
        }

        const actionNameMap = {
          read: '查看',
          create: '创建',
          update: '更新',
          delete: '删除',
          participate: '参与',
          '*': '全部'
        }

        // 遍历所有角色，提取权限
        for (const role of this.roles) {
          let rolePermissions = role.permissions || {}
          
          // 处理 permissions 是字符串的情况（某些旧数据格式）
          if (typeof rolePermissions === 'string') {
            try {
              rolePermissions = JSON.parse(rolePermissions)
            } catch {
              logger.warn('解析权限字符串失败', { role: role.role_name, permissions: rolePermissions })
              continue
            }
          }
          
          // 确保是对象类型
          if (typeof rolePermissions !== 'object' || rolePermissions === null) {
            continue
          }
          
          for (const [resource, actions] of Object.entries(rolePermissions)) {
            // 跳过非权限字段（如 description）
            if (resource === 'description' || !Array.isArray(actions)) {
              continue
            }
            
            if (!permissionMap.has(resource)) {
              const actionList = Array.isArray(actions) ? actions : [actions]
              permissionMap.set(resource, {
                permission_code: resource,
                permission_name: permissionNameMap[resource] || resource,
                description: `允许操作: ${actionList.map(a => actionNameMap[a] || a).join(', ')}`,
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
     * @description 后端暂未实现权限CRUD接口，显示提示信息
     */
    async submitPermissionForm() {
      // 后端暂未实现权限创建/编辑接口
      this.showError('权限管理功能后端暂未开放，请联系技术支持')
      this.hideModal('permissionModal')
    },

    /**
     * 删除权限
     * @description 后端暂未实现权限删除接口
     * @param {Object} permission - 权限对象
     */
    async deletePermission(permission) {
      // 后端暂未实现权限删除接口
      this.showError('权限删除功能后端暂未开放，请联系技术支持')
    },

    // ==================== 用户角色分配 ====================

    /**
     * 加载用户角色分配列表
     * @description 使用 /api/v4/console/system-data/user-roles 只读查询
     */
    async loadUserRoles() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page || 1)
        params.append('page_size', this.pageSize || 20)
        if (this.userRoleFilters.user_id) params.append('user_id', this.userRoleFilters.user_id)
        if (this.userRoleFilters.role_name) params.append('role_name', this.userRoleFilters.role_name)

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
     * @description 使用 UPDATE_ROLE API 更新用户角色
     */
    openAssignRoleModal() {
      this.userRoleForm = { user_id: '', role_name: '', reason: '' }
      // 确保角色列表已加载
      if (!this.roles || this.roles.length === 0) {
        this.loadRoles()
      }
      this.showModal('assignRoleModal')
    },

    /**
     * 提交角色分配（更新用户角色）
     * @description 使用 PUT /api/v4/console/user-management/users/:user_id/role
     */
    async submitAssignRole() {
      if (!this.userRoleForm.user_id || !this.userRoleForm.role_name) {
        this.showError('请填写用户ID和选择角色')
        return
      }

      try {
        this.saving = true
        // 使用 UPDATE_ROLE API 更新用户角色
        const url = buildURL(USER_ENDPOINTS.UPDATE_ROLE, { user_id: this.userRoleForm.user_id })
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
     * @param {Object} userRole - 用户角色记录（包含关联的 role 对象）
     * @param {string} newRoleName - 新角色名称
     */
    async changeUserRole(userRole, newRoleName) {
      if (!newRoleName) return

      // 获取当前角色名称（从关联的 role 对象或直接字段）
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

    // ==================== 角色权限管理 ====================

    /**
     * 查看角色权限
     * @description 后端角色的权限是嵌入在 permissions JSON 字段中，直接显示
     * @param {Object} role - 角色对象
     */
    viewRolePermissions(role) {
      this.selectedRole = role
      // 权限是嵌入在角色的 permissions 字段中
      // 格式：{ "lottery": ["read", "participate"], "profile": ["read", "update"] }
      const permissions = role.permissions || {}
      this.rolePermissions = Object.entries(permissions).map(([resource, actions]) => ({
        resource,
        actions: Array.isArray(actions) ? actions : [actions],
        description: `${resource}: ${Array.isArray(actions) ? actions.join(', ') : actions}`
      }))
      this.showModal('rolePermissionsModal')
    },

    /**
     * 分配权限给角色
     * @description 后端暂未实现角色权限CRUD接口
     * @param {string} permissionCode - 权限编码
     */
    async assignPermissionToRole(permissionCode) {
      this.showError('角色权限分配功能后端暂未开放，请联系技术支持')
    },

    /**
     * 从角色移除权限
     * @description 后端暂未实现角色权限CRUD接口
     * @param {string} permissionCode - 权限编码
     */
    async removePermissionFromRole(permissionCode) {
      this.showError('角色权限移除功能后端暂未开放，请联系技术支持')
    },

    /**
     * 管理角色权限（别名，与 viewRolePermissions 相同）
     * @description 显示角色的权限配置，后端暂未开放编辑功能
     * @param {Object} role - 角色对象
     */
    manageRolePermissions(role) {
      // 后端暂未实现角色权限的独立 CRUD API
      // 权限嵌入在角色的 permissions JSON 字段中
      this.showError('角色编辑功能后端暂未开放，请联系技术支持')
      logger.info('查看角色权限', { role_name: role.role_name, permissions: role.permissions })
    }
  }
}

export default { useRolesPermissionsState, useRolesPermissionsMethods }

