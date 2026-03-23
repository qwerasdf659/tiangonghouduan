/**
 * V4权限管理路由 - 基于UUID角色系统
 * 🛡️ 权限管理：移除is_admin依赖，使用UUID角色系统
 *
 * 顶层路径：/api/v4/permissions（2026-01-08 从 /api/v4/auth 拆分）
 * 内部目录：routes/v4/auth/permissions.js
 *
 * 职责：
 * - 权限检查（check）
 * - 权限缓存失效（cache/invalidate）
 * - 获取当前用户权限（me）
 * - 管理员列表（admins）
 * - 权限统计（statistics）
 *
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')
const express = require('express')
const router = express.Router()
// 🔧 2026-01-08：顶部统一引入 invalidateUserPermissions，避免重复 require
const {
  authenticateToken,
  getUserRoles,
  invalidateUserPermissions
} = require('../../../middleware/auth')
const permissionAuditLogger = require('../../../utils/PermissionAuditLogger') // 🔒 P1修复：审计日志系统
const logger = require('../../../utils/logger').logger

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
    logger.error('❌ 参数验证失败:', error)
    return res.apiInternalError('参数验证失败', error.message)
  }
}

/**
 * GET /api/v4/permissions/me - 获取我的权限信息
 *
 * @route GET /api/v4/permissions/me
 * @description 获取当前登录用户的权限信息（符合RESTful标准）
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id

    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('user_role')

    // 获取用户完整权限信息
    const permissions = await UserRoleService.getUserPermissions(parseInt(user_id))

    /**
     * 🔄 2026-01-19：移除便捷权限字段，前端统一用 role_level >= 100 判断管理员
     * 已移除字段：can_manage_lottery, can_view_admin_panel, can_modify_user_permissions
     */
    const response_data = {
      user_id: parseInt(user_id),
      roles: permissions.roles,
      role_level: permissions.role_level, // 角色级别（>= 100 为管理员，前端自行判断）
      permissions
    }

    return res.apiSuccess(response_data, '当前用户权限信息获取成功')
  } catch (error) {
    logger.error('❌ 获取当前用户权限失败:', error)
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

    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('user_role')

    // 🛡️ 获取用户角色信息
    const user_roles = await getUserRoles(user_id)

    // 🛡️ 检查权限
    const has_permission = await UserRoleService.checkUserPermission(user_id, resource, action)

    // 🔒 P1修复：记录权限检查审计日志
    await permissionAuditLogger.logPermissionCheck({
      user_id,
      resource,
      action,
      has_permission,
      role_level: user_roles.role_level, // 角色级别（>= 100 为管理员）
      ip_address: req.ip,
      user_agent: req.get('user-agent')
    })

    const response_data = {
      user_id,
      resource,
      action,
      has_permission,
      role_level: user_roles.role_level, // 角色级别（>= 100 为管理员）
      checked_at: BeijingTimeHelper.now()
    }

    return res.apiSuccess(response_data, '权限检查完成')
  } catch (error) {
    logger.error('❌ 权限检查失败:', error)
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

    // 🛡️ 检查管理员权限（role_level >= 100）
    const request_user_roles = await getUserRoles(request_user_id)
    if (request_user_roles.role_level < 100) {
      return res.apiError('需要管理员权限', 'ADMIN_REQUIRED', {}, 403)
    }

    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('user_role')

    // 🛡️ 获取所有管理员
    const admins = await UserRoleService.getAllAdmins()

    const response_data = {
      total: admins.length,
      admins: admins.map(admin => ({
        ...admin,
        role_level: admin.role_level // 角色级别（>= 100 为管理员）
      })),
      retrieved_at: BeijingTimeHelper.now()
    }

    return res.apiSuccess(response_data, '管理员列表获取成功')
  } catch (error) {
    logger.error('❌ 获取管理员列表失败:', error)
    return res.apiInternalError('获取管理员列表失败', error.message)
  }
})

/**
 * 🔄 权限缓存失效API（2026-01-08 重命名：/refresh → /cache/invalidate）
 * POST /api/v4/permissions/cache/invalidate
 *
 * @description 手动清除指定用户的权限缓存，用于权限配置更新后强制刷新
 *
 * 权限边界规则（2026-01-08 已拍板）：
 * - ✅ admin（role_level >= 100）：可以失效任意用户的权限缓存
 * - ✅ ops/user：仅可失效自己的权限缓存（self）
 * - ❌ ops/user 失效他人缓存：返回 403
 */
router.post('/cache/invalidate', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.body
    const request_user_id = req.user.user_id

    // 参数验证
    if (!user_id) {
      return res.apiError('user_id 参数必填', 'INVALID_PARAMETER', {}, 400)
    }

    // 🛡️ 权限检查（2026-01-08 已拍板）：只允许 admin 或用户本人失效缓存
    const request_user_roles = await getUserRoles(request_user_id)
    const is_self = parseInt(user_id) === request_user_id

    /*
     * 权限边界规则：
     * ✅ 允许：admin（role_level >= 100）对任意用户、用户对自己
     * ❌ 禁止：ops/user 对他人
     */
    if (!is_self && request_user_roles.role_level < 100) {
      logger.warn('❌ [Permissions] 权限缓存失效被拒绝', {
        target_user_id: user_id,
        operator_id: request_user_id,
        role_level: request_user_roles.role_level,
        ip: req.ip
      })
      return res.apiError(
        '只能失效自己的权限缓存或需要管理员权限',
        'FORBIDDEN',
        {
          hint: 'ops 角色仅可失效自己的缓存（self），失效他人缓存需要 admin 权限'
        },
        403
      )
    }

    // 验证目标用户是否存在（通过 ServiceManager 获取 UserService）
    const UserService = req.app.locals.services.getService('user')
    try {
      await UserService.getUserWithValidation(user_id, { checkStatus: false })
    } catch (error) {
      if (error.code === 'USER_NOT_FOUND') {
        return res.apiError('用户不存在', 'USER_NOT_FOUND', {}, 404)
      }
      throw error
    }

    // 🔄 清除权限缓存（使用顶部已引入的 invalidateUserPermissions，不再重复 require）
    await invalidateUserPermissions(user_id, 'manual_refresh', request_user_id)

    // 🔒 记录审计日志
    await permissionAuditLogger.logPermissionChange({
      user_id,
      operator_id: request_user_id,
      change_type: 'cache_invalidate',
      old_role: null,
      new_role: null,
      reason: 'manual_cache_invalidate'
    })

    logger.info('✅ [Permissions] 权限缓存已失效', {
      target_user_id: user_id,
      operator_id: request_user_id,
      cache_types: ['memory', 'redis'],
      request_id: req.id
    })

    const response_data = {
      user_id: parseInt(user_id),
      cache_cleared: true,
      invalidated_by: request_user_id,
      invalidated_at: BeijingTimeHelper.now()
    }

    return res.apiSuccess(response_data, '权限缓存已失效')
  } catch (error) {
    logger.error('❌ 失效权限缓存失败:', error)
    return res.apiInternalError('失效权限缓存失败', error.message)
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

    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('user_role')

    // 🛡️ 批量检查权限
    const result = await UserRoleService.batchCheckUserPermissions(user_id, permissions)

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
    logger.error('❌ 批量权限检查失败:', error)
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

    // 🛡️ 检查管理员权限（role_level >= 100）
    const request_user_roles = await getUserRoles(request_user_id)
    if (request_user_roles.role_level < 100) {
      return res.apiError('需要管理员权限', 'ADMIN_REQUIRED', {}, 403)
    }

    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('user_role')

    // 🛡️ 获取权限统计
    const statistics = await UserRoleService.getPermissionStatistics()

    const response_data = {
      ...statistics,
      role_level: request_user_roles.role_level, // 角色级别（>= 100 为管理员）
      retrieved_by: request_user_id
    }

    return res.apiSuccess(response_data, '权限统计信息获取成功')
  } catch (error) {
    logger.error('❌ 获取权限统计失败:', error)
    return res.apiInternalError('获取权限统计信息失败', error.message)
  }
})

module.exports = router
