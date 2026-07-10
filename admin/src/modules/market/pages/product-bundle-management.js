/**
 * 组合商品管理页面 - Alpine.js 组件（S4 组合/套装）
 *
 * @file admin/src/modules/market/pages/product-bundle-management.js
 */

import { logger, formatDate } from '../../../utils/index.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { ExchangeItemAPI } from '../../../api/exchange-item/index.js'

const STATUS_LABELS = { active: '启用', inactive: '停用' }
const BUNDLE_TYPE_LABELS = { suit: '套装', gift: '赠品搭售' }

function registerProductBundleComponents() {
  logger.info('[ProductBundleManagement] 注册 Alpine 组件...')

  if (typeof window.Alpine === 'undefined') {
    logger.error('[ProductBundleManagement] Alpine.js 未加载')
    return
  }

  Alpine.data('productBundleManagement', () => ({
    ...createPageMixin(),

    items: [],
    total: 0,
    pagination: { page: 1, page_size: 20 },
    filters: { status: '', bundle_type: '', keyword: '' },
    loading: false,

    show_form: false,
    is_edit: false,
    saving: false,
    editing_id: null,
    form: {
      exchange_item: { item_name: '', description: '', status: 'active' },
      bundle_type: 'suit',
      status: 'active',
      items: []
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
        const res = await ExchangeItemAPI.listProductBundles(params)
        if (res.success) {
          this.items = res.data.items || []
          this.total = res.data.total || 0
        } else {
          Alpine.store('notification').show(res.message || '加载失败', 'error')
        }
      } catch (error) {
        logger.error('[ProductBundleManagement] 加载列表失败', error)
        Alpine.store('notification').show('加载组合商品列表失败', 'error')
      } finally {
        this.loading = false
      }
    },

    async handleSearch() {
      this.pagination.page = 1
      await this.loadData()
    },

    async resetFilters() {
      this.filters = { status: '', bundle_type: '', keyword: '' }
      this.pagination.page = 1
      await this.loadData()
    },

    goToPage(page) {
      if (page < 1 || page > this.totalPages) return
      this.pagination.page = page
      this.loadData()
    },

    emptyBomLine() {
      return { child_item_id: '', child_sku_id: '', quantity: 1, is_gift: false }
    },

    openCreateForm() {
      this.is_edit = false
      this.editing_id = null
      this.form = {
        exchange_item: { item_name: '', description: '', status: 'active' },
        bundle_type: 'suit',
        status: 'active',
        items: [this.emptyBomLine()]
      }
      this.show_form = true
    },

    async openEditForm(id) {
      try {
        const res = await ExchangeItemAPI.getProductBundle(id)
        if (!res.success) return
        const d = res.data
        this.is_edit = true
        this.editing_id = id
        this.form = {
          exchange_item: {
            item_name: d.exchangeItem?.item_name || '',
            description: d.exchangeItem?.description || '',
            status: d.exchangeItem?.status || 'active'
          },
          bundle_type: d.bundle_type || 'suit',
          status: d.status || 'active',
          items: (d.items || []).map(i => ({
            child_item_id: i.child_item_id || '',
            child_sku_id: i.child_sku_id || '',
            quantity: i.quantity,
            is_gift: !!i.is_gift
          }))
        }
        if (this.form.items.length === 0) this.form.items = [this.emptyBomLine()]
        this.show_form = true
      } catch (_error) {
        Alpine.store('notification').show('加载组合商品失败', 'error')
      }
    },

    async viewDetail(id) {
      try {
        const res = await ExchangeItemAPI.getProductBundle(id)
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

    addBomLine() {
      this.form.items.push(this.emptyBomLine())
    },

    removeBomLine(idx) {
      if (this.form.items.length <= 1) return
      this.form.items.splice(idx, 1)
    },

    async submitForm() {
      if (!this.form.exchange_item.item_name.trim()) {
        Alpine.store('notification').show('请输入组合商品名称', 'warning')
        return
      }
      const payload = {
        exchange_item: { ...this.form.exchange_item },
        bundle_type: this.form.bundle_type,
        status: this.form.status,
        items: this.form.items.map(i => ({
          child_item_id: i.child_item_id ? Number(i.child_item_id) : null,
          child_sku_id: i.child_sku_id ? Number(i.child_sku_id) : null,
          quantity: Number(i.quantity) || 1,
          is_gift: !!i.is_gift
        }))
      }
      this.saving = true
      try {
        const res = this.is_edit
          ? await ExchangeItemAPI.updateProductBundle(this.editing_id, payload)
          : await ExchangeItemAPI.createProductBundle(payload)
        if (res.success) {
          Alpine.store('notification').show(this.is_edit ? '组合商品更新成功' : '组合商品创建成功', 'success')
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

    statusLabel(status) {
      return STATUS_LABELS[status] || status
    },

    bundleTypeLabel(type) {
      return BUNDLE_TYPE_LABELS[type] || type
    },

    formatDate(dateStr) {
      return formatDate(dateStr)
    }
  }))
}

document.addEventListener('alpine:init', registerProductBundleComponents)
