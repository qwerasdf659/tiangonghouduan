/**
 * 用户权限管理模块 - V4.0 统一架构版本
 * 🛡️ 基于UUID角色系统的权限管理
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 */

const { User, Role, UserRole } = require('../models')

class UserPermissionModule {
  constructor () {
    this.name = 'UserPermissionModule'
    this.version = '4.0.0'

    // 🛡️ 简化的角色系统配置
    this.roleConfig = {
      user: { level: 0, permissions: ['lottery:read', 'lottery:participate', 'profile:read', 'profile:update'] },
      admin: { level: 100, permissions: ['*:*'] }
    }

    console.log('🛡️ 简化权限模块初始化完成')
  }

  /**
   * 🛡️ 获取用户权限信息（基于UUID角色系统）
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 用户权限信息
   */
  async getUserPermissions (userId) {
    try {
      const user = await User.findOne({
        where: { user_id: userId, status: 'active' },
        include: [{
          model: Role,
          as: 'roles',
          through: {
            where: { is_active: true }
          },
          attributes: ['id', 'role_uuid', 'role_name', 'role_level', 'permissions']
        }]
      })

      if (!user) {
        return {
          exists: false,
          is_admin: false,
          role_level: 0,
          permissions: [],
          roles: []
        }
      }

      // 计算用户最高权限级别
      const maxRoleLevel = user.roles.length > 0
        ? Math.max(...user.roles.map(role => role.role_level))
        : 0

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
        is_admin: maxRoleLevel >= 100, // 🛡️ 基于角色级别计算管理员权限
        role_level: maxRoleLevel,
        permissions: Array.from(allPermissions),
        roles: user.roles.map(role => ({
          role_uuid: role.role_uuid,
          role_name: role.role_name,
          role_level: role.role_level
        }))
      }
    } catch (error) {
      console.error('❌ 获取用户权限失败:', error.message)
      return {
        exists: false,
        is_admin: false,
        role_level: 0,
        permissions: [],
        roles: []
      }
    }
  }

  /**
   * 🛡️ 检查用户权限（基于UUID角色系统）
   * @param {number} userId - 用户ID
   * @param {string} resource - 资源名称
   * @param {string} action - 操作类型
   * @returns {Promise<boolean>} 是否有权限
   */
  async checkPermission (userId, resource, action = 'read') {
    try {
      const userPermissions = await this.getUserPermissions(userId)

      if (!userPermissions.exists) {
        return false
      }

      // 🛡️ 超级管理员拥有所有权限
      if (userPermissions.is_admin) {
        return true
      }

      // 检查具体权限
      const requiredPermission = `${resource}:${action}`
      const hasWildcard = userPermissions.permissions.includes('*:*')
      const hasResourceWildcard = userPermissions.permissions.includes(`${resource}:*`)
      const hasSpecificPermission = userPermissions.permissions.includes(requiredPermission)

      return hasWildcard || hasResourceWildcard || hasSpecificPermission
    } catch (error) {
      console.error('❌ 权限检查失败:', error.message)
      return false
    }
  }

  /**
   * 🛡️ 设置用户管理员角色
   * @param {number} userId - 用户ID
   * @param {boolean} isAdmin - 是否设为管理员
   * @param {number} operatorId - 操作者ID
   * @returns {Promise<Object>} 操作结果
   */
  async setUserAdminRole (userId, isAdmin, operatorId) {
    try {
      // 验证用户是否存在
      const user = await User.findByPk(userId)
      if (!user) {
        throw new Error('用户不存在')
      }

      // 获取角色
      const targetRoleName = isAdmin ? 'admin' : 'user'
      const targetRole = await Role.findOne({ where: { role_name: targetRoleName } })
      if (!targetRole) {
        throw new Error(`角色 ${targetRoleName} 不存在`)
      }

      // 删除用户现有的所有角色
      await UserRole.destroy({
        where: { user_id: userId }
      })

      // 分配新角色
      await UserRole.create({
        user_id: userId,
        role_id: targetRole.id,
        assigned_by: operatorId,
        is_active: true
      })

      console.log(`✅ 用户${userId}角色已更新为: ${targetRoleName}`)

      return {
        user_id: userId,
        role_name: targetRoleName,
        is_admin: isAdmin,
        role_level: targetRole.role_level,
        assigned_by: operatorId,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error('❌ 设置用户角色失败:', error.message)
      throw error
    }
  }

  /**
   * 🛡️ 获取所有管理员用户
   * @returns {Promise<Array>} 管理员用户列表
   */
  async getAllAdmins () {
    try {
      const adminUsers = await User.findAll({
        where: { status: 'active' },
        include: [{
          model: Role,
          as: 'roles',
          where: { role_name: 'admin', is_active: true },
          through: { where: { is_active: true } },
          attributes: ['role_name', 'role_level', 'role_uuid']
        }],
        attributes: ['user_id', 'mobile', 'nickname', 'status', 'created_at', 'last_login']
      })

      return adminUsers.map(user => ({
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        status: user.status,
        is_admin: true,
        role_level: 100,
        created_at: user.created_at,
        last_login: user.last_login
      }))
    } catch (error) {
      console.error('❌ 获取管理员列表失败:', error.message)
      throw error
    }
  }

  /**
   * 🛡️ 验证操作者权限
   * @param {number} operatorId - 操作者ID
   * @param {string} requiredLevel - 需要的权限级别
   * @returns {Promise<Object>} 验证结果
   */
  async validateOperatorPermission (operatorId, requiredLevel = 'admin') {
    try {
      const operatorPermissions = await this.getUserPermissions(operatorId)

      if (!operatorPermissions.exists) {
        return {
          valid: false,
          reason: '操作者不存在或已停用'
        }
      }

      if (requiredLevel === 'admin' && !operatorPermissions.is_admin) {
        return {
          valid: false,
          reason: '需要超级管理员权限'
        }
      }

      return {
        valid: true,
        operator: operatorPermissions
      }
    } catch (error) {
      console.error('❌ 验证操作者权限失败:', error.message)
      return {
        valid: false,
        reason: '权限验证失败'
      }
    }
  }

  /**
   * 🛡️ 批量权限检查
   * @param {Array} userIds - 用户ID列表
   * @param {string} resource - 资源名称
   * @param {string} action - 操作类型
   * @returns {Promise<Object>} 批量检查结果
   */
  async batchCheckPermissions (userIds, resource, action = 'read') {
    try {
      const results = {}

      for (const userId of userIds) {
        try {
          const hasPermission = await this.checkPermission(userId, resource, action)
          results[userId] = {
            user_id: userId,
            has_permission: hasPermission,
            resource,
            action
          }
        } catch (error) {
          results[userId] = {
            user_id: userId,
            has_permission: false,
            error: error.message
          }
        }
      }

      return {
        total: userIds.length,
        results,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error('❌ 批量权限检查失败:', error.message)
      throw error
    }
  }

  /**
   * 🛡️ 获取权限统计信息
   * @returns {Promise<Object>} 权限统计
   */
  async getPermissionStatistics () {
    try {
      // 统计各角色用户数量
      const userStats = await User.count({
        where: { status: 'active' },
        include: [{
          model: Role,
          as: 'roles',
          through: { where: { is_active: true } },
          attributes: []
        }],
        group: ['roles.role_name'],
        raw: true
      })

      // 获取总用户数
      const totalUsers = await User.count({ where: { status: 'active' } })

      // 获取管理员数量
      const adminCount = await User.count({
        where: { status: 'active' },
        include: [{
          model: Role,
          as: 'roles',
          where: { role_name: 'admin' },
          through: { where: { is_active: true } }
        }]
      })

      return {
        total_users: totalUsers,
        admin_users: adminCount,
        regular_users: totalUsers - adminCount,
        role_distribution: userStats,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error('❌ 获取权限统计失败:', error.message)
      throw error
    }
  }
}

module.exports = new UserPermissionModule()
