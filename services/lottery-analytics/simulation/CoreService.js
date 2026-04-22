'use strict'

const { WEIGHT_SCALE, TIER_ORDER, HIGH_TIER_MAX_RATIO, RISK_THRESHOLDS } = require('./constants')

/**
 * SimulationCoreService - 模拟核心
 *
 * 方法：loadBaseline, runSimulation, simulateUserJourney, runSensitivityAnalysis, recommendConfig
 * 以及所有内部辅助方法
 */
class SimulationCoreService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
  }

  /**
   * 加载指定活动的当前策略配置作为模拟基线
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Object>} 基线数据（tier_rules + matrix_config + strategy_config + actual_distribution + prizes）
   */
  async loadBaseline(lottery_campaign_id) {
    const {
      LotteryTierRule,
      LotteryTierMatrixConfig,
      LotteryStrategyConfig,
      LotteryPrize,
      LotteryCampaign
    } = this.models

    const campaign = await LotteryCampaign.findByPk(lottery_campaign_id)
    if (!campaign) {
      throw Object.assign(new Error(`活动不存在: lottery_campaign_id=${lottery_campaign_id}`), {
        statusCode: 404
      })
    }

    const [tierRules, matrixConfigs, strategyConfigs, prizes] = await Promise.all([
      LotteryTierRule.findAll({
        where: { lottery_campaign_id },
        attributes: ['segment_key', 'tier_name', 'tier_weight'],
        raw: true
      }),
      LotteryTierMatrixConfig.findAll({
        where: { lottery_campaign_id, is_active: true },
        order: [
          ['budget_tier', 'ASC'],
          ['pressure_tier', 'ASC']
        ],
        raw: true
      }),
      LotteryStrategyConfig.findAll({
        where: { lottery_campaign_id, is_active: true },
        order: [
          ['config_group', 'ASC'],
          ['priority', 'DESC']
        ],
        raw: true
      }),
      LotteryPrize.findAll({
        where: { lottery_campaign_id },
        attributes: [
          'lottery_prize_id',
          'prize_name',
          'reward_tier',
          'prize_type',
          'prize_value',
          'stock_quantity',
          'total_win_count',
          'win_weight',
          'is_fallback'
        ],
        raw: true
      })
    ])

    const actualDistribution = await this._loadActualDistribution(lottery_campaign_id)

    return {
      campaign: {
        lottery_campaign_id: campaign.lottery_campaign_id,
        campaign_name: campaign.campaign_name,
        status: campaign.status,
        total_draws: campaign.total_draws
      },
      tier_rules: tierRules.map(r => ({
        segment_key: r.segment_key,
        tier_name: r.tier_name,
        tier_weight: Number(r.tier_weight)
      })),
      matrix_config: matrixConfigs.map(m => ({
        budget_tier: m.budget_tier,
        pressure_tier: m.pressure_tier,
        high_multiplier: parseFloat(m.high_multiplier),
        mid_multiplier: parseFloat(m.mid_multiplier),
        low_multiplier: parseFloat(m.low_multiplier),
        fallback_multiplier: parseFloat(m.fallback_multiplier),
        cap_multiplier: parseFloat(m.cap_multiplier),
        empty_weight_multiplier: parseFloat(m.empty_weight_multiplier)
      })),
      strategy_config: this._formatStrategyConfig(strategyConfigs),
      prizes: prizes.map(p => ({
        ...p,
        prize_value: parseFloat(p.prize_value || 0),
        remaining_stock: (p.stock_quantity || 0) - (p.total_win_count || 0)
      })),
      actual_distribution: actualDistribution
    }
  }

  /**
   * 执行 Monte Carlo 模拟
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} proposed_config - 提议参数（合并覆盖基线）
   * @param {Object} scenario - 场景配置（budget/pressure/segment 分布）
   * @param {number} simulation_count - 模拟迭代次数
   * @returns {Promise<Object>} 模拟结果 { simulation_result, comparison, risk_assessment }
   */
  async runSimulation(lottery_campaign_id, proposed_config, scenario, simulation_count = 10000) {
    const baseline = await this.loadBaseline(lottery_campaign_id)
    const mergedConfig = this._mergeConfig(baseline, proposed_config)

    const matrixMap = this._buildMatrixMap(mergedConfig.matrix_config)
    const strategyConfig = mergedConfig.strategy_config
    const segmentWeights = this._buildSegmentWeights(mergedConfig.tier_rules)
    const simulatedPrizes = this._buildSimulatedPrizes(baseline.prizes)
    const counters = this._createCounters()

    for (let i = 0; i < simulation_count; i++) {
      this._simulateOneDraw(
        scenario,
        segmentWeights,
        matrixMap,
        strategyConfig,
        simulatedPrizes,
        counters
      )
    }

    const simulationResult = this._aggregateResults(counters, simulation_count, baseline.prizes)
    const comparison = this._computeComparison(simulationResult, baseline.actual_distribution)
    const riskAssessment = this._assessRisk(simulationResult, baseline)

    return { simulation_result: simulationResult, comparison, risk_assessment: riskAssessment }
  }

  /**
   * 模拟单个用户的连续抽奖旅程
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} proposed_config - 提议参数
   * @param {Object} user_profile - 用户画像 { budget, segment_key, initial_empty_streak }
   * @param {number} draw_count - 模拟抽奖次数
   * @returns {Promise<Object>} 旅程数据 { draws: [...] }
   */
  async simulateUserJourney(lottery_campaign_id, proposed_config, user_profile, draw_count = 20) {
    const baseline = await this.loadBaseline(lottery_campaign_id)
    const mergedConfig = this._mergeConfig(baseline, proposed_config)
    const matrixMap = this._buildMatrixMap(mergedConfig.matrix_config)
    const strategyConfig = mergedConfig.strategy_config
    const segmentWeights = this._buildSegmentWeights(mergedConfig.tier_rules)

    const { budget = 2000, segment_key = 'default', initial_empty_streak = 0 } = user_profile
    const budgetTier = this._determineBudgetTier(budget, strategyConfig)
    const baseWeights = segmentWeights[segment_key] ||
      segmentWeights.default || { high: 50000, mid: 150000, low: 800000 }

    const userState = { empty_streak: initial_empty_streak, recent_high_count: 0 }
    const draws = []

    for (let i = 0; i < draw_count; i++) {
      const pressureIndex = 0.5 + Math.random() * 0.7
      const pressureTier = this._determinePressureTier(pressureIndex, strategyConfig)

      const drawDetail = this._simulateOneDrawDetailed(
        baseWeights,
        budgetTier,
        pressureTier,
        matrixMap,
        strategyConfig,
        userState
      )
      drawDetail.draw_number = i + 1
      drawDetail.budget_tier = budgetTier
      drawDetail.pressure_tier = pressureTier
      draws.push(drawDetail)
    }

    return { draws }
  }

  /**
   * 对目标参数进行扫射分析
   *
   * @param {number} lottery_campaign_id - 抽奖活动ID
   * @param {Object} target_param - { group, key } 目标参数路径
   * @param {Object} range - { min, max, steps }
   * @param {number} simulation_count_per_step - 每步模拟次数
   * @param {Object} scenario - 预算/压力/分群分布场景
   * @returns {Promise<Object>} { param_path, data_points }
   */
  async runSensitivityAnalysis(
    lottery_campaign_id,
    target_param,
    range,
    simulation_count_per_step,
    scenario
  ) {
    const { group, key } = target_param
    const { min, max, steps } = range
    const step_size = (max - min) / steps
    const param_path = `${group}.${key}`

    const data_points = []

    for (let i = 0; i <= steps; i++) {
      const param_value = min + step_size * i
      const proposed_config = this._buildSingleParamChange(group, key, param_value)

      const { simulation_result } = await this.runSimulation(
        lottery_campaign_id,
        proposed_config,
        scenario,
        simulation_count_per_step
      )

      data_points.push({
        param_value: Math.round(param_value * 1000) / 1000,
        tier_distribution: simulation_result.tier_distribution,
        empty_rate: simulation_result.empty_rate,
        prize_cost_rate: simulation_result.cost_metrics?.prize_cost_rate || 0
      })
    }

    return { param_path, data_points }
  }

  /**
   * 搜索满足约束条件的参数组合
   *
   * @param {number} lottery_campaign_id - 抽奖活动ID
   * @param {Object} constraints - { high_rate: {min, max}, empty_rate: {max}, prize_cost_rate: {max} }
   * @param {Array<string>} adjustable_params - 可调整的参数路径
   * @param {Object} scenario - 预算/压力/分群分布场景
   * @returns {Promise<Object>} { recommendations, search_stats }
   */
  async recommendConfig(lottery_campaign_id, constraints, adjustable_params, scenario) {
    const startTime = Date.now()
    const candidates = []
    const paramValues = this._generateParamGrid(adjustable_params)
    let combinations_tested = 0

    for (const combo of paramValues) {
      combinations_tested++
      const proposed_config = this._buildMultiParamChange(combo)

      try {
        const { simulation_result } = await this.runSimulation(
          lottery_campaign_id,
          proposed_config,
          scenario,
          1000
        )

        if (this._meetsConstraints(simulation_result, constraints)) {
          candidates.push({ proposed_changes: combo, simulation_result })
        }
      } catch {
        // 跳过无效组合
      }

      if (candidates.length >= 20 || combinations_tested >= 500) break
    }

    const refined = []
    for (const candidate of candidates.slice(0, 5)) {
      const proposed_config = this._buildMultiParamChange(candidate.proposed_changes)
      const { simulation_result } = await this.runSimulation(
        lottery_campaign_id,
        proposed_config,
        scenario,
        10000
      )
      if (this._meetsConstraints(simulation_result, constraints)) {
        refined.push({
          proposed_changes: candidate.proposed_changes,
          simulation_result,
          constraints_met: true
        })
      }
    }

    refined.sort((a, b) => {
      const scoreA = this._computeConstraintScore(a.simulation_result, constraints)
      const scoreB = this._computeConstraintScore(b.simulation_result, constraints)
      return scoreB - scoreA
    })

    return {
      recommendations: refined.slice(0, 3).map((r, i) => ({ rank: i + 1, ...r })),
      search_stats: {
        combinations_tested,
        solutions_found: refined.length,
        elapsed_ms: Date.now() - startTime
      }
    }
  }

  /**
   * 模拟一次抽奖（统计模式，不记录详情）
   * @private
   * @param {*} scenario - 参数
   * @param {*} segmentWeights - 参数
   * @param {*} matrixMap - 参数
   * @param {*} strategyConfig - 参数
   * @param {*} simulatedPrizes - 参数
   * @param {*} counters - 参数
   * @returns {*} 结果
   */
  _simulateOneDraw(scenario, segmentWeights, matrixMap, strategyConfig, simulatedPrizes, counters) {
    const budgetTier = this._weightedRandomPick(scenario.budget_distribution)
    const pressureTier = this._weightedRandomPick(scenario.pressure_distribution)
    const segment = this._weightedRandomPick(scenario.segment_distribution)

    const baseWeights = {
      ...(segmentWeights[segment] ||
        segmentWeights.default || { high: 50000, mid: 150000, low: 800000 })
    }

    const multipliers = matrixMap[budgetTier]?.[pressureTier] || {
      high_multiplier: 0,
      mid_multiplier: 0,
      low_multiplier: 0,
      fallback_multiplier: 1
    }

    let weights = {
      high: Math.round((baseWeights.high || 0) * (multipliers.high_multiplier || 0)),
      mid: Math.round((baseWeights.mid || 0) * (multipliers.mid_multiplier || 0)),
      low: Math.round((baseWeights.low || 0) * (multipliers.low_multiplier || 0)),
      fallback: Math.round((baseWeights.fallback || 0) * (multipliers.fallback_multiplier || 1))
    }
    const emptyMult = parseFloat(multipliers.empty_weight_multiplier || 0)
    if (emptyMult > 0) {
      weights.fallback += Math.round(WEIGHT_SCALE * emptyMult)
    }

    weights = this._normalizeWeights(weights)
    weights = this._enforceHighTierCap(weights, HIGH_TIER_MAX_RATIO)

    if (strategyConfig.pity?.enabled) {
      const pityConfig = strategyConfig.pity
      const threshold = pityConfig.hard_guarantee_threshold || 10
      const multiplierTable = pityConfig.multiplier_table || {}
      const emptyStreak = counters._user_empty_streak

      if (emptyStreak >= threshold) {
        weights.fallback = 0
        weights = this._normalizeWeights(weights)
        counters.pity_trigger_count++
      } else if (multiplierTable[emptyStreak]) {
        const mult = parseFloat(multiplierTable[emptyStreak])
        if (mult > 1) {
          for (const tier of ['high', 'mid', 'low']) {
            weights[tier] = Math.round(weights[tier] * mult)
          }
          if (weights.fallback > 0) {
            weights.fallback = Math.round(weights.fallback / mult)
            if (weights.fallback < 1) weights.fallback = 1
          }
          weights = this._normalizeWeights(weights)
        }
      }
    }

    const randomValue = Math.floor(Math.random() * WEIGHT_SCALE)
    let selectedTier = this._pickTier(weights, randomValue)

    if (strategyConfig.anti_empty?.enabled) {
      const threshold = strategyConfig.anti_empty.empty_streak_threshold || 3
      if (selectedTier === 'empty' && counters._user_empty_streak >= threshold) {
        selectedTier = 'low'
        counters.anti_empty_trigger_count++
      }
    }

    if (strategyConfig.anti_high?.enabled) {
      const threshold = strategyConfig.anti_high.high_streak_threshold || 2
      if (selectedTier === 'high' && counters._user_recent_high >= threshold) {
        selectedTier = 'mid'
        counters.anti_high_trigger_count++
      }
    }

    if (selectedTier !== 'fallback') {
      const available = simulatedPrizes.filter(
        p => p.reward_tier === selectedTier && p._sim_stock > 0 && !p.is_fallback
      )
      if (available.length === 0) {
        const downgrade = ['mid', 'low', 'fallback']
        const tierIdx = downgrade.indexOf(selectedTier)
        let found = false
        for (let d = tierIdx + 1; d < downgrade.length; d++) {
          const lower = simulatedPrizes.filter(
            p => p.reward_tier === downgrade[d] && p._sim_stock > 0
          )
          if (lower.length > 0) {
            selectedTier = downgrade[d]
            found = true
            break
          }
        }
        if (!found) selectedTier = 'fallback'
      } else {
        const prizeIdx = Math.floor(Math.random() * available.length)
        available[prizeIdx]._sim_stock--
      }
    }

    let selectedPrizeValue = 0
    if (selectedTier !== 'fallback') {
      const tierPrizes = simulatedPrizes.filter(
        p => p.reward_tier === selectedTier && !p.is_fallback
      )
      if (tierPrizes.length > 0) {
        selectedPrizeValue =
          tierPrizes.reduce((sum, p) => sum + (p.prize_value || 0), 0) / tierPrizes.length
      }
    }
    counters.total_prize_value += selectedPrizeValue
    counters.tier_prize_value[selectedTier] =
      (counters.tier_prize_value[selectedTier] || 0) + selectedPrizeValue

    counters.tier_counts[selectedTier] = (counters.tier_counts[selectedTier] || 0) + 1
    counters.bxpx_counts[`${budgetTier}_${pressureTier}`] =
      (counters.bxpx_counts[`${budgetTier}_${pressureTier}`] || 0) + 1

    if (selectedTier === 'fallback') {
      counters._user_empty_streak++
      counters.total_empty_streak += counters._user_empty_streak
      counters.empty_streak_distribution[Math.min(counters._user_empty_streak, 10)] =
        (counters.empty_streak_distribution[Math.min(counters._user_empty_streak, 10)] || 0) + 1
    } else {
      if (counters._user_empty_streak > 0) {
        counters.draws_to_first_non_empty.push(counters._user_empty_streak + 1)
      }
      counters._user_empty_streak = 0
    }

    if (selectedTier === 'high') {
      counters._user_recent_high++
    } else {
      counters._user_recent_high = Math.max(0, counters._user_recent_high - 1)
    }
  }

  /**
   * 模拟一次抽奖（详细模式，记录权重变化链，用于用户旅程展示）
   * @private
   * @param {Object} baseWeights - 基础权重
   * @param {string} budgetTier - 预算档位
   * @param {string} pressureTier - 压力档位
   * @param {Map} matrixMap - 档位矩阵映射
   * @param {Object} strategyConfig - 策略配置
   * @param {Object} userState - 用户状态
   * @returns {Object} 详细抽奖结果
   */
  _simulateOneDrawDetailed(
    baseWeights,
    budgetTier,
    pressureTier,
    matrixMap,
    strategyConfig,
    userState
  ) {
    const detail = { triggers: [] }
    detail.base_weights = { ...baseWeights }

    const multipliers = matrixMap[budgetTier]?.[pressureTier] || {}
    let weights = {
      high: Math.round((baseWeights.high || 0) * (multipliers.high_multiplier || 0)),
      mid: Math.round((baseWeights.mid || 0) * (multipliers.mid_multiplier || 0)),
      low: Math.round((baseWeights.low || 0) * (multipliers.low_multiplier || 0)),
      fallback: Math.round((baseWeights.fallback || 0) * (multipliers.fallback_multiplier || 1))
    }
    const emptyMult = parseFloat(multipliers.empty_weight_multiplier || 0)
    if (emptyMult > 0) {
      weights.fallback += Math.round(WEIGHT_SCALE * emptyMult)
    }
    weights = this._normalizeWeights(weights)
    detail.bxpx_adjusted = { ...weights }

    const beforeCap = { ...weights }
    weights = this._enforceHighTierCap(weights, HIGH_TIER_MAX_RATIO)
    detail.after_high_cap = { ...weights }
    if (beforeCap.high !== weights.high) {
      detail.triggers.push('high_tier_cap')
    }

    detail.after_pity = { ...weights }
    if (strategyConfig.pity?.enabled && userState.empty_streak > 0) {
      const multiplierTable = strategyConfig.pity.multiplier_table || {}
      const mult = parseFloat(multiplierTable[userState.empty_streak] || 1)
      if (mult > 1) {
        for (const tier of ['high', 'mid', 'low']) {
          weights[tier] = Math.round(weights[tier] * mult)
        }
        if (weights.fallback > 1) weights.fallback = Math.round(weights.fallback / mult)
        weights = this._normalizeWeights(weights)
        detail.after_pity = { ...weights }
        detail.triggers.push(`pity(streak=${userState.empty_streak}, ×${mult})`)
      }
    }

    detail.final_weights = { ...weights }

    const randomValue = Math.floor(Math.random() * WEIGHT_SCALE)
    let selectedTier = this._pickTier(weights, randomValue)

    if (
      strategyConfig.anti_empty?.enabled &&
      selectedTier === 'fallback' &&
      userState.empty_streak >= (strategyConfig.anti_empty.empty_streak_threshold || 3)
    ) {
      selectedTier = 'low'
      detail.triggers.push(`anti_empty(streak=${userState.empty_streak})`)
    }

    if (
      strategyConfig.anti_high?.enabled &&
      selectedTier === 'high' &&
      userState.recent_high_count >= (strategyConfig.anti_high.high_streak_threshold || 2)
    ) {
      selectedTier = 'mid'
      detail.triggers.push(`anti_high(recent_high=${userState.recent_high_count})`)
    }

    detail.final_tier = selectedTier

    if (selectedTier === 'fallback') {
      userState.empty_streak++
    } else {
      userState.empty_streak = 0
    }
    if (selectedTier === 'high') {
      userState.recent_high_count++
    } else {
      userState.recent_high_count = Math.max(0, userState.recent_high_count - 1)
    }

    detail.user_state_after = { ...userState }

    return detail
  }

  /**
   * 加载实际分布统计（档位/BxPx/总抽奖次数）
   * @private
   * @param {*} lottery_campaign_id - 参数
   * @returns {Promise<*>} 结果
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
   * @private
   * @param {*} rows - 参数
   * @returns {*} 计算结果
   */
  _formatStrategyConfig(rows) {
    const result = {}
    const seen = new Set()
    for (const row of rows) {
      const groupKey = `${row.config_group}:${row.config_key}`
      if (seen.has(groupKey)) continue
      seen.add(groupKey)
      if (!result[row.config_group]) result[row.config_group] = {}
      try {
        const raw = row.config_value
        result[row.config_group][row.config_key] = typeof raw === 'string' ? JSON.parse(raw) : raw
      } catch {
        result[row.config_group][row.config_key] = row.config_value
      }
    }
    return result
  }

  /**
   * @private
   * @param {*} baseline - 参数
   * @param {*} proposed - 参数
   * @returns {*} 计算结果
   */
  _mergeConfig(baseline, proposed) {
    const merged = {
      tier_rules: [...baseline.tier_rules],
      matrix_config: baseline.matrix_config.map(m => ({ ...m })),
      strategy_config: JSON.parse(JSON.stringify(baseline.strategy_config))
    }

    if (!proposed) return merged

    if (proposed.tier_rules?.length > 0) {
      for (const rule of proposed.tier_rules) {
        const idx = merged.tier_rules.findIndex(
          r => r.segment_key === rule.segment_key && r.tier_name === rule.tier_name
        )
        if (idx >= 0) {
          merged.tier_rules[idx] = { ...merged.tier_rules[idx], ...rule }
        }
      }
    }

    if (proposed.matrix_config?.length > 0) {
      for (const mc of proposed.matrix_config) {
        const idx = merged.matrix_config.findIndex(
          m => m.budget_tier === mc.budget_tier && m.pressure_tier === mc.pressure_tier
        )
        if (idx >= 0) {
          merged.matrix_config[idx] = { ...merged.matrix_config[idx], ...mc }
        }
      }
    }

    if (proposed.strategy_config) {
      for (const [group, values] of Object.entries(proposed.strategy_config)) {
        if (!merged.strategy_config[group]) merged.strategy_config[group] = {}
        Object.assign(merged.strategy_config[group], values)
      }
    }

    return merged
  }

  /**
   * @private
   * @param {*} weights - 参数
   * @returns {*} 计算结果
   */
  _normalizeWeights(weights) {
    const total = Object.values(weights).reduce((sum, w) => sum + (w || 0), 0)
    if (total === 0) return { high: 0, mid: 0, low: 0, fallback: WEIGHT_SCALE }

    const normalized = {}
    let accumulated = 0
    for (const tier of ['high', 'mid', 'low']) {
      normalized[tier] = Math.round(((weights[tier] || 0) / total) * WEIGHT_SCALE)
      accumulated += normalized[tier]
    }
    normalized.fallback = WEIGHT_SCALE - accumulated
    return normalized
  }

  /**
   * @private
   * @param {*} weights - 参数
   * @param {*} maxRatio - 参数
   * @returns {*} 计算结果
   */
  _enforceHighTierCap(weights, maxRatio) {
    const total = Object.values(weights).reduce((sum, w) => sum + (w || 0), 0)
    if (total === 0) return weights
    const highRatio = (weights.high || 0) / total
    if (highRatio <= maxRatio) return { ...weights }

    const maxHighWeight = Math.round(total * maxRatio)
    const excess = (weights.high || 0) - maxHighWeight

    return {
      high: maxHighWeight,
      mid: (weights.mid || 0) + Math.round(excess * 0.2),
      low: (weights.low || 0) + Math.round(excess * 0.8),
      fallback: weights.fallback || 0
    }
  }

  /**
   * @private
   * @param {*} weights - 参数
   * @param {*} randomValue - 参数
   * @returns {*} 计算结果
   */
  _pickTier(weights, randomValue) {
    let cumulative = 0
    for (const tier of TIER_ORDER) {
      cumulative += weights[tier] || 0
      if (randomValue < cumulative) return tier
    }
    return 'fallback'
  }

  /**
   * @private
   * @param {*} distribution - 参数
   * @returns {*} 计算结果
   */
  _weightedRandomPick(distribution) {
    const entries = Object.entries(distribution || {})
    const total = entries.reduce((sum, [, w]) => sum + (Number(w) || 0), 0)
    if (total === 0 && entries.length > 0) return entries[0][0]

    const rand = Math.random() * total
    let cumulative = 0
    for (const [key, weight] of entries) {
      cumulative += Number(weight) || 0
      if (rand < cumulative) return key
    }
    return entries[entries.length - 1]?.[0] || 'default'
  }

  /**
   * @private
   * @param {*} matrixConfig - 参数
   * @returns {*} 计算结果
   */
  _buildMatrixMap(matrixConfig) {
    const map = {}
    for (const m of matrixConfig) {
      if (!map[m.budget_tier]) map[m.budget_tier] = {}
      map[m.budget_tier][m.pressure_tier] = m
    }
    return map
  }

  /**
   * @private
   * @param {*} tierRules - 参数
   * @returns {*} 计算结果
   */
  _buildSegmentWeights(tierRules) {
    const map = {}
    for (const r of tierRules) {
      if (!map[r.segment_key]) map[r.segment_key] = {}
      map[r.segment_key][r.tier_name] = Number(r.tier_weight)
    }
    return map
  }

  /**
   * @private
   * @param {*} prizes - 参数
   * @returns {*} 计算结果
   */
  _buildSimulatedPrizes(prizes) {
    return prizes.map(p => ({ ...p, _sim_stock: p.remaining_stock }))
  }

  /**
   * @private
   * @returns {*} 计算结果
   */
  _createCounters() {
    return {
      tier_counts: {},
      bxpx_counts: {},
      pity_trigger_count: 0,
      anti_empty_trigger_count: 0,
      anti_high_trigger_count: 0,
      _user_empty_streak: 0,
      _user_recent_high: 0,
      total_empty_streak: 0,
      empty_streak_distribution: {},
      draws_to_first_non_empty: [],
      total_prize_value: 0,
      tier_prize_value: {}
    }
  }

  /**
   * @private
   * @param {*} counters - 参数
   * @param {*} totalDraws - 参数
   * @param {*} _prizes - 参数
   * @returns {*} 计算结果
   */
  _aggregateResults(counters, totalDraws, _prizes) {
    const tierDist = {}
    for (const tier of TIER_ORDER) {
      tierDist[tier] = Math.round(((counters.tier_counts[tier] || 0) / totalDraws) * 10000) / 100
    }

    const fallbackRate = tierDist.fallback || 0
    const avgDrawsToNonEmpty =
      counters.draws_to_first_non_empty.length > 0
        ? Math.round(
            (counters.draws_to_first_non_empty.reduce((s, v) => s + v, 0) /
              counters.draws_to_first_non_empty.length) *
              10
          ) / 10
        : 1.0

    const prizeValuePer1000 =
      totalDraws > 0 ? Math.round((counters.total_prize_value / totalDraws) * 1000) : 0
    const avgPrizeValueByTier = {}
    for (const tier of TIER_ORDER) {
      const count = counters.tier_counts[tier] || 0
      const value = counters.tier_prize_value[tier] || 0
      avgPrizeValueByTier[tier] = count > 0 ? Math.round((value / count) * 100) / 100 : 0
    }

    return {
      tier_distribution: tierDist,
      empty_rate: fallbackRate,
      cost_metrics: {
        avg_prize_value_by_tier: avgPrizeValueByTier,
        prize_value_per_1000_draws: prizeValuePer1000,
        prize_cost_rate:
          prizeValuePer1000 > 0 ? Math.round((prizeValuePer1000 / 100000) * 100) / 100 : 0
      },
      experience_metrics: {
        pity_trigger_rate: Math.round((counters.pity_trigger_count / totalDraws) * 10000) / 100,
        anti_empty_trigger_count: counters.anti_empty_trigger_count,
        anti_high_trigger_count: counters.anti_high_trigger_count,
        avg_draws_to_first_non_empty: avgDrawsToNonEmpty
      },
      empty_streak_distribution: counters.empty_streak_distribution
    }
  }

  /**
   * @private
   * @param {*} simResult - 参数
   * @param {*} actualDist - 参数
   * @returns {*} 计算结果
   */
  _computeComparison(simResult, actualDist) {
    if (!actualDist?.tier_distribution) return null
    const delta = {}
    for (const tier of TIER_ORDER) {
      const simVal = simResult.tier_distribution[tier] || 0
      const actVal = actualDist.tier_distribution[tier] || 0
      delta[tier] = Math.round((simVal - actVal) * 100) / 100
    }
    return { tier_delta: delta, empty_rate_delta: delta.fallback || 0 }
  }

  /**
   * @private
   * @param {*} simResult - 参数
   * @param {*} _baseline - 参数
   * @returns {*} 计算结果
   */
  _assessRisk(simResult, _baseline) {
    const highRate = (simResult.tier_distribution.high || 0) / 100
    const emptyRate = (simResult.empty_rate || 0) / 100
    const costRate = simResult.cost_metrics?.prize_cost_rate || 0

    return {
      high_tier_risk:
        highRate > RISK_THRESHOLDS.high_tier.red
          ? 'red'
          : highRate > RISK_THRESHOLDS.high_tier.yellow
            ? 'yellow'
            : 'green',
      empty_rate_risk:
        emptyRate > RISK_THRESHOLDS.empty_rate.red
          ? 'red'
          : emptyRate > RISK_THRESHOLDS.empty_rate.yellow
            ? 'yellow'
            : 'green',
      budget_depletion_risk: 'green',
      prize_cost_rate_risk:
        costRate > RISK_THRESHOLDS.prize_cost_rate.red
          ? 'red'
          : costRate > RISK_THRESHOLDS.prize_cost_rate.yellow
            ? 'yellow'
            : 'green'
    }
  }

  /**
   * @private
   * @param {*} budget - 参数
   * @param {*} strategyConfig - 参数
   * @returns {*} 计算结果
   */
  _determineBudgetTier(budget, strategyConfig) {
    const bt = strategyConfig.budget_tier || {}
    if (budget >= (bt.threshold_high || 1000)) return 'B3'
    if (budget >= (bt.threshold_mid || 500)) return 'B2'
    if (budget >= (bt.threshold_low || 100)) return 'B1'
    return 'B0'
  }

  /**
   * @private
   * @param {*} pressureIndex - 参数
   * @param {*} strategyConfig - 参数
   * @returns {*} 计算结果
   */
  _determinePressureTier(pressureIndex, strategyConfig) {
    const pt = strategyConfig.pressure_tier || {}
    if (pressureIndex >= (pt.threshold_high || 0.8)) return 'P2'
    if (pressureIndex >= (pt.threshold_low || 0.5)) return 'P1'
    return 'P0'
  }

  /**
   * @private
   * @param {*} group - 参数
   * @param {*} key - 参数
   * @param {*} value - 参数
   * @returns {*} 计算结果
   */
  _buildSingleParamChange(group, key, value) {
    if (group === 'matrix_config') {
      const [cellKey, field] = key.split('.')
      const [bt, pt] = cellKey.split('_')
      return { matrix_config: [{ budget_tier: bt, pressure_tier: pt, [field]: value }] }
    }
    if (group === 'tier_rules') {
      const [segment, tier] = key.split('.')
      return { tier_rules: [{ segment_key: segment, tier_name: tier, tier_weight: value }] }
    }
    const [configGroup, configKey] = key.includes('.') ? key.split('.') : [group, key]
    return { strategy_config: { [configGroup]: { [configKey]: value } } }
  }

  /**
   * @private
   * @param {*} combo - 参数
   * @returns {*} 计算结果
   */
  _buildMultiParamChange(combo) {
    const config = { matrix_config: [], strategy_config: {}, tier_rules: [] }
    for (const [path, value] of Object.entries(combo)) {
      const parts = path.split('.')
      if (parts[0] === 'matrix_config') {
        const [bt, pt] = parts[1].split('_')
        const field = parts[2]
        let existing = config.matrix_config.find(
          m => m.budget_tier === bt && m.pressure_tier === pt
        )
        if (!existing) {
          existing = { budget_tier: bt, pressure_tier: pt }
          config.matrix_config.push(existing)
        }
        existing[field] = value
      } else if (parts[0] === 'strategy_config' || parts.length === 2) {
        const group = parts[0] === 'strategy_config' ? parts[1] : parts[0]
        const key = parts[0] === 'strategy_config' ? parts[2] : parts[1]
        if (!config.strategy_config[group]) config.strategy_config[group] = {}
        config.strategy_config[group][key] = value
      }
    }
    return config
  }

  /**
   * @private
   * @param {*} params - 参数
   * @returns {*} 计算结果
   */
  _generateParamGrid(params) {
    const grid = [{}]
    for (const param of params) {
      const values = this._getParamSearchValues(param)
      const newGrid = []
      for (const existing of grid) {
        for (const val of values) {
          newGrid.push({ ...existing, [param]: val })
        }
      }
      grid.length = 0
      grid.push(...newGrid.slice(0, 500))
    }
    return grid
  }

  /**
   * @private
   * @param {*} param - 参数
   * @returns {*} 计算结果
   */
  _getParamSearchValues(param) {
    if (param.includes('multiplier')) return [0, 0.1, 0.3, 0.5, 0.8, 1.0, 1.3, 1.5]
    if (param.includes('threshold')) return [3, 5, 8, 10, 15]
    if (param.includes('weight')) return [10000, 30000, 50000, 80000, 150000]
    return [0.1, 0.3, 0.5, 0.8, 1.0, 1.5]
  }

  /**
   * @private
   * @param {*} result - 参数
   * @param {*} constraints - 参数
   * @returns {*} 计算结果
   */
  _meetsConstraints(result, constraints) {
    const highRate = (result.tier_distribution?.high || 0) / 100
    const emptyRate = (result.empty_rate || 0) / 100
    const costRate = result.cost_metrics?.prize_cost_rate || 0

    if (constraints.high_rate) {
      if (constraints.high_rate.min && highRate < constraints.high_rate.min) return false
      if (constraints.high_rate.max && highRate > constraints.high_rate.max) return false
    }
    if (constraints.empty_rate?.max && emptyRate > constraints.empty_rate.max) return false
    if (constraints.prize_cost_rate?.max && costRate > constraints.prize_cost_rate.max) return false
    return true
  }

  /**
   * @private
   * @param {*} result - 参数
   * @param {*} constraints - 参数
   * @returns {*} 计算结果
   */
  _computeConstraintScore(result, constraints) {
    let score = 0
    const highRate = (result.tier_distribution?.high || 0) / 100

    if (constraints.high_rate) {
      const target = ((constraints.high_rate.min || 0) + (constraints.high_rate.max || 0.08)) / 2
      score += 1 - Math.abs(highRate - target) * 10
    }

    return score
  }
}

module.exports = SimulationCoreService
