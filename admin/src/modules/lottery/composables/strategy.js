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
     * 获取策略分组 Emoji 图标
     * @param {string} groupName - 分组名称（后端的 config_group）
     * @returns {string} Emoji 图标
     */
    getStrategyGroupIcon(groupName) {
      const icons = {
        probability: '🎲',
        frequency: '⏱️',
        budget: '💰',
        budget_tier: '📊',
        pressure_tier: '🔥',
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
     * 获取策略分组描述 - 帮助运营人员理解每个分组的用途
     * @param {string} groupName - 分组名称（后端的 config_group）
     * @returns {string} 分组用途描述
     */
    getStrategyGroupDescription(groupName) {
      const descriptions = {
        probability: '控制各档位奖品的基础概率分配',
        frequency: '限制抽奖频率，防止异常高频操作',
        budget: '控制奖品发放预算上限和速率',
        budget_tier: '根据预算消耗情况动态调整策略',
        pressure_tier: '根据系统压力自动调控出奖力度',
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
        probability: { border: 'border-l-4 border-l-purple-500', bg: 'bg-purple-50', badge: 'bg-purple-100 text-purple-700' },
        frequency: { border: 'border-l-4 border-l-amber-500', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-700' },
        budget: { border: 'border-l-4 border-l-emerald-500', bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700' },
        budget_tier: { border: 'border-l-4 border-l-blue-500', bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-700' },
        pressure_tier: { border: 'border-l-4 border-l-red-500', bg: 'bg-red-50', badge: 'bg-red-100 text-red-700' },
        win_rate: { border: 'border-l-4 border-l-indigo-500', bg: 'bg-indigo-50', badge: 'bg-indigo-100 text-indigo-700' },
        empty_weight: { border: 'border-l-4 border-l-teal-500', bg: 'bg-teal-50', badge: 'bg-teal-100 text-teal-700' },
        user: { border: 'border-l-4 border-l-cyan-500', bg: 'bg-cyan-50', badge: 'bg-cyan-100 text-cyan-700' },
        other: { border: 'border-l-4 border-l-gray-400', bg: 'bg-gray-50', badge: 'bg-gray-100 text-gray-600' }
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
        high_streak_threshold: '连高触发阈值'
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
        high_streak_threshold: '连续获得高奖品达到此次数后触发限制'
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
        const antiEmptyData = dailyData.map(d => d.anti_empty_trigger_count || d.anti_empty_triggered_count || 0)
        const antiHighData = dailyData.map(d => d.anti_high_trigger_count || d.anti_high_triggered_count || 0)
        const luckDebtData = dailyData.map(d => d.luck_debt_trigger_count || d.luck_debt_triggered_count || 0)

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
            data: ['Pity(保底)', 'AntiEmpty(反连空)', 'AntiHigh(反连高)', 'LuckDebt(运气债务)'],
            bottom: 0,
            textStyle: { fontSize: 11 }
          },
          grid: {
            left: '3%', right: '4%', bottom: '15%', top: '10%',
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
              name: 'Pity(保底)',
              type: 'bar',
              stack: 'triggers',
              data: pityData.length > 0 ? pityData : [0],
              itemStyle: { color: '#8B5CF6' }
            },
            {
              name: 'AntiEmpty(反连空)',
              type: 'bar',
              stack: 'triggers',
              data: antiEmptyData.length > 0 ? antiEmptyData : [0],
              itemStyle: { color: '#3B82F6' }
            },
            {
              name: 'AntiHigh(反连高)',
              type: 'bar',
              stack: 'triggers',
              data: antiHighData.length > 0 ? antiHighData : [0],
              itemStyle: { color: '#F97316' }
            },
            {
              name: 'LuckDebt(运气债务)',
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
    }
  }
}

export default { useStrategyState, useStrategyMethods }
