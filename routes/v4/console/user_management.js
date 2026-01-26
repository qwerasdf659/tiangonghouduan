const logger = require('../../../utils/logger').logger
const TransactionManager = require('../../../utils/TransactionManager')

/**
 * 管理员用户管理路由 - V4.0 UUID角色系统版本
 * 权限管理：完全使用UUID角色系统，移除is_admin字段依赖
 * 创建时间：2025年01月21日
 * 更新时间：2026年01月05日（事务边界治理改造）
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 写操作使用 TransactionManager.execute() 统一管理事务
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
 * GET /api/v4/console/user_management/users
 */
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role_filter } = req.query

    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('user_role')

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
 * GET /api/v4/console/user_management/users/:user_id
 */
router.get('/users/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params

    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('user_role')

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
 * PUT /api/v4/console/user_management/users/:user_id/role
 */
router.put('/users/:user_id/role', async (req, res) => {
  try {
    const { user_id } = req.params
    const { role_name, reason = '' } = req.body

    if (!role_name) {
      return res.apiError('角色名称不能为空', 'ROLE_NAME_REQUIRED', null, 400)
    }

    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('user_role')

    // 使用 TransactionManager 统一管理事务（2026-01-05 事务边界治理）
    const result = await TransactionManager.execute(
      async transaction => {
        return await UserRoleService.updateUserRole(user_id, role_name, req.user.user_id, {
          reason,
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          transaction
        })
      },
      { description: 'updateUserRole' }
    )

    // 事务提交后处理副作用（缓存失效、WebSocket断开）
    if (result.post_commit_actions) {
      const { invalidateUserPermissions } = require('../../../middleware/auth')

      if (result.post_commit_actions.invalidate_cache) {
        await invalidateUserPermissions(user_id, `role_change_to_${role_name}`, req.user.user_id)
        logger.info(`✅ 权限缓存已清除: user_id=${user_id}`)
      }

      if (result.post_commit_actions.disconnect_ws) {
        try {
          // P1-9：通过 ServiceManager 获取 ChatWebSocketService（snake_case key）
          const ChatWebSocketService = req.app.locals.services.getService('chat_web_socket')
          ChatWebSocketService.disconnectUser(user_id, 'user')
          ChatWebSocketService.disconnectUser(user_id, 'admin')
          logger.info(`✅ WebSocket连接已断开: user_id=${user_id}`)
        } catch (wsError) {
          logger.warn('断开WebSocket连接失败（非致命）', { user_id, error: wsError.message })
        }
      }
    }

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
 * PUT /api/v4/console/user_management/users/:user_id/status
 *
 * 安全检查：
 * - 禁止管理员修改自己的状态（自我保护机制）
 * - 使用 TransactionManager 统一管理事务边界
 */
router.put('/users/:user_id/status', async (req, res) => {
  try {
    const { user_id } = req.params
    const { status, reason = '' } = req.body
    const operatorId = req.user.user_id

    if (!status || !['active', 'inactive', 'banned'].includes(status)) {
      return res.apiError('无效的用户状态', 'INVALID_STATUS', null, 400)
    }

    /*
     * 🛡️ 自我保护检查（在事务之前检查，确保错误消息正确）
     * - 管理员不能修改自己的账号状态
     * - 防止误操作导致自己被锁定
     */
    if (parseInt(user_id) === operatorId) {
      return res.apiError(
        `禁止修改自己的账号状态（用户ID: ${user_id}, 操作者ID: ${operatorId}）`,
        'CANNOT_MODIFY_SELF',
        { user_id: parseInt(user_id), operator_id: operatorId },
        403
      )
    }

    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('user_role')

    // 使用 TransactionManager 统一管理事务（2026-01-08 事务边界治理）
    const result = await TransactionManager.execute(
      async transaction => {
        return await UserRoleService.updateUserStatus(user_id, status, operatorId, {
          reason,
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          transaction
        })
      },
      { description: 'updateUserStatus' }
    )

    logger.info(`✅ 用户状态更新成功: ${user_id} -> ${status} (操作者: ${operatorId})`)

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
 * GET /api/v4/console/user_management/roles
 */
router.get('/roles', async (req, res) => {
  try {
    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('user_role')

    // 调用 Service 层方法
    const result = await UserRoleService.getRoleList()

    return res.apiSuccess(result, '获取角色列表成功')
  } catch (error) {
    logger.error('❌ 获取角色列表失败:', error.message)
    return res.apiError('获取角色列表失败', 'GET_ROLES_FAILED', null, 500)
  }
})

/**
 * 🆕 创建角色
 * POST /api/v4/console/user_management/roles
 *
 * 安全校验：
 * - 需要超级管理员权限（role_level >= 100）
 * - 角色名称唯一性检查
 * - 角色等级不能高于操作者等级
 *
 * @since 2026-01-26（角色权限管理功能）
 */
router.post('/roles', async (req, res) => {
  try {
    const { role_name, description, role_level, permissions } = req.body
    const operatorId = req.user.user_id

    // 参数校验
    if (!role_name) {
      return res.apiError('角色名称不能为空', 'ROLE_NAME_REQUIRED', null, 400)
    }

    if (typeof role_level !== 'number' || role_level < 0) {
      return res.apiError('角色等级必须是非负数字', 'INVALID_ROLE_LEVEL', null, 400)
    }

    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('user_role')

    // 使用 TransactionManager 统一管理事务
    const result = await TransactionManager.execute(
      async transaction => {
        return await UserRoleService.createRole(
          { role_name, description, role_level, permissions },
          operatorId,
          {
            ip_address: req.ip,
            user_agent: req.headers['user-agent'],
            transaction
          }
        )
      },
      { description: 'createRole' }
    )

    logger.info(`✅ 角色创建成功: role_name=${role_name}, operator=${operatorId}`)

    return res.apiSuccess(result, '角色创建成功')
  } catch (error) {
    logger.error('❌ 创建角色失败:', error.message)

    // 处理业务错误
    if (error.message.includes('角色名称已存在')) {
      return res.apiError(error.message, 'ROLE_NAME_EXISTS', null, 400)
    }
    if (error.message.includes('权限不足')) {
      return res.apiError(error.message, 'PERMISSION_DENIED', null, 403)
    }
    if (error.message.includes('系统内置角色')) {
      return res.apiError(error.message, 'SYSTEM_ROLE_PROTECTED', null, 400)
    }
    if (error.message.includes('权限配置格式错误')) {
      return res.apiError(error.message, 'INVALID_PERMISSIONS', null, 400)
    }

    return res.apiError('创建角色失败', 'CREATE_ROLE_FAILED', null, 500)
  }
})

/**
 * ✏️ 更新角色
 * PUT /api/v4/console/user_management/roles/:role_id
 *
 * 安全校验：
 * - 需要超级管理员权限（role_level >= 100）
 * - 系统内置角色不可编辑
 * - 角色等级不能修改为高于操作者等级
 *
 * @since 2026-01-26（角色权限管理功能）
 */
router.put('/roles/:role_id', async (req, res) => {
  try {
    const { role_id } = req.params
    const { description, role_level, permissions } = req.body
    const operatorId = req.user.user_id

    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('user_role')

    // 使用 TransactionManager 统一管理事务
    const result = await TransactionManager.execute(
      async transaction => {
        return await UserRoleService.updateRole(
          parseInt(role_id),
          { description, role_level, permissions },
          operatorId,
          {
            ip_address: req.ip,
            user_agent: req.headers['user-agent'],
            transaction
          }
        )
      },
      { description: 'updateRole' }
    )

    // 事务提交后处理副作用（批量缓存失效、WebSocket断开）
    if (result.post_commit_actions && result.post_commit_actions.invalidate_cache_for_users) {
      const { invalidateUserPermissions } = require('../../../middleware/auth')
      const affectedUserIds = result.post_commit_actions.invalidate_cache_for_users

      // 批量失效受影响用户的权限缓存
      for (const userId of affectedUserIds) {
        // eslint-disable-next-line no-await-in-loop -- 缓存失效需要串行执行
        await invalidateUserPermissions(userId, `role_${role_id}_updated`, operatorId)
      }
      logger.info(`✅ 批量权限缓存已清除: 受影响用户数=${affectedUserIds.length}`)

      // 断开受影响管理员的 WebSocket 连接
      if (result.post_commit_actions.disconnect_ws_for_admin_users) {
        try {
          const ChatWebSocketService = req.app.locals.services.getService('chat_web_socket')
          for (const userId of affectedUserIds) {
            ChatWebSocketService.disconnectUser(userId, 'admin')
          }
          logger.info(`✅ 批量WebSocket连接已断开: 受影响用户数=${affectedUserIds.length}`)
        } catch (wsError) {
          logger.warn('批量断开WebSocket连接失败（非致命）', { error: wsError.message })
        }
      }
    }

    logger.info(`✅ 角色更新成功: role_id=${role_id}, operator=${operatorId}`)

    return res.apiSuccess(result, '角色更新成功')
  } catch (error) {
    logger.error('❌ 更新角色失败:', error.message)

    // 处理业务错误
    if (error.message.includes('角色不存在')) {
      return res.apiError(error.message, 'ROLE_NOT_FOUND', null, 404)
    }
    if (error.message.includes('系统内置角色不可修改')) {
      return res.apiError(error.message, 'SYSTEM_ROLE_PROTECTED', null, 403)
    }
    if (error.message.includes('权限不足')) {
      return res.apiError(error.message, 'PERMISSION_DENIED', null, 403)
    }
    if (error.message.includes('权限配置格式错误')) {
      return res.apiError(error.message, 'INVALID_PERMISSIONS', null, 400)
    }
    if (error.message.includes('没有可更新的字段')) {
      return res.apiError(error.message, 'NO_UPDATE_FIELDS', null, 400)
    }

    return res.apiError('更新角色失败', 'UPDATE_ROLE_FAILED', null, 500)
  }
})

/**
 * 🗑️ 删除角色（软删除）
 * DELETE /api/v4/console/user_management/roles/:role_id
 *
 * 安全校验：
 * - 需要超级管理员权限（role_level >= 100）
 * - 系统内置角色不可删除
 *
 * 软删除策略：
 * - 设置 is_active=false
 * - 现有用户保持原权限不受影响
 * - 角色从"可分配列表"中消失
 *
 * @since 2026-01-26（角色权限管理功能）
 */
router.delete('/roles/:role_id', async (req, res) => {
  try {
    const { role_id } = req.params
    const operatorId = req.user.user_id

    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('user_role')

    // 使用 TransactionManager 统一管理事务
    const result = await TransactionManager.execute(
      async transaction => {
        return await UserRoleService.deleteRole(parseInt(role_id), operatorId, {
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          transaction
        })
      },
      { description: 'deleteRole' }
    )

    // 事务提交后处理副作用（批量缓存失效、WebSocket断开）
    if (result.post_commit_actions && result.post_commit_actions.invalidate_cache_for_users) {
      const { invalidateUserPermissions } = require('../../../middleware/auth')
      const affectedUserIds = result.post_commit_actions.invalidate_cache_for_users

      // 批量失效受影响用户的权限缓存
      for (const userId of affectedUserIds) {
        // eslint-disable-next-line no-await-in-loop -- 缓存失效需要串行执行
        await invalidateUserPermissions(userId, `role_${role_id}_deleted`, operatorId)
      }
      logger.info(`✅ 批量权限缓存已清除: 受影响用户数=${affectedUserIds.length}`)

      // 断开受影响管理员的 WebSocket 连接
      if (result.post_commit_actions.disconnect_ws_for_admin_users) {
        try {
          const ChatWebSocketService = req.app.locals.services.getService('chat_web_socket')
          for (const userId of affectedUserIds) {
            ChatWebSocketService.disconnectUser(userId, 'admin')
          }
          logger.info(`✅ 批量WebSocket连接已断开: 受影响用户数=${affectedUserIds.length}`)
        } catch (wsError) {
          logger.warn('批量断开WebSocket连接失败（非致命）', { error: wsError.message })
        }
      }
    }

    logger.info(`✅ 角色删除成功: role_id=${role_id}, operator=${operatorId}`)

    return res.apiSuccess(result, '角色已删除')
  } catch (error) {
    logger.error('❌ 删除角色失败:', error.message)

    // 处理业务错误
    if (error.message.includes('角色不存在')) {
      return res.apiError(error.message, 'ROLE_NOT_FOUND', null, 404)
    }
    if (error.message.includes('系统内置角色不可删除')) {
      return res.apiError(error.message, 'SYSTEM_ROLE_PROTECTED', null, 403)
    }
    if (error.message.includes('角色已经被删除')) {
      return res.apiError(error.message, 'ROLE_ALREADY_DELETED', null, 400)
    }

    return res.apiError('删除角色失败', 'DELETE_ROLE_FAILED', null, 500)
  }
})

/**
 * 📋 获取权限资源列表
 * GET /api/v4/console/user_management/permission-resources
 *
 * 返回系统定义的所有权限资源和可用操作，用于角色权限配置界面。
 *
 * @since 2026-01-26（角色权限管理功能）
 */
router.get('/permission-resources', async (req, res) => {
  try {
    // 通过 ServiceManager 获取 UserRoleService
    const UserRoleService = req.app.locals.services.getService('user_role')

    // 调用 Service 层方法
    const result = UserRoleService.getPermissionResources()

    return res.apiSuccess(result, '获取权限资源列表成功')
  } catch (error) {
    logger.error('❌ 获取权限资源列表失败:', error.message)
    return res.apiError('获取权限资源列表失败', 'GET_PERMISSION_RESOURCES_FAILED', null, 500)
  }
})

module.exports = router
