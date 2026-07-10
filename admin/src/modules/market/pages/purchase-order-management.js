/**
 * 采购单管理页面 - Alpine.js 组件（S1 进货管理）
 *
 * @file admin/src/modules/market/pages/purchase-order-management.js
 */

import { logger, formatDate } from '../../../utils/index.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { ExchangeItemAPI } from '../../../api/exchange-item/index.js'

const STATUS_LABELS = {
  draft: '草稿',
  ordered: '已下单',
  received: '已收货',
  cancelled: '已取消'
}

function registerPurchaseOrderComponents() {
  logger.info('[PurchaseOrderManagement] 注册 Alpine 组件...')

  if (typeof window.Alpine === 'undefined') {
    logger.error('[PurchaseOrderManagement] Alpine.js 未加载')
    return
  }

  Alpine.data('purchaseOrderManagement', () => ({
    ...createPageMixin(),

    items: [],
    total: 0,
    pagination: { page: 1, page_size: 20 },
    filters: { status: '', supplier_id: '', keyword: '' },
    loading: false,
    supplierOptions: [],

    show_form: false,
    is_edit: false,
    saving: false,
    editing_id: null,
    form: { supplier_id: '', remark: '', lines: [] },

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
      await Promise.all([this.loadSuppliers(), this.loadData()])
    },

    async loadSuppliers() {
      try {
        const res = await ExchangeItemAPI.listSuppliers({ status: 'active', page_size: 200 })
        if (res.success) this.supplierOptions = res.data.items || []
      } catch (error) {
        logger.error('[PurchaseOrderManagement] 加载供应商失败', error)
      }
    },

    async loadData() {
      this.loading = true
      try {
        const params = { page: this.pagination.page, page_size: this.pagination.page_size, ...this.filters }
        Object.keys(params).forEach(k => {
          if (!params[k]) delete params[k]
        })
        const res = await ExchangeItemAPI.listPurchaseOrders(params)
        if (res.success) {
          this.items = res.data.items || []
          this.total = res.data.total || 0
        } else {
          Alpine.store('notification').show(res.message || '加载失败', 'error')
        }
      } catch (error) {
        logger.error('[PurchaseOrderManagement] 加载列表失败', error)
        Alpine.store('notification').show('加载采购单列表失败', 'error')
      } finally {
        this.loading = false
      }
    },

    async handleSearch() {
      this.pagination.page = 1
      await this.loadData()
    },

    async resetFilters() {
      this.filters = { status: '', supplier_id: '', keyword: '' }
      this.pagination.page = 1
      await this.loadData()
    },

    goToPage(page) {
      if (page < 1 || page > this.totalPages) return
      this.pagination.page = page
      this.loadData()
    },

    emptyLine() {
      return { exchange_item_id: '', sku_id: '', quantity: 1, purchase_price: '' }
    },

    openCreateForm() {
      this.is_edit = false
      this.editing_id = null
      this.form = { supplier_id: '', remark: '', lines: [this.emptyLine()] }
      this.show_form = true
    },

    async openEditForm(id) {
      try {
        const res = await ExchangeItemAPI.getPurchaseOrder(id)
        if (!res.success) return
        const d = res.data
        if (!['draft', 'ordered'].includes(d.status)) {
          Alpine.store('notification').show('当前状态不可编辑', 'warning')
          return
        }
        this.is_edit = true
        this.editing_id = id
        this.form = {
          supplier_id: d.supplier_id,
          remark: d.remark || '',
          lines: (d.lines || []).map(l => ({
            exchange_item_id: l.exchange_item_id || '',
            sku_id: l.sku_id || '',
            quantity: l.quantity,
            purchase_price: l.purchase_price ?? ''
          }))
        }
        if (this.form.lines.length === 0) this.form.lines = [this.emptyLine()]
        this.show_form = true
      } catch (_error) {
        Alpine.store('notification').show('加载采购单失败', 'error')
      }
    },

    async viewDetail(id) {
      try {
        const res = await ExchangeItemAPI.getPurchaseOrder(id)
        if (res.success) {
          this.detail = res.data
          this.show_detail = true
        }
      } catch (_error) {
        Alpine.store('notification').show('加载详情失败', 'error')
      }
    },

    closeForm() {
      this.show_form = false
      this.is_edit = false
      this.editing_id = null
    },

    addLine() {
      this.form.lines.push(this.emptyLine())
    },

    removeLine(idx) {
      if (this.form.lines.length <= 1) return
      this.form.lines.splice(idx, 1)
    },

    async submitForm() {
      if (!this.form.supplier_id) {
        Alpine.store('notification').show('请选择供应商', 'warning')
        return
      }
      const payload = {
        supplier_id: Number(this.form.supplier_id),
        remark: this.form.remark || null,
        lines: this.form.lines.map(l => ({
          exchange_item_id: l.exchange_item_id ? Number(l.exchange_item_id) : null,
          sku_id: l.sku_id ? Number(l.sku_id) : null,
          quantity: Number(l.quantity),
          purchase_price: l.purchase_price !== '' ? Number(l.purchase_price) : null
        }))
      }
      this.saving = true
      try {
        const res = this.is_edit
          ? await ExchangeItemAPI.updatePurchaseOrder(this.editing_id, payload)
          : await ExchangeItemAPI.createPurchaseOrder(payload)
        if (res.success) {
          Alpine.store('notification').show(this.is_edit ? '采购单更新成功' : '采购单创建成功', 'success')
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

    async doAction(action, id, label) {
      if (!confirm(`确定要${label}吗？`)) return
      const fn = {
        submit: ExchangeItemAPI.submitPurchaseOrder,
        receive: ExchangeItemAPI.receivePurchaseOrder,
        cancel: ExchangeItemAPI.cancelPurchaseOrder
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
        draft: 'bg-gray-100 text-gray-600',
        ordered: 'bg-blue-100 text-blue-700',
        received: 'bg-green-100 text-green-700',
        cancelled: 'bg-red-100 text-red-600'
      }
      return map[status] || 'bg-gray-100 text-gray-600'
    },

    formatDate(dateStr) {
      return formatDate(dateStr)
    }
  }))
}

document.addEventListener('alpine:init', registerPurchaseOrderComponents)
