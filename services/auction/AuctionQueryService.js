/**
 * C2C 拍卖查询服务 - AuctionQueryService
 * 用户间竞拍功能查询逻辑（读操作，无需事务）
 *
 * 职责范围：
 * - getAuctionListings(): 浏览拍卖列表（支持分页、筛选）
 * - getAuctionDetail(): 拍卖详情（含出价排行、卖方信息、物品快照）
 * - getUserAuctions(): 卖方视角——我发起的拍卖列表
 * - getUserBidHistory(): 买方视角——我的出价记录
 *
 * 参考 BidQueryService 模式，换底表为 auction_listings / auction_bids
 *
 * @module services/auction/AuctionQueryService
 * @created 2026-03-24（C2C用户间竞拍功能）
 * @see docs/C2C竞拍方案.md §6.2
 */

'use strict'

/**
 * 拍卖列表视图常量（控制返回字段，避免过度暴露）
 */
const AUCTION_ATTRIBUTES = {
  /** 列表页展示字段 */
  listingListView: [
    'auction_listing_id',
    'seller_user_id',
    'item_id',
    'price_asset_code',
    'start_price',
    'current_price',
    'min_bid_increment',
    'buyout_price',
    'start_time',
    'end_time',
    'status',
    'fee_rate',
    'bid_count',
    'unique_bidders',
    'item_snapshot',
    'created_at'
  ],

  /** 详情页展示字段 */
  listingDetailView: [
    'auction_listing_id',
    'seller_user_id',
    'item_id',
    'price_asset_code',
    'start_price',
    'current_price',
    'min_bid_increment',
    'buyout_price',
    'start_time',
    'end_time',
    'winner_user_id',
    'winner_bid_id',
    'status',
    'fee_rate',
    'gross_amount',
    'fee_amount',
    'net_amount',
    'bid_count',
    'unique_bidders',
    'item_snapshot',
    'retry_count',
    'created_at',
    'updated_at'
  ],

  /** 出价记录视图 */
  bidRecordView: [
    'auction_bid_id',
    'auction_listing_id',
    'user_id',
    'bid_amount',
    'previous_highest',
    'is_winning',
    'is_final_winner',
    'created_at'
  ],

  /** 卖方简要信息 */
  sellerBriefView: ['user_id', 'nickname', 'avatar_url']
}

/**
 * C2C 拍卖查询服务 — 拍卖列表浏览、详情获取、出价历史查询
 */
class AuctionQueryService {
  /**
   * @param {Object} models - Sequelize 模型对象
   */
  constructor(models) {
    this.models = models
    this.AuctionListing = models.AuctionListing
    this.AuctionBid = models.AuctionBid
    this.User = models.User
    this.Item = models.Item
    this.sequelize = models.sequelize
  }

  /**
   * 浏览拍卖列表
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.status] - 状态筛选
   * @param {string} [options.price_asset_code] - 资产类型筛选
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.sort_by='end_time'] - 排序字段
   * @param {string} [options.sort_order='ASC'] - 排序方向
   * @returns {Promise<{ auction_listings: Object[], pagination: Object }>} 拍卖列表及分页信息
   */
  async getAuctionListings(options = {}) {
    const {
      status,
      price_asset_code,
      page: rawPage = 1,
      page_size: rawPageSize = 20,
      sort_by = 'end_time',
      sort_order = 'ASC'
    } = options

    const page = parseInt(rawPage, 10) || 1
    const page_size = parseInt(rawPageSize, 10) || 20

    const where = {}
    if (status) {
      where.status = status
    }
    if (price_asset_code) {
      where.price_asset_code = price_asset_code
    }

    const allowedSortFields = ['end_time', 'start_time', 'current_price', 'bid_count', 'created_at']
    const orderField = allowedSortFields.includes(sort_by) ? sort_by : 'end_time'
    const orderDir = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'

    const offset = (page - 1) * page_size

    const { rows, count } = await this.AuctionListing.findAndCountAll({
      where,
      attributes: AUCTION_ATTRIBUTES.listingListView,
      include: [
        {
          model: this.User,
          as: 'seller',
          attributes: AUCTION_ATTRIBUTES.sellerBriefView
        }
      ],
      order: [[orderField, orderDir]],
      limit: page_size,
      offset
    })

    return {
      auction_listings: rows,
      pagination: {
        page,
        page_size,
        total: count,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 拍卖详情
   *
   * @param {number} auctionListingId - 拍卖ID
   * @param {Object} [options] - 查询选项
   * @param {number} [options.user_id] - 当前用户ID（用于标记 my_bids）
   * @returns {Promise<Object>} 拍卖详情
   */
  async getAuctionDetail(auctionListingId, options = {}) {
    const { user_id } = options

    const auctionListing = await this.AuctionListing.findByPk(auctionListingId, {
      attributes: AUCTION_ATTRIBUTES.listingDetailView,
      include: [
        {
          model: this.User,
          as: 'seller',
          attributes: AUCTION_ATTRIBUTES.sellerBriefView
        },
        {
          model: this.User,
          as: 'winner',
          attributes: AUCTION_ATTRIBUTES.sellerBriefView,
          required: false
        }
      ]
    })

    if (!auctionListing) {
      return null
    }

    // 出价排行（前10名）
    const topBids = await this.AuctionBid.findAll({
      where: { auction_listing_id: auctionListingId },
      attributes: AUCTION_ATTRIBUTES.bidRecordView,
      include: [
        {
          model: this.User,
          as: 'bidder',
          attributes: AUCTION_ATTRIBUTES.sellerBriefView
        }
      ],
      order: [['bid_amount', 'DESC']],
      limit: 10
    })

    // 当前用户的出价记录
    let myBids = []
    if (user_id) {
      myBids = await this.AuctionBid.findAll({
        where: {
          auction_listing_id: auctionListingId,
          user_id
        },
        attributes: AUCTION_ATTRIBUTES.bidRecordView,
        order: [['bid_amount', 'DESC']]
      })
    }

    return {
      ...auctionListing.toJSON(),
      top_bids: topBids,
      my_bids: myBids
    }
  }

  /**
   * 卖方视角——我发起的拍卖列表
   *
   * @param {number} userId - 卖方用户ID
   * @param {Object} [options] - 查询选项
   * @param {string} [options.status] - 状态筛选
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<{ auction_listings: Object[], pagination: Object }>} 卖方拍卖列表及分页信息
   */
  async getUserAuctions(userId, options = {}) {
    const { status, page: rawPage = 1, page_size: rawPageSize = 20 } = options

    const page = parseInt(rawPage, 10) || 1
    const page_size = parseInt(rawPageSize, 10) || 20

    const where = { seller_user_id: userId }
    if (status) {
      where.status = status
    }

    const offset = (page - 1) * page_size

    const { rows, count } = await this.AuctionListing.findAndCountAll({
      where,
      attributes: AUCTION_ATTRIBUTES.listingListView,
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      auction_listings: rows,
      pagination: {
        page,
        page_size,
        total: count,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 买方视角——我的出价记录
   *
   * @param {number} userId - 出价用户ID
   * @param {Object} [options] - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<{ auction_bids: Object[], pagination: Object }>} 出价记录及分页信息
   */
  async getUserBidHistory(userId, options = {}) {
    const { page: rawPage = 1, page_size: rawPageSize = 20 } = options

    const page = parseInt(rawPage, 10) || 1
    const page_size = parseInt(rawPageSize, 10) || 20

    const offset = (page - 1) * page_size

    const { rows, count } = await this.AuctionBid.findAndCountAll({
      where: { user_id: userId },
      attributes: AUCTION_ATTRIBUTES.bidRecordView,
      include: [
        {
          model: this.AuctionListing,
          as: 'auctionListing',
          attributes: [
            'auction_listing_id',
            'seller_user_id',
            'price_asset_code',
            'start_price',
            'current_price',
            'status',
            'item_snapshot',
            'start_time',
            'end_time'
          ]
        }
      ],
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      auction_bids: rows,
      pagination: {
        page,
        page_size,
        total: count,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 管理后台拍卖列表（支持 type 参数区分 B2C/C2C）
   *
   * @param {Object} [options] - 查询选项
   * @param {string} [options.status] - 状态筛选
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<{ auction_listings: Object[], pagination: Object }>} 管理后台拍卖列表及分页信息
   */
  async getAdminAuctionListings(options = {}) {
    const { status, page: rawPage = 1, page_size: rawPageSize = 20 } = options

    const page = parseInt(rawPage, 10) || 1
    const page_size = parseInt(rawPageSize, 10) || 20

    const where = {}
    if (status) {
      where.status = status
    }

    const offset = (page - 1) * page_size

    const { rows, count } = await this.AuctionListing.findAndCountAll({
      where,
      attributes: AUCTION_ATTRIBUTES.listingDetailView,
      include: [
        {
          model: this.User,
          as: 'seller',
          attributes: AUCTION_ATTRIBUTES.sellerBriefView
        },
        {
          model: this.User,
          as: 'winner',
          attributes: AUCTION_ATTRIBUTES.sellerBriefView,
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      auction_listings: rows,
      pagination: {
        page,
        page_size,
        total: count,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }
}

module.exports = AuctionQueryService
