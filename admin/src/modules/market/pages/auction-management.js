/**
 * C2C 拍卖管理页面 - Alpine.js 组件
 *
 * @file admin/src/modules/market/pages/auction-management.js
 * @description C2C用户间竞拍管理：列表、详情、强制取消、手动结算
 * @version 1.0.0
 * @date 2026-03-24
 *
 * @requires Alpine.js
 * @requires createPageMixin - 页面基础功能混入
 * @requires AuctionAPI - C2C拍卖管理API调用方法
 *
 * 后端路由：/api/v4/marketplace/auctions（查询） + /api/v4/console/bids（管理操作）
 * 状态机：pending → active → ended → settled / no_bid / settlement_failed / cancelled
 *
 * 直接使用后端字段名：auction_listing_id、seller_user_id、item_snapshot 等
 */

import { logger, $confirm } from '../../../utils/index.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { AuctionAPI } from '../../../api/market/auction.js'

/**
 * C2C拍卖状态中文映射（复用 BidProduct 7态状态机）
 */
const AUCTION_STATUS_MAP = {
  pending: { label: '待开始', color: 'bg-gray-100 text-gray-700' },
  active: { label: '进行中', color: 'bg-green-100 text-green-700' },
  ended: { label: '已结束', color: 'bg-blue-100 text-blue-700' },
  settled: { label: '已结算', color: 'bg-purple-100 text-purple-700' },
  no_bid: { label: '流拍', color: 'bg-yellow-100 text-yellow-700' },
  settlement_failed: { label: '结算失败', color: 'bg-red-100 text-red-700' },
  cancelled: { label: '已取消', color: 'bg-gray-200 text-gray-500' }
}

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '进行中' },
  { value: 'pending', label: '待开始' },
  { value: 'ended', label: '已结束' },
  { value: 'settled', label: '已结算' },
  { value: 'no_bid', label: '流拍' },
  { value: 'settlement_failed', label: '结算失败' },
  { value: 'cancelled', label: '已取消' }
]

Alpine.data('auctionManagementPage', () => ({
  ...createPageMixin({
    moduleName: 'auction-management',
    pageTitle: 'C2C拍卖管理'
  }),

  // 列表数据
  auction_listings: [],
  statusOptions: STATUS_OPTIONS,

  // 分页（与 bid-management.js 保持一致的命名）
  pagination: {
    page: 1,
    page_size: 20,
    total: 0
  },

  /** 计算总页数 */
  get totalPages() {
    return Math.ceil(this.pagination.total / this.pagination.page_size) || 1
  },
  get hasPrevPage() {
    return this.pagination.page > 1
  },
  get hasNextPage() {
    return this.pagination.page < this.totalPages
  },

  // 筛选条件
  filters: {
    status: '',
    price_asset_code: ''
  },

  // 详情
  showDetail: false,
  currentAuction: null,
  topBids: [],

  // 取消弹窗
  showCancelModal: false,
  cancelTarget: null,
  cancelReason: '',

  // 统计（从列表数据汇总）
  stats: {
    active_count: 0,
    settled_count: 0,
    failed_count: 0
  },

  async init() {
    logger.info('[C2C拍卖管理] 页面初始化')
    await this.loadAuctionListings()
  },

  /**
   * 加载C2C拍卖列表
   */
  async loadAuctionListings() {
    this.loading = true
    try {
      const params = {
        page: this.pagination.page,
        page_size: this.pagination.page_size,
        sort_by: 'created_at',
        sort_order: 'DESC'
      }
      if (this.filters.status) params.status = this.filters.status
      if (this.filters.price_asset_code) params.price_asset_code = this.filters.price_asset_code

      const res = await AuctionAPI.getAuctionListings(params)
      if (res.success) {
        this.auction_listings = res.data.auction_listings || []
        this.pagination.total = res.data.pagination?.total || 0

        // 更新统计
        this.stats.active_count = this.auction_listings.filter(a => a.status === 'active').length
        this.stats.settled_count = this.auction_listings.filter(a => a.status === 'settled').length
        this.stats.failed_count = this.auction_listings.filter(
          a => a.status === 'settlement_failed'
        ).length

        logger.info('[C2C拍卖管理] 列表加载成功', { count: this.auction_listings.length })
      } else {
        Alpine.store('notification').error(res.message || '加载失败')
      }
    } catch (error) {
      logger.error('[C2C拍卖管理] 列表加载异常', error)
      Alpine.store('notification').error('加载拍卖列表失败: ' + error.message)
    } finally {
      this.loading = false
    }
  },

  /**
   * 筛选条件变化时重新加载
   */
  async onFilterChange() {
    this.pagination.page = 1
    await this.loadAuctionListings()
  },

  /**
   * 查看拍卖详情
   * @param {number} auctionListingId - 拍卖ID
   */
  async viewDetail(auctionListingId) {
    try {
      const res = await AuctionAPI.getAuctionDetail(auctionListingId)
      if (res.success) {
        this.currentAuction = res.data
        this.topBids = res.data.top_bids || []
        this.showDetail = true
      } else {
        Alpine.store('notification').error(res.message || '获取详情失败')
      }
    } catch (error) {
      Alpine.store('notification').error('获取拍卖详情失败: ' + error.message)
    }
  },

  /**
   * 关闭详情面板
   */
  closeDetail() {
    this.showDetail = false
    this.currentAuction = null
    this.topBids = []
  },

  /**
   * 打开取消确认弹窗
   * @param {Object} auction - 拍卖对象
   */
  openCancelModal(auction) {
    this.cancelTarget = auction
    this.cancelReason = ''
    this.showCancelModal = true
  },

  /**
   * 确认强制取消拍卖
   */
  async submitCancel() {
    if (!this.cancelReason.trim()) {
      Alpine.store('notification').warning('请填写取消原因')
      return
    }

    const confirmed = await $confirm(
      `确认强制取消拍卖 #${this.cancelTarget.auction_listing_id}？\n所有出价者的冻结资产将被解冻，物品将归还卖方。`
    )
    if (!confirmed) return

    try {
      const res = await AuctionAPI.cancelAuction(this.cancelTarget.auction_listing_id, {
        reason: this.cancelReason.trim()
      })
      if (res.success) {
        Alpine.store('notification').success('拍卖已取消')
        this.showCancelModal = false
        await this.loadAuctionListings()
      } else {
        Alpine.store('notification').error(res.message || '取消失败')
      }
    } catch (error) {
      Alpine.store('notification').error('取消拍卖失败: ' + error.message)
    }
  },

  /**
   * 手动结算拍卖（处理 settlement_failed）
   * @param {number} auctionListingId - 拍卖ID
   */
  async manualSettle(auctionListingId) {
    const confirmed = await $confirm(`确认手动结算拍卖 #${auctionListingId}？`)
    if (!confirmed) return

    try {
      const res = await AuctionAPI.settleAuction(auctionListingId)
      if (res.success) {
        Alpine.store('notification').success('结算成功')
        await this.loadAuctionListings()
      } else {
        Alpine.store('notification').error(res.message || '结算失败')
      }
    } catch (error) {
      Alpine.store('notification').error('手动结算失败: ' + error.message)
    }
  },

  /**
   * 分页跳转
   * @param {number} page - 目标页码
   */
  async goToPage(page) {
    if (page < 1 || page > this.totalPages) return
    this.pagination.page = page
    await this.loadAuctionListings()
  },

  // ==================== 工具方法 ====================

  /**
   * 获取状态标签和颜色
   * @param {string} status - 状态值
   * @returns {Object} { label, color }
   */
  getStatusInfo(status) {
    return AUCTION_STATUS_MAP[status] || { label: status, color: 'bg-gray-100 text-gray-500' }
  },

  /**
   * 格式化物品快照名称
   * @param {Object|null} snapshot - item_snapshot JSON
   * @returns {string} 物品名称
   */
  getItemName(snapshot) {
    if (!snapshot) return '未知物品'
    return snapshot.item_name || '未知物品'
  },

  /**
   * 格式化资产数量显示
   * @param {number} amount - 数量
   * @param {string} assetCode - 资产类型
   * @returns {string} 格式化显示
   */
  formatAssetAmount(amount, assetCode) {
    if (amount == null) return '-'
    return `${Number(amount).toLocaleString()} ${assetCode || ''}`
  }
}))
