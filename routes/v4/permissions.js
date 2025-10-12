/**
 * V4权限管理路由 - 基于UUID角色系统
 * 🛡️ 权限管理：移除is_admin依赖，使用UUID角色系统
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 */

const BeijingTimeHelper = require('../../utils/timeHelper')
const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles } = require('../../middleware/auth')
const permission_module = require('../../modules/UserPermissionModule')

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
      role_level: user_roles.maxRoleLevel,
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
 * 🛡️ 获取当前用户权限信息
 * GET /api/v4/permissions/current
 */
router.get('/current', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id
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
      role_level: user_roles.maxRoleLevel,
      permissions,
      // 🛡️ 简化的权限检查结果
      can_manage_lottery: user_roles.isAdmin,
      can_view_admin_panel: user_roles.isAdmin,
      can_modify_user_permissions: user_roles.isAdmin
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
 */
router.post('/check', authenticateToken, async (req, res) => {
  try {
    const { resource, action = 'read' } = req.body
    const user_id = req.user.user_id

    if (!resource) {
      return res.apiError('缺少必需参数: resource', 'MISSING_REQUIRED_PARAMETER', {}, 400)
    }

    // 🛡️ 获取用户角色信息
    const user_roles = await getUserRoles(user_id)

    // 🛡️ 检查权限
    const has_permission = await permission_module.checkUserPermission(user_id, resource, action)

    const response_data = {
      user_id,
      resource,
      action,
      has_permission,
      role_based_admin: user_roles.isAdmin,
      role_level: user_roles.maxRoleLevel,
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
