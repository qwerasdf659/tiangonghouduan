/**
 * 餐厅积分抽奖系统 v3.0 - 权限管理服务
 * 处理用户权限管理，主要是臻选空间权限
 * 创建时间：2025年01月28日
 */

const { Op } = require('sequelize')
const { PremiumSpaceAccess, User, PointsRecord, sequelize } = require('../models')
const moment = require('moment')

class PermissionService {
  constructor () {
    console.log('🔐 权限管理服务初始化完成')

    // 臻选空间配置
    this.premiumSpaceConfig = {
      requiredCumulativePoints: 500000, // 需要的累计积分
      unlockCostPoints: 100, // 单次解锁消费积分
      unlockDurationHours: 24, // 解锁有效时长（小时）
      renewCostPoints: 100, // 续费消费积分
      maxUnlockPerDay: 5 // 每天最大解锁次数
    }
  }

  /**
   * 检查臻选空间权限状态
   */
  async checkPremiumSpaceStatus (userId) {
    try {
      // 获取用户信息
      const user = await User.findByPk(userId)
      if (!user) {
        throw new Error('用户不存在')
      }

      // 获取权限记录
      let accessRecord = await PremiumSpaceAccess.findOne({
        where: { user_id: userId }
      })

      // 如果没有权限记录，创建一个
      if (!accessRecord) {
        accessRecord = await PremiumSpaceAccess.create({
          user_id: userId,
          is_unlocked: false,
          required_cumulative_points: this.premiumSpaceConfig.requiredCumulativePoints,
          unlock_cost_points: this.premiumSpaceConfig.unlockCostPoints,
          unlock_duration_hours: this.premiumSpaceConfig.unlockDurationHours
        })
      }

      // 检查是否过期
      const now = new Date()
      const isExpired = accessRecord.expiry_time && now > accessRecord.expiry_time

      // 如果过期，更新状态
      if (isExpired && accessRecord.is_unlocked) {
        await accessRecord.update({
          is_unlocked: false,
          expiry_time: null
        })
      }

      // 计算剩余时间
      let remainingTime = null
      if (accessRecord.is_unlocked && !isExpired && accessRecord.expiry_time) {
        const remaining = accessRecord.expiry_time - now
        remainingTime = this.formatTimeRemaining(remaining)
      }

      // 检查是否满足解锁条件
      const canUnlock =
        user.total_points >= this.premiumSpaceConfig.requiredCumulativePoints &&
        user.available_points >= this.premiumSpaceConfig.unlockCostPoints

      return {
        hasPermission: accessRecord.is_unlocked && !isExpired,
        isExpired: isExpired || false,
        expiresAt: accessRecord.expiry_time
          ? moment(accessRecord.expiry_time).format('YYYY-MM-DD HH:mm:ss')
          : null,
        remainingTime,
        unlockCount: accessRecord.unlock_count,
        totalSpentOnUnlock: accessRecord.total_cost_points,
        canUnlock,
        historicalPoints: user.total_points,
        currentPoints: user.available_points,
        requiredPoints: this.premiumSpaceConfig.requiredCumulativePoints,
        unlockCost: this.premiumSpaceConfig.unlockCostPoints
      }
    } catch (error) {
      console.error('❌ 检查臻选空间权限状态失败:', error.message)
      throw error
    }
  }

  /**
   * 解锁臻选空间
   */
  async unlockPremiumSpace (userId, unlockType = '24hours', confirmSpend) {
    const transaction = await sequelize.transaction()

    try {
      // 检查用户
      const user = await User.findByPk(userId, { transaction })
      if (!user) {
        throw new Error('用户不存在')
      }

      // 验证解锁类型和费用
      const unlockConfig = this.getUnlockConfig(unlockType)
      if (confirmSpend !== unlockConfig.cost) {
        throw new Error('确认消费积分与实际费用不符')
      }

      // 检查积分是否足够
      if (user.available_points < unlockConfig.cost) {
        throw new Error('积分不足')
      }

      // 检查累计积分是否满足条件
      if (user.total_points < this.premiumSpaceConfig.requiredCumulativePoints) {
        throw new Error(`累计积分不足，需要${this.premiumSpaceConfig.requiredCumulativePoints}积分`)
      }

      // 获取或创建权限记录
      let accessRecord = await PremiumSpaceAccess.findOne({
        where: { user_id: userId },
        transaction
      })

      if (!accessRecord) {
        accessRecord = await PremiumSpaceAccess.create(
          {
            user_id: userId,
            is_unlocked: false,
            required_cumulative_points: this.premiumSpaceConfig.requiredCumulativePoints,
            unlock_cost_points: this.premiumSpaceConfig.unlockCostPoints,
            unlock_duration_hours: this.premiumSpaceConfig.unlockDurationHours,
            unlock_count: 0,
            total_cost_points: 0
          },
          { transaction }
        )
      }

      // 检查今日解锁次数限制
      const today = moment().startOf('day')
      const todayUnlockCount = await this.getTodayUnlockCount(userId, today.toDate())
      if (todayUnlockCount >= this.premiumSpaceConfig.maxUnlockPerDay) {
        throw new Error(`今日解锁次数已达上限（${this.premiumSpaceConfig.maxUnlockPerDay}次）`)
      }

      // 计算过期时间
      const unlockTime = new Date()
      const expiryTime = new Date(unlockTime.getTime() + unlockConfig.duration * 60 * 60 * 1000)

      // 扣除积分
      await user.update(
        {
          available_points: user.available_points - unlockConfig.cost,
          used_points: user.used_points + unlockConfig.cost
        },
        { transaction }
      )

      // 记录积分变动
      await PointsRecord.create(
        {
          user_id: userId,
          type: 'spend',
          points: unlockConfig.cost,
          description: `解锁臻选空间（${unlockType}）`,
          source: 'premium_unlock',
          balance_after: user.available_points - unlockConfig.cost
        },
        { transaction }
      )

      // 更新权限记录
      await accessRecord.update(
        {
          is_unlocked: true,
          unlock_time: unlockTime,
          expiry_time: expiryTime,
          unlock_count: accessRecord.unlock_count + 1,
          total_cost_points: accessRecord.total_cost_points + unlockConfig.cost,
          last_unlock_client: 'web', // 可以从请求中获取
          unlock_duration_hours: unlockConfig.duration
        },
        { transaction }
      )

      await transaction.commit()

      return {
        permissionId: `perm_${accessRecord.id}`,
        unlockedAt: moment(unlockTime).format('YYYY-MM-DD HH:mm:ss'),
        expiresAt: moment(expiryTime).format('YYYY-MM-DD HH:mm:ss'),
        costPoints: unlockConfig.cost,
        remainingPoints: user.available_points - unlockConfig.cost,
        duration: `${unlockConfig.duration}小时`
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 解锁臻选空间失败:', error.message)
      throw error
    }
  }

  /**
   * 续费臻选空间权限
   */
  async renewPremiumSpace (userId, renewType = '24hours', confirmSpend) {
    const transaction = await sequelize.transaction()

    try {
      // 检查用户
      const user = await User.findByPk(userId, { transaction })
      if (!user) {
        throw new Error('用户不存在')
      }

      // 获取权限记录
      const accessRecord = await PremiumSpaceAccess.findOne({
        where: { user_id: userId },
        transaction
      })

      if (!accessRecord) {
        throw new Error('尚未解锁臻选空间，请先解锁')
      }

      // 验证续费类型和费用
      const renewConfig = this.getUnlockConfig(renewType)
      if (confirmSpend !== renewConfig.cost) {
        throw new Error('确认消费积分与实际费用不符')
      }

      // 检查积分是否足够
      if (user.available_points < renewConfig.cost) {
        throw new Error('积分不足')
      }

      // 计算新的过期时间（从当前时间或原过期时间的较晚者开始）
      const now = new Date()
      const currentExpiry = accessRecord.expiry_time || now
      const newExpiryTime = new Date(
        Math.max(now.getTime(), currentExpiry.getTime()) + renewConfig.duration * 60 * 60 * 1000
      )

      // 扣除积分
      await user.update(
        {
          available_points: user.available_points - renewConfig.cost,
          used_points: user.used_points + renewConfig.cost
        },
        { transaction }
      )

      // 记录积分变动
      await PointsRecord.create(
        {
          user_id: userId,
          type: 'spend',
          points: renewConfig.cost,
          description: `续费臻选空间（${renewType}）`,
          source: 'premium_renew',
          balance_after: user.available_points - renewConfig.cost
        },
        { transaction }
      )

      // 更新权限记录
      await accessRecord.update(
        {
          is_unlocked: true,
          expiry_time: newExpiryTime,
          total_cost_points: accessRecord.total_cost_points + renewConfig.cost
        },
        { transaction }
      )

      await transaction.commit()

      return {
        newExpiresAt: moment(newExpiryTime).format('YYYY-MM-DD HH:mm:ss'),
        costPoints: renewConfig.cost,
        remainingPoints: user.available_points - renewConfig.cost,
        duration: `${renewConfig.duration}小时`
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 续费臻选空间失败:', error.message)
      throw error
    }
  }

  /**
   * 获取用户权限统计
   */
  async getUserPermissionStats (userId) {
    try {
      const accessRecord = await PremiumSpaceAccess.findOne({
        where: { user_id: userId }
      })

      if (!accessRecord) {
        return {
          totalUnlocks: 0,
          totalSpent: 0,
          averageDuration: 0,
          lastUnlockTime: null,
          favoriteUnlockType: null
        }
      }

      // 获取今日解锁次数
      const today = moment().startOf('day')
      const todayUnlockCount = await this.getTodayUnlockCount(userId, today.toDate())

      return {
        totalUnlocks: accessRecord.unlock_count,
        totalSpent: accessRecord.total_cost_points,
        averageDuration: accessRecord.unlock_duration_hours,
        lastUnlockTime: accessRecord.unlock_time
          ? moment(accessRecord.unlock_time).format('YYYY-MM-DD HH:mm:ss')
          : null,
        todayUnlockCount,
        maxUnlockPerDay: this.premiumSpaceConfig.maxUnlockPerDay
      }
    } catch (error) {
      console.error('❌ 获取用户权限统计失败:', error.message)
      return {
        totalUnlocks: 0,
        totalSpent: 0,
        averageDuration: 0,
        lastUnlockTime: null,
        todayUnlockCount: 0,
        maxUnlockPerDay: this.premiumSpaceConfig.maxUnlockPerDay
      }
    }
  }

  /**
   * 获取今日解锁次数
   */
  async getTodayUnlockCount (userId, startOfDay) {
    try {
      const count = await PointsRecord.count({
        where: {
          user_id: userId,
          source: 'premium_unlock',
          created_at: {
            [Op.gte]: startOfDay
          }
        }
      })
      return count
    } catch (error) {
      console.error('❌ 获取今日解锁次数失败:', error.message)
      return 0
    }
  }

  /**
   * 获取解锁配置
   */
  getUnlockConfig (unlockType) {
    const configs = {
      '24hours': {
        cost: 100,
        duration: 24
      },
      month: {
        cost: 2000,
        duration: 24 * 30
      },
      year: {
        cost: 20000,
        duration: 24 * 365
      }
    }

    return configs[unlockType] || configs['24hours']
  }

  /**
   * 格式化剩余时间
   */
  formatTimeRemaining (milliseconds) {
    if (milliseconds <= 0) {
      return '已过期'
    }

    const duration = moment.duration(milliseconds)
    const days = Math.floor(duration.asDays())
    const hours = duration.hours()
    const minutes = duration.minutes()

    if (days > 0) {
      return `${days}天${hours}小时${minutes}分钟`
    } else if (hours > 0) {
      return `${hours}小时${minutes}分钟`
    } else {
      return `${minutes}分钟`
    }
  }

  /**
   * 检查权限是否有效（中间件使用）
   */
  async hasValidPremiumAccess (userId) {
    try {
      const status = await this.checkPremiumSpaceStatus(userId)
      return status.hasPermission && !status.isExpired
    } catch (error) {
      console.error('❌ 检查权限有效性失败:', error.message)
      return false
    }
  }

  /**
   * 批量检查用户权限状态
   */
  async batchCheckPermissions (userIds) {
    try {
      const results = {}

      for (const userId of userIds) {
        results[userId] = await this.checkPremiumSpaceStatus(userId)
      }

      return results
    } catch (error) {
      console.error('❌ 批量检查权限失败:', error.message)
      throw error
    }
  }
}

module.exports = PermissionService
