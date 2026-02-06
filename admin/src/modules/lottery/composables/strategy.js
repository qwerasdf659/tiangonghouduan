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
    /** @type {Array} 预算层级 - 使用后端的 B0/B1/B2/B3 格式 */
    budgetTiers: ['B0', 'B1', 'B2', 'B3'],
    /** @type {Array} 压力层级 - 使用后端的 P0/P1/P2 格式 */
    pressureTiers: ['P0', 'P1', 'P2'],
    /** @type {Object} 当前编辑的矩阵单元格（初始化为默认对象避免null访问错误） */
    editingMatrixCell: {
      budget_tier: '',
      pressure_tier: '',
      cap_multiplier: 1.0,
      empty_weight_multiplier: 1.0,
      // 档位权重乘数（后端P0新增字段）
      high_multiplier: 0.0,
      mid_multiplier: 0.0,
      low_multiplier: 0.0,
      fallback_multiplier: 1.0,
      description: ''
    },

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
    showStrategyEffectivenessPanel: false
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
     * 获取矩阵单元格配置
     * @param {string} budgetTier - 预算层级
     * @param {string} pressureTier - 压力层级
     * @returns {Object|undefined} 矩阵配置对象
     */
    getMatrixConfig(budgetTier, pressureTier) {
      return this.tierMatrix.find(
        item => item.budget_tier === budgetTier && item.pressure_tier === pressureTier
      )
    },

    /**
     * 编辑矩阵单元格
     * 使用后端字段：cap_multiplier, empty_weight_multiplier
     * @param {string} budgetTier - 预算层级 (B0/B1/B2/B3)
     * @param {string} pressureTier - 压力层级 (P0/P1/P2)
     */
    editMatrixCell(budgetTier, pressureTier) {
      const currentConfig = this.getMatrixConfig(budgetTier, pressureTier) || {
        budget_tier: budgetTier,
        pressure_tier: pressureTier,
        cap_multiplier: 1.0,
        empty_weight_multiplier: 1.0,
        // 档位权重乘数默认值
        high_multiplier: 0.0,
        mid_multiplier: 0.0,
        low_multiplier: 0.0,
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
     * 获取策略分组图标
     * @param {string} groupName - 分组名称
     * @returns {string} Bootstrap图标类名
     */
    getStrategyGroupIcon(groupName) {
      const icons = {
        probability: 'bi-percent',
        frequency: 'bi-clock',
        budget: 'bi-cash',
        user: 'bi-person',
        other: 'bi-gear'
      }
      return icons[groupName] || 'bi-gear'
    },

    /**
     * 获取策略分组名称
     * 使用后端的 config_group 字段值
     * @param {string} groupName - 分组名称（后端的 config_group）
     * @returns {string} 分组中文名称
     */
    getStrategyGroupName(groupName) {
      const names = {
        probability: '概率策略',
        frequency: '频率控制',
        budget: '预算管理',
        budget_tier: '预算层级',
        pressure_tier: '压力层级',
        win_rate: '中奖率配置',
        empty_weight: '空奖权重',
        user: '用户限制',
        other: '其他策略'
      }
      return names[groupName] || groupName
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
    }
  }
}

export default { useStrategyState, useStrategyMethods }
