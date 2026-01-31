'use strict'

/**
 * @file 活动维度分析服务（Campaign Analysis Service）
 * @description 提供抽奖系统的活动维度分析功能
 *
 * 拆分自原 LotteryAnalyticsService.js
 * 包含活动复盘报告、策略效果分析、活动对比等功能
 *
 * 核心功能：
 * 1. generateCampaignReport() - 生成活动复盘报告
 * 2. getStrategyEffectiveness() - 获取策略效果分析
 *
 * 活动复盘报告内容：
 * - 活动基本信息（名称、时间、持续天数）
 * - 概览数据（抽奖次数、用户数、ROI等）
 * - 参与漏斗（浏览→抽奖→中奖）
 * - 时间分布（小时、日期）
 * - 奖品分析（档位分布、热门奖品）
 * - 用户分析（人均抽奖次数）
 * - 体验指标（连空、Pity触发）
 * - 历史对比
 *
 * 策略效果分析内容：
 * - BxPx矩阵命中分布
 * - 体验保护机制触发情况
 * - 档位降级分析
 * - 整体策略评分
 * - 优化建议
 *
 * @module services/lottery-analytics/CampaignAnalysisService
 * @version 1.0.0
 * @date 2026-01-31
 */

const { Op, fn, col, literal } = require('sequelize')
const logger = require('../../utils/logger').logger

/**
 * 活动维度分析服务
 * 提供活动复盘报告和策略效果分析功能
 *
 * @class CampaignAnalysisService
 */
class CampaignAnalysisService {
  /**
   * 构造函数
   * @param {Object} models - Sequelize模型集合
   */
  constructor(models) {
    this.models = models
    this.logger = logger
  }

  /**
   * 生成活动复盘报告
   *
   * P2 优先级需求：活动结束后的完整复盘报告
   *
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 复盘报告数据
   */
  async generateCampaignReport(campaignId) {
    this.logger.info('生成活动复盘报告', { campaign_id: campaignId })

    try {
      // 1. 获取活动信息
      const campaign = await this.models.LotteryCampaign.findByPk(campaignId)
      if (!campaign) {
        throw new Error('活动不存在')
      }

      const startTime = new Date(campaign.start_time)
      const endTime = campaign.end_time ? new Date(campaign.end_time) : new Date()
      const durationDays = Math.ceil((endTime - startTime) / (24 * 60 * 60 * 1000))

      // 2. 查询基础统计数据
      const whereClause = { campaign_id: campaignId }

      // 抽奖统计
      const drawStats = await this.models.LotteryDraw.findOne({
        attributes: [
          [fn('COUNT', col('draw_id')), 'total_draws'],
          [fn('COUNT', fn('DISTINCT', col('user_id'))), 'unique_users'],
          [fn('SUM', col('cost_points')), 'total_cost_points'],
          [
            fn('SUM', literal("CASE WHEN reward_tier IN ('high', 'mid', 'low') THEN 1 ELSE 0 END")),
            'total_wins'
          ]
        ],
        where: whereClause,
        raw: true
      })

      const totalDraws = parseInt(drawStats.total_draws || 0)
      const uniqueUsers = parseInt(drawStats.unique_users || 0)
      const totalCostPoints = parseFloat(drawStats.total_cost_points || 0)
      const totalWins = parseInt(drawStats.total_wins || 0)

      // 奖品成本统计
      const prizeStats = await this.models.LotteryDraw.findOne({
        attributes: [[fn('SUM', literal('COALESCE(prize.cost_points, 0)')), 'total_prize_value']],
        where: whereClause,
        include: [
          {
            model: this.models.LotteryPrize,
            as: 'prize',
            attributes: []
          }
        ],
        raw: true
      })

      const totalPrizeValue = parseFloat(prizeStats.total_prize_value || 0)
      const roi =
        totalCostPoints > 0 ? ((totalCostPoints - totalPrizeValue) / totalCostPoints) * 100 : 0

      // 复购用户统计
      const repeatUsers = await this.models.LotteryDraw.count({
        where: whereClause,
        group: ['user_id'],
        having: literal('COUNT(draw_id) > 1')
      })

      const repeatRate = uniqueUsers > 0 ? (repeatUsers.length / uniqueUsers) * 100 : 0

      // 3. 时间分布
      const hourlyDistribution = await this._getCampaignHourlyDistribution(campaignId)
      const dailyDistribution = await this._getCampaignDailyDistribution(campaignId)

      // 4. 奖品分析
      const tierDistribution = await this._getCampaignTierDistribution(campaignId)
      const topPrizes = await this._getCampaignTopPrizes(campaignId, 10)

      // 5. 用户分析
      const userAnalysis = await this._getCampaignUserAnalysis(campaignId)

      // 6. 体验指标
      const experienceMetrics = await this._getCampaignExperienceMetrics(campaignId)

      // 7. 历史对比
      const comparisonWithHistory = await this._getCampaignHistoryComparison(campaignId, {
        total_draws: totalDraws,
        unique_users: uniqueUsers,
        roi
      })

      // 组装报告
      return {
        campaign_info: {
          campaign_id: campaignId,
          campaign_name: campaign.campaign_name,
          period: {
            start_time: startTime.toISOString().replace('Z', '+08:00'),
            end_time: endTime.toISOString().replace('Z', '+08:00'),
            duration_days: durationDays
          }
        },
        overview: {
          total_draws: totalDraws,
          unique_users: uniqueUsers,
          total_cost_points: totalCostPoints,
          total_prize_value: totalPrizeValue,
          roi: parseFloat(roi.toFixed(1)),
          repeat_rate: parseFloat(repeatRate.toFixed(1))
        },
        participation_funnel: {
          actual_draws: totalDraws,
          winners: totalWins,
          conversion_rate: {
            draw_to_win:
              totalDraws > 0 ? parseFloat(((totalWins / totalDraws) * 100).toFixed(1)) : 0
          }
        },
        time_distribution: {
          hourly_draws: hourlyDistribution,
          daily_draws: dailyDistribution,
          peak_hour: hourlyDistribution.reduce((max, h) => (h.count > max.count ? h : max), {
            hour: 0,
            count: 0
          }).hour,
          peak_day:
            dailyDistribution.length > 0
              ? dailyDistribution.reduce((max, d) => (d.count > max.count ? d : max), {
                  date: '',
                  count: 0
                }).date
              : null
        },
        prize_analysis: {
          tier_distribution: tierDistribution,
          top_prizes: topPrizes
        },
        user_analysis: userAnalysis,
        experience_metrics: experienceMetrics,
        comparison_with_history: comparisonWithHistory,
        generated_at: new Date().toISOString().replace('Z', '+08:00')
      }
    } catch (error) {
      this.logger.error('生成活动复盘报告失败', {
        campaign_id: campaignId,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取策略效果分析
   *
   * P2 优先级需求：评估策略配置效果
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.campaign_id] - 活动ID
   * @param {string} [options.time_range='7d'] - 时间范围
   * @param {string} [options.strategy_type='all'] - 策略类型
   * @returns {Promise<Object>} 策略效果分析数据
   */
  async getStrategyEffectiveness(options = {}) {
    const { campaign_id, time_range = '7d', strategy_type = 'all' } = options
    this.logger.info('获取策略效果分析', { campaign_id, time_range, strategy_type })

    try {
      // 计算时间范围
      const timeRangeMs = { '7d': 604800000, '30d': 2592000000, '90d': 7776000000 }
      const startTime = new Date(Date.now() - (timeRangeMs[time_range] || 604800000))
      const endTime = new Date()

      const whereClause = { created_at: { [Op.gte]: startTime } }

      // 如果需要筛选活动，先获取该活动的 draw_ids
      let drawIds = null
      if (campaign_id) {
        const draws = await this.models.LotteryDraw.findAll({
          attributes: ['draw_id'],
          where: { campaign_id, created_at: { [Op.gte]: startTime } },
          raw: true
        })
        drawIds = draws.map(d => d.draw_id)
        if (drawIds.length > 0) {
          whereClause.draw_id = { [Op.in]: drawIds }
        } else {
          return this._emptyStrategyEffectivenessResult(startTime, endTime)
        }
      }

      // 1. BxPx 矩阵分析
      let bxpxMatrixAnalysis = null
      if (strategy_type === 'all' || strategy_type === 'bxpx') {
        bxpxMatrixAnalysis = await this._analyzeBxPxMatrix(whereClause)
      }

      // 2. 体验机制分析
      let experienceMechanismAnalysis = null
      if (strategy_type === 'all' || ['pity', 'anti_empty', 'luck_debt'].includes(strategy_type)) {
        experienceMechanismAnalysis = await this._analyzeExperienceMechanisms(whereClause)
      }

      // 3. 档位降级分析
      const tierDowngradeAnalysis = await this._analyzeTierDowngrade(whereClause)

      // 4. 计算整体策略评分
      const overallStrategyScore = this._calculateOverallStrategyScore(
        bxpxMatrixAnalysis,
        experienceMechanismAnalysis,
        tierDowngradeAnalysis
      )

      // 5. 生成优化建议
      const optimizationRecommendations = this._generateOptimizationRecommendations(
        bxpxMatrixAnalysis,
        experienceMechanismAnalysis,
        tierDowngradeAnalysis
      )

      return {
        analysis_period: {
          start: startTime.toISOString().replace('Z', '+08:00'),
          end: endTime.toISOString().replace('Z', '+08:00')
        },
        bxpx_matrix_analysis: bxpxMatrixAnalysis,
        experience_mechanism_analysis: experienceMechanismAnalysis,
        tier_downgrade_analysis: tierDowngradeAnalysis,
        overall_strategy_score: overallStrategyScore,
        optimization_recommendations: optimizationRecommendations
      }
    } catch (error) {
      this.logger.error('获取策略效果分析失败', { error: error.message })
      throw error
    }
  }

  // ========== 内部方法 ==========

  /**
   * 获取活动小时分布（内部方法）
   * @private
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Array>} 24小时分布数组
   */
  async _getCampaignHourlyDistribution(campaignId) {
    const results = await this.models.LotteryDraw.findAll({
      attributes: [
        [fn('HOUR', col('created_at')), 'hour'],
        [fn('COUNT', col('draw_id')), 'count']
      ],
      where: { campaign_id: campaignId },
      group: [fn('HOUR', col('created_at'))],
      order: [[fn('HOUR', col('created_at')), 'ASC']],
      raw: true
    })

    const distribution = []
    for (let h = 0; h < 24; h++) {
      const found = results.find(r => parseInt(r.hour) === h)
      distribution.push({ hour: h, count: found ? parseInt(found.count) : 0 })
    }
    return distribution
  }

  /**
   * 获取活动日分布（内部方法）
   * @private
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Array>} 日期分布数组
   */
  async _getCampaignDailyDistribution(campaignId) {
    const results = await this.models.LotteryDraw.findAll({
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('COUNT', col('draw_id')), 'count']
      ],
      where: { campaign_id: campaignId },
      group: [fn('DATE', col('created_at'))],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true
    })

    return results.map(r => ({ date: r.date, count: parseInt(r.count) }))
  }

  /**
   * 获取活动档位分布（内部方法）
   * @private
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 档位分布对象
   */
  async _getCampaignTierDistribution(campaignId) {
    const results = await this.models.LotteryDraw.findAll({
      attributes: ['reward_tier', [fn('COUNT', col('draw_id')), 'count']],
      where: { campaign_id: campaignId },
      group: ['reward_tier'],
      raw: true
    })

    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0)
    const distribution = {}

    results.forEach(r => {
      const tier = r.reward_tier || 'unknown'
      distribution[tier] = {
        count: parseInt(r.count),
        rate: total > 0 ? parseFloat(((parseInt(r.count) / total) * 100).toFixed(1)) : 0
      }
    })

    return distribution
  }

  /**
   * 获取活动热门奖品（内部方法）
   * @private
   * @param {number} campaignId - 活动ID
   * @param {number} limit - 返回数量限制
   * @returns {Promise<Array>} 热门奖品数组
   */
  async _getCampaignTopPrizes(campaignId, limit) {
    const results = await this.models.LotteryDraw.findAll({
      attributes: ['prize_id', [fn('COUNT', col('draw_id')), 'count']],
      where: { campaign_id: campaignId, prize_id: { [Op.ne]: null } },
      group: ['prize_id'],
      order: [[fn('COUNT', col('draw_id')), 'DESC']],
      limit,
      include: [
        {
          model: this.models.LotteryPrize,
          as: 'prize',
          attributes: ['prize_name', 'cost_points']
        }
      ],
      raw: false
    })

    return results.map(r => ({
      prize_name: r.prize?.prize_name || '未知奖品',
      count: parseInt(r.dataValues.count),
      value: r.prize?.cost_points || 0
    }))
  }

  /**
   * 获取活动用户分析（内部方法）
   * @private
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 用户分析数据
   */
  async _getCampaignUserAnalysis(campaignId) {
    const avgStats = await this.models.LotteryDraw.findOne({
      attributes: [
        [fn('COUNT', col('draw_id')), 'total_draws'],
        [fn('COUNT', fn('DISTINCT', col('user_id'))), 'unique_users']
      ],
      where: { campaign_id: campaignId },
      raw: true
    })

    const avgDrawsPerUser =
      parseInt(avgStats.unique_users) > 0
        ? parseFloat((parseInt(avgStats.total_draws) / parseInt(avgStats.unique_users)).toFixed(1))
        : 0

    const maxDrawUser = await this.models.LotteryDraw.findOne({
      attributes: ['user_id', [fn('COUNT', col('draw_id')), 'count']],
      where: { campaign_id: campaignId },
      group: ['user_id'],
      order: [[fn('COUNT', col('draw_id')), 'DESC']],
      raw: true
    })

    return {
      avg_draws_per_user: avgDrawsPerUser,
      max_draws_user: maxDrawUser
        ? {
            user_id: maxDrawUser.user_id,
            count: parseInt(maxDrawUser.count)
          }
        : null
    }
  }

  /**
   * 获取活动体验指标（内部方法）
   * @private
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 体验指标数据
   */
  async _getCampaignExperienceMetrics(campaignId) {
    const states = await this.models.LotteryUserExperienceState.findAll({
      where: { campaign_id: campaignId },
      attributes: ['empty_streak', 'pity_trigger_count', 'total_empty_count', 'max_empty_streak']
    })

    if (states.length === 0) {
      return {
        avg_empty_streak: 0,
        pity_trigger_count: 0,
        total_empty_count: 0,
        max_empty_streak: 0
      }
    }

    const avgEmptyStreak = states.reduce((sum, s) => sum + (s.empty_streak || 0), 0) / states.length
    const pityTriggerCount = states.reduce((sum, s) => sum + (s.pity_trigger_count || 0), 0)
    const totalEmptyCount = states.reduce((sum, s) => sum + (s.total_empty_count || 0), 0)
    const maxEmptyStreak = Math.max(...states.map(s => s.max_empty_streak || 0), 0)

    return {
      avg_empty_streak: parseFloat(avgEmptyStreak.toFixed(1)),
      pity_trigger_count: pityTriggerCount,
      total_empty_count: totalEmptyCount,
      max_empty_streak: maxEmptyStreak
    }
  }

  /**
   * 获取活动历史对比（内部方法）
   * @private
   * @param {number} campaignId - 当前活动ID
   * @param {Object} currentStats - 当前活动统计数据
   * @returns {Promise<Object>} 历史对比数据
   */
  async _getCampaignHistoryComparison(campaignId, currentStats) {
    const previousCampaign = await this.models.LotteryCampaign.findOne({
      where: { campaign_id: { [Op.lt]: campaignId } },
      order: [['campaign_id', 'DESC']]
    })

    if (!previousCampaign) {
      return { vs_last_campaign: null }
    }

    const prevStats = await this.models.LotteryDraw.findOne({
      attributes: [
        [fn('COUNT', col('draw_id')), 'total_draws'],
        [fn('COUNT', fn('DISTINCT', col('user_id'))), 'unique_users']
      ],
      where: { campaign_id: previousCampaign.campaign_id },
      raw: true
    })

    const prevDraws = parseInt(prevStats.total_draws || 0)
    const prevUsers = parseInt(prevStats.unique_users || 0)

    return {
      vs_last_campaign: {
        draws_change:
          prevDraws > 0
            ? parseFloat((((currentStats.total_draws - prevDraws) / prevDraws) * 100).toFixed(1))
            : null,
        users_change:
          prevUsers > 0
            ? parseFloat((((currentStats.unique_users - prevUsers) / prevUsers) * 100).toFixed(1))
            : null
      }
    }
  }

  /**
   * 返回空的策略效果分析结果（内部方法）
   * @private
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   * @returns {Object} 空的策略分析结果
   */
  _emptyStrategyEffectivenessResult(startTime, endTime) {
    return {
      analysis_period: {
        start: startTime.toISOString().replace('Z', '+08:00'),
        end: endTime.toISOString().replace('Z', '+08:00')
      },
      bxpx_matrix_analysis: { hit_distribution: {}, effectiveness_score: 0 },
      experience_mechanism_analysis: null,
      tier_downgrade_analysis: { downgrade_count: 0, downgrade_rate: 0 },
      overall_strategy_score: 0,
      optimization_recommendations: ['没有足够的数据进行分析']
    }
  }

  /**
   * 分析BxPx矩阵命中分布（内部方法）
   * @private
   * @param {Object} whereClause - Sequelize查询条件
   * @returns {Promise<Object>} BxPx矩阵分析结果
   */
  async _analyzeBxPxMatrix(whereClause) {
    const decisions = await this.models.LotteryDrawDecision.findAll({
      attributes: ['budget_tier', 'pressure_tier', [fn('COUNT', col('decision_id')), 'count']],
      where: whereClause,
      group: ['budget_tier', 'pressure_tier'],
      raw: true
    })

    const total = decisions.reduce((sum, d) => sum + parseInt(d.count), 0)
    const hitDistribution = {}

    decisions.forEach(d => {
      const key = `${d.budget_tier || 'B0'}_${d.pressure_tier || 'P0'}`
      hitDistribution[key] = {
        count: parseInt(d.count),
        rate: total > 0 ? parseFloat(((parseInt(d.count) / total) * 100).toFixed(1)) : 0
      }
    })

    const keysCount = Object.keys(hitDistribution).length || 1
    const expectedRate = 100 / keysCount
    const variance =
      Object.values(hitDistribution).reduce((sum, v) => {
        return sum + Math.pow(v.rate - expectedRate, 2)
      }, 0) / keysCount

    const effectivenessScore = Math.max(0, Math.min(100, 100 - variance))

    return {
      hit_distribution: hitDistribution,
      effectiveness_score: Math.round(effectivenessScore),
      suggestions: effectivenessScore < 70 ? ['BxPx矩阵配置可能需要调整，部分格子命中率不均衡'] : []
    }
  }

  /**
   * 分析体验保护机制效果（内部方法）
   * @private
   * @param {Object} whereClause - Sequelize查询条件
   * @returns {Promise<Object>} 体验机制分析结果
   */
  async _analyzeExperienceMechanisms(whereClause) {
    const pityStats = await this.models.LotteryDrawDecision.findOne({
      attributes: [
        [
          fn(
            'COUNT',
            literal("CASE WHEN JSON_EXTRACT(pity_decision, '$.triggered') = true THEN 1 END")
          ),
          'trigger_count'
        ],
        [fn('COUNT', col('decision_id')), 'total']
      ],
      where: whereClause,
      raw: true
    })

    const pityTriggerCount = parseInt(pityStats?.trigger_count || 0)
    const total = parseInt(pityStats?.total || 1)
    const pityTriggerRate = (pityTriggerCount / total) * 100

    const experienceStats = await this.models.LotteryUserExperienceState.findOne({
      attributes: [
        [fn('SUM', col('pity_trigger_count')), 'total_pity'],
        [fn('SUM', col('total_empty_count')), 'total_empty'],
        [fn('AVG', col('empty_streak')), 'avg_empty_streak'],
        [fn('MAX', col('max_empty_streak')), 'max_empty_streak']
      ],
      raw: true
    })

    return {
      pity_mechanism: {
        trigger_count: pityTriggerCount,
        trigger_rate: parseFloat(pityTriggerRate.toFixed(1)),
        effectiveness: pityTriggerRate > 1 && pityTriggerRate < 10 ? '触发频率适中' : '需要调整'
      },
      anti_empty_mechanism: {
        total_empty_count: parseInt(experienceStats?.total_empty || 0),
        max_empty_streak: parseInt(experienceStats?.max_empty_streak || 0),
        effectiveness: '正常运行'
      },
      luck_debt_mechanism: {
        avg_empty_streak: parseFloat(experienceStats?.avg_empty_streak || 0).toFixed(1),
        effectiveness: '正常运行'
      }
    }
  }

  /**
   * 分析档位降级情况（内部方法）
   * @private
   * @param {Object} whereClause - Sequelize查询条件
   * @returns {Promise<Object>} 档位降级分析结果
   */
  async _analyzeTierDowngrade(whereClause) {
    const downgradeStats = await this.models.LotteryDrawDecision.findOne({
      attributes: [
        [fn('SUM', col('downgrade_count')), 'total_downgrades'],
        [fn('COUNT', col('decision_id')), 'total'],
        [
          fn('SUM', literal('CASE WHEN fallback_triggered = true THEN 1 ELSE 0 END')),
          'fallback_count'
        ]
      ],
      where: whereClause,
      raw: true
    })

    const totalDowngrades = parseInt(downgradeStats?.total_downgrades || 0)
    const total = parseInt(downgradeStats?.total || 1)
    const fallbackCount = parseInt(downgradeStats?.fallback_count || 0)
    const downgradeRate = (totalDowngrades / total) * 100

    return {
      total_downgrades: totalDowngrades,
      downgrade_rate: parseFloat(downgradeRate.toFixed(1)),
      fallback_count: fallbackCount,
      main_cause: downgradeRate > 10 ? 'stock_insufficient' : 'normal',
      suggestions: downgradeRate > 10 ? ['降级率偏高，建议检查库存配置'] : []
    }
  }

  /**
   * 计算整体策略效果评分（内部方法）
   * @private
   * @param {Object} bxpx - BxPx矩阵分析结果
   * @param {Object} experience - 体验机制分析结果
   * @param {Object} downgrade - 档位降级分析结果
   * @returns {number} 整体策略评分（0-100）
   */
  _calculateOverallStrategyScore(bxpx, experience, downgrade) {
    let score = 70

    if (bxpx) {
      score += (bxpx.effectiveness_score - 50) * 0.2
    }

    if (experience) {
      const pityRate = experience.pity_mechanism?.trigger_rate || 0
      if (pityRate > 1 && pityRate < 10) score += 10
    }

    if (downgrade) {
      if (downgrade.downgrade_rate < 5) score += 10
      else if (downgrade.downgrade_rate > 20) score -= 10
    }

    return Math.max(0, Math.min(100, Math.round(score)))
  }

  /**
   * 生成策略优化建议（内部方法）
   * @private
   * @param {Object} bxpx - BxPx矩阵分析结果
   * @param {Object} experience - 体验机制分析结果
   * @param {Object} downgrade - 档位降级分析结果
   * @returns {Array<Object>} 优化建议列表
   */
  _generateOptimizationRecommendations(bxpx, experience, downgrade) {
    const recommendations = []

    if (bxpx && bxpx.effectiveness_score < 70) {
      recommendations.push({
        priority: 'medium',
        area: 'BxPx矩阵',
        recommendation: 'BxPx格子命中分布不均，建议调整概率系数'
      })
    }

    if (downgrade && downgrade.downgrade_rate > 10) {
      recommendations.push({
        priority: 'high',
        area: '库存管理',
        recommendation: `档位降级率${downgrade.downgrade_rate}%偏高，建议补充库存`
      })
    }

    if (experience?.pity_mechanism?.trigger_rate > 10) {
      recommendations.push({
        priority: 'medium',
        area: '体验机制',
        recommendation: 'Pity触发率偏高，建议检查连空阈值配置'
      })
    }

    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'low',
        area: '整体',
        recommendation: '当前策略配置效果良好，建议持续监控'
      })
    }

    return recommendations
  }
}

module.exports = CampaignAnalysisService
