/**
 * 抽奖用户服务 - V4.0 统一架构版本
 * 🛡️ 基于UUID角色系统的用户权限判断
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 */

const { User, Role } = require('../../models')
const { getUserRoles } = require('../../middleware/auth')

class LotteryUserService {
  /**
   * 🛡️ 获取用户详细信息 - 使用UUID角色系统
   */
  async getUserInfo (userId) {
    try {
      const user = await User.findByPk(userId, {
        attributes: ['id', 'phone', 'nickname', 'avatar', 'created_at', 'updated_at', 'status'],
        include: [{
          model: Role,
          as: 'roles',
          where: { is_active: true },
          through: { where: { is_active: true } },
          required: false,
          attributes: ['role_uuid', 'role_name', 'role_level', 'permissions']
        }]
      })

      if (!user) {
        return null
      }

      // 🛡️ 计算用户权限
      const userRoles = await getUserRoles(userId)

      return {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        avatar: user.avatar,
        status: user.status,
        is_admin: userRoles.isAdmin, // 🛡️ 基于角色计算
        roles: userRoles.roles,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
      throw error
    }
  }

  /**
   * 🛡️ 检查用户是否为管理员 - 使用UUID角色系统
   */
  async isAdmin (userId) {
    try {
      const userRoles = await getUserRoles(userId)
      return userRoles.isAdmin
    } catch (error) {
      console.error('检查管理员权限失败:', error)
      return false
    }
  }

  /**
   * 🛡️ 检查用户权限 - 使用UUID角色系统
   */
  async hasPermission (userId, resource, action = 'read') {
    try {
      const user = await User.findByPk(userId)
      if (!user) return false

      return await user.hasPermission(resource, action)
    } catch (error) {
      console.error('检查用户权限失败:', error)
      return false
    }
  }

  /**
   * 🛡️ 获取用户角色信息 - 使用UUID角色系统
   */
  async getUserRoles (userId) {
    try {
      return await getUserRoles(userId)
    } catch (error) {
      console.error('获取用户角色失败:', error)
      return { roles: [], isAdmin: false }
    }
  }

  /**
   * 批量获取用户信息
   */
  async getBatchUserInfo (userIds) {
    try {
      const users = await User.findAll({
        where: { id: userIds },
        attributes: ['id', 'phone', 'nickname', 'avatar', 'created_at', 'updated_at', 'status'],
        include: [{
          model: Role,
          as: 'roles',
          where: { is_active: true },
          through: { where: { is_active: true } },
          required: false,
          attributes: ['role_uuid', 'role_name', 'role_level']
        }]
      })

      // 🛡️ 为每个用户计算权限
      const result = []
      for (const user of users) {
        const userRoles = await getUserRoles(user.id)
        result.push({
          id: user.id,
          phone: user.phone,
          nickname: user.nickname,
          avatar: user.avatar,
          status: user.status,
          is_admin: userRoles.isAdmin, // 🛡️ 基于角色计算
          roles: userRoles.roles,
          created_at: user.created_at,
          updated_at: user.updated_at
        })
      }

      return result
    } catch (error) {
      console.error('批量获取用户信息失败:', error)
      throw error
    }
  }

  /**
   * 🛡️ 验证用户状态和权限
   */
  async validateUserAccess (userId, requiredPermission = null) {
    try {
      const user = await User.findByPk(userId)

      if (!user) {
        return { valid: false, reason: 'USER_NOT_FOUND' }
      }

      if (user.status !== 'active') {
        return { valid: false, reason: 'USER_INACTIVE' }
      }

      if (requiredPermission) {
        const hasPermission = await this.hasPermission(userId, requiredPermission.resource, requiredPermission.action)
        if (!hasPermission) {
          return { valid: false, reason: 'PERMISSION_DENIED' }
        }
      }

      return { valid: true, user }
    } catch (error) {
      console.error('验证用户访问权限失败:', error)
      return { valid: false, reason: 'VALIDATION_ERROR' }
    }
  }
}

module.exports = LotteryUserService
