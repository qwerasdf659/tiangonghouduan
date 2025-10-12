/**
 * 抽奖用户服务 - V4.0 UUID角色系统版本
 * 🛡️ 权限管理：移除is_admin依赖，使用UUID角色系统
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 */

const { User } = require('../../models')
const { getUserRoles } = require('../../middleware/auth')

class LotteryUserService {
  /**
   * 🛡️ 获取用户信息 - 使用UUID角色系统
   */
  async getUserInfo (user_id) {
    try {
      const user = await User.findByPk(user_id)
      if (!user) {
        throw new Error('用户不存在')
      }

      // 🛡️ 获取用户角色信息
      const userRoles = await getUserRoles(user_id)

      return {
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        status: user.status,
        role_based_admin: userRoles.isAdmin, // 🛡️ 基于角色计算
        roles: userRoles.roles,
        consecutive_fail_count: user.consecutive_fail_count,
        history_total_points: user.history_total_points,
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
  async isAdmin (user_id) {
    try {
      const userRoles = await getUserRoles(user_id)
      return userRoles.isAdmin
    } catch (error) {
      console.error('检查管理员权限失败:', error)
      return false
    }
  }

  /**
   * 🛡️ 检查用户权限 - 使用UUID角色系统
   */
  async hasPermission (user_id, resource, action = 'read') {
    try {
      const user = await User.findByPk(user_id)
      if (!user) return false

      return await user.hasPermission(resource, action)
    } catch (error) {
      console.error('检查用户权限失败:', error)
      return false
    }
  }

  /**
   * 🛡️ 获取用户统计信息
   */
  async getUserStats (user_id) {
    try {
      const user = await User.findByPk(user_id)
      if (!user) {
        throw new Error('用户不存在')
      }

      // 🛡️ 获取用户角色信息
      const userRoles = await getUserRoles(user_id)

      return {
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        role_based_admin: userRoles.isAdmin, // 🛡️ 基于角色计算
        consecutive_fail_count: user.consecutive_fail_count || 0,
        history_total_points: user.history_total_points || 0,
        login_count: user.login_count || 0,
        last_login: user.last_login,
        created_at: user.created_at,
        // 统计数据
        stats: {
          total_lottery_participations: 0, // 需要从抽奖记录中统计
          total_wins: 0, // 需要从中奖记录中统计
          win_rate: 0 // 计算中奖率
        }
      }
    } catch (error) {
      console.error('获取用户统计失败:', error)
      throw error
    }
  }

  /**
   * 🛡️ 验证用户抽奖权限
   */
  async validateLotteryPermission (user_id) {
    try {
      const user = await User.findByPk(user_id)
      if (!user) {
        return { valid: false, reason: 'USER_NOT_FOUND' }
      }

      if (user.status !== 'active') {
        return { valid: false, reason: 'USER_INACTIVE' }
      }

      // 获取用户角色信息
      const userRoles = await getUserRoles(user_id)

      return {
        valid: true,
        user_id,
        role_based_admin: userRoles.isAdmin,
        can_participate: true
      }
    } catch (error) {
      console.error('验证抽奖权限失败:', error)
      return { valid: false, reason: 'VALIDATION_ERROR' }
    }
  }

  /**
   * 🛡️ 更新用户连续失败次数
   */
  async updateConsecutiveFailCount (user_id, increment = true) {
    try {
      const user = await User.findByPk(user_id)
      if (!user) {
        throw new Error('用户不存在')
      }

      const newCount = increment
        ? (user.consecutive_fail_count || 0) + 1
        : 0

      await user.update({
        consecutive_fail_count: newCount
      })

      return newCount
    } catch (error) {
      console.error('更新连续失败次数失败:', error)
      throw error
    }
  }

  /**
   * 🛡️ 更新用户历史总积分
   */
  async updateHistoryTotalPoints (user_id, points) {
    try {
      const user = await User.findByPk(user_id)
      if (!user) {
        throw new Error('用户不存在')
      }

      const newTotal = (user.history_total_points || 0) + points

      await user.update({
        history_total_points: newTotal
      })

      return newTotal
    } catch (error) {
      console.error('更新历史总积分失败:', error)
      throw error
    }
  }
}

// 导出类本身，而不是实例，保持与LotteryHistoryService一致
module.exports = LotteryUserService
