'use strict'

/**
 * @file 抽奖健康度计算服务（Lottery Health Service）
 * @description 提供抽奖活动的健康度评估功能，用于运营监控和风险预警
 *
 * P1 阶段任务 B-14：抽奖健康度计算服务
 *
 * 业务场景：
 * - 运营人员查看活动整体健康状态
 * - 识别活动运营中的潜在问题
 * - 获取改进建议和优化方向
 *
 * 核心功能：
 * 1. calculateHealthScore() - 计算活动健康度评分
 * 2. diagnoseIssues() - 诊断活动问题
 * 3. generateSuggestions() - 生成优化建议
 * 4. getHealthReport() - 获取完整健康报告
 *
 * 健康度评分维度（满分100分）：
 * - 预算健康度（30分）：预算消耗速率、剩余预算比例
 * - 中奖率健康度（25分）：实际vs配置中奖率偏差
 * - 库存健康度（20分）：各档位奖品库存情况
 * - 用户参与度（15分）：日均参与人数、人均抽奖次数
 * - 体验健康度（10分）：连续空奖率、Pity机制触发率
 *
 * 依赖服务：
 * - CampaignAnalysisService：活动档位分布分析
 * - LotteryAlertService：预算告警和中奖率监控
 * - UserAnalysisService：用户参与度分析
 *
 * @module services/lottery/LotteryHealthService
 * @version 1.0.0
 * @date 2026-01-31
 */

const logger = require('../../utils/logger').logger
const BeijingTimeHelper = require('../../utils/timeHelper')
const { Op, fn, col, literal } = require('sequelize')

/**
 * 健康度评分阈值配置
 * 用于定义各维度的健康/警告/危险阈值
 */
const HEALTH_THRESHOLDS = {
  // 预算维度
  budget: {
    healthy: 0.7, // 剩余预算 > 70% 为健康
    warning: 0.3, // 剩余预算 > 30% 为警告
    danger: 0.1 // 剩余预算 < 10% 为危险
  },
  // 中奖率偏差维度
  win_rate_deviation: {
    healthy: 0.1, // 偏差 < 10% 为健康
    warning: 0.2, // 偏差 < 20% 为警告
    danger: 0.3 // 偏差 > 30% 为危险
  },
  // 库存维度
  inventory: {
    healthy: 50, // 库存 > 50 为健康
    warning: 20, // 库存 > 20 为警告
    danger: 10 // 库存 < 10 为危险
  },
  // 连续空奖用户比例
  empty_streak_ratio: {
    healthy: 0.02, // < 2% 用户连续空奖 > 10次 为健康
    warning: 0.05, // < 5% 为警告
    danger: 0.1 // > 10% 为危险
  }
}

/**
 * 抽奖健康度计算服务
 * 提供活动健康度评估、问题诊断、优化建议功能
 *
 * @class LotteryHealthService
 */
class LotteryHealthService {
  /**
   * 构造函数
   * @param {Object} models - Sequelize 模型集合
   * @param {Object} [options] - 可选配置
   * @param {Object} [options.cacheHelper] - 缓存助手实例（BusinessCacheHelper）
   */
  constructor(models, options = {}) {
    this.models = models
    this.logger = logger
    this.cacheHelper = options.cacheHelper || null

    // 依赖服务（延迟加载）
    this._campaignAnalysisService = null
    this._lotteryAlertService = null
    this._userAnalysisService = null
  }

  /**
   * 获取 CampaignAnalysisService 实例（延迟加载）
   * @returns {Object} CampaignAnalysisService 实例
   */
  get campaignAnalysisService() {
    if (!this._campaignAnalysisService) {
      const { CampaignAnalysisService } = require('../lottery-analytics')
      this._campaignAnalysisService = new CampaignAnalysisService(this.models)
    }
    return this._campaignAnalysisService
  }

  /**
   * 获取 LotteryAlertService 实例（延迟加载）
   * @returns {Object} LotteryAlertService 静态方法对象
   */
  get lotteryAlertService() {
    if (!this._lotteryAlertService) {
      this._lotteryAlertService = require('../LotteryAlertService')
    }
    return this._lotteryAlertService
  }

  /**
   * 获取 UserAnalysisService 实例（延迟加载）
   * @returns {Object} UserAnalysisService 实例
   */
  get userAnalysisService() {
    if (!this._userAnalysisService) {
      const { UserAnalysisService } = require('../lottery-analytics')
      this._userAnalysisService = new UserAnalysisService(this.models)
    }
    return this._userAnalysisService
  }

  /**
   * 获取活动完整健康报告
   *
   * P1 需求 B-14/B-15：抽奖健康度计算服务核心方法
   *
   * @param {number} campaignId - 活动ID
   * @param {Object} [options] - 可选参数
   * @param {boolean} [options.use_cache=true] - 是否使用缓存
   * @param {number} [options.cache_ttl=300] - 缓存TTL（秒）
   * @returns {Promise<Object>} 健康报告对象
   *
   * @example
   * const report = await healthService.getHealthReport(123)
   * // 返回：
   * // {
   * //   lottery_campaign_id: 123,
   * //   campaign_name: '双12抽奖活动',
   * //   overall_score: 85,
   * //   health_level: 'healthy',
   * //   dimensions: {...},
   * //   issues: [...],
   * //   suggestions: [...],
   * //   generated_at: '2026-01-31T12:00:00+08:00'
   * // }
   */
  async getHealthReport(campaignId, options = {}) {
    const { use_cache = true, cache_ttl = 300 } = options

    this.logger.info('获取活动健康报告', { lottery_campaign_id: campaignId })

    // 尝试从缓存获取
    const cacheKey = `lottery:health:${campaignId}`
    if (use_cache && this.cacheHelper) {
      try {
        const cached = await this.cacheHelper.get(cacheKey)
        if (cached) {
          this.logger.debug('健康报告命中缓存', { lottery_campaign_id: campaignId })
          return JSON.parse(cached)
        }
      } catch (error) {
        this.logger.warn('读取健康报告缓存失败', { error: error.message })
      }
    }

    try {
      // 1. 获取活动基本信息
      const campaign = await this.models.LotteryCampaign.findByPk(campaignId)
      if (!campaign) {
        throw new Error('活动不存在')
      }

      // 2. 并行获取各维度数据
      const [budgetHealth, winRateHealth, inventoryHealth, participationHealth, experienceHealth] =
        await Promise.all([
          this._calculateBudgetHealth(campaignId, campaign),
          this._calculateWinRateHealth(campaignId, campaign),
          this._calculateInventoryHealth(campaignId),
          this._calculateParticipationHealth(campaignId, campaign),
          this._calculateExperienceHealth(campaignId)
        ])

      // 3. 计算综合评分
      const overallScore = this._calculateOverallScore({
        budget: budgetHealth,
        win_rate: winRateHealth,
        inventory: inventoryHealth,
        participation: participationHealth,
        experience: experienceHealth
      })

      // 4. 诊断问题
      const issues = this._diagnoseIssues({
        budget: budgetHealth,
        win_rate: winRateHealth,
        inventory: inventoryHealth,
        participation: participationHealth,
        experience: experienceHealth
      })

      // 5. 生成建议
      const suggestions = this._generateSuggestions(issues)

      // 6. 组装报告
      const report = {
        lottery_campaign_id: campaignId,
        campaign_name: campaign.campaign_name,
        campaign_status: campaign.status,
        overall_score: overallScore,
        health_level: this._getHealthLevel(overallScore),
        dimensions: {
          budget: budgetHealth,
          win_rate: winRateHealth,
          inventory: inventoryHealth,
          participation: participationHealth,
          experience: experienceHealth
        },
        issues,
        suggestions,
        generated_at: BeijingTimeHelper.now()
      }

      // 7. 写入缓存
      if (use_cache && this.cacheHelper) {
        try {
          await this.cacheHelper.set(cacheKey, JSON.stringify(report), cache_ttl)
          this.logger.debug('健康报告已缓存', { lottery_campaign_id: campaignId, ttl: cache_ttl })
        } catch (error) {
          this.logger.warn('写入健康报告缓存失败', { error: error.message })
        }
      }

      this.logger.info('活动健康报告生成完成', {
        lottery_campaign_id: campaignId,
        overall_score: overallScore,
        health_level: report.health_level,
        issue_count: issues.length
      })

      return report
    } catch (error) {
      this.logger.error('生成活动健康报告失败', {
        lottery_campaign_id: campaignId,
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 计算预算健康度
   *
   * P1 需求 B-18：预算消耗速度（复用现有告警服务数据）
   *
   * @param {number} campaignId - 活动ID
   * @param {Object} campaign - 活动实例
   * @returns {Promise<Object>} 预算健康度数据
   */
  async _calculateBudgetHealth(campaignId, campaign) {
    try {
      // 获取预算消耗情况
      const totalBudget = parseFloat(campaign.total_budget || 0)
      const usedBudget = parseFloat(campaign.used_budget || 0)
      const remainingBudget = totalBudget - usedBudget
      const usageRatio = totalBudget > 0 ? usedBudget / totalBudget : 0
      const remainingRatio = 1 - usageRatio

      // 计算消耗速率（基于活动运行天数）
      const startTime = new Date(campaign.start_time)
      const now = new Date()
      const runningDays = Math.max(1, Math.ceil((now - startTime) / (24 * 60 * 60 * 1000)))
      const dailyConsumption = usedBudget / runningDays

      // 预计剩余天数
      const estimatedRemainingDays =
        dailyConsumption > 0 ? remainingBudget / dailyConsumption : Infinity

      // 评分计算（满分30分）
      let score = 30
      if (remainingRatio < HEALTH_THRESHOLDS.budget.danger) {
        score = 5 // 危险
      } else if (remainingRatio < HEALTH_THRESHOLDS.budget.warning) {
        score = 15 // 警告
      } else if (remainingRatio < HEALTH_THRESHOLDS.budget.healthy) {
        score = 22 // 一般
      }

      return {
        score,
        max_score: 30,
        level: this._getLevelByRatio(remainingRatio, HEALTH_THRESHOLDS.budget),
        details: {
          total_budget: totalBudget,
          used_budget: usedBudget,
          remaining_budget: remainingBudget,
          usage_ratio: Math.round(usageRatio * 100) / 100,
          remaining_ratio: Math.round(remainingRatio * 100) / 100,
          running_days: runningDays,
          daily_consumption: Math.round(dailyConsumption * 100) / 100,
          estimated_remaining_days:
            estimatedRemainingDays === Infinity ? '无限' : Math.round(estimatedRemainingDays)
        }
      }
    } catch (error) {
      this.logger.error('计算预算健康度失败', {
        lottery_campaign_id: campaignId,
        error: error.message
      })
      return { score: 0, max_score: 30, level: 'unknown', details: null, error: error.message }
    }
  }

  /**
   * 计算中奖率健康度
   *
   * P1 需求 B-16：档位分布（复用 CampaignAnalysisService）
   *
   * @param {number} campaignId - 活动ID
   * @param {Object} campaign - 活动实例
   * @returns {Promise<Object>} 中奖率健康度数据
   */
  async _calculateWinRateHealth(campaignId, campaign) {
    try {
      // 获取实际中奖率统计
      const drawStats = await this.models.LotteryDraw.findOne({
        attributes: [
          [fn('COUNT', col('lottery_draw_id')), 'total_draws'],
          [
            fn('SUM', literal("CASE WHEN reward_tier IN ('high', 'mid', 'low') THEN 1 ELSE 0 END")),
            'total_wins'
          ]
        ],
        where: { lottery_campaign_id: campaignId },
        raw: true
      })

      const totalDraws = parseInt(drawStats?.total_draws || 0)
      const totalWins = parseInt(drawStats?.total_wins || 0)
      const actualWinRate = totalDraws > 0 ? totalWins / totalDraws : 0

      // 获取配置的中奖率（从活动配置或策略）
      const configuredWinRate = parseFloat(campaign.target_win_rate || 0.3) // 默认30%

      // 计算偏差率
      const deviation =
        configuredWinRate > 0 ? Math.abs(actualWinRate - configuredWinRate) / configuredWinRate : 0

      // 获取档位分布
      const tierDistribution = await this._getTierDistribution(campaignId)

      // 评分计算（满分25分）
      let score = 25
      if (deviation > HEALTH_THRESHOLDS.win_rate_deviation.danger) {
        score = 5
      } else if (deviation > HEALTH_THRESHOLDS.win_rate_deviation.warning) {
        score = 12
      } else if (deviation > HEALTH_THRESHOLDS.win_rate_deviation.healthy) {
        score = 18
      }

      return {
        score,
        max_score: 25,
        level: this._getLevelByThreshold(deviation, HEALTH_THRESHOLDS.win_rate_deviation, true),
        details: {
          total_draws: totalDraws,
          total_wins: totalWins,
          actual_win_rate: Math.round(actualWinRate * 10000) / 100, // 百分比
          configured_win_rate: Math.round(configuredWinRate * 100), // 百分比
          deviation_rate: Math.round(deviation * 10000) / 100, // 百分比
          tier_distribution: tierDistribution
        }
      }
    } catch (error) {
      this.logger.error('计算中奖率健康度失败', {
        lottery_campaign_id: campaignId,
        error: error.message
      })
      return { score: 0, max_score: 25, level: 'unknown', details: null, error: error.message }
    }
  }

  /**
   * 获取档位分布统计
   *
   * P1 需求 B-16：档位分布
   *
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 各档位抽奖次数和占比
   */
  async _getTierDistribution(campaignId) {
    const distribution = await this.models.LotteryDraw.findAll({
      attributes: ['reward_tier', [fn('COUNT', col('lottery_draw_id')), 'count']],
      where: { lottery_campaign_id: campaignId },
      group: ['reward_tier'],
      raw: true
    })

    const result = {
      high: 0,
      mid: 0,
      low: 0,
      empty: 0,
      total: 0
    }

    distribution.forEach(item => {
      const tier = item.reward_tier || 'empty'
      const count = parseInt(item.count || 0)
      if (Object.prototype.hasOwnProperty.call(result, tier)) {
        result[tier] = count
      } else {
        result.empty += count
      }
      result.total += count
    })

    // 计算百分比
    const percentages = {}
    for (const tier of ['high', 'mid', 'low', 'empty']) {
      percentages[tier] =
        result.total > 0 ? Math.round((result[tier] / result.total) * 10000) / 100 : 0
    }

    return {
      counts: result,
      percentages
    }
  }

  /**
   * 计算库存健康度
   *
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 库存健康度数据
   */
  async _calculateInventoryHealth(campaignId) {
    try {
      /*
       * 获取活动关联的奖品库存
       * 注意：数据库字段为 reward_tier、stock_quantity、total_win_count、status
       * status 字段使用枚举值 'active'/'inactive'
       */
      const prizes = await this.models.LotteryPrize.findAll({
        where: { lottery_campaign_id: campaignId, status: 'active' },
        attributes: [
          'lottery_prize_id',
          'prize_name',
          'reward_tier',
          'stock_quantity',
          'total_win_count'
        ],
        raw: true
      })

      if (prizes.length === 0) {
        return {
          score: 20,
          max_score: 20,
          level: 'healthy',
          details: { message: '无奖品配置或活动使用无限库存' }
        }
      }

      // 统计库存情况
      let lowStockCount = 0
      let dangerStockCount = 0
      const lowStockPrizes = []

      for (const prize of prizes) {
        // 使用实际数据库字段：stock_quantity（总库存）、total_win_count（已使用数量）
        const remainingStock = (prize.stock_quantity || 0) - (prize.total_win_count || 0)

        if (remainingStock < HEALTH_THRESHOLDS.inventory.danger) {
          dangerStockCount++
          lowStockPrizes.push({
            lottery_prize_id: prize.lottery_prize_id,
            prize_name: prize.prize_name,
            reward_tier: prize.reward_tier,
            remaining: remainingStock,
            level: 'danger'
          })
        } else if (remainingStock < HEALTH_THRESHOLDS.inventory.warning) {
          lowStockCount++
          lowStockPrizes.push({
            lottery_prize_id: prize.lottery_prize_id,
            prize_name: prize.prize_name,
            reward_tier: prize.reward_tier,
            remaining: remainingStock,
            level: 'warning'
          })
        }
      }

      // 评分计算（满分20分）
      let score = 20
      if (dangerStockCount > 0) {
        score = Math.max(0, 20 - dangerStockCount * 5)
      } else if (lowStockCount > 0) {
        score = Math.max(10, 20 - lowStockCount * 2)
      }

      const level = dangerStockCount > 0 ? 'danger' : lowStockCount > 0 ? 'warning' : 'healthy'

      return {
        score,
        max_score: 20,
        level,
        details: {
          total_prizes: prizes.length,
          low_stock_count: lowStockCount,
          danger_stock_count: dangerStockCount,
          low_stock_prizes: lowStockPrizes
        }
      }
    } catch (error) {
      this.logger.error('计算库存健康度失败', {
        lottery_campaign_id: campaignId,
        error: error.message
      })
      return { score: 0, max_score: 20, level: 'unknown', details: null, error: error.message }
    }
  }

  /**
   * 计算用户参与度健康度
   *
   * @param {number} campaignId - 活动ID
   * @param {Object} campaign - 活动实例
   * @returns {Promise<Object>} 用户参与度数据
   */
  async _calculateParticipationHealth(campaignId, campaign) {
    try {
      // 获取参与用户统计
      const stats = await this.models.LotteryDraw.findOne({
        attributes: [
          [fn('COUNT', col('lottery_draw_id')), 'total_draws'],
          [fn('COUNT', fn('DISTINCT', col('user_id'))), 'unique_users']
        ],
        where: { lottery_campaign_id: campaignId },
        raw: true
      })

      const totalDraws = parseInt(stats?.total_draws || 0)
      const uniqueUsers = parseInt(stats?.unique_users || 0)
      const avgDrawsPerUser = uniqueUsers > 0 ? totalDraws / uniqueUsers : 0

      // 计算活动天数
      const startTime = new Date(campaign.start_time)
      const now = new Date()
      const runningDays = Math.max(1, Math.ceil((now - startTime) / (24 * 60 * 60 * 1000)))
      const dailyActiveUsers = uniqueUsers / runningDays

      /*
       * 评分逻辑（满分15分）
       * 基于人均抽奖次数和日活评估
       */
      let score = 15
      if (uniqueUsers === 0) {
        score = 0
      } else if (avgDrawsPerUser < 1.5) {
        score = 8 // 参与度偏低
      } else if (avgDrawsPerUser < 2.5) {
        score = 12 // 参与度一般
      }

      return {
        score,
        max_score: 15,
        level: score >= 12 ? 'healthy' : score >= 8 ? 'warning' : 'danger',
        details: {
          total_draws: totalDraws,
          unique_users: uniqueUsers,
          avg_draws_per_user: Math.round(avgDrawsPerUser * 100) / 100,
          running_days: runningDays,
          daily_active_users: Math.round(dailyActiveUsers * 100) / 100
        }
      }
    } catch (error) {
      this.logger.error('计算参与度健康度失败', {
        lottery_campaign_id: campaignId,
        error: error.message
      })
      return { score: 0, max_score: 15, level: 'unknown', details: null, error: error.message }
    }
  }

  /**
   * 计算用户体验健康度
   *
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 体验健康度数据
   */
  async _calculateExperienceHealth(campaignId) {
    try {
      // 获取连续空奖用户统计
      const emptyStreakThreshold = 10

      // 获取用户体验状态（连续空奖 >= 10次的用户）
      const highEmptyStreakCount = await this.models.LotteryUserExperienceState.count({
        where: {
          lottery_campaign_id: campaignId,
          empty_streak: { [Op.gte]: emptyStreakThreshold }
        }
      })

      // 获取总参与用户数
      const totalUsers = await this.models.LotteryDraw.count({
        distinct: true,
        col: 'user_id',
        where: { lottery_campaign_id: campaignId }
      })

      const emptyStreakRatio = totalUsers > 0 ? highEmptyStreakCount / totalUsers : 0

      // 获取保底机制触发次数（数据库字段为 guarantee_triggered）
      const pityTriggerCount = await this.models.LotteryDraw.count({
        where: {
          lottery_campaign_id: campaignId,
          guarantee_triggered: true
        }
      })

      // 评分计算（满分10分）
      let score = 10
      if (emptyStreakRatio > HEALTH_THRESHOLDS.empty_streak_ratio.danger) {
        score = 2
      } else if (emptyStreakRatio > HEALTH_THRESHOLDS.empty_streak_ratio.warning) {
        score = 5
      } else if (emptyStreakRatio > HEALTH_THRESHOLDS.empty_streak_ratio.healthy) {
        score = 7
      }

      return {
        score,
        max_score: 10,
        level: this._getLevelByThreshold(
          emptyStreakRatio,
          HEALTH_THRESHOLDS.empty_streak_ratio,
          true
        ),
        details: {
          high_empty_streak_users: highEmptyStreakCount,
          total_users: totalUsers,
          empty_streak_ratio: Math.round(emptyStreakRatio * 10000) / 100,
          pity_trigger_count: pityTriggerCount
        }
      }
    } catch (error) {
      this.logger.error('计算体验健康度失败', {
        lottery_campaign_id: campaignId,
        error: error.message
      })
      return { score: 0, max_score: 10, level: 'unknown', details: null, error: error.message }
    }
  }

  /**
   * 计算综合评分
   *
   * @param {Object} dimensions - 各维度评分数据
   * @returns {number} 综合评分（0-100）
   */
  _calculateOverallScore(dimensions) {
    let totalScore = 0
    let totalMaxScore = 0

    for (const key in dimensions) {
      const dim = dimensions[key]
      totalScore += dim.score || 0
      totalMaxScore += dim.max_score || 0
    }

    // 归一化到100分
    return totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0
  }

  /**
   * 获取健康等级
   *
   * @param {number} score - 综合评分（0-100）
   * @returns {string} 健康等级：healthy/warning/danger
   */
  _getHealthLevel(score) {
    if (score >= 80) return 'healthy'
    if (score >= 60) return 'warning'
    return 'danger'
  }

  /**
   * 诊断问题
   *
   * P1 需求 B-17：问题诊断
   *
   * @param {Object} dimensions - 各维度评分数据
   * @returns {Array<Object>} 问题列表
   */
  _diagnoseIssues(dimensions) {
    const issues = []

    // 预算问题
    if (dimensions.budget.level === 'danger') {
      issues.push({
        type: 'budget',
        severity: 'danger',
        title: '预算即将耗尽',
        description: `剩余预算仅 ${dimensions.budget.details?.remaining_ratio * 100}%，预计 ${dimensions.budget.details?.estimated_remaining_days} 天后耗尽`,
        dimension: 'budget'
      })
    } else if (dimensions.budget.level === 'warning') {
      issues.push({
        type: 'budget',
        severity: 'warning',
        title: '预算消耗较快',
        description: `预算已消耗 ${(1 - dimensions.budget.details?.remaining_ratio) * 100}%`,
        dimension: 'budget'
      })
    }

    // 中奖率问题
    if (dimensions.win_rate.level === 'danger') {
      issues.push({
        type: 'win_rate',
        severity: 'danger',
        title: '中奖率严重偏离',
        description: `实际中奖率偏差达 ${dimensions.win_rate.details?.deviation_rate}%`,
        dimension: 'win_rate'
      })
    } else if (dimensions.win_rate.level === 'warning') {
      issues.push({
        type: 'win_rate',
        severity: 'warning',
        title: '中奖率有偏差',
        description: `实际中奖率 ${dimensions.win_rate.details?.actual_win_rate}%，配置值 ${dimensions.win_rate.details?.configured_win_rate}%`,
        dimension: 'win_rate'
      })
    }

    // 库存问题
    if (dimensions.inventory.level === 'danger') {
      const lowPrizes = dimensions.inventory.details?.low_stock_prizes || []
      issues.push({
        type: 'inventory',
        severity: 'danger',
        title: '奖品库存告急',
        description: `${lowPrizes.length} 个奖品库存不足`,
        dimension: 'inventory',
        affected_items: lowPrizes.map(p => p.prize_name)
      })
    } else if (dimensions.inventory.level === 'warning') {
      issues.push({
        type: 'inventory',
        severity: 'warning',
        title: '部分奖品库存偏低',
        description: `${dimensions.inventory.details?.low_stock_count} 个奖品库存偏低`,
        dimension: 'inventory'
      })
    }

    // 参与度问题
    if (dimensions.participation.level === 'danger') {
      issues.push({
        type: 'participation',
        severity: 'warning',
        title: '用户参与度不足',
        description: `人均抽奖仅 ${dimensions.participation.details?.avg_draws_per_user} 次`,
        dimension: 'participation'
      })
    }

    // 体验问题
    if (dimensions.experience.level === 'danger') {
      issues.push({
        type: 'experience',
        severity: 'warning',
        title: '用户体验欠佳',
        description: `${dimensions.experience.details?.empty_streak_ratio}% 用户连续空奖超过10次`,
        dimension: 'experience'
      })
    }

    return issues
  }

  /**
   * 生成优化建议
   *
   * @param {Array<Object>} issues - 问题列表
   * @returns {Array<Object>} 建议列表
   */
  _generateSuggestions(issues) {
    const suggestions = []
    const issueTypes = new Set(issues.map(i => i.type))

    if (issueTypes.has('budget')) {
      suggestions.push({
        type: 'budget',
        priority: 'high',
        title: '调整预算策略',
        content: '考虑增加预算额度，或降低高档奖品发放概率以延长活动持续时间'
      })
    }

    if (issueTypes.has('win_rate')) {
      suggestions.push({
        type: 'win_rate',
        priority: 'high',
        title: '调整中奖率配置',
        content: '检查各档位概率配置是否合理，确保实际中奖率与预期一致'
      })
    }

    if (issueTypes.has('inventory')) {
      suggestions.push({
        type: 'inventory',
        priority: 'medium',
        title: '补充奖品库存',
        content: '及时补充低库存奖品，或考虑替换为其他可用奖品'
      })
    }

    if (issueTypes.has('participation')) {
      suggestions.push({
        type: 'participation',
        priority: 'medium',
        title: '提升用户参与',
        content: '考虑增加抽奖引导、优化抽奖入口曝光，或增加免费抽奖配额'
      })
    }

    if (issueTypes.has('experience')) {
      suggestions.push({
        type: 'experience',
        priority: 'medium',
        title: '优化用户体验',
        content: '检查 Pity 机制配置，确保连续空奖用户能够获得保底奖励'
      })
    }

    // 如果没有问题，给出正向反馈
    if (suggestions.length === 0) {
      suggestions.push({
        type: 'positive',
        priority: 'low',
        title: '活动运行良好',
        content: '各项指标正常，建议保持现有配置继续运营'
      })
    }

    return suggestions
  }

  /**
   * 根据比例获取健康等级
   *
   * @param {number} ratio - 当前比例值
   * @param {Object} thresholds - 阈值配置（healthy/warning/danger）
   * @returns {string} 健康等级
   */
  _getLevelByRatio(ratio, thresholds) {
    if (ratio >= thresholds.healthy) return 'healthy'
    if (ratio >= thresholds.warning) return 'warning'
    return 'danger'
  }

  /**
   * 根据阈值获取健康等级（阈值越小越健康）
   *
   * @param {number} value - 当前值
   * @param {Object} thresholds - 阈值配置
   * @param {boolean} [inverse=false] - 是否反转（值越小越健康）
   * @returns {string} 健康等级
   */
  _getLevelByThreshold(value, thresholds, inverse = false) {
    if (inverse) {
      if (value <= thresholds.healthy) return 'healthy'
      if (value <= thresholds.warning) return 'warning'
      return 'danger'
    } else {
      if (value >= thresholds.healthy) return 'healthy'
      if (value >= thresholds.warning) return 'warning'
      return 'danger'
    }
  }
}

module.exports = LotteryHealthService
