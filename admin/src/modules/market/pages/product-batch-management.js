/**
 * 产品批次管理页面 - Alpine.js 组件（S2 批次管理）
 *
 * @file admin/src/modules/market/pages/product-batch-management.js
 */

import { logger, formatDate } from '../../../utils/index.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { ExchangeItemAPI } from '../../../api/exchange-item/index.js'

const STATUS_LABELS = { active: '有效', inactive: '已召回' }

function registerProductBatchComponents() {
  logger.info('[ProductBatchManagement] 注册 Alpine 组件...')

  if (typeof window.Alpine === 'undefined') {
    logger.error('[ProductBatchManagement] Alpine.js 未加载')
    return
  }

  Alpine.data('productBatchManagement', () => ({
    ...createPageMixin(),

    items: [],
    total: 0,
    pagination: { page: 1, page_size: 20 },
    filters: { status: '', supplier_id: '', exchange_item_id: '', keyword: '' },
    loading: false,
    supplierOptions: [],

    show_form: false,
    is_edit: false,
    saving: false,
    editing_id: null,
    form: {
      exchange_item_id: '',
      sku_id: '',
      supplier_id: '',
      batch_cost: '',
      quantity: 0,
      produced_at: '',
      status: 'active'
    },

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
      await Promise.all([this.loadSuppliers(), this.loadData()])
    },

    async loadSuppliers() {
      try {
        const res = await ExchangeItemAPI.listSuppliers({ status: 'active', page_size: 200 })
        if (res.success) this.supplierOptions = res.data.items || []
      } catch (error) {
        logger.error('[ProductBatchManagement] 加载供应商失败', error)
      }
    },

    async loadData() {
      this.loading = true
      try {
        const params = { page: this.pagination.page, page_size: this.pagination.page_size, ...this.filters }
        Object.keys(params).forEach(k => {
          if (!params[k]) delete params[k]
        })
        const res = await ExchangeItemAPI.listProductBatches(params)
        if (res.success) {
          this.items = res.data.items || []
          this.total = res.data.total || 0
        } else {
          Alpine.store('notification').show(res.message || '加载失败', 'error')
        }
      } catch (error) {
        logger.error('[ProductBatchManagement] 加载列表失败', error)
        Alpine.store('notification').show('加载批次列表失败', 'error')
      } finally {
        this.loading = false
      }
    },

    async handleSearch() {
      this.pagination.page = 1
      await this.loadData()
    },

    async resetFilters() {
      this.filters = { status: '', supplier_id: '', exchange_item_id: '', keyword: '' }
      this.pagination.page = 1
      await this.loadData()
    },

    goToPage(page) {
      if (page < 1 || page > this.totalPages) return
      this.pagination.page = page
      this.loadData()
    },

    openCreateForm() {
      this.is_edit = false
      this.editing_id = null
      this.form = {
        exchange_item_id: '',
        sku_id: '',
        supplier_id: '',
        batch_cost: '',
        quantity: 0,
        produced_at: '',
        status: 'active'
      }
      this.show_form = true
    },

    async openEditForm(id) {
      try {
        const res = await ExchangeItemAPI.getProductBatch(id)
        if (!res.success) return
        const d = res.data
        this.is_edit = true
        this.editing_id = id
        this.form = {
          exchange_item_id: d.exchange_item_id || '',
          sku_id: d.sku_id || '',
          supplier_id: d.supplier_id || '',
          batch_cost: d.batch_cost ?? '',
          quantity: d.quantity ?? 0,
          produced_at: d.produced_at ? d.produced_at.slice(0, 10) : '',
          status: d.status || 'active'
        }
        this.show_form = true
      } catch (_error) {
        Alpine.store('notification').show('加载批次失败', 'error')
      }
    },

    closeForm() {
      this.show_form = false
      this.is_edit = false
      this.editing_id = null
    },

    async submitForm() {
      const payload = {
        exchange_item_id: this.form.exchange_item_id ? Number(this.form.exchange_item_id) : null,
        sku_id: this.form.sku_id ? Number(this.form.sku_id) : null,
        supplier_id: this.form.supplier_id ? Number(this.form.supplier_id) : null,
        batch_cost: this.form.batch_cost !== '' ? Number(this.form.batch_cost) : null,
        quantity: Number(this.form.quantity) || 0,
        status: this.form.status
      }
      if (this.form.produced_at) payload.produced_at = this.form.produced_at

      this.saving = true
      try {
        const res = this.is_edit
          ? await ExchangeItemAPI.updateProductBatch(this.editing_id, payload)
          : await ExchangeItemAPI.createProductBatch(payload)
        if (res.success) {
          Alpine.store('notification').show(this.is_edit ? '批次更新成功' : '批次创建成功', 'success')
          this.closeForm()
          await this.loadData()
        } else {
          Alpine.store('notification').show(res.message || '操作失败', 'error')
        }
      } catch (error) {
        Alpine.store('notification').show('操作失败：' + error.message, 'error')
      } finally {
        this.saving = false
      }
    },

    async handleRecall(id, batchCode) {
      if (!confirm(`确定要召回批次「${batchCode}」吗？`)) return
      try {
        const res = await ExchangeItemAPI.recallProductBatch(id)
        if (res.success) {
          Alpine.store('notification').show('批次召回成功', 'success')
          await this.loadData()
        } else {
          Alpine.store('notification').show(res.message || '召回失败', 'error')
        }
      } catch (error) {
        Alpine.store('notification').show('召回失败：' + error.message, 'error')
      }
    },

    statusLabel(status) {
      return STATUS_LABELS[status] || status
    },

    statusClass(status) {
      return status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
    },

    formatDate(dateStr) {
      return formatDate(dateStr)
    }
  }))
}

document.addEventListener('alpine:init', registerProductBatchComponents)
