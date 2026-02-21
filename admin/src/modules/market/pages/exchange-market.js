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

        await this.loadAssetTypes()
        await this.loadPageData()
      },

      switchPage(pageId) {
        this.current_page = pageId
        this.loadPageData()
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

      /**
       * 更新市场统计数据
       * @private
       */
      _updateMarketStats() {
        this.marketStats = {
          total_items: this.exchangeStats?.items?.activeCount || this.items?.length || 0,
          today_orders: this.exchangeStats?.orders?.total || this.orders?.length || 0,
          pending_shipments:
            this.exchangeStats?.orders?.pending ||
            this.orders?.filter(o => o.status === 'pending')?.length ||
            0,
          // 使用累计消耗的资产数量
          points_consumed: this.exchangeStats?.revenue?.total_virtual_value || 0
        }
      },

      ...useExchangeItemsMethods(),
      ...useExchangeOrdersMethods(),
      ...useExchangeStatsMethods(),

      formatAmount(amount) {
        return amount != null ? Number(amount).toLocaleString('zh-CN') : '0'
      },

      getAssetTypeName(code) {
        const type = this.assetTypes.find(t => t.asset_code === code)
        return type?.asset_name || code || '-'
      },

      // ========== 商品操作方法 ==========

      /**
       * 删除商品
       * @param {Object|number} itemOrId - 商品对象或商品ID
       */
      async deleteItem(itemOrId) {
        const itemId = typeof itemOrId === 'object' ? itemOrId.exchange_item_id : itemOrId
        if (!itemId) {
          logger.error('[ExchangeMarket] deleteItem: 无效的商品ID')
          return
        }

        if (!(await $confirmDanger('确定要删除此商品吗？'))) return

        try {
          const res = await request({
            url: buildURL(MARKET_ENDPOINTS.EXCHANGE_ITEM_DETAIL, { exchange_item_id: itemId }),
            method: 'DELETE'
          })
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
       * 完成订单（HTML 模板使用）
       * @param {Object} order - 订单对象
       */
      async completeOrder(order) {
        if (!(await $confirm(`确定要完成订单 ${order.order_no} 吗？`))) return

        try {
          this.saving = true
          const res = await request({
            url: buildURL(
              MARKET_ENDPOINTS.EXCHANGE_ORDER_COMPLETE || MARKET_ENDPOINTS.EXCHANGE_ORDER_SHIP,
              {
                order_no: order.order_no
              }
            ),
            method: 'POST',
            data: { status: 'completed' }
          })

          if (res.success) {
            this.showSuccess?.('订单已完成')
            this._refreshOrdersTable()
            this.loadOrderStats()
            this._updateMarketStats()
          } else {
            this.showError?.(res.message || '操作失败')
          }
        } catch (e) {
          logger.error('[ExchangeMarket] 完成订单失败:', e)
          this.showError?.('操作失败')
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
          render: (val) => {
            const url = val?.thumbnail_url || val?.url
            if (url) {
              return `<img src="${url}" alt="商品图片" class="w-10 h-10 object-cover rounded" />`
            }
            return '<span class="text-gray-400 text-xs">暂无图片</span>'
          }
        },
        { key: 'item_name', label: '商品名称', sortable: true },
        {
          key: 'cost_amount',
          label: '兑换价格',
          sortable: true,
          render: (val, row) => `${val || 0} ${row.cost_asset_code || '积分'}`
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
      dataSource: async (params) => {
        const res = await request({
          url: MARKET_ENDPOINTS.EXCHANGE_ITEMS,
          method: 'GET',
          params
        })
        return {
          items: res.data?.items || res.data?.list || [],
          total: res.data?.pagination?.total || 0
        }
      },
      primaryKey: 'exchange_item_id',
      sortable: true,
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
          render: (val, row) => row.item_snapshot?.name || val || '-'
        },
        {
          key: 'pay_amount',
          label: '消耗积分',
          render: (val, row) =>
            `${val || row.cost_amount || 0} ${row.pay_asset_code || row.cost_asset_code || ''}`
        },
        {
          key: 'status',
          label: '状态',
          type: 'status',
          statusMap: {
            pending: { class: 'yellow', label: '待发货' },
            shipped: { class: 'blue', label: '已发货' },
            completed: { class: 'green', label: '已完成' },
            cancelled: { class: 'gray', label: '已取消' }
          }
        },
        { key: 'created_at', label: '下单时间', type: 'datetime', sortable: true }
      ],
      dataSource: async (params) => {
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
