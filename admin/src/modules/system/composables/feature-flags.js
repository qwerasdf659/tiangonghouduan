/**
 * 功能开关模块
 *
 * @file admin/src/modules/system/composables/feature-flags.js
 * @description 功能灰度发布控制
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system.js'

/**
 * 功能开关状态
 * @returns {Object} 状态对象
 */
export function useFeatureFlagsState() {
  return {
    /** @type {Array} 功能开关列表 */
    featureFlags: [],
    /** @type {Object} 功能开关筛选条件 */
    flagFilters: { keyword: '', status: '' },
    /** @type {Object} 功能开关表单 */
    flagForm: {
      flag_key: '',
      description: '',
      is_enabled: false,
      rollout_strategy: 'all',
      rollout_percentage: 100
    },
    /** @type {boolean} 是否编辑功能开关 */
    isEditFlag: false,
    /** @type {number|string|null} 当前编辑的开关ID */
    editingFlagId: null,
    /** @type {Object|null} 选中的功能开关 */
    selectedFlag: null
  }
}

/**
 * 功能开关方法
 * @returns {Object} 方法对象
 */
export function useFeatureFlagsMethods() {
  return {
    /**
     * 加载功能开关列表
     */
    async loadFeatureFlags() {
      try {
        const params = new URLSearchParams()
        if (this.flagFilters.keyword) params.append('keyword', this.flagFilters.keyword)
        if (this.flagFilters.status) params.append('is_enabled', this.flagFilters.status === 'enabled')

        const response = await this.apiGet(
          `${SYSTEM_ENDPOINTS.FEATURE_FLAG_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.featureFlags = response.data?.flags || response.data?.list || []
        }
      } catch (error) {
        logger.error('加载功能开关失败:', error)
        this.featureFlags = []
      }
    },

    /**
     * 打开创建功能开关模态框
     */
    openCreateFlagModal() {
      this.isEditFlag = false
      this.editingFlagId = null
      this.flagForm = {
        flag_key: '',
        description: '',
        is_enabled: false,
        rollout_strategy: 'all',
        rollout_percentage: 100
      }
      this.showModal('flagModal')
    },

    /**
     * 编辑功能开关
     * @param {Object} flag - 功能开关对象
     */
    editFeatureFlag(flag) {
      this.isEditFlag = true
      this.editingFlagId = flag.flag_id || flag.id
      this.flagForm = {
        flag_key: flag.flag_key || '',
        description: flag.description || '',
        is_enabled: flag.is_enabled === true,
        rollout_strategy: flag.rollout_strategy || 'all',
        rollout_percentage: flag.rollout_percentage || 100
      }
      this.showModal('flagModal')
    },

    /**
     * 提交功能开关表单
     */
    async submitFlagForm() {
      if (!this.flagForm.flag_key) {
        this.showError('请填写功能开关键名')
        return
      }

      try {
        this.saving = true
        const url = this.isEditFlag
          ? `${SYSTEM_ENDPOINTS.FEATURE_FLAG_LIST}/${this.editingFlagId}`
          : SYSTEM_ENDPOINTS.FEATURE_FLAG_LIST

        const response = await this.apiCall(url, {
          method: this.isEditFlag ? 'PUT' : 'POST',
          data: this.flagForm
        })

        if (response?.success) {
          this.showSuccess(this.isEditFlag ? '功能开关更新成功' : '功能开关创建成功')
          this.hideModal('flagModal')
          await this.loadFeatureFlags()
        }
      } catch (error) {
        this.showError('保存功能开关失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 切换功能开关状态
     * @param {Object} flag - 功能开关对象
     */
    async toggleFeatureFlag(flag) {
      const newStatus = !flag.is_enabled
      await this.confirmAndExecute(
        `确定${newStatus ? '启用' : '禁用'}功能「${flag.flag_key}」？`,
        async () => {
          const response = await this.apiCall(
            `${SYSTEM_ENDPOINTS.FEATURE_FLAG_LIST}/${flag.flag_id || flag.id}/toggle`,
            { method: 'PUT' }
          )
          if (response?.success) {
            await this.loadFeatureFlags()
          }
        },
        { successMessage: `功能已${newStatus ? '启用' : '禁用'}` }
      )
    },

    /**
     * 删除功能开关
     * @param {Object} flag - 功能开关对象
     */
    async deleteFeatureFlag(flag) {
      await this.confirmAndExecute(
        `确定删除功能开关「${flag.flag_key}」？`,
        async () => {
          const response = await this.apiCall(
            `${SYSTEM_ENDPOINTS.FEATURE_FLAG_LIST}/${flag.flag_id || flag.id}`,
            { method: 'DELETE' }
          )
          if (response?.success) {
            await this.loadFeatureFlags()
          }
        },
        { successMessage: '功能开关已删除', confirmText: '确认删除' }
      )
    },

    /**
     * 获取发布策略文本
     * @param {string} strategy - 发布策略代码
     * @returns {string} 发布策略文本
     */
    getRolloutStrategyText(strategy) {
      const map = {
        all: '全量发布',
        percentage: '百分比灰度',
        whitelist: '白名单',
        blacklist: '黑名单'
      }
      return map[strategy] || strategy || '-'
    },

    /**
     * 获取发布策略样式
     * @param {string} strategy - 发布策略代码
     * @returns {string} CSS类名
     */
    getRolloutStrategyClass(strategy) {
      const map = {
        all: 'bg-success',
        percentage: 'bg-info',
        whitelist: 'bg-warning',
        blacklist: 'bg-secondary'
      }
      return map[strategy] || 'bg-secondary'
    }
  }
}

export default { useFeatureFlagsState, useFeatureFlagsMethods }

