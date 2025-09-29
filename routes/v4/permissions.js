/**
 * 权限管理路由 - V4.0 统一版本
 * 🛡️ 权限管理：只有超级管理员(admin)和普通用户(user)两种角色
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles } = require('../../middleware/auth')
const permission_module = require('../../modules/UserPermissionModule')

/**
 * 🛡️ 获取用户权限信息
 * GET /api/v4/permissions/user/:userId
 */
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    const request_user_id = req.user.user_id

    // 🛡️ 检查是否有权限查看指定用户的权限信息
    // 1. 用户只能查看自己的权限
    // 2. 超级管理员可以查看所有用户的权限
    const request_user_roles = await getUserRoles(request_user_id)
    if (parseInt(userId) !== request_user_id && !request_user_roles.isAdmin) {
      return res.apiError('无权限查看其他用户权限信息', 'FORBIDDEN', {}, 403)
    }

    // 🛡️ 获取用户角色和权限信息
    const user_roles = await getUserRoles(parseInt(userId))
    const permissions = await permission_module.getUserPermissions(parseInt(userId))

    const response_data = {
      user_id: parseInt(userId),
      roles: user_roles.roles,
      is_admin: user_roles.isAdmin,
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
      is_admin: user_roles.isAdmin,
      role_level: user_roles.maxRoleLevel,
      permissions,
      // 🛡️ 简化的权限检查结果
      can_manage_lottery: user_roles.isAdmin,
      can_view_admin_panel: user_roles.isAdmin,
      can_modify_user_permissions: user_roles.isAdmin
    }

    return res.apiSuccess(response_data, '当前用户权限信息获取成功')
  } catch (error) {
    console.error('获取当前用户权限失败:', error)
    return res.apiInternalError('获取当前用户权限信息失败', error.message)
  }
})

/**
 * 🛡️ 检查用户是否有管理员权限
 * GET /api/v4/permissions/check-admin/:userId
 */
router.get('/check-admin/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    const request_user_id = req.user.user_id

    // 🛡️ 只有超级管理员可以检查其他用户的管理员权限
    const request_user_roles = await getUserRoles(request_user_id)
    if (!request_user_roles.isAdmin) {
      return res.apiError('无权限执行此操作', 'FORBIDDEN', {}, 403)
    }

    const user_roles = await getUserRoles(parseInt(userId))

    const response_data = {
      user_id: parseInt(userId),
      is_admin: user_roles.isAdmin,
      role_level: user_roles.maxRoleLevel,
      roles: user_roles.roles,
      can_manage_lottery: user_roles.isAdmin,
      can_view_admin_panel: user_roles.isAdmin
    }

    return res.apiSuccess(response_data, '管理员权限检查完成')
  } catch (error) {
    console.error('检查管理员权限失败:', error)
    return res.apiInternalError('检查管理员权限失败', error.message)
  }
})

/**
 * 🛡️ 设置用户管理员权限
 * POST /api/v4/permissions/set-admin
 */
router.post('/set-admin', authenticateToken, async (req, res) => {
  try {
    const { user_id, is_admin } = req.body
    const operator_id = req.user.user_id

    // 🛡️ 只有超级管理员可以设置其他用户的管理员权限
    const operator_roles = await getUserRoles(operator_id)
    if (!operator_roles.isAdmin) {
      return res.apiError('无权限执行此操作', 'FORBIDDEN', {}, 403)
    }

    // 🛡️ 通过角色系统设置管理员权限
    const result = await permission_module.setUserAdminRole(user_id, is_admin, operator_id)

    return res.apiSuccess(result, '用户权限设置成功')
  } catch (error) {
    console.error('设置用户权限失败:', error)
    return res.apiInternalError('设置用户权限失败', error.message)
  }
})

/**
 * 🛡️ 获取所有管理员列表
 * GET /api/v4/permissions/admins
 */
router.get('/admins', authenticateToken, async (req, res) => {
  try {
    const request_user_id = req.user.user_id

    // 🛡️ 只有超级管理员可以查看管理员列表
    const request_user_roles = await getUserRoles(request_user_id)
    if (!request_user_roles.isAdmin) {
      return res.apiError('无权限查看管理员列表', 'FORBIDDEN', {}, 403)
    }

    const admins = await permission_module.getAllAdmins()

    return res.apiSuccess({ admins, total: admins.length }, '管理员列表获取成功')
  } catch (error) {
    console.error('获取管理员列表失败:', error)
    return res.apiInternalError('获取管理员列表失败', error.message)
  }
})

/**
 * 🛡️ 批量权限检查
 * POST /api/v4/permissions/batch-check
 */
router.post('/batch-check', authenticateToken, async (req, res) => {
  try {
    const { user_ids } = req.body
    const request_user_id = req.user.user_id

    // 🛡️ 只有超级管理员可以批量检查权限
    const request_user_roles = await getUserRoles(request_user_id)
    if (!request_user_roles.isAdmin) {
      return res.apiError('无权限执行批量权限检查', 'FORBIDDEN', {}, 403)
    }

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.apiError('user_ids 必须是非空数组', 'INVALID_PARAMS')
    }

    // 🛡️ 批量获取用户权限信息
    const results = []
    for (const userId of user_ids) {
      try {
        const user_roles = await getUserRoles(parseInt(userId))
        results.push({
          user_id: parseInt(userId),
          is_admin: user_roles.isAdmin,
          role_level: user_roles.maxRoleLevel,
          roles: user_roles.roles,
          status: 'success'
        })
      } catch (error) {
        results.push({
          user_id: parseInt(userId),
          status: 'error',
          error: error.message
        })
      }
    }

    return res.apiSuccess(results, '批量权限检查完成')
  } catch (error) {
    console.error('批量权限检查失败:', error)
    return res.apiInternalError('批量权限检查失败', error.message)
  }
})

module.exports = router
