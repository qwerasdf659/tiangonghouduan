const logger = require('../../utils/logger').logger

/**
 * 抽奖用户服务 - V4.0 UUID角色系统版本
 * 提供用户信息查询、权限验证、统计信息、抽奖权限验证等功能
 *
 * 业务场景：
 * - 抽奖前验证用户基本信息和权限，确保用户有资格参与抽奖
 * - 提供用户统计信息，辅助抽奖策略决策（如保底机制、连续失败次数等）
 * - 管理员功能需要验证用户是否具有管理员权限
 * - 更新用户连续失败次数，用于触发保底机制
 * - 更新用户历史总积分，用于统计用户活跃度
 *
 * 核心功能：
 * 1. 用户信息查询：获取用户基本信息、角色信息、连续失败次数、历史总积分
 * 2. 权限验证：基于UUID角色系统验证用户是否为管理员、是否具有特定权限
 * 3. 抽奖权限验证：验证用户是否可以参与抽奖（用户状态、权限等）
 * 4. 用户统计：提供用户抽奖参与次数、中奖次数、中奖率等统计数据
 * 5. 连续失败次数管理：更新用户连续失败次数，用于保底机制触发判断
 * 6. 历史总积分管理：累加用户历史总积分，用于用户活跃度分析
 *
 * 🛡️ 权限管理：
 * - 基于UUID角色系统进行权限验证
 * - 使用`getUserRoles`中间件函数获取用户角色信息
 * - 支持灵活的角色和权限验证，适应不同业务场景
 * - 管理员判断：role_level >= 100
 *
 * 集成模型：
 * - User：用户模型，存储用户基本信息、状态、连续失败次数、历史总积分
 * - UserRole：用户角色关联模型，存储用户与角色的关联关系
 * - Role：角色模型，定义系统中的各种角色（如管理员、普通用户等）
 *
 * 集成技术：
 * - Sequelize ORM：数据库查询和更新操作
 * - UUID角色系统：统一的权限管理系统，基于角色和权限的细粒度控制
 * - middleware/auth：认证中间件，提供`getUserRoles`函数获取用户角色信息
 *
 * 使用方式：
 * ```javascript
 * const userService = new LotteryUserService()
 *
 * // 获取用户信息
 * const userInfo = await userService.getUserInfo(10001)
 * logger.info('用户昵称:', userInfo.nickname)
 * logger.info('用户角色级别:', userInfo.role_level)
 * logger.info('是否管理员:', userInfo.role_level >= 100)
 *
 * // 验证抽奖权限
 * const permission = await userService.validateLotteryPermission(10001)
 * if (permission.valid) {
 *   logger.info('用户可以参与抽奖')
 * } else {
 *   logger.info('用户无法参与抽奖，原因:', permission.reason)
 * }
 *
 * // 更新连续失败次数
 * const newCount = await userService.updateConsecutiveFailCount(10001, true)
 * logger.info('新的连续失败次数:', newCount)
 * ```
 *
 * 注意事项：
 * - 权限验证依赖UUID角色系统，确保`getUserRoles`函数正常工作
 * - 用户状态（`status`字段）为'inactive'时无法参与抽奖
 * - 连续失败次数用于保底机制，需要在抽奖成功后重置为0
 * - 历史总积分仅用于统计，不影响抽奖逻辑
 * - 统计数据中的抽奖参与次数和中奖次数需要从`LotteryDraw`模型中查询（当前未实现）
 *
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 * 最后更新：2025年10月30日
 * 作者：Claude Sonnet 4.5
 */

const { User } = require('../../models')
const { getUserRoles } = require('../../middleware/auth')

/**
 * 抽奖用户服务类
 *
 * 提供用户信息查询、权限验证、统计信息、抽奖权限验证等功能
 *
 * 业务场景：
 * - 抽奖前验证用户基本信息和权限
 * - 提供用户统计信息辅助抽奖策略决策
 * - 基于UUID角色系统进行权限验证
 * - 管理用户连续失败次数和历史总积分
 */
class LotteryUserService {
  /**
   * 🛡️ 获取用户信息 - 使用UUID角色系统
   *
   * 业务场景：获取用户基本信息、角色信息、连续失败次数、历史总积分
   *
   * @param {number} user_id - 用户ID（users表主键）
   * @returns {Promise<Object>} 用户信息对象
   * @returns {number} return.user_id - 用户ID
   * @returns {string} return.mobile - 手机号
   * @returns {string} return.nickname - 昵称
   * @returns {string} return.status - 用户状态（active/inactive）
   * @returns {number} return.role_level - 角色级别（>= 100 为管理员）
   * @returns {Array} return.roles - 用户角色列表
   * @returns {number} return.consecutive_fail_count - 连续失败次数
   * @returns {number} return.history_total_points - 历史总积分
   * @returns {Date} return.created_at - 创建时间
   * @returns {Date} return.updated_at - 更新时间
   *
   * @throws {Error} 当用户不存在时抛出错误
   *
   * @example
   * const userInfo = await userService.getUserInfo(10001)
   * logger.info('用户昵称:', userInfo.nickname)
   * logger.info('是否管理员:', userInfo.role_level >= 100)
   */
  async getUserInfo(user_id) {
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
        role_level: userRoles.role_level, // 🛡️ 基于角色级别判断权限（>= 100 为管理员）
        roles: userRoles.roles,
        consecutive_fail_count: user.consecutive_fail_count,
        history_total_points: user.history_total_points,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    } catch (error) {
      logger.error('获取用户信息失败:', error)
      throw error
    }
  }

  /**
   * 🛡️ 检查用户权限 - 使用UUID角色系统
   *
   * 业务场景：验证用户是否具有特定资源的特定操作权限
   *
   * @param {number} user_id - 用户ID（users表主键）
   * @param {string} resource - 资源名称（如：lottery、prize、user等）
   * @param {string} [action='read'] - 操作类型（read/create/update/delete）
   * @returns {Promise<boolean>} 是否具有权限
   *
   * @example
   * const canManage = await userService.hasPermission(10001, 'lottery', 'update')
   * if (canManage) {
   *   logger.info('用户可以管理抽奖活动')
   * }
   */
  async hasPermission(user_id, resource, action = 'read') {
    try {
      const user = await User.findByPk(user_id)
      if (!user) return false

      return await user.hasPermission(resource, action)
    } catch (error) {
      logger.error('检查用户权限失败:', error)
      return false
    }
  }

  /**
   * 🛡️ 获取用户统计信息
   *
   * 业务场景：获取用户的统计数据，包括抽奖参与次数、高档奖励次数、高档奖励率等
   *
   * @param {number} user_id - 用户ID（users表主键）
   * @returns {Promise<Object>} 用户统计信息对象
   * @returns {number} return.user_id - 用户ID
   * @returns {string} return.mobile - 手机号
   * @returns {string} return.nickname - 昵称
   * @returns {number} return.role_level - 角色级别（>= 100 为管理员）
   * @returns {number} return.consecutive_fail_count - 连续失败次数
   * @returns {number} return.history_total_points - 历史总积分
   * @returns {number} return.login_count - 登录次数
   * @returns {Date} return.last_login - 最后登录时间
   * @returns {Date} return.created_at - 创建时间
   * @returns {Object} return.stats - 统计数据对象
   * @returns {number} return.stats.total_lottery_participations - 总抽奖参与次数
   * @returns {number} return.stats.total_high_tier_wins - 总高档奖励次数（V4.0语义）
   * @returns {number} return.stats.high_tier_rate - 高档奖励率（V4.0语义）
   *
   * @throws {Error} 当用户不存在时抛出错误
   *
   * @example
   * const stats = await userService.getUserStats(10001)
   * logger.info('用户高档奖励率:', stats.stats.high_tier_rate)
   */
  async getUserStats(user_id) {
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
        role_level: userRoles.role_level, // 🛡️ 基于角色级别判断权限（>= 100 为管理员）
        consecutive_fail_count: user.consecutive_fail_count || 0,
        history_total_points: user.history_total_points || 0,
        login_count: user.login_count || 0,
        last_login: user.last_login,
        created_at: user.created_at,
        // 统计数据（V4.0语义更新：使用 high_tier_rate 替代 win_rate）
        stats: {
          total_lottery_participations: 0, // 需要从抽奖记录中统计
          total_high_tier_wins: 0, // V4.0：高档奖励次数
          high_tier_rate: 0 // V4.0：高档奖励率
        }
      }
    } catch (error) {
      logger.error('获取用户统计失败:', error)
      throw error
    }
  }

  /**
   * 🛡️ 验证用户抽奖权限
   *
   * 业务场景：抽奖前验证用户是否可以参与抽奖（用户状态、权限等）
   *
   * @param {number} user_id - 用户ID（users表主键）
   * @returns {Promise<Object>} 权限验证结果对象
   * @returns {boolean} return.valid - 是否有效
   * @returns {string} [return.reason] - 无效原因（USER_NOT_FOUND/USER_INACTIVE/VALIDATION_ERROR）
   * @returns {number} [return.user_id] - 用户ID
   * @returns {number} [return.role_level] - 角色级别（>= 100 为管理员）
   * @returns {boolean} [return.can_participate] - 是否可以参与抽奖
   *
   * @example
   * const permission = await userService.validateLotteryPermission(10001)
   * if (permission.valid) {
   *   logger.info('用户可以参与抽奖')
   * } else {
   *   logger.info('用户无法参与抽奖，原因:', permission.reason)
   * }
   */
  async validateLotteryPermission(user_id) {
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
        role_level: userRoles.role_level, // 角色级别（>= 100 为管理员）
        can_participate: true
      }
    } catch (error) {
      logger.error('验证抽奖权限失败:', error)
      return { valid: false, reason: 'VALIDATION_ERROR' }
    }
  }

  /**
   * 🛡️ 更新用户连续失败次数
   *
   * 业务场景：用于保底机制，记录用户连续未中奖次数，达到阈值时触发保底
   *
   * @param {number} user_id - 用户ID（users表主键）
   * @param {boolean} [increment=true] - 是否增加次数（true: +1，false: 重置为0）
   * @returns {Promise<number>} 更新后的连续失败次数
   *
   * @throws {Error} 当用户不存在时抛出错误
   *
   * @example
   * // 抽奖失败，增加失败次数
   * const newCount = await userService.updateConsecutiveFailCount(10001, true)
   * logger.info('新的连续失败次数:', newCount)
   *
   * // 抽奖成功，重置失败次数
   * await userService.updateConsecutiveFailCount(10001, false)
   */
  async updateConsecutiveFailCount(user_id, increment = true) {
    try {
      const user = await User.findByPk(user_id)
      if (!user) {
        throw new Error('用户不存在')
      }

      const newCount = increment ? (user.consecutive_fail_count || 0) + 1 : 0

      await user.update({
        consecutive_fail_count: newCount
      })

      return newCount
    } catch (error) {
      logger.error('更新连续失败次数失败:', error)
      throw error
    }
  }

  /**
   * 🛡️ 更新用户历史总积分
   *
   * 业务场景：累加用户历史总积分，用于用户活跃度分析和数据统计
   *
   * @param {number} user_id - 用户ID（users表主键）
   * @param {number} points - 要增加的积分数（可以是负数表示减少）
   * @returns {Promise<number>} 更新后的历史总积分
   *
   * @throws {Error} 当用户不存在时抛出错误
   *
   * @example
   * // 用户获得100积分
   * const newTotal = await userService.updateHistoryTotalPoints(10001, 100)
   * logger.info('新的历史总积分:', newTotal)
   */
  async updateHistoryTotalPoints(user_id, points) {
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
      logger.error('更新历史总积分失败:', error)
      throw error
    }
  }
}

// 导出类本身，而不是实例
module.exports = LotteryUserService
