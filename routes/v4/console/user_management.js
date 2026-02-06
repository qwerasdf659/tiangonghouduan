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
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')

// 所有路由都需要管理员权限
router.use(authenticateToken)
router.use(requireRoleLevel(100))

/**
 * 📊 获取用户管理统计数据
 * GET /api/v4/console/user_management/stats
 *
 * 业务场景：
 * - 管理后台用户管理模块统计概览
 * - 查看用户总体情况、增长趋势、角色分布
 *
 * 响应数据：
 * - summary: 概览指标（总用户数、新增、活跃）
 * - growth_rates: 增长率指标
 * - status_distribution: 用户状态分布（active/inactive/banned）
 * - role_distribution: 用户角色分布
 * - recent_registrations: 近期注册趋势（7日）
 *
 * @since 2026-02-05（用户管理模块统计接口）
 */
router.get('/stats', async (req, res) => {
  try {
    const { refresh } = req.query

    // 通过 ServiceManager 获取 ReportingStatsService
    const StatsService = req.app.locals.services.getService('reporting_stats')

    if (!StatsService) {
      logger.error('❌ 无法获取 reporting_stats 服务')
      return res.apiError('服务不可用', 'SERVICE_UNAVAILABLE', null, 500)
    }

    if (typeof StatsService.getUserManagementStats !== 'function') {
      logger.error('❌ StatsService.getUserManagementStats 方法不存在')
      return res.apiError('方法不存在', 'METHOD_NOT_FOUND', null, 500)
    }

    // 调用 Service 层方法获取用户管理统计
    const result = await StatsService.getUserManagementStats({
      refresh: refresh === 'true'
    })

    return res.apiSuccess(result, '获取用户管理统计成功')
  } catch (error) {
    logger.error('❌ 获取用户管理统计失败:', error.message, error.stack)
    return res.apiError(
      '获取用户管理统计失败',
      'GET_USER_STATS_FAILED',
      { error: error.message },
      500
    )
  }
})

/**
 * 🔍 根据手机号解析用户
 * GET /api/v4/console/user-management/users/resolve?mobile=13800138000
 *
 * 业务场景：
 * - 管理后台所有页面的「手机号搜索用户」统一入口
 * - 运营输入手机号 → 解析出 user_id → 前端用 user_id 调后续业务 API
 * - 替代原来 23 个页面要求运营输入 user_id 的设计
 *
 * 数据库查询：
 * - UserService.findByMobile(mobile) → User.findOne({ where: { mobile } })
 * - 查询条件：users.mobile（UNIQUE INDEX，精确匹配）
 * - 不过滤 status：管理员需要能搜到 inactive/banned 用户（查看状态、解封等操作）
 *
 * 缓存：
 * - UserService.findByMobile() 内置 Redis 缓存（BusinessCacheHelper, 120s TTL）
 * - 无需额外缓存代码
 *
 * 权限：authenticateToken + requireRoleLevel(100)（已在 router.use() 全局挂载）
 *
 * 响应格式：标准 ApiResponse（res.apiSuccess / res.apiError）
 *
 * @since 2026-02-06（手机号主导搜索改造）
 */
router.get('/users/resolve', async (req, res) => {
  try {
    const { mobile } = req.query

    // 参数校验：手机号不能为空
    if (!mobile) {
      return res.apiError('请提供手机号参数', 'MISSING_PARAM', null, 400)
    }

    // 手机号格式校验（11位数字，1开头）
    if (!/^1\d{10}$/.test(mobile)) {
      return res.apiError('手机号格式错误，请输入11位手机号', 'INVALID_MOBILE', null, 400)
    }

    // 通过 ServiceManager 获取 UserService（静态类，注册键为 'user'）
    const UserService = req.app.locals.services.getService('user')

    /*
     * 复用 UserService.findByMobile()（内置 Redis 缓存，120s TTL）
     * 注意：该方法查询 User.findOne({ where: { mobile } })，不过滤 status
     * 管理员需要能搜到所有状态的用户（active/inactive/banned）
     */
    const user = await UserService.findByMobile(mobile)

    if (!user) {
      return res.apiError('未找到该手机号对应的用户', 'USER_NOT_FOUND', null, 404)
    }

    // 转换为普通对象（缓存命中时已是普通对象，DB 查询时是 Sequelize 实例）
    const userData = user.get ? user.get({ plain: true }) : user

    /*
     * 返回字段说明（全部对齐 users 表字段名）：
     * - user_id:    users.user_id (INT, PK) — 后续业务 API 所需的内部标识
     * - mobile:     users.mobile (VARCHAR(20), UNIQUE) — 脱敏返回，格式 138****8000
     * - nickname:   users.nickname (VARCHAR(50), NULL) — 可能为空，空时用「用户+后4位」兜底
     * - status:     users.status (ENUM: active/inactive/banned) — 管理员需看到用户当前状态
     * - avatar_url: users.avatar_url (VARCHAR(500), NULL) — 用户头像
     * - user_level: users.user_level (ENUM: normal/vip/merchant) — 用户等级
     */
    return res.apiSuccess(
      {
        user_id: userData.user_id,
        mobile: userData.mobile.substring(0, 3) + '****' + userData.mobile.substring(7),
        nickname: userData.nickname || `用户${userData.mobile.slice(-4)}`,
        status: userData.status,
        avatar_url: userData.avatar_url || null,
        user_level: userData.user_level || 'normal'
      },
      '用户解析成功'
    )
  } catch (error) {
    logger.error('❌ 用户解析失败:', error.message)
    return res.apiError('用户解析失败', 'RESOLVE_USER_FAILED', { error: error.message }, 500)
  }
})

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
