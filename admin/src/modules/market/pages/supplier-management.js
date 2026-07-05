/**
 * 供应商管理页面 - Alpine.js 组件
 *
 * @file admin/src/modules/market/pages/supplier-management.js
 * @description 供货商主数据 CRUD + 按货号找货辅助查询（商品编码体系 §3.8/§8.3）
 *
 * 业务边界：供货商（进货来源）与「商家管理」的核销商家（merchants，抽佣/结算）是两套独立主数据，互不复用。
 * 货号 supplier_item_code 可空可重复（脏数据如实存），命中多条如实展示，运营以我方 SP 商品编码为准精确定位。
 */

import { logger, formatDate, formatProductCode } from '../../../utils/index.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { ExchangeItemAPI } from '../../../api/exchange-item/index.js'

function registerSupplierComponents() {
  logger.info('[SupplierManagement] 注册 Alpine 组件...')

  if (typeof window.Alpine === 'undefined') {
    logger.error('[SupplierManagement] Alpine.js 未加载')
    return
  }

  Alpine.data('supplierManagement', () => ({
    ...createPageMixin(),

    /** 当前 Tab：suppliers=供应商列表 / code-search=按货号找货 */
    activeTab: 'suppliers',

    suppliers: [],
    total: 0,
    pagination: { page: 1, page_size: 20 },
    filters: { status: '', keyword: '' },
    loading: false,

    show_form: false,
    is_edit: false,
    saving: false,
    form: {
      supplier_name: '',
      contact_name: '',
      contact_phone: '',
      status: 'active',
      notes: ''
    },
    editing_id: null,

    show_detail: false,
    detail: null,

    /** 货号辅助查询状态 */
    codeSearch: { supplier_item_code: '', supplier_id: '' },
    codeSearchResults: [],
    codeSearchTotal: 0,
    codeSearchLoading: false,
    codeSearchDone: false,
    /** 货号查询 Tab 的供应商下拉选项（全量启用中供应商） */
    allSupplierOptions: [],

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
      logger.info('[SupplierManagement] 初始化')
      if (!this.checkAuth()) return
      await this.loadData()
    },

    /**
     * 切换 Tab（进入货号查询 Tab 时懒加载供应商下拉选项）
     * @param {string} tab - suppliers | code-search
     */
    async switchTab(tab) {
      this.activeTab = tab
      if (tab === 'code-search' && this.allSupplierOptions.length === 0) {
        await this.loadAllSupplierOptions()
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

        const res = await ExchangeItemAPI.listSuppliers(params)
        if (res.success) {
          this.suppliers = res.data.items || []
          this.total = res.data.total || 0
        } else {
          Alpine.store('notification').show(res.message || '加载失败', 'error')
        }
      } catch (error) {
        logger.error('[SupplierManagement] 加载列表失败', error)
        Alpine.store('notification').show('加载供应商列表失败', 'error')
      } finally {
        this.loading = false
      }
    },

    /** 加载全量启用中供应商（货号查询 Tab 下拉用） */
    async loadAllSupplierOptions() {
      try {
        const res = await ExchangeItemAPI.listSuppliers({ status: 'active', page_size: 200 })
        if (res.success) {
          this.allSupplierOptions = res.data.items || []
        }
      } catch (error) {
        logger.error('[SupplierManagement] 加载供应商选项失败', error)
      }
    },

    async handleSearch() {
      this.pagination.page = 1
      await this.loadData()
    },

    async resetFilters() {
      this.filters = { status: '', keyword: '' }
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
        supplier_name: '',
        contact_name: '',
        contact_phone: '',
        status: 'active',
        notes: ''
      }
      this.show_form = true
    },

    async openEditForm(supplierId) {
      try {
        const res = await ExchangeItemAPI.getSupplier(supplierId)
        if (res.success) {
          this.is_edit = true
          this.editing_id = supplierId
          this.form = {
            supplier_name: res.data.supplier_name,
            contact_name: res.data.contact_name || '',
            contact_phone: res.data.contact_phone || '',
            status: res.data.status,
            notes: res.data.notes || ''
          }
          this.show_form = true
        }
      } catch (_error) {
        Alpine.store('notification').show('加载供应商信息失败', 'error')
      }
    },

    closeForm() {
      this.show_form = false
      this.is_edit = false
      this.editing_id = null
    },

    async submitForm() {
      if (!this.form.supplier_name.trim()) {
        Alpine.store('notification').show('请输入供应商名称', 'warning')
        return
      }

      this.saving = true
      try {
        let res
        if (this.is_edit) {
          res = await ExchangeItemAPI.updateSupplier(this.editing_id, this.form)
        } else {
          res = await ExchangeItemAPI.createSupplier(this.form)
        }

        if (res.success) {
          Alpine.store('notification').show(
            this.is_edit ? '供应商信息更新成功' : '供应商创建成功',
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

    /**
     * 查看供应商供货商品清单（详情弹窗）
     * @param {number} supplierId - 供应商 ID
     */
    async viewDetail(supplierId) {
      try {
        const res = await ExchangeItemAPI.getSupplier(supplierId)
        if (res.success) {
          this.detail = res.data
          this.show_detail = true
        }
      } catch (_error) {
        Alpine.store('notification').show('加载详情失败', 'error')
      }
    },

    async handleDelete(supplierId, supplierName) {
      if (
        !confirm(
          `确定要删除供应商「${supplierName}」吗？存在商品关联时将被拒绝（需先在商品上解除关联）。`
        )
      )
        return

      try {
        const res = await ExchangeItemAPI.deleteSupplier(supplierId)
        if (res.success) {
          Alpine.store('notification').show('供应商删除成功', 'success')
          await this.loadData()
        } else {
          Alpine.store('notification').show(res.message || '删除失败', 'error')
        }
      } catch (error) {
        Alpine.store('notification').show('删除失败：' + error.message, 'error')
      }
    },

    /**
     * 按货号找货（§3.8 辅助查询：货号模糊 + 供应商筛选 + 组合定位）
     * 至少提供货号关键词或供应商之一；命中多条如实展示（不去重）。
     */
    async handleCodeSearch() {
      const codeKw = String(this.codeSearch.supplier_item_code || '').trim()
      if (!codeKw && !this.codeSearch.supplier_id) {
        Alpine.store('notification').show('请输入货号关键词或选择供应商', 'warning')
        return
      }

      this.codeSearchLoading = true
      try {
        const params = { page: 1, page_size: 100 }
        if (codeKw) params.supplier_item_code = codeKw
        if (this.codeSearch.supplier_id) params.supplier_id = this.codeSearch.supplier_id

        const res = await ExchangeItemAPI.searchBySupplierItemCode(params)
        if (res.success) {
          this.codeSearchResults = res.data.items || []
          this.codeSearchTotal = res.data.total || 0
          this.codeSearchDone = true
        } else {
          Alpine.store('notification').show(res.message || '查询失败', 'error')
        }
      } catch (error) {
        logger.error('[SupplierManagement] 货号查询失败', error)
        Alpine.store('notification').show('货号查询失败：' + error.message, 'error')
      } finally {
        this.codeSearchLoading = false
      }
    },

    /**
     * 商品编码展示形（SP-XXXX-XXXX-XXXX）
     * @param {string} code - 规范形 item_code
     * @returns {string} 展示形编码
     */
    formatItemCode(code) {
      return formatProductCode(code)
    },

    /**
     * 北京时间格式化（mixin 统一北京时区口径）
     * @param {string} dateStr - 后端 UTC ISO 时间串
     * @returns {string} 北京时间展示串
     */
    formatDate(dateStr) {
      return formatDate(dateStr)
    }
  }))
}

document.addEventListener('alpine:init', registerSupplierComponents)
