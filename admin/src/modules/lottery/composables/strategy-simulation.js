/**
 * 策略效果模拟分析 — Composable 模块
 *
 * 提供 Monte Carlo 模拟引擎的前端状态管理和 API 调用：
 * 核心功能（Phase 2-4）：
 * - 参数沙盒（当前配置 + 提议配置对比编辑）
 * - Monte Carlo 模拟运行
 * - 对比分析面板（7项图表数据）
 * - 用户旅程模拟
 *
 * 增强功能（Phase 5-6）：
 * - 灵敏度分析 + 目标反推（高级交互）
 * - 多方案并排比较（最多5个方案）
 * - 偏差追踪 UI
 * - 一键应用 + 确认弹窗
 *
 * 运维闭环功能（Phase 7-8）：
 * - 定时生效配置
 * - 配置版本回滚
 * - 预算节奏预测图表
 * - 异常熔断联动状态
 *
 * @module admin/src/modules/lottery/composables/strategy-simulation
 * @see docs/策略效果模拟分析页面-设计方案.md
 * @since 2026-02-20
 */

import { logger } from '@/utils/logger.js'
import { loadECharts } from '@/utils/echarts-lazy.js'

/** API 路径前缀 */
const API_PREFIX = '/api/v4/console/lottery-simulation'

/** 模拟 API 端点 */
const SIMULATION_ENDPOINTS = {
  BASELINE: `${API_PREFIX}/baseline`,
  RUN: `${API_PREFIX}/run`,
  USER_JOURNEY: `${API_PREFIX}/user-journey`,
  SENSITIVITY: `${API_PREFIX}/sensitivity`,
  RECOMMEND: `${API_PREFIX}/recommend`,
  APPLY: `${API_PREFIX}/apply`,
  DRIFT: `${API_PREFIX}/drift`,
  HISTORY: `${API_PREFIX}/history`,
  RECORD: `${API_PREFIX}/record`,
  SCHEDULE: `${API_PREFIX}/schedule`,
  VERSION_HISTORY: `${API_PREFIX}/version-history`,
  ROLLBACK: `${API_PREFIX}/rollback`,
  BUDGET_PACING: `${API_PREFIX}/budget-pacing`,
  CIRCUIT_BREAKER: `${API_PREFIX}/circuit-breaker`,
  CIRCUIT_BREAKER_STATUS: `${API_PREFIX}/circuit-breaker-status`
}

/** 预设场景库 */
const PRESET_SCENARIOS = {
  current_real: {
    name: '当前真实分布',
    description: '基于数据库统计的真实用户分布',
    budget_distribution: { B0: 0, B1: 0, B2: 0, B3: 100 },
    pressure_distribution: { P0: 0, P1: 80, P2: 20 },
    segment_distribution: { default: 80, new_user: 15, vip_user: 5 }
  },
  uniform: {
    name: '均匀分布',
    description: '测试用，覆盖所有矩阵格子',
    budget_distribution: { B0: 25, B1: 25, B2: 25, B3: 25 },
    pressure_distribution: { P0: 33.3, P1: 33.3, P2: 33.4 },
    segment_distribution: { default: 100, new_user: 0, vip_user: 0 }
  },
  low_budget: {
    name: '低预算增多',
    description: '模拟用户预算下降场景',
    budget_distribution: { B0: 0, B1: 20, B2: 30, B3: 50 },
    pressure_distribution: { P0: 0, P1: 70, P2: 30 },
    segment_distribution: { default: 80, new_user: 20, vip_user: 0 }
  },
  high_pressure: {
    name: '高压力场景',
    description: '模拟活动高峰/预算吃紧',
    budget_distribution: { B0: 0, B1: 0, B2: 30, B3: 70 },
    pressure_distribution: { P0: 10, P1: 40, P2: 50 },
    segment_distribution: { default: 70, new_user: 0, vip_user: 30 }
  }
}

/** 灵敏度可扫射参数定义 */
const SENSITIVITY_PARAMS = [
  {
    group: 'matrix_config',
    key: 'B3_P1.high_multiplier',
    label: 'B3×P1 高档乘数',
    min: 0,
    max: 2,
    step_default: 10
  },
  {
    group: 'matrix_config',
    key: 'B3_P1.empty_weight_multiplier',
    label: 'B3×P1 空奖权重乘数',
    min: 0,
    max: 2,
    step_default: 10
  },
  {
    group: 'matrix_config',
    key: 'B3_P2.high_multiplier',
    label: 'B3×P2 高档乘数',
    min: 0,
    max: 2,
    step_default: 10
  },
  {
    group: 'matrix_config',
    key: 'B3_P1.mid_multiplier',
    label: 'B3×P1 中档乘数',
    min: 0,
    max: 2,
    step_default: 10
  },
  {
    group: 'strategy_config',
    key: 'pity.hard_guarantee_threshold',
    label: 'Pity 硬保底阈值',
    min: 3,
    max: 20,
    step_default: 8
  },
  {
    group: 'strategy_config',
    key: 'anti_empty.empty_streak_threshold',
    label: '防连空阈值',
    min: 1,
    max: 10,
    step_default: 9
  },
  {
    group: 'strategy_config',
    key: 'anti_high.high_streak_threshold',
    label: '防连高阈值',
    min: 1,
    max: 5,
    step_default: 4
  }
]

/**
 * 模拟分析页面状态
 * @returns {Object} Alpine.js 数据对象
 */
export function useStrategySimulationState() {
  return {
    /** @type {number} 当前活动ID（默认=1） */
    simulation_campaign_id: 1,
    /** @type {Object|null} 基线数据 */
    simulation_baseline: null,
    /** @type {boolean} 基线加载中 */
    loading_baseline: false,
    /** @type {Object|null} 模拟结果 */
    simulation_result: null,
    /** @type {boolean} 模拟运行中 */
    running_simulation: false,
    /** @type {number} 模拟迭代次数 */
    simulation_count: 10000,
    /** @type {string} 模拟名称 */
    simulation_name: '',

    /** @type {string} 当前选中的预设场景键 */
    selected_preset: 'current_real',
    /** @type {Object} 场景配置（可手动微调） */
    simulation_scenario: { ...PRESET_SCENARIOS.current_real },

    /** @type {Object} 提议参数（用户在沙盒中修改的值） */
    proposed_config: { tier_rules: [], matrix_config: [], strategy_config: {} },

    /** @type {Object|null} 用户旅程模拟结果 */
    journey_result: null,
    /** @type {boolean} 用户旅程运行中 */
    running_journey: false,
    /** @type {Object} 用户旅程配置 */
    journey_profile: { budget: 2000, segment_key: 'default', initial_empty_streak: 0 },
    /** @type {number} 用户旅程抽奖次数 */
    journey_draw_count: 20,

    /** @type {Object|null} 灵敏度分析结果 */
    sensitivity_result: null,
    /** @type {boolean} 灵敏度运行中 */
    running_sensitivity: false,
    /** @type {Object} 灵敏度分析参数配置 */
    sensitivity_config: {
      selected_index: 0,
      range_min: 0,
      range_max: 2,
      steps: 10
    },

    /** @type {Object|null} 目标反推结果 */
    recommend_result: null,
    /** @type {boolean} 目标反推运行中 */
    running_recommend: false,
    /** @type {Object} 目标反推约束条件 */
    recommend_constraints: {
      high_rate_min: 0.02,
      high_rate_max: 0.08,
      empty_rate_max: 0.3,
      prize_cost_rate_max: 0.8
    },
    /** @type {Array<string>} 目标反推可调参数 */
    recommend_adjustable_params: [
      'matrix_config.B3_P1.high_multiplier',
      'matrix_config.B3_P1.empty_weight_multiplier',
      'matrix_config.B3_P2.high_multiplier'
    ],

    /** @type {Array} 模拟历史记录列表 */
    simulation_history: [],
    /** @type {number} 模拟历史总数 */
    simulation_history_total: 0,

    /** @type {string} 当前模拟子Tab */
    simulation_sub_tab: 'sandbox',

    /** @type {Object} 预设场景库（供前端渲染） */
    preset_scenarios: PRESET_SCENARIOS,
    /** @type {Array} 灵敏度可扫射参数列表 */
    sensitivity_params: SENSITIVITY_PARAMS,

    /** @type {string} 矩阵编辑视图模式（heatmap/table） */
    matrix_view_mode: 'table',

    // ===== Phase 6: 多方案并排 =====
    /** @type {Array} 保存的方案列表（最多5个） */
    saved_scenarios: [],

    // ===== Phase 6: 一键应用 =====
    /** @type {boolean} 应用确认弹窗显示状态 */
    show_apply_confirm: false,
    /** @type {boolean} 正在应用配置 */
    applying_config: false,
    /** @type {string} 应用模式：immediate/scheduled */
    apply_mode: 'immediate',
    /** @type {string} 定时生效时间 */
    schedule_datetime: '',

    // ===== Phase 8: 运维闭环 =====
    /** @type {Array} 配置版本历史 */
    version_history: [],
    /** @type {number} 版本历史总数 */
    version_history_total: 0,
    /** @type {boolean} 正在加载版本历史 */
    loading_version_history: false,
    /** @type {boolean} 正在执行回滚 */
    rolling_back: false,

    /** @type {Object|null} 预算节奏预测数据 */
    budget_pacing: null,
    /** @type {boolean} 正在加载预算节奏 */
    loading_budget_pacing: false,

    /** @type {Object|null} 熔断监控状态 */
    circuit_breaker_status: null,
    /** @type {boolean} 正在检查熔断状态 */
    loading_circuit_breaker: false
  }
}

/**
 * 模拟分析页面方法
 * @returns {Object} Alpine.js 方法对象
 */
export function useStrategySimulationMethods() {
  return {
    // ===== 核心功能 =====

    /** 加载模拟基线数据 */
    async loadSimulationBaseline() {
      this.loading_baseline = true
      try {
        // apiGet → apiCall → withLoading 返回 { success, data }，需要解包
        const response = await this.apiGet(
          `${SIMULATION_ENDPOINTS.BASELINE}/${this.simulation_campaign_id}`,
          {},
          { showLoading: false }
        )
        const data = response?.success ? response.data : response

        if (!data || !data.campaign) {
          throw new Error('基线数据格式异常')
        }

        // 先填充 proposed_config（确保 x-if 渲染时数据已就绪）
        this.proposed_config.tier_rules = JSON.parse(JSON.stringify(data.tier_rules || []))
        this.proposed_config.matrix_config = JSON.parse(JSON.stringify(data.matrix_config || []))
        this.proposed_config.strategy_config = JSON.parse(
          JSON.stringify(data.strategy_config || {})
        )

        // 最后设置 simulation_baseline（触发 x-if 模板渲染）
        this.simulation_baseline = data

        logger.info('[策略模拟] 基线数据加载完成', {
          tier_rules: this.proposed_config.tier_rules.length,
          matrix_config: this.proposed_config.matrix_config.length,
          strategy_groups: Object.keys(this.proposed_config.strategy_config),
          total_draws: data.actual_distribution?.total_draws
        })
      } catch (error) {
        logger.error('[策略模拟] 基线数据加载失败:', error.message)
        Alpine.store('notification')?.show?.('基线数据加载失败: ' + error.message, 'error')
      } finally {
        this.loading_baseline = false
      }
    },

    /** 切换预设场景 */
    applyPresetScenario(presetKey) {
      const preset = PRESET_SCENARIOS[presetKey]
      if (!preset) return
      this.selected_preset = presetKey
      this.simulation_scenario = {
        ...preset,
        budget_distribution: { ...preset.budget_distribution },
        pressure_distribution: { ...preset.pressure_distribution },
        segment_distribution: { ...preset.segment_distribution }
      }
      logger.info('[策略模拟] 应用预设场景:', presetKey)
    },

    /** 运行 Monte Carlo 模拟 */
    async runMonteCarlo() {
      this.running_simulation = true
      this.simulation_result = null
      try {
        const response = await this.apiCall(SIMULATION_ENDPOINTS.RUN, {
          method: 'POST',
          data: {
            lottery_campaign_id: this.simulation_campaign_id,
            simulation_count: this.simulation_count,
            simulation_name:
              this.simulation_name ||
              `模拟-${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
            proposed_config: this.proposed_config,
            scenario: {
              budget_distribution: this.simulation_scenario.budget_distribution,
              pressure_distribution: this.simulation_scenario.pressure_distribution,
              segment_distribution: this.simulation_scenario.segment_distribution
            }
          }
        })
        const data = response?.success ? response.data : response
        this.simulation_result = data
        this.simulation_sub_tab = 'comparison'
        logger.info('[策略模拟] Monte Carlo 模拟完成', {
          tier_dist: data?.simulation_result?.tier_distribution,
          record_id: data?.lottery_simulation_record_id
        })
        Alpine.store('notification')?.show?.(
          `模拟完成（${this.simulation_count} 次迭代）`,
          'success'
        )
        this.$nextTick(() => this.renderSimulationCharts())
      } catch (error) {
        logger.error('[策略模拟] 模拟运行失败:', error.message)
        Alpine.store('notification')?.show?.('模拟运行失败: ' + error.message, 'error')
      } finally {
        this.running_simulation = false
      }
    },

    /** 运行用户旅程模拟 */
    async runUserJourney() {
      this.running_journey = true
      this.journey_result = null
      try {
        const response = await this.apiCall(SIMULATION_ENDPOINTS.USER_JOURNEY, {
          method: 'POST',
          data: {
            lottery_campaign_id: this.simulation_campaign_id,
            proposed_config: this.proposed_config,
            user_profile: this.journey_profile,
            draw_count: this.journey_draw_count
          }
        })
        const data = response?.success ? response.data : response
        this.journey_result = data
        logger.info('[策略模拟] 用户旅程模拟完成', { draws: data?.draws?.length })
      } catch (error) {
        logger.error('[策略模拟] 用户旅程模拟失败:', error.message)
        Alpine.store('notification')?.show?.('用户旅程模拟失败: ' + error.message, 'error')
      } finally {
        this.running_journey = false
      }
    },

    // ===== Phase 5: 灵敏度分析 + 目标反推 =====

    /** 运行灵敏度分析（使用配置面板中的参数） */
    async runSensitivityFromPanel() {
      const { selected_index, range_min, range_max, steps } = this.sensitivity_config
      const selected_param = this.sensitivity_params[selected_index]
      if (!selected_param) {
        Alpine.store('notification')?.show?.('请先选择扫射参数', 'warning')
        return
      }
      await this.runSensitivity(
        { group: selected_param.group, key: selected_param.key },
        { min: parseFloat(range_min), max: parseFloat(range_max), steps: parseInt(steps) }
      )
    },

    /** 运行灵敏度分析 */
    async runSensitivity(target_param, range) {
      this.running_sensitivity = true
      this.sensitivity_result = null
      try {
        const response = await this.apiCall(SIMULATION_ENDPOINTS.SENSITIVITY, {
          method: 'POST',
          data: {
            lottery_campaign_id: this.simulation_campaign_id,
            target_param,
            range,
            simulation_count_per_step: 5000,
            scenario: {
              budget_distribution: this.simulation_scenario.budget_distribution,
              pressure_distribution: this.simulation_scenario.pressure_distribution,
              segment_distribution: this.simulation_scenario.segment_distribution
            }
          }
        })
        const data = response?.success ? response.data : response
        this.sensitivity_result = data
        logger.info('[策略模拟] 灵敏度分析完成', { points: data?.data_points?.length })
        this.$nextTick(() => this.renderSensitivityChart())
      } catch (error) {
        logger.error('[策略模拟] 灵敏度分析失败:', error.message)
        Alpine.store('notification')?.show?.('灵敏度分析失败: ' + error.message, 'error')
      } finally {
        this.running_sensitivity = false
      }
    },

    /** 运行目标反推（使用面板中的约束条件） */
    async runRecommendFromPanel() {
      const constraints = {
        high_rate: {
          min: parseFloat(this.recommend_constraints.high_rate_min),
          max: parseFloat(this.recommend_constraints.high_rate_max)
        },
        empty_rate: { max: parseFloat(this.recommend_constraints.empty_rate_max) },
        prize_cost_rate: { max: parseFloat(this.recommend_constraints.prize_cost_rate_max) }
      }
      await this.runRecommend(constraints, this.recommend_adjustable_params)
    },

    /** 运行目标反推 */
    async runRecommend(constraints, adjustable_params) {
      this.running_recommend = true
      this.recommend_result = null
      try {
        const response = await this.apiCall(SIMULATION_ENDPOINTS.RECOMMEND, {
          method: 'POST',
          data: {
            lottery_campaign_id: this.simulation_campaign_id,
            constraints,
            adjustable_params,
            scenario: {
              budget_distribution: this.simulation_scenario.budget_distribution,
              pressure_distribution: this.simulation_scenario.pressure_distribution,
              segment_distribution: this.simulation_scenario.segment_distribution
            }
          }
        })
        const data = response?.success ? response.data : response
        this.recommend_result = data
        logger.info('[策略模拟] 目标反推完成', {
          recommendations: data?.recommendations?.length,
          elapsed: data?.search_stats?.elapsed_ms
        })
      } catch (error) {
        logger.error('[策略模拟] 目标反推失败:', error.message)
        Alpine.store('notification')?.show?.('目标反推失败: ' + error.message, 'error')
      } finally {
        this.running_recommend = false
      }
    },

    /** 将推荐方案应用到沙盒 */
    applyRecommendation(recommendation) {
      if (!recommendation?.proposed_changes) return
      for (const [path, value] of Object.entries(recommendation.proposed_changes)) {
        const parts = path.split('.')
        if (parts[0] === 'matrix_config' && parts.length === 3) {
          const [bt, pt] = parts[1].split('_')
          this.updateProposedMatrixValue(bt, pt, parts[2], value)
        }
      }
      Alpine.store('notification')?.show?.('推荐方案已加载到参数沙盒', 'success')
      this.simulation_sub_tab = 'sandbox'
    },

    // ===== Phase 6: 多方案并排比较 =====

    /** 保存当前参数为命名方案 */
    saveCurrentAsScenario() {
      if (this.saved_scenarios.length >= 5) {
        Alpine.store('notification')?.show?.('最多保存5个方案', 'warning')
        return
      }
      if (!this.simulation_result) {
        Alpine.store('notification')?.show?.('请先运行模拟后再保存方案', 'warning')
        return
      }
      const scenarioName = `方案 ${String.fromCharCode(65 + this.saved_scenarios.length)}`
      this.saved_scenarios.push({
        name: scenarioName,
        proposed_config: JSON.parse(JSON.stringify(this.proposed_config)),
        simulation_result: JSON.parse(JSON.stringify(this.simulation_result)),
        saved_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      })
      Alpine.store('notification')?.show?.(`${scenarioName} 已保存`, 'success')
    },

    /** 删除已保存的方案 */
    removeScenario(index) {
      this.saved_scenarios.splice(index, 1)
    },

    /** 从保存的方案加载参数到沙盒 */
    loadScenarioToSandbox(index) {
      const scenario = this.saved_scenarios[index]
      if (!scenario) return
      this.proposed_config = JSON.parse(JSON.stringify(scenario.proposed_config))
      Alpine.store('notification')?.show?.(`已加载 ${scenario.name} 到参数沙盒`, 'success')
      this.simulation_sub_tab = 'sandbox'
    },

    // ===== Phase 6: 一键应用 + 确认弹窗 =====

    /** 打开应用确认弹窗 */
    openApplyConfirm() {
      if (!this.simulation_result?.lottery_simulation_record_id) {
        Alpine.store('notification')?.show?.('请先运行模拟', 'warning')
        return
      }
      this.show_apply_confirm = true
      this.apply_mode = 'immediate'
      this.schedule_datetime = ''
    },

    /** 关闭应用确认弹窗 */
    closeApplyConfirm() {
      this.show_apply_confirm = false
    },

    /** 执行一键应用或定时应用 */
    async executeApply() {
      const recordId = this.simulation_result?.lottery_simulation_record_id
      if (!recordId) return

      this.applying_config = true
      try {
        if (this.apply_mode === 'scheduled' && this.schedule_datetime) {
          const response = await this.apiCall(`${SIMULATION_ENDPOINTS.SCHEDULE}/${recordId}`, {
            method: 'POST',
            data: { scheduled_at: this.schedule_datetime }
          })
          const data = response?.success ? response.data : response
          Alpine.store('notification')?.show?.(
            `配置已设置定时生效: ${this.schedule_datetime}`,
            'success'
          )
          logger.info('[策略模拟] 定时应用设置成功', data)
        } else {
          const response = await this.apiCall(`${SIMULATION_ENDPOINTS.APPLY}/${recordId}`, {
            method: 'POST'
          })
          const data = response?.success ? response.data : response
          Alpine.store('notification')?.show?.('配置已成功应用到线上', 'success')
          logger.info('[策略模拟] 一键应用成功', data)
        }

        this.show_apply_confirm = false
        await this.loadSimulationBaseline()
        await this.loadSimulationHistory()
      } catch (error) {
        logger.error('[策略模拟] 应用配置失败:', error.message)
        Alpine.store('notification')?.show?.('应用配置失败: ' + error.message, 'error')
      } finally {
        this.applying_config = false
      }
    },

    /** 应用后创建熔断监控规则 */
    async createCircuitBreakerAfterApply() {
      const recordId = this.simulation_result?.lottery_simulation_record_id
      if (!recordId) return
      try {
        await this.apiCall(`${SIMULATION_ENDPOINTS.CIRCUIT_BREAKER}/${recordId}`, {
          method: 'POST'
        })
        Alpine.store('notification')?.show?.('熔断监控规则已创建', 'success')
        await this.loadCircuitBreakerStatus()
      } catch (error) {
        Alpine.store('notification')?.show?.('创建监控规则失败: ' + error.message, 'error')
      }
    },

    // ===== Phase 6: 偏差追踪 =====

    /** 计算指定模拟记录的偏差 */
    async calculateDrift(record_id) {
      try {
        const response = await this.apiCall(`${SIMULATION_ENDPOINTS.DRIFT}/${record_id}`, {
          method: 'POST'
        })
        const data = response?.success ? response.data : response
        const idx = this.simulation_history.findIndex(
          h => h.lottery_simulation_record_id === record_id
        )
        if (idx >= 0) {
          this.simulation_history[idx].drift_result = data
        }
        Alpine.store('notification')?.show?.('偏差追踪计算完成', 'success')
        return data
      } catch (error) {
        Alpine.store('notification')?.show?.('偏差追踪失败: ' + error.message, 'error')
        return null
      }
    },

    /** 获取偏差颜色编码 */
    getDriftColor(percentage) {
      if (percentage === null || percentage === undefined) return 'text-gray-400'
      if (percentage < 5) return 'text-green-600'
      if (percentage < 15) return 'text-yellow-600'
      return 'text-red-600'
    },

    // ===== Phase 8: 运维闭环 — 版本历史 + 回滚 =====

    /** 加载配置版本历史 */
    async loadVersionHistory() {
      this.loading_version_history = true
      try {
        const response = await this.apiGet(
          `${SIMULATION_ENDPOINTS.VERSION_HISTORY}/${this.simulation_campaign_id}`,
          { limit: 50, offset: 0 },
          { showLoading: false }
        )
        const data = response?.success ? response.data : response
        this.version_history = data?.records || []
        this.version_history_total = data?.total || 0
        logger.info('[策略模拟] 版本历史加载完成', { total: data?.total })
      } catch (error) {
        logger.error('[策略模拟] 版本历史加载失败:', error.message)
      } finally {
        this.loading_version_history = false
      }
    },

    /** 回滚到指定版本 */
    async rollbackToVersion(log_id) {
      if (!confirm('确认回滚到此版本？这将覆盖当前线上配置。')) return
      this.rolling_back = true
      try {
        const response = await this.apiCall(`${SIMULATION_ENDPOINTS.ROLLBACK}/${log_id}`, {
          method: 'POST'
        })
        const data = response?.success ? response.data : response
        Alpine.store('notification')?.show?.('配置回滚成功', 'success')
        logger.info('[策略模拟] 版本回滚成功', data)
        await this.loadSimulationBaseline()
        await this.loadVersionHistory()
      } catch (error) {
        Alpine.store('notification')?.show?.('回滚失败: ' + error.message, 'error')
      } finally {
        this.rolling_back = false
      }
    },

    // ===== Phase 8: 运维闭环 — 预算节奏预测 =====

    /** 加载预算节奏预测 */
    async loadBudgetPacing() {
      this.loading_budget_pacing = true
      try {
        const response = await this.apiGet(
          `${SIMULATION_ENDPOINTS.BUDGET_PACING}/${this.simulation_campaign_id}`,
          {},
          { showLoading: false }
        )
        const data = response?.success ? response.data : response
        this.budget_pacing = data
        logger.info('[策略模拟] 预算节奏预测加载完成', {
          depletion_days: data?.estimated_depletion_days,
          trend_points: data?.daily_trend?.length
        })
        this.$nextTick(() => this.renderBudgetPacingChart())
      } catch (error) {
        logger.error('[策略模拟] 预算节奏加载失败:', error.message)
      } finally {
        this.loading_budget_pacing = false
      }
    },

    // ===== Phase 8: 运维闭环 — 熔断监控 =====

    /** 加载熔断监控状态 */
    async loadCircuitBreakerStatus() {
      this.loading_circuit_breaker = true
      try {
        const response = await this.apiGet(
          `${SIMULATION_ENDPOINTS.CIRCUIT_BREAKER_STATUS}/${this.simulation_campaign_id}`,
          {},
          { showLoading: false }
        )
        const data = response?.success ? response.data : response
        this.circuit_breaker_status = data
        logger.info('[策略模拟] 熔断状态加载完成', { status: data?.status })
      } catch (error) {
        logger.error('[策略模拟] 熔断状态加载失败:', error.message)
      } finally {
        this.loading_circuit_breaker = false
      }
    },

    /** 获取熔断状态样式 */
    getCircuitBreakerBadge() {
      const status = this.circuit_breaker_status?.status
      if (!status || status === 'no_rules')
        return { text: '未配置', class: 'bg-gray-100 text-gray-600' }
      if (status === 'normal') return { text: '监控中', class: 'bg-green-100 text-green-800' }
      if (status === 'breached') return { text: '已偏离', class: 'bg-red-100 text-red-800' }
      if (status === 'no_recent_data')
        return { text: '无近期数据', class: 'bg-yellow-100 text-yellow-800' }
      return { text: status, class: 'bg-gray-100 text-gray-600' }
    },

    // ===== 历史记录 =====

    /** 加载模拟历史列表 */
    async loadSimulationHistory() {
      try {
        const response = await this.apiGet(
          `${SIMULATION_ENDPOINTS.HISTORY}/${this.simulation_campaign_id}`,
          { limit: 20, offset: 0 },
          { showLoading: false }
        )
        const data = response?.success ? response.data : response
        this.simulation_history = data?.records || []
        this.simulation_history_total = data?.total || 0
        logger.info('[策略模拟] 历史记录加载完成', { count: data?.total })
      } catch (error) {
        logger.error('[策略模拟] 历史记录加载失败:', error.message)
      }
    },

    // ===== 矩阵操作辅助方法 =====

    getProposedMatrixValue(budget_tier, pressure_tier, field) {
      const cell = this.proposed_config.matrix_config?.find(
        m => m.budget_tier === budget_tier && m.pressure_tier === pressure_tier
      )
      return cell ? (cell[field] ?? 0) : 0
    },

    updateProposedMatrixValue(budget_tier, pressure_tier, field, value) {
      const idx = this.proposed_config.matrix_config?.findIndex(
        m => m.budget_tier === budget_tier && m.pressure_tier === pressure_tier
      )
      if (idx >= 0) {
        this.proposed_config.matrix_config[idx][field] = parseFloat(value)
      }
    },

    getBaselineMatrixValue(budget_tier, pressure_tier, field) {
      const cell = this.simulation_baseline?.matrix_config?.find(
        m => m.budget_tier === budget_tier && m.pressure_tier === pressure_tier
      )
      return cell ? (cell[field] ?? 0) : 0
    },

    isMatrixValueChanged(budget_tier, pressure_tier, field) {
      const baseline = this.getBaselineMatrixValue(budget_tier, pressure_tier, field)
      const proposed = this.getProposedMatrixValue(budget_tier, pressure_tier, field)
      return Math.abs(baseline - proposed) > 0.001
    },

    // ===== 风险/样式辅助 =====

    getRiskClass(risk) {
      const map = {
        green: 'bg-green-100 text-green-800',
        yellow: 'bg-yellow-100 text-yellow-800',
        red: 'bg-red-100 text-red-800'
      }
      return map[risk] || 'bg-gray-100 text-gray-800'
    },

    getRiskLabel(risk) {
      const map = { green: '安全', yellow: '关注', red: '危险' }
      return map[risk] || '未知'
    },

    /** 获取操作类型中文描述 */
    getOperationTypeLabel(type) {
      const map = {
        simulation_apply: '模拟配置应用',
        config_rollback: '配置版本回滚',
        strategy_config_update: '策略配置更新',
        matrix_config_update: '矩阵配置更新',
        tier_rules_update: '基础权重更新'
      }
      return map[type] || type
    },

    // ===== 图表渲染 =====

    /** 渲染模拟结果对比图表 */
    async renderSimulationCharts() {
      if (!this.simulation_result?.simulation_result) return

      try {
        const echarts = await loadECharts()
        const simDist = this.simulation_result.simulation_result.tier_distribution
        const actDist = this.simulation_baseline?.actual_distribution?.tier_distribution || {}

        const chartDom = document.getElementById('simulation-tier-chart')
        if (chartDom) {
          const chart = echarts.init(chartDom)
          chart.setOption({
            title: { text: '档位分布对比', left: 'center', textStyle: { fontSize: 14 } },
            tooltip: { trigger: 'axis' },
            legend: { bottom: 0, data: ['当前实际', '模拟预测'] },
            xAxis: { type: 'category', data: ['high', 'mid', 'low', 'fallback'] },
            yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
            series: [
              {
                name: '当前实际',
                type: 'bar',
                data: ['high', 'mid', 'low', 'fallback'].map(t => actDist[t] || 0),
                itemStyle: { color: '#6366f1' }
              },
              {
                name: '模拟预测',
                type: 'bar',
                data: ['high', 'mid', 'low', 'fallback'].map(t => simDist[t] || 0),
                itemStyle: { color: '#f59e0b' }
              }
            ]
          })
        }
      } catch (error) {
        logger.error('[策略模拟] 图表渲染失败:', error.message)
      }
    },

    /** 渲染灵敏度分析图表 */
    async renderSensitivityChart() {
      if (!this.sensitivity_result?.data_points) return

      try {
        const echarts = await loadECharts()
        const points = this.sensitivity_result.data_points
        const chartDom = document.getElementById('sensitivity-chart')
        if (!chartDom) return

        const chart = echarts.init(chartDom)
        chart.setOption({
          title: {
            text: `灵敏度分析: ${this.sensitivity_result.param_path}`,
            left: 'center',
            textStyle: { fontSize: 14 }
          },
          tooltip: { trigger: 'axis' },
          legend: { bottom: 0 },
          xAxis: { type: 'category', data: points.map(p => p.param_value), name: '参数值' },
          yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
          series: [
            {
              name: 'high%',
              type: 'line',
              data: points.map(p => p.tier_distribution?.high || 0),
              smooth: true
            },
            {
              name: 'mid%',
              type: 'line',
              data: points.map(p => p.tier_distribution?.mid || 0),
              smooth: true
            },
            {
              name: 'low%',
              type: 'line',
              data: points.map(p => p.tier_distribution?.low || 0),
              smooth: true
            },
            {
              name: '空奖率%',
              type: 'line',
              data: points.map(p => p.empty_rate || 0),
              smooth: true,
              lineStyle: { type: 'dashed' }
            }
          ]
        })
      } catch (error) {
        logger.error('[策略模拟] 灵敏度图表渲染失败:', error.message)
      }
    },

    // ===== Module 15：模拟报告导出 =====

    /**
     * 导出模拟报告为 PDF
     * 截取对比分析面板图表区域，生成包含参数变更、分布对比、风险评估的完整报告
     */
    async exportReportAsPDF() {
      if (!this.simulation_result) {
        Alpine.store('notification')?.show?.('请先运行模拟后再导出', 'warning')
        return
      }

      try {
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
          import('html2canvas'),
          import('jspdf')
        ])

        const pdf = new jsPDF('p', 'mm', 'a4')
        const pageWidth = pdf.internal.pageSize.getWidth()
        const margin = 15

        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(18)
        pdf.text('策略效果模拟分析报告', pageWidth / 2, 25, { align: 'center' })

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(10)
        const campaignName = this.simulation_baseline?.campaign?.campaign_name || '-'
        const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
        pdf.text(`活动名称: ${campaignName}`, margin, 38)
        pdf.text(`模拟名称: ${this.simulation_result.simulation_name || '未命名'}`, margin, 45)
        pdf.text(`模拟次数: ${this.simulation_result.simulation_count || '-'}`, margin, 52)
        pdf.text(`生成时间: ${now}`, margin, 59)

        let yPos = 70

        pdf.setFontSize(13)
        pdf.setFont('helvetica', 'bold')
        pdf.text('档位分布对比', margin, yPos)
        yPos += 8

        const dist = this.simulation_result.simulation_result?.tier_distribution || {}
        const actDist = this.simulation_baseline?.actual_distribution?.tier_distribution || {}
        const delta = this.simulation_result.comparison?.tier_delta || {}

        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'normal')
        const tierLabels = {
          high: '高档(high)',
          mid: '中档(mid)',
          low: '低档(low)',
          fallback: '空奖(fallback)'
        }
        for (const tier of ['high', 'mid', 'low', 'fallback']) {
          const actual = (actDist[tier] || 0).toFixed(2)
          const sim = (dist[tier] || 0).toFixed(2)
          const d = (delta[tier] || 0).toFixed(2)
          pdf.text(
            `${tierLabels[tier]}: 实际 ${actual}%  →  模拟 ${sim}%  (${d > 0 ? '+' : ''}${d}%)`,
            margin + 5,
            yPos
          )
          yPos += 6
        }

        yPos += 5
        pdf.setFontSize(13)
        pdf.setFont('helvetica', 'bold')
        pdf.text('风险评估', margin, yPos)
        yPos += 8

        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'normal')
        const risk = this.simulation_result.risk_assessment || {}
        const riskLabels = {
          high_tier_risk: '高档率风险',
          empty_rate_risk: '空奖率风险',
          budget_depletion_risk: '预算耗尽风险',
          prize_cost_rate_risk: '奖品成本风险'
        }
        for (const [key, label] of Object.entries(riskLabels)) {
          const level = risk[key] || 'unknown'
          const levelText =
            level === 'green'
              ? '安全'
              : level === 'yellow'
                ? '关注'
                : level === 'red'
                  ? '危险'
                  : '未知'
          pdf.text(`${label}: ${levelText}`, margin + 5, yPos)
          yPos += 6
        }

        yPos += 5
        pdf.setFontSize(13)
        pdf.setFont('helvetica', 'bold')
        pdf.text('体验机制指标', margin, yPos)
        yPos += 8

        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'normal')
        const exp = this.simulation_result.simulation_result?.experience_metrics || {}
        pdf.text(`保底触发率: ${(exp.pity_trigger_rate || 0).toFixed(2)}%`, margin + 5, yPos)
        yPos += 6
        pdf.text(`防连空触发: ${exp.anti_empty_trigger_count || 0} 次`, margin + 5, yPos)
        yPos += 6
        pdf.text(`防连高触发: ${exp.anti_high_trigger_count || 0} 次`, margin + 5, yPos)
        yPos += 6
        pdf.text(
          `平均首次获奖抽数: ${(exp.avg_draws_to_first_non_empty || 0).toFixed(1)}`,
          margin + 5,
          yPos
        )

        const chartDom = document.getElementById('simulation-tier-chart')
        if (chartDom) {
          try {
            const canvas = await html2canvas(chartDom, { scale: 2, useCORS: true })
            const imgData = canvas.toDataURL('image/png')
            pdf.addPage()
            pdf.setFontSize(13)
            pdf.setFont('helvetica', 'bold')
            pdf.text('档位分布对比图表', margin, 20)
            const imgWidth = pageWidth - margin * 2
            const imgHeight = (canvas.height * imgWidth) / canvas.width
            pdf.addImage(imgData, 'PNG', margin, 28, imgWidth, Math.min(imgHeight, 200))
          } catch {
            logger.warn('[策略模拟] 图表截图失败，跳过图表页')
          }
        }

        pdf.setFontSize(7)
        pdf.setTextColor(150)
        pdf.text(
          '本报告由策略模拟系统自动生成',
          pageWidth / 2,
          pdf.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        )

        pdf.save(`模拟报告_${campaignName}_${new Date().toISOString().slice(0, 10)}.pdf`)
        Alpine.store('notification')?.show?.('PDF 报告已导出', 'success')
        logger.info('[策略模拟] PDF报告导出成功')
      } catch (error) {
        logger.error('[策略模拟] PDF导出失败:', error.message)
        Alpine.store('notification')?.show?.(`PDF导出失败: ${error.message}`, 'error')
      }
    },

    /**
     * 导出模拟报告为 Excel
     * 生成包含模拟参数、模拟结果、当前配置对比的多 Sheet 工作簿
     */
    async exportReportAsExcel() {
      if (!this.simulation_result) {
        Alpine.store('notification')?.show?.('请先运行模拟后再导出', 'warning')
        return
      }

      try {
        const XLSX = await import('xlsx')

        const paramRows = []
        paramRows.push(['参数组', '参数项', '当前值', '模拟值'])
        const baseline = this.simulation_baseline || {}
        const proposed = this.simulation_result.proposed_config || this.proposed_config || {}

        if (baseline.strategy_config) {
          for (const [group, config] of Object.entries(baseline.strategy_config)) {
            for (const [key, val] of Object.entries(config || {})) {
              const simVal = proposed.strategy_config?.[group]?.[key]
              paramRows.push([
                group,
                key,
                JSON.stringify(val),
                simVal !== undefined ? JSON.stringify(simVal) : '(未修改)'
              ])
            }
          }
        }
        const paramSheet = XLSX.utils.aoa_to_sheet(paramRows)

        const resultRows = []
        resultRows.push(['指标', '值'])
        const dist = this.simulation_result.simulation_result?.tier_distribution || {}
        resultRows.push(['high 占比(%)', dist.high || 0])
        resultRows.push(['mid 占比(%)', dist.mid || 0])
        resultRows.push(['low 占比(%)', dist.low || 0])
        resultRows.push(['fallback 占比(%)', dist.fallback || 0])
        resultRows.push(['空奖率(%)', this.simulation_result.simulation_result?.empty_rate || 0])

        const exp = this.simulation_result.simulation_result?.experience_metrics || {}
        resultRows.push(['保底触发率(%)', exp.pity_trigger_rate || 0])
        resultRows.push(['防连空触发次数', exp.anti_empty_trigger_count || 0])
        resultRows.push(['防连高触发次数', exp.anti_high_trigger_count || 0])
        resultRows.push(['平均首次获奖抽数', exp.avg_draws_to_first_non_empty || 0])

        const cost = this.simulation_result.simulation_result?.cost_metrics || {}
        resultRows.push(['每千次奖品发放价值', cost.prize_value_per_1000_draws || 0])
        resultRows.push(['奖品成本率', cost.prize_cost_rate || 0])
        const resultSheet = XLSX.utils.aoa_to_sheet(resultRows)

        const compareRows = []
        compareRows.push(['指标', '当前实际', '模拟预测', '变化'])
        const actDist = baseline.actual_distribution?.tier_distribution || {}
        const delta = this.simulation_result.comparison?.tier_delta || {}
        for (const tier of ['high', 'mid', 'low', 'fallback']) {
          compareRows.push([
            `${tier} 占比(%)`,
            actDist[tier] || 0,
            dist[tier] || 0,
            delta[tier] || 0
          ])
        }
        compareRows.push([
          '空奖率(%)',
          actDist.fallback || 0,
          this.simulation_result.simulation_result?.empty_rate || 0,
          this.simulation_result.comparison?.empty_rate_delta || 0
        ])
        const compareSheet = XLSX.utils.aoa_to_sheet(compareRows)

        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, paramSheet, '模拟参数')
        XLSX.utils.book_append_sheet(wb, resultSheet, '模拟结果')
        XLSX.utils.book_append_sheet(wb, compareSheet, '对比分析')

        const campaignName = baseline.campaign?.campaign_name || '模拟'
        XLSX.writeFile(wb, `模拟报告_${campaignName}_${new Date().toISOString().slice(0, 10)}.xlsx`)
        Alpine.store('notification')?.show?.('Excel 报告已导出', 'success')
        logger.info('[策略模拟] Excel报告导出成功')
      } catch (error) {
        logger.error('[策略模拟] Excel导出失败:', error.message)
        Alpine.store('notification')?.show?.(`Excel导出失败: ${error.message}`, 'error')
      }
    },

    /** 渲染预算节奏预测图表 */
    async renderBudgetPacingChart() {
      if (!this.budget_pacing?.daily_trend?.length) return

      try {
        const echarts = await loadECharts()
        const trend = this.budget_pacing.daily_trend
        const chartDom = document.getElementById('budget-pacing-chart')
        if (!chartDom) return

        const chart = echarts.init(chartDom)
        chart.setOption({
          title: { text: '预算消耗趋势', left: 'center', textStyle: { fontSize: 14 } },
          tooltip: { trigger: 'axis' },
          legend: { bottom: 0 },
          xAxis: { type: 'category', data: trend.map(d => d.date), axisLabel: { rotate: 45 } },
          yAxis: [
            { type: 'value', name: '预算消耗', position: 'left' },
            { type: 'value', name: '抽奖次数', position: 'right' }
          ],
          series: [
            {
              name: '日预算消耗',
              type: 'bar',
              data: trend.map(d => d.budget_consumed),
              itemStyle: { color: '#6366f1' }
            },
            {
              name: '日抽奖次数',
              type: 'line',
              yAxisIndex: 1,
              data: trend.map(d => d.draws),
              itemStyle: { color: '#10b981' },
              smooth: true
            }
          ]
        })
      } catch (error) {
        logger.error('[策略模拟] 预算节奏图表渲染失败:', error.message)
      }
    }
  }
}

export default { useStrategySimulationState, useStrategySimulationMethods }
