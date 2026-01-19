/**
 * 用户角色服务 - 统一用户权限操作接口
 * 创建时间：2025年01月21日
 * 最后更新：2026年01月19日（合并 UserPermissionModule 功能）
 *
 * 🎯 目的：简化用户权限操作，而不合并User和Role模型
 * 🛡️ 优势：保持模型分离的同时提供便捷的业务接口
 *
 * 📋 2026-01-19 合并 UserPermissionModule 功能：
 * - getUserPermissions() - 获取用户权限信息
 * - getAllAdmins() - 获取所有管理员列表
 * - batchCheckUserPermissions() - 批量检查权限
 * - getPermissionStatistics() - 权限统计信息
 * - validateOperation() - 验证操作权限
 * - getAdminInfo() - 获取管理员信息
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 所有写操作 **强制要求** 外部事务传入（options.transaction）
 * - 未提供事务时直接报错（使用 assertAndGetTransaction）
 * - 服务层禁止自建事务，由入口层统一使用 TransactionManager.execute()
 * - 缓存失效、WebSocket断开等副作用应在事务提交后由调用方处理
 *
 * ⚠️ 【安全使用指南】
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 1. 【生产环境推荐】
 *    - 路由层修改用户角色，必须使用 updateUserRole() 作为唯一入口
 *    - 该方法包含完整的：事务保护 + 权限校验 + 审计日志 + 缓存失效
 *
 * 2. 【assignUserRole / removeUserRole 使用限制】
 *    - ❌ 禁止在路由层直接调用这两个方法
 *    - ❌ 禁止在对外暴露的API接口中使用
 *    - ⚠️ 这两个方法缺少：事务保护、审计日志、缓存失效机制
 *    - ✅ 仅供内部工具、测试脚本、或特殊场景下的编排使用
 *
 * 3. 【为什么要限制使用】
 *    - 权限变更是高敏感操作，必须有完整的审计追踪
 *    - 必须自动失效用户权限缓存，否则权限不生效
 *    - 必须防止权限越级修改（低级别管理员修改高级别管理员）
 *    - 简单的分配/移除方法无法满足这些安全要求
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

const { User, Role, UserRole, UserRoleChangeRecord, UserStatusChangeRecord } = require('../models')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const BeijingTimeHelper = require('../utils/timeHelper')
const logger = require('../utils/logger')
const AuditLogService = require('./AuditLogService')

/**
 * 用户角色服务类
 * 职责：管理用户角色和权限的分配、移除、检查等操作
 * 特点：简化用户权限操作，保持User和Role模型分离
 * @class UserRoleService
 */
class UserRoleService {
  /**
   * 🔍 获取用户完整信息（包含角色权限）
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object>} 用户信息和权限数据，包含user_id、mobile、nickname、roles数组、highest_role_level等字段
   */
  static async getUserWithRoles(user_id) {
    const user = await User.findByPk(user_id, {
      include: [
        {
          model: Role,
          as: 'roles',
          where: { is_active: true },
          through: { where: { is_active: true } },
          required: false
        }
      ]
    })

    if (!user) {
      throw new Error('用户不存在')
    }

    // 整合用户信息和权限
    return {
      // 用户基本信息
      user_id: user.user_id,
      mobile: user.mobile,
      nickname: user.nickname,
      status: user.status,
      consecutive_fail_count: user.consecutive_fail_count,
      history_total_points: user.history_total_points,

      // 角色权限信息
      roles:
        user.roles?.map(role => ({
          role_uuid: role.role_uuid,
          role_name: role.role_name,
          role_level: role.role_level,
          permissions: role.permissions
        })) || [],

      // 便捷权限检查：管理员判断使用 highest_role_level >= 100
      highest_role_level: Math.max(...(user.roles?.map(r => r.role_level) || [0]))
    }
  }

  /**
   * 🔍 检查用户权限
   * @param {number} user_id - 用户ID
   * @param {string} resource - 资源名称
   * @param {string} action - 操作类型
   * @returns {Promise<boolean>} 是否拥有指定资源的操作权限
   */
  static async checkUserPermission(user_id, resource, action = 'read') {
    const user = await User.findByPk(user_id)
    if (!user) {
      return false
    }

    return await user.hasPermission(resource, action)
  }

  /**
   * 👥 批量获取用户角色信息
   * @param {Array} userIds - 用户ID数组
   * @returns {Promise<Array>} 用户角色信息数组，每项包含user_id、mobile、nickname、roles、highest_role_level字段
   */
  static async getBatchUsersWithRoles(userIds) {
    const users = await User.findAll({
      where: { user_id: userIds },
      include: [
        {
          model: Role,
          as: 'roles',
          where: { is_active: true },
          through: { where: { is_active: true } },
          required: false
        }
      ]
    })

    return users.map(user => ({
      user_id: user.user_id,
      mobile: user.mobile,
      nickname: user.nickname,
      roles: user.roles?.map(role => role.role_name) || [],
      highest_role_level: Math.max(...(user.roles?.map(r => r.role_level) || [0]))
    }))
  }

  /**
   * 📊 获取角色统计信息
   * @returns {Promise<Array>} 角色统计信息数组，每项包含role_name、role_level、user_count、description字段
   */
  static async getRoleStatistics() {
    const roles = await Role.findAll({
      where: { is_active: true },
      include: [
        {
          model: User,
          as: 'users',
          through: { where: { is_active: true } },
          required: false
        }
      ]
    })

    return roles.map(role => ({
      role_name: role.role_name,
      role_level: role.role_level,
      user_count: role.users?.length || 0,
      description: role.description
    }))
  }

  /**
   * 🔄 更新用户角色（管理后台专用）
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   * - 缓存失效、WebSocket断开等副作用应在事务提交后由调用方处理
   *
   * 审计统一入口整合（2026-01-08 决策5/6/9/10）：
   * - 【决策9】创建 UserRoleChangeRecord 记录，主键作为审计日志 target_id
   * - 【决策6】idempotency_key 从 UserRoleChangeRecord.record_id 派生
   * - 【决策5】审计日志失败时阻断业务流程（关键操作）
   * - 【决策10】target_id 指向 UserRoleChangeRecord.record_id
   *
   * @param {number} user_id - 用户ID
   * @param {string} role_name - 新角色名称
   * @param {number} operator_id - 操作者ID
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {string} options.reason - 操作原因（可选）
   * @param {string} options.ip_address - IP地址（可选）
   * @param {string} options.user_agent - 用户代理（可选）
   * @returns {Promise<Object>} 更新结果（包含 post_commit_actions 供调用方处理副作用）
   * @throws {Error} 业务操作或审计日志失败时抛出错误（关键操作）
   */
  static async updateUserRole(user_id, role_name, operator_id, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'UserRoleService.updateUserRole')
    const { reason, ip_address, user_agent } = options
    const { getUserRoles } = require('../middleware/auth')

    // 验证目标用户
    const targetUser = await User.findByPk(user_id, { transaction })
    if (!targetUser) {
      throw new Error('用户不存在')
    }

    // 验证操作者权限级别（防止低级别管理员修改高级别管理员）
    const operatorRoles = await getUserRoles(operator_id)
    const operatorMaxLevel =
      operatorRoles.roles.length > 0 ? Math.max(...operatorRoles.roles.map(r => r.role_level)) : 0

    const targetUserRoles = await getUserRoles(user_id)
    const targetMaxLevel =
      targetUserRoles.roles.length > 0
        ? Math.max(...targetUserRoles.roles.map(r => r.role_level))
        : 0

    // 操作者权限必须高于目标用户
    if (operatorMaxLevel <= targetMaxLevel) {
      throw new Error(
        `权限不足：无法修改同级或更高级别用户的角色（操作者级别: ${operatorMaxLevel}, 目标用户级别: ${targetMaxLevel}）`
      )
    }

    // 验证目标角色
    const targetRole = await Role.findOne({
      where: { role_name },
      transaction
    })
    if (!targetRole) {
      throw new Error('角色不存在')
    }

    // 保存旧角色信息
    const oldRoles = targetUserRoles.roles.map(r => r.role_name).join(', ') || '无角色'
    const oldRoleLevel = targetMaxLevel

    /*
     * 【决策9】创建业务记录（为审计日志提供业务主键）
     * 幂等键由业务主键派生（决策6），格式参考 UserRoleChangeRecord.generateIdempotencyKey
     */
    const idempotencyKey = UserRoleChangeRecord.generateIdempotencyKey(
      user_id,
      role_name,
      operator_id
    )

    const changeRecord = await UserRoleChangeRecord.create(
      {
        user_id,
        operator_id,
        old_role: oldRoles,
        new_role: role_name,
        reason: reason || `角色变更: ${oldRoles} → ${role_name}`,
        idempotency_key: idempotencyKey,
        metadata: { ip_address, user_agent }
      },
      { transaction }
    )

    // 移除用户现有角色
    await UserRole.destroy({ where: { user_id }, transaction })

    // 分配新角色
    await UserRole.create(
      {
        user_id,
        role_id: targetRole.role_id,
        assigned_at: BeijingTimeHelper.createBeijingTime(),
        assigned_by: operator_id,
        is_active: true
      },
      { transaction }
    )

    /*
     * 【决策5/10】记录审计日志（关键操作，失败时阻断业务流程）
     * target_id 指向 UserRoleChangeRecord.record_id（决策10）
     */
    await AuditLogService.logOperation({
      operator_id,
      operation_type: 'role_change',
      target_type: 'UserRoleChangeRecord',
      target_id: changeRecord.record_id, // 决策10：指向业务记录主键
      action: 'update',
      before_data: {
        roles: oldRoles,
        role_level: oldRoleLevel
      },
      after_data: {
        roles: role_name,
        role_level: targetRole.role_level
      },
      reason: reason || `角色变更: ${oldRoles} → ${role_name}`,
      idempotency_key: `audit_${idempotencyKey}`, // 从业务记录派生（决策6）
      ip_address,
      user_agent,
      transaction,
      is_critical_operation: true // 决策5：关键操作
    })

    logger.info('用户角色更新成功', {
      user_id,
      new_role: role_name,
      operator_id,
      record_id: changeRecord.record_id
    })

    // 返回结果（包含 post_commit_actions 供调用方在事务提交后处理副作用）
    return {
      user_id,
      new_role: role_name,
      new_role_level: targetRole.role_level,
      old_roles: oldRoles,
      old_role_level: oldRoleLevel,
      operator_id,
      reason,
      record_id: changeRecord.record_id, // 业务记录ID
      // 事务提交后由调用方处理的副作用
      post_commit_actions: {
        invalidate_cache: true,
        disconnect_ws: targetRole.role_level < 100 // 权限降级需断开WebSocket
      }
    }
  }

  /**
   * 📝 更新用户状态（管理后台专用）
   *
   * 事务边界治理（2026-01-08 审计统一入口整合）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   * - 缓存失效、WebSocket断开等副作用应在事务提交后由调用方处理
   *
   * 审计统一入口整合（2026-01-08 决策5/6/9/10）：
   * - 【决策9】创建 UserStatusChangeRecord 记录，主键作为审计日志 target_id
   * - 【决策6】idempotency_key 从 UserStatusChangeRecord.record_id 派生
   * - 【决策5】审计日志失败时阻断业务流程（关键操作）
   * - 【决策10】target_id 指向 UserStatusChangeRecord.record_id
   *
   * @param {number} user_id - 用户ID
   * @param {string} status - 状态（active/inactive/banned/pending）
   * @param {number} operator_id - 操作者ID
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {string} options.reason - 操作原因（可选）
   * @param {string} options.ip_address - IP地址（可选）
   * @param {string} options.user_agent - 用户代理（可选）
   * @returns {Promise<Object>} 更新结果（包含 post_commit_actions 供调用方处理副作用）
   * @throws {Error} 业务操作或审计日志失败时抛出错误（关键操作）
   */
  static async updateUserStatus(user_id, status, operator_id, options = {}) {
    // 强制要求事务边界 - 2026-01-08 审计统一入口整合
    const transaction = assertAndGetTransaction(options, 'UserRoleService.updateUserStatus')
    const { reason = '', ip_address, user_agent } = options

    // 验证状态值
    if (!['active', 'inactive', 'banned', 'pending'].includes(status)) {
      throw new Error('无效的用户状态')
    }

    // 禁止管理员修改自己的账号状态
    if (parseInt(user_id) === operator_id) {
      throw new Error(`禁止修改自己的账号状态（用户ID: ${user_id}, 操作者ID: ${operator_id}）`)
    }

    // 查找用户
    const user = await User.findByPk(user_id, { transaction })
    if (!user) {
      throw new Error('用户不存在')
    }

    const oldStatus = user.status

    /*
     * 【决策9】创建业务记录（为审计日志提供业务主键）
     * 幂等键由业务主键派生（决策6），格式参考 UserStatusChangeRecord.generateIdempotencyKey
     */
    const idempotencyKey = UserStatusChangeRecord.generateIdempotencyKey(
      user_id,
      status,
      operator_id
    )

    const changeRecord = await UserStatusChangeRecord.create(
      {
        user_id,
        operator_id,
        old_status: oldStatus,
        new_status: status,
        reason: reason || `状态变更: ${oldStatus} → ${status}`,
        idempotency_key: idempotencyKey,
        metadata: { ip_address, user_agent }
      },
      { transaction }
    )

    // 更新用户状态
    await user.update({ status }, { transaction })

    /*
     * 【决策5/10】记录审计日志（关键操作，失败时阻断业务流程）
     * target_id 指向 UserStatusChangeRecord.record_id（决策10）
     */
    await AuditLogService.logOperation({
      operator_id,
      operation_type: 'user_status_change',
      target_type: 'UserStatusChangeRecord',
      target_id: changeRecord.record_id, // 决策10：指向业务记录主键
      action: 'update',
      before_data: { status: oldStatus },
      after_data: { status },
      reason: reason || `状态变更: ${oldStatus} → ${status}`,
      idempotency_key: `audit_${idempotencyKey}`, // 从业务记录派生（决策6）
      ip_address,
      user_agent,
      transaction,
      is_critical_operation: true // 决策5：关键操作
    })

    logger.info('用户状态更新成功', {
      user_id,
      old_status: oldStatus,
      new_status: status,
      operator_id,
      record_id: changeRecord.record_id
    })

    // 返回结果（包含 post_commit_actions 供调用方在事务提交后处理副作用）
    return {
      user_id,
      old_status: oldStatus,
      new_status: status,
      operator_id,
      reason,
      record_id: changeRecord.record_id, // 业务记录ID
      // 事务提交后由调用方处理的副作用
      post_commit_actions: {
        invalidate_cache: true,
        disconnect_ws: status === 'inactive' || status === 'banned' // 禁用/封禁需断开WebSocket
      }
    }
  }

  /**
   * 📋 获取用户列表（管理后台）
   *
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Object>} 用户列表和分页信息
   */
  static async getUserList(filters = {}) {
    const { Op } = require('sequelize')
    const { page = 1, limit = 20, search, role_filter } = filters

    // 分页安全保护
    const finalLimit = Math.min(parseInt(limit), 100)

    // 构建查询条件
    const whereClause = {}
    if (search) {
      whereClause[Op.or] = [
        { mobile: { [Op.like]: `%${search}%` } },
        { nickname: { [Op.like]: `%${search}%` } }
      ]
    }

    // 基础查询
    const userQuery = {
      where: whereClause,
      attributes: [
        'user_id',
        'mobile',
        'nickname',
        'history_total_points',
        'status',
        'last_login',
        'created_at'
      ],
      limit: finalLimit,
      offset: (parseInt(page) - 1) * finalLimit,
      order: [['created_at', 'DESC']],
      include: [
        {
          model: Role,
          as: 'roles',
          through: { where: { is_active: true } },
          attributes: ['role_name', 'role_level'],
          required: false
        }
      ]
    }

    // 角色过滤
    if (role_filter) {
      userQuery.include[0].where = { role_name: role_filter }
      userQuery.include[0].required = true
    }

    // 查询用户数据
    const { count, rows: users } = await User.findAndCountAll(userQuery)

    // 处理用户数据
    const processedUsers = users.map(user => {
      const max_role_level =
        user.roles.length > 0 ? Math.max(...user.roles.map(role => role.role_level)) : 0
      return {
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        history_total_points: user.history_total_points,
        status: user.status,
        role_level: max_role_level,
        roles: user.roles.map(role => role.role_name),
        last_login: user.last_login,
        created_at: user.created_at
      }
    })

    logger.info('获取用户列表成功', { count })

    return {
      users: processedUsers,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total: count,
        total_pages: Math.ceil(count / parseInt(limit))
      }
    }
  }

  /**
   * 📄 获取单个用户详情（管理后台）
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object>} 用户详情
   */
  static async getUserDetail(user_id) {
    // 查询用户信息（包含角色信息）
    const user = await User.findOne({
      where: { user_id },
      include: [
        {
          model: Role,
          as: 'roles',
          through: {
            where: { is_active: true },
            attributes: ['assigned_at', 'assigned_by']
          },
          attributes: ['role_uuid', 'role_name', 'role_level', 'description']
        }
      ]
    })

    if (!user) {
      throw new Error('用户不存在')
    }

    // 计算用户权限级别
    const max_role_level =
      user.roles.length > 0 ? Math.max(...user.roles.map(role => role.role_level)) : 0

    logger.info('获取用户详情成功', { user_id })

    return {
      user: {
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        status: user.status,
        history_total_points: user.history_total_points,
        consecutive_fail_count: user.consecutive_fail_count,
        role_level: max_role_level,
        roles: user.roles.map(role => ({
          role_uuid: role.role_uuid,
          role_name: role.role_name,
          role_level: role.role_level,
          description: role.description,
          assigned_at: role.UserRole?.assigned_at
        })),
        last_login: user.last_login,
        login_count: user.login_count,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    }
  }

  /**
   * 📃 获取所有可用角色列表（管理后台）
   *
   * @returns {Promise<Object>} 角色列表
   */
  static async getRoleList() {
    // 查询所有激活的角色
    const roles = await Role.findAll({
      where: { is_active: true },
      attributes: ['role_id', 'role_uuid', 'role_name', 'role_level', 'description'],
      order: [['role_level', 'DESC']]
    })

    logger.info('获取角色列表成功', { count: roles.length })

    return {
      roles: roles.map(role => ({
        id: role.role_id,
        role_uuid: role.role_uuid,
        role_name: role.role_name,
        role_level: role.role_level,
        description: role.description
      }))
    }
  }

  // ==================== 从 UserPermissionModule 迁移的方法 ====================

  /**
   * 🛡️ 获取用户权限信息（基于UUID角色系统）
   *
   * 从 UserPermissionModule 迁移（2026-01-19）
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object>} 用户权限信息
   */
  static async getUserPermissions(user_id) {
    try {
      const user = await User.findOne({
        where: { user_id, status: 'active' },
        include: [
          {
            model: Role,
            as: 'roles',
            through: {
              where: { is_active: true }
            },
            attributes: ['role_id', 'role_uuid', 'role_name', 'role_level', 'permissions']
          }
        ]
      })

      if (!user) {
        return {
          exists: false,
          role_level: 0,
          permissions: [],
          roles: []
        }
      }

      // 计算用户最高权限级别
      const maxRoleLevel =
        user.roles.length > 0 ? Math.max(...user.roles.map(role => role.role_level)) : 0

      // 合并所有角色权限
      const allPermissions = new Set()
      user.roles.forEach(role => {
        if (role.permissions) {
          Object.entries(role.permissions).forEach(([resource, actions]) => {
            if (Array.isArray(actions)) {
              actions.forEach(action => {
                allPermissions.add(`${resource}:${action}`)
              })
            }
          })
        }
      })

      return {
        exists: true,
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        status: user.status,
        role_level: maxRoleLevel, // 🛡️ 管理员判断：role_level >= 100
        permissions: Array.from(allPermissions),
        roles: user.roles.map(role => ({
          role_uuid: role.role_uuid,
          role_name: role.role_name,
          role_level: role.role_level
        }))
      }
    } catch (error) {
      logger.error('获取用户权限失败', { user_id, error: error.message })
      return {
        exists: false,
        role_level: 0,
        permissions: [],
        roles: []
      }
    }
  }

  /**
   * 🛡️ 获取所有管理员用户
   *
   * 从 UserPermissionModule 迁移（2026-01-19）
   *
   * 安全优化：
   * - ✅ 手机号脱敏处理（格式：138****8000）
   * - ✅ role_level从数据库动态读取
   * - ✅ 按创建时间降序排序
   *
   * @returns {Promise<Array>} 管理员用户列表
   */
  static async getAllAdmins() {
    try {
      const adminUsers = await User.findAll({
        where: { status: 'active' },
        include: [
          {
            model: Role,
            as: 'roles',
            where: { role_name: 'admin', is_active: true },
            through: { where: { is_active: true } },
            attributes: ['role_name', 'role_level', 'role_uuid']
          }
        ],
        attributes: ['user_id', 'mobile', 'nickname', 'status', 'created_at', 'last_login'],
        order: [
          ['created_at', 'DESC'],
          ['user_id', 'ASC']
        ]
      })

      return adminUsers.map(user => ({
        user_id: user.user_id,
        mobile: UserRoleService._maskMobile(user.mobile), // 手机号脱敏
        nickname: user.nickname,
        status: user.status,
        role_level: user.roles[0]?.role_level || 100, // 管理员 role_level >= 100
        roles: user.roles.map(r => ({
          role_name: r.role_name,
          role_level: r.role_level,
          role_uuid: r.role_uuid
        })),
        created_at: user.created_at,
        last_login: user.last_login
      }))
    } catch (error) {
      logger.error('获取管理员列表失败', { error: error.message })
      throw error
    }
  }

  /**
   * 🔄 批量检查用户权限
   *
   * 从 UserPermissionModule 迁移（2026-01-19）
   *
   * @param {number} user_id - 用户ID
   * @param {Array} permissions - 权限数组 [{ resource, action }]
   * @returns {Promise<Object>} 权限检查结果
   */
  static async batchCheckUserPermissions(user_id, permissions) {
    try {
      if (!Array.isArray(permissions) || permissions.length === 0) {
        throw new Error('permissions必须为非空数组')
      }

      // 获取用户权限信息（只查询一次）
      const userPermissions = await UserRoleService.getUserPermissions(user_id)

      // 批量检查所有权限
      const results = await Promise.all(
        permissions.map(async ({ resource, action = 'read' }) => {
          const has_permission = await UserRoleService.checkUserPermission(
            user_id,
            resource,
            action
          )
          return {
            resource,
            action,
            has_permission
          }
        })
      )

      return {
        user_id,
        role_level: userPermissions.role_level, // 管理员判断：role_level >= 100
        permissions: results,
        checked_at: BeijingTimeHelper.now()
      }
    } catch (error) {
      logger.error('批量检查用户权限失败', { user_id, error: error.message })
      throw error
    }
  }

  /**
   * 🛡️ 验证操作权限（统一权限验证入口）
   *
   * 从 UserPermissionModule 迁移（2026-01-19）
   *
   * @param {number} operator_id - 操作者ID
   * @param {string} required_level - 必需权限级别 (user|admin)
   * @param {string} resource - 资源名称
   * @param {string} action - 操作类型
   * @returns {Promise<Object>} 验证结果
   */
  static async validateOperation(
    operator_id,
    required_level = 'user',
    resource = null,
    action = 'read'
  ) {
    try {
      const operatorPermissions = await UserRoleService.getUserPermissions(operator_id)

      if (!operatorPermissions.exists) {
        return { valid: false, reason: 'USER_NOT_FOUND' }
      }

      // 检查管理员权限要求（role_level >= 100）
      if (required_level === 'admin' && operatorPermissions.role_level < 100) {
        return { valid: false, reason: 'ADMIN_REQUIRED' }
      }

      // 如果指定了具体资源权限，进行检查
      if (resource) {
        const hasPermission = await UserRoleService.checkUserPermission(
          operator_id,
          resource,
          action
        )
        if (!hasPermission) {
          return { valid: false, reason: 'PERMISSION_DENIED' }
        }
      }

      return {
        valid: true,
        role_level: operatorPermissions.role_level, // 管理员判断：role_level >= 100
        permissions: operatorPermissions.permissions
      }
    } catch (error) {
      logger.error('验证操作权限失败', { operator_id, error: error.message })
      return { valid: false, reason: 'VALIDATION_ERROR' }
    }
  }

  /**
   * 🛡️ 获取管理员信息（基于角色系统）
   *
   * 从 UserPermissionModule 迁移（2026-01-19）
   *
   * @param {number} admin_id - 管理员ID
   * @returns {Promise<Object>} 管理员信息
   */
  static async getAdminInfo(admin_id) {
    try {
      const userPermissions = await UserRoleService.getUserPermissions(admin_id)

      if (!userPermissions.exists) {
        return { valid: false, reason: 'ADMIN_NOT_FOUND' }
      }

      if (userPermissions.role_level < 100) {
        return { valid: false, reason: 'NOT_ADMIN' }
      }

      return {
        valid: true,
        admin_id: userPermissions.user_id,
        mobile: userPermissions.mobile,
        nickname: userPermissions.nickname,
        role_level: userPermissions.role_level, // 管理员 role_level >= 100
        roles: userPermissions.roles
      }
    } catch (error) {
      logger.error('获取管理员信息失败', { admin_id, error: error.message })
      return { valid: false, reason: 'SYSTEM_ERROR' }
    }
  }

  /**
   * 🛡️ 获取权限统计信息
   *
   * 从 UserPermissionModule 迁移（2026-01-19）
   *
   * 功能说明：
   * - 统计系统总用户数、管理员数量、普通用户数量
   * - 统计各角色的用户分布
   * - 记录查询耗时，便于性能监控
   *
   * @returns {Promise<Object>} 权限统计
   */
  static async getPermissionStatistics() {
    const startTime = Date.now()

    try {
      logger.info('开始查询权限统计')

      // 第1步：统计各角色用户数量
      const userStats = await User.count({
        where: { status: 'active' },
        include: [
          {
            model: Role,
            as: 'roles',
            through: { where: { is_active: true } },
            attributes: []
          }
        ],
        group: ['roles.role_name'],
        raw: true
      })

      // 第2步：获取总用户数
      const totalUsers = await User.count({ where: { status: 'active' } })

      // 第3步：获取管理员数量
      const adminCount = await User.count({
        where: { status: 'active' },
        include: [
          {
            model: Role,
            as: 'roles',
            where: { role_name: 'admin', is_active: true },
            through: { where: { is_active: true } }
          }
        ]
      })

      // 转换GROUP BY结果为对象格式
      const roleDistribution = {}
      if (Array.isArray(userStats)) {
        userStats.forEach(stat => {
          const roleName = stat.role_name
          if (roleName) {
            roleDistribution[roleName] = parseInt(stat.count) || 0
          }
        })
      }

      const queryTime = Date.now() - startTime
      logger.info('权限统计查询完成', { queryTime, totalUsers, adminCount })

      // 性能告警
      if (queryTime > 500) {
        logger.warn('权限统计查询耗时较长', { queryTime, totalUsers })
      }

      const roleSum = Object.values(roleDistribution).reduce((sum, count) => sum + count, 0)

      return {
        total_users: totalUsers,
        admin_count: adminCount,
        user_count: totalUsers - adminCount,
        role_distribution: roleDistribution,
        query_time_ms: queryTime,
        timestamp: BeijingTimeHelper.now(),
        meta: {
          has_admins: adminCount > 0,
          role_count: Object.keys(roleDistribution).length,
          data_consistent: roleSum === totalUsers,
          query_time_warning: queryTime > 500
        }
      }
    } catch (error) {
      logger.error('获取权限统计失败', { error: error.message })
      throw error
    }
  }

  /**
   * 🔒 手机号脱敏处理（私有静态方法）
   *
   * 从 UserPermissionModule 迁移（2026-01-19）
   *
   * @param {string} mobile - 原始11位手机号
   * @returns {string} 脱敏后的手机号（格式：138****8000）
   */
  static _maskMobile(mobile) {
    if (!mobile || mobile.length !== 11) {
      return mobile
    }
    return mobile.slice(0, 3) + '****' + mobile.slice(-4)
  }
}

module.exports = UserRoleService
