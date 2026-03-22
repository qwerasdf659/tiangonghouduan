/**
 * 兑换市场整合页面 - Alpine.js 组件 (Mixin v4.0 - Composables)
 *
 * @file admin/src/modules/market/pages/exchange-market.js
 * @description 整合商品管理、订单管理、统计分析的完整兑换市场页面
 * @version 4.0.0
 * @date 2026-01-24
 *
 * @requires Alpine.js
 * @requires createPageMixin - 页面基础功能混入
 * @requires composables - 各子模块的状态和方法
 */

import { logger, $confirmDanger, $confirm } from '../../../utils/index.js'
import { Alpine, createPageMixin, dataTable } from '../../../alpine/index.js'
import { request, buildURL } from '../../../api/base.js'
import { MARKET_ENDPOINTS } from '../../../api/market/index.js'
import { ExchangeAPI } from '../../../api/market/exchange.js'
import { ExchangeItemAPI } from '../../../api/exchange-item/index.js'
import {
  useExchangeItemsState,
  useExchangeItemsMethods,
  useExchangeOrdersState,
  useExchangeOrdersMethods,
  useExchangeStatsState,
  useExchangeStatsMethods
} from '../composables/index.js'

/**
 * 子页面配置
 */
const SUB_PAGES = [
  { id: 'items', title: '商品管理', icon: '📦', name: '商品管理' },
  { id: 'orders', title: '订单管理', icon: '📋', name: '订单管理' },
  { id: 'stats', title: '统计分析', icon: '📊', name: '统计分析' }
]

document.addEventListener('alpine:init', () => {
  logger.info('[ExchangeMarket] 注册 Alpine 组件 (Mixin v4.0 - Composables)...')

  // 存储当前子页面
  Alpine.store('exchangePage', 'items')

  // 资产类型字典（供 data-table 等独立组件使用）
  Alpine.store('assetTypeMap', {})

  /**
   * 兑换市场导航组件
   */
  Alpine.data('exchangeNavigation', () => ({
    ...createPageMixin(),

    current_page: 'items',
    subPages: SUB_PAGES,

    init() {
      // 从 URL 参数读取页面
      const urlParams = new URLSearchParams(window.location.search)
      const page = urlParams.get('page')
      if (page && this.subPages.some(p => p.id === page)) {
        this.current_page = page
      }
      Alpine.store('exchangePage', this.current_page)
      logger.info('[ExchangeNavigation] 当前页面:', this.current_page)
    },

    switchPage(pageId) {
      this.current_page = pageId
      Alpine.store('exchangePage', pageId)

      // 更新URL参数
      const url = new URL(window.location)
      url.searchParams.set('page', pageId)
      window.history.replaceState({}, '', url)

      // 触发页面切换事件
      window.dispatchEvent(new CustomEvent('exchange-page-changed', { detail: { page: pageId } }))
      logger.debug('[ExchangeNavigation] 切换到:', pageId)
    },

    isActive(pageId) {
      return this.current_page === pageId
    }
  }))

  /**
   * 兑换市场主组件
   * 整合商品管理、订单管理、统计分析的完整兑换市场页面
   */
  Alpine.data('exchangeMarket', () => {
    const pageMixin = createPageMixin({
      pageTitle: '兑换市场',
      loadDataOnInit: false
    })

    return {
      ...pageMixin,

      subPages: SUB_PAGES,
      current_page: 'items',
      saving: false,

      /** 兑换商品列表视图：grid | list，持久化 localStorage */
      view_mode: (() => {
        try {
          return localStorage.getItem('exchange_items_view_mode') === 'list' ? 'list' : 'grid'
        } catch (_e) {
          return 'grid'
        }
      })(),

      ...useExchangeItemsState(),
      ...useExchangeOrdersState(),
      ...useExchangeStatsState(),

      // ========== 市场统计 ==========
      /** 市场统计数据 - 直接使用后端字段名 */
      marketStats: {
        total_items: 0,
        today_orders: 0,
        pending_shipments: 0,
        points_consumed: 0
      },

      async init() {
        logger.info('[ExchangeMarket] 初始化主组件...')

        if (typeof pageMixin.init === 'function') {
          await pageMixin.init.call(this)
        }

        // 批量操作事件监听
        this.$el.addEventListener('batch-status', async e => {
          const { ids, status } = e.detail
          await this.handleBatchStatus(ids, status)
        })
        this.$el.addEventListener('batch-price-modal', e => {
          this.batchPriceIds = e.detail.ids
          this.showModal('batchPriceModal')
        })
        this.$el.addEventListener('batch-category-modal', e => {
          this.batchCategoryIds = e.detail.ids
          this.showModal('batchCategoryModal')
        })

        // 事件委托：列表视图中 data-table 渲染的图片点击预览
        this.$el.addEventListener('click', e => {
          const trigger = e.target.closest('[data-preview-trigger]')
          if (trigger) {
            const url = trigger.dataset.previewUrl || trigger.src
            if (url) this.openImagePreview(url, trigger.alt || '')
          }
        })

        await this.loadAssetTypes()
        await this.loadPageData()
      },

      switchPage(pageId) {
        this.current_page = pageId
        this.loadPageData()
      },

      /** 切换商品列表网格/表格视图 */
      toggleViewMode(mode) {
        if (mode === 'grid' || mode === 'list') {
          this.view_mode = mode
        } else {
          this.view_mode = this.view_mode === 'grid' ? 'list' : 'grid'
        }
        try {
          localStorage.setItem('exchange_items_view_mode', this.view_mode)
        } catch (_e) {
          /* 忽略存储异常 */
        }
      },

      async loadPageData() {
        switch (this.current_page) {
          case 'items':
            // 表格数据由 data-table 组件自行加载，这里只加载统计
            await this.loadItemStats()
            this._updateMarketStats()
            break
          case 'orders':
            // 表格数据由 data-table 组件自行加载，这里只加载统计
            await this.loadOrderStats()
            this._updateMarketStats()
            break
          case 'stats':
            await this.loadExchangeStats()
            this._updateMarketStats()
            this.$nextTick(() => this.initCharts())
            break
        }
      },

      /** 刷新商品表格（供 CRUD 操作后调用） */
      _refreshItemsTable() {
        window.dispatchEvent(new CustomEvent('refresh-exchange-items'))
      },

      /** 刷新订单表格（供 CRUD 操作后调用） */
      _refreshOrdersTable() {
        window.dispatchEvent(new CustomEvent('refresh-exchange-orders'))
      },

      // ========== 批量操作 ==========
      batchPriceIds: [],
      batchCategoryIds: [],
      batchPriceMode: 'percent',
      batchPriceValue: 100,
      batchCategoryId: null,

      // ========== 单品数据看板 ==========
      itemDashboard: null,
      itemDashboardLoading: false,

      /** 批量上下架 */
      async handleBatchStatus(ids, status) {
        const label = status === 'active' ? '上架' : '下架'
        const confirmed = await $confirm(`确定批量${label} ${ids.length} 个商品？`)
        if (!confirmed) return
        try {
          await ExchangeAPI.batchUpdateStatus(ids, status)
          this.showSuccess(`已批量${label} ${ids.length} 个商品`)
          this._refreshItemsTable()
        } catch (error) {
          this.showError(`批量${label}失败: ${error.message}`)
        }
      },

      /** 批量改价提交 */
      async submitBatchPrice() {
        if (!this.batchPriceIds.length) return
        try {
          const items = this.batchPriceIds.map(id => ({
            exchange_item_id: id,
            mode: this.batchPriceMode,
            value: Number(this.batchPriceValue)
          }))
          await ExchangeAPI.batchUpdatePrice(items)
          this.showSuccess(`已批量改价 ${this.batchPriceIds.length} 个商品`)
          this.hideModal('batchPriceModal')
          this._refreshItemsTable()
        } catch (error) {
          this.showError(`批量改价失败: ${error.message}`)
        }
      },

      /** 批量修改分类提交 */
      async submitBatchCategory() {
        if (!this.batchCategoryIds.length || !this.batchCategoryId) return
        try {
          await ExchangeAPI.batchUpdateCategory(this.batchCategoryIds, this.batchCategoryId)
          this.showSuccess(`已批量修改分类 ${this.batchCategoryIds.length} 个商品`)
          this.hideModal('batchCategoryModal')
          this._refreshItemsTable()
        } catch (error) {
          this.showError(`批量修改分类失败: ${error.message}`)
        }
      },

      /** 查看单品数据看板（后端暂未实现此端点，从订单数据聚合） */
      async viewItemDashboard(item) {
        const itemId = item.exchange_item_id || item
        this.itemDashboard = null
        this.itemDashboardLoading = true
        this.showModal('itemDashboardModal')
        try {
          const itemOrders = (this.orders || []).filter(o => o.exchange_item_id === itemId)
          const now = new Date()
          const d7 = new Date(now - 7 * 86400000)
          const d30 = new Date(now - 30 * 86400000)
          this.itemDashboard = {
            orders_7d: itemOrders.filter(o => new Date(o.created_at) >= d7).length,
            orders_30d: itemOrders.filter(o => new Date(o.created_at) >= d30).length,
            total_orders: itemOrders.length,
            completed: itemOrders.filter(o => o.status === 'completed').length,
            item_name: item.item_name
          }
        } catch (error) {
          this.showError(`看板数据加载失败: ${error.message}`)
        } finally {
          this.itemDashboardLoading = false
        }
      },

      /**
       * 更新市场统计数据
       * 优先使用 exchangeStats（统计tab加载），其次 itemStats（商品tab加载），最后 items 数组长度
       * @private
       */
      _updateMarketStats() {
        this.marketStats = {
          total_items:
            this.exchangeStats?.items?.activeCount ||
            this.itemStats?.total ||
            this.items?.length ||
            0,
          today_orders: this.exchangeStats?.orders?.total || this.orders?.length || 0,
          pending_shipments:
            this.exchangeStats?.orders?.pending ||
            this.orders?.filter(o => o.status === 'pending')?.length ||
            0,
          points_consumed: this.exchangeStats?.revenue?.total_virtual_value || 0
        }
      },

      /** SKU 规格值的 JSON 字符串（编辑用） */
      skuSpecStr: '{}',

      ...useExchangeItemsMethods(),
      ...useExchangeOrdersMethods(),
      ...useExchangeStatsMethods(),

      /**
       * 编辑 SKU 并同步 spec_values 到 JSON 字符串
       * @param {Object} sku - SKU 对象
       */
      editSkuWithStr(sku) {
        this.editSku(sku)
        this.skuForm.spec_values_str = JSON.stringify(sku.spec_values || {}, null, 2)
      },

      /**
       * 保存 SKU 前将 spec_values_str 转回对象
       */
      async saveSkuFromForm() {
        try {
          this.skuForm.spec_values = JSON.parse(this.skuForm.spec_values_str || '{}')
        } catch {
          this.showError?.('规格值 JSON 格式错误')
          return
        }
        await this.saveSku()
        this.hideModal('skuModal')
      },

      formatAmount(amount) {
        return amount != null ? Number(amount).toLocaleString('zh-CN') : '0'
      },

      getAssetTypeName(code) {
        const type = this.assetTypes.find(t => t.asset_code === code)
        return type?.display_name || code || '-'
      },

      // ========== 图片预览 ==========
      previewImageUrl: '',
      previewImageAlt: '',

      /** 打开图片预览弹窗 */
      openImagePreview(url, alt) {
        if (!url) return
        this.previewImageUrl = url
        this.previewImageAlt = alt || ''
        this.showModal('imagePreviewModal')
      },

      /** 关闭图片预览弹窗 */
      closeImagePreview() {
        this.hideModal('imagePreviewModal')
        this.previewImageUrl = ''
        this.previewImageAlt = ''
      },

      /** 商品主图 URL（网格卡片用） */
      exchangeItemImageUrl(row) {
        const img = row?.primary_image
        const url = img?.thumbnail_url || img?.url
        return url || ''
      },

      /** 商品原图 URL（预览用，优先原图） */
      exchangeItemFullImageUrl(row) {
        const img = row?.primary_image
        return img?.url || img?.thumbnail_url || ''
      },

      /** 商品状态徽章文案（网格卡片用） */
      exchangeItemStatusLabel(status) {
        return status === 'active' ? '上架' : '下架'
      },

      // ========== 商品操作方法 ==========

      /**
       * 删除商品
       * @param {Object|number} itemOrId - 商品对象或商品ID
       */
      async deleteItem(itemOrId) {
        const itemId = typeof itemOrId === 'object'
          ? itemOrId.exchange_item_id
          : itemOrId
        if (!itemId) {
          logger.error('[ExchangeMarket] deleteItem: 无效的商品ID')
          return
        }

        if (!(await $confirmDanger('确定要删除此商品吗？'))) return

        try {
          const res = await ExchangeItemAPI.deleteExchangeItem(itemId)
          if (res.success) {
            this.showSuccess?.('删除成功')
            this._refreshItemsTable()
            this.loadItemStats()
            this._updateMarketStats()
          } else {
            this.showError?.(res.message || '删除失败')
          }
        } catch (e) {
          logger.error('[ExchangeMarket] 删除商品失败:', e)
          this.showError?.('删除失败')
        }
      },

      /**
       * 拒绝订单（HTML 模板使用，管理员操作：审核拒绝，退还材料资产）
       * @param {Object} order - 订单对象
       */
      async rejectOrder(order) {
        if (
          !(await $confirm(`确定要拒绝订单 ${order.order_no} 吗？已支付的资产将退回用户账户。`, {
            type: 'danger'
          }))
        )
          return

        try {
          this.saving = true
          const res = await request({
            url: buildURL(MARKET_ENDPOINTS.EXCHANGE_ORDER_REJECT, {
              order_no: order.order_no
            }),
            method: 'POST',
            data: { remark: '管理员拒绝审批' }
          })

          if (res.success) {
            this.showSuccess?.('订单已拒绝，资产已退还用户')
            this._refreshOrdersTable()
            this.loadOrderStats()
            this._updateMarketStats()
          } else {
            this.showError?.(res.message || '拒绝失败')
          }
        } catch (e) {
          logger.error('[ExchangeMarket] 拒绝订单失败:', e)
          this.showError?.('拒绝失败')
        } finally {
          this.saving = false
        }
      }
    }
  })

  /**
   * 兑换商品列表 - data-table 组件
   */
  Alpine.data('exchangeItemsTable', () => {
    const table = dataTable({
      columns: [
        { key: 'exchange_item_id', label: '商品ID', sortable: true },
        {
          key: 'primary_image',
          label: '图片',
          render: val => {
            const thumbUrl = val?.thumbnail_url || val?.url
            const fullUrl = val?.url || val?.thumbnail_url
            if (thumbUrl) {
              return `<img src="${thumbUrl}" alt="商品图片" class="w-10 h-10 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity" data-preview-url="${fullUrl}" data-preview-trigger />`
            }
            return '<span class="text-gray-400 text-xs">暂无图片</span>'
          }
        },
        { key: 'item_name', label: '商品名称', sortable: true },
        {
          key: 'cost_amount',
          label: '兑换价格',
          sortable: true,
          render: (val, row) => {
            const code = row.cost_asset_code || ''
            const nameMap = Alpine.store('assetTypeMap') || {}
            const displayName = nameMap[code] || code || '积分'
            return `${val || 0} ${displayName}`
          }
        },
        { key: 'stock', label: '库存', type: 'number', sortable: true },
        {
          key: 'status',
          label: '状态',
          type: 'status',
          statusMap: {
            active: { class: 'green', label: '上架' },
            inactive: { class: 'gray', label: '下架' }
          }
        }
      ],
      dataSource: async params => {
        const res = await ExchangeItemAPI.listExchangeItems(params)
        const rawItems = res.data?.items || res.data?.list || res.data?.products || []
        return {
          items: rawItems.map(p => ({
            ...p,
            exchange_item_id: p.exchange_item_id,
            item_name: p.item_name
          })),
          total: res.data?.pagination?.total || 0
        }
      },
      primaryKey: 'exchange_item_id',
      sortable: true,
      selectable: true,
      page_size: 20
    })
    const origInit = table.init
    table.init = async function () {
      window.addEventListener('refresh-exchange-items', () => this.loadData())
      if (origInit) await origInit.call(this)
    }
    return table
  })

  /**
   * 兑换订单列表 - data-table 组件
   */
  Alpine.data('exchangeOrdersTable', () => {
    const table = dataTable({
      columns: [
        { key: 'order_no', label: '订单号', sortable: true },
        {
          key: 'user_id',
          label: '用户',
          render: (val, row) => row.user_nickname || row.user_mobile || val || '-'
        },
        {
          key: 'item_name',
          label: '商品',
          render: (val, row) => row.item_snapshot?.item_name || val || '-'
        },
        {
          key: 'pay_amount',
          label: '消耗积分',
          render: (val, row) => {
            const amount = val || row.cost_amount || 0
            const code = row.pay_asset_code || row.cost_asset_code || ''
            const nameMap = Alpine.store('assetTypeMap') || {}
            const displayName = nameMap[code] || code
            return `${amount} ${displayName}`
          }
        },
        {
          key: 'status',
          label: '状态',
          type: 'status',
          statusMap: {
            pending: { class: 'yellow', label: '待处理' },
            approved: { class: 'blue', label: '已审核' },
            shipped: { class: 'blue', label: '已发货' },
            received: { class: 'green', label: '已收货' },
            rated: { class: 'green', label: '已评价' },
            rejected: { class: 'red', label: '已拒绝' },
            refunded: { class: 'gray', label: '已退款' },
            completed: { class: 'green', label: '已完成' },
            cancelled: { class: 'gray', label: '已取消' }
          }
        },
        { key: 'created_at', label: '下单时间', type: 'datetime', sortable: true }
      ],
      dataSource: async params => {
        const res = await request({
          url: MARKET_ENDPOINTS.EXCHANGE_ORDERS,
          method: 'GET',
          params
        })
        return {
          items: res.data?.orders || res.data?.list || [],
          total: res.data?.pagination?.total || 0
        }
      },
      primaryKey: 'order_no',
      sortable: true,
      page_size: 20
    })
    const origInit = table.init
    table.init = async function () {
      window.addEventListener('refresh-exchange-orders', () => this.loadData())
      if (origInit) await origInit.call(this)
    }
    return table
  })

  logger.info('[ExchangeMarket] Alpine 组件注册完成（含 data-table）')
})

export { SUB_PAGES }
