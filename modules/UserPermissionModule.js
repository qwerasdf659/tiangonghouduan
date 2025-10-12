/**
 * 用户权限管理模块 - V4.0 统一架构版本
 * 🛡️ 基于UUID角色系统的权限管理
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const { User, Role, UserRole } = require('../models')

class UserPermissionModule {
  constructor () {
    this.name = 'UserPermissionModule'
    this.version = '4.0.0'

    // 🛡️ 简化的角色系统配置 - 只区分普通用户和管理员
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
          attributes: ['role_id', 'role_uuid', 'role_name', 'role_level', 'permissions']
        }]
      })

      if (!user) {
        return {
          exists: false,
          role_based_admin: false,
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
        role_based_admin: maxRoleLevel >= 100, // 🛡️ 基于角色级别计算管理员权限
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
        role_based_admin: false,
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
  async checkUserPermission (userId, resource, action = 'read') {
    try {
      const userPermissions = await this.getUserPermissions(userId)

      if (!userPermissions.exists) {
        return false
      }

      // 管理员拥有所有权限
      if (userPermissions.role_based_admin) {
        return true
      }

      // 检查具体权限
      const permissionKey = `${resource}:${action}`
      return userPermissions.permissions.includes(permissionKey) ||
             userPermissions.permissions.includes(`${resource}:*`) ||
             userPermissions.permissions.includes('*:*')
    } catch (error) {
      console.error('❌ 检查用户权限失败:', error.message)
      return false
    }
  }

  /**
   * 🛡️ 验证操作权限（统一权限验证入口）
   * @param {number} operatorId - 操作者ID
   * @param {string} requiredLevel - 必需权限级别 (user|admin)
   * @param {string} resource - 资源名称
   * @param {string} action - 操作类型
   * @returns {Promise<Object>} 验证结果
   */
  async validateOperation (operatorId, requiredLevel = 'user', resource = null, action = 'read') {
    try {
      const operatorPermissions = await this.getUserPermissions(operatorId)

      if (!operatorPermissions.exists) {
        return { valid: false, reason: 'USER_NOT_FOUND' }
      }

      // 检查管理员权限要求
      if (requiredLevel === 'admin' && !operatorPermissions.role_based_admin) {
        return { valid: false, reason: 'ADMIN_REQUIRED' }
      }

      // 如果指定了具体资源权限，进行检查
      if (resource) {
        const hasPermission = await this.checkUserPermission(operatorId, resource, action)
        if (!hasPermission) {
          return { valid: false, reason: 'PERMISSION_DENIED' }
        }
      }

      return {
        valid: true,
        role_based_admin: operatorPermissions.role_based_admin,
        role_level: operatorPermissions.role_level,
        permissions: operatorPermissions.permissions
      }
    } catch (error) {
      console.error('❌ 验证操作权限失败:', error.message)
      return { valid: false, reason: 'VALIDATION_ERROR' }
    }
  }

  /**
   * 🛡️ 快速管理员权限检查
   * @param {number} userId - 用户ID
   * @returns {Promise<boolean>} 是否为管理员
   */
  async isAdmin (userId) {
    try {
      const permissions = await this.getUserPermissions(userId)
      return permissions.role_based_admin
    } catch (error) {
      console.error('❌ 管理员权限检查失败:', error.message)
      return false
    }
  }

  /**
   * 🛡️ 批量权限检查
   * @param {Array} userPermissionChecks - 权限检查列表
   * @returns {Promise<Object>} 批量检查结果
   */
  async batchPermissionCheck (userPermissionChecks) {
    try {
      const results = {}

      for (const check of userPermissionChecks) {
        const { userId, resource, action } = check
        results[userId] = await this.checkUserPermission(userId, resource, action)
      }

      return { success: true, results }
    } catch (error) {
      console.error('❌ 批量权限检查失败:', error.message)
      return { success: false, error: error.message }
    }
  }

  /**
   * 🛡️ 获取管理员信息（基于角色系统）
   * @param {number} adminId - 管理员ID
   * @returns {Promise<Object>} 管理员信息
   */
  async getAdminInfo (adminId) {
    try {
      const userPermissions = await this.getUserPermissions(adminId)

      if (!userPermissions.exists) {
        return { valid: false, reason: 'ADMIN_NOT_FOUND' }
      }

      if (!userPermissions.role_based_admin) {
        return { valid: false, reason: 'NOT_ADMIN' }
      }

      return {
        valid: true,
        admin_id: userPermissions.user_id,
        mobile: userPermissions.mobile,
        nickname: userPermissions.nickname,
        role_based_admin: true,
        role_level: userPermissions.role_level,
        roles: userPermissions.roles
      }
    } catch (error) {
      console.error('❌ 获取管理员信息失败:', error.message)
      return { valid: false, reason: 'SYSTEM_ERROR' }
    }
  }

  /**
   * 🛡️ 设置用户角色（只支持user/admin两种角色）
   * @param {number} userId - 用户ID
   * @param {boolean} isAdmin - 是否为管理员
   * @param {number} operatorId - 操作者ID
   * @returns {Promise<Object>} 操作结果
   */
  async setUserRole (userId, isAdmin, operatorId) {
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
        role_based_admin: isAdmin,
        role_level: targetRole.role_level,
        assigned_by: operatorId,
        timestamp: BeijingTimeHelper.now()
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
        role_based_admin: true,
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
          where: { role_name: 'admin', is_active: true },
          through: { where: { is_active: true } }
        }]
      })

      return {
        total_users: totalUsers,
        admin_count: adminCount,
        user_count: totalUsers - adminCount,
        role_distribution: userStats,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      console.error('❌ 获取权限统计失败:', error.message)
      throw error
    }
  }
}

// 导出类而不是实例，支持单例模式
module.exports = new UserPermissionModule()
