/**
 * 道具商城管理 - 页面组件（道具商城 / 星石轨）
 *
 * @file admin/src/modules/market/pages/prop-shop.js
 * @description Alpine.js 页面组件：与「兑换市场」一致的一站式 Tab 架构，
 *   补齐「商品管理 / 订单管理 / 统计分析」三个子页面，全部限定道具频道（item_type='prop'）。
 *   - 商品管理：一体化上架（建 prop 模板→SPU→SKU→星石价）+ 列表/编辑（复用 usePropShop*）
 *   - 订单管理：复用兑换订单 composable + ExchangeAPI，按 item_type='prop' 服务端筛选
 *   - 统计分析：复用兑换统计 composable，statsItemType='prop' 服务端聚合道具口径
 *
 * 复用原则（零新框架、零字段映射）：直接复用 exchange-orders / exchange-stats composable
 *   与 ExchangeAPI / data-table 组件，仅通过 item_type='prop' 注入实现频道隔离。
 *
 * @date 2026-06-13
 */

import { logger } from '../../../utils/index.js'
import { Alpine, createPageMixin, dataTable } from '../../../alpine/index.js'
import { request } from '../../../api/base.js'
import { EXCHANGE_ENDPOINTS } from '../../../api/market/exchange.js'
import {
  usePropShopState,
  usePropShopMethods,
  useExchangeOrdersState,
  useExchangeOrdersMethods,
  useExchangeStatsState,
  useExchangeStatsMethods
} from '../composables/index.js'

/** 道具商城频道标识：所有列表/订单/统计均按此 item_type 服务端筛选 */
const PROP_ITEM_TYPE = 'prop'

/**
 * 道具商城子页面配置（与兑换市场一致的一站式 Tab 架构；道具无"以物易物"频道）
 */
const PROP_SUB_PAGES = [
  { id: 'items', icon: '🎮', name: '道具管理' },
  { id: 'orders', icon: '📋', name: '订单管理' },
  { id: 'stats', icon: '📊', name: '统计分析' }
]

document.addEventListener('alpine:init', () => {
  logger.info('[PropShop] 注册 Alpine 组件（一站式 Tab：道具/订单/统计）...')

  Alpine.data('propShopPage', () => {
    const pageMixin = createPageMixin({
      pageTitle: '道具商城',
      authGuard: true,
      loadDataOnInit: false
    })

    return {
      ...pageMixin,

      subPages: PROP_SUB_PAGES,
      current_page: 'items',

      ...usePropShopState(),
      ...useExchangeOrdersState(),
      ...useExchangeStatsState(),

      /** 顶部概览统计（直接使用后端字段名，道具频道口径） */
      propStats: {
        total_items: 0,
        today_orders: 0,
        pending_shipments: 0,
        star_stone_consumed: 0
      },

      // 统计 Tab 限定道具频道（注入 exchange-stats composable）
      statsItemType: PROP_ITEM_TYPE,

      async init() {
        if (!this.checkAuth?.()) return
        logger.info('[PropShop] 初始化主组件...')

        if (typeof pageMixin.init === 'function') {
          await pageMixin.init.call(this)
        }

        // 订单操作事件委托（与兑换市场一致：data-table 内 $dispatch 冒泡到此处）
        this.$el.addEventListener('approve-order', e => this.approveOrder(e.detail))
        this.$el.addEventListener('reject-order', e => this.rejectOrder(e.detail))
        this.$el.addEventListener('complete-order', e => this.completeOrder(e.detail))

        await this.loadPageData()
      },

      switchPage(pageId) {
        this.current_page = pageId
        this.loadPageData()
      },

      isActive(pageId) {
        return this.current_page === pageId
      },

      async loadPageData() {
        switch (this.current_page) {
          case 'items':
            await this.loadPropList()
            this._updatePropStats()
            break
          case 'orders':
            // 订单表格由 data-table 自行加载，这里只刷新概览统计
            this._updatePropStats()
            break
          case 'stats':
            await this.loadExchangeStats()
            this._updatePropStats()
            this.$nextTick(() => this.initCharts())
            break
        }
      },

      /**
       * 更新顶部概览统计（优先用统计 Tab 已加载的服务端聚合，其次用道具列表长度兜底）
       * @private
       */
      _updatePropStats() {
        this.propStats = {
          total_items: this.exchangeStats?.items?.activeCount || this.propList?.length || 0,
          today_orders: this.exchangeStats?.orders?.total || 0,
          pending_shipments: this.exchangeStats?.orders?.pending || 0,
          star_stone_consumed: this.exchangeStats?.revenue?.total_virtual_value || 0
        }
      },

      ...usePropShopMethods(),
      ...useExchangeOrdersMethods(),
      ...useExchangeStatsMethods()
    }
  })

  /**
   * 道具订单列表 - data-table 组件（限定 item_type='prop' 服务端筛选）
   */
  Alpine.data('propOrdersTable', () => {
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
          label: '道具',
          render: (val, row) => row.item_snapshot?.item_name || val || '-'
        },
        {
          key: 'pay_amount',
          label: '消耗星石',
          render: (val, row) => {
            const amount = val || 0
            const code = row.pay_asset_code || ''
            const nameMap = Alpine.store('assetTypeMap') || {}
            return `${amount} ${nameMap[code] || code || '星石'}`
          }
        },
        {
          key: 'status',
          label: '状态',
          type: 'status',
          statusMap: {
            pending: { class: 'yellow', label: '待审核' },
            approved: { class: 'blue', label: '已审核' },
            completed: { class: 'green', label: '已完成' },
            rejected: { class: 'red', label: '已拒绝' },
            cancelled: { class: 'gray', label: '已取消' }
          }
        },
        { key: 'created_at', label: '下单时间', type: 'datetime', sortable: true }
      ],
      dataSource: async params => {
        // 道具频道：服务端按 item_type='prop' 筛选，分页 total 准确
        const res = await request({
          url: EXCHANGE_ENDPOINTS.ORDERS,
          method: 'GET',
          params: { ...params, item_type: PROP_ITEM_TYPE }
        })
        return {
          items: res.data?.orders || [],
          total: res.data?.pagination?.total || 0
        }
      },
      primaryKey: 'order_no',
      sortable: true,
      page_size: 20
    })
    const origInit = table.init
    table.init = async function () {
      // 复用兑换订单 composable 触发的刷新事件（approve/reject/complete 后均会派发）
      window.addEventListener('refresh-exchange-orders', () => this.loadData())
      if (origInit) await origInit.call(this)
    }
    return table
  })

  logger.info('[PropShop] Alpine 组件注册完成（含 data-table）')
})

export { PROP_SUB_PAGES, PROP_ITEM_TYPE }
