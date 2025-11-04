/**
 * 用户角色服务 - 统一用户权限操作接口
 * 创建时间：2025年01月21日
 *
 * 🎯 目的：简化用户权限操作，而不合并User和Role模型
 * 🛡️ 优势：保持模型分离的同时提供便捷的业务接口
 */

const { User, Role, UserRole } = require('../models')

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
      include: [{
        model: Role,
        as: 'roles',
        where: { is_active: true },
        through: { where: { is_active: true } },
        required: false
      }]
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
      roles: user.roles?.map(role => ({
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
   * 🛡️ 分配用户角色
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
   * 🗑️ 移除用户角色
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
      include: [{
        model: Role,
        as: 'roles',
        where: { is_active: true },
        through: { where: { is_active: true } },
        required: false
      }]
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
      include: [{
        model: User,
        as: 'users',
        through: { where: { is_active: true } },
        required: false
      }]
    })

    return roles.map(role => ({
      role_name: role.role_name,
      role_level: role.role_level,
      user_count: role.users?.length || 0,
      description: role.description
    }))
  }
}

module.exports = UserRoleService
