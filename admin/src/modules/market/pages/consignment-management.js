/**
 * 寄卖管理页面 - Alpine.js 组件（S3 二手回流/寄卖）
 *
 * @file admin/src/modules/market/pages/consignment-management.js
 */

import { logger, formatDate } from '../../../utils/index.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { ExchangeItemAPI } from '../../../api/exchange-item/index.js'

const STATUS_LABELS = {
  pending: '待审核',
  listed: '已上架',
  sold: '已售出',
  withdrawn: '已撤回',
  rejected: '已驳回'
}

function registerConsignmentComponents() {
  logger.info('[ConsignmentManagement] 注册 Alpine 组件...')

  if (typeof window.Alpine === 'undefined') {
    logger.error('[ConsignmentManagement] Alpine.js 未加载')
    return
  }

  Alpine.data('consignmentManagement', () => ({
    ...createPageMixin(),

    items: [],
    total: 0,
    pagination: { page: 1, page_size: 20 },
    filters: { status: '', consignor_account_id: '', keyword: '' },
    loading: false,

    show_form: false,
    saving: false,
    form: {
      item_id: '',
      consignor_account_id: '',
      list_price: '',
      list_asset_code: 'star_stone',
      relist_item_id: ''
    },

    show_detail: false,
    detail: null,

    get totalPages() {
      return Math.ceil(this.total / this.pagination.page_size) || 1
    },
    get hasPrevPage() {
      return this.pagination.page > 1
    },
    get hasNextPage() {
      return this.pagination.page < this.totalPages
    },

    async init() {
      if (!this.checkAuth()) return
      await this.loadData()
    },

    async loadData() {
      this.loading = true
      try {
        const params = { page: this.pagination.page, page_size: this.pagination.page_size, ...this.filters }
        Object.keys(params).forEach(k => {
          if (!params[k]) delete params[k]
        })
        const res = await ExchangeItemAPI.listConsignments(params)
        if (res.success) {
          this.items = res.data.items || []
          this.total = res.data.total || 0
        } else {
          Alpine.store('notification').show(res.message || '加载失败', 'error')
        }
      } catch (error) {
        logger.error('[ConsignmentManagement] 加载列表失败', error)
        Alpine.store('notification').show('加载寄卖单列表失败', 'error')
      } finally {
        this.loading = false
      }
    },

    async handleSearch() {
      this.pagination.page = 1
      await this.loadData()
    },

    async resetFilters() {
      this.filters = { status: '', consignor_account_id: '', keyword: '' }
      this.pagination.page = 1
      await this.loadData()
    },

    goToPage(page) {
      if (page < 1 || page > this.totalPages) return
      this.pagination.page = page
      this.loadData()
    },

    openCreateForm() {
      this.form = {
        item_id: '',
        consignor_account_id: '',
        list_price: '',
        list_asset_code: 'star_stone',
        relist_item_id: ''
      }
      this.show_form = true
    },

    closeForm() {
      this.show_form = false
    },

    async viewDetail(id) {
      try {
        const res = await ExchangeItemAPI.getConsignment(id)
        if (res.success) {
          this.detail = res.data
          this.show_detail = true
        }
      } catch (_error) {
        Alpine.store('notification').show('加载详情失败', 'error')
      }
    },

    async submitForm() {
      if (!this.form.item_id || !this.form.consignor_account_id) {
        Alpine.store('notification').show('请填写物品 ID 和寄卖人账户 ID', 'warning')
        return
      }
      const payload = {
        item_id: Number(this.form.item_id),
        consignor_account_id: Number(this.form.consignor_account_id),
        list_asset_code: this.form.list_asset_code || 'star_stone'
      }
      if (this.form.list_price !== '') payload.list_price = Number(this.form.list_price)
      if (this.form.relist_item_id) payload.relist_item_id = Number(this.form.relist_item_id)

      this.saving = true
      try {
        const res = await ExchangeItemAPI.createConsignment(payload)
        if (res.success) {
          Alpine.store('notification').show('寄卖单创建成功', 'success')
          this.closeForm()
          await this.loadData()
        } else {
          Alpine.store('notification').show(res.message || '创建失败', 'error')
        }
      } catch (error) {
        Alpine.store('notification').show('创建失败：' + error.message, 'error')
      } finally {
        this.saving = false
      }
    },

    async doAction(action, id, label) {
      if (!confirm(`确定要${label}吗？`)) return
      const fn = {
        list: ExchangeItemAPI.listConsignmentAction,
        sold: ExchangeItemAPI.markConsignmentSold,
        withdraw: ExchangeItemAPI.withdrawConsignment,
        reject: ExchangeItemAPI.rejectConsignment
      }[action]
      try {
        const res = await fn(id)
        if (res.success) {
          Alpine.store('notification').show(`${label}成功`, 'success')
          await this.loadData()
        } else {
          Alpine.store('notification').show(res.message || '操作失败', 'error')
        }
      } catch (error) {
        Alpine.store('notification').show('操作失败：' + error.message, 'error')
      }
    },

    statusLabel(status) {
      return STATUS_LABELS[status] || status
    },

    statusClass(status) {
      const map = {
        pending: 'bg-yellow-100 text-yellow-700',
        listed: 'bg-blue-100 text-blue-700',
        sold: 'bg-green-100 text-green-700',
        withdrawn: 'bg-gray-100 text-gray-600',
        rejected: 'bg-red-100 text-red-600'
      }
      return map[status] || 'bg-gray-100 text-gray-600'
    },

    formatDate(dateStr) {
      return formatDate(dateStr)
    }
  }))
}

document.addEventListener('alpine:init', registerConsignmentComponents)
