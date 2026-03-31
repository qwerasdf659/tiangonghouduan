/**
 * 竞价管理页面 - Alpine.js 组件（B2C 竞价 + C2C 拍卖 Tab 切换）
 *
 * @file admin/src/modules/market/pages/bid-management.js
 * @description B2C 竞价商品管理 + C2C 用户间拍卖管理，通过 Tab 切换
 * @version 2.0.0
 * @date 2026-03-30
 *
 * @requires Alpine.js
 * @requires createPageMixin - 页面基础功能混入
 * @requires BidAPI - B2C 竞价管理 API
 * @requires AuctionAPI - C2C 拍卖管理 API
 *
 * B2C 后端路由：/api/v4/console/bids
 * C2C 后端路由：/api/v4/marketplace/auctions（查询） + /api/v4/console/bids（管理操作，type=c2c）
 * 状态机（B2C/C2C 共用）：pending → active → ended → settled / no_bid / settlement_failed / cancelled
 */

import { logger, $confirm } from '../../../utils/index.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { BidAPI } from '../../../api/market/bid.js'
import { AuctionAPI } from '../../../api/market/auction.js'
import { ExchangeItemAPI } from '../../../api/exchange-item/index.js'

/**
 * B2C/C2C 共用状态中文映射（7 态状态机）
 */
const BID_STATUS_MAP = {
  pending: { label: '待开始', color: 'bg-gray-100 text-gray-700' },
  active: { label: '进行中', color: 'bg-green-100 text-green-700' },
  ended: { label: '已结束', color: 'bg-blue-100 text-blue-700' },
  settled: { label: '已结算', color: 'bg-purple-100 text-purple-700' },
  no_bid: { label: '流拍', color: 'bg-yellow-100 text-yellow-700' },
  cancelled: { label: '已取消', color: 'bg-red-100 text-red-700' },
  settlement_failed: { label: '结算失败', color: 'bg-red-100 text-red-800' }
}

/** B2C 状态筛选选项 */
const STATUS_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待开始' },
  { value: 'active', label: '进行中' },
  { value: 'ended', label: '已结束' },
  { value: 'settled', label: '已结算' },
  { value: 'no_bid', label: '流拍' },
  { value: 'cancelled', label: '已取消' },
  { value: 'settlement_failed', label: '结算失败' }
]

/** C2C 状态筛选选项 */
const AUCTION_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '进行中' },
  { value: 'pending', label: '待开始' },
  { value: 'ended', label: '已结束' },
  { value: 'settled', label: '已结算' },
  { value: 'no_bid', label: '流拍' },
  { value: 'settlement_failed', label: '结算失败' },
  { value: 'cancelled', label: '已取消' }
]

document.addEventListener('alpine:init', () => {
  logger.info('[BidManagement] 注册 Alpine 组件...')

  /**
   * 竞价管理主组件（B2C + C2C Tab 切换）
   */
  Alpine.data('bidManagementPage', () => {
    const pageMixin = createPageMixin({
      pageTitle: '竞价管理',
      loadDataOnInit: false
    })

    return {
      ...pageMixin,

      // ==================== Tab 切换 ====================
      /** @type {'b2c'|'c2c'} 当前激活的 Tab */
      activeTab: 'b2c',

      // ==================== B2C 状态配置 ====================
      statusOptions: STATUS_OPTIONS,
      statusMap: BID_STATUS_MAP,

      // ==================== B2C 列表数据 ====================
      /** @type {Array<Object>} B2C 竞价商品列表 */
      bid_products: [],
      list_loading: false,
      list_error: '',

      // ========== B2C 分页 ==========
      pagination: { page: 1, page_size: 20, total: 0 },
      get totalPages() {
        return Math.ceil(this.pagination.total / this.pagination.page_size) || 1
      },
      get hasPrevPage() {
        return this.pagination.page > 1
      },
      get hasNextPage() {
        return this.pagination.page < this.totalPages
      },

      // ========== B2C 统计（从列表数据派生） ==========
      get activeCount() {
        return this.bid_products.filter(b => b.status === 'active').length
      },
      get settledCount() {
        return this.bid_products.filter(b => b.status === 'settled').length
      },
      get inactiveCount() {
        return this.bid_products.filter(b => b.status === 'no_bid' || b.status === 'cancelled')
          .length
      },

      // ========== B2C 筛选 ==========
      filter_status: 'all',

      // ========== B2C 创建表单 ==========
      show_create_modal: false,
      creating: false,
      create_form: {
        exchange_item_id: '',
        start_price: '',
        price_asset_code: 'DIAMOND',
        min_bid_increment: 10,
        start_time: '',
        end_time: '',
        batch_no: ''
      },
      exchange_items: [],
      loading_exchange_items: false,

      // ========== B2C 详情弹窗 ==========
      show_detail_modal: false,
      detail_data: null,
      detail_bids: [],
      detail_loading: false,

      // ========== B2C 取消弹窗 ==========
      show_cancel_modal: false,
      cancel_target: null,
      cancel_reason: '',
      cancelling: false,

      // ==================== C2C 拍卖数据 ====================
      /** @type {Array<Object>} C2C 拍卖列表 */
      auction_listings: [],
      auction_loading: false,
      auction_error: '',

      // ========== C2C 分页 ==========
      auction_pagination: { page: 1, page_size: 20, total: 0 },
      get auctionTotalPages() {
        return Math.ceil(this.auction_pagination.total / this.auction_pagination.page_size) || 1
      },
      get auctionHasPrevPage() {
        return this.auction_pagination.page > 1
      },
      get auctionHasNextPage() {
        return this.auction_pagination.page < this.auctionTotalPages
      },

      // ========== C2C 筛选 ==========
      auction_filter_status: '',
      auctionStatusOptions: AUCTION_STATUS_OPTIONS,

      // ========== C2C 统计（从列表数据派生） ==========
      get auctionActiveCount() {
        return this.auction_listings.filter(a => a.status === 'active').length
      },
      get auctionSettledCount() {
        return this.auction_listings.filter(a => a.status === 'settled').length
      },
      get auctionFailedCount() {
        return this.auction_listings.filter(a => a.status === 'settlement_failed').length
      },

      // ========== C2C 详情弹窗 ==========
      show_auction_detail: false,
      auction_detail: null,
      auction_detail_bids: [],
      auction_detail_loading: false,

      // ========== C2C 取消弹窗 ==========
      show_auction_cancel: false,
      auction_cancel_target: null,
      auction_cancel_reason: '',
      auction_cancelling: false,

      // ==================== 初始化 ====================
      async init() {
        logger.info('[BidManagement] 初始化...')
        if (pageMixin.init) pageMixin.init.call(this)
        await this.loadBidProducts()
      },

      // ==================== Tab 切换 ====================
      /**
       * 切换 B2C/C2C Tab
       * @param {'b2c'|'c2c'} tab - 目标 Tab
       */
      async switchTab(tab) {
        if (this.activeTab === tab) return
        this.activeTab = tab
        logger.info(`[BidManagement] 切换到 ${tab} Tab`)

        if (tab === 'c2c' && this.auction_listings.length === 0) {
          await this.loadAuctionListings()
        }
      },

      // ==================== B2C 竞价方法 ====================

      /**
       * 加载 B2C 竞价商品列表
       */
      async loadBidProducts() {
        this.list_loading = true
        this.list_error = ''
        try {
          const params = {
            page: this.pagination.page,
            page_size: this.pagination.page_size
          }
          if (this.filter_status !== 'all') {
            params.status = this.filter_status
          }
          const res = await BidAPI.getBidProducts(params)
          if (res.success) {
            this.bid_products = res.data?.bid_products || []
            if (res.data?.pagination) {
              this.pagination.total = res.data.pagination.total || 0
            }
            logger.info('[BidManagement] B2C 列表加载成功:', this.bid_products.length)
          } else {
            this.list_error = res.message || '加载失败'
          }
        } catch (e) {
          this.list_error = e.message || '网络请求失败'
          logger.error('[BidManagement] B2C 列表加载异常:', e)
        } finally {
          this.list_loading = false
        }
      },

      /**
       * B2C 状态筛选
       * @param {string} status - 状态值
       */
      async filterByStatus(status) {
        this.filter_status = status
        this.pagination.page = 1
        await this.loadBidProducts()
      },

      /**
       * B2C 翻页
       * @param {number} page - 页码
       */
      async goToPage(page) {
        if (page < 1 || page > this.totalPages) return
        this.pagination.page = page
        await this.loadBidProducts()
      },

      // ========== B2C 创建竞价 ==========

      async openCreateModal() {
        this.show_create_modal = true
        this.create_form = {
          exchange_item_id: '',
          start_price: '',
          price_asset_code: 'DIAMOND',
          min_bid_increment: 10,
          start_time: '',
          end_time: '',
          batch_no: ''
        }
        await this.loadExchangeItems()
      },

      async loadExchangeItems() {
        this.loading_exchange_items = true
        try {
          const res = await ExchangeItemAPI.listExchangeItems({ status: 'active', page_size: 100 })
          if (res.success) {
            this.exchange_items = res.data?.items || res.data?.list || []
            logger.info('[BidManagement] 兑换商品加载成功:', this.exchange_items.length)
          }
        } catch (e) {
          logger.error('[BidManagement] 加载兑换商品失败:', e)
          Alpine.store('notification').error('加载兑换商品列表失败: ' + e.message)
        } finally {
          this.loading_exchange_items = false
        }
      },

      async submitCreate() {
        if (!this.create_form.exchange_item_id) {
          Alpine.store('notification').warning('请选择关联的兑换商品')
          return
        }
        if (!this.create_form.start_price || parseInt(this.create_form.start_price) <= 0) {
          Alpine.store('notification').warning('请输入有效的起拍价')
          return
        }
        this.creating = true
        try {
          const res = await BidAPI.createBidProduct(this.create_form)
          if (res.success) {
            Alpine.store('notification').success('竞价商品创建成功')
            this.show_create_modal = false
            await this.loadBidProducts()
          } else {
            Alpine.store('notification').error(res.message || '创建失败')
          }
        } catch (e) {
          Alpine.store('notification').error('创建失败: ' + e.message)
        } finally {
          this.creating = false
        }
      },

      // ========== B2C 详情 ==========

      async viewDetail(bid_product_id) {
        this.show_detail_modal = true
        this.detail_loading = true
        this.detail_data = null
        this.detail_bids = []
        try {
          const res = await BidAPI.getBidProductDetail(bid_product_id)
          if (res.success) {
            this.detail_data = res.data?.bid_product || res.data
            this.detail_bids = res.data?.bids || []
          }
        } catch (e) {
          Alpine.store('notification').error('加载详情失败: ' + e.message)
        } finally {
          this.detail_loading = false
        }
      },

      // ========== B2C 手动结算 ==========

      async manualSettle(bid_product_id) {
        const ok = await $confirm('确认手动结算此竞价？此操作不可撤销。')
        if (!ok) return
        try {
          const res = await BidAPI.settleBidProduct(bid_product_id)
          if (res.success) {
            Alpine.store('notification').success('结算成功')
            await this.loadBidProducts()
            if (this.show_detail_modal) await this.viewDetail(bid_product_id)
          } else {
            Alpine.store('notification').error(res.message || '结算失败')
          }
        } catch (e) {
          Alpine.store('notification').error('结算失败: ' + e.message)
        }
      },

      // ========== B2C 取消 ==========

      openCancelModal(bid) {
        this.cancel_target = bid
        this.cancel_reason = ''
        this.show_cancel_modal = true
      },

      async submitCancel() {
        if (!this.cancel_reason.trim()) {
          Alpine.store('notification').warning('请输入取消原因')
          return
        }
        this.cancelling = true
        try {
          const id = this.cancel_target?.bid_product_id
          const res = await BidAPI.cancelBidProduct(id, { reason: this.cancel_reason })
          if (res.success) {
            Alpine.store('notification').success('取消成功')
            this.show_cancel_modal = false
            await this.loadBidProducts()
          } else {
            Alpine.store('notification').error(res.message || '取消失败')
          }
        } catch (e) {
          Alpine.store('notification').error('取消失败: ' + e.message)
        } finally {
          this.cancelling = false
        }
      },

      // ==================== C2C 拍卖方法 ====================

      /**
       * 加载 C2C 拍卖列表
       */
      async loadAuctionListings() {
        this.auction_loading = true
        this.auction_error = ''
        try {
          const params = {
            page: this.auction_pagination.page,
            page_size: this.auction_pagination.page_size
          }
          if (this.auction_filter_status) {
            params.status = this.auction_filter_status
          }
          const res = await AuctionAPI.getAuctionListings(params)
          if (res.success) {
            this.auction_listings = res.data?.auction_listings || []
            if (res.data?.pagination) {
              this.auction_pagination.total = res.data.pagination.total || 0
            }
            logger.info('[BidManagement] C2C 列表加载成功:', this.auction_listings.length)
          } else {
            this.auction_error = res.message || '加载失败'
          }
        } catch (e) {
          this.auction_error = e.message || '网络请求失败'
          logger.error('[BidManagement] C2C 列表加载异常:', e)
        } finally {
          this.auction_loading = false
        }
      },

      /**
       * C2C 状态筛选
       * @param {string} status - 状态值
       */
      async auctionFilterByStatus(status) {
        this.auction_filter_status = status
        this.auction_pagination.page = 1
        await this.loadAuctionListings()
      },

      /**
       * C2C 翻页
       * @param {number} page - 页码
       */
      async auctionGoToPage(page) {
        if (page < 1 || page > this.auctionTotalPages) return
        this.auction_pagination.page = page
        await this.loadAuctionListings()
      },

      // ========== C2C 详情 ==========

      /**
       * 查看 C2C 拍卖详情
       * @param {number} auction_listing_id - 拍卖挂牌 ID
       */
      async viewAuctionDetail(auction_listing_id) {
        this.show_auction_detail = true
        this.auction_detail_loading = true
        this.auction_detail = null
        this.auction_detail_bids = []
        try {
          const res = await AuctionAPI.getAuctionDetail(auction_listing_id)
          if (res.success) {
            this.auction_detail = res.data?.auction_listing || res.data
            this.auction_detail_bids = res.data?.top_bids || []
          }
        } catch (e) {
          Alpine.store('notification').error('加载拍卖详情失败: ' + e.message)
        } finally {
          this.auction_detail_loading = false
        }
      },

      // ========== C2C 手动结算 ==========

      /**
       * 管理员手动结算 C2C 拍卖
       * @param {number} auction_listing_id - 拍卖挂牌 ID
       */
      async auctionManualSettle(auction_listing_id) {
        const ok = await $confirm('确认手动结算此 C2C 拍卖？此操作不可撤销。')
        if (!ok) return
        try {
          const res = await AuctionAPI.settleAuction(auction_listing_id)
          if (res.success) {
            Alpine.store('notification').success('C2C 拍卖结算成功')
            await this.loadAuctionListings()
            if (this.show_auction_detail) await this.viewAuctionDetail(auction_listing_id)
          } else {
            Alpine.store('notification').error(res.message || '结算失败')
          }
        } catch (e) {
          Alpine.store('notification').error('结算失败: ' + e.message)
        }
      },

      // ========== C2C 取消 ==========

      /**
       * 打开 C2C 取消弹窗
       * @param {Object} auction - 拍卖对象
       */
      openAuctionCancelModal(auction) {
        this.auction_cancel_target = auction
        this.auction_cancel_reason = ''
        this.show_auction_cancel = true
      },

      /**
       * 提交 C2C 取消
       */
      async submitAuctionCancel() {
        if (!this.auction_cancel_reason.trim()) {
          Alpine.store('notification').warning('请输入取消原因')
          return
        }
        this.auction_cancelling = true
        try {
          const id = this.auction_cancel_target?.auction_listing_id
          const res = await AuctionAPI.cancelAuction(id, { reason: this.auction_cancel_reason })
          if (res.success) {
            Alpine.store('notification').success('C2C 拍卖已取消')
            this.show_auction_cancel = false
            await this.loadAuctionListings()
          } else {
            Alpine.store('notification').error(res.message || '取消失败')
          }
        } catch (e) {
          Alpine.store('notification').error('取消失败: ' + e.message)
        } finally {
          this.auction_cancelling = false
        }
      },

      // ==================== 共用工具方法 ====================

      /**
       * 获取状态显示信息
       * @param {string} status - 状态值
       * @returns {{ label: string, color: string }}
       */
      getStatusInfo(status) {
        return (
          BID_STATUS_MAP[status] || { label: status || '未知', color: 'bg-gray-100 text-gray-500' }
        )
      },

      /**
       * 判断是否可取消（pending/active 状态）
       * @param {Object} item - 竞价/拍卖对象
       * @returns {boolean}
       */
      canCancel(item) {
        if (!item) return false
        return ['pending', 'active'].includes(item.status)
      },

      /**
       * 判断是否可手动结算（ended/settlement_failed 状态）
       * @param {Object} item - 竞价/拍卖对象
       * @returns {boolean}
       */
      canSettle(item) {
        if (!item) return false
        return ['ended', 'settlement_failed'].includes(item.status)
      },

      /**
       * 格式化资产数额显示
       * @param {number} amount - 数额
       * @param {string} asset_code - 资产类型
       * @returns {string}
       */
      formatAssetAmount(amount, asset_code) {
        if (amount === null || amount === undefined) return '-'
        return `${Number(amount).toLocaleString()} ${asset_code || ''}`
      },

      /**
       * 获取 C2C 拍卖物品名称（从 item_snapshot 提取）
       * @param {Object} auction - 拍卖对象
       * @returns {string}
       */
      getAuctionItemName(auction) {
        if (!auction) return '-'
        const snap = auction.item_snapshot
        if (snap && typeof snap === 'object') {
          return snap.item_name || snap.name || '-'
        }
        return '-'
      }
    }
  })
})
