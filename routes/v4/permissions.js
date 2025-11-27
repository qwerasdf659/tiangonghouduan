/**
 * V4权限管理路由 - 基于UUID角色系统
 * 🛡️ 权限管理：移除is_admin依赖，使用UUID角色系统
 * 创建时间：2025年01月21日
 * 更新时间：2025年11月10日（方案2代码清理优化）
 */

const BeijingTimeHelper = require('../../utils/timeHelper')
const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles } = require('../../middleware/auth')
const permission_module = require('../../modules/UserPermissionModule')
const permissionAuditLogger = require('../../utils/PermissionAuditLogger') // 🔒 P1修复：审计日志系统

/**
 * 🛡️ P2修复：参数标准化验证中间件
 * @description 规范化和验证resource/action参数
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - Express下一步函数
 * @returns {void}
 */
const validatePermissionParams = (req, res, next) => {
  try {
    const { resource, action = 'read' } = req.body

    // 验证resource格式：只允许字母、数字、下划线、连字符
    if (!resource || typeof resource !== 'string') {
      return res.apiError('resource参数必须为非空字符串', 'INVALID_PARAMETER', {}, 400)
    }

    const resourcePattern = /^[a-zA-Z0-9_-]+$/
    if (!resourcePattern.test(resource)) {
      return res.apiError(
        'resource格式不正确，只允许字母、数字、下划线、连字符',
        'INVALID_RESOURCE_FORMAT',
        { resource },
        400
      )
    }

    // 验证action格式：只允许预定义的操作类型
    const validActions = ['read', 'create', 'update', 'delete', 'manage', '*']
    if (!validActions.includes(action)) {
      return res.apiError(
        `action参数不合法，允许的值: ${validActions.join(', ')}`,
        'INVALID_ACTION',
        { action, validActions },
        400
      )
    }

    // 🔒 参数规范化：转换为小写，去除首尾空格
    req.body.resource = resource.trim().toLowerCase()
    req.body.action = action.trim().toLowerCase()

    return next()
  } catch (error) {
    console.error('❌ 参数验证失败:', error)
    return res.apiInternalError('参数验证失败', error.message)
  }
}

/**
 * 🛡️ 获取指定用户权限信息
 * GET /api/v4/permissions/user/:user_id
 */
router.get('/user/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params
    const request_user_id = req.user.user_id

    // 🛡️ 检查是否有权限查看指定用户的权限信息
    const request_user_roles = await getUserRoles(request_user_id)
    if (parseInt(user_id) !== request_user_id && !request_user_roles.isAdmin) {
      return res.apiError('无权限查看其他用户权限信息', 'FORBIDDEN', {}, 403)
    }

    // 🛡️ 获取用户角色和权限信息
    const user_roles = await getUserRoles(parseInt(user_id))
    const permissions = await permission_module.getUserPermissions(parseInt(user_id))

    const response_data = {
      user_id: parseInt(user_id),
      roles: user_roles.roles,
      role_based_admin: user_roles.isAdmin,
      role_level: user_roles.role_level, // 🔄 统一命名：使用role_level
      permissions,
      // 🛡️ 简化的权限检查结果
      can_manage_lottery: user_roles.isAdmin,
      can_view_admin_panel: user_roles.isAdmin,
      can_modify_user_permissions: user_roles.isAdmin
    }

    return res.apiSuccess(response_data, '用户权限信息获取成功')
  } catch (error) {
    console.error('❌ 获取用户权限失败:', error)
    return res.apiInternalError('获取用户权限信息失败', error.message)
  }
})

/**
 * GET /api/v4/permissions/me - 获取我的权限信息
 *
 * @route GET /api/v4/permissions/me
 * @description 获取当前登录用户的权限信息（符合RESTful标准）
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id

    // 获取用户完整权限信息
    const permissions = await permission_module.getUserPermissions(parseInt(user_id))

    // 构建响应数据
    const response_data = {
      user_id: parseInt(user_id),
      roles: permissions.roles,
      role_based_admin: permissions.role_based_admin,
      role_level: permissions.role_level,
      permissions,
      can_manage_lottery: permissions.role_based_admin,
      can_view_admin_panel: permissions.role_based_admin,
      can_modify_user_permissions: permissions.role_based_admin
    }

    return res.apiSuccess(response_data, '当前用户权限信息获取成功')
  } catch (error) {
    console.error('❌ 获取当前用户权限失败:', error)
    return res.apiInternalError('获取当前用户权限信息失败', error.message)
  }
})

/**
 * 🛡️ 检查权限
 * POST /api/v4/permissions/check
 * 🔒 P2修复：添加参数标准化验证中间件
 */
router.post('/check', authenticateToken, validatePermissionParams, async (req, res) => {
  try {
    // 🔒 参数已通过validatePermissionParams中间件验证和规范化
    const { resource, action = 'read' } = req.body
    const user_id = req.user.user_id

    // 🛡️ 获取用户角色信息
    const user_roles = await getUserRoles(user_id)

    // 🛡️ 检查权限
    const has_permission = await permission_module.checkUserPermission(user_id, resource, action)

    // 🔒 P1修复：记录权限检查审计日志
    await permissionAuditLogger.logPermissionCheck({
      user_id,
      resource,
      action,
      has_permission,
      role_based_admin: user_roles.isAdmin,
      role_level: user_roles.role_level,
      ip_address: req.ip,
      user_agent: req.get('user-agent')
    })

    const response_data = {
      user_id,
      resource,
      action,
      has_permission,
      role_based_admin: user_roles.isAdmin,
      role_level: user_roles.role_level, // 🔄 统一命名：使用role_level
      checked_at: BeijingTimeHelper.now()
    }

    return res.apiSuccess(response_data, '权限检查完成')
  } catch (error) {
    console.error('❌ 权限检查失败:', error)
    return res.apiInternalError('权限检查失败', error.message)
  }
})

/**
 * 🛡️ 获取管理员列表
 * GET /api/v4/permissions/admins
 */
router.get('/admins', authenticateToken, async (req, res) => {
  try {
    const request_user_id = req.user.user_id

    // 🛡️ 检查管理员权限
    const request_user_roles = await getUserRoles(request_user_id)
    if (!request_user_roles.isAdmin) {
      return res.apiError('需要管理员权限', 'ADMIN_REQUIRED', {}, 403)
    }

    // 🛡️ 获取所有管理员
    const admins = await permission_module.getAllAdmins()

    const response_data = {
      total_count: admins.length,
      admins: admins.map(admin => ({
        ...admin,
        role_based_admin: admin.role_based_admin
      })),
      retrieved_at: BeijingTimeHelper.now()
    }

    return res.apiSuccess(response_data, '管理员列表获取成功')
  } catch (error) {
    console.error('❌ 获取管理员列表失败:', error)
    return res.apiInternalError('获取管理员列表失败', error.message)
  }
})

/**
 * 🔄 P2修复：权限缓存强制刷新API
 * POST /api/v4/permissions/refresh
 * @description 手动清除指定用户的权限缓存，用于权限配置更新后强制刷新
 */
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.body
    const request_user_id = req.user.user_id

    // 🛡️ 权限检查：只允许管理员或用户本人刷新权限缓存
    const request_user_roles = await getUserRoles(request_user_id)
    const is_self = parseInt(user_id) === request_user_id

    if (!is_self && !request_user_roles.isAdmin) {
      return res.apiError('只能刷新自己的权限缓存或需要管理员权限', 'FORBIDDEN', {}, 403)
    }

    // 验证目标用户是否存在
    const target_user_roles = await getUserRoles(user_id)
    if (!target_user_roles.exists) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND', {}, 404)
    }

    // 🔄 清除权限缓存
    const { invalidateUserPermissions } = require('../../middleware/auth')
    await invalidateUserPermissions(user_id, 'manual_refresh')

    // 🔒 记录审计日志
    await permissionAuditLogger.logPermissionChange({
      user_id,
      operator_id: request_user_id,
      change_type: 'cache_refresh',
      old_role: null,
      new_role: null,
      reason: 'manual_cache_refresh'
    })

    const response_data = {
      user_id,
      cache_cleared: true,
      refreshed_by: request_user_id,
      refreshed_at: BeijingTimeHelper.now()
    }

    return res.apiSuccess(response_data, '权限缓存已刷新')
  } catch (error) {
    console.error('❌ 刷新权限缓存失败:', error)
    return res.apiInternalError('刷新权限缓存失败', error.message)
  }
})

/**
 * 🔄 P3修复：批量权限检查API
 * POST /api/v4/permissions/batch-check
 * @description 批量检查多个权限，提高前端多权限检查效率
 * @body { permissions: [{ resource: string, action: string }] }
 */
router.post('/batch-check', authenticateToken, async (req, res) => {
  try {
    const { permissions } = req.body
    const user_id = req.user.user_id

    // 验证permissions参数
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return res.apiError('permissions必须为非空数组', 'INVALID_PARAMETER', {}, 400)
    }

    // 验证permissions数组中每项的格式
    for (const perm of permissions) {
      if (!perm.resource || typeof perm.resource !== 'string') {
        return res.apiError('每个权限项必须包含有效的resource字段', 'INVALID_PARAMETER', {}, 400)
      }
    }

    // 🛡️ 批量检查权限
    const result = await permission_module.batchCheckUserPermissions(user_id, permissions)

    // 🔒 记录审计日志（批量检查）
    await permissionAuditLogger.logPermissionCheck({
      user_id,
      resource: 'batch_check',
      action: 'read',
      has_permission: true,
      batch_count: permissions.length,
      ip_address: req.ip,
      user_agent: req.get('user-agent')
    })

    return res.apiSuccess(result, `批量权限检查完成（共${permissions.length}项）`)
  } catch (error) {
    console.error('❌ 批量权限检查失败:', error)
    return res.apiInternalError('批量权限检查失败', error.message)
  }
})

/**
 * 🛡️ 获取权限统计信息
 * GET /api/v4/permissions/statistics
 */
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const request_user_id = req.user.user_id

    // 🛡️ 检查管理员权限
    const request_user_roles = await getUserRoles(request_user_id)
    if (!request_user_roles.isAdmin) {
      return res.apiError('需要管理员权限', 'ADMIN_REQUIRED', {}, 403)
    }

    // 🛡️ 获取权限统计
    const statistics = await permission_module.getPermissionStatistics()

    const response_data = {
      ...statistics,
      role_based_admin: request_user_roles.isAdmin,
      retrieved_by: request_user_id
    }

    return res.apiSuccess(response_data, '权限统计信息获取成功')
  } catch (error) {
    console.error('❌ 获取权限统计失败:', error)
    return res.apiInternalError('获取权限统计信息失败', error.message)
  }
})

module.exports = router
