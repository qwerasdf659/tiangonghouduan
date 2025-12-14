/**
 * 用户角色服务 - 统一用户权限操作接口
 * 创建时间：2025年01月21日
 *
 * 🎯 目的：简化用户权限操作，而不合并User和Role模型
 * 🛡️ 优势：保持模型分离的同时提供便捷的业务接口
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

const { User, Role, UserRole } = require('../models')
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
   * @returns {Promise<Object>} 用户信息和权限数据，包含user_id、mobile、nickname、roles数组、is_admin、highest_role_level等字段
   */
  static async getUserWithRoles (user_id) {
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

      // 便捷权限检查
      is_admin: await user.isAdmin(),
      highest_role_level: Math.max(...(user.roles?.map(r => r.role_level) || [0]))
    }
  }

  /**
   * 🛡️ 分配用户角色（内部工具方法）
   *
   * ⚠️ 【重要安全警告】
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * ❌ 禁止在路由层直接调用此方法
   * ❌ 禁止在对外暴露的API接口中使用此方法
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   *
   * 【此方法缺少的安全机制】
   * - ❌ 无事务保护（数据不一致风险）
   * - ❌ 无审计日志记录（操作无法追溯）
   * - ❌ 无权限缓存失效（权限变更不生效）
   * - ❌ 无权限等级校验（可能越级修改）
   *
   * 【生产环境推荐】
   * ✅ 请使用 updateUserRole() 方法，该方法包含完整的安全保护机制
   *
   * 【适用场景】
   * - ✅ 内部工具脚本（如初始化脚本、数据迁移）
   * - ✅ 自动化测试代码
   * - ✅ 需要在其他服务方法内部编排使用的场景
   *
   * @deprecated 生产环境不推荐直接使用，请改用 updateUserRole()
   * @param {number} user_id - 用户ID
   * @param {string} roleName - 角色名称
   * @returns {Promise<Object>} 分配结果，包含message和role字段
   */
  static async assignUserRole (user_id, roleName) {
    const user = await User.findByPk(user_id)
    if (!user) {
      throw new Error('用户不存在')
    }

    const role = await Role.findOne({
      where: { role_name: roleName, is_active: true }
    })
    if (!role) {
      throw new Error('角色不存在')
    }

    // 检查是否已存在该角色
    const existingUserRole = await UserRole.findOne({
      where: { user_id, role_id: role.id }
    })

    if (existingUserRole) {
      // 如果存在但未激活，则激活
      if (!existingUserRole.is_active) {
        await existingUserRole.update({ is_active: true })
        return { message: '角色已重新激活', role: role.role_name }
      }
      return { message: '用户已拥有该角色', role: role.role_name }
    }

    // 创建新的用户角色关联
    await UserRole.create({
      user_id,
      role_id: role.id,
      is_active: true
    })

    return { message: '角色分配成功', role: role.role_name }
  }

  /**
   * 🗑️ 移除用户角色（内部工具方法）
   *
   * ⚠️ 【重要安全警告】
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * ❌ 禁止在路由层直接调用此方法
   * ❌ 禁止在对外暴露的API接口中使用此方法
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   *
   * 【此方法缺少的安全机制】
   * - ❌ 无事务保护（数据不一致风险）
   * - ❌ 无审计日志记录（操作无法追溯）
   * - ❌ 无权限缓存失效（权限变更不生效）
   * - ❌ 无权限等级校验（可能越级修改）
   *
   * 【生产环境推荐】
   * ✅ 请使用 updateUserRole() 方法，该方法包含完整的安全保护机制
   *
   * 【适用场景】
   * - ✅ 内部工具脚本（如初始化脚本、数据迁移）
   * - ✅ 自动化测试代码
   * - ✅ 需要在其他服务方法内部编排使用的场景
   *
   * @deprecated 生产环境不推荐直接使用，请改用 updateUserRole()
   * @param {number} user_id - 用户ID
   * @param {string} roleName - 角色名称
   * @returns {Promise<Object>} 移除结果，包含message和role字段
   */
  static async removeUserRole (user_id, roleName) {
    const role = await Role.findOne({
      where: { role_name: roleName }
    })
    if (!role) {
      throw new Error('角色不存在')
    }

    const userRole = await UserRole.findOne({
      where: { user_id, role_id: role.id }
    })

    if (!userRole) {
      throw new Error('用户未拥有该角色')
    }

    // 软删除：设置为非激活状态
    await userRole.update({ is_active: false })

    return { message: '角色移除成功', role: role.role_name }
  }

  /**
   * 🔍 检查用户权限
   * @param {number} user_id - 用户ID
   * @param {string} resource - 资源名称
   * @param {string} action - 操作类型
   * @returns {Promise<boolean>} 是否拥有指定资源的操作权限
   */
  static async checkUserPermission (user_id, resource, action = 'read') {
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
  static async getBatchUsersWithRoles (userIds) {
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
  static async getRoleStatistics () {
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
   * @param {number} user_id - 用户ID
   * @param {string} role_name - 新角色名称
   * @param {number} operator_id - 操作者ID
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @param {string} options.reason - 操作原因（可选）
   * @param {string} options.ip_address - IP地址（可选）
   * @param {string} options.user_agent - 用户代理（可选）
   * @returns {Promise<Object>} 更新结果
   */
  static async updateUserRole (user_id, role_name, operator_id, options = {}) {
    const { transaction, reason, ip_address, user_agent } = options
    const { getUserRoles, invalidateUserPermissions } = require('../middleware/auth')
    const { sequelize } = require('../models')

    // 创建内部事务（如果外部没有传入）
    const internalTransaction = transaction || (await sequelize.transaction())

    try {
      // 验证目标用户
      const targetUser = await User.findByPk(user_id, { transaction: internalTransaction })
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
        transaction: internalTransaction
      })
      if (!targetRole) {
        throw new Error('角色不存在')
      }

      // 保存旧角色信息（用于审计日志）
      const oldRoles = targetUserRoles.roles.map(r => r.role_name).join(', ') || '无角色'
      const oldRoleLevel = targetMaxLevel

      // 移除用户现有角色
      await UserRole.destroy({ where: { user_id }, transaction: internalTransaction })

      // 分配新角色
      await UserRole.create(
        {
          user_id,
          role_id: targetRole.role_id,
          assigned_at: BeijingTimeHelper.createBeijingTime(),
          assigned_by: operator_id,
          is_active: true
        },
        { transaction: internalTransaction }
      )

      // 记录审计日志（权限变更属于高敏感操作）
      await AuditLogService.logOperation({
        operator_id,
        operation_type: 'role_change',
        target_type: 'User',
        target_id: user_id,
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
        business_id: `role_change_${user_id}_${Date.now()}`,
        ip_address,
        user_agent,
        transaction: internalTransaction
      })

      // 如果没有外部事务，提交内部事务
      if (!transaction) {
        await internalTransaction.commit()
      }

      // 自动清除用户权限缓存
      await invalidateUserPermissions(user_id, `role_change_${role_name}`)
      logger.info('权限缓存已清除', { user_id, reason: `角色变更 ${role_name}` })

      // 获取更新后的用户角色信息
      const updatedUserRoles = await getUserRoles(user_id)

      logger.info('用户角色更新成功', { user_id, new_role: role_name, operator_id })

      return {
        user_id,
        new_role: role_name,
        new_role_level: targetRole.role_level,
        roles: updatedUserRoles.roles,
        operator_id,
        reason
      }
    } catch (error) {
      // 如果没有外部事务，回滚内部事务
      if (!transaction && internalTransaction && !internalTransaction.finished) {
        await internalTransaction.rollback()
      }
      logger.error('更新用户角色失败', { user_id, role_name, error: error.message })
      throw error
    }
  }

  /**
   * 📝 更新用户状态（管理后台专用）
   *
   * @param {number} user_id - 用户ID
   * @param {string} status - 状态（active/inactive/banned）
   * @param {number} operator_id - 操作者ID
   * @param {Object} options - 选项参数
   * @returns {Promise<Object>} 更新结果
   */
  static async updateUserStatus (user_id, status, operator_id, options = {}) {
    const { reason = '' } = options
    const { invalidateUserPermissions } = require('../middleware/auth')

    // 验证状态值
    if (!['active', 'inactive', 'banned'].includes(status)) {
      throw new Error('无效的用户状态')
    }

    // 禁止管理员修改自己的账号状态
    if (parseInt(user_id) === operator_id) {
      throw new Error(`禁止修改自己的账号状态（用户ID: ${user_id}, 操作者ID: ${operator_id}）`)
    }

    // 查找用户
    const user = await User.findByPk(user_id)
    if (!user) {
      throw new Error('用户不存在')
    }

    const oldStatus = user.status

    // 更新用户状态
    await user.update({ status })

    // 自动清除用户权限缓存
    await invalidateUserPermissions(user_id, `status_change_${oldStatus}_to_${status}`)
    logger.info('权限缓存已清除', { user_id, reason: `状态变更 ${oldStatus} → ${status}` })

    logger.info('用户状态更新成功', {
      user_id,
      old_status: oldStatus,
      new_status: status,
      operator_id
    })

    return {
      user_id,
      old_status: oldStatus,
      new_status: status,
      operator_id,
      reason
    }
  }

  /**
   * 📋 获取用户列表（管理后台）
   *
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Object>} 用户列表和分页信息
   */
  static async getUserList (filters = {}) {
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
  static async getUserDetail (user_id) {
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
  static async getRoleList () {
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
}

module.exports = UserRoleService
