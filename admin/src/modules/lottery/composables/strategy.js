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
    /** @type {Array} 预算层级 */
    budgetTiers: ['低', '中', '高', '特高'],
    /** @type {Array} 压力层级 */
    pressureTiers: ['低压', '中压', '高压'],
    /** @type {Object|null} 当前编辑的矩阵单元格 */
    editingMatrixCell: null
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
     */
    async loadStrategies() {
      try {
        const response = await this.apiGet(LOTTERY_ENDPOINTS.STRATEGY_LIST, {}, { showLoading: false })
        if (response?.success) {
          const strategies = response.data?.strategies || response.data?.list || []
          this.strategies = strategies
          this.strategyGroups = strategies.reduce((groups, strategy) => {
            const groupName = strategy.group || strategy.category || 'other'
            if (!groups[groupName]) groups[groupName] = []
            groups[groupName].push(strategy)
            return groups
          }, {})
        }
      } catch (error) {
        logger.error('加载策略失败:', error)
        this.strategies = []
        this.strategyGroups = {}
      }
    },

    /**
     * 加载层级矩阵配置
     */
    async loadTierMatrix() {
      try {
        const response = await this.apiGet(LOTTERY_ENDPOINTS.MATRIX_LIST, {}, { showLoading: false })
        if (response?.success) {
          const data = response.data?.matrix || response.data
          this.tierMatrix = Array.isArray(data) ? data : []
        }
      } catch (error) {
        logger.error('加载层级矩阵失败:', error)
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
     * @param {string} budgetTier - 预算层级
     * @param {string} pressureTier - 压力层级
     */
    editMatrixCell(budgetTier, pressureTier) {
      const currentConfig = this.getMatrixConfig(budgetTier, pressureTier) || {
        budget_tier: budgetTier,
        pressure_tier: pressureTier,
        win_probability: 0,
        max_win_amount: 0
      }
      this.editingMatrixCell = { ...currentConfig }
      this.showModal('matrixEditModal')
    },

    /**
     * 提交矩阵配置
     */
    async submitMatrixConfig() {
      try {
        this.saving = true
        const response = await this.apiCall(LOTTERY_ENDPOINTS.MATRIX_LIST, {
          method: 'PUT',
          data: this.editingMatrixCell
        })

        if (response?.success) {
          this.showSuccess('矩阵配置已更新')
          this.hideModal('matrixEditModal')
          await this.loadTierMatrix()
        }
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
     * @param {string} groupName - 分组名称
     * @returns {string} 分组中文名称
     */
    getStrategyGroupName(groupName) {
      const names = {
        probability: '概率策略',
        frequency: '频率控制',
        budget: '预算管理',
        user: '用户限制',
        other: '其他策略'
      }
      return names[groupName] || groupName
    }
  }
}

export default { useStrategyState, useStrategyMethods }

