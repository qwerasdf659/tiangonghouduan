/**
 * 产品系列管理页面 - Alpine.js 组件
 *
 * @file admin/src/modules/market/pages/product-series-management.js
 * @description 产品系列 CRUD（商品编码体系 §3.6 双轨制之可读系列号轨道）
 *
 * 业务规则：
 * - 系列码 series_code 运营手填（会印给顾客看，需人可读），后端全大写归一化 + 唯一校验。
 * - 序号 next_seq 由后端发号器在商品归入系列时事务内自动分配，本页不可人工修改。
 * - 存在归属商品的系列禁止删除（后端 409），保护连号可追溯性。
 */

import { logger, formatDate, formatSeriesNo } from '../../../utils/index.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { ExchangeItemAPI } from '../../../api/exchange-item/index.js'

function registerProductSeriesComponents() {
  logger.info('[ProductSeriesManagement] 注册 Alpine 组件...')

  if (typeof window.Alpine === 'undefined') {
    logger.error('[ProductSeriesManagement] Alpine.js 未加载')
    return
  }

  Alpine.data('productSeriesManagement', () => ({
    ...createPageMixin(),

    seriesList: [],
    total: 0,
    pagination: { page: 1, page_size: 20 },
    filters: { status: '', keyword: '' },
    loading: false,

    show_form: false,
    is_edit: false,
    saving: false,
    form: {
      series_code: '',
      series_name: '',
      seq_pad: 3,
      status: 'active'
    },
    editing_id: null,

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
      logger.info('[ProductSeriesManagement] 初始化')
      if (!this.checkAuth()) return
      await this.loadData()
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

        const res = await ExchangeItemAPI.listProductSeries(params)
        if (res.success) {
          this.seriesList = res.data.items || []
          this.total = res.data.total || 0
        } else {
          Alpine.store('notification').show(res.message || '加载失败', 'error')
        }
      } catch (error) {
        logger.error('[ProductSeriesManagement] 加载列表失败', error)
        Alpine.store('notification').show('加载系列列表失败', 'error')
      } finally {
        this.loading = false
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
        series_code: '',
        series_name: '',
        seq_pad: 3,
        status: 'active'
      }
      this.show_form = true
    },

    async openEditForm(seriesId) {
      try {
        const res = await ExchangeItemAPI.getProductSeries(seriesId)
        if (res.success) {
          this.is_edit = true
          this.editing_id = seriesId
          this.form = {
            series_code: res.data.series_code,
            series_name: res.data.series_name,
            seq_pad: res.data.seq_pad ?? 3,
            status: res.data.status
          }
          this.show_form = true
        }
      } catch (_error) {
        Alpine.store('notification').show('加载系列信息失败', 'error')
      }
    },

    closeForm() {
      this.show_form = false
      this.is_edit = false
      this.editing_id = null
    },

    async submitForm() {
      if (!this.form.series_code.trim()) {
        Alpine.store('notification').show('请输入系列码', 'warning')
        return
      }
      if (!this.form.series_name.trim()) {
        Alpine.store('notification').show('请输入系列名称', 'warning')
        return
      }

      this.saving = true
      try {
        let res
        if (this.is_edit) {
          res = await ExchangeItemAPI.updateProductSeries(this.editing_id, this.form)
        } else {
          res = await ExchangeItemAPI.createProductSeries(this.form)
        }

        if (res.success) {
          Alpine.store('notification').show(
            this.is_edit ? '系列信息更新成功' : '系列创建成功',
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

    async handleDelete(seriesId, seriesCode) {
      if (!confirm(`确定要删除系列「${seriesCode}」吗？存在归属商品时将被拒绝（需先移出商品）。`))
        return

      try {
        const res = await ExchangeItemAPI.deleteProductSeries(seriesId)
        if (res.success) {
          Alpine.store('notification').show('系列删除成功', 'success')
          await this.loadData()
        } else {
          Alpine.store('notification').show(res.message || '删除失败', 'error')
        }
      } catch (error) {
        Alpine.store('notification').show('删除失败：' + error.message, 'error')
      }
    },

    /**
     * 下一序号展示形（如 SLNB-003，代表系统下一个将分配的连号）
     * @param {Object} s - 系列记录
     * @returns {string} 展示形系列号
     */
    formatNextSeq(s) {
      return formatSeriesNo(s.series_code, s.next_seq, s.seq_pad)
    },

    /**
     * 北京时间格式化（全站统一北京时区口径）
     * @param {string} dateStr - 后端 UTC ISO 时间串
     * @returns {string} 北京时间展示串
     */
    formatDate(dateStr) {
      return formatDate(dateStr)
    }
  }))
}

document.addEventListener('alpine:init', registerProductSeriesComponents)
