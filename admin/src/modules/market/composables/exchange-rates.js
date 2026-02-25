/**
 * 汇率管理 composable 模块
 *
 * @file admin/src/modules/market/composables/exchange-rates.js
 * @description 汇率兑换规则的状态管理和方法封装
 * @version 1.0.0
 * @date 2026-02-24
 *
 * 文档要求：Doc1 第 7.8 节 W3
 * 导出 useExchangeRateState + useExchangeRateActions composable
 */

import { logger } from '../../../utils/logger.js'
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

/**
 * 汇率管理状态
 * @returns {Object} 状态对象
 */
export function useExchangeRateState() {
  return {
    /** @type {Object} 状态配置映射 */
    status_map: STATUS_MAP,
    /** @type {Array<Object>} 状态筛选选项 */
    status_options: STATUS_OPTIONS,

    /** @type {Array<Object>} 汇率规则列表 */
    rates: [],
    /** @type {boolean} 列表加载中 */
    list_loading: false,
    /** @type {string} 列表错误信息 */
    list_error: '',

    /** @type {string} 状态筛选 */
    filter_status: 'all',
    /** @type {string} 源资产筛选 */
    filter_from_asset: '',

    /** @type {boolean} 表单弹窗显示 */
    show_form: false,
    /** @type {boolean} 是否编辑模式 */
    is_editing: false,
    /** @type {Object} 表单数据 */
    rate_form: {
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
  }
}

/**
 * 汇率管理方法
 * @returns {Object} 方法对象
 */
export function useExchangeRateActions() {
  return {
    /**
     * 加载汇率规则列表
     */
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
        logger.error('[ExchangeRates] 加载失败:', err)
      } finally {
        this.list_loading = false
      }
    },

    /**
     * 筛选变更处理
     */
    async onRateFilterChange() {
      this.pagination.page = 1
      await this.loadRates()
    },

    /**
     * 获取空白表单数据
     * @returns {Object} 空白表单
     */
    _getEmptyRateForm() {
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

    /**
     * 打开创建表单
     */
    openRateCreateForm() {
      this.is_editing = false
      this.rate_form = this._getEmptyRateForm()
      this.show_form = true
    },

    /**
     * 打开编辑表单
     * @param {Object} rate - 汇率规则对象
     */
    openRateEditForm(rate) {
      this.is_editing = true
      this.rate_form = {
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

    /**
     * 关闭表单
     */
    closeRateForm() {
      this.show_form = false
    },

    /**
     * 提交汇率表单（创建/编辑）
     */
    async submitRateForm() {
      try {
        const data = { ...this.rate_form }
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
        logger.error('[ExchangeRates] 表单提交失败:', err)
      }
    },

    /**
     * 切换汇率规则状态
     * @param {Object} rate - 汇率规则对象
     */
    async toggleRateStatus(rate) {
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

    /**
     * 获取状态标签信息
     * @param {string} status - 状态值
     * @returns {Object} { label, color }
     */
    getRateStatusInfo(status) {
      return STATUS_MAP[status] || { label: status, color: 'bg-gray-100 text-gray-700' }
    },

    /**
     * 格式化汇率显示
     * @param {Object} rate - 汇率规则
     * @returns {string} 格式化字符串
     */
    formatExchangeRate(rate) {
      return `${rate.rate_denominator} ${rate.from_asset_code} = ${rate.rate_numerator} ${rate.to_asset_code}`
    },

    /**
     * 格式化手续费率
     * @param {number} fee_rate - 手续费率（0-1小数）
     * @returns {string} 百分比显示
     */
    formatFeeRate(fee_rate) {
      const val = parseFloat(fee_rate) || 0
      return val > 0 ? `${(val * 100).toFixed(2)}%` : '无'
    },

    /**
     * 格式化限额
     * @param {number|null} val - 限额值
     * @returns {string} 格式化字符串
     */
    formatRateLimit(val) {
      return val ? Number(val).toLocaleString() : '无限制'
    }
  }
}
