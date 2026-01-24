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
  { id: 'items', title: '商品管理', icon: 'bi-box-seam' },
  { id: 'orders', title: '订单管理', icon: 'bi-receipt' },
  { id: 'stats', title: '统计分析', icon: 'bi-graph-up' }
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
   * 兑换市场页面内容组件
   * 使用 composables 模式管理各子模块的状态和方法
   */
  Alpine.data('exchangePageContent', () => {
    const pageMixin = createPageMixin({
      pageTitle: '兑换市场',
      loadDataOnInit: false
    })

    return {
      ...pageMixin,

      // ========== 基础状态 ==========
      subPages: SUB_PAGES,
      saving: false,

      // ========== 各模块状态 ==========
      ...useExchangeItemsState(),
      ...useExchangeOrdersState(),
      ...useExchangeStatsState(),

      // ========== 计算属性 ==========
      get currentPage() {
        return Alpine.store('exchangePage')
      },

      // ========== 生命周期 ==========
      async init() {
        logger.info('[ExchangePageContent] 初始化...')

        if (typeof pageMixin.init === 'function') {
          await pageMixin.init.call(this)
        }

        // 加载资产类型
        this.loadAssetTypes()

        // 根据当前页面加载数据
        await this.loadPageData()

        // 监听页面切换
        window.addEventListener('exchange-page-changed', () => {
          this.loadPageData()
        })
      },

      /**
       * 根据当前页面加载对应数据
       */
      async loadPageData() {
        const page = this.currentPage
        logger.debug('[ExchangePageContent] 加载数据:', page)

        try {
          switch (page) {
            case 'items':
              await Promise.all([this.loadItems(), this.loadItemStats()])
              break
            case 'orders':
              await Promise.all([this.loadOrders(), this.loadOrderStats()])
              break
            case 'stats':
              await this.loadExchangeStats()
              this.$nextTick(() => this.initCharts())
              break
          }
        } catch (error) {
          logger.error('[ExchangePageContent] 加载数据失败:', error)
          this.showError?.('加载数据失败')
        }
      },

      // ========== 页面切换 ==========
      switchPage(pageId) {
        Alpine.store('exchangePage', pageId)
        window.dispatchEvent(new CustomEvent('exchange-page-changed', { detail: { page: pageId } }))
      },

      isActive(pageId) {
        return this.currentPage === pageId
      },

      // ========== 各模块方法 ==========
      ...useExchangeItemsMethods(),
      ...useExchangeOrdersMethods(),
      ...useExchangeStatsMethods(),

      // ========== 通用工具方法 ==========

      /**
       * 格式化金额
       * @param {number} amount - 金额
       * @returns {string} 格式化后的金额
       */
      formatAmount(amount) {
        if (amount === null || amount === undefined) return '0'
        return Number(amount).toLocaleString('zh-CN')
      },

      /**
       * 格式化日期时间
       * @param {string} dateStr - 日期字符串
       * @returns {string} 格式化后的日期
       */
      formatDateTime(dateStr) {
        if (!dateStr) return '-'
        try {
          const date = new Date(dateStr)
          return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })
        } catch {
          return dateStr
        }
      },

      /**
       * 获取资产类型名称
       * @param {string} code - 资产类型代码
       * @returns {string} 资产类型名称
       */
      getAssetTypeName(code) {
        const type = this.assetTypes.find(t => t.asset_code === code)
        return type?.asset_name || code || '-'
      }
    }
  })

  /**
   * 兑换市场主组件（兼容旧版）
   * @deprecated 建议使用 exchangeNavigation + exchangePageContent
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
            break
          case 'orders':
            await Promise.all([this.loadOrders(), this.loadOrderStats()])
            break
          case 'stats':
            await this.loadExchangeStats()
            this.$nextTick(() => this.initCharts())
            break
        }
      },

      ...useExchangeItemsMethods(),
      ...useExchangeOrdersMethods(),
      ...useExchangeStatsMethods(),

      formatAmount(amount) {
        return amount != null ? Number(amount).toLocaleString('zh-CN') : '0'
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
      }
    }
  })

  logger.info('[ExchangeMarket] Alpine 组件注册完成')
})

export { SUB_PAGES }
