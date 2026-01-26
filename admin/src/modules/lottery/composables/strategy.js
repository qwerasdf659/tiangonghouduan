/**
 * 策略配置模块
 *
 * @file admin/src/modules/lottery/composables/strategy.js
 * @description 抽奖策略配置和层级矩阵管理
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery.js'
import { buildURL } from '../../../api/base.js'

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
      win_probability: 0.1,
      cap: 100,
      empty_weight: 1.0,
      description: ''
    }
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
        console.log('⚙️ [Strategy] loadStrategies 开始执行')
        // apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
        const response = await this.apiGet(
          LOTTERY_ENDPOINTS.STRATEGY_LIST,
          {},
          { showLoading: false }
        )
        logger.debug('策略配置响应:', response)
        console.log('⚙️ [Strategy] API 返回数据:', response)

        // 解包 withLoading 返回的结构
        const data = response?.success ? response.data : response
        console.log('⚙️ [Strategy] 解包后数据:', data)

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
          logger.debug('策略分组结果:', Object.keys(this.strategyGroups))
          console.log('✅ [Strategy] 数据加载完成, strategies:', strategies.length)
        }
      } catch (error) {
        logger.error('加载策略失败:', error)
        console.error('❌ [Strategy] loadStrategies 失败:', error)
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
        console.log('📊 [Strategy] loadTierMatrix 开始执行')
        // apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
        const response = await this.apiGet(
          LOTTERY_ENDPOINTS.MATRIX_LIST,
          {},
          { showLoading: false }
        )
        logger.debug('矩阵配置响应:', response)
        console.log('📊 [Strategy] Matrix API 返回数据:', response)

        // 解包 withLoading 返回的结构
        const data = response?.success ? response.data : response
        console.log('📊 [Strategy] Matrix 解包后数据:', data)

        if (data) {
          const matrixData = data.list || data.matrix || data
          this.tierMatrix = Array.isArray(matrixData) ? matrixData : []
          logger.debug('矩阵配置数量:', this.tierMatrix.length)
          console.log('✅ [Strategy] Matrix 数据加载完成, count:', this.tierMatrix.length)
        }
      } catch (error) {
        logger.error('加载层级矩阵失败:', error)
        console.error('❌ [Strategy] loadTierMatrix 失败:', error)
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
        const configId = this.editingMatrixCell.matrix_config_id
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
    }
  }
}

export default { useStrategyState, useStrategyMethods }
