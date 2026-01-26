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
 * 中文显示名称助手（2026-01-22 中文化显示名称系统）
 * @see docs/中文化显示名称实施文档.md
 */
const displayNameHelper = require('../utils/displayNameHelper')

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

    // 并行获取全局统计数据（不受分页影响）
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [todayNewCount, activeCount, vipCount] = await Promise.all([
      // 今日新增用户数
      User.count({
        where: {
          created_at: { [Op.gte]: todayStart }
        }
      }),
      // 活跃用户数（状态为active）
      User.count({
        where: { status: 'active' }
      }),
      // VIP/管理员用户数（role_level > 100）
      User.count({
        include: [
          {
            model: Role,
            as: 'roles',
            where: { role_level: { [Op.gt]: 100 } },
            through: { where: { is_active: true } },
            required: true
          }
        ]
      })
    ])

    logger.info('获取用户列表成功', { count, todayNewCount, activeCount, vipCount })

    // 附加中文显示名称（2026-01-22 中文化显示名称系统）
    const usersWithDisplayNames = await displayNameHelper.attachDisplayNames(processedUsers, [
      { field: 'status', dictType: 'user_status' }
    ])

    return {
      users: usersWithDisplayNames,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total: count,
        total_pages: Math.ceil(count / parseInt(limit))
      },
      // 全局统计数据（供前端统计卡片使用）
      statistics: {
        total_users: count,
        today_new: todayNewCount,
        active_users: activeCount,
        vip_users: vipCount
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

    // 构建用户详情对象
    const userDetail = {
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

    // 附加中文显示名称（2026-01-22 中文化显示名称系统）
    const userWithDisplayNames = await displayNameHelper.attachDisplayNames(userDetail, [
      { field: 'status', dictType: 'user_status' }
    ])

    return {
      user: userWithDisplayNames
    }
  }

  /**
   * 📃 获取所有可用角色列表（管理后台）
   *
   * @returns {Promise<Object>} 角色列表
   */
  static async getRoleList() {
    // 查询所有激活的角色（包含permissions字段用于前端权限展示）
    const roles = await Role.findAll({
      where: { is_active: true },
      attributes: ['role_id', 'role_uuid', 'role_name', 'role_level', 'description', 'permissions'],
      order: [['role_level', 'DESC']]
    })

    logger.info('获取角色列表成功', { count: roles.length })

    return {
      roles: roles.map(role => ({
        id: role.role_id,
        role_id: role.role_id,
        role_uuid: role.role_uuid,
        role_name: role.role_name,
        role_level: role.role_level,
        description: role.description,
        permissions: role.permissions || {}
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

  // ==================== 角色管理 CRUD 方法（2026-01-26 新增）====================

  /**
   * 🆕 创建角色
   *
   * 事务边界治理（2026-01-26 角色权限管理功能）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * 安全校验：
   * - 角色名称唯一性检查
   * - 角色等级不能高于操作者等级
   * - 权限格式验证
   *
   * @param {Object} roleData - 角色数据
   * @param {string} roleData.role_name - 角色名称（必填，唯一）
   * @param {string} roleData.description - 角色描述（可选）
   * @param {number} roleData.role_level - 角色等级（必填，0-100）
   * @param {Object} roleData.permissions - 权限配置（可选，JSON格式）
   * @param {number} operator_id - 操作者ID
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {string} options.ip_address - IP地址（可选）
   * @param {string} options.user_agent - 用户代理（可选）
   * @returns {Promise<Object>} 创建的角色信息
   * @throws {Error} 业务操作或审计日志失败时抛出错误
   */
  static async createRole(roleData, operator_id, options = {}) {
    // 强制要求事务边界
    const transaction = assertAndGetTransaction(options, 'UserRoleService.createRole')
    const { ip_address, user_agent } = options
    const { role_name, description, role_level, permissions = {} } = roleData

    // 参数校验
    if (!role_name || typeof role_name !== 'string' || role_name.trim() === '') {
      throw new Error('角色名称不能为空')
    }

    if (typeof role_level !== 'number' || role_level < 0) {
      throw new Error('角色等级必须是非负数字')
    }

    // 引入权限资源常量
    const { isSystemRole, validatePermissions } = require('../constants/PermissionResources')

    // 检查是否尝试创建系统内置角色名称
    if (isSystemRole(role_name.trim())) {
      throw new Error(`不能创建与系统内置角色同名的角色: ${role_name}`)
    }

    // 验证权限格式
    if (permissions && Object.keys(permissions).length > 0) {
      const permissionValidation = validatePermissions(permissions)
      if (!permissionValidation.valid) {
        throw new Error(`权限配置格式错误: ${permissionValidation.errors.join(', ')}`)
      }
    }

    // 获取操作者权限级别
    const { getUserRoles } = require('../middleware/auth')
    const operatorRoles = await getUserRoles(operator_id)
    const operatorMaxLevel =
      operatorRoles.roles.length > 0 ? Math.max(...operatorRoles.roles.map(r => r.role_level)) : 0

    // 权限等级校验：不能创建比自己权限更高的角色
    if (role_level > operatorMaxLevel) {
      throw new Error(
        `权限不足：不能创建权限等级高于自己的角色（操作者级别: ${operatorMaxLevel}, 目标角色级别: ${role_level}）`
      )
    }

    // 检查角色名称唯一性
    const existingRole = await Role.findOne({
      where: { role_name: role_name.trim() },
      transaction
    })

    if (existingRole) {
      throw new Error(`角色名称已存在: ${role_name}`)
    }

    // 创建角色
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

    // 记录审计日志
    const { OPERATION_TYPES } = require('../constants/AuditOperationTypes')
    const idempotencyKey = `role_create_${newRole.role_id}_${Date.now()}`

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
   * 事务边界治理（2026-01-26 角色权限管理功能）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * 安全校验：
   * - 系统内置角色不可编辑
   * - 角色等级不能修改为高于操作者等级
   * - 权限格式验证
   *
   * @param {number} role_id - 角色ID
   * @param {Object} updateData - 更新数据（部分更新）
   * @param {string} updateData.description - 角色描述（可选）
   * @param {number} updateData.role_level - 角色等级（可选）
   * @param {Object} updateData.permissions - 权限配置（可选）
   * @param {number} operator_id - 操作者ID
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {string} options.ip_address - IP地址（可选）
   * @param {string} options.user_agent - 用户代理（可选）
   * @returns {Promise<Object>} 更新结果（包含 affected_user_ids 供调用方批量失效缓存）
   * @throws {Error} 业务操作或审计日志失败时抛出错误
   */
  static async updateRole(role_id, updateData, operator_id, options = {}) {
    // 强制要求事务边界
    const transaction = assertAndGetTransaction(options, 'UserRoleService.updateRole')
    const { ip_address, user_agent } = options
    const { description, role_level, permissions } = updateData

    // 查找角色
    const role = await Role.findByPk(role_id, { transaction })
    if (!role) {
      throw new Error('角色不存在')
    }

    // 引入权限资源常量
    const { isSystemRole, validatePermissions } = require('../constants/PermissionResources')

    // 系统内置角色保护
    if (isSystemRole(role.role_name)) {
      throw new Error(`系统内置角色不可修改: ${role.role_name}`)
    }

    // 获取操作者权限级别
    const { getUserRoles } = require('../middleware/auth')
    const operatorRoles = await getUserRoles(operator_id)
    const operatorMaxLevel =
      operatorRoles.roles.length > 0 ? Math.max(...operatorRoles.roles.map(r => r.role_level)) : 0

    // 权限等级校验：不能修改为比自己权限更高的等级
    if (role_level !== undefined && role_level > operatorMaxLevel) {
      throw new Error(
        `权限不足：不能将角色等级设置为高于自己的级别（操作者级别: ${operatorMaxLevel}, 目标角色级别: ${role_level}）`
      )
    }

    // 验证权限格式
    if (permissions !== undefined && Object.keys(permissions).length > 0) {
      const permissionValidation = validatePermissions(permissions)
      if (!permissionValidation.valid) {
        throw new Error(`权限配置格式错误: ${permissionValidation.errors.join(', ')}`)
      }
    }

    // 保存旧数据（用于审计日志）
    const beforeData = {
      role_id: role.role_id,
      role_name: role.role_name,
      role_level: role.role_level,
      description: role.description,
      permissions: role.permissions
    }

    // 构建更新字段
    const updateFields = {}
    if (description !== undefined) updateFields.description = description
    if (role_level !== undefined) updateFields.role_level = role_level
    if (permissions !== undefined) updateFields.permissions = permissions

    // 检查是否有更新
    if (Object.keys(updateFields).length === 0) {
      throw new Error('没有可更新的字段')
    }

    // 更新角色
    await role.update(updateFields, { transaction })

    // 查询受影响的用户（用于批量失效缓存）
    const affectedUserRoles = await UserRole.findAll({
      where: { role_id, is_active: true },
      attributes: ['user_id'],
      transaction
    })
    const affectedUserIds = affectedUserRoles.map(ur => ur.user_id)

    // 记录审计日志
    const { OPERATION_TYPES } = require('../constants/AuditOperationTypes')
    const idempotencyKey = `role_update_${role_id}_${Date.now()}`

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
      // 事务提交后由调用方处理的副作用
      post_commit_actions: {
        invalidate_cache_for_users: affectedUserIds,
        disconnect_ws_for_admin_users: affectedUserIds.length > 0
      }
    }
  }

  /**
   * 🗑️ 删除角色（软删除）
   *
   * 事务边界治理（2026-01-26 角色权限管理功能）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * 软删除策略：
   * - 设置 is_active=false
   * - 角色数据保留，现有用户保持原权限
   * - 角色从"可分配列表"中消失
   * - 数据可追溯，符合审计要求
   *
   * 安全校验：
   * - 系统内置角色不可删除
   *
   * @param {number} role_id - 角色ID
   * @param {number} operator_id - 操作者ID
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {string} options.ip_address - IP地址（可选）
   * @param {string} options.user_agent - 用户代理（可选）
   * @returns {Promise<Object>} 删除结果（包含 affected_user_ids 供调用方批量失效缓存）
   * @throws {Error} 业务操作或审计日志失败时抛出错误
   */
  static async deleteRole(role_id, operator_id, options = {}) {
    // 强制要求事务边界
    const transaction = assertAndGetTransaction(options, 'UserRoleService.deleteRole')
    const { ip_address, user_agent } = options

    // 查找角色
    const role = await Role.findByPk(role_id, { transaction })
    if (!role) {
      throw new Error('角色不存在')
    }

    // 引入权限资源常量
    const { isSystemRole } = require('../constants/PermissionResources')

    // 系统内置角色保护
    if (isSystemRole(role.role_name)) {
      throw new Error(`系统内置角色不可删除: ${role.role_name}`)
    }

    // 检查角色是否已经被软删除
    if (!role.is_active) {
      throw new Error(`角色已经被删除: ${role.role_name}`)
    }

    // 查询受影响的用户
    const affectedUserRoles = await UserRole.findAll({
      where: { role_id, is_active: true },
      attributes: ['user_id'],
      transaction
    })
    const affectedUserIds = affectedUserRoles.map(ur => ur.user_id)

    // 保存旧数据（用于审计日志）
    const beforeData = {
      role_id: role.role_id,
      role_uuid: role.role_uuid,
      role_name: role.role_name,
      role_level: role.role_level,
      description: role.description,
      permissions: role.permissions,
      is_active: role.is_active
    }

    // 执行软删除
    await role.update({ is_active: false }, { transaction })

    // 记录审计日志
    const { OPERATION_TYPES } = require('../constants/AuditOperationTypes')
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
      // 事务提交后由调用方处理的副作用
      post_commit_actions: {
        invalidate_cache_for_users: affectedUserIds,
        disconnect_ws_for_admin_users: affectedUserIds.length > 0
      }
    }
  }

  /**
   * 📋 获取权限资源列表
   *
   * 返回系统定义的所有权限资源和可用操作，用于角色权限配置界面。
   *
   * @returns {Object} 权限资源列表
   */
  static getPermissionResources() {
    const { getPermissionResources, SYSTEM_ROLES } = require('../constants/PermissionResources')

    return {
      resources: getPermissionResources(),
      system_roles: SYSTEM_ROLES
    }
  }
}

module.exports = UserRoleService
