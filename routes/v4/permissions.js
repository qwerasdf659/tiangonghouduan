/**
 * 权限管理API路由 V4.0
 * 提供统一的用户权限管理接口
 * 创建时间：2025年09月12日
 */

const express = require('express')
const router = express.Router()
const UserPermissionModule = require('../../modules/UserPermissionModule')
const { authenticateToken, requireAdmin } = require('../../middleware/auth')
const BeijingTimeHelper = require('../../utils/timeHelper')
const ApiResponse = require('../../utils/ApiResponse')

// 初始化权限管理模块
const permissionModule = new UserPermissionModule()

/**
 * 获取用户权限信息
 * GET /api/v4/permissions/user/:userId
 */
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    const requestUserId = req.user.user_id

    // 检查是否有权限查看指定用户的权限信息
    // 1. 用户只能查看自己的权限
    // 2. 管理员可以查看所有用户的权限
    if (parseInt(userId) !== requestUserId && !req.user.is_admin) {
      return res.status(403).json(ApiResponse.forbidden('无权限查看其他用户权限信息', 'FORBIDDEN'))
    }

    const permissions = await permissionModule.getUserPermissions(parseInt(userId))

    return res.apiSuccess(permissions, '用户权限信息获取成功')
  } catch (error) {
    console.error('获取用户权限失败:', error)
    return res.apiInternalError('获取用户权限信息失败', error.message)
  }
})

/**
 * 检查用户权限
 * POST /api/v4/permissions/check
 */
router.post('/check', authenticateToken, async (req, res) => {
  try {
    const { userId, permission, context } = req.body
    const requestUserId = req.user.user_id

    // 默认检查当前用户的权限
    const targetUserId = userId || requestUserId

    // 如果检查其他用户的权限，需要管理员权限
    if (targetUserId !== requestUserId && !req.user.is_admin) {
      return res.apiForbidden('无权限检查其他用户权限')
    }

    const permissionCheck = await permissionModule.checkPermission(
      targetUserId,
      permission,
      context || {}
    )

    return res.apiSuccess(permissionCheck, '权限检查完成')
  } catch (error) {
    console.error('权限检查失败:', error)
    return res.apiInternalError('权限检查服务异常', error.message)
  }
})

/**
 * 批量权限检查
 * POST /api/v4/permissions/batch-check
 */
router.post('/batch-check', requireAdmin, async (req, res) => {
  try {
    const { userIds, permission } = req.body

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.apiBadRequest('userIds必须是非空数组')
    }

    if (!permission) {
      return res.apiBadRequest('缺少权限类型参数')
    }

    const batchResults = await permissionModule.batchCheckPermissions(userIds, permission)

    return res.apiSuccess(batchResults, '操作成功')
  } catch (error) {
    console.error('批量权限检查失败:', error)
    return res.apiInternalError('操作失败', error.message)
  }
})

/**
 * 提升用户权限
 * POST /api/v4/permissions/promote
 */
router.post('/promote', requireAdmin, async (req, res) => {
  try {
    const { targetUserId, targetLevel, reason } = req.body
    const operatorId = req.user.user_id

    // 参数验证
    if (!targetUserId || typeof targetLevel !== 'number') {
      return res.apiBadRequest('缺少必要参数：targetUserId 和 targetLevel')
    }

    // 验证目标权限级别的有效性
    const validLevels = Object.values(permissionModule.permissionLevels)
    if (!validLevels.includes(targetLevel)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PARAMETERS',
        message: `无效的权限级别，有效值：${validLevels.join(', ')}`,
        timestamp: BeijingTimeHelper.apiTimestamp()
      })
    }

    const result = await permissionModule.promoteUser(
      targetUserId,
      targetLevel,
      operatorId,
      reason || '管理员权限提升操作'
    )

    return res.apiSuccess(result, '操作成功')
  } catch (error) {
    console.error('用户权限提升失败:', error)
    return res.apiInternalError('操作失败', error.message)
  }
})

/**
 * 创建安全管理员账户
 * POST /api/v4/permissions/create-admin
 */
router.post('/create-admin', requireAdmin, async (req, res) => {
  try {
    const { mobile, username, password, role, email } = req.body
    const operatorId = req.user.user_id

    // 参数验证
    if (!mobile || !username || !password) {
      return res.apiBadRequest('缺少必要参数：mobile, username, password')
    }

    // 验证管理员角色
    const validRoles = ['admin', 'super_admin']
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PARAMETERS',
        message: `无效的角色，有效值：${validRoles.join(', ')}`,
        timestamp: BeijingTimeHelper.apiTimestamp()
      })
    }

    const adminData = {
      mobile,
      username,
      password,
      role: role || 'admin',
      email
    }

    const result = await permissionModule.createSecureAdmin(adminData, operatorId)

    return res.apiSuccess(result, '操作成功')
  } catch (error) {
    console.error('创建管理员账户失败:', error)
    return res.apiInternalError('操作失败', error.message)
  }
})

/**
 * 获取权限审计日志
 * GET /api/v4/permissions/audit-log
 */
router.get('/audit-log', requireAdmin, async (req, res) => {
  try {
    const { userId, operatorId, action, startDate, endDate, page = 1, limit = 20 } = req.query

    const filters = {}
    if (userId) filters.userId = parseInt(userId)
    if (operatorId) filters.operatorId = parseInt(operatorId)
    if (action) filters.action = action
    if (startDate && endDate) {
      filters.startDate = new Date(startDate)
      filters.endDate = new Date(endDate)
    }

    const pagination = {
      page: parseInt(page),
      limit: parseInt(limit)
    }

    const auditLog = await permissionModule.getPermissionAuditLog(filters, pagination)

    res.apiSuccess(auditLog, '操作成功')
  } catch (error) {
    console.error('获取权限审计日志失败:', error)
    res.apiInternalError('操作失败', error.message)
  }
})

/**
 * 获取权限级别定义
 * GET /api/v4/permissions/levels
 */
router.get('/levels', authenticateToken, async (req, res) => {
  try {
    const levels = {
      permissionLevels: permissionModule.permissionLevels,
      permissionTypes: permissionModule.permissionTypes,
      levelDescriptions: {
        [permissionModule.permissionLevels.USER]: '普通用户 - 基础抽奖和查看功能',
        [permissionModule.permissionLevels.ADMIN]: '管理员 - 拥有普通用户所有权限 + 管理功能'
      }
    }

    res.apiSuccess(levels, '操作成功')
  } catch (error) {
    console.error('获取权限级别定义失败:', error)
    res.apiInternalError('操作失败', error.message)
  }
})

/**
 * 获取当前用户权限概览
 * GET /api/v4/permissions/me
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const permissions = await permissionModule.getUserPermissions(userId)

    // 构建权限概览
    const overview = {
      userInfo: {
        userId: permissions.userId,
        mobile: permissions.mobile,
        status: permissions.status,
        isAdmin: permissions.isAdmin,
        isSuperAdmin: permissions.isSuperAdmin,
        lastLogin: permissions.lastLogin
      },
      permissions: {
        level: permissions.permissionLevel,
        levelName: permissions.permissionLevelName,
        availablePermissions: permissions.availablePermissions
      },
      adminInfo: permissions.adminInfo
    }

    res.apiSuccess(overview, '操作成功')
  } catch (error) {
    console.error('获取当前用户权限概览失败:', error)
    res.apiInternalError('操作失败', error.message)
  }
})

module.exports = router
