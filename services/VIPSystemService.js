// services/VIPSystemService.js
const { Op } = require('sequelize')
const EventBusService = require('./EventBusService')
const PointsSystemService = require('./PointsSystemService')
const TransactionService = require('./TransactionService')

/**
 * VIP系统服务
 * 实现VIP等级权限控制、升级机制、特殊权益管理
 */
class VIPSystemService {
  constructor () {
    this.models = require('../models')
    this.eventBus = EventBusService
    this.points = PointsSystemService
    this.transaction = TransactionService

    // VIP等级配置
    this.vipLevelConfigs = {
      0: {
        name: '普通用户',
        description: '基础权益',
        requiredSpent: 0,
        requiredActiveDays: 0,
        benefits: {
          lotteryDiscount: 0,
          pointsMultiplier: 1.0,
          exclusiveAccess: [],
          dailyBonusPoints: 0,
          prioritySupport: false,
          specialEvents: false
        },
        color: '#808080',
        icon: 'user'
      },
      1: {
        name: 'VIP1',
        description: '青铜会员 - 享受基础VIP权益',
        requiredSpent: 1000,
        requiredActiveDays: 7,
        benefits: {
          lotteryDiscount: 0.05,
          pointsMultiplier: 1.1,
          exclusiveAccess: ['basic_vip_pool'],
          dailyBonusPoints: 20,
          prioritySupport: false,
          specialEvents: false
        },
        color: '#CD7F32',
        icon: 'star'
      },
      2: {
        name: 'VIP2',
        description: '白银会员 - 享受更多特权',
        requiredSpent: 5000,
        requiredActiveDays: 15,
        benefits: {
          lotteryDiscount: 0.1,
          pointsMultiplier: 1.2,
          exclusiveAccess: ['basic_vip_pool', 'silver_events'],
          dailyBonusPoints: 50,
          prioritySupport: true,
          specialEvents: true
        },
        color: '#C0C0C0',
        icon: 'crown'
      },
      3: {
        name: 'VIP3',
        description: '黄金会员 - 顶级VIP体验',
        requiredSpent: 20000,
        requiredActiveDays: 30,
        benefits: {
          lotteryDiscount: 0.15,
          pointsMultiplier: 1.3,
          exclusiveAccess: ['basic_vip_pool', 'silver_events', 'gold_exclusive'],
          dailyBonusPoints: 100,
          prioritySupport: true,
          specialEvents: true
        },
        color: '#FFD700',
        icon: 'diamond'
      }
    }
  }

  /**
   * 获取用户VIP信息
   */
  async getUserVIPInfo (userId) {
    try {
      const user = await this.models.User.findByPk(userId)
      if (!user) {
        throw new Error('用户不存在')
      }

      const userStats = await this.calculateUserStats(userId)
      const currentLevel = user.vip_level || 0
      const currentConfig = this.vipLevelConfigs[currentLevel]
      const upgradeCheck = await this.checkVIPUpgrade(userId, userStats)

      const nextLevel = currentLevel + 1
      const nextConfig = this.vipLevelConfigs[nextLevel]
      let progress = null

      if (nextConfig) {
        progress = {
          currentSpent: userStats.totalSpent,
          requiredSpent: nextConfig.requiredSpent,
          spentProgress: Math.min(100, (userStats.totalSpent / nextConfig.requiredSpent) * 100),
          currentActiveDays: userStats.activeDays,
          requiredActiveDays: nextConfig.requiredActiveDays,
          activeDaysProgress: Math.min(100, (userStats.activeDays / nextConfig.requiredActiveDays) * 100),
          overallProgress: Math.min(100, Math.min(
            (userStats.totalSpent / nextConfig.requiredSpent) * 100,
            (userStats.activeDays / nextConfig.requiredActiveDays) * 100
          ))
        }
      }

      return {
        success: true,
        currentVIP: {
          level: currentLevel,
          name: currentConfig.name,
          description: currentConfig.description,
          color: currentConfig.color,
          icon: currentConfig.icon,
          benefits: currentConfig.benefits
        },
        nextVIP: nextConfig
          ? {
            level: nextLevel,
            name: nextConfig.name,
            description: nextConfig.description,
            requiredSpent: nextConfig.requiredSpent,
            requiredActiveDays: nextConfig.requiredActiveDays
          }
          : null,
        progress,
        canUpgrade: upgradeCheck.canUpgrade,
        upgradeReason: upgradeCheck.reason,
        userStats
      }
    } catch (error) {
      console.error('获取用户VIP信息失败:', error)
      throw error
    }
  }

  /**
   * 检查并自动升级VIP等级
   */
  async checkAndUpgradeVIP (userId) {
    try {
      return await this.transaction.executeTransaction(async (transaction) => {
        const user = await this.models.User.findByPk(userId, { transaction })
        if (!user) {
          throw new Error('用户不存在')
        }

        const userStats = await this.calculateUserStats(userId, transaction)
        const currentLevel = user.vip_level || 0

        let newLevel = currentLevel
        for (let level = currentLevel + 1; level <= 3; level++) {
          const config = this.vipLevelConfigs[level]
          if (userStats.totalSpent >= config.requiredSpent &&
              userStats.activeDays >= config.requiredActiveDays) {
            newLevel = level
          } else {
            break
          }
        }

        if (newLevel > currentLevel) {
          await user.update({
            vip_level: newLevel,
            vip_upgraded_at: new Date()
          }, { transaction })

          await this.models.VIPUpgradeHistory.create({
            user_id: userId,
            from_level: currentLevel,
            to_level: newLevel,
            total_spent: userStats.totalSpent,
            active_days: userStats.activeDays,
            upgraded_at: new Date()
          }, { transaction })

          const upgradeRewards = await this.grantUpgradeRewards(userId, newLevel, transaction)

          await this.eventBus.emit('vip_upgraded', {
            userId,
            fromLevel: currentLevel,
            toLevel: newLevel,
            rewards: upgradeRewards,
            upgradedAt: new Date()
          })

          return {
            success: true,
            upgraded: true,
            fromLevel: currentLevel,
            toLevel: newLevel,
            newVIPConfig: this.vipLevelConfigs[newLevel],
            rewards: upgradeRewards,
            message: `恭喜升级到${this.vipLevelConfigs[newLevel].name}！`
          }
        } else {
          return {
            success: true,
            upgraded: false,
            currentLevel,
            message: '当前尚未满足升级条件'
          }
        }
      })
    } catch (error) {
      console.error('检查VIP升级失败:', error)
      throw error
    }
  }

  /**
   * 应用VIP折扣
   */
  async applyVIPDiscount (userId, originalCost, discountType = 'lottery') {
    try {
      const user = await this.models.User.findByPk(userId)
      if (!user) {
        throw new Error('用户不存在')
      }

      const vipLevel = user.vip_level || 0
      const vipConfig = this.vipLevelConfigs[vipLevel]

      let discountRate = 0
      switch (discountType) {
      case 'lottery':
        discountRate = vipConfig.benefits.lotteryDiscount || 0
        break
      default:
        discountRate = 0
      }

      const discountAmount = Math.floor(originalCost * discountRate)
      const finalCost = originalCost - discountAmount

      return {
        originalCost,
        discountRate,
        discountAmount,
        finalCost,
        vipLevel,
        vipName: vipConfig.name
      }
    } catch (error) {
      console.error('应用VIP折扣失败:', error)
      throw error
    }
  }

  /**
   * 检查VIP专属权限
   */
  async checkVIPAccess (userId, accessType) {
    try {
      const user = await this.models.User.findByPk(userId)
      if (!user) {
        throw new Error('用户不存在')
      }

      const vipLevel = user.vip_level || 0
      const vipConfig = this.vipLevelConfigs[vipLevel]

      const hasAccess = vipConfig.benefits.exclusiveAccess.includes(accessType) ||
                       (accessType === 'priority_support' && vipConfig.benefits.prioritySupport) ||
                       (accessType === 'special_events' && vipConfig.benefits.specialEvents)

      return {
        hasAccess,
        vipLevel,
        vipName: vipConfig.name,
        accessType,
        requiredLevel: this.getRequiredVIPLevel(accessType)
      }
    } catch (error) {
      console.error('检查VIP权限失败:', error)
      throw error
    }
  }

  /**
   * 发放VIP每日奖励
   */
  async grantDailyVIPBonus (userId) {
    try {
      const user = await this.models.User.findByPk(userId)
      if (!user) {
        throw new Error('用户不存在')
      }

      const vipLevel = user.vip_level || 0
      const vipConfig = this.vipLevelConfigs[vipLevel]
      const dailyBonus = vipConfig.benefits.dailyBonusPoints

      if (dailyBonus <= 0) {
        return {
          success: true,
          bonusPoints: 0,
          message: '当前VIP等级无每日奖励'
        }
      }

      // 检查今日是否已领取
      const today = new Date().toISOString().split('T')[0]
      const redis = require('redis').createClient()
      await redis.connect()

      const bonusKey = `vip_daily_bonus:${userId}:${today}`
      const alreadyClaimed = await redis.get(bonusKey)

      if (alreadyClaimed) {
        await redis.disconnect()
        return {
          success: false,
          bonusPoints: 0,
          message: '今日VIP奖励已领取'
        }
      }

      await this.points.addPoints(userId, dailyBonus, {
        type: 'vip_daily_bonus',
        description: `${vipConfig.name}每日奖励`,
        related_id: vipLevel
      })

      await redis.setex(bonusKey, 24 * 60 * 60, '1')
      await redis.disconnect()

      await this.models.VIPBonusHistory.create({
        user_id: userId,
        vip_level: vipLevel,
        bonus_type: 'daily',
        bonus_points: dailyBonus,
        granted_at: new Date()
      })

      return {
        success: true,
        bonusPoints: dailyBonus,
        vipLevel,
        vipName: vipConfig.name,
        message: `获得${vipConfig.name}每日奖励${dailyBonus}积分`
      }
    } catch (error) {
      console.error('发放VIP每日奖励失败:', error)
      throw error
    }
  }

  // 私有辅助方法
  async calculateUserStats (userId, transaction = null) {
    try {
      const [pointsStats, drawStats, loginStats] = await Promise.all([
        this.points.getUserPoints(userId, transaction),
        this.models.LotteryDraw.findAll({
          where: { user_id: userId },
          attributes: [
            [this.models.sequelize.fn('COUNT', 'id'), 'total_draws'],
            [this.models.sequelize.fn('SUM', 'points_cost'), 'total_spent']
          ],
          transaction
        }),
        this.models.UserLoginHistory.findAll({
          where: {
            user_id: userId,
            login_date: {
              [Op.gte]: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
            }
          },
          attributes: [
            [this.models.sequelize.fn('COUNT', this.models.sequelize.fn('DISTINCT', 'login_date')), 'active_days']
          ],
          transaction
        })
      ])

      const drawResult = drawStats[0]?.dataValues || {}
      const loginResult = loginStats[0]?.dataValues || {}

      return {
        totalPoints: pointsStats.total_points || 0,
        totalSpent: parseInt(drawResult.total_spent || 0),
        totalDraws: parseInt(drawResult.total_draws || 0),
        activeDays: parseInt(loginResult.active_days || 0)
      }
    } catch (error) {
      console.error('计算用户统计失败:', error)
      return {
        totalPoints: 0,
        totalSpent: 0,
        totalDraws: 0,
        activeDays: 0
      }
    }
  }

  async checkVIPUpgrade (userId, userStats) {
    const user = await this.models.User.findByPk(userId)
    const currentLevel = user.vip_level || 0
    const nextLevel = currentLevel + 1
    const nextConfig = this.vipLevelConfigs[nextLevel]

    if (!nextConfig) {
      return {
        canUpgrade: false,
        reason: '已达到最高VIP等级'
      }
    }

    const spentEnough = userStats.totalSpent >= nextConfig.requiredSpent
    const activeDaysEnough = userStats.activeDays >= nextConfig.requiredActiveDays

    if (spentEnough && activeDaysEnough) {
      return {
        canUpgrade: true,
        reason: '满足升级条件'
      }
    } else {
      const requirements = []
      if (!spentEnough) {
        requirements.push(`还需消费${nextConfig.requiredSpent - userStats.totalSpent}积分`)
      }
      if (!activeDaysEnough) {
        requirements.push(`还需活跃${nextConfig.requiredActiveDays - userStats.activeDays}天`)
      }
      return {
        canUpgrade: false,
        reason: requirements.join('，')
      }
    }
  }

  async grantUpgradeRewards (userId, newLevel, transaction) {
    const rewards = []

    switch (newLevel) {
    case 1:
      await this.points.addPoints(userId, 200, {
        type: 'vip_upgrade_bonus',
        description: 'VIP1升级奖励',
        related_id: newLevel
      }, transaction)
      rewards.push({ type: 'points', amount: 200, description: 'VIP1升级积分奖励' })
      break
    case 2:
      await this.points.addPoints(userId, 500, {
        type: 'vip_upgrade_bonus',
        description: 'VIP2升级奖励',
        related_id: newLevel
      }, transaction)
      rewards.push({ type: 'points', amount: 500, description: 'VIP2升级积分奖励' })
      break
    case 3:
      await this.points.addPoints(userId, 1000, {
        type: 'vip_upgrade_bonus',
        description: 'VIP3升级奖励',
        related_id: newLevel
      }, transaction)
      rewards.push({ type: 'points', amount: 1000, description: 'VIP3升级积分奖励' })
      break
    }

    return rewards
  }

  getRequiredVIPLevel (accessType) {
    for (let level = 1; level <= 3; level++) {
      const config = this.vipLevelConfigs[level]
      if (config.benefits.exclusiveAccess.includes(accessType) ||
          (accessType === 'priority_support' && config.benefits.prioritySupport) ||
          (accessType === 'special_events' && config.benefits.specialEvents)) {
        return level
      }
    }
    return 0
  }
}

module.exports = new VIPSystemService()
