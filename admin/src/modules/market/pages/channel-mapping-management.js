/**
 * 渠道映射管理页面 - Alpine.js 组件（S5 外部渠道映射）
 *
 * @file admin/src/modules/market/pages/channel-mapping-management.js
 */

import { logger, formatDate } from '../../../utils/index.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { ExchangeItemAPI } from '../../../api/exchange-item/index.js'

const SYNC_STATUS_LABELS = {
  pending: '待同步',
  synced: '已同步',
  failed: '同步失败',
  disabled: '已禁用'
}

function registerChannelMappingComponents() {
  logger.info('[ChannelMappingManagement] 注册 Alpine 组件...')

  if (typeof window.Alpine === 'undefined') {
    logger.error('[ChannelMappingManagement] Alpine.js 未加载')
    return
  }

  Alpine.data('channelMappingManagement', () => ({
    ...createPageMixin(),

    items: [],
    total: 0,
    pagination: { page: 1, page_size: 20 },
    filters: { channel: '', sync_status: '', exchange_item_id: '', keyword: '' },
    loading: false,

    /** 分销渠道字典（后端 system_dictionaries 下发，拍板 #24 加渠道零发版） */
    channelDict: [],

    show_form: false,
    is_edit: false,
    saving: false,
    editing_id: null,
    form: {
      channel: '',
      external_item_id: '',
      exchange_item_id: '',
      sync_status: 'pending',
      channel_price: ''
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
      await this.loadChannelDict()
      await this.loadData()
    },

    /** 加载启用的分销渠道字典（下拉数据源） */
    async loadChannelDict() {
      try {
        const res = await ExchangeItemAPI.listChannelDict()
        if (res.success) {
          this.channelDict = res.data.channels || []
        }
      } catch (error) {
        logger.error('[ChannelMappingManagement] 加载渠道字典失败', error)
      }
    },

    async loadData() {
      this.loading = true
      try {
        const params = { page: this.pagination.page, page_size: this.pagination.page_size, ...this.filters }
        Object.keys(params).forEach(k => {
          if (!params[k]) delete params[k]
        })
        const res = await ExchangeItemAPI.listChannelMappings(params)
        if (res.success) {
          this.items = res.data.items || []
          this.total = res.data.total || 0
        } else {
          Alpine.store('notification').show(res.message || '加载失败', 'error')
        }
      } catch (error) {
        logger.error('[ChannelMappingManagement] 加载列表失败', error)
        Alpine.store('notification').show('加载渠道映射列表失败', 'error')
      } finally {
        this.loading = false
      }
    },

    async handleSearch() {
      this.pagination.page = 1
      await this.loadData()
    },

    async resetFilters() {
      this.filters = { channel: '', sync_status: '', exchange_item_id: '', keyword: '' }
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
        channel: this.channelDict[0]?.code || '',
        external_item_id: '',
        exchange_item_id: '',
        sync_status: 'pending',
        channel_price: ''
      }
      this.show_form = true
    },

    async openEditForm(id) {
      try {
        const res = await ExchangeItemAPI.getChannelMapping(id)
        if (!res.success) return
        const d = res.data
        this.is_edit = true
        this.editing_id = id
        this.form = {
          channel: d.channel,
          external_item_id: d.external_item_id,
          exchange_item_id: d.exchange_item_id,
          sync_status: d.sync_status,
          channel_price: d.channel_price != null ? d.channel_price : ''
        }
        this.show_form = true
      } catch (_error) {
        Alpine.store('notification').show('加载映射失败', 'error')
      }
    },

    closeForm() {
      this.show_form = false
      this.is_edit = false
      this.editing_id = null
    },

    async submitForm() {
      if (!this.form.external_item_id.trim()) {
        Alpine.store('notification').show('请输入外部商品 ID', 'warning')
        return
      }
      if (!this.form.exchange_item_id) {
        Alpine.store('notification').show('请输入我方商品 ID', 'warning')
        return
      }
      const payload = {
        channel: this.form.channel,
        external_item_id: this.form.external_item_id.trim(),
        exchange_item_id: Number(this.form.exchange_item_id),
        sync_status: this.form.sync_status,
        // 渠道价（拍板 #26）：空=默认取我方价（后端存 NULL）
        channel_price: this.form.channel_price === '' ? null : Number(this.form.channel_price)
      }
      this.saving = true
      try {
        const res = this.is_edit
          ? await ExchangeItemAPI.updateChannelMapping(this.editing_id, payload)
          : await ExchangeItemAPI.createChannelMapping(payload)
        if (res.success) {
          Alpine.store('notification').show(this.is_edit ? '映射更新成功' : '映射创建成功', 'success')
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

    async handleDelete(id, externalId) {
      if (!confirm(`确定要删除映射「${externalId}」吗？`)) return
      try {
        const res = await ExchangeItemAPI.deleteChannelMapping(id)
        if (res.success) {
          Alpine.store('notification').show('映射删除成功', 'success')
          await this.loadData()
        } else {
          Alpine.store('notification').show(res.message || '删除失败', 'error')
        }
      } catch (error) {
        Alpine.store('notification').show('删除失败：' + error.message, 'error')
      }
    },

    channelLabel(channel) {
      const hit = this.channelDict.find(c => c.code === channel)
      return hit ? hit.name : channel
    },

    syncStatusLabel(status) {
      return SYNC_STATUS_LABELS[status] || status
    },

    syncStatusClass(status) {
      const map = {
        pending: 'bg-yellow-100 text-yellow-700',
        synced: 'bg-green-100 text-green-700',
        failed: 'bg-red-100 text-red-600',
        disabled: 'bg-gray-100 text-gray-600'
      }
      return map[status] || 'bg-gray-100 text-gray-600'
    },

    mappingId(row) {
      return row.id
    },

    formatDate(dateStr) {
      return formatDate(dateStr)
    }
  }))
}

document.addEventListener('alpine:init', registerChannelMappingComponents)
