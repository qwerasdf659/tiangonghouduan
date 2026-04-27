/**
 * 交易订单查询服务（Trade Order Query Service）
 *
 * 职责：
 * - 订单域（Order Domain）只读查询服务
 * - 提供用户端和管理后台的订单查询、统计功能
 * - 从 TradeOrderService 拆分而来（2026-04-24）
 *
 * 方法清单：
 * - getOrderDetail(): 查询订单详情（用户端）
 * - getUserOrders(): 查询用户订单列表
 * - getOrders(): 管理后台订单列表（完整筛选）
 * - getOrderById(): 管理后台单个订单详情
 * - getOrderByBusinessId(): 根据业务ID查询订单
 * - getOrderStats(): 交易订单统计汇总
 * - getUserTradeStats(): 用户交易历史统计
 */

const BusinessError = require('../utils/BusinessError')
const { Op, fn, col } = require('sequelize')
const { sequelize, TradeOrder, MarketListing, Item, User } = require('../models')
const { attachDisplayNames, DICT_TYPES } = require('../utils/displayNameHelper')

// QUERY_METHODS_START

/**
 * 交易订单查询服务
 * @description 提供用户端和管理后台的订单查询、统计功能
 */
class TradeOrderQueryService {
  /**
   * 查询订单详情
   *
   * @param {number} trade_order_id - 订单ID
   * @returns {Promise<Object>} 订单详情
   */
  static async getOrderDetail(trade_order_id) {
    const order = await TradeOrder.findOne({
      where: { trade_order_id },
      include: [
        {
          model: MarketListing,
          as: 'listing',
          include: [{ model: Item, as: 'offerItem' }]
        }
      ]
    })
    if (!order) {
      throw new BusinessError(`订单不存在: ${trade_order_id}`, 'TRADE_NOT_FOUND', 404)
    }
    return order
  }

  // PLACEHOLDER_getUserOrders

  /**
   * 查询用户订单列表
   *
   * @param {Object} params - 查询参数
   * @param {number} params.user_id - 用户ID
   * @param {string} [params.role] - 角色类型（buyer/seller）
   * @param {string} [params.status] - 订单状态
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 订单列表
   */
  static async getUserOrders(params) {
    const { user_id, role, status, page = 1, page_size = 20 } = params
    const where = {}

    if (role === 'buyer') {
      where.buyer_user_id = user_id
    } else if (role === 'seller') {
      where.seller_user_id = user_id
    } else {
      where[sequelize.Sequelize.Op.or] = [{ buyer_user_id: user_id }, { seller_user_id: user_id }]
    }
    if (status) {
      where.status = status
    }

    const { count, rows } = await TradeOrder.findAndCountAll({
      where,
      include: [{ model: MarketListing, as: 'listing' }],
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset: (page - 1) * page_size
    })

    return { orders: rows, total: count, page, page_size }
  }

  // PLACEHOLDER_getOrders

  /**
   * 查询交易订单列表（管理后台用，支持完整筛选条件）
   *
   * @param {Object} options - 查询参数
   * @returns {Promise<Object>} 订单列表和分页信息
   */
  static async getOrders(options = {}) {
    const {
      buyer_user_id,
      seller_user_id,
      market_listing_id,
      merchant_id,
      status,
      asset_code,
      order_no,
      start_time,
      end_time,
      page = 1,
      page_size = 20
    } = options

    const where = {}
    if (buyer_user_id) where.buyer_user_id = buyer_user_id
    if (seller_user_id) where.seller_user_id = seller_user_id
    if (market_listing_id) where.market_listing_id = market_listing_id
    if (status) where.status = status
    if (asset_code) where.asset_code = asset_code
    if (order_no) where.order_no = { [Op.like]: `%${order_no}%` }

    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) where.created_at[Op.gte] = new Date(start_time)
      if (end_time) where.created_at[Op.lte] = new Date(end_time)
    }

    const offset = (page - 1) * page_size

    const listingInclude = {
      model: MarketListing,
      as: 'listing',
      attributes: [
        'market_listing_id',
        'listing_kind',
        'offer_item_id',
        'offer_asset_code',
        'offer_amount',
        'price_amount',
        'status'
      ]
    }

    // PLACEHOLDER_getOrders_merchant

    if (merchant_id) {
      listingInclude.required = true
      listingInclude.include = [
        {
          model: Item,
          as: 'offerItem',
          attributes: ['item_id', 'merchant_id'],
          where: { merchant_id },
          required: true
        }
      ]
    }

    const { count, rows } = await TradeOrder.findAndCountAll({
      where,
      include: [
        { model: User, as: 'buyer', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: User, as: 'seller', attributes: ['user_id', 'nickname', 'mobile'] },
        listingInclude
      ],
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset,
      distinct: true
    })

    // PLACEHOLDER_getOrders_display

    const ordersData = rows.map(row => row.get({ plain: true }))
    await attachDisplayNames(ordersData, [
      { field: 'status', dictType: DICT_TYPES.TRADE_ORDER_STATUS }
    ])
    for (const order of ordersData) {
      if (order.listing) {
        // eslint-disable-next-line no-await-in-loop -- 需要顺序处理每个订单的关联数据
        await attachDisplayNames(order.listing, [
          { field: 'status', dictType: DICT_TYPES.LISTING_STATUS }
        ])
      }
    }

    return {
      orders: ordersData,
      pagination: { total: count, page, page_size, total_pages: Math.ceil(count / page_size) }
    }
  }

  // PLACEHOLDER_getOrderById

  /**
   * 获取单个交易订单详情（管理后台用，包含中文显示名称）
   *
   * @param {number} trade_order_id - 订单ID
   * @returns {Promise<Object|null>} 订单详情或null
   */
  static async getOrderById(trade_order_id) {
    const order = await TradeOrder.findByPk(trade_order_id, {
      include: [
        { model: User, as: 'buyer', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: User, as: 'seller', attributes: ['user_id', 'nickname', 'mobile'] },
        {
          model: MarketListing,
          as: 'listing',
          attributes: [
            'market_listing_id',
            'listing_kind',
            'offer_item_id',
            'offer_asset_code',
            'offer_amount',
            'price_amount',
            'status',
            'created_at'
          ]
        }
      ]
    })

    // PLACEHOLDER_getOrderById_display

    if (!order) return null
    const orderData = order.get({ plain: true })
    await attachDisplayNames(orderData, [
      { field: 'status', dictType: DICT_TYPES.TRADE_ORDER_STATUS }
    ])
    if (orderData.listing) {
      await attachDisplayNames(orderData.listing, [
        { field: 'status', dictType: DICT_TYPES.LISTING_STATUS }
      ])
    }
    return orderData
  }

  // PLACEHOLDER_getOrderByBusinessId

  /**
   * 根据业务ID查询订单（管理后台用）
   *
   * @param {string} business_id - 业务唯一键
   * @returns {Promise<Object|null>} 订单详情或null
   */
  static async getOrderByBusinessId(business_id) {
    const order = await TradeOrder.findOne({
      where: { business_id },
      include: [
        { model: User, as: 'buyer', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: User, as: 'seller', attributes: ['user_id', 'nickname', 'mobile'] },
        {
          model: MarketListing,
          as: 'listing',
          attributes: [
            'market_listing_id',
            'listing_kind',
            'offer_item_id',
            'offer_asset_code',
            'offer_amount',
            'price_amount',
            'status'
          ]
        }
      ]
    })

    // PLACEHOLDER_getOrderByBusinessId_display

    if (!order) return null
    const orderData = order.get({ plain: true })
    await attachDisplayNames(orderData, [
      { field: 'status', dictType: DICT_TYPES.TRADE_ORDER_STATUS }
    ])
    if (orderData.listing) {
      await attachDisplayNames(orderData.listing, [
        { field: 'status', dictType: DICT_TYPES.LISTING_STATUS }
      ])
    }
    return orderData
  }

  // PLACEHOLDER_getOrderStats

  /**
   * 获取交易订单统计汇总（管理后台用）
   *
   * @param {Object} options - 查询参数
   * @returns {Promise<Object>} 统计汇总数据
   */
  static async getOrderStats(options = {}) {
    const { start_time, end_time, seller_user_id, buyer_user_id } = options
    const where = {}
    if (seller_user_id) where.seller_user_id = seller_user_id
    if (buyer_user_id) where.buyer_user_id = buyer_user_id
    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) where.created_at[Op.gte] = new Date(start_time)
      if (end_time) where.created_at[Op.lte] = new Date(end_time)
    }

    // PLACEHOLDER_getOrderStats_queries

    const statusStats = await TradeOrder.findAll({
      attributes: ['status', [fn('COUNT', col('trade_order_id')), 'count']],
      where,
      group: ['status'],
      raw: true
    })

    const amountStats = await TradeOrder.findOne({
      attributes: [
        [fn('COUNT', col('trade_order_id')), 'total_orders'],
        [fn('SUM', col('gross_amount')), 'total_gross_amount'],
        [fn('SUM', col('fee_amount')), 'total_fee_amount'],
        [fn('SUM', col('net_amount')), 'total_net_amount']
      ],
      where: { ...where, status: 'completed' },
      raw: true
    })

    // PLACEHOLDER_getOrderStats_display

    const byStatusWithDisplayNames = {}
    for (const item of statusStats) {
      const statusData = { status: item.status }
      // eslint-disable-next-line no-await-in-loop -- 需要顺序处理每个状态的显示名称
      await attachDisplayNames(statusData, [
        { field: 'status', dictType: DICT_TYPES.TRADE_ORDER_STATUS }
      ])
      byStatusWithDisplayNames[item.status] = {
        count: parseInt(item.count) || 0,
        display_name: statusData.status_display
      }
    }

    return {
      period: { start_time, end_time },
      by_status: byStatusWithDisplayNames,
      completed_summary: {
        total_orders: parseInt(amountStats?.total_orders) || 0,
        total_gross_amount: parseInt(amountStats?.total_gross_amount) || 0,
        total_fee_amount: parseInt(amountStats?.total_fee_amount) || 0,
        total_net_amount: parseInt(amountStats?.total_net_amount) || 0
      }
    }
  }

  // PLACEHOLDER_getUserTradeStats

  /**
   * 获取用户的交易历史统计（管理后台用）
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object>} 用户交易统计
   */
  static async getUserTradeStats(user_id) {
    const buyerStats = await TradeOrder.findOne({
      attributes: [
        [fn('COUNT', col('trade_order_id')), 'total_orders'],
        [fn('SUM', col('gross_amount')), 'total_spent']
      ],
      where: { buyer_user_id: user_id, status: 'completed' },
      raw: true
    })

    // PLACEHOLDER_getUserTradeStats_seller

    const sellerStats = await TradeOrder.findOne({
      attributes: [
        [fn('COUNT', col('trade_order_id')), 'total_orders'],
        [fn('SUM', col('net_amount')), 'total_earned']
      ],
      where: { seller_user_id: user_id, status: 'completed' },
      raw: true
    })

    return {
      user_id,
      as_buyer: {
        total_orders: parseInt(buyerStats?.total_orders) || 0,
        total_spent: parseInt(buyerStats?.total_spent) || 0
      },
      as_seller: {
        total_orders: parseInt(sellerStats?.total_orders) || 0,
        total_earned: parseInt(sellerStats?.total_earned) || 0
      }
    }
  }
}

module.exports = TradeOrderQueryService
