/**
 * 用户管理服务 - 管理后台用户操作
 *
 * 从 UserRoleService 拆分而来（2026-04-24）
 * 职责：用户角色变更、状态管理、用户列表/详情查询、角色列表
 *
 * 事务边界治理：
 * - 所有写操作强制要求外部事务传入（options.transaction）
 * - 未提供事务时直接报错（使用 assertAndGetTransaction）
 * - 缓存失效、WebSocket 断开等副作用应在事务提交后由调用方处理
 */

const BusinessError = require('../utils/BusinessError')
const { User, Role, UserRole } = require('../models')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const BeijingTimeHelper = require('../utils/timeHelper')
const logger = require('../utils/logger')
const AuditLogService = require('./AuditLogService')
const displayNameHelper = require('../utils/displayNameHelper')
const { getUserRoles } = require('../middleware/auth')
const { Op } = require('sequelize')

/**
 * 用户管理服务
 * @description 提供管理后台的用户角色变更、状态管理及用户列表查询操作
 */
class UserManagementService {
  /**
   * 🔄 更新用户角色（管理后台专用）
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 缓存失效、WebSocket断开等副作用应在事务提交后由调用方处理
   *
   * @param {number} user_id - 用户ID
   * @param {string} role_name - 新角色名称
   * @param {number} operator_id - 操作者ID
   * @param {Object} options - 选项参数
   * @returns {Promise<Object>} 更新结果
   */
  static async updateUserRole(user_id, role_name, operator_id, options = {}) {
    const transaction = assertAndGetTransaction(options, 'UserManagementService.updateUserRole')
    const { reason, ip_address, user_agent } = options

    // 验证目标用户
    const targetUser = await User.findByPk(user_id, { transaction })
    if (!targetUser) {
      throw new BusinessError('用户不存在', 'SERVICE_NOT_FOUND', 404)
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

    if (operatorMaxLevel <= targetMaxLevel) {
      throw new BusinessError(
        `权限不足：无法修改同级或更高级别用户的角色（操作者级别: ${operatorMaxLevel}, 目标用户级别: ${targetMaxLevel}）`,
        'SERVICE_INSUFFICIENT',
        400
      )
    }

    // 验证目标角色
    const targetRole = await Role.findOne({ where: { role_name }, transaction })
    if (!targetRole) {
      throw new BusinessError('角色不存在', 'SERVICE_NOT_FOUND', 404)
    }

    const oldRoles = targetUserRoles.roles.map(r => r.role_name).join(', ') || '无角色'
    const oldRoleLevel = targetMaxLevel
    const idempotencyKey = `role_change_${user_id}_${role_name}_${operator_id}_${Math.floor(Date.now() / 1000)}`

    await UserRole.destroy({ where: { user_id }, transaction })

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

    await AuditLogService.logOperation({
      operator_id,
      operation_type: 'role_change',
      target_type: 'User',
      target_id: user_id,
      action: 'update',
      before_data: { roles: oldRoles, role_level: oldRoleLevel },
      after_data: { roles: role_name, role_level: targetRole.role_level },
      reason: reason || `角色变更: ${oldRoles} → ${role_name}`,
      idempotency_key: `audit_${idempotencyKey}`,
      ip_address,
      user_agent,
      transaction,
      is_critical_operation: true
    })

    logger.info('用户角色更新成功', { user_id, new_role: role_name, operator_id })

    return {
      user_id,
      new_role: role_name,
      new_role_level: targetRole.role_level,
      old_roles: oldRoles,
      old_role_level: oldRoleLevel,
      operator_id,
      reason,
      post_commit_actions: {
        invalidate_cache: true,
        disconnect_ws: targetRole.role_level < 100
      }
    }
  }

  /**
   * 📝 更新用户状态（管理后台专用）
   *
   * @param {number} user_id - 用户ID
   * @param {string} status - 状态（active/inactive/banned/pending）
   * @param {number} operator_id - 操作者ID
   * @param {Object} options - 选项参数
   * @returns {Promise<Object>} 更新结果
   */
  static async updateUserStatus(user_id, status, operator_id, options = {}) {
    const transaction = assertAndGetTransaction(options, 'UserManagementService.updateUserStatus')
    const { reason = '', ip_address, user_agent } = options

    if (!['active', 'inactive', 'banned', 'pending'].includes(status)) {
      throw new BusinessError('无效的用户状态', 'SERVICE_INVALID_STATUS', 400)
    }

    if (parseInt(user_id) === operator_id) {
      throw new BusinessError(`禁止修改自己的账号状态（用户ID: ${user_id}, 操作者ID: ${operator_id}）`, 'SERVICE_NOT_ALLOWED', 400)
    }

    const user = await User.findByPk(user_id, { transaction })
    if (!user) {
      throw new BusinessError('用户不存在', 'SERVICE_NOT_FOUND', 404)
    }

    const oldStatus = user.status
    const idempotencyKey = `status_change_${user_id}_${status}_${operator_id}_${Math.floor(Date.now() / 1000)}`

    await user.update({ status }, { transaction })

    await AuditLogService.logOperation({
      operator_id,
      operation_type: 'user_status_change',
      target_type: 'User',
      target_id: user_id,
      action: 'update',
      before_data: { status: oldStatus },
      after_data: { status },
      reason: reason || `状态变更: ${oldStatus} → ${status}`,
      idempotency_key: `audit_${idempotencyKey}`,
      ip_address,
      user_agent,
      transaction,
      is_critical_operation: true
    })

    logger.info('用户状态更新成功', {
      user_id, old_status: oldStatus, new_status: status, operator_id
    })

    return {
      user_id,
      old_status: oldStatus,
      new_status: status,
      operator_id,
      reason,
      post_commit_actions: {
        invalidate_cache: true,
        disconnect_ws: status === 'inactive' || status === 'banned'
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
    const { page = 1, page_size = 20, search, role_filter } = filters
    const finalLimit = Math.min(parseInt(page_size, 10) || 20, 100)

    const whereClause = {}
    if (search) {
      whereClause[Op.or] = [
        { mobile: { [Op.like]: `%${search}%` } },
        { nickname: { [Op.like]: `%${search}%` } }
      ]
    }

    const userQuery = {
      where: whereClause,
      attributes: [
        'user_id', 'mobile', 'nickname', 'history_total_points',
        'status', 'last_login', 'created_at'
      ],
      limit: finalLimit,
      offset: (parseInt(page) - 1) * finalLimit,
      order: [['created_at', 'DESC']],
      include: [{
        model: Role,
        as: 'roles',
        through: { where: { is_active: true } },
        attributes: ['role_name', 'role_level'],
        required: false
      }]
    }

    if (role_filter && role_filter !== 'all') {
      userQuery.include[0].where = { role_name: role_filter }
      userQuery.include[0].required = true
    }

    const { count, rows: users } = await User.findAndCountAll(userQuery)

    const ROLE_DISPLAY_MAP = {
      admin: '管理员',
      user: '普通用户',
      system_job: '系统任务',
      merchant: '商户',
      vip: 'VIP用户'
    }

    const processedUsers = users.map(user => {
      const max_role_level =
        user.roles.length > 0 ? Math.max(...user.roles.map(role => role.role_level)) : 0
      const primaryRole =
        user.roles.length > 0
          ? user.roles.reduce((best, r) => (r.role_level > (best?.role_level || 0) ? r : best), null)
          : null
      const roleName = primaryRole?.role_name || 'user'
      return {
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        history_total_points: user.history_total_points,
        status: user.status,
        role_name: roleName,
        role_display: ROLE_DISPLAY_MAP[roleName] || roleName,
        role_level: max_role_level,
        roles: user.roles.map(role => role.role_name),
        last_login: user.last_login,
        created_at: user.created_at
      }
    })

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [todayNewCount, activeCount, vipCount] = await Promise.all([
      User.count({ where: { created_at: { [Op.gte]: todayStart } } }),
      User.count({ where: { status: 'active' } }),
      User.count({
        include: [{
          model: Role,
as: 'roles',
          where: { role_level: { [Op.gt]: 100 } },
          through: { where: { is_active: true } },
          required: true
        }]
      })
    ])

    logger.info('获取用户列表成功', { count, todayNewCount, activeCount, vipCount })

    const usersWithDisplayNames = await displayNameHelper.attachDisplayNames(processedUsers, [
      { field: 'status', dictType: 'user_status' }
    ])

    return {
      users: usersWithDisplayNames,
      pagination: {
        page: parseInt(page),
        page_size: finalLimit,
        total: count,
        total_pages: Math.ceil(count / finalLimit)
      },
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
    const user = await User.findOne({
      where: { user_id },
      include: [{
        model: Role,
        as: 'roles',
        through: {
          where: { is_active: true },
          attributes: ['assigned_at', 'assigned_by']
        },
        attributes: ['role_uuid', 'role_name', 'role_level', 'description']
      }]
    })

    if (!user) {
      throw new BusinessError('用户不存在', 'SERVICE_NOT_FOUND', 404)
    }

    const max_role_level =
      user.roles.length > 0 ? Math.max(...user.roles.map(role => role.role_level)) : 0

    logger.info('获取用户详情成功', { user_id })

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

    const userWithDisplayNames = await displayNameHelper.attachDisplayNames(userDetail, [
      { field: 'status', dictType: 'user_status' }
    ])

    return { user: userWithDisplayNames }
  }

  /**
   * 📃 获取所有可用角色列表（管理后台）
   *
   * @returns {Promise<Object>} 角色列表
   */
  static async getRoleList() {
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
}

module.exports = UserManagementService
