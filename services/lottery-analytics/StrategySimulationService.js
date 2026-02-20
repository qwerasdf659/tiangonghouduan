'use strict'

/**
 * StrategySimulationService - 策略效果 Monte Carlo 模拟引擎
 *
 * 核心功能：
 * 1. loadBaseline() — 加载指定活动的当前策略配置作为模拟基线
 * 2. runSimulation() — Monte Carlo 模拟引擎，N 次迭代计算预期分布
 * 3. simulateUserJourney() — 单用户连续抽奖旅程模拟
 * 4. runSensitivityAnalysis() — 灵敏度分析（参数扫射）
 * 5. recommendConfig() — 目标反推（网格搜索推荐方案）
 * 6. applySimulation() — 一键应用模拟配置到线上
 * 7. calculateDrift() — 模拟预测与实际数据偏差追踪
 *
 * 复用 compute/calculators/ 目录下的纯函数，注入模拟配置而非数据库配置：
 * - TierMatrixCalculator: BxPx 矩阵乘数计算
 * - PityCalculator: Pity 软保底权重调整
 * - TierPickStage: 8% 硬顶 + 随机选档位
 *
 * @module services/lottery-analytics/StrategySimulationService
 * @see docs/策略效果模拟分析页面-设计方案.md
 * @since 2026-02-20
 */

const _Op = require('sequelize').Op // eslint-disable-line no-unused-vars

/** 权重刻度（与引擎一致：1,000,000 = 100%） */
const WEIGHT_SCALE = 1000000

/** 档位固定遍历顺序 */
const TIER_ORDER = ['high', 'mid', 'low', 'fallback']

/** high 档位概率硬上限 */
const HIGH_TIER_MAX_RATIO = 0.08

/**
 * 风险评估阈值
 * @see docs/策略效果模拟分析页面-设计方案.md Section 4.4
 */
const RISK_THRESHOLDS = {
  high_tier: { yellow: 0.05, red: 0.08 },
  empty_rate: { yellow: 0.3, red: 0.5 },
  budget_depletion_days: { yellow: 30, red: 7 },
  prize_cost_rate: { yellow: 0.5, red: 0.8 }
}

/**
 * 策略效果 Monte Carlo 模拟服务
 *
 * 提供抽奖策略参数的沙盒模拟能力，运营者可在不影响线上的前提下
 * 预览参数调整的预期效果，包括档位分布、成本指标、体验机制触发率等。
 */
class StrategySimulationService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
  }

  /*
   * ================================================================
   *  1. 加载模拟基线数据
   * ================================================================
   */

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

    // 验证活动存在
    const campaign = await LotteryCampaign.findByPk(lottery_campaign_id)
    if (!campaign) {
      throw Object.assign(new Error(`活动不存在: lottery_campaign_id=${lottery_campaign_id}`), {
        statusCode: 404
      })
    }

    // 并行加载所有配置
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

    // 加载实际分布统计
    const actualDistribution = await this._loadActualDistribution(lottery_campaign_id)

    // 格式化基线数据
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

  /*
   * ================================================================
   *  2. Monte Carlo 模拟引擎
   * ================================================================
   */

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

    // 构建矩阵查找表（budget_tier → pressure_tier → multipliers）
    const matrixMap = this._buildMatrixMap(mergedConfig.matrix_config)
    const strategyConfig = mergedConfig.strategy_config

    // 构建按 segment 分组的基础权重
    const segmentWeights = this._buildSegmentWeights(mergedConfig.tier_rules)

    // 奖品库存模拟（深拷贝，不影响原始数据）
    const simulatedPrizes = this._buildSimulatedPrizes(baseline.prizes)

    // 模拟统计计数器
    const counters = this._createCounters()

    // Monte Carlo 主循环
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

    // 聚合结果
    const simulationResult = this._aggregateResults(counters, simulation_count, baseline.prizes)

    // 对比分析
    const comparison = this._computeComparison(simulationResult, baseline.actual_distribution)

    // 风险评估
    const riskAssessment = this._assessRisk(simulationResult, baseline)

    return { simulation_result: simulationResult, comparison, risk_assessment: riskAssessment }
  }

  /*
   * ================================================================
   *  3. 用户旅程模拟
   * ================================================================
   */

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

    // 确定用户的 budget_tier
    const budgetTier = this._determineBudgetTier(budget, strategyConfig)
    const baseWeights = segmentWeights[segment_key] ||
      segmentWeights.default || { high: 50000, mid: 150000, low: 800000 }

    // 用户状态
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

  /*
   * ================================================================
   *  4. 灵敏度分析
   * ================================================================
   */

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

      // 构建提议参数（只修改目标参数）
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

  /*
   * ================================================================
   *  5. 目标反推（网格搜索）
   * ================================================================
   */

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

    // 简化：对每个可调参数生成候选值
    const paramValues = this._generateParamGrid(adjustable_params)
    let combinations_tested = 0

    // 粗筛：快速模拟（1000次）
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

    // 精筛：对 Top 候选跑更多次模拟
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

    // 排序：优先匹配约束最好的
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

  /*
   * ================================================================
   *  6. 一键应用到线上
   * ================================================================
   */

  /**
   * 将模拟配置应用到生产数据库
   *
   * @param {number} lottery_simulation_record_id - 模拟记录ID
   * @param {number} operator_id - 操作者用户ID
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} { applied: true, changes, admin_operation_log_id }
   */
  async applySimulation(lottery_simulation_record_id, operator_id, options = {}) {
    const { transaction } = options
    const { LotterySimulationRecord, AdminOperationLog } = this.models
    const { OPERATION_TYPES } = require('../../constants/AuditOperationTypes')

    const record = await LotterySimulationRecord.findByPk(lottery_simulation_record_id, {
      transaction
    })
    if (!record) {
      throw Object.assign(new Error('模拟记录不存在'), { statusCode: 404 })
    }
    if (record.status === 'applied') {
      throw Object.assign(new Error('该模拟记录已经应用过'), { statusCode: 400 })
    }

    const proposedConfig = record.proposed_config
    const campaignId = record.lottery_campaign_id
    const changes = []

    // 应用 matrix_config 变更
    if (proposedConfig.matrix_config?.length > 0) {
      for (const mc of proposedConfig.matrix_config) {
        const [count] = await this.models.LotteryTierMatrixConfig.update(
          {
            high_multiplier: mc.high_multiplier,
            mid_multiplier: mc.mid_multiplier,
            low_multiplier: mc.low_multiplier,
            fallback_multiplier: mc.fallback_multiplier,
            cap_multiplier: mc.cap_multiplier,
            empty_weight_multiplier: mc.empty_weight_multiplier,
            updated_by: operator_id
          },
          {
            where: {
              lottery_campaign_id: campaignId,
              budget_tier: mc.budget_tier,
              pressure_tier: mc.pressure_tier
            },
            transaction
          }
        )
        if (count > 0) {
          changes.push({
            table: 'lottery_tier_matrix_config',
            where: `${mc.budget_tier}_${mc.pressure_tier}`,
            updated: count
          })
        }
      }
    }

    // 应用 strategy_config 变更
    if (proposedConfig.strategy_config) {
      for (const [group, values] of Object.entries(proposedConfig.strategy_config)) {
        for (const [key, value] of Object.entries(values)) {
          await this.models.LotteryStrategyConfig.update(
            { config_value: JSON.stringify(value), updated_by: operator_id },
            {
              where: { lottery_campaign_id: campaignId, config_group: group, config_key: key },
              transaction
            }
          )
          changes.push({
            table: 'lottery_strategy_config',
            field: `${group}.${key}`,
            new_value: value
          })
        }
      }
    }

    // 应用 tier_rules 变更
    if (proposedConfig.tier_rules?.length > 0) {
      for (const rule of proposedConfig.tier_rules) {
        await this.models.LotteryTierRule.update(
          { tier_weight: rule.tier_weight },
          {
            where: {
              lottery_campaign_id: campaignId,
              segment_key: rule.segment_key,
              tier_name: rule.tier_name
            },
            transaction
          }
        )
        changes.push({
          table: 'lottery_tier_rules',
          where: `${rule.segment_key}_${rule.tier_name}`,
          new_value: rule.tier_weight
        })
      }
    }

    // 写审计日志
    const logEntry = await AdminOperationLog.create(
      {
        operator_id,
        operation_type: OPERATION_TYPES.SIMULATION_APPLY,
        target_type: 'lottery_simulation_record',
        target_id: lottery_simulation_record_id,
        action: 'update',
        before_data: record.proposed_config,
        after_data: { changes },
        reason: `应用模拟记录 #${lottery_simulation_record_id} 的配置到活动 #${campaignId}`,
        idempotency_key: `simulation_apply_${lottery_simulation_record_id}_${Date.now()}`,
        risk_level: 'high',
        is_reversible: true,
        reversal_data: record.proposed_config
      },
      { transaction }
    )

    // 标记模拟记录为已应用
    await record.markAsApplied(operator_id, { transaction })

    return {
      applied: true,
      changes,
      admin_operation_log_id: logEntry.admin_operation_log_id
    }
  }

  /*
   * ================================================================
   *  7. 偏差追踪
   * ================================================================
   */

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

    // 从模拟记录创建时间之后统计实际数据
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

    // 计算偏差
    const actual = actualData.tier_distribution
    const drift = {}
    const drift_percentage = {}

    for (const tier of TIER_ORDER) {
      const p = predicted[tier] || 0
      const a = actual[tier] || 0
      drift[tier] = Math.round((a - p) * 100) / 100
      drift_percentage[tier] = p > 0 ? Math.round((Math.abs(a - p) / p) * 1000) / 10 : 0
    }

    // 空奖率偏差
    const predictedEmpty = predicted.fallback || 0
    const actualEmpty = actual.fallback || 0
    drift.empty_rate = Math.round((actualEmpty - predictedEmpty) * 100) / 100
    drift_percentage.empty_rate =
      predictedEmpty > 0
        ? Math.round((Math.abs(actualEmpty - predictedEmpty) / predictedEmpty) * 1000) / 10
        : 0

    // 保存偏差数据
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

  /*
   * ================================================================
   *  8. 定时生效（Phase 7 — 运维闭环）
   *     利用 lottery_strategy_config.effective_start / effective_end
   * ================================================================
   */

  /**
   * 定时应用模拟配置 — 在指定时间生效
   *
   * 对 strategy_config 类参数：利用已有 effective_start / effective_end 字段
   * 对 matrix_config / tier_rules 类参数：创建定时任务记录，到时间后触发写入
   *
   * @param {number} lottery_simulation_record_id - 模拟记录主键
   * @param {number} operator_id - 操作者用户ID
   * @param {Date|string} scheduled_at - 计划生效时间（北京时间）
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} { scheduled: true, scheduled_at, changes_summary }
   */
  async scheduleConfigActivation(
    lottery_simulation_record_id,
    operator_id,
    scheduled_at,
    options = {}
  ) {
    const { transaction } = options
    const { LotterySimulationRecord, LotteryStrategyConfig, AdminOperationLog } = this.models
    const { OPERATION_TYPES } = require('../../constants/AuditOperationTypes')

    const record = await LotterySimulationRecord.findByPk(lottery_simulation_record_id, {
      transaction
    })
    if (!record) {
      throw Object.assign(new Error('模拟记录不存在'), { statusCode: 404 })
    }

    const scheduledTime = new Date(scheduled_at)
    if (isNaN(scheduledTime.getTime()) || scheduledTime <= new Date()) {
      throw Object.assign(new Error('scheduled_at 必须是未来的有效时间'), { statusCode: 400 })
    }

    const proposedConfig = record.proposed_config
    const campaignId = record.lottery_campaign_id
    const changesSummary = []

    // strategy_config 参数：利用 effective_start 字段实现定时生效
    if (proposedConfig.strategy_config) {
      for (const [group, values] of Object.entries(proposedConfig.strategy_config)) {
        for (const [key, value] of Object.entries(values)) {
          // 创建新配置行，设置 effective_start 为计划时间
          await LotteryStrategyConfig.create(
            {
              lottery_campaign_id: campaignId,
              config_group: group,
              config_key: key,
              config_value: JSON.stringify(value),
              effective_start: scheduledTime,
              effective_end: null,
              is_active: true,
              priority: 10,
              created_by: operator_id,
              updated_by: operator_id
            },
            { transaction }
          )

          changesSummary.push({
            type: 'strategy_config',
            field: `${group}.${key}`,
            new_value: value,
            effective_start: scheduledTime
          })
        }
      }
    }

    /*
     * matrix_config 和 tier_rules 变更需要在到期时触发写入，
     * 将定时信息存储在模拟记录中，由外部定时任务轮询执行。
     */
    const hasPendingDirectWrites =
      proposedConfig.matrix_config?.length > 0 || proposedConfig.tier_rules?.length > 0

    if (hasPendingDirectWrites) {
      changesSummary.push({
        type: 'pending_direct_write',
        description: '矩阵配置和基础权重将在计划时间由定时任务写入',
        items: [
          ...(proposedConfig.matrix_config || []).map(
            mc => `matrix: ${mc.budget_tier}_${mc.pressure_tier}`
          ),
          ...(proposedConfig.tier_rules || []).map(
            r => `tier_rule: ${r.segment_key}_${r.tier_name}`
          )
        ]
      })
    }

    // 更新模拟记录状态
    await record.update(
      {
        status: 'scheduled',
        scheduled_at: scheduledTime
      },
      { transaction }
    )

    // 审计日志
    await AdminOperationLog.create(
      {
        operator_id,
        operation_type: OPERATION_TYPES.SIMULATION_APPLY,
        target_type: 'lottery_simulation_record',
        target_id: lottery_simulation_record_id,
        action: 'schedule',
        after_data: { scheduled_at: scheduledTime, changes: changesSummary },
        reason: `定时应用模拟记录 #${lottery_simulation_record_id}，计划生效时间: ${scheduledTime.toISOString()}`,
        idempotency_key: `simulation_schedule_${lottery_simulation_record_id}_${Date.now()}`,
        risk_level: 'high',
        is_reversible: true
      },
      { transaction }
    )

    return {
      scheduled: true,
      scheduled_at: scheduledTime,
      changes_summary: changesSummary,
      has_pending_direct_writes: hasPendingDirectWrites
    }
  }

  /**
   * 执行到期的定时配置写入（由定时任务调用）
   * 查询 status='scheduled' 且 scheduled_at <= NOW() 的模拟记录，执行写入
   *
   * @param {Object} options - { transaction }
   * @returns {Promise<Array>} 已执行的记录列表
   */
  async executeScheduledActivations(options = {}) {
    const { transaction } = options
    const { LotterySimulationRecord } = this.models
    const Op = require('sequelize').Op

    const pendingRecords = await LotterySimulationRecord.findAll({
      where: {
        status: 'scheduled',
        scheduled_at: { [Op.lte]: new Date() }
      },
      transaction
    })

    const executed = []
    for (const record of pendingRecords) {
      try {
        const result = await this.applySimulation(
          record.lottery_simulation_record_id,
          record.created_by,
          { transaction }
        )
        executed.push({
          lottery_simulation_record_id: record.lottery_simulation_record_id,
          applied: true,
          changes: result.changes
        })
      } catch (error) {
        executed.push({
          lottery_simulation_record_id: record.lottery_simulation_record_id,
          applied: false,
          error: error.message
        })
      }
    }

    return executed
  }

  /*
   * ================================================================
   *  9. 配置版本历史 + 一键回滚（Phase 7 — 运维闭环）
   *     利用 AdminOperationLog.before_data / after_data 实现
   * ================================================================
   */

  /**
   * 获取策略配置的变更历史
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} options - { limit, offset }
   * @returns {Promise<Object>} { records, total }
   */
  async getConfigVersionHistory(lottery_campaign_id, options = {}) {
    const { AdminOperationLog } = this.models
    const { OPERATION_TYPES } = require('../../constants/AuditOperationTypes')
    const Op = require('sequelize').Op
    const { limit = 50, offset = 0 } = options

    const relevantTypes = [
      OPERATION_TYPES.STRATEGY_CONFIG_UPDATE,
      OPERATION_TYPES.MATRIX_CONFIG_UPDATE,
      OPERATION_TYPES.TIER_RULES_UPDATE,
      OPERATION_TYPES.SIMULATION_APPLY,
      OPERATION_TYPES.CONFIG_ROLLBACK
    ]

    const result = await AdminOperationLog.findAndCountAll({
      where: {
        operation_type: { [Op.in]: relevantTypes },
        [Op.or]: [
          { reason: { [Op.like]: `%活动 #${lottery_campaign_id}%` } },
          { reason: { [Op.like]: `%campaign_id=${lottery_campaign_id}%` } },
          this.models.sequelize.literal(
            `JSON_EXTRACT(after_data, '$.lottery_campaign_id') = ${Number(lottery_campaign_id)}`
          )
        ]
      },
      order: [['created_at', 'DESC']],
      limit: Math.min(Number(limit), 50),
      offset: Number(offset)
    })

    return {
      records: result.rows.map(log => ({
        log_id: log.admin_operation_log_id || log.log_id,
        operation_type: log.operation_type,
        operator_id: log.operator_id,
        before_data: log.before_data,
        after_data: log.after_data,
        reason: log.reason,
        created_at: log.created_at,
        is_reversible: log.is_reversible
      })),
      total: result.count
    }
  }

  /**
   * 回滚到指定版本的配置
   * 从 AdminOperationLog.before_data 恢复配置到对应的表
   *
   * @param {number} log_id - AdminOperationLog 记录ID
   * @param {number} operator_id - 操作者用户ID
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} { rolled_back: true, changes }
   */
  async rollbackConfig(log_id, operator_id, options = {}) {
    const { transaction } = options
    const { AdminOperationLog } = this.models
    const { OPERATION_TYPES } = require('../../constants/AuditOperationTypes')

    const logEntry = await AdminOperationLog.findByPk(log_id, { transaction })
    if (!logEntry) {
      throw Object.assign(new Error('操作日志记录不存在'), { statusCode: 404 })
    }
    if (!logEntry.before_data) {
      throw Object.assign(new Error('该记录没有 before_data，无法回滚'), { statusCode: 400 })
    }

    const beforeData = logEntry.before_data
    const afterData = logEntry.after_data
    const changes = []

    // 根据 operation_type 确定回滚目标表
    const operationType = logEntry.operation_type

    if (operationType === OPERATION_TYPES.SIMULATION_APPLY && beforeData.matrix_config) {
      // 回滚 apply 操作：还原 matrix_config、strategy_config、tier_rules
      await this._rollbackSimulationApply(beforeData, afterData, operator_id, changes, transaction)
    } else if (operationType === OPERATION_TYPES.STRATEGY_CONFIG_UPDATE) {
      await this._rollbackStrategyConfig(beforeData, operator_id, changes, transaction)
    } else if (operationType === OPERATION_TYPES.MATRIX_CONFIG_UPDATE) {
      await this._rollbackMatrixConfig(beforeData, operator_id, changes, transaction)
    } else if (operationType === OPERATION_TYPES.TIER_RULES_UPDATE) {
      await this._rollbackTierRules(beforeData, operator_id, changes, transaction)
    } else {
      // 通用回滚：尝试从 before_data 结构推断目标
      await this._rollbackGeneric(beforeData, operator_id, changes, transaction)
    }

    // 记录回滚操作本身的审计日志
    await AdminOperationLog.create(
      {
        operator_id,
        operation_type: OPERATION_TYPES.CONFIG_ROLLBACK,
        target_type: 'admin_operation_log',
        target_id: log_id,
        action: 'rollback',
        before_data: afterData,
        after_data: beforeData,
        reason: `回滚到操作日志 #${log_id} 之前的配置版本`,
        idempotency_key: `config_rollback_${log_id}_${Date.now()}`,
        risk_level: 'high',
        is_reversible: true,
        reversal_data: afterData
      },
      { transaction }
    )

    return { rolled_back: true, changes, source_log_id: log_id }
  }

  /**
   * 回滚模拟应用操作
   * @private
   * @param {Object} beforeData - 操作前的配置数据
   * @param {Object} _afterData - 操作后的配置数据（未使用）
   * @param {number} operator_id - 操作者ID
   * @param {Array} changes - 变更记录数组（引用传入，追加写入）
   * @param {Object} transaction - Sequelize 事务对象
   * @returns {Promise<void>} 回滚完成
   */
  async _rollbackSimulationApply(beforeData, _afterData, operator_id, changes, transaction) {
    // beforeData 结构同 proposed_config
    if (beforeData.matrix_config?.length > 0) {
      await this._rollbackMatrixConfig(beforeData, operator_id, changes, transaction)
    }
    if (beforeData.strategy_config) {
      await this._rollbackStrategyConfig(beforeData, operator_id, changes, transaction)
    }
    if (beforeData.tier_rules?.length > 0) {
      await this._rollbackTierRules(beforeData, operator_id, changes, transaction)
    }
  }

  /**
   * 回滚策略配置
   * @private
   * @param {Object} data - 目标配置数据
   * @param {number} operator_id - 操作者ID
   * @param {Array} changes - 变更记录数组
   * @param {Object} transaction - Sequelize 事务对象
   * @returns {Promise<void>} 回滚完成
   */
  async _rollbackStrategyConfig(data, operator_id, changes, transaction) {
    const config = data.strategy_config || data
    for (const [group, values] of Object.entries(config)) {
      if (typeof values !== 'object' || values === null) continue
      for (const [key, value] of Object.entries(values)) {
        const [count] = await this.models.LotteryStrategyConfig.update(
          { config_value: JSON.stringify(value), updated_by: operator_id },
          {
            where: { config_group: group, config_key: key },
            transaction
          }
        )
        if (count > 0) {
          changes.push({
            table: 'lottery_strategy_config',
            field: `${group}.${key}`,
            restored_value: value
          })
        }
      }
    }
  }

  /**
   * 回滚矩阵配置
   * @private
   * @param {Object} data - 目标矩阵配置数据
   * @param {number} operator_id - 操作者ID
   * @param {Array} changes - 变更记录数组
   * @param {Object} transaction - Sequelize 事务对象
   * @returns {Promise<void>} 回滚完成
   */
  async _rollbackMatrixConfig(data, operator_id, changes, transaction) {
    const configs = data.matrix_config || (Array.isArray(data) ? data : [])
    for (const mc of configs) {
      if (!mc.budget_tier || !mc.pressure_tier) continue
      const updateFields = {}
      for (const field of [
        'high_multiplier',
        'mid_multiplier',
        'low_multiplier',
        'fallback_multiplier',
        'cap_multiplier',
        'empty_weight_multiplier'
      ]) {
        if (mc[field] !== undefined) updateFields[field] = mc[field]
      }
      updateFields.updated_by = operator_id

      const [count] = await this.models.LotteryTierMatrixConfig.update(updateFields, {
        where: { budget_tier: mc.budget_tier, pressure_tier: mc.pressure_tier },
        transaction
      })
      if (count > 0) {
        changes.push({
          table: 'lottery_tier_matrix_config',
          where: `${mc.budget_tier}_${mc.pressure_tier}`,
          restored: true
        })
      }
    }
  }

  /**
   * 回滚基础权重
   * @private
   * @param {Object} data - 目标权重配置数据
   * @param {number} _operator_id - 操作者ID（未使用）
   * @param {Array} changes - 变更记录数组
   * @param {Object} transaction - Sequelize 事务对象
   * @returns {Promise<void>} 回滚完成
   */
  async _rollbackTierRules(data, _operator_id, changes, transaction) {
    const rules = data.tier_rules || (Array.isArray(data) ? data : [])
    for (const rule of rules) {
      if (!rule.segment_key || !rule.tier_name) continue
      const [count] = await this.models.LotteryTierRule.update(
        { tier_weight: rule.tier_weight },
        {
          where: { segment_key: rule.segment_key, tier_name: rule.tier_name },
          transaction
        }
      )
      if (count > 0) {
        changes.push({
          table: 'lottery_tier_rules',
          where: `${rule.segment_key}_${rule.tier_name}`,
          restored_value: rule.tier_weight
        })
      }
    }
  }

  /**
   * 通用回滚（从 before_data 结构推断目标表）
   * @private
   * @param {Object} beforeData - 操作前的配置数据
   * @param {number} operator_id - 操作者ID
   * @param {Array} changes - 变更记录数组
   * @param {Object} transaction - Sequelize 事务对象
   * @returns {Promise<void>} 回滚完成
   */
  async _rollbackGeneric(beforeData, operator_id, changes, transaction) {
    if (beforeData.matrix_config) {
      await this._rollbackMatrixConfig(beforeData, operator_id, changes, transaction)
    }
    if (beforeData.strategy_config) {
      await this._rollbackStrategyConfig(beforeData, operator_id, changes, transaction)
    }
    if (beforeData.tier_rules) {
      await this._rollbackTierRules(beforeData, operator_id, changes, transaction)
    }
  }

  /*
   * ================================================================
   *  10. 预算节奏预测（Phase 7 — 运维闭环）
   *      利用 lottery_draws.created_at + lottery_draw_decisions.budget_deducted
   * ================================================================
   */

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

    // 最近 30 天每日预算消耗
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

    // 剩余预算
    const remainingBudget = parseFloat(campaign.remaining_prize_pool || 0)

    // 日均消耗（最近 7 天加权平均，越近权重越高）
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

    // 日均抽奖次数
    const avgDailyDraws =
      recentDays.length > 0
        ? Math.round(
            recentDays.reduce((s, d) => s + parseInt(d.daily_draws), 0) / recentDays.length
          )
        : 0

    // 预计耗尽天数和日期
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

  /*
   * ================================================================
   *  11. 异常熔断联动（Phase 7 — 运维闭环）
   *      利用 lottery_alerts 表创建模拟预测的监控规则
   * ================================================================
   */

  /**
   * 一键应用时自动创建异常熔断监控规则
   * 基于模拟预测值 ± 容差创建 simulation_bound 类型的告警规则
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

    // 创建 high_rate 监控规则
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

    // 创建 empty_rate 监控规则
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
   * 用于定时任务轮询检查
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

    // 获取最近 1 小时实际数据
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
      else if (metric === 'empty_rate') actualValue = actualRates.fallback || 0

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

  /*
   * ================================================================
   *  内部方法：模拟核心逻辑
   * ================================================================
   */

  /**
   * 模拟一次抽奖（统计模式，不记录详情）
   *
   * @private
   * @param {Object} scenario - 预算/压力/分群分布场景
   * @param {Object} segmentWeights - 各分群的基础档位权重映射
   * @param {Object} matrixMap - BxPx 矩阵乘数映射 { B0: { P0: {...}, ... }, ... }
   * @param {Object} strategyConfig - 策略配置（pity/anti_empty/anti_high 等）
   * @param {Array<Object>} simulatedPrizes - 带模拟库存的奖品列表
   * @param {Object} counters - 统计计数器（档位/触发/成本累积）
   * @returns {void}
   */
  _simulateOneDraw(scenario, segmentWeights, matrixMap, strategyConfig, simulatedPrizes, counters) {
    // 按场景分布随机选择 budget_tier、pressure_tier、segment
    const budgetTier = this._weightedRandomPick(scenario.budget_distribution)
    const pressureTier = this._weightedRandomPick(scenario.pressure_distribution)
    const segment = this._weightedRandomPick(scenario.segment_distribution)

    // 获取基础权重
    const baseWeights = {
      ...(segmentWeights[segment] ||
        segmentWeights.default || { high: 50000, mid: 150000, low: 800000 })
    }

    // 获取矩阵乘数
    const multipliers = matrixMap[budgetTier]?.[pressureTier] || {
      high_multiplier: 0,
      mid_multiplier: 0,
      low_multiplier: 0,
      fallback_multiplier: 1
    }

    // 应用 BxPx 乘数（含 empty_weight_multiplier 创建 fallback 权重池）
    let weights = {
      high: Math.round((baseWeights.high || 0) * (multipliers.high_multiplier || 0)),
      mid: Math.round((baseWeights.mid || 0) * (multipliers.mid_multiplier || 0)),
      low: Math.round((baseWeights.low || 0) * (multipliers.low_multiplier || 0)),
      fallback: Math.round((baseWeights.fallback || 0) * (multipliers.fallback_multiplier || 1))
    }
    // empty_weight_multiplier 决定空奖/fallback 概率（与引擎 BxPx 矩阵对齐）
    const emptyMult = parseFloat(multipliers.empty_weight_multiplier || 0)
    if (emptyMult > 0) {
      weights.fallback += Math.round(WEIGHT_SCALE * emptyMult)
    }

    // 归一化
    weights = this._normalizeWeights(weights)

    // 8% high 硬顶
    weights = this._enforceHighTierCap(weights, HIGH_TIER_MAX_RATIO)

    // Pity 调整
    if (strategyConfig.pity?.enabled) {
      const pityConfig = strategyConfig.pity
      const threshold = pityConfig.hard_guarantee_threshold || 10
      const multiplierTable = pityConfig.multiplier_table || {}
      const emptyStreak = counters._user_empty_streak

      if (emptyStreak >= threshold) {
        // 硬保底触发：强制非空
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

    // 随机选档位
    const randomValue = Math.floor(Math.random() * WEIGHT_SCALE)
    let selectedTier = this._pickTier(weights, randomValue)

    // AntiEmpty 检查
    if (strategyConfig.anti_empty?.enabled) {
      const threshold = strategyConfig.anti_empty.empty_streak_threshold || 3
      if (selectedTier === 'fallback' && counters._user_empty_streak >= threshold) {
        selectedTier = 'low'
        counters.anti_empty_trigger_count++
      }
    }

    // AntiHigh 检查
    if (strategyConfig.anti_high?.enabled) {
      const threshold = strategyConfig.anti_high.high_streak_threshold || 2
      if (selectedTier === 'high' && counters._user_recent_high >= threshold) {
        selectedTier = 'mid'
        counters.anti_high_trigger_count++
      }
    }

    // 库存约束检查
    if (selectedTier !== 'fallback') {
      const available = simulatedPrizes.filter(
        p => p.reward_tier === selectedTier && p._sim_stock > 0 && !p.is_fallback
      )
      if (available.length === 0) {
        // 同档位无库存，降级
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
        // 扣减模拟库存
        const prizeIdx = Math.floor(Math.random() * available.length)
        available[prizeIdx]._sim_stock--
      }
    }

    // 追踪选中奖品价值（用于三维成本指标计算）
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

    // 更新计数器
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
   *
   * @private
   * @param {Object} baseWeights - 基础档位权重 { high, mid, low }
   * @param {string} budgetTier - 预算层级（B0-B3）
   * @param {string} pressureTier - 压力层级（P0-P2）
   * @param {Object} matrixMap - BxPx 矩阵乘数映射
   * @param {Object} strategyConfig - 策略配置
   * @param {Object} userState - 用户状态（empty_streak/recent_high_count）
   * @returns {Object} 详细权重变化链和最终选择
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

    // BxPx 乘数（含 empty_weight_multiplier 创建 fallback 权重池）
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

    // 8% 硬顶
    const beforeCap = { ...weights }
    weights = this._enforceHighTierCap(weights, HIGH_TIER_MAX_RATIO)
    detail.after_high_cap = { ...weights }
    if (beforeCap.high !== weights.high) {
      detail.triggers.push('high_tier_cap')
    }

    // Pity
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

    // 随机选档位
    const randomValue = Math.floor(Math.random() * WEIGHT_SCALE)
    let selectedTier = this._pickTier(weights, randomValue)

    // AntiEmpty
    if (
      strategyConfig.anti_empty?.enabled &&
      selectedTier === 'fallback' &&
      userState.empty_streak >= (strategyConfig.anti_empty.empty_streak_threshold || 3)
    ) {
      selectedTier = 'low'
      detail.triggers.push(`anti_empty(streak=${userState.empty_streak})`)
    }

    // AntiHigh
    if (
      strategyConfig.anti_high?.enabled &&
      selectedTier === 'high' &&
      userState.recent_high_count >= (strategyConfig.anti_high.high_streak_threshold || 2)
    ) {
      selectedTier = 'mid'
      detail.triggers.push(`anti_high(recent_high=${userState.recent_high_count})`)
    }

    detail.final_tier = selectedTier

    // 更新用户状态
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

  /*
   * ================================================================
   *  内部方法：数据加载和格式化
   * ================================================================
   */

  /**
   * 加载实际分布统计（档位/BxPx/总抽奖次数）
   *
   * @private
   * @param {number} lottery_campaign_id - 抽奖活动ID
   * @returns {Promise<Object>} { tier_distribution, tier_counts, bxpx_distribution, total_draws }
   */
  async _loadActualDistribution(lottery_campaign_id) {
    // QueryTypes.SELECT 返回完整结果数组，多行结果不可解构首行
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
   *
   * @private
   * @param {number} lottery_campaign_id - 抽奖活动ID
   * @param {string|Date} since - 起始时间
   * @returns {Promise<Object>} { tier_distribution, total_draws }
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

  /**
   * 格式化策略配置（从扁平行列表转为嵌套对象）
   *
   * @private
   * @param {Array<Object>} rows - config_group/config_key/config_value 行列表
   * @returns {Object} 嵌套配置对象 { pity: {...}, anti_empty: {...}, ... }
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

  /*
   * ================================================================
   *  内部方法：配置合并
   * ================================================================
   */

  /**
   * 合并提议参数到基线配置（仅内存中，不影响数据库）
   *
   * @private
   * @param {Object} baseline - 基线配置（tier_rules/matrix_config/strategy_config）
   * @param {Object} proposed - 提议修改的参数
   * @returns {Object} 合并后的配置
   */
  _mergeConfig(baseline, proposed) {
    const merged = {
      tier_rules: [...baseline.tier_rules],
      matrix_config: baseline.matrix_config.map(m => ({ ...m })),
      strategy_config: JSON.parse(JSON.stringify(baseline.strategy_config))
    }

    if (!proposed) return merged

    // 合并 tier_rules
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

    // 合并 matrix_config
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

    // 合并 strategy_config（深层合并）
    if (proposed.strategy_config) {
      for (const [group, values] of Object.entries(proposed.strategy_config)) {
        if (!merged.strategy_config[group]) merged.strategy_config[group] = {}
        Object.assign(merged.strategy_config[group], values)
      }
    }

    return merged
  }

  /*
   * ================================================================
   *  内部方法：纯函数计算（与引擎逻辑对齐）
   * ================================================================
   */

  /**
   * 归一化权重到 WEIGHT_SCALE（1,000,000 = 100%）
   *
   * @private
   * @param {Object} weights - 原始权重 { high, mid, low }
   * @returns {Object} 归一化后权重 { high, mid, low, fallback }
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
   * 强制 high 档位概率硬上限（与 TierPickStage._enforceHighTierCap 对齐）
   *
   * @private
   * @param {Object} weights - 档位权重 { high, mid, low, fallback }
   * @param {number} maxRatio - 最大比例（如 0.08 表示 8%）
   * @returns {Object} 调整后的权重
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
   * 按权重随机选档位（与 TierPickStage._pickTier 对齐）
   *
   * @private
   * @param {Object} weights - 档位权重 { high, mid, low, fallback }
   * @param {number} randomValue - 随机数（0 ~ WEIGHT_SCALE）
   * @returns {string} 选中的档位名
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
   * 加权随机选择（从分布对象中按概率选一个键）
   *
   * @private
   * @param {Object} distribution - 分布对象 { key: weight, ... }
   * @returns {string} 选中的键
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

  /*
   * ================================================================
   *  内部方法：辅助工具
   * ================================================================
   */

  /**
   * 构建 BxPx 矩阵查找映射
   *
   * @private
   * @param {Array<Object>} matrixConfig - 矩阵配置行列表
   * @returns {Object} 嵌套映射 { B0: { P0: {...}, P1: {...} }, ... }
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
   * 构建分群权重映射
   *
   * @private
   * @param {Array<Object>} tierRules - tier_rules 行列表
   * @returns {Object} { default: { high: 50000, mid: 150000, low: 800000 }, ... }
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
   * 构建带模拟库存的奖品副本
   *
   * @private
   * @param {Array<Object>} prizes - 原始奖品列表
   * @returns {Array<Object>} 附加 _sim_stock 字段的奖品副本
   */
  _buildSimulatedPrizes(prizes) {
    return prizes.map(p => ({ ...p, _sim_stock: p.remaining_stock }))
  }

  /**
   * 创建模拟统计计数器
   *
   * @private
   * @returns {Object} 初始化的计数器对象
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
   * 聚合模拟结果（档位分布、成本指标、体验指标）
   *
   * @private
   * @param {Object} counters - 模拟计数器
   * @param {number} totalDraws - 总模拟次数
   * @param {Array<Object>} _prizes - 奖品列表（预留参数）
   * @returns {Object} 聚合后的模拟结果
   */
  _aggregateResults(counters, totalDraws, _prizes) {
    const tierDist = {}
    for (const tier of TIER_ORDER) {
      tierDist[tier] = Math.round(((counters.tier_counts[tier] || 0) / totalDraws) * 10000) / 100
    }

    const emptyRate = tierDist.fallback || 0
    const avgDrawsToNonEmpty =
      counters.draws_to_first_non_empty.length > 0
        ? Math.round(
            (counters.draws_to_first_non_empty.reduce((s, v) => s + v, 0) /
              counters.draws_to_first_non_empty.length) *
              10
          ) / 10
        : 1.0

    // 三维成本指标：基于模拟中追踪的奖品发放价值
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
      empty_rate: emptyRate,
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
   * 计算模拟结果与实际数据的对比 delta
   *
   * @private
   * @param {Object} simResult - 模拟结果
   * @param {Object} actualDist - 实际分布数据
   * @returns {Object|null} { tier_delta, empty_rate_delta }
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
   * 评估模拟结果的风险等级（红/黄/绿）
   *
   * @private
   * @param {Object} simResult - 模拟结果
   * @param {Object} _baseline - 基线配置（预留参数）
   * @returns {Object} { high_tier_risk, empty_rate_risk, budget_depletion_risk, prize_cost_rate_risk }
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
   * 根据预算金额判断预算层级 B0-B3
   *
   * @private
   * @param {number} budget - 用户预算
   * @param {Object} strategyConfig - 策略配置（含 budget_tier 阈值）
   * @returns {string} 预算层级（B0/B1/B2/B3）
   */
  _determineBudgetTier(budget, strategyConfig) {
    const bt = strategyConfig.budget_tier || {}
    if (budget >= (bt.threshold_high || 1000)) return 'B3'
    if (budget >= (bt.threshold_mid || 500)) return 'B2'
    if (budget >= (bt.threshold_low || 100)) return 'B1'
    return 'B0'
  }

  /**
   * 根据压力指数判断压力层级 P0-P2
   *
   * @private
   * @param {number} pressureIndex - 压力指数（0~1）
   * @param {Object} strategyConfig - 策略配置（含 pressure_tier 阈值）
   * @returns {string} 压力层级（P0/P1/P2）
   */
  _determinePressureTier(pressureIndex, strategyConfig) {
    const pt = strategyConfig.pressure_tier || {}
    if (pressureIndex >= (pt.threshold_high || 0.8)) return 'P2'
    if (pressureIndex >= (pt.threshold_low || 0.5)) return 'P1'
    return 'P0'
  }

  /**
   * 构建单参数变更的提议配置
   *
   * @private
   * @param {string} group - 参数分组（matrix_config/tier_rules/strategy_config）
   * @param {string} key - 参数键（如 B3_P1.high_multiplier）
   * @param {number} value - 目标值
   * @returns {Object} 提议配置对象
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
   * 构建多参数变更的提议配置
   *
   * @private
   * @param {Object} combo - 参数路径到值的映射
   * @returns {Object} 提议配置对象
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
   * 生成参数网格（用于目标反推的搜索空间）
   *
   * @private
   * @param {Array<string>} params - 可调参数路径列表
   * @returns {Array<Object>} 参数组合网格（最多 500 组）
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
   * 获取参数的候选搜索值
   *
   * @private
   * @param {string} param - 参数路径
   * @returns {Array<number>} 候选值列表
   */
  _getParamSearchValues(param) {
    if (param.includes('multiplier')) return [0, 0.1, 0.3, 0.5, 0.8, 1.0, 1.3, 1.5]
    if (param.includes('threshold')) return [3, 5, 8, 10, 15]
    if (param.includes('weight')) return [10000, 30000, 50000, 80000, 150000]
    return [0.1, 0.3, 0.5, 0.8, 1.0, 1.5]
  }

  /**
   * 检查模拟结果是否满足约束条件
   *
   * @private
   * @param {Object} result - 模拟结果
   * @param {Object} constraints - 约束条件
   * @returns {boolean} 是否满足所有约束
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
   * 计算模拟结果的约束满足程度得分（越高越好）
   *
   * @private
   * @param {Object} result - 模拟结果
   * @param {Object} constraints - 约束条件
   * @returns {number} 约束满足得分
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

  /*
   * ================================================================
   *  模拟记录 CRUD（路由层通过 Service 访问，禁止直连 models）
   * ================================================================
   */

  /**
   * 保存模拟记录到数据库
   *
   * @param {Object} recordData - 记录数据
   * @param {number} recordData.lottery_campaign_id - 活动ID
   * @param {string|null} recordData.simulation_name - 模拟名称
   * @param {number} recordData.simulation_count - 迭代次数
   * @param {Object} recordData.proposed_config - 提议参数
   * @param {Object} recordData.scenario - 场景配置
   * @param {Object} recordData.simulation_result - 模拟结果
   * @param {Object} recordData.comparison - 对比分析
   * @param {Object} recordData.risk_assessment - 风险评估
   * @param {number|null} recordData.created_by - 创建者用户ID
   * @returns {Promise<Object>} 创建的记录
   */
  async saveSimulationRecord(recordData) {
    const { LotterySimulationRecord } = this.models
    return LotterySimulationRecord.create(recordData)
  }

  /**
   * 获取指定活动的模拟历史列表
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {number} options.limit - 返回条数
   * @param {number} options.offset - 偏移量
   * @returns {Promise<{rows: Object[], count: number}>} 分页历史列表
   */
  async getSimulationHistory(lottery_campaign_id, options = {}) {
    const { LotterySimulationRecord } = this.models
    return LotterySimulationRecord.getHistoryByCampaign(lottery_campaign_id, options)
  }

  /**
   * 获取单条模拟记录详情
   *
   * @param {number} lottery_simulation_record_id - 记录ID
   * @returns {Promise<Object|null>} 记录详情，不存在返回 null
   */
  async getSimulationRecord(lottery_simulation_record_id) {
    const { LotterySimulationRecord } = this.models
    return LotterySimulationRecord.findByPk(lottery_simulation_record_id)
  }
}

module.exports = StrategySimulationService
