/**
 * 商家管理页面 - Alpine.js 组件
 *
 * @file admin/src/modules/merchant/pages/merchant-management.js
 * @description 商家 CRUD 管理页面（列表、创建、编辑、删除）
 * @version 1.0.0
 * @date 2026-02-23
 */

import { logger } from '../../../utils/logger.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import {
  getMerchantList,
  getMerchantDetail,
  createMerchant,
  updateMerchant,
  deleteMerchant,
  getMerchantTypeOptions
} from '../../../api/merchant.js'

function registerMerchantComponents() {
  logger.info('[MerchantManagement] 注册 Alpine 组件...')

  if (typeof window.Alpine === 'undefined') {
    logger.error('[MerchantManagement] Alpine.js 未加载')
    return
  }

  Alpine.data('merchantManagement', () => ({
    ...createPageMixin(),

    // 列表状态
    merchants: [],
    total: 0,
    pagination: { page: 1, page_size: 20 },
    filters: { merchant_type: '', status: '', keyword: '' },
    loading: false,

    // 类型选项（字典表驱动）
    type_options: [],
    status_options: [
      { code: 'active', name: '正常', color: '#10b981' },
      { code: 'inactive', name: '停用', color: '#6b7280' },
      { code: 'suspended', name: '暂停', color: '#ef4444' }
    ],

    // 表单状态
    show_form: false,
    is_edit: false,
    saving: false,
    form: {
      merchant_name: '',
      merchant_type: '',
      contact_name: '',
      contact_mobile: '',
      logo_url: '',
      status: 'active',
      commission_rate: 0,
      notes: ''
    },
    editing_id: null,

    // 详情弹窗
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
      logger.info('[MerchantManagement] 初始化')
      if (!this.checkAuth()) return
      await this.loadTypeOptions()
      await this.loadData()
    },

    async loadTypeOptions() {
      try {
        const res = await getMerchantTypeOptions()
        if (res.success) {
          this.type_options = res.data
        }
      } catch (error) {
        logger.error('[MerchantManagement] 加载类型选项失败', error)
      }
    },

    async loadData() {
      this.loading = true
      try {
        const params = {
          page: this.pagination.page,
          page_size: this.pagination.page_size,
          ...this.filters
        }
        Object.keys(params).forEach(k => {
          if (!params[k]) delete params[k]
        })

        const res = await getMerchantList(params)
        if (res.success) {
          this.merchants = res.data.list
          this.total = res.data.total
        } else {
          Alpine.store('notification').show(res.message || '加载失败', 'error')
        }
      } catch (error) {
        logger.error('[MerchantManagement] 加载列表失败', error)
        Alpine.store('notification').show('加载商家列表失败', 'error')
      } finally {
        this.loading = false
      }
    },

    async handleSearch() {
      this.pagination.page = 1
      await this.loadData()
    },

    async resetFilters() {
      this.filters = { merchant_type: '', status: '', keyword: '' }
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
        merchant_name: '',
        merchant_type: '',
        contact_name: '',
        contact_mobile: '',
        logo_url: '',
        status: 'active',
        commission_rate: 0,
        notes: ''
      }
      this.show_form = true
    },

    async openEditForm(merchantId) {
      try {
        const res = await getMerchantDetail(merchantId)
        if (res.success) {
          this.is_edit = true
          this.editing_id = merchantId
          this.form = {
            merchant_name: res.data.merchant_name,
            merchant_type: res.data.merchant_type,
            contact_name: res.data.contact_name || '',
            contact_mobile: res.data.contact_mobile || '',
            logo_url: res.data.logo_url || '',
            status: res.data.status,
            commission_rate: res.data.commission_rate || 0,
            notes: res.data.notes || ''
          }
          this.show_form = true
        }
      } catch (_error) {
        Alpine.store('notification').show('加载商家信息失败', 'error')
      }
    },

    closeForm() {
      this.show_form = false
      this.is_edit = false
      this.editing_id = null
    },

    async submitForm() {
      if (!this.form.merchant_name.trim()) {
        Alpine.store('notification').show('请输入商家名称', 'warning')
        return
      }
      if (!this.form.merchant_type) {
        Alpine.store('notification').show('请选择商家类型', 'warning')
        return
      }

      this.saving = true
      try {
        let res
        if (this.is_edit) {
          res = await updateMerchant(this.editing_id, this.form)
        } else {
          res = await createMerchant(this.form)
        }

        if (res.success) {
          Alpine.store('notification').show(
            this.is_edit ? '商家信息更新成功' : '商家创建成功',
            'success'
          )
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

    async viewDetail(merchantId) {
      try {
        const res = await getMerchantDetail(merchantId)
        if (res.success) {
          this.detail = res.data
          this.show_detail = true
        }
      } catch (_error) {
        Alpine.store('notification').show('加载详情失败', 'error')
      }
    },

    async handleDelete(merchantId, merchantName) {
      if (!confirm(`确定要删除商家「${merchantName}」吗？此操作不可撤销。`)) return

      try {
        const res = await deleteMerchant(merchantId)
        if (res.success) {
          Alpine.store('notification').show('商家删除成功', 'success')
          await this.loadData()
        } else {
          Alpine.store('notification').show(res.message || '删除失败', 'error')
        }
      } catch (error) {
        Alpine.store('notification').show('删除失败：' + error.message, 'error')
      }
    },

    getTypeName(code) {
      const type = this.type_options.find(t => t.code === code)
      return type ? type.name : code
    },

    getTypeColor(code) {
      const type = this.type_options.find(t => t.code === code)
      return type ? type.color : '#6b7280'
    },

    getStatusName(status) {
      const s = this.status_options.find(o => o.code === status)
      return s ? s.name : status
    },

    getStatusColor(status) {
      const s = this.status_options.find(o => o.code === status)
      return s ? s.color : '#6b7280'
    },

    formatDate(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    }
  }))
}

document.addEventListener('alpine:init', registerMerchantComponents)
