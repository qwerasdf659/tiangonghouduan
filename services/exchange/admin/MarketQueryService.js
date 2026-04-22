'use strict'

/**
 * 兑换市场管理 - 市场查询/统计服务
 *
 * 职责范围：
 * - getUserListingStats(): 获取用户上架统计
 * - getUserListings(): 查询指定用户的上架商品列表
 * - updateUserListingLimit(): 更新用户个性化上架数量限制
 * - checkTimeoutAndAlert(): 检查超时订单并告警
 * - getAdminMarketItems(): 管理后台获取商品列表
 * - getMarketItemStatistics(): 获取商品统计数据
 * - getExchangeTopline(): B2C 兑换商城顶线数据
 * - getItemDashboard(): 获取单品维度统计数据
 * - getSpaceDistribution(): 获取空间分布统计
 *
 * @module services/exchange/admin/MarketQueryService
 */

const logger = require('../../../utils/logger').logger
const displayNameHelper = require('../../../utils/displayNameHelper')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { assertAndGetTransaction } = require('../../../utils/transactionHelpers')
const { Op, fn, col, where: sqlWhere, literal, QueryTypes } = require('sequelize')
const AdminSystemService = require('../../AdminSystemService')

class MarketQueryService {
  constructor(models) {
    this.models = models
    this.ExchangeRecord = models.ExchangeRecord
    this.User = models.User
    this.MarketListing = models.MarketListing
    this.Item = models.Item
    this.ExchangeItem = models.ExchangeItem
    this.sequelize = models.sequelize
  }

  /**
   * 获取用户上架统计（管理员专用）
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.filter='all'] - 筛选条件：all/near_limit/at_limit
   * @param {number} options.max_listings - 最大上架数量限制
   * @returns {Promise<Object>} 用户上架统计结果
   */
  async getUserListingStats(options) {
    try {
      const {
        page = 1,
        page_size: listing_stats_page_size = 20,
        filter = 'all',
        max_listings = 3,
        mobile,
        merchant_id
      } = options

      const pageSize = Math.min(Math.max(parseInt(listing_stats_page_size, 10) || 20, 1), 100)

      logger.info('[兑换市场] 管理员获取用户上架统计', {
        page,
        page_size: pageSize,
        filter,
        max_listings,
        mobile
      })

      let mobileFilterUserIds = null
      if (mobile && mobile.trim()) {
        const matchedUsers = await this.User.findAll({
          where: { mobile: { [Op.like]: `%${mobile.trim()}%` } },
          attributes: ['user_id'],
          raw: true
        })
        mobileFilterUserIds = matchedUsers.map(u => u.user_id)

        if (mobileFilterUserIds.length === 0) {
          return {
            stats: [],
            pagination: { page, page_size: pageSize, total: 0, total_pages: 0 },
            summary: {
              total_users_with_listings: 0,
              users_at_limit: 0,
              users_near_limit: 0,
              total_listings: 0
            }
          }
        }
      }

      const listingWhere = { status: 'on_sale' }
      if (mobileFilterUserIds) {
        listingWhere.seller_user_id = mobileFilterUserIds
      }

      const listingQueryOptions = {
        where: listingWhere,
        attributes: [
          'seller_user_id',
          [
            this.sequelize.fn(
              'COUNT',
              this.sequelize.col(`${this.MarketListing.name}.market_listing_id`)
            ),
            'count'
          ]
        ],
        group: ['seller_user_id'],
        raw: true
      }

      if (merchant_id) {
        listingQueryOptions.include = [
          {
            model: this.models.Item,
            as: 'offerItem',
            attributes: [],
            where: { merchant_id },
            required: true
          }
        ]
      }

      const listingCounts = await this.MarketListing.findAll(listingQueryOptions)

      const allUserIds = listingCounts.map(item => item.seller_user_id)
      const allUsers =
        allUserIds.length > 0
          ? await this.User.findAll({
              where: { user_id: allUserIds },
              attributes: ['user_id', 'mobile', 'nickname', 'status', 'max_active_listings'],
              raw: true
            })
          : []
      const userMap = new Map(allUsers.map(u => [u.user_id, u]))

      const enrichedCounts = listingCounts.map(item => {
        const user = userMap.get(item.seller_user_id)
        const userLimit = user?.max_active_listings ?? max_listings
        const count = parseInt(item.count)
        return { ...item, count, user_limit: userLimit }
      })

      let filteredItems = []
      if (filter === 'at_limit') {
        filteredItems = enrichedCounts.filter(item => item.count >= item.user_limit)
      } else if (filter === 'near_limit') {
        filteredItems = enrichedCounts.filter(item => {
          return item.count >= item.user_limit * 0.8 && item.count < item.user_limit
        })
      } else {
        filteredItems = enrichedCounts
      }

      const total = filteredItems.length
      const offset = (page - 1) * pageSize
      const paginatedItems = filteredItems.slice(offset, offset + pageSize)

      const stats = paginatedItems.map(item => {
        const user = userMap.get(item.seller_user_id)
        const userLimit = item.user_limit
        return {
          user_id: item.seller_user_id,
          mobile: user?.mobile || '',
          nickname: user?.nickname || '',
          status: user?.status || '',
          listing_count: item.count,
          max_active_listings: userLimit,
          is_custom_limit:
            user?.max_active_listings !== null && user?.max_active_listings !== undefined,
          remaining_quota: Math.max(0, userLimit - item.count),
          is_at_limit: item.count >= userLimit
        }
      })

      const summary = {
        total_users_with_listings: listingCounts.length,
        users_at_limit: enrichedCounts.filter(item => item.count >= item.user_limit).length,
        users_near_limit: enrichedCounts.filter(item => {
          return item.count >= item.user_limit * 0.8 && item.count < item.user_limit
        }).length,
        total_listings: enrichedCounts.reduce((sum, item) => sum + item.count, 0)
      }

      const result = {
        stats,
        pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
        summary
      }

      logger.info('[兑换市场] 用户上架统计查询成功', {
        total_users: result.summary.total_users_with_listings,
        filtered_count: result.pagination.total,
        mobile_filter: mobile || null
      })

      return result
    } catch (error) {
      logger.error('[兑换市场] 获取用户上架统计失败:', {
        error: error.message,
        stack: error.stack,
        options
      })
      throw error
    }
  }

  /**
   * 查询指定用户的上架商品列表（管理员操作）
   *
   * @param {Object} options - 查询选项
   * @param {number} options.user_id - 用户ID
   * @param {string} [options.status] - 挂牌状态筛选
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 用户挂牌列表和用户信息
   */
  async getUserListings(options) {
    try {
      const {
        user_id,
        status,
        page = 1,
        page_size = 20,
        quality_grade,
        sort_by,
        sort_order = 'desc'
      } = options

      if (!user_id) throw new Error('user_id 是必填参数')

      logger.info('[兑换市场] 管理员查询用户上架列表', {
        user_id, status, page, page_size, quality_grade, sort_by, sort_order
      })

      const user = await this.User.findByPk(user_id, {
        attributes: ['user_id', 'mobile', 'nickname', 'status', 'max_active_listings']
      })
      if (!user) throw new Error(`用户不存在: ${user_id}`)

      const where = { seller_user_id: user_id }
      if (status) where.status = status

      const needItemJoin = !!quality_grade || String(sort_by || '') === 'quality_score'
      const include = []
      if (this.Item && needItemJoin) {
        const itemInclude = {
          model: this.Item,
          as: 'offerItem',
          required: !!quality_grade
        }
        if (quality_grade) {
          where.listing_kind = 'item'
          itemInclude.where = sqlWhere(
            fn(
              'JSON_UNQUOTE',
              fn('JSON_EXTRACT', col('offerItem.instance_attributes'), literal(`'$.quality_grade'`))
            ),
            quality_grade
          )
        }
        include.push(itemInclude)
      }

      let order = [['created_at', 'DESC']]
      if (sort_by === 'quality_score' && this.Item) {
        const dir = String(sort_order).toLowerCase() === 'asc' ? 'ASC' : 'DESC'
        order = [
          [
            literal(
              `CAST(JSON_UNQUOTE(JSON_EXTRACT(\`offerItem\`.\`instance_attributes\`, '$.quality_score')) AS DECIMAL(18,6))`
            ),
            dir
          ],
          ['created_at', 'DESC']
        ]
      }

      const { count, rows } = await this.MarketListing.findAndCountAll({
        where,
        include: include.length ? include : undefined,
        subQuery: false,
        order,
        limit: parseInt(page_size),
        offset: (parseInt(page) - 1) * parseInt(page_size)
      })

      const globalMaxListings = await AdminSystemService.getSettingValue(
        'marketplace',
        'max_active_listings',
        10
      )

      const userMaxListings = user.max_active_listings ?? globalMaxListings
      const activeCount = await this.MarketListing.count({
        where: { seller_user_id: user_id, status: 'on_sale' }
      })

      return {
        user: {
          user_id: user.user_id,
          mobile: user.mobile,
          nickname: user.nickname,
          status: user.status,
          max_active_listings: userMaxListings,
          is_custom_limit: user.max_active_listings !== null,
          active_listing_count: activeCount,
          remaining_quota: Math.max(0, userMaxListings - activeCount)
        },
        listings: rows.map(listing => {
          const j = listing.toJSON ? listing.toJSON() : listing
          const attrs = j.offerItem?.instance_attributes || {}
          const qScore = attrs.quality_score
          const qGrade = attrs.quality_grade
          return {
            ...j,
            quality_score: qScore != null ? qScore : null,
            quality_grade: qGrade != null ? qGrade : null,
            serial_number: j.offerItem?.serial_number ?? null,
            edition_total: j.offerItem?.edition_total ?? null
          }
        }),
        pagination: {
          page: parseInt(page),
          page_size: parseInt(page_size),
          total: count,
          total_pages: Math.ceil(count / parseInt(page_size))
        }
      }
    } catch (error) {
      logger.error('[兑换市场] 查询用户上架列表失败:', {
        error: error.message,
        options
      })
      throw error
    }
  }

  /**
   * 更新指定用户的上架数量限制（管理员操作）
   *
   * @param {Object} params - 更新参数
   * @param {number} params.user_id - 目标用户ID
   * @param {number|null} params.max_active_listings - 新的上架数量限制（null=恢复使用全局默认）
   * @param {number} params.operator_id - 操作员（管理员）ID
   * @param {string} [params.reason] - 调整原因
   * @param {Object} options - 事务选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 更新结果
   */
  async updateUserListingLimit(params, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.updateUserListingLimit')
    const { user_id, max_active_listings, operator_id, reason = '' } = params

    if (!user_id) throw new Error('user_id 是必填参数')
    if (!operator_id) throw new Error('operator_id 是必填参数')

    if (max_active_listings !== null && max_active_listings !== undefined) {
      const parsed = parseInt(max_active_listings)
      if (isNaN(parsed) || parsed < 0 || parsed > 1000) {
        throw new Error('max_active_listings 必须是 0~1000 之间的整数，或为 null（恢复全局默认）')
      }
    }

    logger.info('[兑换市场] 管理员调整用户上架限制', {
      user_id, max_active_listings, operator_id, reason
    })

    const user = await this.User.findByPk(user_id, {
      attributes: ['user_id', 'mobile', 'nickname', 'max_active_listings'],
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!user) throw new Error(`用户不存在: ${user_id}`)

    const oldLimit = user.max_active_listings
    const newLimit =
      max_active_listings === null || max_active_listings === undefined
        ? null
        : parseInt(max_active_listings)

    await user.update({ max_active_listings: newLimit }, { transaction })

    const globalMaxListings = await AdminSystemService.getSettingValue(
      'marketplace',
      'max_active_listings',
      10
    )

    const effectiveLimit = newLimit ?? globalMaxListings

    logger.info('[兑换市场] 用户上架限制调整成功', {
      user_id, old_limit: oldLimit, new_limit: newLimit,
      effective_limit: effectiveLimit, operator_id, reason
    })

    return {
      user_id: user.user_id,
      mobile: user.mobile,
      nickname: user.nickname,
      old_limit: oldLimit,
      new_limit: newLimit,
      effective_limit: effectiveLimit,
      is_custom_limit: newLimit !== null,
      global_default: globalMaxListings,
      reason
    }
  }

  /**
   * 检查超时订单并告警（定时任务专用）
   *
   * @param {number} hours - 超时小时数（24或72）
   * @returns {Promise<Object>} 检查结果
   */
  async checkTimeoutAndAlert(hours = 24) {
    try {
      const timeoutThreshold = new Date(Date.now() - hours * 60 * 60 * 1000)

      const timeoutOrders = await this.ExchangeRecord.findAll({
        where: {
          status: 'pending',
          created_at: { [Op.lt]: timeoutThreshold }
        },
        attributes: [
          'exchange_record_id', 'order_no', 'user_id',
          'exchange_item_id', 'pay_amount', 'created_at'
        ],
        order: [['created_at', 'ASC']],
        limit: 100
      })

      const count = timeoutOrders.length

      if (count > 0) {
        logger.warn(`[兑换市场] 发现${count}个超过${hours}小时的待处理订单`, {
          hours, count,
          oldest_order: timeoutOrders[0]?.order_no,
          oldest_created_at: timeoutOrders[0]?.created_at
        })
      } else {
        logger.info(`[兑换市场] 无超过${hours}小时的待处理订单`)
      }

      return {
        hasTimeout: count > 0,
        count,
        hours,
        orders: timeoutOrders.map(order => ({
          record_id: order.exchange_record_id,
          order_no: order.order_no,
          user_id: order.user_id,
          pay_amount: order.pay_amount,
          created_at: order.created_at,
          timeout_hours: Math.floor(
            (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60)
          )
        })),
        checked_at: BeijingTimeHelper.now()
      }
    } catch (error) {
      logger.error(`[兑换市场] 检查${hours}小时超时订单失败:`, {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 管理后台获取兑换商品列表（Admin Only）
   *
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 商品列表和分页信息
   */
  async getAdminMarketItems(options = {}) {
    const {
      status = null, keyword = null,
      page = 1, page_size = 20,
      sort_by = 'sort_order', sort_order = 'ASC'
    } = options

    try {
      logger.info('[兑换市场-管理] 查询商品列表', { status, keyword, page, page_size })

      const where = {}
      if (status) where.status = status
      if (keyword) where.item_name = { [Op.like]: `%${keyword}%` }

      const offset = (page - 1) * page_size
      const limit = page_size

      const { count, rows } = await this.ExchangeItem.findAndCountAll({
        where, limit, offset,
        order: [[sort_by, sort_order]]
      })

      logger.info(`[兑换市场-管理] 找到${count}个商品，返回第${page}页（${rows.length}个）`)

      const itemsWithDisplayNames = await displayNameHelper.attachDisplayNames(
        rows.map(item => item.toJSON()),
        [{ field: 'status', dictType: 'product_status' }]
      )

      return {
        items: itemsWithDisplayNames,
        pagination: {
          total: count, page, page_size,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error('[兑换市场-管理] 查询商品列表失败:', error.message)
      throw new Error(`查询商品列表失败: ${error.message}`)
    }
  }

  /**
   * 获取兑换市场统计数据（Admin Only）
   *
   * @param {Object} [options={}] - 可选参数
   * @param {number} [options.trend_days=90] - 订单趋势图查询天数（1–366）
   * @returns {Promise<Object>} 统计数据
   */
  async getMarketItemStatistics(options = {}) {
    try {
      const rawTrend = parseInt(options.trend_days, 10)
      const trend_days = Number.isFinite(rawTrend) ? Math.min(Math.max(rawTrend, 1), 366) : 90
      logger.info('[兑换市场-管理] 查询统计数据', { trend_days })

      const [totalItems, activeItems, lowStockItems, totalExchanges] = await Promise.all([
        this.ExchangeItem.count(),
        this.ExchangeItem.count({ where: { status: 'active' } }),
        this.ExchangeItem.count({
          include: [
            {
              model: this.models.ExchangeItemSku,
              as: 'skus',
              where: { stock: { [Op.lt]: 10 }, status: 'active' },
              required: true
            }
          ]
        }),
        this.ExchangeRecord.count({ where: { status: { [Op.ne]: 'cancelled' } } })
      ])

      const [orderAgg] = await this.sequelize.query(
        `SELECT
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) AS shipped,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
          COUNT(*) AS total_orders,
          COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN pay_amount ELSE 0 END), 0) AS total_pay_amount
        FROM exchange_records`,
        { type: QueryTypes.SELECT }
      )

      const [itemAgg] = await this.sequelize.query(
        `SELECT
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
          SUM(CASE WHEN status <> 'active' THEN 1 ELSE 0 END) AS inactive_count,
          COALESCE(SUM(CASE WHEN status = 'active' THEN stock ELSE 0 END), 0) AS active_stock,
          COALESCE(SUM(CASE WHEN status <> 'active' THEN stock ELSE 0 END), 0) AS inactive_stock,
          SUM(
            CASE
              WHEN status = 'active' AND stock <= COALESCE(stock_alert_threshold, 5) THEN 1
              ELSE 0
            END
          ) AS low_stock_count
        FROM exchange_items`,
        { type: QueryTypes.SELECT }
      )

      const [fulfillRow] = await this.sequelize.query(
        `SELECT
          AVG(
            CASE
              WHEN status IN ('shipped', 'completed') AND updated_at IS NOT NULL
              THEN TIMESTAMPDIFF(HOUR, created_at, updated_at)
            END
          ) AS avg_fulfillment_hours
        FROM exchange_records
        WHERE status IN ('shipped', 'completed')`,
        { type: QueryTypes.SELECT }
      )

      const totalOrders = Number(orderAgg?.total_orders) || 0
      const cancelled = Number(orderAgg?.cancelled) || 0
      const shipped = Number(orderAgg?.shipped) || 0
      const completed = Number(orderAgg?.completed) || 0
      const validOrders = totalOrders - cancelled
      const fulfilledOrders = shipped + completed
      const fulfillment_rate =
        validOrders > 0 ? Math.round((fulfilledOrders / validOrders) * 10000) / 100 : 0

      const trendRows = await this.sequelize.query(
        `SELECT DATE(created_at) AS day,
          COUNT(*) AS order_count,
          COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN pay_amount ELSE 0 END), 0) AS revenue
        FROM exchange_records
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL :trend_days DAY)
        GROUP BY DATE(created_at)
        ORDER BY day ASC`,
        { type: QueryTypes.SELECT, replacements: { trend_days } }
      )

      const order_trend_by_day = trendRows.map(r => {
        const raw = r.day
        const dateStr =
          raw instanceof Date ? raw.toISOString().split('T')[0] : String(raw).slice(0, 10)
        return {
          date: dateStr,
          order_count: Number(r.order_count) || 0,
          revenue: Number(r.revenue) || 0
        }
      })

      const statistics = {
        total_items: totalItems,
        active_items: activeItems,
        low_stock_items: lowStockItems,
        total_exchanges: totalExchanges,
        timestamp: BeijingTimeHelper.now(),
        order_trend_by_day,
        orders_summary: {
          total: totalOrders,
          pending: Number(orderAgg?.pending) || 0,
          completed, shipped, cancelled,
          total_pay_amount: Number(orderAgg?.total_pay_amount) || 0
        },
        items_summary: {
          active_count: Number(itemAgg?.active_count) || 0,
          inactive_count: Number(itemAgg?.inactive_count) || 0,
          active_stock: Number(itemAgg?.active_stock) || 0,
          inactive_stock: Number(itemAgg?.inactive_stock) || 0,
          low_stock_count: Number(itemAgg?.low_stock_count) || 0
        },
        fulfillment_tracking: {
          total_orders: totalOrders,
          pending_count: Number(orderAgg?.pending) || 0,
          shipped_count: shipped,
          completed_count: completed,
          cancelled_count: cancelled,
          fulfillment_rate,
          avg_fulfillment_time:
            fulfillRow?.avg_fulfillment_hours != null
              ? Math.round(Number(fulfillRow.avg_fulfillment_hours) * 10) / 10
              : 0
        }
      }

      logger.info('[兑换市场-管理] 统计数据查询成功', statistics)

      return statistics
    } catch (error) {
      logger.error('[兑换市场-管理] 查询统计数据失败:', error.message)
      throw new Error(`查询统计数据失败: ${error.message}`)
    }
  }

  /**
   * B2C 兑换商城顶线数据（dashboard 跨域概览专用）
   * @param {number} [days=7] - 统计周期天数
   * @returns {Promise<Object>} B2C 顶线指标
   */
  async getExchangeTopline(days = 7) {
    const safeDays = parseInt(days) || 7
    const [[activeRow], [exchangeRow], [lowStockRow]] = await Promise.all([
      this.sequelize.query(
        `SELECT COUNT(*) AS active_items FROM exchange_items WHERE status = 'active'`,
        { type: QueryTypes.SELECT }
      ),
      this.sequelize.query(
        `SELECT COUNT(*) AS period_exchanges, COALESCE(SUM(pay_amount), 0) AS period_pay_amount FROM exchange_records WHERE status != 'cancelled' AND created_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)`,
        { type: QueryTypes.SELECT }
      ),
      this.sequelize.query(
        `SELECT COUNT(DISTINCT ei.exchange_item_id) AS low_stock_items FROM exchange_items ei JOIN exchange_item_skus eis ON ei.exchange_item_id = eis.exchange_item_id WHERE ei.status = 'active' AND eis.stock <= COALESCE(ei.stock_alert_threshold, 5) AND eis.stock > 0`,
        { type: QueryTypes.SELECT }
      )
    ])
    const [fulfillRow] = await this.sequelize.query(
      `SELECT SUM(CASE WHEN status IN ('shipped','completed') THEN 1 ELSE 0 END) AS fulfilled, SUM(CASE WHEN status != 'cancelled' THEN 1 ELSE 0 END) AS valid_total FROM exchange_records`,
      { type: QueryTypes.SELECT }
    )
    const fulfilled = Number(fulfillRow?.fulfilled) || 0
    const validTotal = Number(fulfillRow?.valid_total) || 0
    return {
      active_items: Number(activeRow?.active_items) || 0,
      period_exchanges: Number(exchangeRow?.period_exchanges) || 0,
      period_pay_amount: Number(exchangeRow?.period_pay_amount) || 0,
      low_stock_items: Number(lowStockRow?.low_stock_items) || 0,
      fulfillment_rate: validTotal > 0 ? Math.round((fulfilled / validTotal) * 10000) / 100 : 0
    }
  }

  /**
   * 获取单品维度统计数据（Admin Only）
   *
   * @param {number} exchangeItemId - 商品ID
   * @returns {Promise<Object>} 单品统计数据
   */
  async getItemDashboard(exchangeItemId) {
    try {
      const item = await this.ExchangeItem.findByPk(exchangeItemId, {
        attributes: [
          'exchange_item_id', 'item_name', 'stock',
          'sold_count', 'min_cost_amount', 'created_at'
        ]
      })
      if (!item) throw new Error('商品不存在')

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      const [recentOrders7d, recentOrders30d, avgRating, statusDistribution] = await Promise.all([
        this.ExchangeRecord.count({
          where: { exchange_item_id: exchangeItemId, created_at: { [Op.gte]: sevenDaysAgo } }
        }),
        this.ExchangeRecord.count({
          where: { exchange_item_id: exchangeItemId, created_at: { [Op.gte]: thirtyDaysAgo } }
        }),
        this.ExchangeRecord.findOne({
          attributes: [[this.sequelize.fn('AVG', this.sequelize.col('rating')), 'avg_rating']],
          where: { exchange_item_id: exchangeItemId, rating: { [Op.ne]: null } },
          raw: true
        }),
        this.ExchangeRecord.findAll({
          attributes: ['status', [this.sequelize.fn('COUNT', '*'), 'count']],
          where: { exchange_item_id: exchangeItemId },
          group: ['status'],
          raw: true
        })
      ])

      const totalOrders = item.sold_count || 0
      const conversionRate =
        totalOrders > 0
          ? ((totalOrders / Math.max(totalOrders + item.stock, 1)) * 100).toFixed(1)
          : 0
      const inventoryTurnover =
        totalOrders > 0 ? (totalOrders / Math.max(item.stock, 1)).toFixed(2) : 0

      return {
        item_name: item.item_name,
        exchange_item_id: item.exchange_item_id,
        current_stock: item.stock,
        total_sold: totalOrders,
        cost_amount: item.min_cost_amount,
        orders_7d: recentOrders7d,
        orders_30d: recentOrders30d,
        avg_rating: avgRating?.avg_rating
          ? parseFloat(parseFloat(avgRating.avg_rating).toFixed(2))
          : null,
        conversion_rate: parseFloat(conversionRate),
        inventory_turnover: parseFloat(inventoryTurnover),
        order_status_distribution: statusDistribution.reduce((acc, row) => {
          acc[row.status] = parseInt(row.count, 10)
          return acc
        }, {})
      }
    } catch (error) {
      logger.error(`[兑换市场-管理] 单品统计查询失败(id:${exchangeItemId}):`, error.message)
      throw error
    }
  }

  /**
   * 获取空间分布统计（管理后台用，Phase 3.8）
   *
   * @returns {Promise<Object>} 空间分布统计
   */
  async getSpaceDistribution() {
    try {
      const distribution = await this.ExchangeItem.findAll({
        attributes: [
          'space',
          [this.sequelize.fn('COUNT', this.sequelize.col('exchange_item_id')), 'count']
        ],
        group: ['space'],
        raw: true
      })

      const result = { lucky: 0, premium: 0, both: 0 }
      distribution.forEach(row => {
        result[row.space] = parseInt(row.count, 10)
      })

      return {
        distribution: result,
        total: Object.values(result).reduce((sum, v) => sum + v, 0)
      }
    } catch (error) {
      logger.error('[兑换市场-管理] 查询空间分布失败:', error.message)
      throw error
    }
  }
}

module.exports = MarketQueryService
