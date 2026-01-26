/**
 * C2C交易管理页面 - Alpine.js 组件 (Mixin v3.0)
 *
 * @file admin/src/modules/market/pages/trade-management.js
 * @description C2C用户间交易管理页面，包含交易订单和上架统计
 * @version 3.0.0
 * @date 2026-01-23
 *
 * @requires Alpine.js
 * @requires createPageMixin - 页面基础功能混入
 * @requires MARKET_ENDPOINTS - 市场模块API端点（C2C市场、业务记录等）
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
 *   <div x-show="currentPage === 'trade-orders'">C2C交易订单</div>
 *   <div x-show="currentPage === 'marketplace-stats'">上架统计</div>
 *   <div x-show="currentPage === 'redemption-orders'">兑换订单</div>
 * </div>
 */


import { logger } from '../../../utils/logger.js'
import { MARKET_ENDPOINTS } from '../../../api/market.js'
import { buildURL, request } from '../../../api/base.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
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
   * @property {string} currentPage - 当前激活的页面ID
   * @property {Array<{id: string, title: string, icon: string}>} subPages - 子页面配置列表
   */
  Alpine.data('tradeNavigation', () => ({
    ...createPageMixin(),

    /** @type {string} 当前页面ID，默认为'trade-orders' */
    currentPage: 'trade-orders',

    /**
     * 子页面配置列表
     * @type {Array<{id: string, title: string, icon: string}>}
     */
    subPages: [
      { id: 'trade-orders', title: 'C2C交易订单', icon: 'bi-arrow-left-right' },
      { id: 'marketplace-stats', title: '上架统计', icon: 'bi-bar-chart' }
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
        this.currentPage = page
      }
      Alpine.store('tradePage', this.currentPage)
      logger.info('[TradeNavigation] 当前页面:', this.currentPage)
    },

    /**
     * 切换到指定页面
     * @description 更新当前页面状态、URL参数，并触发页面切换事件
     * @param {string} pageId - 目标页面ID ('trade-orders' | 'marketplace-stats' | 'redemption-orders')
     * @fires trade-page-changed - 页面切换自定义事件
     * @returns {void}
     */
    switchPage(pageId) {
      this.currentPage = pageId
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
   * @description 管理C2C交易订单、上架统计和兑换订单的数据展示
   * @returns {Object} Alpine组件对象
   *
   * @property {Array} tradeOrders - C2C交易订单列表
   * @property {Array} marketplaceStats - 上架统计数据
   * @property {Array} redemptionOrders - 兑换订单列表
   */
  Alpine.data('tradePageContent', () => ({
    ...createPageMixin(),

    // ========== C2C交易订单数据 ==========
    /** @type {Array<Object>} C2C交易订单列表 */
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
     * 交易订单筛选条件
     * @type {{status: string, buyer_user_id: string, seller_user_id: string, listing_id: string}}
     */
    tradeFilters: {
      status: '',
      buyer_user_id: '',
      seller_user_id: '',
      listing_id: ''
    },
    /** @type {number} 交易订单当前页码 */
    tradeCurrentPage: 1,
    /** @type {number} 交易订单每页数量 */
    tradePageSize: 20,
    /** @type {{totalPages: number, total: number}} 交易订单分页信息 */
    tradePagination: { totalPages: 1, total: 0 },

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
    /** @type {{totalPages: number, total: number}} 上架统计分页信息 */
    marketplacePagination: { totalPages: 1, total: 0 },
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
    /** @type {{totalPages: number, total: number}} 兑换订单分页信息 */
    redemptionPagination: { totalPages: 1, total: 0 },

    // ========== 通用状态 ==========
    /** @type {boolean} 保存操作进行中标志 */
    saving: false,

    /**
     * 获取当前页面ID（从Alpine store读取）
     * @returns {string} 当前页面ID
     */
    get currentPage() {
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

      // 监听页面切换
      window.addEventListener('trade-page-changed', e => {
        this.loadPageData()
      })
    },

    /**
     * 根据当前页面加载对应数据
     * @async
     * @description 根据currentPage调用不同的数据加载方法
     * @returns {Promise<void>}
     */
    async loadPageData() {
      const page = this.currentPage
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

    // ==================== C2C交易订单方法 ====================

    /**
     * 加载C2C交易订单列表
     * @async
     * @description 根据筛选条件和分页参数获取交易订单数据
     * @returns {Promise<void>}
     */
    async loadTradeOrders() {
      try {
        this.loading = true
        const params = {
          page: this.tradeCurrentPage,
          page_size: this.tradePageSize,  // 后端使用 snake_case
          ...this.tradeFilters
        }

        // 移除空值
        Object.keys(params).forEach(k => !params[k] && delete params[k])

        const res = await request({
          url: MARKET_ENDPOINTS.TRADE_ORDERS_LIST,  // 使用正确的后端端点
          method: 'GET',
          params
        })

        if (res.success) {
          // 后端返回 orders 数组
          this.tradeOrders = res.data?.orders || res.data?.list || []
          // 后端使用 snake_case: total_count, total_pages
          const pagination = res.data?.pagination || {}
          this.tradePagination = {
            totalPages: pagination.total_pages || pagination.totalPages || 1,
            total: pagination.total_count || pagination.total || this.tradeOrders.length
          }
        }
      } catch (e) {
        logger.error('[TradeManagement] 加载交易订单失败:', e)
        this.$toast?.error('加载交易订单失败')
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
        const res = await request({ url: MARKET_ENDPOINTS.TRADE_ORDERS_STATS, method: 'GET' })
        if (res.success && res.data) {
          // 后端返回格式: { by_status: {...}, completed_summary: {...} }
          const byStatus = res.data.by_status || {}
          const summary = res.data.completed_summary || {}
          this.tradeStats = {
            total: summary.total_orders || Object.values(byStatus).reduce((a, b) => a + (b || 0), 0),
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
      if (page < 1 || page > this.tradePagination.totalPages) return
      this.tradeCurrentPage = page
      this.loadTradeOrders()
    },

    /**
     * 获取交易状态显示文本
     * @param {string} status - 交易状态码
     * @returns {string} 状态显示文本
     */
    getTradeStatusText(status) {
      const map = {
        created: '待支付',
        frozen: '冻结中',
        completed: '已完成',
        cancelled: '已取消',
        pending: '待处理'
      }
      return map[status] || status
    },

    /**
     * 获取通用状态文本（HTML 模板通用函数）
     * @param {string} status - 状态码
     * @returns {string} 状态显示文本
     */
    getStatusText(status) {
      const map = {
        created: '待支付',
        frozen: '冻结中',
        completed: '已完成',
        cancelled: '已取消',
        pending: '待处理',
        processing: '处理中',
        rejected: '已拒绝',
        approved: '已批准'
      }
      return map[status] || status || '-'
    },

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
          url: MARKET_ENDPOINTS.C2C_MARKET_LISTINGS_SUMMARY,
          method: 'GET'
        })
        if (res.success && res.data) {
          this.marketplaceSummary = {
            total_users_with_listings: res.data.total_users_with_listings || 0,
            users_near_limit: res.data.users_near_limit || 0,
            users_at_limit: res.data.users_at_limit || 0
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
          pageSize: this.marketplacePageSize,
          status: this.marketplaceFilters.status
        }

        if (params.status === 'all') delete params.status

        const res = await request({
          url: MARKET_ENDPOINTS.C2C_MARKET_LISTINGS_USER_STATS,
          method: 'GET',
          params
        })

        if (res.success) {
          this.marketplaceStats = res.data?.list || res.data || []
          this.marketplacePagination = {
            totalPages: res.data?.pagination?.totalPages || 1,
            total: res.data?.pagination?.total || this.marketplaceStats.length
          }

          // 获取最大上架数
          if (res.data?.max_listings) {
            this.maxListings = res.data.max_listings
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
      if (page < 1 || page > this.marketplacePagination.totalPages) return
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
          pageSize: this.redemptionPageSize,
          ...this.redemptionFilters
        }

        Object.keys(params).forEach(k => !params[k] && delete params[k])

        // 使用正确的后端API路径
        const res = await request({
          url: MARKET_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION,
          method: 'GET',
          params
        })

        if (res.success) {
          this.redemptionOrders = res.data?.list || res.data || []
          this.redemptionPagination = {
            totalPages: res.data?.pagination?.totalPages || 1,
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
      if (page < 1 || page > this.redemptionPagination.totalPages) return
      this.redemptionCurrentPage = page
      this.loadRedemptionOrders()
    },

    /**
     * 获取兑换订单状态显示文本
     * @param {string} status - 兑换状态码
     * @returns {string} 状态显示文本
     */
    getRedemptionStatusText(status) {
      const map = {
        pending: '待处理',
        completed: '已完成',
        rejected: '已拒绝',
        processing: '处理中'
      }
      return map[status] || status
    },

    // 注意：后端 /api/v4/console/business-records/redemption-orders 是只读查询接口
    // 不支持审批/拒绝操作，管理员需通过核销操作处理订单
    // 核销操作请使用 MARKET_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION_REDEEM

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
          url: buildURL(MARKET_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION_REDEEM, { order_id: order.order_id }),
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
          url: buildURL(MARKET_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION_CANCEL, { order_id: order.order_id }),
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
   * @description 整合C2C交易订单、上架统计、兑换订单的完整页面组件
   * @returns {Object} Alpine组件对象
   *
   * @property {string} currentPage - 当前子页面 ('trade-orders' | 'marketplace-stats' | 'redemption-orders')
   * @property {Array} tradeOrders - C2C交易订单列表
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
   *   <div x-show="currentPage === 'trade-orders'">
   *     <!-- C2C交易订单列表 -->
   *   </div>
   * </div>
   */
  Alpine.data('tradeManagementPage', () => ({
    ...createPageMixin(),

    // 子页面导航
    /** @type {string} 当前页面ID */
    currentPage: 'trade-orders',
    /**
     * 子页面配置列表
     * @type {Array<{id: string, name: string, icon: string}>}
     */
    subPages: [
      { id: 'trade-orders', name: 'C2C交易订单', icon: '🔄' },
      { id: 'marketplace-stats', name: '上架统计', icon: '📊' }
    ],

    // C2C交易订单
    /** @type {Array<Object>} C2C交易订单列表 */
    tradeOrders: [],
    /** @type {Object|null} 当前选中的交易订单 */
    selectedTradeOrder: null,
    /** @type {Object|null} 旧版兼容：选中的交易（用于旧版模态框） */
    selectedTrade: null,
    /** @type {{total: number, created: number, frozen: number, completed: number}} 交易统计 */
    tradeStats: { total: 0, created: 0, frozen: 0, completed: 0 },
    /** @type {{totalTrades: number, completedTrades: number, pendingTrades: number, totalVolume: number}} HTML 统计卡片使用 */
    stats: { totalTrades: 0, completedTrades: 0, pendingTrades: 0, totalVolume: 0 },
    /** @type {Object} 交易订单筛选条件 */
    tradeFilters: { status: '', buyer_user_id: '', seller_user_id: '', listing_id: '' },
    /** @type {number} 交易订单当前页码 */
    tradeCurrentPage: 1,
    /** @type {number} 交易订单每页数量 */
    tradePageSize: 20,
    /** @type {{totalPages: number, total: number}} 交易订单分页信息 */
    tradePagination: { totalPages: 1, total: 0 },

    // 上架统计
    /** @type {Array<Object>} 用户上架统计列表 */
    marketplaceStats: [],
    /** @type {{total_users_with_listings: number, users_near_limit: number, users_at_limit: number}} 上架摘要 */
    marketplaceSummary: { total_users_with_listings: 0, users_near_limit: 0, users_at_limit: 0 },
    /** @type {{status: string}} 上架统计筛选条件 */
    marketplaceFilters: { status: 'all' },
    /** @type {number} 上架统计当前页码 */
    marketplaceCurrentPage: 1,
    /** @type {number} 上架统计每页数量 */
    marketplacePageSize: 20,
    /** @type {{totalPages: number, total: number}} 上架统计分页信息 */
    marketplacePagination: { totalPages: 1, total: 0 },
    /** @type {number} 最大上架数限制 */
    maxListings: 10,

    // 兑换订单
    /** @type {Array<Object>} 兑换订单列表 */
    redemptionOrders: [],
    /** @type {{status: string}} 兑换订单筛选条件 */
    redemptionFilters: { status: '' },
    /** @type {number} 兑换订单当前页码 */
    redemptionCurrentPage: 1,
    /** @type {number} 兑换订单每页数量 */
    redemptionPageSize: 20,
    /** @type {{totalPages: number, total: number}} 兑换订单分页信息 */
    redemptionPagination: { totalPages: 1, total: 0 },

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
      this.currentPage = urlParams.get('page') || 'trade-orders'
      this.loadPageData()
    },

    /**
     * 切换子页面
     * @param {string} pageId - 目标页面ID
     * @returns {void}
     */
    switchPage(pageId) {
      this.currentPage = pageId
      window.history.pushState({}, '', `?page=${pageId}`)
      this.loadPageData()
    },

    /**
     * 根据当前页面加载数据
     * @async
     * @returns {Promise<void>}
     */
    async loadPageData() {
      await this.withLoading(async () => {
        switch (this.currentPage) {
          case 'trade-orders':
            await this.loadTradeOrders()
            break
          case 'marketplace-stats':
            await this.loadMarketplaceStats()
            break
          case 'redemption-orders':
            await this.loadRedemptionOrders()
            break
        }
      })
    },

    /**
     * 加载C2C交易订单列表
     * @async
     * @returns {Promise<void>}
     */
    async loadTradeOrders() {
      try {
        logger.info('[TradeManagement] 加载交易订单...', this.tradeFilters)
        // apiGet 返回 { success, data } 结构
        const result = await this.apiGet(MARKET_ENDPOINTS.TRADE_ORDERS_LIST, {
          ...this.tradeFilters,
          page: this.tradeCurrentPage,
          page_size: this.tradePageSize  // 后端使用 snake_case
        })
        
        logger.info('[TradeManagement] API 响应:', result)
        
        if (result && result.success && result.data) {
          // 后端返回 orders 数组（不是 list）
          const data = result.data
          const tradeData = data?.orders || data?.list || []
          this.tradeOrders = Array.isArray(tradeData) ? tradeData : []
          // 后端使用 snake_case: total_count, total_pages
          const pagination = data.pagination || {}
          this.tradePagination = {
            totalPages: pagination.total_pages || pagination.totalPages || 1,
            total: pagination.total_count || pagination.total || this.tradeOrders.length
          }
          this.tradeStats = { total: this.tradeOrders.length, created: 0, frozen: 0, completed: 0 }
          // 更新统计卡片
          this._updateStats()
          logger.info('[TradeManagement] 加载完成，订单数:', this.tradeOrders.length)
        } else {
          logger.warn('[TradeManagement] API 返回失败:', result)
        }
      } catch (error) {
        logger.error('[TradeManagement] 加载交易订单失败:', error)
        this.$toast?.error('加载交易订单失败: ' + error.message)
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
     * 加载上架统计数据
     * @async
     * @returns {Promise<void>}
     */
    async loadMarketplaceStats() {
      try {
        // apiGet 返回 { success, data } 结构
        const result = await this.apiGet(MARKET_ENDPOINTS.C2C_MARKET_STATS)
        if (result && result.success && result.data) {
          const data = result.data
          const marketData = data?.list || data?.stats || data
          this.marketplaceStats = Array.isArray(marketData) ? marketData : []
        }
      } catch (error) {
        logger.error('加载上架统计失败:', error)
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
        const result = await this.apiGet(MARKET_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION, {
          ...this.redemptionFilters,
          page: this.redemptionCurrentPage,
          page_size: this.redemptionPageSize  // 后端使用 snake_case
        })
        if (result && result.success && result.data) {
          const data = result.data
          const redemptionData = data?.orders || data?.list || data
          this.redemptionOrders = Array.isArray(redemptionData) ? redemptionData : []
          const pagination = data.pagination || {}
          this.redemptionPagination = {
            totalPages: pagination.total_pages || pagination.totalPages || 1,
            total: pagination.total_count || pagination.total || this.redemptionOrders.length
          }
        }
      } catch (error) {
        logger.error('加载兑换订单失败:', error)
      }
    },

    /**
     * 获取通用状态显示文本
     * @param {string} status - 状态码
     * @returns {string} 状态显示文本
     */
    getStatusText(status) {
      const map = {
        created: '待支付',
        frozen: '冻结中',
        completed: '已完成',
        cancelled: '已取消',
        pending: '待处理',
        processing: '处理中',
        rejected: '已拒绝',
        approved: '已批准'
      }
      return map[status] || status || '-'
    },

    /**
     * 获取交易状态显示文本
     * @param {string} status - 交易状态码
     * @returns {string} 状态显示文本
     */
    getTradeStatusText(status) {
      const map = {
        created: '待支付',
        frozen: '冻结中',
        completed: '已完成',
        cancelled: '已取消',
        pending: '待处理'
      }
      return map[status] || status
    },

    /**
     * 获取兑换状态显示文本
     * @param {string} status - 兑换状态码
     * @returns {string} 状态显示文本
     */
    getRedemptionStatusText(status) {
      const map = {
        pending: '待处理',
        completed: '已完成',
        rejected: '已拒绝',
        processing: '处理中'
      }
      return map[status] || status
    },

    /**
     * 获取交易订单状态显示文本（HTML模板使用）
     * @param {string} status - 交易状态码
     * @returns {string} 状态显示文本
     */
    getTradeOrderStatusText(status) {
      const map = {
        created: '待支付',
        frozen: '冻结中',
        completed: '已完成',
        cancelled: '已取消',
        pending: '待处理'
      }
      return map[status] || status
    },

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
      } catch (e) {
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

    /**
     * 查看交易订单详情
     * @param {Object} trade - 交易订单对象
     * @returns {void}
     */
    viewTradeOrderDetail(trade) {
      this.selectedTradeOrder = trade
      this.selectedTrade = trade  // 兼容旧版模态框
      this.showModal('tradeDetailModal')
    },

    /**
     * 切换交易订单列表页码
     * @param {number} page - 目标页码
     * @returns {void}
     */
    changeTradePage(page) {
      if (page < 1 || page > (this.tradePagination?.totalPages || 1)) return
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
        pendingTrades: this.tradeOrders.filter(t => t.status === 'pending' || t.status === 'created' || t.status === 'frozen').length,
        // 后端字段: gross_amount, price_amount 等
        totalVolume: this.tradeOrders
          .filter(t => t.status === 'completed')
          .reduce((sum, t) => sum + (t.gross_amount || t.price_amount || t.price || 0), 0)
      }
    }
  }))

  logger.info('[TradeManagement] ✅ Alpine 组件已注册')
})
