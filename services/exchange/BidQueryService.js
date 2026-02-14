/**
 * 竞价查询服务 - BidQueryService
 * 臻选空间/幸运空间竞价功能查询层
 *
 * 职责范围：只读查询操作
 * - getBidProducts(): 获取竞价商品列表
 * - getBidProductDetail(): 获取竞价商品详情
 * - getUserBidHistory(): 获取用户竞价记录
 *
 * 设计原则：
 * - 查询操作不需要事务
 * - 使用统一视图常量控制返回字段
 * - 通过 ServiceManager 获取，不直接 require models
 *
 * @module services/exchange/BidQueryService
 * @created 2026-02-16（臻选空间/幸运空间/竞价功能）
 */

const logger = require('../../utils/logger').logger

/**
 * 🎯 竞价数据视图常量
 */
const BID_ATTRIBUTES = {
  /** 竞价商品列表视图（用户端） */
  bidProductListView: [
    'bid_product_id',
    'exchange_item_id',
    'price_asset_code',
    'start_price',
    'current_price',
    'min_bid_increment',
    'bid_count',
    'start_time',
    'end_time',
    'status'
  ],

  /** 竞价商品详情视图 */
  bidProductDetailView: [
    'bid_product_id',
    'exchange_item_id',
    'price_asset_code',
    'start_price',
    'current_price',
    'min_bid_increment',
    'bid_count',
    'start_time',
    'end_time',
    'status',
    'winner_user_id',
    'batch_no',
    'created_at',
    'updated_at'
  ],

  /** 关联的兑换商品视图 */
  exchangeItemBriefView: [
    'exchange_item_id',
    'item_name',
    'description',
    'category',
    'primary_image_id'
  ],

  /** 出价记录视图 */
  bidRecordView: [
    'bid_record_id',
    'bid_product_id',
    'user_id',
    'bid_amount',
    'previous_highest',
    'is_winning',
    'is_final_winner',
    'created_at'
  ]
}

/**
 * 竞价查询服务类
 *
 * @class BidQueryService
 */
class BidQueryService {
  /**
   * @param {Object} models - Sequelize 模型对象
   */
  constructor(models) {
    this.models = models
    this.BidProduct = models.BidProduct
    this.BidRecord = models.BidRecord
    this.ExchangeItem = models.ExchangeItem
    this.ImageResources = models.ImageResources
    this.sequelize = models.sequelize
  }

  /**
   * 获取竞价商品列表
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.status='active'] - 竞价状态筛选
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=10] - 每页数量
   * @param {number} options.user_id - 当前用户ID（用于附加个人出价信息）
   * @returns {Promise<Object>} 竞价商品列表和分页信息
   */
  async getBidProducts(options = {}) {
    const { status = 'active', page = 1, page_size = 10, user_id } = options

    try {
      logger.info('[竞价查询] 获取竞价商品列表', { status, page, page_size, user_id })

      const where = {}
      if (status !== 'all') {
        where.status = status
      }

      const offset = (page - 1) * page_size

      const { count, rows } = await this.BidProduct.findAndCountAll({
        where,
        attributes: BID_ATTRIBUTES.bidProductListView,
        include: [
          {
            model: this.ExchangeItem,
            as: 'exchangeItem',
            attributes: BID_ATTRIBUTES.exchangeItemBriefView,
            include: [
              {
                model: this.ImageResources,
                as: 'primaryImage',
                attributes: ['image_resource_id', 'file_path', 'mime_type', 'thumbnail_paths'],
                required: false
              }
            ]
          }
        ],
        limit: page_size,
        offset,
        order: [['created_at', 'DESC']]
      })

      // 附加当前用户的出价信息（my_highest_bid, is_my_winning）
      const bidProducts = await Promise.all(
        rows.map(async bp => {
          const item = bp.toJSON()

          if (user_id) {
            // 查询当前用户在此竞价中的最高出价
            const myBid = await this.BidRecord.findOne({
              where: { bid_product_id: bp.bid_product_id, user_id },
              attributes: ['bid_amount', 'is_winning'],
              order: [['bid_amount', 'DESC']]
            })

            item.my_highest_bid = myBid ? Number(myBid.bid_amount) : null
            item.is_my_winning = myBid ? myBid.is_winning : false
          } else {
            item.my_highest_bid = null
            item.is_my_winning = false
          }

          return item
        })
      )

      logger.info(`[竞价查询] 找到 ${count} 个竞价商品`, { page, returned: rows.length })

      return {
        bid_products: bidProducts,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error('[竞价查询] 获取竞价商品列表失败:', error.message)
      throw error
    }
  }

  /**
   * 获取竞价商品详情
   *
   * @param {number} bidProductId - 竞价商品ID
   * @param {Object} options - 选项
   * @param {number} options.user_id - 当前用户ID
   * @returns {Promise<Object>} 竞价商品详情
   */
  async getBidProductDetail(bidProductId, options = {}) {
    const { user_id } = options

    try {
      logger.info('[竞价查询] 获取竞价商品详情', { bid_product_id: bidProductId, user_id })

      const bidProduct = await this.BidProduct.findByPk(bidProductId, {
        attributes: BID_ATTRIBUTES.bidProductDetailView,
        include: [
          {
            model: this.ExchangeItem,
            as: 'exchangeItem',
            attributes: BID_ATTRIBUTES.exchangeItemBriefView,
            include: [
              {
                model: this.ImageResources,
                as: 'primaryImage',
                attributes: ['image_resource_id', 'file_path', 'mime_type', 'thumbnail_paths'],
                required: false
              }
            ]
          }
        ]
      })

      if (!bidProduct) {
        const notFoundError = new Error('竞价商品不存在')
        notFoundError.statusCode = 404
        notFoundError.errorCode = 'BID_PRODUCT_NOT_FOUND'
        throw notFoundError
      }

      const result = bidProduct.toJSON()

      // 附加当前用户出价信息
      if (user_id) {
        const myBids = await this.BidRecord.findAll({
          where: { bid_product_id: bidProductId, user_id },
          attributes: BID_ATTRIBUTES.bidRecordView,
          order: [['bid_amount', 'DESC']],
          limit: 10
        })
        result.my_bids = myBids.map(b => b.toJSON())
        result.my_highest_bid = myBids.length > 0 ? Number(myBids[0].bid_amount) : null
        result.is_my_winning = myBids.length > 0 ? myBids[0].is_winning : false
      }

      // Top N 出价排行（不暴露具体用户ID，仅显示排名和金额）
      const topBids = await this.BidRecord.findAll({
        where: { bid_product_id: bidProductId },
        attributes: ['bid_record_id', 'bid_amount', 'is_winning', 'created_at'],
        order: [['bid_amount', 'DESC']],
        limit: 10
      })
      result.top_bids = topBids.map((b, index) => ({
        rank: index + 1,
        bid_amount: Number(b.bid_amount),
        is_winning: b.is_winning,
        created_at: b.created_at
      }))

      return result
    } catch (error) {
      logger.error(`[竞价查询] 获取竞价详情失败(id:${bidProductId}):`, error.message)
      throw error
    }
  }

  /**
   * 获取用户竞价历史记录
   *
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @param {string} [options.status='all'] - 状态筛选
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=10] - 每页数量
   * @returns {Promise<Object>} 用户竞价记录和分页信息
   */
  async getUserBidHistory(userId, options = {}) {
    const { status = 'all', page = 1, page_size = 10 } = options

    try {
      logger.info('[竞价查询] 获取用户竞价历史', { user_id: userId, status, page })

      const where = { user_id: userId }

      // 状态筛选
      if (status === 'winning') {
        where.is_winning = true
      } else if (status === 'outbid') {
        where.is_winning = false
      }

      const offset = (page - 1) * page_size

      const { count, rows } = await this.BidRecord.findAndCountAll({
        where,
        attributes: BID_ATTRIBUTES.bidRecordView,
        include: [
          {
            model: this.BidProduct,
            as: 'bidProduct',
            attributes: [
              'bid_product_id',
              'status',
              'current_price',
              'price_asset_code',
              'end_time'
            ],
            include: [
              {
                model: this.ExchangeItem,
                as: 'exchangeItem',
                attributes: ['exchange_item_id', 'item_name', 'primary_image_id']
              }
            ]
          }
        ],
        limit: page_size,
        offset,
        order: [['created_at', 'DESC']]
      })

      logger.info(`[竞价查询] 用户 ${userId} 共 ${count} 条出价记录`)

      return {
        bid_records: rows.map(r => r.toJSON()),
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error(`[竞价查询] 获取用户竞价历史失败(user:${userId}):`, error.message)
      throw error
    }
  }
}

module.exports = BidQueryService
