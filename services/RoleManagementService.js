/**
 * 角色管理服务 - 角色 CRUD 操作
 *
 * 从 UserRoleService 拆分而来（2026-01-26 角色权限管理功能）
 * 职责：角色的创建、更新、删除和权限资源查询
 *
 * 事务边界治理：
 * - 所有写操作强制要求外部事务传入（options.transaction）
 * - 未提供事务时直接报错（使用 assertAndGetTransaction）
 */

const BusinessError = require('../utils/BusinessError')
const { Role, UserRole } = require('../models')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const logger = require('../utils/logger')
const AuditLogService = require('./AuditLogService')
const { getUserRoles } = require('../middleware/auth')
const {
  isSystemRole,
  validatePermissions,
  getPermissionResources,
  SYSTEM_ROLES
} = require('../constants/PermissionResources')
const { OPERATION_TYPES } = require('../constants/AuditOperationTypes')

/**
 * 角色管理服务
 * @description 提供角色的创建、更新、删除及权限资源查询操作
 */
class RoleManagementService {
  /**
   * 🆕 创建角色
   *
   * 安全校验：角色名称唯一性、等级不能高于操作者、权限格式验证
   *
   * @param {Object} roleData - 角色数据
   * @param {number} operator_id - 操作者ID
   * @param {Object} options - 选项参数（options.transaction 必填）
   * @returns {Promise<Object>} 创建的角色信息
   */
  static async createRole(roleData, operator_id, options = {}) {
    const transaction = assertAndGetTransaction(options, 'RoleManagementService.createRole')
    const { ip_address, user_agent } = options
    const { role_name, description, role_level, permissions = {} } = roleData

    if (!role_name || typeof role_name !== 'string' || role_name.trim() === '') {
      throw new BusinessError('角色名称不能为空', 'ROLE_NOT_ALLOWED', 400)
    }

    if (typeof role_level !== 'number' || role_level < 0) {
      throw new BusinessError('角色等级必须是非负数字', 'ROLE_REQUIRED', 400)
    }

    if (isSystemRole(role_name.trim())) {
      throw new BusinessError(`不能创建与系统内置角色同名的角色: ${role_name}`, 'ROLE_NOT_ALLOWED', 400)
    }

    if (permissions && Object.keys(permissions).length > 0) {
      const permissionValidation = validatePermissions(permissions)
      if (!permissionValidation.valid) {
        throw new BusinessError(`权限配置格式错误: ${permissionValidation.errors.join(', ')}`, 'ROLE_ERROR', 400)
      }
    }

    // PLACEHOLDER_CREATE_OPERATOR_CHECK

    const operatorRoles = await getUserRoles(operator_id)
    const operatorMaxLevel =
      operatorRoles.roles.length > 0 ? Math.max(...operatorRoles.roles.map(r => r.role_level)) : 0

    if (role_level > operatorMaxLevel) {
      throw new BusinessError(
        `权限不足：不能创建权限等级高于自己的角色（操作者级别: ${operatorMaxLevel}, 目标角色级别: ${role_level}）`,
        'ROLE_INSUFFICIENT',
        400
      )
    }

    const existingRole = await Role.findOne({
      where: { role_name: role_name.trim() },
      transaction
    })

    if (existingRole) {
      throw new BusinessError(`角色名称已存在: ${role_name}`, 'ROLE_ALREADY_EXISTS', 409)
    }

    // PLACEHOLDER_CREATE_EXECUTE

    const newRole = await Role.create(
      {
        role_name: role_name.trim(),
        description: description || null,
        role_level,
        permissions,
        is_active: true
      },
      { transaction }
    )

    const idempotencyKey = `role_create_${newRole.role_id}_${Date.now()}`

    // PLACEHOLDER_CREATE_AUDIT

    await AuditLogService.logOperation({
      operator_id,
      operation_type: OPERATION_TYPES.ROLE_CREATE,
      target_type: 'Role',
      target_id: newRole.role_id,
      action: 'create',
      before_data: null,
      after_data: {
        role_id: newRole.role_id,
        role_uuid: newRole.role_uuid,
        role_name: newRole.role_name,
        role_level: newRole.role_level,
        permissions: newRole.permissions
      },
      reason: `创建角色: ${role_name}`,
      idempotency_key: idempotencyKey,
      ip_address,
      user_agent,
      transaction,
      is_critical_operation: true
    })

    // PLACEHOLDER_CREATE_RETURN

    logger.info('角色创建成功', {
      role_id: newRole.role_id,
      role_name: newRole.role_name,
      operator_id
    })

    return {
      role_id: newRole.role_id,
      role_uuid: newRole.role_uuid,
      role_name: newRole.role_name,
      role_level: newRole.role_level,
      description: newRole.description,
      permissions: newRole.permissions,
      is_active: newRole.is_active,
      created_at: newRole.created_at
    }
  }

  /**
   * ✏️ 更新角色
   *
   * 安全校验：系统内置角色不可编辑、等级不能高于操作者、权限格式验证
   *
   * @param {number} role_id - 角色ID
   * @param {Object} updateData - 更新数据（部分更新）
   * @param {number} operator_id - 操作者ID
   * @param {Object} options - 选项参数（options.transaction 必填）
   * @returns {Promise<Object>} 更新结果（包含 affected_user_ids）
   */
  static async updateRole(role_id, updateData, operator_id, options = {}) {
    const transaction = assertAndGetTransaction(options, 'RoleManagementService.updateRole')
    const { ip_address, user_agent } = options
    const { description, role_level, permissions } = updateData

    const role = await Role.findByPk(role_id, { transaction })
    if (!role) {
      throw new BusinessError('角色不存在', 'ROLE_NOT_FOUND', 404)
    }
    // PLACEHOLDER_UPDATE_BODY

    if (isSystemRole(role.role_name)) {
      throw new BusinessError(`系统内置角色不可修改: ${role.role_name}`, 'ROLE_NOT_ALLOWED', 400)
    }

    const operatorRoles = await getUserRoles(operator_id)
    const operatorMaxLevel =
      operatorRoles.roles.length > 0 ? Math.max(...operatorRoles.roles.map(r => r.role_level)) : 0

    if (role_level !== undefined && role_level > operatorMaxLevel) {
      throw new BusinessError(
        `权限不足：不能将角色等级设置为高于自己的级别（操作者级别: ${operatorMaxLevel}, 目标角色级别: ${role_level}）`,
        'ROLE_INSUFFICIENT',
        400
      )
    }

    if (permissions !== undefined && Object.keys(permissions).length > 0) {
      const permissionValidation = validatePermissions(permissions)
      if (!permissionValidation.valid) {
        throw new BusinessError(`权限配置格式错误: ${permissionValidation.errors.join(', ')}`, 'ROLE_ERROR', 400)
      }
    }

    // PLACEHOLDER_UPDATE_EXECUTE

    const beforeData = {
      role_id: role.role_id,
      role_name: role.role_name,
      role_level: role.role_level,
      description: role.description,
      permissions: role.permissions
    }

    const updateFields = {}
    if (description !== undefined) updateFields.description = description
    if (role_level !== undefined) updateFields.role_level = role_level
    if (permissions !== undefined) updateFields.permissions = permissions

    if (Object.keys(updateFields).length === 0) {
      throw new BusinessError('没有可更新的字段', 'ROLE_ERROR', 400)
    }

    await role.update(updateFields, { transaction })

    // PLACEHOLDER_UPDATE_AFFECTED

    const affectedUserRoles = await UserRole.findAll({
      where: { role_id, is_active: true },
      attributes: ['user_id'],
      transaction
    })
    const affectedUserIds = affectedUserRoles.map(ur => ur.user_id)

    const idempotencyKey = `role_update_${role_id}_${Date.now()}`

    // PLACEHOLDER_UPDATE_AUDIT

    await AuditLogService.logOperation({
      operator_id,
      operation_type: OPERATION_TYPES.ROLE_UPDATE,
      target_type: 'Role',
      target_id: role.role_id,
      action: 'update',
      before_data: beforeData,
      after_data: {
        role_id: role.role_id,
        role_name: role.role_name,
        role_level: role.role_level,
        description: role.description,
        permissions: role.permissions
      },
      reason: `更新角色: ${role.role_name}`,
      idempotency_key: idempotencyKey,
      ip_address,
      user_agent,
      transaction,
      is_critical_operation: true
    })

    // PLACEHOLDER_UPDATE_RETURN

    logger.info('角色更新成功', {
      role_id,
      role_name: role.role_name,
      operator_id,
      affected_users: affectedUserIds.length
    })

    return {
      role_id: role.role_id,
      role_uuid: role.role_uuid,
      role_name: role.role_name,
      role_level: role.role_level,
      description: role.description,
      permissions: role.permissions,
      updated_at: role.updated_at,
      affected_user_ids: affectedUserIds,
      post_commit_actions: {
        invalidate_cache_for_users: affectedUserIds,
        disconnect_ws_for_admin_users: affectedUserIds.length > 0
      }
    }
  }

  /**
   * 🗑️ 删除角色（软删除）
   *
   * 安全校验：系统内置角色不可删除
   *
   * @param {number} role_id - 角色ID
   * @param {number} operator_id - 操作者ID
   * @param {Object} options - 选项参数（options.transaction 必填）
   * @returns {Promise<Object>} 删除结果（包含 affected_user_ids）
   */
  static async deleteRole(role_id, operator_id, options = {}) {
    const transaction = assertAndGetTransaction(options, 'RoleManagementService.deleteRole')
    const { ip_address, user_agent } = options

    const role = await Role.findByPk(role_id, { transaction })
    if (!role) {
      throw new BusinessError('角色不存在', 'ROLE_NOT_FOUND', 404)
    }

    // PLACEHOLDER_DELETE_BODY

    if (isSystemRole(role.role_name)) {
      throw new BusinessError(`系统内置角色不可删除: ${role.role_name}`, 'ROLE_NOT_ALLOWED', 400)
    }

    if (!role.is_active) {
      throw new BusinessError(`角色已经被删除: ${role.role_name}`, 'ROLE_ERROR', 400)
    }

    const affectedUserRoles = await UserRole.findAll({
      where: { role_id, is_active: true },
      attributes: ['user_id'],
      transaction
    })
    const affectedUserIds = affectedUserRoles.map(ur => ur.user_id)

    const beforeData = {
      role_id: role.role_id,
      role_uuid: role.role_uuid,
      role_name: role.role_name,
      role_level: role.role_level,
      description: role.description,
      permissions: role.permissions,
      is_active: role.is_active
    }

    // PLACEHOLDER_DELETE_EXECUTE

    await role.update({ is_active: false }, { transaction })

    const idempotencyKey = `role_delete_${role_id}_${Date.now()}`

    await AuditLogService.logOperation({
      operator_id,
      operation_type: OPERATION_TYPES.ROLE_DELETE,
      target_type: 'Role',
      target_id: role.role_id,
      action: 'delete',
      before_data: beforeData,
      after_data: {
        ...beforeData,
        is_active: false
      },
      reason: `删除角色: ${role.role_name}`,
      idempotency_key: idempotencyKey,
      ip_address,
      user_agent,
      transaction,
      is_critical_operation: true
    })

    // PLACEHOLDER_DELETE_RETURN

    logger.info('角色删除成功（软删除）', {
      role_id,
      role_name: role.role_name,
      operator_id,
      affected_users: affectedUserIds.length
    })

    return {
      role_id: role.role_id,
      role_name: role.role_name,
      affected_users: affectedUserIds.length,
      affected_user_ids: affectedUserIds,
      post_commit_actions: {
        invalidate_cache_for_users: affectedUserIds,
        disconnect_ws_for_admin_users: affectedUserIds.length > 0
      }
    }
  }

  /**
   * 📋 获取权限资源列表
   * @returns {Object} 权限资源列表
   */
  static getPermissionResources() {
    return {
      resources: getPermissionResources(),
      system_roles: SYSTEM_ROLES
    }
  }
}

module.exports = RoleManagementService
