/**
 * 交易市场管理页面 - Alpine.js 组件 (Mixin v3.0)
 *
 * @file admin/src/modules/market/pages/trade-management.js
 * @description 交易市场管理页面，包含交易订单和上架统计
 * @version 3.0.0
 * @date 2026-01-23
 *
 * @requires Alpine.js
 * @requires createPageMixin - 页面基础功能混入
 * @requires MARKET_ENDPOINTS - 市场模块API端点（交易市场、业务记录等）
 *
 * @example
 * <!-- 使用导航组件 -->
 * <nav x-data="tradeNavigation()">
 *   <template x-for="page in subPages">
 *     <button @click="switchPage(page.id)" x-text="page.title"></button>
 *   </template>
 * </nav>
 *
 * <!-- 使用主组件 -->
 * <div x-data="tradeManagementPage()">
 *   <div x-show="current_page === 'trade-orders'">交易市场订单</div>
 *   <div x-show="current_page === 'marketplace-stats'">上架统计</div>
 *   <div x-show="current_page === 'redemption-orders'">兑换订单</div>
 * </div>
 */

import { logger } from '../../../utils/logger.js'
import { MARKET_ENDPOINTS } from '../../../api/market/index.js'
import { buildURL, request } from '../../../api/base.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { UserAPI } from '../../../api/user.js'

document.addEventListener('alpine:init', () => {
  logger.info('[TradeManagement] 注册 Alpine 组件 (Mixin v3.0)...')

  // 存储当前子页面
  Alpine.store('tradePage', 'trade-orders')

  // ==================== 导航组件 ====================

  /**
   * 交易管理导航组件
   *
   * @description 管理交易管理子页面导航，支持URL参数持久化
   * @returns {Object} Alpine组件对象
   *
   * @property {string} current_page - 当前激活的页面ID
   * @property {Array<{id: string, title: string, icon: string}>} subPages - 子页面配置列表
   */
  Alpine.data('tradeNavigation', () => ({
    ...createPageMixin(),

    /** @type {string} 当前页面ID，默认为'trade-orders' */
    current_page: 'trade-orders',

    /**
     * 子页面配置列表
     * @type {Array<{id: string, title: string, icon: string}>}
     */
    subPages: [
      { id: 'trade-orders', title: '交易市场订单', icon: 'bi-arrow-left-right' },
      { id: 'marketplace-stats', title: '上架统计', icon: 'bi-bar-chart' },
      { id: 'market-overview', title: '市场概览', icon: 'bi-graph-up' }
    ],

    /**
     * 初始化导航组件
     * @description 从URL参数读取当前页面，并同步到Alpine store
     * @returns {void}
     */
    init() {
      // 从 URL 参数读取页面
      const urlParams = new URLSearchParams(window.location.search)
      const page = urlParams.get('page')
      if (page && this.subPages.some(p => p.id === page)) {
        this.current_page = page
      }
      Alpine.store('tradePage', this.current_page)
      logger.info('[TradeNavigation] 当前页面:', this.current_page)
    },

    /**
     * 切换到指定页面
     * @description 更新当前页面状态、URL参数，并触发页面切换事件
     * @param {string} pageId - 目标页面ID ('trade-orders' | 'marketplace-stats' | 'redemption-orders')
     * @fires trade-page-changed - 页面切换自定义事件
     * @returns {void}
     */
    switchPage(pageId) {
      this.current_page = pageId
      Alpine.store('tradePage', pageId)

      // 更新 URL
      const url = new URL(window.location)
      url.searchParams.set('page', pageId)
      window.history.pushState({}, '', url)

      // 触发数据加载事件
      window.dispatchEvent(new CustomEvent('trade-page-changed', { detail: pageId }))
      logger.info('[TradeNavigation] 切换到:', pageId)
    }
  }))

  // ==================== 内容组件 ====================

  /**
   * 交易管理内容组件
   *
   * @description 管理交易市场订单、上架统计和兑换订单的数据展示
   * @returns {Object} Alpine组件对象
   *
   * @property {Array} tradeOrders - 交易市场订单列表
   * @property {Array} marketplaceStats - 上架统计数据
   * @property {Array} redemptionOrders - 兑换订单列表
   */
  Alpine.data('tradePageContent', () => ({
    ...createPageMixin({ userResolver: true }),

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
          pending: { class: 'yellow', label: '待处理' },
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
        actions: [
          { name: 'detail', label: '详情', class: 'text-blue-600 hover:text-blue-800' }
        ]
      }
    ],

    marketplaceStatsTableColumns: [
      { key: 'user_id', label: '用户ID', sortable: true },
      { key: 'nickname', label: '用户昵称' },
      { key: 'active_listing_count', label: '当前上架数', type: 'number', sortable: true },
      { key: 'max_listings', label: '上架上限', type: 'number' },
      {
        key: 'usage_ratio',
        label: '使用率',
        render: (val) => {
          const pct = Math.round((val || 0) * 100)
          const cls = pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-yellow-600' : 'text-green-600'
          return `<span class="${cls} font-medium">${pct}%</span>`
        }
      },
      {
        key: 'status_label',
        label: '状态',
        type: 'status',
        statusMap: {
          normal: { class: 'green', label: '正常' },
          near_limit: { class: 'yellow', label: '接近上限' },
          at_limit: { class: 'red', label: '已达上限' }
        }
      }
    ],

    /**
     * data-table 数据源：交易订单
     */
    async fetchTradeOrderTableData(params) {
      const queryParams = {
        page: params.page || 1,
        page_size: params.page_size || 20
      }
      if (params.status) queryParams.status = params.status

      Object.keys(queryParams).forEach(k => !queryParams[k] && delete queryParams[k])

      const result = await this.apiGet(MARKET_ENDPOINTS.TRADE_ORDER_LIST, queryParams)

      if (result?.success && result.data) {
        const items = result.data.orders || result.data.list || result.data.items || []
        const total = result.data.pagination?.total || result.data.total || items.length
        this.tradeOrders = items
        return { items, total }
      }
      throw new Error(result?.message || '加载交易订单失败')
    },

    /**
     * data-table 数据源：上架统计
     */
    async fetchMarketplaceStatsTableData(params) {
      const queryParams = { page: params.page || 1, page_size: params.page_size || 20 }
      if (params.status && params.status !== 'all') queryParams.status = params.status

      const result = await this.apiGet(MARKET_ENDPOINTS.MARKETPLACE_STATS, queryParams)

      if (result?.success && result.data) {
        const items = result.data.users || result.data.stats || result.data.list || []
        const total = result.data.pagination?.total || items.length
        return { items, total }
      }
      throw new Error(result?.message || '加载上架统计失败')
    },

    /**
     * 处理交易订单表格操作
     */
    handleTradeOrderTableAction(detail) {
      const { action, row } = detail
      if (action === 'detail') this.viewTradeOrderDetail(row)
    },

    // ========== 交易市场订单数据 ==========
    /** @type {Array<Object>} 交易市场订单列表 */
    tradeOrders: [],
    /** @type {Object|null} 当前选中的交易订单 */
    selectedTradeOrder: null,
    /**
     * 交易统计信息
     * @type {{total: number, created: number, frozen: number, completed: number}}
     */
    tradeStats: {
      total: 0,
      created: 0,
      frozen: 0,
      completed: 0
    },
    /**
     * 交易订单筛选条件（手机号主导搜索）
     * @type {{status: string, buyer_mobile: string, seller_mobile: string, listing_id: string}}
     */
    tradeFilters: {
      status: '',
      buyer_mobile: '',
      seller_mobile: '',
      listing_id: ''
    },
    /** @type {Object|null} 买家解析结果（独立于 resolvedUser，支持同时显示买卖双方） */
    resolvedBuyer: null,
    /** @type {Object|null} 卖家解析结果 */
    resolvedSeller: null,
    /** @type {number} 交易订单当前页码 */
    tradeCurrentPage: 1,
    /** @type {number} 交易订单每页数量 */
    tradePageSize: 20,
    /** @type {{total_pages: number, total: number}} 交易订单分页信息 */
    tradePagination: { total_pages: 1, total: 0 },

    // ========== 上架统计数据 ==========
    /** @type {Array<Object>} 用户上架统计列表 */
    marketplaceStats: [],
    /**
     * 上架统计摘要
     * @type {{total_users_with_listings: number, users_near_limit: number, users_at_limit: number}}
     */
    marketplaceSummary: {
      total_users_with_listings: 0,
      users_near_limit: 0,
      users_at_limit: 0
    },
    /**
     * 上架统计筛选条件
     * @type {{status: string}}
     */
    marketplaceFilters: {
      status: 'all'
    },
    /** @type {number} 上架统计当前页码 */
    marketplaceCurrentPage: 1,
    /** @type {number} 上架统计每页数量 */
    marketplacePageSize: 20,
    /** @type {{total_pages: number, total: number}} 上架统计分页信息 */
    marketplacePagination: { total_pages: 1, total: 0 },
    /** @type {number} 最大上架数限制 */
    maxListings: 10,

    // ========== 兑换订单数据 ==========
    /** @type {Array<Object>} 兑换订单列表 */
    redemptionOrders: [],
    /**
     * 兑换订单筛选条件
     * @type {{status: string}}
     */
    redemptionFilters: {
      status: ''
    },
    /** @type {number} 兑换订单当前页码 */
    redemptionCurrentPage: 1,
    /** @type {number} 兑换订单每页数量 */
    redemptionPageSize: 20,
    /** @type {{total_pages: number, total: number}} 兑换订单分页信息 */
    redemptionPagination: { total_pages: 1, total: 0 },

    // ========== 通用状态 ==========
    /** @type {boolean} 保存操作进行中标志 */
    saving: false,

    /**
     * 获取当前页面ID（从Alpine store读取）
     * @returns {string} 当前页面ID
     */
    get current_page() {
      return Alpine.store('tradePage')
    },

    // ========== 初始化 ==========
    /**
     * 初始化内容组件
     * @description 加载页面数据并监听页面切换事件
     * @returns {void}
     */
    init() {
      logger.info('[TradePageContent] 初始化...')

      // 根据当前页面加载数据
      this.loadPageData()

      // 监听页面切换（命名引用以便清理）
      this._tradePageChangedHandler = _e => {
        this.loadPageData()
      }
      window.addEventListener('trade-page-changed', this._tradePageChangedHandler)
    },

    /**
     * 根据当前页面加载对应数据
     * @async
     * @description 根据current_page调用不同的数据加载方法
     * @returns {Promise<void>}
     */
    async loadPageData() {
      const page = this.current_page
      logger.info('[TradePageContent] 加载数据:', page)

      switch (page) {
        case 'trade-orders':
          await this.loadTradeOrders()
          await this.loadTradeStats()
          break
        case 'marketplace-stats':
          await this.loadMarketplaceSummary()
          await this.loadMarketplaceStats()
          break
        case 'redemption-orders':
          await this.loadRedemptionOrders()
          break
      }
    },

    // ==================== 交易市场订单方法 ====================

    /**
     * 加载交易市场订单列表
     * @async
     * @description 根据筛选条件和分页参数获取交易订单数据
     * @returns {Promise<void>}
     */
    async loadTradeOrders() {
      try {
        this.loading = true
        const params = {
          page: this.tradeCurrentPage,
          page_size: this.tradePageSize,
          status: this.tradeFilters.status,
          listing_id: this.tradeFilters.listing_id
        }

        // 买家手机号 → resolve 获取 buyer_user_id
        if (this.tradeFilters.buyer_mobile) {
          const buyer = await this.resolveUserByMobile(this.tradeFilters.buyer_mobile)
          if (buyer) { params.buyer_user_id = buyer.user_id; this.resolvedBuyer = buyer }
          else { this.resolvedBuyer = null; this.tradeOrders = []; this.loading = false; return }
        } else { this.resolvedBuyer = null }
        // 卖家手机号 → resolve 获取 seller_user_id
        if (this.tradeFilters.seller_mobile) {
          const seller = await this.resolveUserByMobile(this.tradeFilters.seller_mobile)
          if (seller) { params.seller_user_id = seller.user_id; this.resolvedSeller = seller }
          else { this.resolvedSeller = null; this.tradeOrders = []; this.loading = false; return }
        } else { this.resolvedSeller = null }

        // 移除空值
        Object.keys(params).forEach(k => !params[k] && delete params[k])

        const res = await request({
          url: MARKET_ENDPOINTS.TRADE_ORDER_LIST,
          method: 'GET',
          params
        })

        if (res.success) {
          // 后端返回 orders 数组
          this.tradeOrders = res.data?.orders || res.data?.list || []
          // 后端使用 snake_case: total_count, total_pages
          const pagination = res.data?.pagination || {}
          this.tradePagination = {
            total_pages: pagination.total_pages || pagination.total_pages || 1,
            total: pagination.total_count || pagination.total || this.tradeOrders.length
          }
        } else {
          // 确保失败时 tradeOrders 是空数组
          this.tradeOrders = []
        }
      } catch (e) {
        logger.error('[TradeManagement] 加载交易订单失败:', e)
        this.$toast?.error('加载交易订单失败')
        // 确保出错时 tradeOrders 是空数组
        this.tradeOrders = []
      } finally {
        this.loading = false
      }
    },

    /**
     * 加载交易统计信息
     * @async
     * @description 获取交易订单的统计数据
     * @returns {Promise<void>}
     */
    async loadTradeStats() {
      try {
        const res = await request({ url: MARKET_ENDPOINTS.TRADE_ORDER_STATS, method: 'GET' })
        if (res.success && res.data) {
          // 后端返回格式: { by_status: {...}, completed_summary: {...} }
          const byStatus = res.data.by_status || {}
          const summary = res.data.completed_summary || {}
          this.tradeStats = {
            total:
              summary.total_orders || Object.values(byStatus).reduce((a, b) => a + (b || 0), 0),
            created: byStatus.created || 0,
            frozen: byStatus.frozen || 0,
            completed: byStatus.completed || 0
          }
        }
      } catch (e) {
        logger.error('[TradeManagement] 加载交易统计失败:', e)
      }
    },

    /**
     * 切换交易订单列表页码
     * @param {number} page - 目标页码
     * @returns {void}
     */
    changeTradePage(page) {
      if (page < 1 || page > this.tradePagination.total_pages) return
      this.tradeCurrentPage = page
      this.loadTradeOrders()
    },

    /**
     * 获取交易状态显示文本
     * @param {string} status - 交易状态码
     * @returns {string} 状态显示文本
     */
    // ✅ 已删除 getTradeStatusText 映射函数 - 改用后端 _display 字段（P2 中文化）

    // ✅ 已删除 getStatusText 映射函数，使用后端返回的 status_display 字段

    /**
     * 查看交易订单详情
     * @description 设置选中订单并显示详情弹窗
     * @param {Object} order - 订单对象
     * @returns {void}
     */
    viewTradeOrderDetail(order) {
      this.selectedTradeOrder = order
      this.showModal('tradeDetailModal')
    },

    // ==================== 上架统计方法 ====================

    /**
     * 加载上架统计摘要
     * @async
     * @description 获取用户上架数量的汇总统计
     * @returns {Promise<void>}
     */
    async loadMarketplaceSummary() {
      try {
        const res = await request({
          url: MARKET_ENDPOINTS.LISTING_STATS,
          method: 'GET'
        })
        if (res.success && res.data) {
          const summary = res.data.summary || res.data
          this.marketplaceSummary = {
            total_users_with_listings: summary.total_users_with_listings || 0,
            users_near_limit: summary.users_near_limit || 0,
            users_at_limit: summary.users_at_limit || 0
          }
        }
      } catch (e) {
        logger.error('[TradeManagement] 加载上架摘要失败:', e)
      }
    },

    /**
     * 加载用户上架统计详情
     * @async
     * @description 获取每个用户的上架数量详细信息
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

        const res = await request({
          url: MARKET_ENDPOINTS.LISTING_STATS,
          method: 'GET',
          params
        })

        if (res.success && res.data) {
          this.marketplaceStats = res.data.stats || []
          this.marketplacePagination = {
            total_pages: res.data.pagination?.total_pages || 1,
            total: res.data.pagination?.total || this.marketplaceStats.length
          }

          if (res.data.summary) {
            this.marketplaceSummary = {
              total_users_with_listings: res.data.summary.total_users_with_listings || 0,
              users_near_limit: res.data.summary.users_near_limit || 0,
              users_at_limit: res.data.summary.users_at_limit || 0
            }
          }
        }
      } catch (e) {
        logger.error('[TradeManagement] 加载上架统计失败:', e)
        this.$toast?.error('加载上架统计失败')
      } finally {
        this.loading = false
      }
    },

    /**
     * 切换上架统计列表页码
     * @param {number} page - 目标页码
     * @returns {void}
     */
    changeMarketplacePage(page) {
      if (page < 1 || page > this.marketplacePagination.total_pages) return
      this.marketplaceCurrentPage = page
      this.loadMarketplaceStats()
    },

    // ==================== 兑换订单方法 ====================

    /**
     * 加载兑换订单列表
     * @async
     * @description 根据筛选条件和分页参数获取兑换订单数据
     * @returns {Promise<void>}
     */
    async loadRedemptionOrders() {
      try {
        this.loading = true
        const params = {
          page: this.redemptionCurrentPage,
          page_size: this.redemptionPageSize,
          ...this.redemptionFilters
        }

        Object.keys(params).forEach(k => !params[k] && delete params[k])

        // 使用正确的后端API路径
        const res = await request({
          url: MARKET_ENDPOINTS.BUSINESS_RECORD_REDEMPTION,
          method: 'GET',
          params
        })

        if (res.success) {
          this.redemptionOrders = res.data?.list || res.data || []
          this.redemptionPagination = {
            total_pages: res.data?.pagination?.total_pages || 1,
            total: res.data?.pagination?.total || this.redemptionOrders.length
          }
        }
      } catch (e) {
        logger.error('[TradeManagement] 加载兑换订单失败:', e)
        this.$toast?.error('加载兑换订单失败')
      } finally {
        this.loading = false
      }
    },

    /**
     * 切换兑换订单列表页码
     * @param {number} page - 目标页码
     * @returns {void}
     */
    changeRedemptionPage(page) {
      if (page < 1 || page > this.redemptionPagination.total_pages) return
      this.redemptionCurrentPage = page
      this.loadRedemptionOrders()
    },

    /**
     * 获取兑换订单状态显示文本
     * @param {string} status - 兑换状态码
     * @returns {string} 状态显示文本
     */
    // ✅ 已删除 getRedemptionStatusText 映射函数 - 改用后端 _display 字段（P2 中文化）

    // 注意：后端 /api/v4/console/business-records/redemption-orders 是只读查询接口
    // 不支持审批/拒绝操作，管理员需通过核销操作处理订单
    // 核销操作请使用 MARKET_ENDPOINTS.BUSINESS_RECORD_REDEMPTION_REDEEM

    /**
     * 核销兑换订单
     * @async
     * @description 确认后核销指定的兑换订单
     * @param {Object} order - 订单对象
     * @param {string} order.order_id - 订单ID
     * @returns {Promise<void>}
     */
    async redeemRedemptionOrder(order) {
      const confirmed = await this.$confirm?.('确定要核销此订单吗？')
      if (!confirmed) return

      try {
        const res = await request({
          url: buildURL(MARKET_ENDPOINTS.BUSINESS_RECORD_REDEMPTION_REDEEM, {
            order_id: order.order_id
          }),
          method: 'POST'
        })

        if (res.success) {
          this.$toast?.success('核销成功')
          this.loadRedemptionOrders()
        } else {
          this.$toast?.error(res.message || '核销失败')
        }
      } catch (e) {
        logger.error('[TradeManagement] 核销订单失败:', e)
        this.$toast?.error('核销失败')
      }
    },

    /**
     * 取消兑换订单
     * @async
     * @description 确认后取消指定的兑换订单
     * @param {Object} order - 订单对象
     * @param {string} order.order_id - 订单ID
     * @returns {Promise<void>}
     */
    async cancelRedemptionOrder(order) {
      const confirmed = await this.$confirm?.('确定要取消此订单吗？', { type: 'danger' })
      if (!confirmed) return

      try {
        const res = await request({
          url: buildURL(MARKET_ENDPOINTS.BUSINESS_RECORD_REDEMPTION_CANCEL, {
            order_id: order.order_id
          }),
          method: 'POST'
        })

        if (res.success) {
          this.$toast?.success('已取消')
          this.loadRedemptionOrders()
        } else {
          this.$toast?.error(res.message || '操作失败')
        }
      } catch (e) {
        logger.error('[TradeManagement] 取消订单失败:', e)
        this.$toast?.error('操作失败')
      }
    }
  }))

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
        actions: [
          { name: 'detail', label: '详情', class: 'text-blue-600 hover:text-blue-800' }
        ]
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
        render: (val) => {
          if (val) return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">已达上限</span>'
          return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">正常</span>'
        }
      },
      {
        key: '_actions',
        label: '操作',
        render: (_val, row) => `
          <div class="flex gap-1">
            <button class="px-2 py-1 text-xs themed-btn-primary rounded"
                    onclick="document.dispatchEvent(new CustomEvent('listing-view-user', {detail: ${JSON.stringify({user_id: '__USER_ID__', mobile: '__MOBILE__', nickname: '__NICKNAME__'}).replace('__USER_ID__', `'+row.user_id+'`).replace('__MOBILE__', `'+row.mobile+'`).replace('__NICKNAME__', `'+(row.nickname||'-')+'`)}}))">
              查看上架
            </button>
            <button class="px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600"
                    onclick="document.dispatchEvent(new CustomEvent('listing-adjust-limit', {detail: ${JSON.stringify({user_id: '__UID__'}).replace('__UID__', `'+row.user_id+'`)}}))">
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
    /** @type {{status: string, mobile: string}} 上架统计筛选条件 */
    marketplaceFilters: { status: 'all', mobile: '' },
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

    // ========== 市场概览数据 ==========
    /** @type {Object} 市场概览统计 */
    marketOverview: {
      total_orders: 0,
      completed_orders: 0,
      total_volume: 0,
      total_fees: 0,
      active_listings: 0,
      by_status: {}
    },
    /** @type {boolean} 市场概览加载中 */
    marketOverviewLoading: false,

    // 调整上架限制表单
    /** @type {Object} 调整限制表单数据 */
    adjustLimitForm: { user_id: null, mobile: '', nickname: '', current_limit: 0, is_custom: false, new_limit: null, use_global: false, reason: '' },

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
     * @description 验证权限、从URL读取页面并加载数据
     * @returns {void}
     */
    init() {
      logger.info('交易管理页面初始化 (合并组件)')
      if (!this.checkAuth()) return
      const urlParams = new URLSearchParams(window.location.search)
      this.current_page = urlParams.get('page') || 'trade-orders'
      this.loadPageData()
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
          listing_id: this.tradeFilters.listing_id,
          page: this.tradeCurrentPage,
          page_size: this.tradePageSize
        }
        if (this.tradeFilters.buyer_mobile) {
          const buyer = await this.resolveUserByMobile(this.tradeFilters.buyer_mobile)
          if (buyer) { queryParams.buyer_user_id = buyer.user_id; this.resolvedBuyer = buyer }
          else { this.resolvedBuyer = null; this.tradeOrders = []; return }
        } else { this.resolvedBuyer = null }
        if (this.tradeFilters.seller_mobile) {
          const seller = await this.resolveUserByMobile(this.tradeFilters.seller_mobile)
          if (seller) { queryParams.seller_user_id = seller.user_id; this.resolvedSeller = seller }
          else { this.resolvedSeller = null; this.tradeOrders = []; return }
        } else { this.resolvedSeller = null }
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
            total_pages: pagination.total_pages || pagination.total_pages || 1,
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
     * 加载市场概览数据（交易统计 + 在售挂牌数）
     * @async
     * @returns {Promise<void>}
     */
    async loadMarketOverview() {
      try {
        this.marketOverviewLoading = true

        const res = await request({
          url: MARKET_ENDPOINTS.TRADE_ORDER_STATS,
          method: 'GET'
        })

        if (res?.success && res.data) {
          const data = res.data
          this.marketOverview = {
            total_orders: 0,
            completed_orders: data.completed_summary?.total_orders || 0,
            total_volume: data.completed_summary?.total_gross_amount || 0,
            total_fees: data.completed_summary?.total_fee_amount || 0,
            active_listings: 0,
            by_status: data.by_status || {}
          }

          // 汇总各状态的订单数
          let totalOrders = 0
          Object.values(data.by_status || {}).forEach(item => {
            totalOrders += item.count || 0
          })
          this.marketOverview.total_orders = totalOrders
        }

        // 并行获取在售挂牌数
        try {
          const listingRes = await request({
            url: MARKET_ENDPOINTS.LISTING_STATS,
            method: 'GET',
            params: { page: 1, limit: 1 }
          })
          if (listingRes?.success && listingRes.data?.summary) {
            this.marketOverview.active_listings =
              listingRes.data.summary.total_users_with_listings || 0
          }
        } catch (err) {
          logger.warn('[TradeManagement] 加载挂牌统计失败（非致命）:', err.message)
        }

        logger.info('[TradeManagement] 市场概览加载完成', this.marketOverview)
      } catch (error) {
        logger.error('[TradeManagement] 加载市场概览失败:', error)
        this.$toast?.error('加载市场概览数据失败')
      } finally {
        this.marketOverviewLoading = false
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
          max_active_listings: this.adjustLimitForm.use_global ? null : parseInt(this.adjustLimitForm.new_limit),
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
        // apiGet 返回 { success, data } 结构
        const result = await this.apiGet(MARKET_ENDPOINTS.BUSINESS_RECORD_REDEMPTION, {
          ...this.redemptionFilters,
          page: this.redemptionCurrentPage,
          page_size: this.redemptionPageSize // 后端使用 snake_case
        })
        if (result && result.success && result.data) {
          const data = result.data
          const redemptionData = data?.orders || data?.list || data
          this.redemptionOrders = Array.isArray(redemptionData) ? redemptionData : []
          const pagination = data.pagination || {}
          this.redemptionPagination = {
            total_pages: pagination.total_pages || pagination.total_pages || 1,
            total: pagination.total_count || pagination.total || this.redemptionOrders.length
          }
        }
      } catch (error) {
        logger.error('加载兑换订单失败:', error)
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
      if (this.tradeFilters?.buyer_mobile) {
        const buyer = await this.resolveUserByMobile(this.tradeFilters.buyer_mobile)
        if (buyer) { queryParams.buyer_user_id = buyer.user_id; this.resolvedBuyer = buyer }
        else { this.resolvedBuyer = null; return { items: [], total: 0 } }
      }
      if (this.tradeFilters?.seller_mobile) {
        const seller = await this.resolveUserByMobile(this.tradeFilters.seller_mobile)
        if (seller) { queryParams.seller_user_id = seller.user_id; this.resolvedSeller = seller }
        else { this.resolvedSeller = null; return { items: [], total: 0 } }
      }

      Object.keys(queryParams).forEach(k => !queryParams[k] && delete queryParams[k])

      const result = await request({
        url: MARKET_ENDPOINTS.TRADE_ORDER_LIST,
        method: 'GET',
        params: queryParams
      })

      if (result?.success && result.data) {
        const items = result.data.orders || result.data.list || result.data.items || []
        const total = result.data.pagination?.total_count || result.data.pagination?.total || items.length
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
            total_users_with_listings: result.data.summary.total_users_with_listings || items.length,
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
