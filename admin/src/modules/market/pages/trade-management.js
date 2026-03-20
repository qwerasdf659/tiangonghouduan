/**
 * 交易市场管理页面 - Alpine.js 组件 (Mixin v3.0)
 *
 * @file admin/src/modules/market/pages/trade-management.js
 * @description 交易市场管理页面，包含交易订单、上架统计、市场概览
 * @version 3.1.0
 * @date 2026-02-25
 *
 * @requires Alpine.js
 * @requires createPageMixin - 页面基础功能混入
 * @requires MARKET_ENDPOINTS - 市场模块API端点（交易市场、业务记录等）
 *
 * @example
 * <div x-data="tradeManagementPage()">
 *   <div x-show="current_page === 'trade-orders'">交易市场订单</div>
 *   <div x-show="current_page === 'marketplace-stats'">上架统计</div>
 *   <div x-show="current_page === 'market-overview'">市场概览</div>
 * </div>
 */

import { logger } from '../../../utils/logger.js'
import { MARKET_ENDPOINTS } from '../../../api/market/index.js'
import { TradeAPI } from '../../../api/market/trade.js'
import { MERCHANT_ENDPOINTS } from '../../../api/merchant.js'
import { buildURL, request } from '../../../api/base.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'

document.addEventListener('alpine:init', () => {
  logger.info('[TradeManagement] 注册 Alpine 组件 (Mixin v3.0)...')

  // ==================== 主组件 ====================

  /**
   * 交易管理主组件
   *
   * @description 整合交易市场订单、上架统计、兑换订单的完整页面组件
   * @returns {Object} Alpine组件对象
   *
   * @property {string} current_page - 当前子页面 ('trade-orders' | 'marketplace-stats' | 'redemption-orders')
   * @property {Array} tradeOrders - 交易市场订单列表
   * @property {Array} marketplaceStats - 上架统计数据
   * @property {Array} redemptionOrders - 兑换订单列表
   *
   * @example
   * <div x-data="tradeManagementPage()">
   *   <nav>
   *     <template x-for="page in subPages">
   *       <button @click="switchPage(page.id)" x-text="page.name"></button>
   *     </template>
   *   </nav>
   *   <div x-show="current_page === 'trade-orders'">
   *     <!-- 交易市场订单列表 -->
   *   </div>
   * </div>
   */
  Alpine.data('tradeManagementPage', () => ({
    ...createPageMixin({ userResolver: true }),

    // 子页面导航
    /** @type {string} 当前页面ID */
    current_page: 'trade-orders',
    /**
     * 子页面配置列表
     * @type {Array<{id: string, name: string, icon: string}>}
     */
    subPages: [
      { id: 'trade-orders', name: '交易市场订单', icon: '🔄' },
      { id: 'redemption-orders', name: '兑换订单', icon: '📦' },
      { id: 'marketplace-stats', name: '上架统计', icon: '📊' },
      { id: 'market-overview', name: '市场概览', icon: '📈' }
    ],

    // ========== data-table 列配置 ==========
    tradeOrderTableColumns: [
      { key: 'trade_order_id', label: '交易ID', sortable: true, type: 'code' },
      {
        key: 'buyer_user_id',
        label: '买家',
        render: (val, row) => row.buyer?.nickname || val || '-'
      },
      {
        key: 'seller_user_id',
        label: '卖家',
        render: (val, row) => row.seller?.nickname || val || '-'
      },
      {
        key: 'asset_code',
        label: '商品',
        render: (val, row) => row.listing?.offer_asset_code || val || '-'
      },
      {
        key: 'gross_amount',
        label: '成交价',
        sortable: true,
        render: (val, row) => {
          const amount = val || row.price_amount || 0
          return `<span class="font-mono text-green-600">${Number(amount).toLocaleString('zh-CN')}</span>`
        }
      },
      {
        key: 'status',
        label: '状态',
        type: 'status',
        statusMap: {
          created: { class: 'yellow', label: '已创建' },
          pending: { class: 'yellow', label: '待处理' },
          frozen: { class: 'blue', label: '已冻结' },
          processing: { class: 'blue', label: '处理中' },
          completed: { class: 'green', label: '已完成' },
          cancelled: { class: 'gray', label: '已取消' },
          disputed: { class: 'red', label: '争议中' }
        }
      },
      { key: 'created_at', label: '时间', type: 'datetime', sortable: true },
      {
        key: '_actions',
        label: '操作',
        type: 'actions',
        width: '80px',
        actions: [{ name: 'detail', label: '详情', class: 'text-blue-600 hover:text-blue-800' }]
      }
    ],

    marketplaceStatsTableColumns: [
      { key: 'user_id', label: '用户ID', sortable: true },
      { key: 'mobile', label: '手机号' },
      { key: 'nickname', label: '用户昵称' },
      { key: 'listing_count', label: '当前上架数', type: 'number', sortable: true },
      {
        key: 'max_active_listings',
        label: '上架上限',
        render: (val, row) => {
          const tag = row.is_custom_limit
            ? '<span class="text-xs text-purple-600 ml-1">自定义</span>'
            : ''
          return `<span class="font-mono">${val}</span>${tag}`
        }
      },
      { key: 'remaining_quota', label: '剩余配额', type: 'number' },
      {
        key: 'is_at_limit',
        label: '状态',
        render: val => {
          if (val)
            return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">已达上限</span>'
          return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">正常</span>'
        }
      },
      {
        key: '_actions',
        label: '操作',
        render: (_val, _row) => `
          <div class="flex gap-1">
            <button class="px-2 py-1 text-xs themed-btn-primary rounded"
                    onclick="document.dispatchEvent(new CustomEvent('listing-view-user', {detail: ${JSON.stringify({ user_id: '__USER_ID__', mobile: '__MOBILE__', nickname: '__NICKNAME__' }).replace('__USER_ID__', "'+_row.user_id+'").replace('__MOBILE__', "'+_row.mobile+'").replace('__NICKNAME__', "'+(_row.nickname||'-')+'")}}))">
              查看上架
            </button>
            <button class="px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600"
                    onclick="document.dispatchEvent(new CustomEvent('listing-adjust-limit', {detail: ${JSON.stringify({ user_id: '__UID__' }).replace('__UID__', "'+_row.user_id+'")}}))">
              调整限制
            </button>
          </div>
        `
      }
    ],

    // 交易市场订单
    /** @type {Array<Object>} 交易市场订单列表 */
    tradeOrders: [],
    /** @type {Object|null} 当前选中的交易订单 */
    selectedTradeOrder: null,
    /** @type {{total: number, created: number, frozen: number, completed: number}} 交易统计 */
    tradeStats: { total: 0, created: 0, frozen: 0, completed: 0 },
    /** @type {{totalTrades: number, completedTrades: number, pendingTrades: number, totalVolume: number}} HTML 统计卡片使用 */
    stats: { totalTrades: 0, completedTrades: 0, pendingTrades: 0, totalVolume: 0 },
    /** @type {Object} 交易订单筛选条件（手机号主导搜索） */
    tradeFilters: { status: '', buyer_mobile: '', seller_mobile: '', listing_id: '' },
    /** @type {Object|null} 买家解析结果 */
    resolvedBuyer: null,
    /** @type {Object|null} 卖家解析结果 */
    resolvedSeller: null,
    /** @type {number} 交易订单当前页码 */
    tradeCurrentPage: 1,
    /** @type {number} 交易订单每页数量 */
    tradePageSize: 20,
    /** @type {{total_pages: number, total: number}} 交易订单分页信息 */
    tradePagination: { total_pages: 1, total: 0 },

    // 上架统计
    /** @type {Array<Object>} 用户上架统计列表 */
    marketplaceStats: [],
    /** @type {{total_users_with_listings: number, users_near_limit: number, users_at_limit: number}} 上架摘要 */
    marketplaceSummary: { total_users_with_listings: 0, users_near_limit: 0, users_at_limit: 0 },
    /** @type {{status: string, mobile: string, merchant_id: string}} 上架统计筛选条件 */
    marketplaceFilters: { status: 'all', mobile: '', merchant_id: '' },

    /** @type {Array<{merchant_id: number, merchant_name: string}>} 商家下拉选项 */
    merchantOptions: [],
    /** @type {string} 交易订单商家筛选 */
    tradeOrderMerchantFilter: '',
    /** @type {number} 上架统计当前页码 */
    marketplaceCurrentPage: 1,
    /** @type {number} 上架统计每页数量 */
    marketplacePageSize: 20,
    /** @type {{total_pages: number, total: number}} 上架统计分页信息 */
    marketplacePagination: { total_pages: 1, total: 0 },
    /** @type {number} 最大上架数限制 */
    maxListings: 10,

    // 用户上架商品列表
    /** @type {{user: Object|null, listings: Array}} 用户上架商品信息 */
    userListingsInfo: { user: null, listings: [] },
    /** @type {{status: string}} 用户上架商品筛选 */
    userListingsFilter: { status: '' },
    /** @type {number} 用户上架商品当前页码 */
    userListingsCurrentPage: 1,
    /** @type {{total: number, total_pages: number}} 用户上架商品分页 */
    userListingsPagination: { total: 0, total_pages: 0 },
    /** @type {boolean} 挂牌排序模式开关 */
    listingSortMode: false,
    /** @type {Array<{id: number, sort_order: number}>} 排序变更暂存 */
    listingSortChanges: [],

    // ========== 市场概览数据（MarketAnalyticsService 数据源） ==========
    /** @type {Object} 市场概览统计 */
    marketOverview: {
      total_orders: 0,
      completed_orders: 0,
      total_volume: 0,
      total_fees: 0,
      active_listings: 0,
      unique_buyers: 0,
      unique_sellers: 0,
      by_status: {},
      asset_ranking: [],
      on_sale_summary: []
    },
    /** @type {boolean} 市场概览加载中 */
    marketOverviewLoading: false,
    /** @type {Object|null} 市场健康看板数据 */
    marketHealth: null,
    /** @type {Object|null} 资产成交量排行图表实例 */
    assetRankingChart: null,
    /** @type {Object|null} 在售分布图表实例 */
    onSaleChart: null,

    // 调整上架限制表单
    /** @type {Object} 调整限制表单数据 */
    adjustLimitForm: {
      user_id: null,
      mobile: '',
      nickname: '',
      current_limit: 0,
      is_custom: false,
      new_limit: null,
      use_global: false,
      reason: ''
    },

    // 强制下架表单
    /** @type {Object} 强制下架表单数据 */
    forceWithdrawForm: { market_listing_id: null, status: '', reason: '' },

    // 兑换订单
    /** @type {Array<Object>} 兑换订单列表 */
    redemptionOrders: [],
    /** @type {{status: string}} 兑换订单筛选条件 */
    redemptionFilters: { status: '' },
    /** @type {number} 兑换订单当前页码 */
    redemptionCurrentPage: 1,
    /** @type {number} 兑换订单每页数量 */
    redemptionPageSize: 20,
    /** @type {{total_pages: number, total: number}} 兑换订单分页信息 */
    redemptionPagination: { total_pages: 1, total: 0 },

    // 通用状态
    /** @type {boolean} 保存操作进行中标志 */
    saving: false,

    /**
     * 初始化交易管理主组件
     * @description 验证权限、从URL读取页面并加载数据、加载商家选项
     * @returns {void}
     */
    init() {
      logger.info('交易管理页面初始化 (合并组件)')
      if (!this.checkAuth()) return
      const urlParams = new URLSearchParams(window.location.search)
      this.current_page = urlParams.get('page') || 'trade-orders'
      this._loadMerchantOptions()
      this.loadPageData()
    },

    /**
     * 加载商家下拉选项（供筛选器使用）
     * @private
     * @async
     */
    async _loadMerchantOptions() {
      try {
        const res = await request({ url: MERCHANT_ENDPOINTS.OPTIONS, method: 'GET' })
        const data = res?.success ? res.data : res
        this.merchantOptions = Array.isArray(data) ? data : []
        logger.debug('[TradeManagement] 商家选项加载完成', { count: this.merchantOptions.length })
      } catch (error) {
        logger.warn('[TradeManagement] 加载商家选项失败', error)
        this.merchantOptions = []
      }
    },

    /**
     * 切换子页面
     * @param {string} pageId - 目标页面ID
     * @returns {void}
     */
    switchPage(pageId) {
      this.current_page = pageId
      window.history.pushState({}, '', `?page=${pageId}`)
      this.loadPageData()
    },

    /**
     * 根据当前页面加载数据
     * @async
     * @returns {Promise<void>}
     */
    async loadPageData() {
      // 注意：loadTradeOrders/loadMarketplaceStats 内部已自行管理 loading 状态
      // 不再外层 withLoading，避免 loading 竞态
      switch (this.current_page) {
        case 'trade-orders':
          await this.loadTradeOrders()
          break
        case 'marketplace-stats':
          await this.loadMarketplaceStats()
          break
        case 'market-overview':
          await this.loadMarketOverview()
          await this.loadMarketHealth()
          break
        case 'redemption-orders':
          await this.loadRedemptionOrders()
          break
      }
    },

    /**
     * 加载交易市场订单列表
     * @async
     * @returns {Promise<void>}
     */
    async loadTradeOrders() {
      try {
        logger.info('[TradeManagement] 加载交易订单...', this.tradeFilters)

        // 构建查询参数（手机号 → resolve 获取 user_id）
        const queryParams = {
          status: this.tradeFilters.status,
          market_listing_id: this.tradeFilters.listing_id,
          merchant_id: this.tradeOrderMerchantFilter || undefined,
          page: this.tradeCurrentPage,
          page_size: this.tradePageSize
        }
        if (this.tradeFilters.buyer_mobile) {
          const buyer = await this.resolveUserByMobile(this.tradeFilters.buyer_mobile)
          if (buyer) {
            queryParams.buyer_user_id = buyer.user_id
            this.resolvedBuyer = buyer
          } else {
            this.resolvedBuyer = null
            this.tradeOrders = []
            return
          }
        } else {
          this.resolvedBuyer = null
        }
        if (this.tradeFilters.seller_mobile) {
          const seller = await this.resolveUserByMobile(this.tradeFilters.seller_mobile)
          if (seller) {
            queryParams.seller_user_id = seller.user_id
            this.resolvedSeller = seller
          } else {
            this.resolvedSeller = null
            this.tradeOrders = []
            return
          }
        } else {
          this.resolvedSeller = null
        }
        // 移除空值
        Object.keys(queryParams).forEach(k => !queryParams[k] && delete queryParams[k])

        // apiGet 返回 { success, data } 结构
        const result = await this.apiGet(MARKET_ENDPOINTS.TRADE_ORDER_LIST, queryParams)

        logger.info('[TradeManagement] API 响应:', result)

        if (result && result.success && result.data) {
          // 后端返回 orders 数组（不是 list）
          const data = result.data
          const tradeData = data?.orders || data?.list || []
          this.tradeOrders = Array.isArray(tradeData) ? tradeData : []
          // 后端使用 snake_case: total_count, total_pages
          const pagination = data.pagination || {}
          this.tradePagination = {
            total_pages: pagination.total_pages || 1,
            total: pagination.total_count || pagination.total || this.tradeOrders.length
          }
          this.tradeStats = { total: this.tradeOrders.length, created: 0, frozen: 0, completed: 0 }
          // 更新统计卡片
          this._updateStats()
          logger.info('[TradeManagement] 加载完成，订单数:', this.tradeOrders.length)
        } else {
          logger.warn('[TradeManagement] API 返回失败:', result)
          // 确保失败时 tradeOrders 是空数组而不是 undefined
          this.tradeOrders = []
        }
      } catch (error) {
        logger.error('[TradeManagement] 加载交易订单失败:', error)
        this.$toast?.error('加载交易订单失败: ' + error.message)
        // 确保出错时 tradeOrders 是空数组而不是 undefined
        this.tradeOrders = []
      }
    },

    /**
     * 查看交易订单详情
     * @param {Object} order - 订单对象
     * @returns {void}
     */
    viewTradeOrder(order) {
      this.selectedTradeOrder = order
      this.$refs.tradeOrderModal?.show()
    },

    /**
     * 加载上架统计数据（支持手机号搜索）
     * @async
     * @returns {Promise<void>}
     */
    async loadMarketplaceStats() {
      try {
        this.loading = true
        const params = {
          page: this.marketplaceCurrentPage,
          limit: this.marketplacePageSize
        }
        if (this.marketplaceFilters.status && this.marketplaceFilters.status !== 'all') {
          params.filter = this.marketplaceFilters.status
        }
        if (this.marketplaceFilters.mobile?.trim()) {
          params.mobile = this.marketplaceFilters.mobile.trim()
        }
        if (this.marketplaceFilters.merchant_id) {
          params.merchant_id = this.marketplaceFilters.merchant_id
        }

        const result = await request({
          url: MARKET_ENDPOINTS.LISTING_STATS,
          method: 'GET',
          params
        })
        if (result?.success && result.data) {
          const data = result.data
          this.marketplaceStats = data.stats || []
          if (data.summary) {
            this.marketplaceSummary = {
              total_users_with_listings: data.summary.total_users_with_listings || 0,
              users_near_limit: data.summary.users_near_limit || 0,
              users_at_limit: data.summary.users_at_limit || 0
            }
          }
          if (data.pagination) {
            this.marketplacePagination = {
              total: data.pagination.total || 0,
              total_pages: data.pagination.total_pages || 1
            }
          }
        }
      } catch (error) {
        logger.error('加载上架统计失败:', error)
        this.$toast?.error('加载上架统计失败')
      } finally {
        this.loading = false
      }
    },

    // ==================== 市场概览方法 ====================

    /**
     * 加载市场概览数据（MarketAnalyticsService + 交易统计）
     *
     * 数据来源：
     * 1. MarketAnalyticsService.getMarketOverview() - 各资产成交量排行、在售统计
     * 2. TradeOrderService 统计 - 订单状态分布
     *
     * @async
     * @returns {Promise<void>}
     */
    async loadMarketOverview() {
      try {
        this.marketOverviewLoading = true

        // 并行请求：市场分析数据 + 交易订单统计
        const [analyticsRes, statsRes] = await Promise.allSettled([
          request({ url: MARKET_ENDPOINTS.MARKET_OVERVIEW, method: 'GET' }),
          request({ url: MARKET_ENDPOINTS.TRADE_ORDER_STATS, method: 'GET' })
        ])

        // 处理市场分析数据（MarketAnalyticsService）
        if (analyticsRes.status === 'fulfilled' && analyticsRes.value?.success) {
          const analytics = analyticsRes.value.data
          this.marketOverview.total_orders = analytics.totals?.total_trades || 0
          this.marketOverview.total_volume = analytics.totals?.total_volume || 0
          this.marketOverview.unique_buyers = analytics.totals?.unique_buyers || 0
          this.marketOverview.unique_sellers = analytics.totals?.unique_sellers || 0
          this.marketOverview.asset_ranking = analytics.asset_ranking || []
          this.marketOverview.on_sale_summary = analytics.on_sale_summary || []
        }

        // 处理交易订单统计（补充订单状态分布和费用信息）
        if (statsRes.status === 'fulfilled' && statsRes.value?.success) {
          const stats = statsRes.value.data
          this.marketOverview.completed_orders = stats.completed_summary?.total_orders || 0
          this.marketOverview.total_fees = stats.completed_summary?.total_fee_amount || 0
          this.marketOverview.by_status = stats.by_status || {}

          if (!this.marketOverview.total_orders) {
            let total = 0
            Object.values(stats.by_status || {}).forEach(item => {
              total += item.count || 0
            })
            this.marketOverview.total_orders = total
          }
        }

        // 获取在售挂牌数
        try {
          const listingRes = await request({
            url: MARKET_ENDPOINTS.LISTING_STATS,
            method: 'GET',
            params: { page: 1, limit: 1 }
          })
          if (listingRes?.success && listingRes.data?.summary) {
            this.marketOverview.active_listings = listingRes.data.summary.total_listings || 0
          }
        } catch (err) {
          logger.warn('[TradeManagement] 加载挂牌统计失败（非致命）:', err.message)
        }

        // 渲染 ECharts 图表
        await this._renderMarketOverviewCharts()

        logger.info('[TradeManagement] 市场概览加载完成', {
          total_trades: this.marketOverview.total_orders,
          asset_ranking_count: this.marketOverview.asset_ranking.length
        })
      } catch (error) {
        logger.error('[TradeManagement] 加载市场概览失败:', error)
        Alpine.store('notification').show('加载市场概览数据失败', 'error')
      } finally {
        this.marketOverviewLoading = false
      }
    },

    /**
     * 加载市场健康看板数据（MarketHealthService）
     */
    async loadMarketHealth() {
      try {
        const { DashboardAPI } = await import('../../../api/dashboard.js')
        const res = await DashboardAPI.getMarketHealthSummary()
        this.marketHealth = res.data || res
        logger.debug('[TradeManagement] 市场健康数据加载完成')
      } catch (error) {
        logger.error('[TradeManagement] 市场健康数据加载失败:', error)
      }
    },

    /**
     * 渲染市场概览 ECharts 图表
     * @private
     * @async
     */
    async _renderMarketOverviewCharts() {
      try {
        const { loadECharts } = await import('../../../utils/echarts-lazy.js')
        const echarts = await loadECharts()
        if (!echarts) {
          logger.warn('[TradeManagement] ECharts 加载失败，跳过图表渲染')
          return
        }

        // 资产成交量排行柱状图
        await this.$nextTick()
        const rankingEl = document.getElementById('asset-ranking-chart')
        if (rankingEl && this.marketOverview.asset_ranking.length > 0) {
          if (this.assetRankingChart) this.assetRankingChart.dispose()
          this.assetRankingChart = echarts.init(rankingEl)

          const ranking = this.marketOverview.asset_ranking
          this.assetRankingChart.setOption({
            title: { text: '近7天各资产成交量排行', left: 'center', textStyle: { fontSize: 14 } },
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
            xAxis: {
              type: 'category',
              data: ranking.map(r => r.asset_code || '未知'),
              axisLabel: { rotate: 30 }
            },
            yAxis: [
              { type: 'value', name: '成交笔数' },
              { type: 'value', name: '成交量(钻石)', position: 'right' }
            ],
            series: [
              {
                name: '成交笔数',
                type: 'bar',
                data: ranking.map(r => Number(r.trade_count) || 0),
                itemStyle: { color: '#3b82f6' }
              },
              {
                name: '成交量(钻石)',
                type: 'bar',
                yAxisIndex: 1,
                data: ranking.map(r => Number(r.total_diamond_volume) || 0),
                itemStyle: { color: '#10b981' }
              }
            ]
          })
        }

        // 在售分布饼图
        const onSaleEl = document.getElementById('on-sale-chart')
        if (onSaleEl && this.marketOverview.on_sale_summary.length > 0) {
          if (this.onSaleChart) this.onSaleChart.dispose()
          this.onSaleChart = echarts.init(onSaleEl)

          const onSale = this.marketOverview.on_sale_summary
          this.onSaleChart.setOption({
            title: { text: '当前在售资产分布', left: 'center', textStyle: { fontSize: 14 } },
            tooltip: { trigger: 'item', formatter: '{b}: {c}件 ({d}%)' },
            series: [
              {
                type: 'pie',
                radius: ['35%', '65%'],
                avoidLabelOverlap: true,
                label: { show: true, formatter: '{b}\n{c}件' },
                data: onSale.map(s => ({
                  name: s.asset_code || '未知',
                  value: Number(s.on_sale_count) || 0
                }))
              }
            ]
          })
        }
      } catch (err) {
        logger.warn('[TradeManagement] 图表渲染失败（非致命）:', err.message)
      }
    },

    /**
     * 查看用户上架商品列表
     * @param {Object} userStat - 用户统计行数据
     */
    async viewUserListings(userStat) {
      try {
        this.userListingsFilter.status = ''
        this.userListingsCurrentPage = 1
        this.userListingsInfo = { user: null, listings: [] }
        this.showModal('userListingsModal')
        await this.loadUserListings(userStat.user_id)
      } catch (error) {
        logger.error('查看用户上架商品失败:', error)
        this.$toast?.error('查看用户上架商品失败')
      }
    },

    /**
     * 加载指定用户的上架商品列表
     * @param {number} userId - 用户ID
     */
    async loadUserListings(userId) {
      try {
        if (!userId) return
        const params = {
          user_id: userId,
          page: this.userListingsCurrentPage,
          page_size: 20
        }
        if (this.userListingsFilter.status) {
          params.status = this.userListingsFilter.status
        }
        const result = await request({
          url: MARKET_ENDPOINTS.LISTING_USER_LISTINGS,
          method: 'GET',
          params
        })
        if (result?.success && result.data) {
          this.userListingsInfo = {
            user: result.data.user,
            listings: result.data.listings || []
          }
          this.userListingsPagination = {
            total: result.data.pagination?.total || 0,
            total_pages: result.data.pagination?.total_pages || 0
          }
        }
      } catch (error) {
        logger.error('加载用户上架商品失败:', error)
        this.$toast?.error(error.message || '加载失败')
      }
    },

    /**
     * 用户上架商品列表翻页
     * @param {number} page - 目标页码
     */
    changeUserListingsPage(page) {
      if (page < 1 || page > this.userListingsPagination.total_pages) return
      this.userListingsCurrentPage = page
      this.loadUserListings(this.userListingsInfo.user?.user_id)
    },

    /**
     * 挂牌状态中文映射
     * @param {string} status - 状态码
     * @returns {string} 中文状态名
     */
    getListingStatusText(status) {
      const map = {
        on_sale: '在售',
        locked: '锁定中',
        sold: '已售出',
        withdrawn: '已撤回',
        admin_withdrawn: '管理员下架'
      }
      return map[status] || status || '-'
    },

    /**
     * 打开强制下架确认弹窗
     * @param {Object} listing - 挂牌对象
     */
    /**
     * 置顶/取消置顶挂牌
     * @param {Object} listing - 挂牌对象
     */
    async toggleListingPin(listing) {
      try {
        const res = await TradeAPI.toggleListingPin(listing.market_listing_id, !listing.is_pinned)
        if (res.success) {
          this.$toast?.success(res.data?.is_pinned ? '挂牌已置顶' : '已取消置顶')
          await this.loadUserListings(this.userListingsInfo.user?.user_id)
        } else {
          this.$toast?.error(res.message || '操作失败')
        }
      } catch (e) {
        logger.error('[TradeManagement] 置顶挂牌失败:', e)
        this.$toast?.error('操作失败')
      }
    },

    /**
     * 推荐/取消推荐挂牌
     * @param {Object} listing - 挂牌对象
     */
    async toggleListingRecommend(listing) {
      try {
        const res = await TradeAPI.toggleListingRecommend(
          listing.market_listing_id,
          !listing.is_recommended
        )
        if (res.success) {
          this.$toast?.success(res.data?.is_recommended ? '挂牌已推荐' : '已取消推荐')
          await this.loadUserListings(this.userListingsInfo.user?.user_id)
        } else {
          this.$toast?.error(res.message || '操作失败')
        }
      } catch (e) {
        logger.error('[TradeManagement] 推荐挂牌失败:', e)
        this.$toast?.error('操作失败')
      }
    },

    /**
     * 进入/退出挂牌排序模式
     * 排序模式下显示排序值输入框，退出时可提交批量排序
     */
    toggleListingSortMode() {
      if (this.listingSortMode) {
        // 退出排序模式，清空暂存
        this.listingSortMode = false
        this.listingSortChanges = []
      } else {
        // 进入排序模式，初始化暂存
        this.listingSortMode = true
        this.listingSortChanges = this.userListingsInfo.listings
          .filter(l => l.status === 'on_sale')
          .map(l => ({
            id: l.market_listing_id,
            sort_order: l.sort_order || 0
          }))
      }
    },

    /**
     * 更新单条挂牌的排序值（排序模式下）
     *
     * @param {number} listingId - 挂牌ID
     * @param {number} newSortOrder - 新排序值
     */
    updateListingSortOrder(listingId, newSortOrder) {
      const item = this.listingSortChanges.find(c => c.id === listingId)
      if (item) {
        item.sort_order = parseInt(newSortOrder, 10) || 0
      }
    },

    /**
     * 提交批量排序变更
     * 调用 TradeAPI.batchSortListings 保存排序
     */
    async submitListingBatchSort() {
      if (!this.listingSortChanges.length) {
        this.$toast?.error('没有可排序的挂牌')
        return
      }
      try {
        this.saving = true
        const res = await TradeAPI.batchSortListings(this.listingSortChanges)
        if (res.success) {
          this.$toast?.success(`已更新 ${this.listingSortChanges.length} 条挂牌排序`)
          this.listingSortMode = false
          this.listingSortChanges = []
          await this.loadUserListings(this.userListingsInfo.user?.user_id)
        } else {
          this.$toast?.error(res.message || '批量排序失败')
        }
      } catch (e) {
        logger.error('[TradeManagement] 批量排序失败:', e)
        this.$toast?.error(e.message || '批量排序失败')
      } finally {
        this.saving = false
      }
    },

    confirmForceWithdraw(listing) {
      this.forceWithdrawForm = {
        market_listing_id: listing.market_listing_id,
        status: listing.status,
        reason: ''
      }
      this.showModal('forceWithdrawModal')
    },

    /**
     * 提交强制下架
     */
    async submitForceWithdraw() {
      if (!this.forceWithdrawForm.reason?.trim()) {
        this.$toast?.error('请填写下架原因')
        return
      }
      try {
        this.saving = true
        const result = await request({
          url: buildURL(MARKET_ENDPOINTS.LISTING_FORCE_WITHDRAW, {
            market_listing_id: this.forceWithdrawForm.market_listing_id
          }),
          method: 'POST',
          data: { withdraw_reason: this.forceWithdrawForm.reason.trim() }
        })
        if (result?.success) {
          this.$toast?.success('下架成功')
          this.hideModal('forceWithdrawModal')
          await this.loadUserListings(this.userListingsInfo.user?.user_id)
          await this.loadMarketplaceStats()
        } else {
          this.$toast?.error(result?.message || '下架失败')
        }
      } catch (error) {
        logger.error('强制下架失败:', error)
        this.$toast?.error(error.message || '下架失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 打开调整上架限制弹窗
     * @param {Object} userStat - 用户统计行数据
     */
    openAdjustLimit(userStat) {
      this.adjustLimitForm = {
        user_id: userStat.user_id,
        mobile: userStat.mobile,
        nickname: userStat.nickname || '-',
        current_limit: userStat.max_active_listings,
        is_custom: userStat.is_custom_limit,
        new_limit: userStat.max_active_listings,
        use_global: false,
        reason: ''
      }
      this.showModal('adjustLimitModal')
    },

    /**
     * 提交调整上架限制
     */
    async submitAdjustLimit() {
      try {
        this.saving = true
        const data = {
          user_id: this.adjustLimitForm.user_id,
          max_active_listings: this.adjustLimitForm.use_global
            ? null
            : parseInt(this.adjustLimitForm.new_limit),
          reason: this.adjustLimitForm.reason || ''
        }
        const result = await request({
          url: MARKET_ENDPOINTS.LISTING_USER_LIMIT,
          method: 'PUT',
          data
        })
        if (result?.success) {
          this.$toast?.success(`上架限制调整成功（生效值：${result.data?.effective_limit}）`)
          this.hideModal('adjustLimitModal')
          await this.loadMarketplaceStats()
        } else {
          this.$toast?.error(result?.message || '调整失败')
        }
      } catch (error) {
        logger.error('调整上架限制失败:', error)
        this.$toast?.error(error.message || '调整失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 加载兑换订单列表
     * @async
     * @returns {Promise<void>}
     */
    async loadRedemptionOrders() {
      try {
        const queryParams = {
          ...this.redemptionFilters,
          page: this.redemptionCurrentPage,
          page_size: this.redemptionPageSize
        }
        if (this.tradeOrderMerchantFilter) {
          queryParams.merchant_id = this.tradeOrderMerchantFilter
        }
        const result = await this.apiGet(MARKET_ENDPOINTS.BUSINESS_RECORD_REDEMPTION, queryParams)
        if (result && result.success && result.data) {
          const data = result.data
          this.redemptionOrders = Array.isArray(data.orders) ? data.orders : []
          const pagination = data.pagination || {}
          this.redemptionPagination = {
            total_pages: pagination.total_pages || 1,
            total: pagination.total || this.redemptionOrders.length
          }
        }
      } catch (error) {
        logger.error('加载核销订单失败:', error)
        this.redemptionOrders = []
        this.$toast?.error('加载核销订单失败: ' + error.message)
      }
    },

    // ✅ 已删除 getStatusText 映射函数，使用后端返回的 status_display 字段

    /**
     * 获取交易状态显示文本
     * @param {string} status - 交易状态码
     * @returns {string} 状态显示文本
     */
    // ✅ 已删除 getTradeStatusText 映射函数 - 改用后端 _display 字段（P2 中文化）
    // ✅ 已删除 getRedemptionStatusText 映射函数 - 改用后端 _display 字段（P2 中文化）

    /**
     * 获取交易订单状态显示文本（HTML模板使用）
     * @param {string} status - 交易状态码
     * @returns {string} 状态显示文本
     */
    // ✅ 已删除 getTradeOrderStatusText 映射函数 - 改用后端 _display 字段（P2 中文化）

    /**
     * 格式化日期显示（强制北京时间）
     * @param {string} dateStr - 日期字符串（数据库返回的已是北京时间）
     * @returns {string} 本地化日期字符串（北京时间）
     */
    formatDate(dateStr) {
      if (!dateStr) return '-'

      // 数据库配置 dateStrings: true，返回的是不带时区的北京时间字符串
      // 格式如: "2026-01-25 20:10:36"，这已经是北京时间，不需要再转换
      if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateStr)) {
        // 将 "YYYY-MM-DD HH:mm:ss" 转换为 "YYYY/MM/DD HH:mm:ss" 格式显示
        return dateStr.replace(/-/g, '/')
      }

      // 如果是 ISO 格式或 Date 对象，则转换为北京时间
      try {
        return new Date(dateStr).toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      } catch (_e) {
        return String(dateStr)
      }
    },

    /**
     * 格式化数字显示
     * @param {number} num - 数字
     * @returns {string} 格式化后的数字字符串
     */
    formatNumber(num) {
      if (num === null || num === undefined) return '0'
      return Number(num).toLocaleString('zh-CN')
    },

    // ========== data-table 数据源方法 ==========

    /**
     * data-table 数据源：交易订单
     * @param {Object} params - 查询参数（由 data-table 组件传入）
     * @returns {Promise<{items: Array, total: number}>}
     */
    async fetchTradeOrderTableData(params) {
      const queryParams = {
        page: params.page || 1,
        page_size: params.page_size || 20
      }
      // 合并筛选条件
      if (this.tradeFilters?.status) queryParams.status = this.tradeFilters.status
      if (this.tradeFilters?.listing_id)
        queryParams.market_listing_id = this.tradeFilters.listing_id
      if (this.tradeOrderMerchantFilter) queryParams.merchant_id = this.tradeOrderMerchantFilter
      if (this.tradeFilters?.buyer_mobile) {
        const buyer = await this.resolveUserByMobile(this.tradeFilters.buyer_mobile)
        if (buyer) {
          queryParams.buyer_user_id = buyer.user_id
          this.resolvedBuyer = buyer
        } else {
          this.resolvedBuyer = null
          return { items: [], total: 0 }
        }
      }
      if (this.tradeFilters?.seller_mobile) {
        const seller = await this.resolveUserByMobile(this.tradeFilters.seller_mobile)
        if (seller) {
          queryParams.seller_user_id = seller.user_id
          this.resolvedSeller = seller
        } else {
          this.resolvedSeller = null
          return { items: [], total: 0 }
        }
      }

      Object.keys(queryParams).forEach(k => !queryParams[k] && delete queryParams[k])

      const result = await request({
        url: MARKET_ENDPOINTS.TRADE_ORDER_LIST,
        method: 'GET',
        params: queryParams
      })

      if (result?.success && result.data) {
        const items = result.data.orders || result.data.list || result.data.items || []
        const total =
          result.data.pagination?.total_count || result.data.pagination?.total || items.length
        this.tradeOrders = items
        this._updateStats()
        return { items, total }
      }
      throw new Error(result?.message || '加载交易订单失败')
    },

    /**
     * data-table 数据源：上架统计
     * @param {Object} params - 查询参数
     * @returns {Promise<{items: Array, total: number}>}
     */
    async fetchMarketplaceStatsTableData(params) {
      const queryParams = {
        page: params.page || 1,
        limit: params.page_size || 20
      }
      if (this.marketplaceFilters?.status && this.marketplaceFilters.status !== 'all') {
        queryParams.filter = this.marketplaceFilters.status
      }
      if (this.marketplaceFilters?.mobile?.trim()) {
        queryParams.mobile = this.marketplaceFilters.mobile.trim()
      }
      if (this.marketplaceFilters?.merchant_id) {
        queryParams.merchant_id = this.marketplaceFilters.merchant_id
      }

      const result = await request({
        url: MARKET_ENDPOINTS.LISTING_STATS,
        method: 'GET',
        params: queryParams
      })

      if (result?.success && result.data) {
        const items = result.data.stats || result.data.users || result.data.list || []
        const total = result.data.pagination?.total || items.length
        // 更新摘要统计
        if (result.data.summary) {
          this.marketplaceSummary = {
            total_users_with_listings:
              result.data.summary.total_users_with_listings || items.length,
            users_near_limit: result.data.summary.users_near_limit || 0,
            users_at_limit: result.data.summary.users_at_limit || 0
          }
        }
        return { items, total }
      }
      throw new Error(result?.message || '加载上架统计失败')
    },

    /**
     * 处理交易订单表格操作
     * @param {{action: string, row: Object}} detail - 操作详情
     */
    handleTradeOrderTableAction(detail) {
      const { action, row } = detail
      if (action === 'detail') this.viewTradeOrderDetail(row)
    },

    /**
     * 查看交易订单详情
     * @param {Object} trade - 交易订单对象
     * @returns {void}
     */
    viewTradeOrderDetail(trade) {
      this.selectedTradeOrder = trade
      this.showModal('tradeDetailModal')
    },

    /**
     * 切换交易订单列表页码
     * @param {number} page - 目标页码
     * @returns {void}
     */
    changeTradePage(page) {
      if (page < 1 || page > (this.tradePagination?.total_pages || 1)) return
      this.tradeCurrentPage = page
      this.loadTradeOrders()
    },

    /**
     * 更新统计卡片数据
     * @private
     * @description 使用后端字段名: gross_amount, net_amount 等
     * @returns {void}
     */
    _updateStats() {
      this.stats = {
        totalTrades: this.tradePagination.total || this.tradeOrders.length,
        completedTrades: this.tradeOrders.filter(t => t.status === 'completed').length,
        pendingTrades: this.tradeOrders.filter(
          t => t.status === 'pending' || t.status === 'created' || t.status === 'frozen'
        ).length,
        // 后端字段: gross_amount, price_amount 等（注意强制转数字，避免字符串拼接）
        totalVolume: this.tradeOrders
          .filter(t => t.status === 'completed')
          .reduce((sum, t) => sum + Number(t.gross_amount || t.price_amount || t.price || 0), 0)
      }
    }
  }))

  logger.info('[TradeManagement] ✅ Alpine 组件已注册')
})
