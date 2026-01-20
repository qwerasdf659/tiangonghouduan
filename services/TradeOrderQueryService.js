/**
 * @file 交易订单查询服务 - P2表只读查询API
 * @description 提供交易订单的只读查询功能
 *
 * 覆盖P2优先级表：
 * - trade_orders: 交易订单表
 *
 * 架构原则：
 * - 只读查询服务，不涉及写操作
 * - 所有方法均为查询方法，无需事务管理
 * - 严格遵循项目snake_case命名规范
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

'use strict'

const { Op } = require('sequelize')
const logger = require('../utils/logger').logger

/**
 * 交易订单查询服务
 * 提供trade_orders表的只读查询API
 */
class TradeOrderQueryService {
  /**
   * 构造函数
   * @param {Object} models - Sequelize模型集合
   */
  constructor(models) {
    this.models = models
    this.logger = logger
  }

  /**
   * 查询交易订单列表
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.buyer_user_id] - 买家用户ID
   * @param {number} [options.seller_user_id] - 卖家用户ID
   * @param {number} [options.listing_id] - 挂牌ID
   * @param {string} [options.status] - 订单状态（created/frozen/completed/cancelled/failed）
   * @param {string} [options.asset_code] - 结算资产代码
   * @param {string} [options.start_time] - 开始时间（ISO8601格式，北京时间）
   * @param {string} [options.end_time] - 结束时间（ISO8601格式，北京时间）
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 订单列表和分页信息
   */
  async getOrders(options = {}) {
    const {
      buyer_user_id,
      seller_user_id,
      listing_id,
      status,
      asset_code,
      start_time,
      end_time,
      page = 1,
      page_size = 20
    } = options

    const where = {}

    if (buyer_user_id) where.buyer_user_id = buyer_user_id
    if (seller_user_id) where.seller_user_id = seller_user_id
    if (listing_id) where.listing_id = listing_id
    if (status) where.status = status
    if (asset_code) where.asset_code = asset_code

    // 时间范围过滤
    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) where.created_at[Op.gte] = new Date(start_time)
      if (end_time) where.created_at[Op.lte] = new Date(end_time)
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await this.models.TradeOrder.findAndCountAll({
      where,
      include: [
        {
          model: this.models.User,
          as: 'buyer',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.User,
          as: 'seller',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.MarketListing,
          as: 'listing',
          attributes: [
            'listing_id',
            'listing_kind',
            'offer_item_instance_id',
            'offer_asset_code',
            'offer_amount',
            'price_amount',
            'status'
          ]
        }
      ],
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      orders: rows.map(row => row.get({ plain: true })),
      pagination: {
        total_count: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 获取单个交易订单详情
   *
   * @param {number} order_id - 订单ID
   * @returns {Promise<Object|null>} 订单详情或null
   */
  async getOrderById(order_id) {
    const order = await this.models.TradeOrder.findByPk(order_id, {
      include: [
        {
          model: this.models.User,
          as: 'buyer',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.User,
          as: 'seller',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.MarketListing,
          as: 'listing',
          attributes: [
            'listing_id',
            'listing_kind',
            'offer_item_instance_id',
            'offer_asset_code',
            'offer_amount',
            'price_amount',
            'status',
            'created_at'
          ]
        }
      ]
    })

    return order ? order.get({ plain: true }) : null
  }

  /**
   * 根据业务ID查询订单
   *
   * @param {string} business_id - 业务唯一键
   * @returns {Promise<Object|null>} 订单详情或null
   */
  async getOrderByBusinessId(business_id) {
    const order = await this.models.TradeOrder.findOne({
      where: { business_id },
      include: [
        {
          model: this.models.User,
          as: 'buyer',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.User,
          as: 'seller',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.MarketListing,
          as: 'listing',
          attributes: [
            'listing_id',
            'listing_kind',
            'offer_item_instance_id',
            'offer_asset_code',
            'offer_amount',
            'price_amount',
            'status'
          ]
        }
      ]
    })

    return order ? order.get({ plain: true }) : null
  }

  /**
   * 获取交易订单统计汇总
   *
   * @param {Object} options - 查询参数
   * @param {string} [options.start_time] - 开始时间
   * @param {string} [options.end_time] - 结束时间
   * @param {number} [options.seller_user_id] - 卖家用户ID（可选）
   * @param {number} [options.buyer_user_id] - 买家用户ID（可选）
   * @returns {Promise<Object>} 统计汇总数据
   */
  async getOrderStats(options = {}) {
    const { start_time, end_time, seller_user_id, buyer_user_id } = options
    const { fn, col } = require('sequelize')

    const where = {}
    if (seller_user_id) where.seller_user_id = seller_user_id
    if (buyer_user_id) where.buyer_user_id = buyer_user_id
    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) where.created_at[Op.gte] = new Date(start_time)
      if (end_time) where.created_at[Op.lte] = new Date(end_time)
    }

    // 按状态统计
    const statusStats = await this.models.TradeOrder.findAll({
      attributes: ['status', [fn('COUNT', col('order_id')), 'count']],
      where,
      group: ['status'],
      raw: true
    })

    // 金额汇总统计
    const amountStats = await this.models.TradeOrder.findOne({
      attributes: [
        [fn('COUNT', col('order_id')), 'total_orders'],
        [fn('SUM', col('gross_amount')), 'total_gross_amount'],
        [fn('SUM', col('fee_amount')), 'total_fee_amount'],
        [fn('SUM', col('net_amount')), 'total_net_amount']
      ],
      where: { ...where, status: 'completed' },
      raw: true
    })

    return {
      period: { start_time, end_time },
      by_status: statusStats.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count) || 0
        return acc
      }, {}),
      completed_summary: {
        total_orders: parseInt(amountStats?.total_orders) || 0,
        total_gross_amount: parseInt(amountStats?.total_gross_amount) || 0,
        total_fee_amount: parseInt(amountStats?.total_fee_amount) || 0,
        total_net_amount: parseInt(amountStats?.total_net_amount) || 0
      }
    }
  }

  /**
   * 获取用户的交易历史统计
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object>} 用户交易统计
   */
  async getUserTradeStats(user_id) {
    const { fn, col } = require('sequelize')

    // 作为买家的统计
    const buyerStats = await this.models.TradeOrder.findOne({
      attributes: [
        [fn('COUNT', col('order_id')), 'total_orders'],
        [fn('SUM', col('gross_amount')), 'total_spent']
      ],
      where: { buyer_user_id: user_id, status: 'completed' },
      raw: true
    })

    // 作为卖家的统计
    const sellerStats = await this.models.TradeOrder.findOne({
      attributes: [
        [fn('COUNT', col('order_id')), 'total_orders'],
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
