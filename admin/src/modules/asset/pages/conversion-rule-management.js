/**
 * 统一资产转换规则管理页面 - Alpine.js 组件
 *
 * @file admin/src/modules/asset/pages/conversion-rule-management.js
 * @description 统一资产转换规则 CRUD（合并原汇率兑换管理 + 材料转换管理）
 * @version 1.0.0
 * @date 2026-04-05
 *
 * @requires Alpine.js
 * @requires createPageMixin - 页面基础功能混入
 * @requires ConversionRuleAPI - 统一转换规则 API
 *
 * 后端路由：/api/v4/console/assets/conversion-rules
 */

import { logger } from '../../../utils/index.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { ConversionRuleAPI } from '../../../api/asset/conversion-rule.js'

/** 状态中文映射 */
const STATUS_MAP = {
  active: { label: '生效中', color: 'bg-green-100 text-green-700' },
  paused: { label: '已暂停', color: 'bg-yellow-100 text-yellow-700' },
  disabled: { label: '已禁用', color: 'bg-red-100 text-red-700' }
}

const STATUS_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '生效中' },
  { value: 'paused', label: '已暂停' },
  { value: 'disabled', label: '已禁用' }
]

/** 展示分类选项（display_category） */
const DISPLAY_CATEGORY_OPTIONS = [
  { value: '', label: '自动推导（根据 tier）' },
  { value: 'compose', label: '合成' },
  { value: 'decompose', label: '分解' },
  { value: 'exchange', label: '兑换' }
]

/** 舍入模式选项 */
const ROUNDING_MODE_OPTIONS = [
  { value: 'floor', label: '向下取整（floor）' },
  { value: 'ceil', label: '向上取整（ceil）' },
  { value: 'round', label: '四舍五入（round）' }
]

/** 风险等级选项 */
const RISK_LEVEL_OPTIONS = [
  { value: 'low', label: '低风险' },
  { value: 'medium', label: '中风险' },
  { value: 'high', label: '高风险' }
]

/** 空表单模板 */
function getEmptyForm() {
  return {
    from_asset_code: '',
    to_asset_code: '',
    rate_numerator: 1,
    rate_denominator: 1,
    rounding_mode: 'floor',
    fee_rate: 0,
    fee_min_amount: 0,
    fee_asset_code: '',
    min_from_amount: 1,
    max_from_amount: null,
    daily_user_limit: null,
    daily_global_limit: null,
    effective_from: '',
    effective_until: '',
    priority: 0,
    title: '',
    description: '',
    display_icon: '',
    risk_level: 'low',
    is_visible: true,
    display_category: '',
    status: 'active'
  }
}

document.addEventListener('alpine:init', () => {
  Alpine.data('conversionRuleManagementPage', () => ({
    ...createPageMixin(),

    // ========== 状态 ==========
    rules: [],
    list_loading: false,
    list_error: '',
    filter_status: 'all',
    filter_from_asset: '',
    filter_to_asset: '',
    pagination: { page: 1, page_size: 20, total: 0 },
    status_options: STATUS_OPTIONS,
    display_category_options: DISPLAY_CATEGORY_OPTIONS,
    risk_level_options: RISK_LEVEL_OPTIONS,

    // 表单
    show_form: false,
    is_editing: false,
    editing_id: null,
    form: getEmptyForm(),

    // ========== 计算属性 ==========
    get total_pages() {
      return Math.ceil(this.pagination.total / this.pagination.page_size) || 1
    },
    get has_prev_page() {
      return this.pagination.page > 1
    },
    get has_next_page() {
      return this.pagination.page < this.total_pages
    },

    // ========== 初始化 ==========
    async init() {
      logger.info('[ConversionRuleManagement] 初始化...')
      await this.loadRules()
    },

    // ========== 数据加载 ==========
    async loadRules() {
      this.list_loading = true
      this.list_error = ''
      try {
        const params = {
          page: this.pagination.page,
          page_size: this.pagination.page_size
        }
        if (this.filter_status !== 'all') params.status = this.filter_status
        if (this.filter_from_asset) params.from_asset_code = this.filter_from_asset
        if (this.filter_to_asset) params.to_asset_code = this.filter_to_asset

        const res = await ConversionRuleAPI.getRules(params)
        if (res.success) {
          this.rules = res.data.rules || res.data.items || []
          this.pagination.total = res.data.total || 0
        } else {
          this.list_error = res.message || '加载失败'
        }
      } catch (err) {
        this.list_error = err.message || '网络错误'
        logger.error('[ConversionRuleManagement] 加载失败:', err)
      } finally {
        this.list_loading = false
      }
    },

    // ========== 筛选操作 ==========
    async onFilterChange() {
      this.pagination.page = 1
      await this.loadRules()
    },

    // ========== 分页操作 ==========
    async goToPage(page) {
      if (page < 1 || page > this.total_pages) return
      this.pagination.page = page
      await this.loadRules()
    },

    // ========== 表单操作 ==========
    openCreateForm() {
      this.is_editing = false
      this.editing_id = null
      this.form = getEmptyForm()
      this.show_form = true
    },

    openEditForm(rule) {
      this.is_editing = true
      this.editing_id = rule.conversion_rule_id
      this.form = {
        from_asset_code: rule.from_asset_code,
        to_asset_code: rule.to_asset_code,
        rate_numerator: Number(rule.rate_numerator),
        rate_denominator: Number(rule.rate_denominator),
        rounding_mode: rule.rounding_mode || 'floor',
        fee_rate: Number(rule.fee_rate) || 0,
        fee_min_amount: Number(rule.fee_min_amount) || 0,
        min_from_amount: Number(rule.min_from_amount) || 1,
        max_from_amount: rule.max_from_amount ? Number(rule.max_from_amount) : null,
        daily_user_limit: rule.daily_user_limit ? Number(rule.daily_user_limit) : null,
        daily_global_limit: rule.daily_global_limit ? Number(rule.daily_global_limit) : null,
        priority: Number(rule.priority) || 0,
        title: rule.title || '',
        description: rule.description || '',
        is_visible: rule.is_visible !== false,
        display_category: rule.display_category || '',
        status: rule.status
      }
      this.show_form = true
    },

    closeForm() {
      this.show_form = false
      this.form = getEmptyForm()
    },

    async submitForm() {
      try {
        const data = { ...this.form }

        /* 清理空值 */
        if (!data.max_from_amount) delete data.max_from_amount
        if (!data.daily_user_limit) delete data.daily_user_limit
        if (!data.daily_global_limit) delete data.daily_global_limit
        if (!data.title) delete data.title
        if (!data.description) delete data.description

        let res
        if (this.is_editing) {
          res = await ConversionRuleAPI.updateRule(this.editing_id, data)
        } else {
          res = await ConversionRuleAPI.createRule(data)
        }

        if (res.success) {
          Alpine.store('notification').show(
            this.is_editing ? '规则更新成功' : '规则创建成功',
            'success'
          )
          this.closeForm()
          await this.loadRules()
        } else {
          Alpine.store('notification').show(res.message || '操作失败', 'error')
        }
      } catch (err) {
        Alpine.store('notification').show(err.message || '操作失败', 'error')
        logger.error('[ConversionRuleManagement] 提交失败:', err)
      }
    },

    // ========== 状态操作 ==========
    async toggleStatus(rule) {
      const newStatus = rule.status === 'active' ? 'paused' : 'active'
      try {
        const res = await ConversionRuleAPI.updateRuleStatus(rule.conversion_rule_id, newStatus)
        if (res.success) {
          Alpine.store('notification').show(`规则已${newStatus === 'active' ? '启用' : '暂停'}`, 'success')
          await this.loadRules()
        } else {
          Alpine.store('notification').show(res.message || '操作失败', 'error')
        }
      } catch (err) {
        Alpine.store('notification').show(err.message || '操作失败', 'error')
      }
    },

    async disableRule(rule) {
      if (!confirm(`确定要禁用规则 "${rule.from_asset_code} → ${rule.to_asset_code}" 吗？`)) return
      try {
        const res = await ConversionRuleAPI.updateRuleStatus(rule.conversion_rule_id, 'disabled')
        if (res.success) {
          Alpine.store('notification').show('规则已禁用', 'success')
          await this.loadRules()
        } else {
          Alpine.store('notification').show(res.message || '操作失败', 'error')
        }
      } catch (err) {
        Alpine.store('notification').show(err.message || '操作失败', 'error')
      }
    },

    // ========== 格式化方法 ==========
    getStatusInfo(status) {
      return STATUS_MAP[status] || { label: status, color: 'bg-gray-100 text-gray-700' }
    },

    formatRate(rule) {
      const num = Number(rule.rate_numerator)
      const den = Number(rule.rate_denominator)
      if (den === 1) return `1:${num}`
      if (num === 1) return `${den}:1`
      return `${den}:${num}`
    },

    formatFeeRate(rate) {
      const r = Number(rate)
      if (!r) return '免费'
      return `${(r * 100).toFixed(2)}%`
    },

    formatLimit(val) {
      if (val === null || val === undefined) return '∞'
      return String(val)
    },

    formatDateTime(dt) {
      if (!dt) return '—'
      return new Date(dt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    }
  }))

  logger.info('[ConversionRuleManagement] Alpine 组件注册完成')
})
