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

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { request, buildURL } from '../../../api/base.js'
import { MARKET_ENDPOINTS } from '../../../api/market.js'
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

    currentPage: 'items',
    subPages: SUB_PAGES,

    init() {
      // 从 URL 参数读取页面
      const urlParams = new URLSearchParams(window.location.search)
      const page = urlParams.get('page')
      if (page && this.subPages.some(p => p.id === page)) {
        this.currentPage = page
      }
      Alpine.store('exchangePage', this.currentPage)
      logger.info('[ExchangeNavigation] 当前页面:', this.currentPage)
    },

    switchPage(pageId) {
      this.currentPage = pageId
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
      return this.currentPage === pageId
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
      currentPage: 'items',
      saving: false,

      ...useExchangeItemsState(),
      ...useExchangeOrdersState(),
      ...useExchangeStatsState(),

      // ========== HTML 模板兼容属性 ==========
      /** 市场统计（HTML 模板使用） */
      marketStats: {
        totalItems: 0,
        todayOrders: 0,
        pendingShipments: 0,
        pointsConsumed: 0
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
        this.currentPage = pageId
        this.loadPageData()
      },

      async loadPageData() {
        switch (this.currentPage) {
          case 'items':
            await Promise.all([this.loadItems(), this.loadItemStats()])
            this._updateMarketStats()
            break
          case 'orders':
            await Promise.all([this.loadOrders(), this.loadOrderStats()])
            this._updateMarketStats()
            break
          case 'stats':
            await this.loadExchangeStats()
            this._updateMarketStats()
            this.$nextTick(() => this.initCharts())
            break
        }
      },

      /**
       * 更新 marketStats（HTML 模板兼容）
       */
      _updateMarketStats() {
        this.marketStats = {
          totalItems: this.exchangeStats?.items?.activeCount || this.items?.length || 0,
          todayOrders: this.exchangeStats?.orders?.total || this.orders?.length || 0,
          pendingShipments: this.exchangeStats?.orders?.pending || 
            (this.orders?.filter(o => o.status === 'pending')?.length) || 0,
          // 使用累计消耗的资产数量
          pointsConsumed: this.exchangeStats?.revenue?.total_virtual_value || 0
        }
      },

      ...useExchangeItemsMethods(),
      ...useExchangeOrdersMethods(),
      ...useExchangeStatsMethods(),

      formatAmount(amount) {
        return amount != null ? Number(amount).toLocaleString('zh-CN') : '0'
      },

      /**
       * 格式化日期（HTML 模板使用）
       */
      formatDate(dateStr) {
        if (!dateStr) return '-'
        try {
          return new Date(dateStr).toLocaleString('zh-CN')
        } catch {
          return dateStr
        }
      },

      formatDateTime(dateStr) {
        if (!dateStr) return '-'
        try {
          return new Date(dateStr).toLocaleString('zh-CN')
        } catch {
          return dateStr
        }
      },

      getAssetTypeName(code) {
        const type = this.assetTypes.find(t => t.asset_code === code)
        return type?.asset_name || code || '-'
      },

      // ========== HTML 模板兼容方法 ==========

      /**
       * 删除商品（兼容 HTML 模板传入 item 对象）
       * @param {Object|number} itemOrId - 商品对象或商品ID
       */
      async deleteItem(itemOrId) {
        const itemId = typeof itemOrId === 'object' ? itemOrId.item_id : itemOrId
        if (!itemId) {
          logger.error('[ExchangeMarket] deleteItem: 无效的商品ID')
          return
        }

        if (!confirm('确定要删除此商品吗？')) return

        try {
          const res = await request({
            url: buildURL(MARKET_ENDPOINTS.EXCHANGE_ITEM_DETAIL, { item_id: itemId }),
            method: 'DELETE'
          })
          if (res.success) {
            this.showSuccess?.('删除成功')
            this.loadItems()
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
        if (!confirm(`确定要完成订单 ${order.order_no || order.order_id} 吗？`)) return

        try {
          this.saving = true
          const res = await request({
            url: buildURL(MARKET_ENDPOINTS.EXCHANGE_ORDER_COMPLETE || MARKET_ENDPOINTS.EXCHANGE_ORDER_SHIP, {
              order_no: order.order_no || order.order_id
            }),
            method: 'POST',
            data: { status: 'completed' }
          })

          if (res.success) {
            this.showSuccess?.('订单已完成')
            this.loadOrders()
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

  logger.info('[ExchangeMarket] Alpine 组件注册完成')
})

export { SUB_PAGES }
