// services/DynamicProbabilityService.js
const BehaviorAnalyticsService = require('./BehaviorAnalyticsService')
const EventBusService = require('./EventBusService')
const { Op } = require('sequelize')

/**
 * 动态概率引擎服务
 * 基于用户行为数据和统计学方法实现智能概率调整
 * 无需重型AI框架，使用数学算法和现有数据分析
 */
class DynamicProbabilityService {
  constructor () {
    this.models = require('../models')
    this.behavior = BehaviorAnalyticsService
    this.eventBus = EventBusService

    // 概率调整配置
    this.probabilityConfig = {
      // 基础调整因子
      baseFactor: 1.0,
      // 最大调整幅度
      maxAdjustment: 0.5, // ±50%
      // 数据窗口期（天）
      dataWindow: 30,
      // 最小样本量
      minSampleSize: 100,
      // 调整敏感度
      sensitivity: 0.1
    }

    // 概率调整算法权重
    this.algorithmWeights = {
      userBehavior: 0.3, // 用户行为权重
      systemBalance: 0.25, // 系统平衡权重
      timePattern: 0.2, // 时间模式权重
      marketDemand: 0.15, // 市场需求权重
      randomFactor: 0.1 // 随机因子权重
    }
  }

  /**
   * 计算动态概率
   */
  async calculateDynamicProbability (userId, campaignId, baseProbability) {
    try {
      // 获取用户行为数据
      const userBehavior = await this.behavior.getUserBehaviorPattern(userId)

      // 获取系统统计数据
      const systemStats = await this.getSystemStatistics(campaignId)

      // 获取时间模式数据
      const timePattern = await this.getTimePatternData()

      // 计算各维度调整因子
      const userFactor = this.calculateUserBehaviorFactor(userBehavior)
      const systemFactor = this.calculateSystemBalanceFactor(systemStats, campaignId)
      const timeFactor = this.calculateTimePatternFactor(timePattern)
      const marketFactor = this.calculateMarketDemandFactor(campaignId)
      const randomFactor = this.generateControlledRandomFactor()

      // 加权计算最终调整因子
      const finalAdjustment =
        userFactor * this.algorithmWeights.userBehavior +
        systemFactor * this.algorithmWeights.systemBalance +
        timeFactor * this.algorithmWeights.timePattern +
        marketFactor * this.algorithmWeights.marketDemand +
        randomFactor * this.algorithmWeights.randomFactor

      // 应用调整限制
      const boundedAdjustment = Math.max(
        -this.probabilityConfig.maxAdjustment,
        Math.min(this.probabilityConfig.maxAdjustment, finalAdjustment)
      )

      // 计算最终概率
      const adjustedProbability = baseProbability * (1 + boundedAdjustment)
      const finalProbability = Math.max(0.1, Math.min(100, adjustedProbability))

      // 记录调整日志
      await this.logProbabilityAdjustment(
        userId,
        campaignId,
        baseProbability,
        finalProbability,
        {
          userFactor,
          systemFactor,
          timeFactor,
          marketFactor,
          randomFactor,
          finalAdjustment: boundedAdjustment
        }
      )

      return {
        originalProbability: baseProbability,
        adjustedProbability: finalProbability,
        adjustmentFactor: boundedAdjustment,
        components: {
          userBehavior: userFactor,
          systemBalance: systemFactor,
          timePattern: timeFactor,
          marketDemand: marketFactor,
          randomFactor
        }
      }
    } catch (error) {
      console.error('计算动态概率失败:', error)
      // 发生错误时返回基础概率
      return {
        originalProbability: baseProbability,
        adjustedProbability: baseProbability,
        adjustmentFactor: 0,
        error: error.message
      }
    }
  }

  /**
   * 计算用户行为调整因子
   */
  calculateUserBehaviorFactor (userBehavior) {
    let factor = 0

    // 近期中奖率分析
    const recentWinRate = userBehavior.recent_win_rate || 0.1
    const expectedWinRate = 0.15 // 系统期望中奖率

    if (recentWinRate < expectedWinRate * 0.5) {
      // 用户最近中奖率过低，提升概率
      factor += 0.2
    } else if (recentWinRate > expectedWinRate * 1.5) {
      // 用户最近中奖率过高，降低概率
      factor -= 0.15
    }

    // 活跃度分析
    const activityScore = userBehavior.activity_score || 0.5
    if (activityScore > 0.8) {
      // 高活跃用户，适度提升
      factor += 0.1
    } else if (activityScore < 0.3) {
      // 低活跃用户，激励提升
      factor += 0.15
    }

    // 消费水平分析
    const spendingLevel = userBehavior.spending_level || 'medium'
    const spendingFactors = {
      low: 0.1, // 低消费用户激励
      medium: 0, // 中等消费维持
      high: -0.05, // 高消费用户略微降低
      vip: -0.1 // VIP用户保持挑战性
    }
    factor += spendingFactors[spendingLevel] || 0

    // 连续参与分析
    const consecutiveDays = userBehavior.consecutive_days || 0
    if (consecutiveDays > 7) {
      // 连续参与奖励
      factor += Math.min(0.1, consecutiveDays * 0.01)
    }

    return Math.max(-0.3, Math.min(0.3, factor))
  }

  /**
   * 计算系统平衡调整因子
   */
  async calculateSystemBalanceFactor (systemStats, _campaignId) {
    let factor = 0

    // 奖池消耗率分析
    const poolConsumptionRate = systemStats.pool_consumption_rate || 0.5
    if (poolConsumptionRate < 0.3) {
      // 奖池消耗过慢，提升概率
      factor += 0.15
    } else if (poolConsumptionRate > 0.8) {
      // 奖池消耗过快，降低概率
      factor -= 0.2
    }

    // 参与人数分析
    const participationRate = systemStats.participation_rate || 0.5
    if (participationRate < 0.4) {
      // 参与率低，提升吸引力
      factor += 0.1
    }

    // 系统收益分析
    const profitMargin = systemStats.profit_margin || 0.3
    if (profitMargin < 0.2) {
      // 收益过低，适度降低概率
      factor -= 0.1
    } else if (profitMargin > 0.5) {
      // 收益过高，提升用户体验
      factor += 0.1
    }

    return Math.max(-0.25, Math.min(0.25, factor))
  }

  /**
   * 计算时间模式调整因子
   */
  calculateTimePatternFactor (timePattern) {
    let factor = 0
    const currentHour = new Date().getHours()

    // 高峰时段概率调整
    const peakHours = [12, 13, 18, 19, 20, 21] // 午餐和晚餐时段
    if (peakHours.includes(currentHour)) {
      factor += 0.05 // 高峰时段略微提升
    }

    // 工作日/周末差异
    const isWeekend = [0, 6].includes(new Date().getDay())
    if (isWeekend) {
      factor += 0.08 // 周末提升用户体验
    }

    // 节假日特殊处理
    if (timePattern.isHoliday) {
      factor += 0.1 // 节假日期间提升概率
    }

    // 夜间时段处理
    if (currentHour >= 22 || currentHour <= 6) {
      factor += 0.03 // 夜间用户给予小幅奖励
    }

    return Math.max(-0.15, Math.min(0.15, factor))
  }

  /**
   * 计算市场需求调整因子
   */
  async calculateMarketDemandFactor (campaignId) {
    try {
      // 最近24小时参与数据
      const recentParticipation = await this.models.LotteryDraw.count({
        where: {
          campaign_id: campaignId,
          created_at: {
            [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      })

      // 历史平均参与数据
      const avgParticipation = await this.models.LotteryDraw.count({
        where: {
          campaign_id: campaignId,
          created_at: {
            [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        }
      }) / 7

      let factor = 0
      if (recentParticipation < avgParticipation * 0.7) {
        // 参与度下降，提升吸引力
        factor += 0.1
      } else if (recentParticipation > avgParticipation * 1.3) {
        // 参与度过高，保持平衡
        factor -= 0.05
      }

      return Math.max(-0.1, Math.min(0.1, factor))
    } catch (error) {
      console.error('计算市场需求因子失败:', error)
      return 0
    }
  }

  /**
   * 生成受控随机因子
   */
  generateControlledRandomFactor () {
    // 使用正态分布生成随机因子，避免极端值
    const random1 = Math.random()
    const random2 = Math.random()

    // Box-Muller变换生成正态分布
    const normalRandom = Math.sqrt(-2 * Math.log(random1)) * Math.cos(2 * Math.PI * random2)

    // 标准化到[-0.05, 0.05]范围
    return Math.max(-0.05, Math.min(0.05, normalRandom * 0.02))
  }

  /**
   * 获取系统统计数据
   */
  async getSystemStatistics (campaignId) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      // 并行查询统计数据
      const [totalDraws, winningDraws, totalPoints, winningPoints] = await Promise.all([
        this.models.LotteryDraw.count({
          where: {
            campaign_id: campaignId,
            created_at: { [Op.gte]: thirtyDaysAgo }
          }
        }),
        this.models.LotteryDraw.count({
          where: {
            campaign_id: campaignId,
            won: true,
            created_at: { [Op.gte]: thirtyDaysAgo }
          }
        }),
        this.models.LotteryDraw.sum('points_cost', {
          where: {
            campaign_id: campaignId,
            created_at: { [Op.gte]: thirtyDaysAgo }
          }
        }),
        this.models.LotteryDraw.sum('points_cost', {
          where: {
            campaign_id: campaignId,
            won: true,
            created_at: { [Op.gte]: thirtyDaysAgo }
          }
        })
      ])

      return {
        pool_consumption_rate: totalDraws > 0 ? (winningDraws / totalDraws) : 0.5,
        participation_rate: totalDraws / (30 * 100), // 假设每日期望100次参与
        profit_margin: totalPoints > 0 ? ((totalPoints - (winningPoints || 0)) / totalPoints) : 0.3,
        total_participation: totalDraws,
        win_rate: totalDraws > 0 ? (winningDraws / totalDraws) : 0.1
      }
    } catch (error) {
      console.error('获取系统统计失败:', error)
      return {
        pool_consumption_rate: 0.5,
        participation_rate: 0.5,
        profit_margin: 0.3,
        total_participation: 0,
        win_rate: 0.1
      }
    }
  }

  /**
   * 获取时间模式数据
   */
  async getTimePatternData () {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const currentHour = now.getHours()

    // 检查是否为节假日（简单实现）
    const holidays = [
      '01-01', '02-14', '05-01', '10-01', '11-11', '12-25'
    ]
    const currentDate = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const isHoliday = holidays.includes(currentDate)

    return {
      dayOfWeek,
      currentHour,
      isWeekend: [0, 6].includes(dayOfWeek),
      isHoliday,
      isPeakHour: [12, 13, 18, 19, 20, 21].includes(currentHour),
      isNightTime: currentHour >= 22 || currentHour <= 6
    }
  }

  /**
   * 记录概率调整日志
   */
  async logProbabilityAdjustment (userId, campaignId, originalProb, adjustedProb, factors) {
    try {
      const redis = require('redis').createClient()
      await redis.connect()

      const logKey = `probability_log:${campaignId}:${new Date().toDateString()}`
      const logEntry = {
        userId,
        timestamp: new Date().toISOString(),
        originalProbability: originalProb,
        adjustedProbability: adjustedProb,
        adjustment: adjustedProb - originalProb,
        factors
      }

      await redis.lpush(logKey, JSON.stringify(logEntry))
      await redis.ltrim(logKey, 0, 999) // 保留最近1000条记录
      await redis.expire(logKey, 86400 * 7) // 7天过期

      await redis.disconnect()

      // 发送事件通知
      await this.eventBus.emit('probability_adjusted', {
        userId,
        campaignId,
        adjustment: adjustedProb - originalProb,
        factors
      })
    } catch (error) {
      console.error('记录概率调整日志失败:', error)
    }
  }

  /**
   * 获取概率调整历史
   */
  async getProbabilityAdjustmentHistory (campaignId, days = 7) {
    try {
      const redis = require('redis').createClient()
      await redis.connect()

      const history = []
      for (let i = 0; i < days; i++) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toDateString()
        const logKey = `probability_log:${campaignId}:${date}`
        const dayLogs = await redis.lrange(logKey, 0, -1)

        const parsedLogs = dayLogs.map(log => {
          try {
            return JSON.parse(log)
          } catch {
            return null
          }
        }).filter(Boolean)

        if (parsedLogs.length > 0) {
          history.push({
            date,
            logs: parsedLogs,
            avgAdjustment: parsedLogs.reduce((sum, log) => sum + log.adjustment, 0) / parsedLogs.length,
            totalAdjustments: parsedLogs.length
          })
        }
      }

      await redis.disconnect()
      return history
    } catch (error) {
      console.error('获取概率调整历史失败:', error)
      return []
    }
  }

  /**
   * 分析概率调整效果
   */
  async analyzeProbabilityEffectiveness (campaignId) {
    try {
      const history = await this.getProbabilityAdjustmentHistory(campaignId, 30)

      if (history.length === 0) {
        return { effectiveness: 'insufficient_data' }
      }

      // 计算整体效果指标
      const totalAdjustments = history.reduce((sum, day) => sum + day.totalAdjustments, 0)
      const avgDailyAdjustment = history.reduce((sum, day) => sum + day.avgAdjustment, 0) / history.length

      // 分析趋势
      const recentDays = history.slice(0, 7)
      const earlierDays = history.slice(7, 14)

      const recentAvg = recentDays.reduce((sum, day) => sum + day.avgAdjustment, 0) / recentDays.length
      const earlierAvg = earlierDays.reduce((sum, day) => sum + day.avgAdjustment, 0) / earlierDays.length

      const trend = recentAvg > earlierAvg ? 'increasing' : 'decreasing'

      return {
        effectiveness: 'active',
        totalAdjustments,
        avgDailyAdjustment,
        trend,
        recentAvg,
        earlierAvg,
        stabilityScore: Math.max(0, 1 - Math.abs(avgDailyAdjustment) * 10) // 调整幅度越小越稳定
      }
    } catch (error) {
      console.error('分析概率调整效果失败:', error)
      return { effectiveness: 'error', error: error.message }
    }
  }

  /**
   * 优化概率调整参数
   */
  async optimizeProbabilityParameters (campaignId) {
    try {
      const effectiveness = await this.analyzeProbabilityEffectiveness(campaignId)

      if (effectiveness.effectiveness !== 'active') {
        return { optimized: false, reason: 'insufficient_data' }
      }

      // 根据效果分析调整参数
      const currentConfig = { ...this.probabilityConfig }

      if (effectiveness.stabilityScore < 0.5) {
        // 系统不够稳定，降低敏感度
        this.probabilityConfig.sensitivity *= 0.9
        this.probabilityConfig.maxAdjustment *= 0.95
      } else if (effectiveness.stabilityScore > 0.8) {
        // 系统过于稳定，可以适度提升响应性
        this.probabilityConfig.sensitivity *= 1.05
        this.probabilityConfig.maxAdjustment *= 1.02
      }

      // 确保参数在合理范围内
      this.probabilityConfig.sensitivity = Math.max(0.05, Math.min(0.2, this.probabilityConfig.sensitivity))
      this.probabilityConfig.maxAdjustment = Math.max(0.2, Math.min(0.8, this.probabilityConfig.maxAdjustment))

      console.log(`概率参数已优化 - 敏感度: ${this.probabilityConfig.sensitivity}, 最大调整: ${this.probabilityConfig.maxAdjustment}`)

      return {
        optimized: true,
        oldConfig: currentConfig,
        newConfig: { ...this.probabilityConfig },
        stabilityScore: effectiveness.stabilityScore
      }
    } catch (error) {
      console.error('优化概率参数失败:', error)
      return { optimized: false, error: error.message }
    }
  }
}

module.exports = new DynamicProbabilityService()
