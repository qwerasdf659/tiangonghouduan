/**
 * 抽奖用户服务 - 处理用户积分和资料相关业务逻辑
 * 从 routes/v4/unified-engine/lottery.js 中提取的用户相关业务逻辑
 *
 * @description 基于snake_case命名格式的用户服务
 * @version 4.0.0
 * @date 2025-09-24
 */

const models = require('../../models')
const Logger = require('../UnifiedLotteryEngine/utils/Logger')

class LotteryUserService {
  constructor () {
    this.logger = Logger.create('LotteryUserService')
  }

  /**
   * 获取用户积分账户信息
   * @param {number} user_id - 用户ID
   * @returns {Object} 积分账户信息
   */
  async get_user_points (user_id) {
    try {
      const points_account = await models.UserPointsAccount.findOne({
        where: { user_id, is_active: 1 }
      })

      if (!points_account) {
        // 如果没有积分账户，创建一个默认的
        const _new_account = await models.UserPointsAccount.create({
          user_id,
          available_points: 0,
          total_earned: 0,
          total_consumed: 0
        })
        return {
          available_points: 0,
          total_earned: 0,
          total_consumed: 0
        }
      }

      return {
        available_points: parseFloat(points_account.available_points) || 0,
        total_earned: parseFloat(points_account.total_earned) || 0,
        total_consumed: parseFloat(points_account.total_consumed) || 0
      }
    } catch (error) {
      this.logger.error('获取用户积分失败', { user_id, error: error.message })
      return {
        available_points: 0,
        total_earned: 0,
        total_consumed: 0
      }
    }
  }

  /**
   * 扣除用户积分
   * @param {number} user_id - 用户ID
   * @param {number} amount - 扣除金额
   * @returns {Object} 更新后的积分账户
   */
  async deduct_user_points (user_id, amount) {
    const points_account = await models.UserPointsAccount.findOne({
      where: { user_id, is_active: 1 }
    })

    if (!points_account) {
      throw new Error('用户积分账户不存在')
    }

    if (points_account.available_points < amount) {
      throw new Error('积分不足')
    }

    await points_account.update({
      available_points: points_account.available_points - amount,
      total_consumed: points_account.total_consumed + amount
    })

    return points_account
  }

  /**
   * 获取用户基本信息
   * @param {number} user_id - 用户ID
   * @returns {Object} 用户信息
   */
  async get_user_profile (user_id) {
    try {
      const user = await models.User.findOne({
        where: { id: user_id },
        attributes: ['id', 'phone', 'nickname', 'avatar', 'is_admin', 'created_at', 'updated_at']
      })

      if (!user) {
        throw new Error('用户不存在')
      }

      // 获取用户积分信息
      const points_info = await this.get_user_points(user_id)

      return {
        ...user.toJSON(),
        points_info
      }
    } catch (error) {
      this.logger.error('获取用户资料失败', { user_id, error: error.message })
      throw error
    }
  }

  /**
   * 验证用户是否存在且有效
   * @param {number} user_id - 用户ID
   * @returns {boolean} 是否有效
   */
  async validate_user (user_id) {
    try {
      const user = await models.User.findOne({
        where: { id: user_id }
      })
      return !!user
    } catch (error) {
      this.logger.error('验证用户失败', { user_id, error: error.message })
      return false
    }
  }

  /**
   * 检查用户是否有足够积分
   * @param {number} user_id - 用户ID
   * @param {number} required_points - 需要的积分
   * @returns {boolean} 是否有足够积分
   */
  async check_user_points (user_id, required_points) {
    try {
      const points_info = await this.get_user_points(user_id)
      return points_info.available_points >= required_points
    } catch (error) {
      this.logger.error('检查用户积分失败', { user_id, required_points, error: error.message })
      return false
    }
  }
}

module.exports = LotteryUserService
