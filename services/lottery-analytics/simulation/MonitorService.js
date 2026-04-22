'use strict'

const { TIER_ORDER } = require('./constants')

/**
 * SimulationMonitorService - 监控/熔断/预测
 *
 * 方法：getBudgetPacingForecast, createCircuitBreakerRules, checkCircuitBreakerStatus,
 *       calculateDrift, _loadActualDistribution, _loadActualDistributionSince
 */
class SimulationMonitorService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
  }

  /**
   * 获取预算消耗趋势和耗尽日期预测
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Object>} { daily_trend, avg_daily_consumption, remaining_budget, estimated_depletion_date, estimated_depletion_days }
   */
  async getBudgetPacingForecast(lottery_campaign_id) {
    const { LotteryCampaign } = this.models

    const campaign = await LotteryCampaign.findByPk(lottery_campaign_id)
    if (!campaign) {
      throw Object.assign(new Error(`活动不存在: lottery_campaign_id=${lottery_campaign_id}`), {
        statusCode: 404
      })
    }

    const [dailyTrend] = await this.models.sequelize.query(
      `
      SELECT 
        DATE(ld.created_at) as dt,
        SUM(d.budget_deducted) as daily_budget,
        COUNT(*) as daily_draws,
        SUM(ld.prize_value) as daily_prize_value
      FROM lottery_draw_decisions d
      JOIN lottery_draws ld ON d.lottery_draw_id = ld.lottery_draw_id
      WHERE ld.lottery_campaign_id = :campaignId
        AND ld.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(ld.created_at)
      ORDER BY dt ASC
    `,
      { replacements: { campaignId: lottery_campaign_id } }
    )

    const remainingBudget = parseFloat(campaign.remaining_prize_pool || 0)

    const recentDays = dailyTrend.slice(-7)
    let weightedSum = 0
    let weightTotal = 0
    recentDays.forEach((day, idx) => {
      const weight = idx + 1
      weightedSum += parseFloat(day.daily_budget || 0) * weight
      weightTotal += weight
    })
    const avgDailyConsumption =
      weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 100) / 100 : 0

    const avgDailyDraws =
      recentDays.length > 0
        ? Math.round(
            recentDays.reduce((s, d) => s + parseInt(d.daily_draws), 0) / recentDays.length
          )
        : 0

    let estimatedDepletionDays = null
    let estimatedDepletionDate = null
    if (avgDailyConsumption > 0) {
      estimatedDepletionDays = Math.ceil(remainingBudget / avgDailyConsumption)
      estimatedDepletionDate = new Date()
      estimatedDepletionDate.setDate(estimatedDepletionDate.getDate() + estimatedDepletionDays)
    }

    return {
      daily_trend: dailyTrend.map(d => ({
        date: d.dt,
        budget_consumed: parseFloat(d.daily_budget || 0),
        draws: parseInt(d.daily_draws || 0),
        prize_value: parseFloat(d.daily_prize_value || 0)
      })),
      avg_daily_consumption: avgDailyConsumption,
      avg_daily_draws: avgDailyDraws,
      remaining_budget: remainingBudget,
      estimated_depletion_days: estimatedDepletionDays,
      estimated_depletion_date: estimatedDepletionDate?.toISOString() || null
    }
  }

  /**
   * 一键应用时自动创建异常熔断监控规则
   *
   * @param {number} lottery_simulation_record_id - 模拟记录主键
   * @param {Object} options - { tolerance, transaction }
   * @returns {Promise<Object>} { rules_created }
   */
  async createCircuitBreakerRules(lottery_simulation_record_id, options = {}) {
    const { transaction, tolerance = 0.03 } = options
    const { LotterySimulationRecord, LotteryAlert } = this.models

    const record = await LotterySimulationRecord.findByPk(lottery_simulation_record_id, {
      transaction
    })
    if (!record || !record.simulation_result) {
      throw Object.assign(new Error('模拟记录不存在或无结果'), { statusCode: 404 })
    }

    const tierDist = record.simulation_result.tier_distribution
    const emptyRate = record.simulation_result.empty_rate
    const campaignId = record.lottery_campaign_id
    const rulesCreated = []

    const highRateExpected = (tierDist.high || 0) / 100
    await LotteryAlert.create(
      {
        lottery_campaign_id: campaignId,
        alert_type: 'simulation_bound',
        severity: 'warning',
        status: 'active',
        rule_code: `sim_bound_high_rate_${lottery_simulation_record_id}`,
        threshold_value: highRateExpected + tolerance,
        actual_value: highRateExpected,
        message: JSON.stringify({
          metric: 'high_rate',
          expected: highRateExpected,
          tolerance,
          upper_bound: highRateExpected + tolerance,
          lower_bound: Math.max(0, highRateExpected - tolerance),
          simulation_record_id: lottery_simulation_record_id
        })
      },
      { transaction }
    )
    rulesCreated.push({ metric: 'high_rate', expected: highRateExpected, tolerance })

    const emptyRateExpected = (emptyRate || 0) / 100
    const emptyTolerance = 0.05
    await LotteryAlert.create(
      {
        lottery_campaign_id: campaignId,
        alert_type: 'simulation_bound',
        severity: 'warning',
        status: 'active',
        rule_code: `sim_bound_empty_rate_${lottery_simulation_record_id}`,
        threshold_value: emptyRateExpected + emptyTolerance,
        actual_value: emptyRateExpected,
        message: JSON.stringify({
          metric: 'empty_rate',
          expected: emptyRateExpected,
          tolerance: emptyTolerance,
          upper_bound: emptyRateExpected + emptyTolerance,
          lower_bound: Math.max(0, emptyRateExpected - emptyTolerance),
          simulation_record_id: lottery_simulation_record_id
        })
      },
      { transaction }
    )
    rulesCreated.push({
      metric: 'empty_rate',
      expected: emptyRateExpected,
      tolerance: emptyTolerance
    })

    return { rules_created: rulesCreated, simulation_record_id: lottery_simulation_record_id }
  }

  /**
   * 检查当前实际指标是否超出模拟预测的容差范围
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Object>} { breaches, status }
   */
  async checkCircuitBreakerStatus(lottery_campaign_id) {
    const { LotteryAlert } = this.models

    const activeRules = await LotteryAlert.findAll({
      where: {
        lottery_campaign_id,
        alert_type: 'simulation_bound',
        status: 'active'
      }
    })

    if (activeRules.length === 0) {
      return { breaches: [], status: 'no_rules', monitoring: false }
    }

    const [recentStats] = await this.models.sequelize.query(
      `
      SELECT 
        d.final_tier,
        COUNT(*) as count
      FROM lottery_draw_decisions d
      JOIN lottery_draws ld ON d.lottery_draw_id = ld.lottery_draw_id
      WHERE ld.lottery_campaign_id = :campaignId
        AND ld.created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      GROUP BY d.final_tier
    `,
      { replacements: { campaignId: lottery_campaign_id } }
    )

    const totalRecent = recentStats.reduce((s, r) => s + parseInt(r.count), 0)
    if (totalRecent === 0) {
      return { breaches: [], status: 'no_recent_data', monitoring: true }
    }

    const actualRates = {}
    for (const row of recentStats) {
      actualRates[row.final_tier] = parseInt(row.count) / totalRecent
    }

    const breaches = []
    for (const rule of activeRules) {
      let ruleConfig
      try {
        ruleConfig = JSON.parse(rule.message)
      } catch {
        continue
      }

      const metric = ruleConfig.metric
      let actualValue = 0
      if (metric === 'high_rate') actualValue = actualRates.high || 0
      else if (metric === 'empty_rate') actualValue = actualRates.empty || 0
      else if (metric === 'fallback_rate') actualValue = actualRates.fallback || 0

      const upperBound = ruleConfig.upper_bound || 1
      const lowerBound = ruleConfig.lower_bound || 0

      if (actualValue > upperBound || actualValue < lowerBound) {
        breaches.push({
          metric,
          expected: ruleConfig.expected,
          actual: Math.round(actualValue * 10000) / 10000,
          upper_bound: upperBound,
          lower_bound: lowerBound,
          breach_type: actualValue > upperBound ? 'above' : 'below'
        })
      }
    }

    return {
      breaches,
      status: breaches.length > 0 ? 'breached' : 'normal',
      monitoring: true,
      recent_draws: totalRecent
    }
  }

  /**
   * 计算模拟预测与实际数据的偏差
   *
   * @param {number} lottery_simulation_record_id - 模拟记录ID
   * @returns {Promise<Object>} { predicted, actual, drift, drift_percentage, actual_draws_count, period }
   */
  async calculateDrift(lottery_simulation_record_id) {
    const { LotterySimulationRecord } = this.models

    const record = await LotterySimulationRecord.findByPk(lottery_simulation_record_id)
    if (!record) {
      throw Object.assign(new Error('模拟记录不存在'), { statusCode: 404 })
    }
    if (!record.simulation_result) {
      throw Object.assign(new Error('该模拟记录没有模拟结果'), { statusCode: 400 })
    }

    const predicted = record.simulation_result.tier_distribution
    const createdAt = record.getDataValue('created_at')

    const actualData = await this._loadActualDistributionSince(
      record.lottery_campaign_id,
      createdAt
    )

    if (actualData.total_draws === 0) {
      return {
        predicted,
        actual: null,
        drift: null,
        actual_draws_count: 0,
        period: `${createdAt} ~ 至今`
      }
    }

    const actual = actualData.tier_distribution
    const drift = {}
    const drift_percentage = {}

    for (const tier of TIER_ORDER) {
      const p = predicted[tier] || 0
      const a = actual[tier] || 0
      drift[tier] = Math.round((a - p) * 100) / 100
      drift_percentage[tier] = p > 0 ? Math.round((Math.abs(a - p) / p) * 1000) / 10 : 0
    }

    const predictedEmpty = predicted.fallback || 0
    const actualEmpty = actual.fallback || 0
    drift.empty_rate = Math.round((actualEmpty - predictedEmpty) * 100) / 100
    drift_percentage.empty_rate =
      predictedEmpty > 0
        ? Math.round((Math.abs(actualEmpty - predictedEmpty) / predictedEmpty) * 1000) / 10
        : 0

    await record.fillDriftData(actualData, drift_percentage)

    return {
      predicted,
      actual,
      drift,
      drift_percentage,
      actual_draws_count: actualData.total_draws,
      period: `${createdAt} ~ ${new Date().toISOString()}`
    }
  }

  /**
   * 加载实际分布统计
   * @private
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Object>} 分布统计数据
   */
  async _loadActualDistribution(lottery_campaign_id) {
    const tierDist = await this.models.sequelize.query(
      `
      SELECT d.final_tier, COUNT(*) as count
      FROM lottery_draw_decisions d
      JOIN lottery_draws ld ON d.lottery_draw_id = ld.lottery_draw_id
      WHERE ld.lottery_campaign_id = :campaignId
      GROUP BY d.final_tier
    `,
      {
        replacements: { campaignId: lottery_campaign_id },
        type: this.models.sequelize.QueryTypes.SELECT
      }
    )

    const bxpxDist = await this.models.sequelize.query(
      `
      SELECT CONCAT(d.budget_tier, '_', d.pressure_tier) as bxpx_key, COUNT(*) as count
      FROM lottery_draw_decisions d
      JOIN lottery_draws ld ON d.lottery_draw_id = ld.lottery_draw_id
      WHERE ld.lottery_campaign_id = :campaignId
      GROUP BY d.budget_tier, d.pressure_tier
    `,
      {
        replacements: { campaignId: lottery_campaign_id },
        type: this.models.sequelize.QueryTypes.SELECT
      }
    )

    const [totalResult] = await this.models.sequelize.query(
      `
      SELECT COUNT(*) as total_draws FROM lottery_draws WHERE lottery_campaign_id = :campaignId
    `,
      {
        replacements: { campaignId: lottery_campaign_id },
        type: this.models.sequelize.QueryTypes.SELECT
      }
    )

    const total_draws = totalResult?.total_draws || 0

    const tier_distribution = {}
    const tier_counts = {}
    if (Array.isArray(tierDist)) {
      for (const row of tierDist) {
        tier_counts[row.final_tier] = parseInt(row.count)
        tier_distribution[row.final_tier] =
          total_draws > 0 ? Math.round((parseInt(row.count) / total_draws) * 10000) / 100 : 0
      }
    }

    const bxpx_distribution = {}
    if (Array.isArray(bxpxDist)) {
      for (const row of bxpxDist) {
        bxpx_distribution[row.bxpx_key] = parseInt(row.count)
      }
    }

    return { tier_distribution, tier_counts, bxpx_distribution, total_draws }
  }

  /**
   * 加载指定时间之后的实际档位分布（偏差追踪用）
   * @private
   * @param {number} lottery_campaign_id - 活动ID
   * @param {string|Date} since - 起始时间
   * @returns {Promise<Object>} 分布统计数据
   */
  async _loadActualDistributionSince(lottery_campaign_id, since) {
    const [rows] = await this.models.sequelize.query(
      `
      SELECT d.final_tier, COUNT(*) as count
      FROM lottery_draw_decisions d
      JOIN lottery_draws ld ON d.lottery_draw_id = ld.lottery_draw_id
      WHERE ld.lottery_campaign_id = :campaignId AND ld.created_at >= :since
      GROUP BY d.final_tier
    `,
      { replacements: { campaignId: lottery_campaign_id, since } }
    )

    let total = 0
    const tier_distribution = {}
    if (Array.isArray(rows)) {
      for (const row of rows) {
        total += parseInt(row.count)
      }
      for (const row of rows) {
        tier_distribution[row.final_tier] =
          total > 0 ? Math.round((parseInt(row.count) / total) * 10000) / 100 : 0
      }
    }

    return { tier_distribution, total_draws: total }
  }
}

module.exports = SimulationMonitorService
