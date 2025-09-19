/**
 * 决策上下文构建器
 * 收集和组织抽奖决策所需的所有信息
 *
 * @description 基于真实用户数据和业务逻辑构建决策上下文
 * @version 4.0.0
 * @date 2025-09-10
 */

const Logger = require('../utils/Logger')

class ContextBuilder {
  constructor () {
    this.logger = new Logger('ContextBuilder')
  }

  /**
   * 构建决策上下文
   *
   * @param {Object} request - 抽奖请求
   * @returns {Promise<Object>} 完整的决策上下文
   */
  async buildContext (request) {
    const startTime = Date.now()

    try {
      this.logger.debug('开始构建决策上下文', {
        userId: request.userId,
        activityId: request.activityId,
        lotteryType: request.lotteryType
      })

      // 并行收集各类上下文信息
      const [userProfile, activityConfig, lotteryHistory, prizePoolStatus, systemEnvironment] =
        await Promise.all([
          this.buildUserProfile(request.userId),
          this.buildActivityConfig(request.activityId),
          this.buildLotteryHistory(request.userId),
          this.buildPrizePoolStatus(request.activityId),
          this.buildSystemEnvironment()
        ])

      const context = {
        request,
        userProfile,
        activityConfig,
        lotteryHistory,
        prizePoolStatus,
        systemEnvironment,
        timestamp: new Date().toISOString(),
        buildTime: Date.now() - startTime
      }

      this.logger.debug('决策上下文构建完成', {
        userId: request.userId,
        buildTime: context.buildTime,
        contextSize: this.calculateContextSize(context)
      })

      return context
    } catch (error) {
      this.logger.error('决策上下文构建失败', {
        userId: request.userId,
        error: error.message,
        stack: error.stack
      })

      throw new Error(`上下文构建失败: ${error.message}`)
    }
  }

  /**
   * 构建用户画像
   *
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 用户画像信息
   */
  async buildUserProfile (userId) {
    const { User, UserPointsAccount } = require('../../../models')

    // 获取用户基础信息
    const user = await User.findByPk(userId)

    if (!user) {
      throw new Error(`用户不存在: ${userId}`)
    }

    // 获取用户积分账户信息（替代不存在的UserLevelLog）
    const pointsAccount = await UserPointsAccount.findOne({
      where: { user_id: userId }
    })

    // 计算用户行为特征
    const behaviorFeatures = await this.calculateUserBehavior(userId)

    return {
      userId: user.user_id,
      nickname: user.nickname,
      mobile: user.mobile,
      isAdmin: user.is_admin,
      // 使用积分账户信息
      totalPoints: pointsAccount ? parseFloat(pointsAccount.total_earned) : 0,
      usedPoints: pointsAccount ? parseFloat(pointsAccount.total_consumed) : 0,
      availablePoints: pointsAccount ? parseFloat(pointsAccount.available_points) : 0,
      accountLevel: pointsAccount ? pointsAccount.account_level : 'bronze',
      registrationDays: Math.floor(
        (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
      ),
      lastLoginDays: user.last_login_at
        ? Math.floor((Date.now() - new Date(user.last_login_at).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      // 用积分等级信息替代levelHistory
      pointsAccountInfo: pointsAccount
        ? {
          accountLevel: pointsAccount.account_level,
          lastEarnTime: pointsAccount.last_earn_time,
          behaviorScore: pointsAccount.behavior_score,
          activityLevel: pointsAccount.activity_level
        }
        : null,
      behaviorFeatures
    }
  }

  /**
   * 计算用户行为特征
   *
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 用户行为特征
   */
  async calculateUserBehavior (userId) {
    const { LotteryRecord } = require('../../../models')
    const { Op } = require('sequelize')

    // 获取最近30天的抽奖记录
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const recentLotteries = await LotteryRecord.findAll({
      where: {
        user_id: userId,
        created_at: { [Op.gte]: thirtyDaysAgo }
      },
      order: [['created_at', 'DESC']]
    })

    // 获取最近7天的抽奖记录
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const weeklyLotteries = recentLotteries.filter(
      record => new Date(record.created_at) >= sevenDaysAgo
    )

    // 计算中奖率
    const winningLotteries = recentLotteries.filter(record => record.is_winner)
    const winRate =
      recentLotteries.length > 0 ? winningLotteries.length / recentLotteries.length : 0

    // 计算连续未中奖次数
    let consecutiveLosses = 0
    for (const record of recentLotteries) {
      if (record.is_winner) {
        break
      }
      consecutiveLosses++
    }

    // 计算最后一次中奖时间
    const lastWinRecord = winningLotteries[0]
    const daysSinceLastWin = lastWinRecord
      ? Math.floor(
        (Date.now() - new Date(lastWinRecord.created_at).getTime()) / (1000 * 60 * 60 * 24)
      )
      : null

    return {
      recentLotteryCount: recentLotteries.length,
      weeklyLotteryCount: weeklyLotteries.length,
      totalWinCount: winningLotteries.length,
      winRate: parseFloat(winRate.toFixed(3)),
      consecutiveLosses,
      daysSinceLastWin,
      averagePointsPerLottery:
        recentLotteries.length > 0
          ? Math.round(
            recentLotteries.reduce((sum, record) => sum + record.points_cost, 0) /
                recentLotteries.length
          )
          : 0,
      isActiveUser: weeklyLotteries.length >= 5,
      isHighValueUser: winningLotteries.some(record => record.prize_value > 100)
    }
  }

  /**
   * 构建活动配置
   *
   * @param {number} activityId - 活动ID
   * @returns {Promise<Object>} 活动配置信息
   */
  async buildActivityConfig (activityId) {
    const { LotteryCampaign, LotteryPrize } = require('../../../models')

    // 获取活动基础配置
    const activity = await LotteryCampaign.findByPk(activityId, {
      include: [
        {
          model: LotteryPrize,
          as: 'prizes',
          where: { status: 'active' },
          required: false
        }
      ]
    })

    if (!activity) {
      throw new Error(`活动不存在: ${activityId}`)
    }

    // 检查活动状态
    const now = new Date()
    const isActive =
      activity.status === 'active' &&
      new Date(activity.start_time) <= now &&
      new Date(activity.end_time) >= now

    return {
      activityId: activity.campaign_id,
      name: activity.name,
      description: activity.description,
      status: activity.status,
      isActive,
      startTime: activity.start_time,
      endTime: activity.end_time,
      pointsCost: activity.points_cost,
      maxParticipations: activity.max_participations,
      dailyLimit: activity.daily_limit,
      baseProbability: activity.base_probability,
      guaranteeRules: activity.guarantee_rules ? JSON.parse(activity.guarantee_rules) : {},
      prizePools: activity.prizePools
        ? activity.prizePools.map(pool => ({
          poolId: pool.pool_id,
          name: pool.name,
          type: pool.type,
          weight: pool.weight,
          totalPrizes: pool.total_prizes,
          remainingPrizes: pool.remaining_prizes,
          probability: pool.probability
        }))
        : []
    }
  }

  /**
   * 构建抽奖历史
   *
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 抽奖历史信息
   */
  async buildLotteryHistory (userId) {
    const { LotteryRecord } = require('../../../models')
    const { Op } = require('sequelize')

    // 获取今日抽奖记录
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

    const todayRecords = await LotteryRecord.findAll({
      where: {
        user_id: userId,
        created_at: {
          [Op.gte]: todayStart,
          [Op.lt]: todayEnd
        }
      }
    })

    // 获取最近10次抽奖记录
    const recentRecords = await LotteryRecord.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      limit: 10
    })

    // 获取保底相关统计
    const guaranteeStats = await this.calculateGuaranteeStats(userId)

    return {
      todayCount: todayRecords.length,
      todayWinCount: todayRecords.filter(record => record.is_winner).length,
      recentRecords: recentRecords.map(record => ({
        recordId: record.record_id,
        is_winner: record.is_winner, // ✅ 业务标准字段
        prizeName: record.prize_name,
        prizeValue: record.prize_value,
        pointsCost: record.points_cost,
        probability: record.probability,
        createdAt: record.created_at
      })),
      guaranteeStats
    }
  }

  /**
   * 计算保底统计信息
   *
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 保底统计信息
   */
  async calculateGuaranteeStats (userId) {
    const { LotteryRecord } = require('../../../models')

    // 获取所有抽奖记录
    const allRecords = await LotteryRecord.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']]
    })

    // 计算各类保底统计
    let consecutiveLosses = 0
    let daysSinceLastWin = null
    const totalLotteries = allRecords.length
    let totalWins = 0

    for (let i = 0; i < allRecords.length; i++) {
      const record = allRecords[i]

      if (record.is_winner) {
        totalWins++
        if (i === 0) {
          // 最近一次就中奖了
          daysSinceLastWin = 0
        } else if (daysSinceLastWin === null) {
          // 找到最近一次中奖记录
          daysSinceLastWin = Math.floor(
            (Date.now() - new Date(record.created_at).getTime()) / (1000 * 60 * 60 * 24)
          )
        }
        break
      } else {
        consecutiveLosses++
      }
    }

    // 如果从未中奖，计算注册天数
    if (daysSinceLastWin === null && totalLotteries > 0) {
      const { User } = require('../../../models')
      const user = await User.findByPk(userId, { attributes: ['created_at'] })
      if (user) {
        daysSinceLastWin = Math.floor(
          (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
        )
      }
    }

    return {
      consecutiveLosses,
      daysSinceLastWin,
      totalLotteries,
      totalWins,
      overallWinRate: totalLotteries > 0 ? totalWins / totalLotteries : 0,
      needsGuarantee: consecutiveLosses >= 10 || daysSinceLastWin >= 7
    }
  }

  /**
   * 构建奖品池状态
   *
   * @param {number} activityId - 活动ID
   * @returns {Promise<Object>} 奖品池状态信息
   */
  async buildPrizePoolStatus (activityId) {
    const { LotteryCampaign, LotteryPrize } = require('../../../models')

    // 获取活动的所有奖品池
    const prizePools = await LotteryCampaign.findAll({
      where: {
        campaign_id: activityId,
        status: 'active'
      },
      include: [
        {
          model: LotteryPrize,
          as: 'prizes',
          where: { status: 'available' },
          required: false
        }
      ]
    })

    const poolStatuses = []

    for (const pool of prizePools) {
      const totalPrizes = await LotteryPrize.count({
        where: { campaign_id: pool.campaign_id }
      })

      const availablePrizes = await LotteryPrize.count({
        where: {
          campaign_id: pool.campaign_id,
          status: 'active',
          stock_quantity: { [require('sequelize').Op.gt]: 0 }
        }
      })

      const totalValue =
        (await LotteryPrize.sum('prize_value', {
          where: {
            campaign_id: pool.campaign_id,
            status: 'active'
          }
        })) || 0

      poolStatuses.push({
        poolId: pool.pool_id,
        name: pool.name,
        type: pool.type,
        weight: pool.weight,
        probability: pool.probability,
        totalPrizes,
        availablePrizes,
        utilizationRate: totalPrizes > 0 ? (totalPrizes - availablePrizes) / totalPrizes : 0,
        totalValue,
        averageValue: availablePrizes > 0 ? totalValue / availablePrizes : 0,
        isAvailable: availablePrizes > 0,
        prizes: pool.prizes
          ? pool.prizes.slice(0, 5).map(prize => ({
            prizeId: prize.prize_id,
            name: prize.name,
            type: prize.type,
            value: prize.prize_value,
            quantity: prize.quantity,
            weight: prize.weight
          }))
          : []
      })
    }

    return {
      totalPools: poolStatuses.length,
      availablePools: poolStatuses.filter(pool => pool.isAvailable).length,
      totalPrizes: poolStatuses.reduce((sum, pool) => sum + pool.totalPrizes, 0),
      availablePrizes: poolStatuses.reduce((sum, pool) => sum + pool.availablePrizes, 0),
      totalValue: poolStatuses.reduce((sum, pool) => sum + pool.totalValue, 0),
      pools: poolStatuses
    }
  }

  /**
   * 构建系统环境信息
   *
   * @returns {Promise<Object>} 系统环境信息
   */
  async buildSystemEnvironment () {
    const now = new Date()

    // 获取真实系统负载信息（清理模拟数据）
    const os = require('os')
    const systemLoad = {
      cpu: os.loadavg()[0], // 1分钟平均负载
      memory: Math.round((1 - os.freemem() / os.totalmem()) * 100),
      activeConnections: process._getActiveHandles().length
    }

    // 时间相关信息
    const timeInfo = {
      timestamp: now.toISOString(),
      hour: now.getHours(),
      dayOfWeek: now.getDay(),
      isWeekend: now.getDay() === 0 || now.getDay() === 6,
      isPeakHour: now.getHours() >= 19 && now.getHours() <= 22
    }

    return {
      systemLoad,
      timeInfo,
      serverRegion: 'cn-beijing',
      version: '4.0.0'
    }
  }

  /**
   * 计算上下文大小
   *
   * @param {Object} context - 决策上下文
   * @returns {number} 上下文大小（字节）
   */
  calculateContextSize (context) {
    return Buffer.byteLength(JSON.stringify(context), 'utf8')
  }
}

module.exports = ContextBuilder
