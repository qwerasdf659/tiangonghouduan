/**
 * 汇率兑换管理页面 - Alpine.js 组件
 *
 * @file admin/src/modules/market/pages/exchange-rate-management.js
 * @description 固定汇率兑换规则的CRUD管理（查看/创建/编辑/启停）
 * @version 1.0.0
 * @date 2026-02-23
 *
 * @requires Alpine.js
 * @requires createPageMixin - 页面基础功能混入
 * @requires ExchangeRateAPI - 汇率管理API调用方法
 *
 * 后端路由：/api/v4/console/exchange-rates
 */

import { logger } from '../../../utils/index.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { ExchangeRateAPI } from '../../../api/market/exchange-rate.js'

/** 汇率状态中文映射 */
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

document.addEventListener('alpine:init', () => {
  logger.info('[ExchangeRateManagement] 注册 Alpine 组件...')

  Alpine.data('exchangeRateManagementPage', () => {
    const pageMixin = createPageMixin({
      pageTitle: '汇率兑换管理',
      loadDataOnInit: false
    })

    return {
      ...pageMixin,

      // ========== 状态配置 ==========
      status_options: STATUS_OPTIONS,
      status_map: STATUS_MAP,

      // ========== 列表数据 ==========
      /** @type {Array<Object>} 汇率规则列表 */
      rates: [],
      list_loading: false,
      list_error: '',

      // ========== 筛选 ==========
      filter_status: 'all',
      filter_from_asset: '',

      // ========== 分页 ==========
      pagination: {
        page: 1,
        page_size: 20,
        total: 0
      },
      get total_pages() {
        return Math.ceil(this.pagination.total / this.pagination.page_size) || 1
      },
      get has_prev_page() {
        return this.pagination.page > 1
      },
      get has_next_page() {
        return this.pagination.page < this.total_pages
      },

      // ========== 表单弹窗 ==========
      show_form: false,
      is_editing: false,
      form: this._getEmptyForm(),

      // ========== 初始化 ==========
      async init() {
        logger.info('[ExchangeRateManagement] 初始化...')
        await this.loadRates()
      },

      // ========== 数据加载 ==========
      async loadRates() {
        this.list_loading = true
        this.list_error = ''
        try {
          const params = {
            page: this.pagination.page,
            page_size: this.pagination.page_size
          }
          if (this.filter_status !== 'all') params.status = this.filter_status
          if (this.filter_from_asset) params.from_asset_code = this.filter_from_asset

          const res = await ExchangeRateAPI.getExchangeRates(params)
          if (res.success) {
            this.rates = res.data.items || []
            this.pagination.total = res.data.total || 0
          } else {
            this.list_error = res.message || '加载失败'
          }
        } catch (err) {
          this.list_error = err.message || '网络错误'
          logger.error('[ExchangeRateManagement] 加载失败:', err)
        } finally {
          this.list_loading = false
        }
      },

      // ========== 筛选操作 ==========
      async onFilterChange() {
        this.pagination.page = 1
        await this.loadRates()
      },

      // ========== 分页操作 ==========
      async goToPage(page) {
        if (page < 1 || page > this.total_pages) return
        this.pagination.page = page
        await this.loadRates()
      },

      // ========== 表单操作 ==========
      _getEmptyForm() {
        return {
          from_asset_code: '',
          to_asset_code: 'DIAMOND',
          rate_numerator: 1,
          rate_denominator: 1,
          min_from_amount: 1,
          max_from_amount: '',
          daily_user_limit: '',
          daily_global_limit: '',
          fee_rate: 0,
          priority: 0,
          effective_from: '',
          effective_until: '',
          description: ''
        }
      },

      openCreateForm() {
        this.is_editing = false
        this.form = this._getEmptyForm()
        this.show_form = true
      },

      openEditForm(rate) {
        this.is_editing = true
        this.form = {
          exchange_rate_id: rate.exchange_rate_id,
          from_asset_code: rate.from_asset_code,
          to_asset_code: rate.to_asset_code,
          rate_numerator: Number(rate.rate_numerator),
          rate_denominator: Number(rate.rate_denominator),
          min_from_amount: Number(rate.min_from_amount),
          max_from_amount: rate.max_from_amount ? Number(rate.max_from_amount) : '',
          daily_user_limit: rate.daily_user_limit ? Number(rate.daily_user_limit) : '',
          daily_global_limit: rate.daily_global_limit ? Number(rate.daily_global_limit) : '',
          fee_rate: parseFloat(rate.fee_rate) || 0,
          priority: rate.priority || 0,
          effective_from: rate.effective_from ? rate.effective_from.substring(0, 16) : '',
          effective_until: rate.effective_until ? rate.effective_until.substring(0, 16) : '',
          description: rate.description || ''
        }
        this.show_form = true
      },

      closeForm() {
        this.show_form = false
      },

      async submitForm() {
        try {
          const data = { ...this.form }
          if (!data.max_from_amount) delete data.max_from_amount
          if (!data.daily_user_limit) delete data.daily_user_limit
          if (!data.daily_global_limit) delete data.daily_global_limit
          if (!data.effective_from) delete data.effective_from
          if (!data.effective_until) delete data.effective_until

          let res
          if (this.is_editing) {
            res = await ExchangeRateAPI.updateExchangeRate(data.exchange_rate_id, data)
          } else {
            res = await ExchangeRateAPI.createExchangeRate(data)
          }

          if (res.success) {
            Alpine.store('notification').show(
              this.is_editing ? '汇率规则更新成功' : '汇率规则创建成功',
              'success'
            )
            this.show_form = false
            await this.loadRates()
          } else {
            Alpine.store('notification').show(res.message || '操作失败', 'error')
          }
        } catch (err) {
          Alpine.store('notification').show(err.message || '操作失败', 'error')
          logger.error('[ExchangeRateManagement] 表单提交失败:', err)
        }
      },

      // ========== 状态操作 ==========
      async toggleStatus(rate) {
        const newStatus = rate.status === 'active' ? 'paused' : 'active'
        const label = newStatus === 'active' ? '启用' : '暂停'
        try {
          const res = await ExchangeRateAPI.updateExchangeRateStatus(rate.exchange_rate_id, newStatus)
          if (res.success) {
            Alpine.store('notification').show(`汇率规则已${label}`, 'success')
            await this.loadRates()
          } else {
            Alpine.store('notification').show(res.message || `${label}失败`, 'error')
          }
        } catch (err) {
          Alpine.store('notification').show(err.message || `${label}失败`, 'error')
        }
      },

      // ========== 格式化 ==========
      getStatusInfo(status) {
        return STATUS_MAP[status] || { label: status, color: 'bg-gray-100 text-gray-700' }
      },

      formatRate(rate) {
        return `${rate.rate_denominator} ${rate.from_asset_code} = ${rate.rate_numerator} ${rate.to_asset_code}`
      },

      formatFeeRate(fee_rate) {
        const val = parseFloat(fee_rate) || 0
        return val > 0 ? `${(val * 100).toFixed(2)}%` : '无'
      },

      formatLimit(val) {
        return val ? Number(val).toLocaleString() : '无限制'
      },

      formatDateTime(dt) {
        if (!dt) return '—'
        return new Date(dt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      }
    }
  })

  logger.info('[ExchangeRateManagement] Alpine 组件注册完成')
})
