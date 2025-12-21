const logger = require('../../../utils/logger').logger

/**
 * 管理员用户管理路由 - V4.0 UUID角色系统版本
 * 权限管理：完全使用UUID角色系统，移除is_admin字段依赖
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 路由层不开启事务（事务管理在 Service 层）
 * - 通过 req.app.locals.services 统一获取服务实例
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')

// 所有路由都需要管理员权限
router.use(authenticateToken)
router.use(requireAdmin)

/**
 * 🛡️ 获取用户列表（基于UUID角色系统）
 * GET /api/v4/admin/user_management/users
 */
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role_filter } = req.query

    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('userRole')

    // 调用 Service 层方法
    const result = await UserRoleService.getUserList({
      page,
      limit,
      search,
      role_filter
    })

    // 返回用户列表 - 参数顺序：data第1个, message第2个
    return res.apiSuccess(result, '获取用户列表成功')
  } catch (error) {
    logger.error('❌ 获取用户列表失败:', error.message)
    return res.apiError('获取用户列表失败', 'GET_USERS_FAILED', null, 500)
  }
})

/**
 * 🛡️ 获取单个用户详情（基于UUID角色系统）
 * GET /api/v4/admin/user_management/users/:user_id
 */
router.get('/users/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params

    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('userRole')

    // 调用 Service 层方法
    const result = await UserRoleService.getUserDetail(user_id)

    return res.apiSuccess(result, '获取用户详情成功')
  } catch (error) {
    logger.error('❌ 获取用户详情失败:', error.message)

    // 处理业务错误
    if (error.message.includes('用户不存在')) {
      return res.apiError(error.message, 'USER_NOT_FOUND', null, 404)
    }

    return res.apiError('获取用户详情失败', 'GET_USER_FAILED', null, 500)
  }
})

/**
 * 🛡️ 更新用户角色（基于UUID角色系统）
 * PUT /api/v4/admin/user_management/users/:user_id/role
 */
router.put('/users/:user_id/role', async (req, res) => {
  try {
    const { user_id } = req.params
    const { role_name, reason = '' } = req.body

    if (!role_name) {
      return res.apiError('角色名称不能为空', 'ROLE_NAME_REQUIRED', null, 400)
    }

    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('userRole')

    // 调用 Service 层方法（Service 层负责事务管理、权限验证、缓存清除、审计日志记录）
    const result = await UserRoleService.updateUserRole(user_id, role_name, req.user.user_id, {
      reason,
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    })

    logger.info(
      `✅ 用户角色更新成功: user_id=${user_id}, new_role=${role_name}, operator=${req.user.user_id}`
    )

    return res.apiSuccess(result, '用户角色更新成功')
  } catch (error) {
    logger.error('❌ 更新用户角色失败:', error.message)

    // 处理业务错误
    if (error.message.includes('用户不存在')) {
      return res.apiError(error.message, 'USER_NOT_FOUND', null, 404)
    }
    if (error.message.includes('权限不足')) {
      return res.apiError(error.message, 'PERMISSION_DENIED', null, 403)
    }
    if (error.message.includes('角色不存在')) {
      return res.apiError(error.message, 'ROLE_NOT_FOUND', null, 404)
    }

    return res.apiError('更新用户角色失败', 'UPDATE_USER_ROLE_FAILED', null, 500)
  }
})

/**
 * 🛡️ 更新用户状态
 * PUT /api/v4/admin/user_management/users/:user_id/status
 */
router.put('/users/:user_id/status', async (req, res) => {
  try {
    const { user_id } = req.params
    const { status, reason = '' } = req.body

    if (!status || !['active', 'inactive', 'banned'].includes(status)) {
      return res.apiError('无效的用户状态', 'INVALID_STATUS', null, 400)
    }

    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('userRole')

    // 调用 Service 层方法（Service 层负责权限验证、缓存清除）
    const result = await UserRoleService.updateUserStatus(user_id, status, req.user.user_id, {
      reason
    })

    logger.info(`✅ 用户状态更新成功: ${user_id} -> ${status} (操作者: ${req.user.user_id})`)

    return res.apiSuccess(result, '用户状态更新成功')
  } catch (error) {
    logger.error('❌ 更新用户状态失败:', error.message)

    // 处理业务错误
    if (error.message.includes('用户不存在')) {
      return res.apiError(error.message, 'USER_NOT_FOUND', null, 404)
    }
    if (error.message.includes('禁止修改自己的账号状态')) {
      return res.apiError(error.message, 'CANNOT_MODIFY_SELF', null, 403)
    }

    return res.apiError('更新用户状态失败', 'UPDATE_USER_STATUS_FAILED', null, 500)
  }
})

/**
 * 🛡️ 获取所有可用角色
 * GET /api/v4/admin/user_management/roles
 */
router.get('/roles', async (req, res) => {
  try {
    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('userRole')

    // 调用 Service 层方法
    const result = await UserRoleService.getRoleList()

    return res.apiSuccess(result, '获取角色列表成功')
  } catch (error) {
    logger.error('❌ 获取角色列表失败:', error.message)
    return res.apiError('获取角色列表失败', 'GET_ROLES_FAILED', null, 500)
  }
})

module.exports = router
