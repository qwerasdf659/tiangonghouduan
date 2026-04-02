/**
 * 用户比例覆盖管理 Composable
 *
 * @description 用户消费比例覆盖的状态管理和 CRUD 方法
 * @module modules/user/composables/ratio-overrides
 * @since 2026-03-02（星石配额优化方案）
 */

import { logger } from '../../../utils/logger.js'
import { UserRatioOverrideAPI } from '../../../api/user-ratio-override.js'

/**
 * 比例类型选项（对应后端 VALID_RATIO_KEYS）
 */
const RATIO_KEY_OPTIONS = [
  { value: 'points_award_ratio', label: '消费积分比例' },
  { value: 'budget_allocation_ratio', label: '预算分配比例' },
  { value: 'star_stone_quota_ratio', label: '星石配额比例' }
]

/**
 * 用户比例覆盖状态
 * @returns {Object} 状态对象
 */
export function useRatioOverridesState() {
  return {
    overrides: [],
    override_filters: {
      user_id: '',
      ratio_key: ''
    },
    override_pagination: {
      page: 1,
      page_size: 20,
      total: 0
    },
    get override_total_pages() {
      return Math.ceil(this.override_pagination.total / this.override_pagination.page_size) || 1
    },
    override_loading: false,
    override_form: {
      user_ratio_override_id: null,
      user_id: '',
      ratio_key: 'points_award_ratio',
      ratio_value: 1.0,
      reason: '',
      effective_start: '',
      effective_end: ''
    },
    override_form_visible: false,
    override_form_mode: 'create',
    ratio_key_options: RATIO_KEY_OPTIONS,
    ratio_key_labels: {}
  }
}

/**
 * 用户比例覆盖方法
 * @returns {Object} 方法对象
 */
export function useRatioOverridesMethods() {
  return {
    /**
     * 加载覆盖列表
     */
    async loadOverrides() {
      this.override_loading = true
      try {
        const params = {
          page: this.override_pagination.page,
          page_size: this.override_pagination.page_size
        }
        if (this.override_filters.user_id) {
          params.user_id = this.override_filters.user_id
        }
        if (this.override_filters.ratio_key) {
          params.ratio_key = this.override_filters.ratio_key
        }

        const res = await UserRatioOverrideAPI.getList(params)
        if (res.success && res.data) {
          this.overrides = res.data.items || []
          this.override_pagination.total = res.data.total || 0
          if (res.data.ratio_key_labels) {
            this.ratio_key_labels = res.data.ratio_key_labels
          }
        }
      } catch (error) {
        logger.error('加载用户比例覆盖列表失败', error)
        Alpine.store('notification').show('加载比例覆盖列表失败', 'error')
      } finally {
        this.override_loading = false
      }
    },

    /**
     * 搜索/过滤
     */
    searchOverrides() {
      this.override_pagination.page = 1
      this.loadOverrides()
    },

    /**
     * 重置过滤条件
     */
    resetOverrideFilters() {
      this.override_filters = { user_id: '', ratio_key: '' }
      this.override_pagination.page = 1
      this.loadOverrides()
    },

    /**
     * 分页：跳转到指定页
     * @param {number} page - 页码
     */
    goToOverridePage(page) {
      if (page < 1 || page > this.override_total_pages) return
      this.override_pagination.page = page
      this.loadOverrides()
    },

    /**
     * 打开新增表单
     */
    openCreateOverrideForm() {
      this.override_form = {
        user_ratio_override_id: null,
        user_id: '',
        ratio_key: 'points_award_ratio',
        ratio_value: 1.0,
        reason: '',
        effective_start: '',
        effective_end: ''
      }
      this.override_form_mode = 'create'
      this.override_form_visible = true
    },

    /**
     * 打开编辑表单
     * @param {Object} override - 覆盖记录
     */
    openEditOverrideForm(override) {
      this.override_form = {
        user_ratio_override_id: override.user_ratio_override_id,
        user_id: override.user_id,
        ratio_key: override.ratio_key,
        ratio_value: override.ratio_value,
        reason: override.reason || '',
        effective_start: override.effective_start ? override.effective_start.slice(0, 16) : '',
        effective_end: override.effective_end ? override.effective_end.slice(0, 16) : ''
      }
      this.override_form_mode = 'edit'
      this.override_form_visible = true
    },

    /**
     * 关闭表单
     */
    closeOverrideForm() {
      this.override_form_visible = false
    },

    /**
     * 提交表单（新增或修改）
     */
    async submitOverrideForm() {
      try {
        const data = {
          ratio_value: parseFloat(this.override_form.ratio_value),
          reason: this.override_form.reason || null,
          effective_start: this.override_form.effective_start || null,
          effective_end: this.override_form.effective_end || null
        }

        let res
        if (this.override_form_mode === 'create') {
          data.user_id = parseInt(this.override_form.user_id)
          data.ratio_key = this.override_form.ratio_key
          if (!data.user_id) {
            Alpine.store('notification').show('请输入用户ID', 'error')
            return
          }
          res = await UserRatioOverrideAPI.create(data)
        } else {
          res = await UserRatioOverrideAPI.update(this.override_form.user_ratio_override_id, data)
        }

        if (res.success) {
          Alpine.store('notification').show(
            this.override_form_mode === 'create' ? '创建成功' : '修改成功',
            'success'
          )
          this.closeOverrideForm()
          this.loadOverrides()
        } else {
          Alpine.store('notification').show(res.message || '操作失败', 'error')
        }
      } catch (error) {
        logger.error('提交用户比例覆盖失败', error)
        Alpine.store('notification').show('提交失败：' + (error.message || '未知错误'), 'error')
      }
    },

    /**
     * 删除覆盖
     * @param {Object} override - 覆盖记录
     */
    async deleteOverride(override) {
      const label = this.getRatioKeyLabel(override.ratio_key)
      if (
        !confirm(
          `确定删除用户 ${override.user_id} 的「${label}」覆盖吗？删除后将恢复为全局默认值。`
        )
      ) {
        return
      }

      try {
        const res = await UserRatioOverrideAPI.remove(override.user_ratio_override_id)
        if (res.success) {
          Alpine.store('notification').show('删除成功，已恢复为全局默认值', 'success')
          this.loadOverrides()
        } else {
          Alpine.store('notification').show(res.message || '删除失败', 'error')
        }
      } catch (error) {
        logger.error('删除用户比例覆盖失败', error)
        Alpine.store('notification').show('删除失败：' + (error.message || '未知错误'), 'error')
      }
    },

    /**
     * 获取比例类型中文标签
     * @param {string} key - ratio_key
     * @returns {string} 中文标签
     */
    getRatioKeyLabel(key) {
      const labels = this.ratio_key_labels || {}
      if (labels[key]) return labels[key]
      const opt = RATIO_KEY_OPTIONS.find(o => o.value === key)
      return opt ? opt.label : key
    },

    /**
     * 判断覆盖是否在有效期内
     * @param {Object} override - 覆盖记录
     * @returns {string} 状态文字
     */
    getOverrideStatus(override) {
      const now = new Date()
      if (override.effective_start && new Date(override.effective_start) > now) {
        return '未开始'
      }
      if (override.effective_end && new Date(override.effective_end) <= now) {
        return '已过期'
      }
      return '生效中'
    },

    /**
     * 获取覆盖状态 CSS 类
     * @param {Object} override - 覆盖记录
     * @returns {string} Tailwind CSS 类
     */
    getOverrideStatusClass(override) {
      const status = this.getOverrideStatus(override)
      switch (status) {
        case '生效中':
          return 'bg-green-100 text-green-800'
        case '未开始':
          return 'bg-yellow-100 text-yellow-800'
        case '已过期':
          return 'bg-gray-100 text-gray-500'
        default:
          return 'bg-gray-100 text-gray-500'
      }
    }
  }
}

export default { useRatioOverridesState, useRatioOverridesMethods }
