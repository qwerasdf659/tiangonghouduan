/**
 * 功能开关模块
 *
 * @file admin/src/modules/system/composables/feature-flags.js
 * @description 功能灰度发布控制
 * @version 1.1.0
 * @date 2026-01-25
 *
 * 后端API基础路径: /api/v4/console/feature-flags
 * 后端使用 flag_key 作为路径参数（非 flag_id）
 */

import { logger } from '../../../utils/logger.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'

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
    /** @type {Object} 功能开关表单（与HTML和后端字段对齐） */
    featureFlagForm: {
      flag_key: '',
      flag_name: '', // 后端必需字段
      description: '',
      is_enabled: false,
      rollout_strategy: 'all',
      rollout_percentage: 100
    },
    /** @type {string|null} 当前编辑的开关Key（后端使用flag_key作为标识） */
    editingFlagKey: null,
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
     * 后端返回格式: { success: true, data: [...] } - data直接是数组
     */
    async loadFeatureFlags() {
      try {
        const params = new URLSearchParams()
        if (this.flagFilters.keyword) params.append('keyword', this.flagFilters.keyword)
        if (this.flagFilters.status)
          params.append('is_enabled', this.flagFilters.status === 'enabled')

        const queryString = params.toString()
        const url = queryString
          ? `${SYSTEM_ENDPOINTS.FEATURE_FLAG_LIST}?${queryString}`
          : SYSTEM_ENDPOINTS.FEATURE_FLAG_LIST

        logger.debug('[FeatureFlags] 加载功能开关列表:', url)

        const response = await this.apiGet(url, {}, { showLoading: false })

        if (response?.success) {
          // 后端直接返回数组，兼容多种格式
          const data = response.data
          if (Array.isArray(data)) {
            this.featureFlags = data
          } else if (data?.flags) {
            this.featureFlags = data.flags
          } else if (data?.list) {
            this.featureFlags = data.list
          } else {
            this.featureFlags = []
          }
          logger.info('[FeatureFlags] 加载成功，数量:', this.featureFlags.length)
        } else {
          logger.warn('[FeatureFlags] 加载失败:', response?.message)
          this.featureFlags = []
        }
      } catch (error) {
        logger.error('[FeatureFlags] 加载功能开关失败:', error)
        this.featureFlags = []
      }
    },

    /**
     * 打开创建功能开关模态框
     */
    openCreateFlagModal() {
      this.editingFlagKey = null
      this.featureFlagForm = {
        flag_key: '',
        flag_name: '',
        description: '',
        is_enabled: false,
        rollout_strategy: 'all',
        rollout_percentage: 100
      }
      this.showModal('featureFlagModal')
    },

    /**
     * 编辑功能开关
     * @param {Object} flag - 功能开关对象
     */
    editFeatureFlag(flag) {
      this.editingFlagKey = flag.flag_key
      this.featureFlagForm = {
        flag_key: flag.flag_key || '',
        flag_name: flag.flag_name || '',
        description: flag.description || '',
        is_enabled: flag.is_enabled === true,
        rollout_strategy: flag.rollout_strategy || 'all',
        rollout_percentage: flag.rollout_percentage || 100
      }
      this.showModal('featureFlagModal')
    },

    /**
     * 保存功能开关（HTML中调用的方法名）
     * 后端: POST /api/v4/console/feature-flags (创建)
     * 后端: PUT /api/v4/console/feature-flags/:flagKey (更新)
     */
    async saveFeatureFlag() {
      if (!this.featureFlagForm.flag_key) {
        this.showError('请填写功能开关键名')
        return
      }

      if (!this.featureFlagForm.flag_name) {
        this.showError('请填写功能开关名称')
        return
      }

      try {
        this.saving = true
        const isEdit = !!this.editingFlagKey
        const url = isEdit
          ? `${SYSTEM_ENDPOINTS.FEATURE_FLAG_LIST}/${this.editingFlagKey}`
          : SYSTEM_ENDPOINTS.FEATURE_FLAG_LIST

        const response = await this.apiCall(url, {
          method: isEdit ? 'PUT' : 'POST',
          data: this.featureFlagForm
        })

        if (response?.success) {
          this.showSuccess(isEdit ? '功能开关更新成功' : '功能开关创建成功')
          this.hideModal('featureFlagModal')
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
     * 后端接口: PATCH /api/v4/console/feature-flags/:flagKey/toggle
     */
    async toggleFeatureFlag(flag) {
      const newStatus = !flag.is_enabled
      await this.confirmAndExecute(
        `确定${newStatus ? '启用' : '禁用'}功能「${flag.flag_key}」？`,
        async () => {
          const response = await this.apiCall(
            `${SYSTEM_ENDPOINTS.FEATURE_FLAG_LIST}/${flag.flag_key}/toggle`,
            {
              method: 'PATCH',
              data: { enabled: newStatus }
            }
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
     * 后端: DELETE /api/v4/console/feature-flags/:flagKey
     */
    async deleteFeatureFlag(flag) {
      await this.confirmAndExecute(
        `确定删除功能开关「${flag.flag_key}」？`,
        async () => {
          const response = await this.apiCall(
            `${SYSTEM_ENDPOINTS.FEATURE_FLAG_LIST}/${flag.flag_key}`,
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
     * 获取发布策略文本（用于表格显示）
     * @param {string} strategy - 发布策略代码
     * @returns {string} 发布策略文本
     */
    // ✅ 已删除 getStrategyText 映射函数 - 改用后端 _display 字段（P2 中文化）

    /**
     * 获取发布策略样式
     * @param {string} strategy - 发布策略代码
     * @returns {string} CSS类名
     */
    getStrategyClass(strategy) {
      const map = {
        all: 'bg-green-100 text-green-700',
        percentage: 'bg-blue-100 text-blue-700',
        user_list: 'bg-yellow-100 text-yellow-700',
        user_segment: 'bg-purple-100 text-purple-700',
        schedule: 'bg-orange-100 text-orange-700'
      }
      return map[strategy] || 'bg-gray-100 text-gray-700'
    }
  }
}

export default { useFeatureFlagsState, useFeatureFlagsMethods }
