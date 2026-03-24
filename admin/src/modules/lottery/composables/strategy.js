/**
 * 策略配置模块
 *
 * @file admin/src/modules/lottery/composables/strategy.js
 * @description 抽奖策略配置和层级矩阵管理
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { loadECharts } from '../../../utils/echarts-lazy.js'
import { API_PREFIX } from '../../../api/base.js'

/**
 * 策略配置状态
 * @returns {Object} 状态对象
 */
export function useStrategyState() {
  return {
    /** @type {Array} 策略列表 */
    strategies: [],
    /** @type {Object} 按组分类的策略 */
    strategyGroups: {},
    /** @type {Array} 层级矩阵 */
    tierMatrix: [],
    /** @type {Array} 压力层级 - 使用后端的 P0/P1/P2 格式（Pressure-Only 矩阵） */
    pressureTiers: ['P0', 'P1', 'P2'],
    /** @type {Object} 当前编辑的矩阵单元格（初始化为默认对象避免null访问错误） */
    editingMatrixCell: {
      budget_tier: 'ALL',
      pressure_tier: '',
      cap_multiplier: 1.0,
      empty_weight_multiplier: 1.0,
      high_multiplier: 0.0,
      mid_multiplier: 0.0,
      low_multiplier: 0.0,
      fallback_multiplier: 1.0,
      description: ''
    },

    /** @type {Object} 当前编辑的策略配置项 */
    editingStrategy: {
      lottery_strategy_config_id: null,
      config_group: '',
      config_key: '',
      config_value: '',
      value_type: 'number',
      description: '',
      is_active: true,
      priority: 0
    },
    /** @type {boolean} 策略编辑模式标记 */
    isStrategyEditMode: false,

    // === 策略配置概览摘要（运营辅助信息） ===
    /** @type {Object|null} 策略配置概览数据 */
    strategyConfigSummary: null,
    /** @type {boolean} 概览数据加载状态 */
    loadingConfigSummary: false,

    // === 策略效果分析相关状态 (P2) ===
    /** @type {Object|null} 策略效果分析数据 */
    strategyEffectiveness: null,
    /** @type {boolean} 策略效果分析加载状态 */
    loadingStrategyEffectiveness: false,
    /** @type {Object} 策略效果分析筛选条件 */
    strategyEffectivenessFilters: {
      campaign_id: '',
      start_date: '',
      end_date: ''
    },
    /** @type {boolean} 显示策略效果分析弹窗/页面 */
    showStrategyEffectivenessPanel: false,

    // === 活动级策略开关配置（9策略活动级开关） ===
    /** @type {Object|null} 当前选中活动的策略开关配置 */
    activityStrategyConfig: null,
    /** @type {number|null} 当前选中的活动ID */
    selectedCampaignIdForStrategy: null,
    /** @type {boolean} 活动策略配置加载状态 */
    loadingActivityStrategy: false,
    /** @type {boolean} 活动策略配置保存状态 */
    savingActivityStrategy: false
  }
}

/**
 * 策略配置方法
 * @returns {Object} 方法对象
 */
export function useStrategyMethods() {
  return {
    /**
     * 加载策略列表
     * 使用后端字段：config_group, config_key, config_id
     * @description apiGet 返回的是 response.data（已解包），不是完整响应对象
     */
    async loadStrategies() {
      try {
        logger.debug('[Strategy] loadStrategies 开始执行')
        // apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
        const response = await this.apiGet(
          LOTTERY_ENDPOINTS.STRATEGY_LIST,
          {},
          { showLoading: false }
        )
        logger.debug('[Strategy] API 返回数据:', response)

        // 解包 withLoading 返回的结构
        const data = response?.success ? response.data : response
        logger.debug('[Strategy] 解包后数据:', data)

        if (data) {
          const strategies = data.list || data.strategies || []
          this.strategies = strategies
          // 按 config_group 分组（使用后端字段名）
          this.strategyGroups = strategies.reduce((groups, strategy) => {
            const groupName = strategy.config_group || 'other'
            if (!groups[groupName]) groups[groupName] = []
            groups[groupName].push(strategy)
            return groups
          }, {})
          logger.debug('[Strategy] 策略分组结果:', Object.keys(this.strategyGroups))
          logger.debug('[Strategy] 数据加载完成, strategies:', strategies.length)
        }
      } catch (error) {
        logger.error('[Strategy] loadStrategies 失败:', error)
        this.strategies = []
        this.strategyGroups = {}
      }
    },

    /**
     * 加载策略配置概览摘要（运营辅助信息）
     * 后端端点：GET /api/v4/console/lottery-strategy-stats/config-summary
     * 返回策略总览、活跃活动、最近24h执行概况、BxPx命中分布
     */
    async loadStrategyConfigSummary() {
      this.loadingConfigSummary = true
      try {
        const response = await this.apiGet(
          LOTTERY_ENDPOINTS.STRATEGY_CONFIG_SUMMARY,
          {},
          { showLoading: false }
        )
        const data = response?.success ? response.data : response
        if (data) {
          this.strategyConfigSummary = data
          logger.info('[Strategy] 策略配置概览加载成功', {
            total_strategies: data.config_overview?.total_strategies,
            recent_draws: data.recent_24h?.total_draws
          })
        }
      } catch (error) {
        logger.error('[Strategy] 加载策略配置概览失败:', error)
        this.strategyConfigSummary = null
      } finally {
        this.loadingConfigSummary = false
      }
    },

    /**
     * 获取档位分布百分比文本
     * @param {string} tier - 档位名称 (high/mid/low/fallback)
     * @returns {string} 格式化的百分比
     */
    getConfigSummaryTierPercent(tier) {
      const dist = this.strategyConfigSummary?.recent_24h?.tier_distribution
      const total = this.strategyConfigSummary?.recent_24h?.total_draws
      if (!dist || !total || total === 0) return '0%'
      const count = dist[tier] || 0
      return ((count / total) * 100).toFixed(1) + '%'
    },

    /**
     * 获取 Pressure 命中分布中某 Pressure Tier 的命中数
     * @param {string} pressureTier - P0/P1/P2
     * @returns {number} 命中次数
     */
    getConfigSummaryPressureCount(pressureTier) {
      const hits = this.strategyConfigSummary?.bxpx_hit_distribution || []
      const matching = hits.filter(h => h.pressure_tier === pressureTier)
      return matching.reduce((sum, h) => sum + (parseInt(h.count) || 0), 0)
    },

    /**
     * 加载层级矩阵配置
     * 使用后端字段：budget_tier (B0/B1/B2/B3), pressure_tier (P0/P1/P2)
     * @description apiGet 返回的是 response.data（已解包），不是完整响应对象
     */
    async loadTierMatrix() {
      try {
        logger.debug('[Strategy] loadTierMatrix 开始执行')
        // apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
        const response = await this.apiGet(
          LOTTERY_ENDPOINTS.MATRIX_LIST,
          {},
          { showLoading: false }
        )
        logger.debug('[Strategy] Matrix API 返回数据:', response)

        // 解包 withLoading 返回的结构
        const data = response?.success ? response.data : response
        logger.debug('[Strategy] Matrix 解包后数据:', data)

        if (data) {
          const matrixData = data.list || data.matrix || data
          this.tierMatrix = Array.isArray(matrixData) ? matrixData : []
          logger.debug('[Strategy] Matrix 数据加载完成, count:', this.tierMatrix.length)
        }
      } catch (error) {
        logger.error('[Strategy] loadTierMatrix 失败:', error)
        this.tierMatrix = []
      }
    },

    /**
     * 获取矩阵单元格配置（Pressure-Only，budget_tier 固定 'ALL'）
     * @param {string} pressureTier - 压力层级（P0/P1/P2）
     * @returns {Object|undefined} 矩阵配置对象
     */
    getMatrixConfig(pressureTier) {
      return this.tierMatrix.find(
        item => item.budget_tier === 'ALL' && item.pressure_tier === pressureTier
      )
    },

    /**
     * 编辑矩阵单元格（Pressure-Only）
     * @param {string} pressureTier - 压力层级 (P0/P1/P2)
     */
    editMatrixCell(pressureTier) {
      const currentConfig = this.getMatrixConfig(pressureTier) || {
        budget_tier: 'ALL',
        pressure_tier: pressureTier,
        cap_multiplier: 1.0,
        empty_weight_multiplier: 1.0,
        high_multiplier: 1.0,
        mid_multiplier: 1.0,
        low_multiplier: 1.0,
        fallback_multiplier: 1.0,
        description: ''
      }
      this.editingMatrixCell = { ...currentConfig }
      this.showModal('matrixEditModal')
    },

    /**
     * 提交矩阵配置
     * 使用后端字段格式
     */
    async submitMatrixConfig() {
      try {
        this.saving = true
        // 后端主键字段: lottery_tier_matrix_config_id
        const configId = this.editingMatrixCell.lottery_tier_matrix_config_id
        const url = configId
          ? `${LOTTERY_ENDPOINTS.MATRIX_LIST}/${configId}`
          : LOTTERY_ENDPOINTS.MATRIX_LIST

        // apiCall 成功时返回 response.data，失败时抛出错误
        await this.apiCall(url, {
          method: configId ? 'PUT' : 'POST',
          data: {
            budget_tier: this.editingMatrixCell.budget_tier,
            pressure_tier: this.editingMatrixCell.pressure_tier,
            cap_multiplier: parseFloat(this.editingMatrixCell.cap_multiplier),
            empty_weight_multiplier: parseFloat(this.editingMatrixCell.empty_weight_multiplier),
            // 档位权重乘数（后端P0新增字段）
            high_multiplier: parseFloat(this.editingMatrixCell.high_multiplier) || 0,
            mid_multiplier: parseFloat(this.editingMatrixCell.mid_multiplier) || 0,
            low_multiplier: parseFloat(this.editingMatrixCell.low_multiplier) || 0,
            fallback_multiplier: parseFloat(this.editingMatrixCell.fallback_multiplier) || 1,
            description: this.editingMatrixCell.description
          }
        })

        // 如果没有抛出错误，则表示成功
        this.showSuccess('矩阵配置已更新')
        this.hideModal('matrixEditModal')
        await this.loadTierMatrix()
      } catch (error) {
        this.showError('保存矩阵配置失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 切换策略启用状态
     * @param {Object} strategy - 策略配置对象（包含 lottery_strategy_config_id）
     */
    async toggleStrategyActive(strategy) {
      const id = strategy.lottery_strategy_config_id
      const newActive = !strategy.is_active
      try {
        await this.apiCall(`${LOTTERY_ENDPOINTS.STRATEGY_LIST}/${id}`, {
          method: 'PUT',
          data: { is_active: newActive }
        })
        strategy.is_active = newActive
        this.showSuccess(`策略 ${strategy.config_key} 已${newActive ? '启用' : '禁用'}`)
        logger.info('[Strategy] 切换启用状态', {
          id,
          config_key: strategy.config_key,
          is_active: newActive
        })
      } catch (error) {
        this.showError('切换启用状态失败: ' + (error.message || '未知错误'))
        logger.error('[Strategy] toggleStrategyActive 失败:', error)
      }
    },

    /**
     * 打开策略编辑弹窗
     * @param {Object} strategy - 策略配置对象
     */
    openStrategyEditModal(strategy) {
      const configValue = strategy.parsed_value ?? strategy.config_value
      this.editingStrategy = {
        lottery_strategy_config_id: strategy.lottery_strategy_config_id,
        config_group: strategy.config_group,
        config_key: strategy.config_key,
        config_value:
          typeof configValue === 'object' ? JSON.stringify(configValue) : String(configValue ?? ''),
        value_type: strategy.value_type || this.detectValueType(configValue),
        description: strategy.description || '',
        is_active: strategy.is_active,
        priority: strategy.priority || 0
      }
      this.isStrategyEditMode = true
      this.showModal('strategyEditModal')
    },

    /**
     * 打开新建策略弹窗
     */
    openStrategyCreateModal() {
      this.editingStrategy = {
        lottery_strategy_config_id: null,
        config_group: '',
        config_key: '',
        config_value: '',
        value_type: 'number',
        description: '',
        is_active: true,
        priority: 0
      }
      this.isStrategyEditMode = false
      this.showModal('strategyEditModal')
    },

    /**
     * 提交策略配置（新建或更新）
     */
    async submitStrategyConfig() {
      try {
        this.saving = true
        const data = {
          config_group: this.editingStrategy.config_group,
          config_key: this.editingStrategy.config_key,
          config_value: this.parseConfigValue(
            this.editingStrategy.config_value,
            this.editingStrategy.value_type
          ),
          description: this.editingStrategy.description,
          is_active: this.editingStrategy.is_active,
          priority: parseInt(this.editingStrategy.priority) || 0
        }

        const id = this.editingStrategy.lottery_strategy_config_id
        if (this.isStrategyEditMode && id) {
          await this.apiCall(`${LOTTERY_ENDPOINTS.STRATEGY_LIST}/${id}`, { method: 'PUT', data })
          this.showSuccess('策略配置已更新')
        } else {
          await this.apiCall(LOTTERY_ENDPOINTS.STRATEGY_LIST, { method: 'POST', data })
          this.showSuccess('策略配置已创建')
        }

        this.hideModal('strategyEditModal')
        await this.loadStrategies()
      } catch (error) {
        this.showError('保存策略配置失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 删除策略配置（需确认）
     * @param {Object} strategy - 策略配置对象
     */
    async deleteStrategy(strategy) {
      const id = strategy.lottery_strategy_config_id
      if (!confirm(`确定删除策略 "${strategy.config_key}" 吗？此操作不可撤销。`)) return
      try {
        await this.apiCall(`${LOTTERY_ENDPOINTS.STRATEGY_LIST}/${id}`, { method: 'DELETE' })
        this.showSuccess('策略配置已删除')
        await this.loadStrategies()
      } catch (error) {
        this.showError('删除策略配置失败: ' + (error.message || '未知错误'))
      }
    },

    /**
     * 推断配置值类型
     * @param {*} value - 配置值
     * @returns {string} 值类型
     */
    detectValueType(value) {
      if (typeof value === 'boolean') return 'boolean'
      if (typeof value === 'number') return 'number'
      if (typeof value === 'object' && value !== null) return 'object'
      if (Array.isArray(value)) return 'array'
      return 'string'
    },

    /**
     * 解析配置值为正确类型
     * @param {string} rawValue - 原始字符串值
     * @param {string} valueType - 目标类型
     * @returns {*} 解析后的值
     */
    parseConfigValue(rawValue, valueType) {
      switch (valueType) {
        case 'number':
          return parseFloat(rawValue) || 0
        case 'boolean':
          return rawValue === 'true' || rawValue === true
        case 'object':
        case 'array':
          try {
            return JSON.parse(rawValue)
          } catch {
            return rawValue
          }
        default:
          return rawValue
      }
    },

    /**
     * 获取可用的 config_group 选项列表
     * @returns {Array} 分组选项
     */
    getConfigGroupOptions() {
      return [
        { value: 'anti_empty', label: '防空奖保护' },
        { value: 'anti_high', label: '防连高保护' },
        { value: 'pity', label: '保底机制' },
        { value: 'luck_debt', label: '运气债务' },
        { value: 'budget_tier', label: '预算层级' },
        { value: 'pressure_tier', label: '压力层级' },
        { value: 'segment', label: '用户分群策略' },
        { value: 'guarantee', label: '固定间隔保底' },
        { value: 'tier_fallback', label: '档位兜底奖品' },
        { value: 'preset', label: '预设队列控制' }
      ]
    },

    /**
     * 获取策略分组 Emoji 图标
     * @param {string} groupName - 分组名称（后端的 config_group）
     * @returns {string} Emoji 图标
     */
    getStrategyGroupIcon(groupName) {
      const icons = {
        anti_empty: '🛡️',
        anti_high: '🔒',
        pity: '⚙️',
        luck_debt: '🎰',
        budget_tier: '📊',
        pressure_tier: '🔥',
        segment: '👥',
        guarantee: '🎯',
        tier_fallback: '🔄',
        preset: '📋',
        probability: '🎲',
        frequency: '⏱️',
        budget: '💰',
        win_rate: '🎯',
        empty_weight: '⚖️',
        user: '👤',
        other: '⚙️'
      }
      return icons[groupName] || '⚙️'
    },

    /**
     * 获取策略分组名称
     * 使用后端的 config_group 字段值
     * @param {string} groupName - 分组名称（后端的 config_group）
     * @returns {string} 分组中文名称
     */
    getStrategyGroupName(groupName) {
      const names = {
        anti_empty: '防空奖保护',
        anti_high: '防连高保护',
        pity: '保底机制',
        luck_debt: '运气债务',
        budget_tier: '预算层级',
        pressure_tier: '压力层级',
        segment: '用户分群策略',
        guarantee: '固定间隔保底',
        tier_fallback: '档位兜底奖品',
        preset: '预设队列控制',
        probability: '概率策略',
        frequency: '频率控制',
        budget: '预算管理',
        win_rate: '中奖率配置',
        empty_weight: '空奖权重',
        user: '用户限制',
        other: '其他策略'
      }
      return names[groupName] || groupName
    },

    /**
     * 获取策略分组描述 - 帮助运营人员理解每个分组的用途
     * @param {string} groupName - 分组名称（后端的 config_group）
     * @returns {string} 分组用途描述
     */
    getStrategyGroupDescription(groupName) {
      const descriptions = {
        anti_empty: '防止用户连续多次抽奖都不中奖，达到阈值后自动提升中奖概率',
        anti_high: '防止用户连续获得高价值奖品，达到阈值后降低高档位概率',
        pity: '当用户连续未获得好奖品时，自动触发保底奖励',
        luck_debt: '追踪用户的运气偏差度，自动回归均值',
        budget_tier: '根据预算消耗情况动态调整策略',
        pressure_tier: '根据系统压力自动调控出奖力度',
        segment: '根据用户分群（新用户/老用户/VIP等）应用不同策略版本',
        guarantee: '每隔固定次数必定给予指定奖品，与 pity 保底是不同机制',
        tier_fallback: '当某档位奖品库存耗尽时的兜底替代奖品',
        preset: '运气债务预设队列开关，控制是否启用预设结果',
        probability: '控制各档位奖品的基础概率分配',
        frequency: '限制抽奖频率，防止异常高频操作',
        budget: '控制奖品发放预算上限和速率',
        win_rate: '设置不同场景下的基础中奖概率',
        empty_weight: '调节空奖权重，优化用户体验',
        user: '针对单个用户的抽奖频次和额度限制',
        other: '其他辅助性策略参数配置'
      }
      return descriptions[groupName] || ''
    },

    /**
     * 获取策略分组样式 - 返回左边框颜色和背景色的 Tailwind 类
     * @param {string} groupName - 分组名称（后端的 config_group）
     * @returns {Object} { border: 边框色类, bg: 标题背景色类, badge: 徽章样式类 }
     */
    getStrategyGroupStyle(groupName) {
      const styles = {
        anti_empty: {
          border: 'border-l-4 border-l-blue-500',
          bg: 'bg-blue-50',
          badge: 'bg-blue-100 text-blue-700'
        },
        anti_high: {
          border: 'border-l-4 border-l-orange-500',
          bg: 'bg-orange-50',
          badge: 'bg-orange-100 text-orange-700'
        },
        pity: {
          border: 'border-l-4 border-l-purple-500',
          bg: 'bg-purple-50',
          badge: 'bg-purple-100 text-purple-700'
        },
        luck_debt: {
          border: 'border-l-4 border-l-teal-500',
          bg: 'bg-teal-50',
          badge: 'bg-teal-100 text-teal-700'
        },
        budget_tier: {
          border: 'border-l-4 border-l-indigo-500',
          bg: 'bg-indigo-50',
          badge: 'bg-indigo-100 text-indigo-700'
        },
        pressure_tier: {
          border: 'border-l-4 border-l-red-500',
          bg: 'bg-red-50',
          badge: 'bg-red-100 text-red-700'
        },
        segment: {
          border: 'border-l-4 border-l-cyan-500',
          bg: 'bg-cyan-50',
          badge: 'bg-cyan-100 text-cyan-700'
        },
        guarantee: {
          border: 'border-l-4 border-l-emerald-500',
          bg: 'bg-emerald-50',
          badge: 'bg-emerald-100 text-emerald-700'
        },
        tier_fallback: {
          border: 'border-l-4 border-l-amber-500',
          bg: 'bg-amber-50',
          badge: 'bg-amber-100 text-amber-700'
        },
        preset: {
          border: 'border-l-4 border-l-pink-500',
          bg: 'bg-pink-50',
          badge: 'bg-pink-100 text-pink-700'
        },
        probability: {
          border: 'border-l-4 border-l-violet-500',
          bg: 'bg-violet-50',
          badge: 'bg-violet-100 text-violet-700'
        },
        frequency: {
          border: 'border-l-4 border-l-amber-500',
          bg: 'bg-amber-50',
          badge: 'bg-amber-100 text-amber-700'
        },
        budget: {
          border: 'border-l-4 border-l-emerald-500',
          bg: 'bg-emerald-50',
          badge: 'bg-emerald-100 text-emerald-700'
        },
        win_rate: {
          border: 'border-l-4 border-l-pink-500',
          bg: 'bg-pink-50',
          badge: 'bg-pink-100 text-pink-700'
        },
        empty_weight: {
          border: 'border-l-4 border-l-cyan-500',
          bg: 'bg-cyan-50',
          badge: 'bg-cyan-100 text-cyan-700'
        },
        user: {
          border: 'border-l-4 border-l-sky-500',
          bg: 'bg-sky-50',
          badge: 'bg-sky-100 text-sky-700'
        },
        other: {
          border: 'border-l-4 border-l-gray-400',
          bg: 'bg-gray-50',
          badge: 'bg-gray-100 text-gray-600'
        }
      }
      return styles[groupName] || styles.other
    },

    /**
     * 获取策略配置项的中文标签
     * 将后端 config_key 转换为运营人员可理解的中文名称
     * @param {string} configKey - 后端 config_key 字段
     * @returns {string} 中文标签
     */
    getConfigKeyLabel(configKey) {
      const labels = {
        anti_empty: '防空奖保护',
        anti_high: '防连高保护',
        amt_high: '高档位金额阈值',
        amt_low: '低档位金额阈值',
        enabled: '启用状态',
        threshold_high: '高档位触发阈值',
        threshold_low: '低档位触发阈值',
        threshold_mid: '中档位触发阈值',
        pity: '保底机制',
        luck_debt: '运气债务',
        hard_guarantee_threshold: '硬保底阈值',
        expected_empty_rate: '预期空奖率',
        min_draw_count: '最少抽奖次数',
        recent_draw_window: '近期抽奖窗口',
        empty_streak_threshold: '连空触发阈值',
        high_streak_threshold: '连高触发阈值',
        multiplier_table: '保底倍率表',
        min_non_empty_cost: '最低非空奖成本',
        debt_enabled: '债务预抽开关'
      }
      return labels[configKey] || configKey
    },

    /**
     * 获取策略配置项的描述说明
     * @param {string} configKey - 后端 config_key 字段
     * @returns {string} 描述说明
     */
    getConfigKeyDescription(configKey) {
      const descriptions = {
        anti_empty: '防止用户连续多次抽奖都不中奖，达到阈值后自动提升中奖概率',
        anti_high: '防止用户连续获得高价值奖品，达到阈值后降低高档位概率',
        amt_high: '金额达到此值及以上视为高档位奖品',
        amt_low: '金额低于此值视为低档位奖品',
        enabled: '是否启用此策略项',
        threshold_high: '触发高档位调控的连续次数阈值',
        threshold_low: '触发低档位调控的连续次数阈值',
        threshold_mid: '触发中档位调控的连续次数阈值',
        pity: '当用户连续未获得好奖品时，自动触发保底奖励',
        luck_debt: '追踪用户的运气偏差度，自动回归均值',
        hard_guarantee_threshold: '绝对保底次数，超过此次数必定中高档奖品',
        expected_empty_rate: '系统预期的正常空奖概率比例',
        min_draw_count: '策略生效所需的最少抽奖次数',
        recent_draw_window: '参与策略计算的近期抽奖记录数量',
        empty_streak_threshold: '连续空奖达到此次数后触发保护机制',
        high_streak_threshold: '连续获得高奖品达到此次数后触发限制',
        multiplier_table: '保底系统的连续未中奖次数对应的概率提升倍率映射表',
        min_non_empty_cost: '最低非空奖品的成本阈值，用于保底系统判断'
      }
      return descriptions[configKey] || ''
    },

    /**
     * 格式化策略配置值的显示
     * @param {*} value - 配置值（parsed_value）
     * @param {string} configKey - 配置项键名
     * @returns {string} 格式化后的显示文本
     */
    formatStrategyValue(value, configKey) {
      if (value === null || value === undefined) return '-'
      if (typeof value === 'boolean') return value ? '是' : '否'
      if (typeof value === 'object') return JSON.stringify(value)
      if (configKey && (configKey.includes('rate') || configKey.includes('weight'))) {
        return (parseFloat(value) * 100).toFixed(1) + '%'
      }
      if (configKey && configKey.includes('amt')) {
        return '¥' + parseFloat(value).toFixed(2)
      }
      return String(value)
    },

    /**
     * 获取预算层级显示名称
     * @param {string} tier - 后端格式 B0/B1/B2/B3
     * @returns {string} 显示名称
     */
    getBudgetTierName(tier) {
      const names = { B0: '低', B1: '中', B2: '高', B3: '特高' }
      return names[tier] || tier
    },

    /**
     * 获取压力层级显示名称
     * @param {string} tier - 后端格式 P0/P1/P2
     * @returns {string} 显示名称
     */
    getPressureTierName(tier) {
      const names = { P0: '低压', P1: '中压', P2: '高压' }
      return names[tier] || tier
    },

    // === 策略效果分析方法 (P2) ===

    /**
     * 加载策略效果分析数据
     */
    async loadStrategyEffectiveness() {
      this.loadingStrategyEffectiveness = true
      this.strategyEffectiveness = null
      try {
        const params = new URLSearchParams()
        // 后端参数名: lottery_campaign_id, start_date, end_date
        if (this.strategyEffectivenessFilters.campaign_id) {
          params.append('lottery_campaign_id', this.strategyEffectivenessFilters.campaign_id)
        }
        if (this.strategyEffectivenessFilters.start_date) {
          params.append('start_date', this.strategyEffectivenessFilters.start_date)
        }
        if (this.strategyEffectivenessFilters.end_date) {
          params.append('end_date', this.strategyEffectivenessFilters.end_date)
        }

        const queryString = params.toString() ? `?${params.toString()}` : ''
        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.STRATEGY_EFFECTIVENESS}${queryString}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          this.strategyEffectiveness = response.data
          logger.info('[Strategy] 策略效果分析加载成功', {
            period: response.data?.analysis_period
          })
          // P2#12: 加载策略触发热力图
          this.$nextTick(() => this.renderStrategyTriggerHeatmap())
        } else {
          this.showError('加载策略效果分析失败: ' + (response?.message || '未知错误'))
        }
      } catch (error) {
        logger.error('[Strategy] 加载策略效果分析失败:', error)
        this.showError('加载策略效果分析失败: ' + (error.message || '网络错误'))
      } finally {
        this.loadingStrategyEffectiveness = false
      }
    },

    /**
     * 刷新策略效果分析
     */
    async refreshStrategyEffectiveness() {
      await this.loadStrategyEffectiveness()
      if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
        Alpine.store('notification').success('策略效果分析已刷新')
      }
    },

    /**
     * 应用策略效果分析筛选
     */
    async applyStrategyEffectivenessFilters() {
      await this.loadStrategyEffectiveness()
    },

    /**
     * 重置策略效果分析筛选
     */
    async resetStrategyEffectivenessFilters() {
      this.strategyEffectivenessFilters = {
        campaign_id: '',
        start_date: '',
        end_date: ''
      }
      await this.loadStrategyEffectiveness()
    },

    /**
     * 打开策略效果分析面板
     */
    async openStrategyEffectivenessPanel() {
      this.showStrategyEffectivenessPanel = true
      await this.loadStrategyEffectiveness()
    },

    /**
     * 关闭策略效果分析面板
     */
    closeStrategyEffectivenessPanel() {
      this.showStrategyEffectivenessPanel = false
    },

    /**
     * 获取BxPx矩阵单元格颜色
     * 基于 rate 生成热力图颜色
     * @param {number} rate - 命中率百分比 (0-100)，后端返回格式
     * @returns {string} 背景色CSS类
     */
    getBxPxHeatmapColor(rate) {
      if (rate === null || rate === undefined) return 'bg-gray-100'
      if (rate >= 80) return 'bg-red-500 text-white'
      if (rate >= 60) return 'bg-orange-400 text-white'
      if (rate >= 40) return 'bg-yellow-300 text-gray-800'
      if (rate >= 20) return 'bg-green-300 text-gray-800'
      return 'bg-green-100 text-gray-600'
    },

    /**
     * 获取策略评分颜色
     * @param {number} score - 评分 (0-100)
     * @returns {string} CSS类
     */
    getStrategyScoreColor(score) {
      if (score >= 80) return 'text-green-600'
      if (score >= 60) return 'text-yellow-600'
      if (score >= 40) return 'text-orange-600'
      return 'text-red-600'
    },

    /**
     * 获取优化建议优先级样式
     * @param {string} priority - 优先级 (high, medium, low)
     * @returns {string} CSS类
     */
    getRecommendationPriorityStyle(priority) {
      const styles = {
        high: 'bg-red-100 border-l-4 border-red-500 text-red-700',
        medium: 'bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700',
        low: 'bg-blue-100 border-l-4 border-blue-500 text-blue-700'
      }
      return styles[priority] || styles.low
    },

    /**
     * 格式化百分比
     * @param {number} value - 数值 (0-1)
     * @returns {string} 格式化的百分比
     */
    formatStrategyPercentage(value) {
      if (value === null || value === undefined) return '-'
      return `${(value * 100).toFixed(2)}%`
    },

    /**
     * P2#12: 渲染策略触发频率热力图
     * @description 使用 ECharts 渲染 pity/anti_empty/anti_high/luck_debt 各日触发次数的堆叠柱状图
     * 数据来源: lottery-strategy-stats/daily/:campaign_id API 返回的 lottery_daily_metrics 字段
     */
    async renderStrategyTriggerHeatmap() {
      try {
        const echarts = await loadECharts()
        const chartDom = document.getElementById('strategyTriggerHeatmapChart')
        if (!chartDom) {
          logger.warn('[P2-12] 策略触发热力图容器不存在')
          return
        }

        // 获取活动ID
        const campaignId = this.strategyEffectivenessFilters?.campaign_id || this.selectedCampaignId
        if (!campaignId) {
          logger.info('[P2-12] 未选择活动，使用汇总数据展示')
        }

        // 尝试从 daily metrics API 加载数据
        // 后端返回结构: { data: { lottery_campaign_id, data: [...] } } 或 { data: { data: { data: [...] } } }
        let dailyData = []
        if (campaignId) {
          try {
            const response = await this.apiGet(
              `${API_PREFIX}/console/lottery-strategy-stats/daily/${campaignId}`,
              {},
              { showLoading: false }
            )
            if (response?.success && response.data?.data) {
              let rawData = response.data.data
              // 处理嵌套data结构
              if (rawData && !Array.isArray(rawData) && rawData.data) {
                rawData = rawData.data
              }
              dailyData = Array.isArray(rawData) ? rawData : []
            }
          } catch (e) {
            logger.warn('[P2-12] 获取日级策略统计失败:', e.message)
          }
        }

        // 准备图表数据
        const dates = dailyData.map(d => d.metric_date || d.date || '')
        const pityData = dailyData.map(d => d.pity_trigger_count || d.pity_triggered_count || 0)
        const antiEmptyData = dailyData.map(
          d => d.anti_empty_trigger_count || d.anti_empty_triggered_count || 0
        )
        const antiHighData = dailyData.map(
          d => d.anti_high_trigger_count || d.anti_high_triggered_count || 0
        )
        const luckDebtData = dailyData.map(
          d => d.luck_debt_trigger_count || d.luck_debt_triggered_count || 0
        )

        // 销毁旧实例
        const existingChart = echarts.getInstanceByDom(chartDom)
        if (existingChart) existingChart.dispose()

        const chart = echarts.init(chartDom)

        const option = {
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' }
          },
          legend: {
            data: ['保底机制', '防连空', '防连高', '运气债务'],
            bottom: 0,
            textStyle: { fontSize: 11 }
          },
          grid: {
            left: '3%',
            right: '4%',
            bottom: '15%',
            top: '10%',
            containLabel: true
          },
          xAxis: {
            type: 'category',
            data: dates.length > 0 ? dates : ['暂无数据'],
            axisLabel: { fontSize: 10, rotate: dates.length > 10 ? 30 : 0 }
          },
          yAxis: {
            type: 'value',
            name: '触发次数',
            nameTextStyle: { fontSize: 11 }
          },
          series: [
            {
              name: '保底机制',
              type: 'bar',
              stack: 'triggers',
              data: pityData.length > 0 ? pityData : [0],
              itemStyle: { color: '#8B5CF6' }
            },
            {
              name: '防连空',
              type: 'bar',
              stack: 'triggers',
              data: antiEmptyData.length > 0 ? antiEmptyData : [0],
              itemStyle: { color: '#3B82F6' }
            },
            {
              name: '防连高',
              type: 'bar',
              stack: 'triggers',
              data: antiHighData.length > 0 ? antiHighData : [0],
              itemStyle: { color: '#F97316' }
            },
            {
              name: '运气债务',
              type: 'bar',
              stack: 'triggers',
              data: luckDebtData.length > 0 ? luckDebtData : [0],
              itemStyle: { color: '#22C55E' }
            }
          ]
        }

        chart.setOption(option)

        // 响应式
        window.addEventListener('resize', () => chart.resize())

        logger.info('[P2-12] 策略触发热力图渲染完成', { dataPoints: dates.length })
      } catch (error) {
        logger.error('[P2-12] 渲染策略触发热力图失败:', error.message)
      }
    },

    // ========== 活动级策略开关配置（9策略活动级开关） ==========

    /**
     * 加载指定活动的策略配置
     * @param {number} lottery_campaign_id - 活动ID
     */
    async loadActivityStrategyConfig(lottery_campaign_id) {
      if (!lottery_campaign_id) return
      this.selectedCampaignIdForStrategy = lottery_campaign_id
      this.loadingActivityStrategy = true
      try {
        const response = await this.apiGet(
          `${API_PREFIX}/console/lottery-campaigns/${lottery_campaign_id}/strategy-config`,
          {},
          { showLoading: false }
        )
        this.activityStrategyConfig = response?.config || response?.data?.config || null
        logger.info('[Strategy] 活动策略配置加载成功', {
          lottery_campaign_id,
          groups: this.activityStrategyConfig ? Object.keys(this.activityStrategyConfig) : []
        })
      } catch (error) {
        logger.error('[Strategy] 加载活动策略配置失败:', error)
        this.activityStrategyConfig = null
      } finally {
        this.loadingActivityStrategy = false
      }
    },

    /**
     * 更新活动策略开关（单个config_group内的配置）
     * @param {string} config_group - 配置分组（如 pity, anti_empty）
     * @param {string} config_key - 配置键名（如 enabled）
     * @param {*} config_value - 新值
     */
    async updateActivityStrategySetting(config_group, config_key, config_value) {
      const lottery_campaign_id = this.selectedCampaignIdForStrategy
      if (!lottery_campaign_id) return

      this.savingActivityStrategy = true
      try {
        await this.apiCall(
          `${API_PREFIX}/console/lottery-campaigns/${lottery_campaign_id}/strategy-config`,
          {
            method: 'PUT',
            data: { config: { [config_group]: { [config_key]: config_value } } }
          }
        )

        /* 更新本地状态 */
        if (this.activityStrategyConfig && this.activityStrategyConfig[config_group]) {
          this.activityStrategyConfig[config_group][config_key] = config_value
        }

        this.showSuccess(`策略配置已更新: ${config_group}.${config_key}`)
        logger.info('[Strategy] 活动策略配置更新成功', {
          lottery_campaign_id,
          config_group,
          config_key,
          config_value
        })
      } catch (error) {
        this.showError('更新策略配置失败: ' + (error.message || '未知错误'))
        logger.error('[Strategy] 更新活动策略配置失败:', error)
      } finally {
        this.savingActivityStrategy = false
      }
    },

    /**
     * 切换策略开关（布尔值取反）
     * @param {string} config_group - 配置分组
     * @param {string} [config_key='enabled'] - 开关键名（preset 使用 debt_enabled）
     */
    async toggleActivityStrategySwitch(config_group, config_key = 'enabled') {
      const current = this.activityStrategyConfig?.[config_group]?.[config_key]
      if (current === undefined) return
      await this.updateActivityStrategySetting(config_group, config_key, !current)
    }
  }
}

export default { useStrategyState, useStrategyMethods }
