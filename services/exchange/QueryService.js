/**
 * 餐厅积分抽奖系统 V4.7.0 - 兑换市场查询服务
 * Exchange Query Service（大文件拆分方案 Phase 4）
 *
 * 职责范围：查询相关操作
 * - getMarketItems(): 获取商品列表（用户端）
 * - getItemDetail(): 获取商品详情
 * - getUserOrders(): 获取用户订单列表
 * - getOrderDetail(): 获取订单详情（用户端）
 * - getAdminOrders(): 获取全量订单列表（管理员）
 * - getAdminOrderDetail(): 获取订单详情（管理员）
 * - getMarketStatistics(): 获取市场统计数据
 *
 * 设计原则：
 * - 查询操作不需要事务
 * - 支持 Redis 缓存优化（BusinessCacheHelper）
 * - 使用统一视图常量控制返回字段
 *
 * @module services/exchange/QueryService
 * @created 2026-01-31（大文件拆分方案 Phase 4）
 */

const logger = require('../../utils/logger').logger
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
const displayNameHelper = require('../../utils/displayNameHelper')
const { Op } = require('sequelize')

/**
 * 🎯 统一商品视图常量（Product 模型，统一商品中心）
 */
const PRODUCT_VIEW_ATTRIBUTES = {
  /**
   * 商品列表视图（用户浏览）
   */
  listView: [
    'product_id',
    'product_name',
    'description',
    'category_id',
    'primary_media_id',
    'rarity_code',
    'status',
    'sort_order',
    'space',
    'is_pinned',
    'pinned_at',
    'is_new',
    'is_hot',
    'is_limited',
    'is_recommended',
    'tags',
    'sell_point',
    'usage_rules',
    'publish_at',
    'unpublish_at',
    'created_at'
  ],

  /**
   * 商品详情视图
   */
  detailView: [
    'product_id',
    'product_name',
    'description',
    'category_id',
    'primary_media_id',
    'item_template_id',
    'mint_instance',
    'rarity_code',
    'status',
    'sort_order',
    'space',
    'is_pinned',
    'pinned_at',
    'is_new',
    'is_hot',
    'is_limited',
    'is_recommended',
    'tags',
    'sell_point',
    'usage_rules',
    'video_url',
    'stock_alert_threshold',
    'publish_at',
    'unpublish_at',
    'attributes_json',
    'created_at',
    'updated_at'
  ]
}

/**
 * 🎯 统一数据输出视图常量（Data Output View Constants）
 */
const EXCHANGE_MARKET_ATTRIBUTES = {
  /**
   * 市场商品列表视图（Product SPU + SKU 定价/库存通过 include 获取）
   */
  marketItemView: [
    'product_id',
    'product_name',
    'description',
    'sort_order',
    'status',
    'primary_media_id',
    'category_id',
    'space',
    'tags',
    'is_new',
    'is_hot',
    'is_limited',
    'is_recommended',
    'sell_point',
    'rarity_code',
    'usage_rules',
    'publish_at',
    'unpublish_at',
    'created_at'
  ],

  /**
   * 商品详情视图
   */
  marketItemDetailView: [
    'product_id',
    'product_name',
    'description',
    'sort_order',
    'status',
    'primary_media_id',
    'category_id',
    'item_template_id',
    'mint_instance',
    'space',
    'tags',
    'is_new',
    'is_hot',
    'is_limited',
    'is_recommended',
    'sell_point',
    'usage_rules',
    'rarity_code',
    'video_url',
    'stock_alert_threshold',
    'publish_at',
    'unpublish_at',
    'attributes_json',
    'created_at',
    'updated_at'
  ],

  /**
   * 用户订单视图
   */
  marketOrderView: [
    'exchange_record_id',
    'order_no',
    'user_id',
    'exchange_item_id',
    'item_snapshot',
    'quantity',
    'pay_asset_code',
    'pay_amount',
    'status',
    'exchange_time',
    'shipped_at',
    'received_at',
    'rated_at',
    'rejected_at',
    'refunded_at',
    'approved_at',
    'auto_confirmed',
    'rating',
    'source',
    'created_at',
    'updated_at'
  ],

  /**
   * 管理员订单视图（包含敏感字段）
   */
  adminMarketOrderView: [
    'exchange_record_id',
    'order_no',
    'user_id',
    'exchange_item_id',
    'item_snapshot',
    'quantity',
    'pay_asset_code',
    'pay_amount',
    'total_cost',
    'status',
    'admin_remark',
    'exchange_time',
    'shipped_at',
    'received_at',
    'rated_at',
    'rejected_at',
    'refunded_at',
    'approved_at',
    'auto_confirmed',
    'rating',
    'source',
    'created_at',
    'updated_at'
  ]
}

/**
 * 兑换市场查询服务类
 *
 * @class QueryService
 */
class QueryService {
  /**
   * 构造函数
   *
   * @param {Object} models - Sequelize 模型对象
   */
  constructor(models) {
    this.models = models
    this.Product = models.Product
    this.ExchangeRecord = models.ExchangeRecord
    this.ExchangeOrderEvent = models.ExchangeOrderEvent
    this.ProductSku = models.ProductSku
    this.ExchangeChannelPrice = models.ExchangeChannelPrice
    this.Category = models.Category
    this.sequelize = models.sequelize
  }

  /**
   * 获取兑换市场商品列表
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.status='active'] - 商品状态
   * @param {string} [options.asset_code] - 材料资产代码筛选
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.sort_by='sort_order'] - 排序字段
   * @param {string} [options.sort_order='ASC'] - 排序方向
   * @param {boolean} [options.with_counts=false] - 是否返回各筛选维度的聚合计数（C+++ 条件联动）
   * @param {boolean} [options.refresh=false] - 强制刷新缓存
   * @returns {Promise<Object>} 商品列表和分页信息（with_counts=true 时额外包含 filters_count）
   */
  async getMarketItems(options = {}) {
    const {
      status = 'active',
      asset_code = null,
      space = null,
      keyword = null,
      category = null,
      exclude_id = null,
      min_cost = null,
      max_cost = null,
      stock_status = null,
      with_counts = false,
      page = 1,
      page_size = 20,
      sort_by = 'sort_order',
      sort_order = 'ASC',
      refresh = false
    } = options

    try {
      // Redis 缓存读取（所有筛选参数都必须参与缓存 key，避免不同条件命中相同缓存）
      const cacheParams = {
        status,
        asset_code: asset_code || 'all',
        space: space || 'all',
        keyword: keyword || '',
        category: category || 'all',
        exclude_id: exclude_id || 0,
        min_cost: min_cost || 0,
        max_cost: max_cost || 0,
        stock_status: stock_status || 'all',
        with_counts: with_counts ? '1' : '0',
        page,
        page_size,
        sort_by,
        sort_order
      }
      if (!refresh) {
        const cached = await BusinessCacheHelper.getExchangeItems(cacheParams)
        if (cached) {
          logger.debug('[兑换市场] 缓存命中', cacheParams)
          return cached
        }
      }

      logger.info('[兑换市场] 查询商品列表', {
        status,
        asset_code,
        space,
        keyword,
        page,
        page_size
      })

      // 构建 Product 表查询条件（price/stock 筛选在嵌套 include 中）
      const where = { status }

      // 空间筛选（lucky/premium）— 臻选空间/幸运空间核心逻辑
      if (space) {
        where.space = { [Op.in]: [space, 'both'] }
      }

      // 关键词搜索（匹配 product_name）
      if (keyword) {
        where.product_name = { [Op.like]: `%${keyword}%` }
      }

      // 分类筛选（支持两级分类：选择一级分类时自动包含其下所有子分类商品）
      if (category) {
        const categoryDefId = await this._resolveCategoryDefId(category)
        if (categoryDefId !== null) {
          const { CategoryDef } = this.models
          const categoryIds = await CategoryDef.getIdsWithChildren(categoryDefId)
          where.category_id = { [Op.in]: categoryIds }
        }
      }

      // 排除指定商品（用于详情页"相关推荐"，排除当前商品自身）
      if (exclude_id) {
        where.product_id = { [Op.ne]: parseInt(exclude_id, 10) }
      }

      // 价格范围筛选（基于 SPU 汇总列 min_cost_amount）
      if (min_cost !== null) {
        where.min_cost_amount = { ...where.min_cost_amount, [Op.gte]: parseInt(min_cost, 10) }
      }
      if (max_cost !== null) {
        where.min_cost_amount = { ...where.min_cost_amount, [Op.lte]: parseInt(max_cost, 10) }
      }

      // 库存状态筛选（基于 SPU 汇总列 stock）
      if (stock_status === 'in_stock') {
        where.stock = { [Op.gt]: 5 }
      } else if (stock_status === 'low_stock') {
        where.stock = { [Op.between]: [1, 5] }
      }

      const offset = (page - 1) * page_size
      const limit = page_size

      const { count, rows } = await this.Product.findAndCountAll({
        where,
        attributes: EXCHANGE_MARKET_ATTRIBUTES.marketItemView,
        include: [
          {
            model: this.models.MediaFile,
            as: 'primary_media',
            attributes: ['media_id', 'object_key', 'mime_type', 'thumbnail_keys'],
            required: false
          }
        ],
        subQuery: false,
        limit,
        offset,
        order: [
          ['is_pinned', 'DESC'],
          ['pinned_at', 'DESC'],
          ['is_recommended', 'DESC'],
          ['sort_order', 'ASC'],
          [sort_by, sort_order]
        ]
      })

      logger.info(`[兑换市场] 找到${count}个商品，返回第${page}页（${rows.length}个）`)

      // 添加中文显示名称
      const itemsWithDisplayNames = await displayNameHelper.attachDisplayNames(
        rows.map(item => item.toJSON()),
        [{ field: 'status', dictType: 'product_status' }]
      )

      /**
       * 计算统计摘要（需求6 + 需求8）
       * - trending_count: 近7天销量（基于 exchange_records 近7天 COUNT）
       * - avg_discount: 平均折扣率（cost_amount / original_price，仅计算 original_price > 0 的商品）
       */
      const summary = await this._calculateListSummary(where)

      const result = {
        items: itemsWithDisplayNames,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        },
        summary
      }

      // C+++ 聚合计数：每个维度排除自身条件，保留其他维度条件（条件联动）
      if (with_counts) {
        result.filters_count = await this._buildFiltersCount({
          status,
          asset_code,
          space,
          keyword,
          category,
          min_cost,
          max_cost,
          stock_status
        })
      }

      // 写入 Redis 缓存
      await BusinessCacheHelper.setExchangeItems(cacheParams, result)

      return result
    } catch (error) {
      logger.error('[兑换市场] 查询商品列表失败:', error.message)
      throw new Error(`查询商品列表失败: ${error.message}`)
    }
  }

  /**
   * 获取单个商品详情
   *
   * @param {number} item_id - 商品ID
   * @returns {Promise<Object>} 商品详情
   */
  async getItemDetail(item_id) {
    try {
      const item = await this.Product.findOne({
        where: { product_id: item_id },
        attributes: EXCHANGE_MARKET_ATTRIBUTES.marketItemDetailView,
        include: [
          {
            model: this.models.MediaFile,
            as: 'primary_media',
            attributes: ['media_id', 'object_key', 'mime_type', 'thumbnail_keys'],
            required: false
          },
          {
            model: this.models.RarityDef,
            as: 'rarityDef',
            attributes: ['rarity_code', 'display_name', 'color_hex', 'tier'],
            required: false
          },
          {
            model: this.models.Category,
            as: 'category',
            attributes: ['category_id', 'category_code', 'category_name'],
            required: false
          },
          ...(this.models.ProductSku
            ? [
                {
                  model: this.models.ProductSku,
                  as: 'skus',
                  where: { status: 'active' },
                  required: false,
                  order: [['sort_order', 'ASC']],
                  include: [
                    {
                      model: this.models.ExchangeChannelPrice,
                      as: 'channelPrices',
                      required: false,
                      attributes: ['cost_asset_code', 'cost_amount', 'original_amount']
                    }
                  ],
                  attributes: [
                    'sku_id',
                    'sku_code',
                    'stock',
                    'sold_count',
                    'status',
                    'sort_order'
                  ]
                }
              ]
            : [])
        ]
      })

      if (!item) {
        throw new Error('商品不存在')
      }

      const { MediaAttachment, MediaFile } = this.models
      const { getImageUrl } = require('../../utils/ImageUrlHelper')
      const attachments =
        MediaAttachment && MediaFile
          ? await MediaAttachment.findAll({
              where: {
                attachable_type: 'product',
                attachable_id: item_id
              },
              include: [
                {
                  model: MediaFile,
                  as: 'media',
                  attributes: ['media_id', 'object_key', 'mime_type', 'thumbnail_keys']
                }
              ],
              order: [['sort_order', 'ASC']]
            })
          : []
      const toImageJson = a => {
        const m = a.media || a.Media
        if (!m) return null
        const url = m.object_key ? getImageUrl(m.object_key) : null
        return {
          media_id: m.media_id,
          url,
          mime: m.mime_type,
          thumbnail_url: m.thumbnail_keys?.small ? getImageUrl(m.thumbnail_keys.small) : url
        }
      }
      const images = attachments
        .filter(a => a.role === 'gallery' || a.role === 'products')
        .map(toImageJson)
        .filter(Boolean)
      const detail_images = attachments
        .filter(a => a.role === 'detail')
        .map(toImageJson)
        .filter(Boolean)
      const showcase_images = attachments
        .filter(a => a.role === 'showcase')
        .map(toImageJson)
        .filter(Boolean)

      // 添加中文显示名称
      const itemJSON = item.toJSON()
      const itemWithDisplayNames = await displayNameHelper.attachDisplayNames(itemJSON, [
        { field: 'status', dictType: 'product_status' }
      ])

      // 挂载多图数据到返回结果
      itemWithDisplayNames.images = images
      itemWithDisplayNames.detail_images = detail_images
      itemWithDisplayNames.showcase_images = showcase_images

      return {
        item: itemWithDisplayNames
      }
    } catch (error) {
      logger.error(`[兑换市场] 查询商品详情失败(item_id:${item_id}):`, error.message)
      throw error
    }
  }

  /**
   * 获取用户订单列表
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @param {string} [options.status] - 订单状态筛选
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 订单列表和分页信息
   */
  async getUserOrders(user_id, options = {}) {
    const { status = null, page = 1, page_size = 20 } = options

    try {
      logger.info(`[兑换市场] 查询用户${user_id}订单列表`, { status, page, page_size })

      const where = { user_id }
      if (status) {
        where.status = status
      }

      const offset = (page - 1) * page_size
      const limit = page_size

      const { count, rows } = await this.ExchangeRecord.findAndCountAll({
        where,
        attributes: EXCHANGE_MARKET_ATTRIBUTES.marketOrderView,
        limit,
        offset,
        order: [['exchange_time', 'DESC']]
      })

      logger.info(`[兑换市场] 找到${count}个订单，返回第${page}页（${rows.length}个）`)

      // 添加中文显示名称
      const ordersWithDisplayNames = await displayNameHelper.attachDisplayNames(
        rows.map(order => order.toJSON()),
        [{ field: 'status', dictType: 'exchange_status' }]
      )

      return {
        orders: ordersWithDisplayNames,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error(`[兑换市场] 查询用户订单列表失败(user_id:${user_id}):`, error.message)
      throw new Error(`查询订单列表失败: ${error.message}`)
    }
  }

  /**
   * 获取订单详情
   *
   * @param {number} user_id - 用户ID
   * @param {string} order_no - 订单号
   * @returns {Promise<Object>} 订单详情
   */
  async getOrderDetail(user_id, order_no) {
    try {
      const order = await this.ExchangeRecord.findOne({
        where: { user_id, order_no },
        attributes: EXCHANGE_MARKET_ATTRIBUTES.marketOrderView
      })

      if (!order) {
        const notFoundError = new Error('订单不存在或无权访问')
        notFoundError.statusCode = 404
        notFoundError.errorCode = 'ORDER_NOT_FOUND'
        throw notFoundError
      }

      // 添加中文显示名称
      const orderWithDisplayNames = await displayNameHelper.attachDisplayNames(order.toJSON(), [
        { field: 'status', dictType: 'exchange_status' }
      ])

      return {
        order: orderWithDisplayNames
      }
    } catch (error) {
      logger.error(`[兑换市场] 查询订单详情失败(order_no:${order_no}):`, error.message)
      throw error
    }
  }

  /**
   * 管理员获取全量订单列表（Admin Only）
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.status] - 订单状态筛选
   * @param {number} [options.user_id] - 用户ID筛选
   * @param {number} [options.product_id] - 商品ID筛选
   * @param {string} [options.order_no] - 订单号模糊搜索
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.sort_by='created_at'] - 排序字段
   * @param {string} [options.sort_order='DESC'] - 排序方向
   * @returns {Promise<Object>} 订单列表和分页信息
   */
  async getAdminOrders(options = {}) {
    const {
      status = null,
      user_id = null,
      product_id = null,
      exchange_item_id = null,
      order_no = null,
      page = 1,
      page_size = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = options

    try {
      logger.info('[兑换市场] 管理员查询全量订单列表', {
        status,
        user_id,
        product_id,
        order_no,
        page,
        page_size
      })

      const where = {}
      if (status) where.status = status
      if (user_id) where.user_id = user_id
      if (product_id) where.product_id = product_id
      else if (exchange_item_id) where.exchange_item_id = exchange_item_id
      if (order_no) {
        where.order_no = { [Op.like]: `%${order_no}%` }
      }

      const offset = (page - 1) * page_size
      const limit = page_size

      const { count, rows } = await this.ExchangeRecord.findAndCountAll({
        where,
        attributes: EXCHANGE_MARKET_ATTRIBUTES.adminMarketOrderView,
        limit,
        offset,
        order: [[sort_by, sort_order]]
      })

      logger.info(
        `[兑换市场] 管理员查询订单成功：找到${count}个订单，返回第${page}页（${rows.length}个）`
      )

      // 添加中文显示名称
      const ordersWithDisplayNames = await displayNameHelper.attachDisplayNames(
        rows.map(order => order.toJSON()),
        [{ field: 'status', dictType: 'exchange_status' }]
      )

      return {
        orders: ordersWithDisplayNames,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        },
        filters: {
          status,
          user_id,
          exchange_item_id,
          order_no
        }
      }
    } catch (error) {
      logger.error('[兑换市场] 管理员查询订单列表失败:', error.message)
      throw new Error(`查询订单列表失败: ${error.message}`)
    }
  }

  /**
   * 管理员获取订单详情（Admin Only）
   *
   * @param {string} order_no - 订单号
   * @returns {Promise<Object>} 订单详情
   */
  async getAdminOrderDetail(order_no) {
    try {
      logger.info('[兑换市场] 管理员查询订单详情', { order_no })

      const includeConfig = []
      const orderConfig = []
      if (this.ExchangeOrderEvent) {
        includeConfig.push({
          model: this.ExchangeOrderEvent,
          as: 'events',
          attributes: [
            'event_id',
            'old_status',
            'new_status',
            'operator_id',
            'operator_type',
            'reason',
            'created_at'
          ],
          required: false
        })
        orderConfig.push([{ model: this.ExchangeOrderEvent, as: 'events' }, 'created_at', 'ASC'])
      }

      const order = await this.ExchangeRecord.findOne({
        where: { order_no },
        attributes: EXCHANGE_MARKET_ATTRIBUTES.adminMarketOrderView,
        include: includeConfig,
        order: orderConfig
      })

      if (!order) {
        const notFoundError = new Error('订单不存在')
        notFoundError.statusCode = 404
        notFoundError.errorCode = 'ORDER_NOT_FOUND'
        throw notFoundError
      }

      logger.info('[兑换市场] 管理员获取订单详情成功', {
        order_no,
        status: order.status
      })

      const orderData = order.toJSON()

      // 添加中文显示名称
      const orderWithDisplayNames = await displayNameHelper.attachDisplayNames(orderData, [
        { field: 'status', dictType: 'exchange_status' }
      ])

      return {
        order: orderWithDisplayNames
      }
    } catch (error) {
      logger.error(`[兑换市场] 管理员查询订单详情失败(order_no:${order_no}):`, error.message)
      throw error
    }
  }

  /**
   * 获取兑换市场统计数据（管理员使用）
   *
   * @returns {Promise<Object>} 统计数据
   */
  async getMarketStatistics() {
    try {
      logger.info('[兑换市场] 查询统计数据')

      // 查询各状态订单数量
      const [totalOrders, pendingOrders, completedOrders, shippedOrders, cancelledOrders] =
        await Promise.all([
          this.ExchangeRecord.count(),
          this.ExchangeRecord.count({ where: { status: 'pending' } }),
          this.ExchangeRecord.count({ where: { status: 'completed' } }),
          this.ExchangeRecord.count({ where: { status: 'shipped' } }),
          this.ExchangeRecord.count({ where: { status: 'cancelled' } })
        ])

      // 查询材料资产消耗统计
      const totalMaterialCost = await this.ExchangeRecord.sum('pay_amount', {
        where: { pay_asset_code: { [Op.ne]: null } }
      })

      // 查询商品统计（Product SPU 维度）
      const itemStats = await this.Product.findAll({
        attributes: [
          'status',
          [this.sequelize.fn('COUNT', this.sequelize.col('product_id')), 'count']
        ],
        group: ['status']
      })

      return {
        statistics: {
          orders: {
            total: totalOrders,
            pending: pendingOrders,
            completed: completedOrders,
            shipped: shippedOrders,
            cancelled: cancelledOrders
          },
          material_consumption: {
            total_amount: totalMaterialCost || 0
          },
          items: itemStats
        }
      }
    } catch (error) {
      logger.error('[兑换市场] 查询统计数据失败:', error.message)
      throw new Error(`查询统计数据失败: ${error.message}`)
    }
  }

  /**
   * 获取空间统计数据（臻选空间/幸运空间）
   *
   * @param {string} space - 空间类型（lucky / premium）
   * @returns {Promise<Object>} 空间统计数据
   * @returns {string} returns.space - 空间类型
   * @returns {number} returns.total_products - 商品总数
   * @returns {number} returns.new_count - 新品数量
   * @returns {number} returns.hot_count - 热门数量
   * @returns {Object} returns.asset_code_distribution - 资产类型分布
   */
  async getSpaceStats(space) {
    try {
      logger.info('[兑换市场] 查询空间统计', { space })

      // 空间筛选条件：space='lucky' 查 lucky+both；space='premium' 查 premium+both
      const spaceCondition = { [Op.in]: [space, 'both'] }

      const [totalProducts, newCount, hotCount] = await Promise.all([
        this.Product.count({
          where: { space: spaceCondition, status: 'active' }
        }),
        this.Product.count({
          where: { space: spaceCondition, status: 'active', is_new: true }
        }),
        this.Product.count({
          where: { space: spaceCondition, status: 'active', is_hot: true }
        })
      ])

      const assetCodeDistribution = {}

      logger.info('[兑换市场] 空间统计完成', {
        space,
        total_products: totalProducts,
        new_count: newCount,
        hot_count: hotCount
      })

      return {
        space,
        total_products: totalProducts,
        new_count: newCount,
        hot_count: hotCount,
        asset_code_distribution: assetCodeDistribution
      }
    } catch (error) {
      logger.error(`[兑换市场] 查询空间统计失败(space:${space}):`, error.message)
      throw error
    }
  }

  /**
   * C+++ 聚合计数：各筛选维度交叉排除计数（条件联动）
   *
   * 每个维度的 COUNT 排除自身条件但保留其他维度条件，
   * 使前端能够展示"如果选了这个分类，有几个商品"的动态计数。
   *
   * @param {Object} filterValues - 当前所有筛选值
   * @returns {Promise<Object>} 各维度的聚合计数 { categories, cost_ranges, stock_statuses }
   * @private
   */
  async _buildFiltersCount(filterValues) {
    const { status, asset_code: _asset_code, space, keyword, category, min_cost: _min_cost, max_cost: _max_cost, stock_status: _stock_status } =
      filterValues

    try {
      const { sequelize } = this.Product

      /**
       * 构建基础 WHERE（status + asset_code + space + keyword 不参与维度排除，始终保留）
       * 这些是"全局筛选"，不属于 facet 维度
       *
       * @returns {Object} SQL 片段和参数 { parts, replacements }
       */
      const buildBaseWhere = () => {
        const parts = ['p.status = :status']
        const replacements = { status }

        if (space) {
          parts.push('p.space IN (:space_values)')
          replacements.space_values = [space, 'both']
        }
        if (keyword) {
          parts.push('p.product_name LIKE :keyword')
          replacements.keyword = `%${keyword}%`
        }
        return { parts, replacements }
      }

      const catBase = buildBaseWhere()

      const priceBase = buildBaseWhere()
      if (category) {
        const catDefId = await this._resolveCategoryDefId(category)
        if (catDefId !== null) {
          const { CategoryDef } = this.models
          const catIds = await CategoryDef.getIdsWithChildren(catDefId)
          priceBase.parts.push(`p.category_id IN (${catIds.join(',')})`)
        }
      }

      const stockBase = buildBaseWhere()
      if (category) {
        const catDefIdS = await this._resolveCategoryDefId(category)
        if (catDefIdS !== null) {
          const { CategoryDef } = this.models
          const catIdsS = await CategoryDef.getIdsWithChildren(catDefIdS)
          stockBase.parts.push(`p.category_id IN (${catIdsS.join(',')})`)
        }
      }

      const [categoryRows, priceRows, stockRows] = await Promise.all([
        sequelize.query(
          `SELECT COALESCE(c.category_code, '__null__') AS category_code, COUNT(*) AS cnt
           FROM products p
           LEFT JOIN categories c ON p.category_id = c.category_id
           WHERE ${catBase.parts.join(' AND ')}
           GROUP BY p.category_id, c.category_code`,
          { replacements: catBase.replacements, type: sequelize.constructor.QueryTypes.SELECT }
        ),
        sequelize.query(
          `SELECT
             SUM(CASE WHEN ecp.cost_amount <= 100 THEN 1 ELSE 0 END) AS range_0_100,
             SUM(CASE WHEN ecp.cost_amount > 100 AND ecp.cost_amount <= 500 THEN 1 ELSE 0 END) AS range_100_500,
             SUM(CASE WHEN ecp.cost_amount > 500 AND ecp.cost_amount <= 1000 THEN 1 ELSE 0 END) AS range_500_1000,
             SUM(CASE WHEN ecp.cost_amount > 1000 THEN 1 ELSE 0 END) AS range_1000_plus,
             COUNT(DISTINCT p.product_id) AS total
           FROM products p
           LEFT JOIN product_skus ps ON ps.product_id = p.product_id AND ps.status = 'active'
           LEFT JOIN exchange_channel_prices ecp ON ecp.sku_id = ps.sku_id
           WHERE ${priceBase.parts.join(' AND ')}`,
          { replacements: priceBase.replacements, type: sequelize.constructor.QueryTypes.SELECT }
        ),
        sequelize.query(
          `SELECT
             SUM(CASE WHEN ps.stock > 5 THEN 1 ELSE 0 END) AS in_stock,
             SUM(CASE WHEN ps.stock BETWEEN 1 AND 5 THEN 1 ELSE 0 END) AS low_stock,
             SUM(CASE WHEN ps.stock = 0 THEN 1 ELSE 0 END) AS out_of_stock,
             COUNT(*) AS total
           FROM products p
           LEFT JOIN product_skus ps ON ps.product_id = p.product_id AND ps.status = 'active'
           WHERE ${stockBase.parts.join(' AND ')}`,
          { replacements: stockBase.replacements, type: sequelize.constructor.QueryTypes.SELECT }
        )
      ])

      // 组装分类计数结果
      const categories = {}
      for (const row of categoryRows) {
        categories[row.category_code] = parseInt(row.cnt, 10)
      }

      // 组装价格区间计数结果
      const priceResult = priceRows[0] || {}
      const cost_ranges = {
        '0-100': parseInt(priceResult.range_0_100 || 0, 10),
        '100-500': parseInt(priceResult.range_100_500 || 0, 10),
        '500-1000': parseInt(priceResult.range_500_1000 || 0, 10),
        '1000+': parseInt(priceResult.range_1000_plus || 0, 10),
        total: parseInt(priceResult.total || 0, 10)
      }

      // 组装库存状态计数结果
      const stockResult = stockRows[0] || {}
      const stock_statuses = {
        in_stock: parseInt(stockResult.in_stock || 0, 10),
        low_stock: parseInt(stockResult.low_stock || 0, 10),
        out_of_stock: parseInt(stockResult.out_of_stock || 0, 10),
        total: parseInt(stockResult.total || 0, 10)
      }

      return { categories, cost_ranges, stock_statuses }
    } catch (error) {
      logger.warn('[兑换市场] 聚合计数计算失败（非致命）:', error.message)
      return { categories: {}, cost_ranges: {}, stock_statuses: {} }
    }
  }

  /**
   * 将 category_code 或 category_def_id 解析为 category_def_id（API 兼容：前端可能传 code 或 id）
   *
   * @param {string|number} category - 分类代码或分类ID
   * @returns {Promise<number|null>} category_def_id，无法解析时返回 null
   * @private
   */
  async _resolveCategoryDefId(category) {
    if (category == null) return null
    const num = parseInt(category, 10)
    if (!Number.isNaN(num) && String(num) === String(category)) {
      return num
    }
    const CategoryDef = this.models.CategoryDef
    if (!CategoryDef) return null
    const def = await CategoryDef.findOne({
      where: { category_code: String(category) },
      attributes: ['category_def_id']
    })
    return def ? def.category_def_id : null
  }

  /**
   * 计算商品列表统计摘要（需求6 趋势销量 + 需求8 折扣率）
   *
   * 统计字段：
   * - trending_count: 近7天总销量（基于当前筛选条件的商品在 exchange_records 中近7天的记录数）
   * - avg_discount: 平均折扣率（cost_amount / original_price，仅计算 original_price > 0 的商品）
   *
   * @param {Object} where - 当前查询条件（从 getMarketItems 传入）
   * @returns {Promise<Object>} 统计摘要
   * @private
   */
  async _calculateListSummary(where) {
    try {
      const { sequelize } = this.Product

      // 1. 计算近7天趋势销量（trending_count）
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const [trendingResult] = await sequelize.query(
        `SELECT COUNT(*) AS trending_count
         FROM exchange_records er
         INNER JOIN products p ON er.product_id = p.product_id
         WHERE er.created_at >= :seven_days_ago
           AND er.status IN ('completed', 'shipped', 'pending')
           AND p.status = :item_status`,
        {
          replacements: {
            seven_days_ago: sevenDaysAgo,
            item_status: where.status || 'active'
          },
          type: sequelize.constructor.QueryTypes.SELECT
        }
      )

      // 2. 平均评分（avg_rating）
      const [discountAndRatingResult] = await sequelize.query(
        `SELECT
           AVG(er.rating) AS avg_rating,
           COUNT(er.rating) AS rated_order_count
         FROM products p
         LEFT JOIN exchange_records er
           ON er.product_id = p.product_id AND er.rating IS NOT NULL
         WHERE p.status = :item_status`,
        {
          replacements: { item_status: where.status || 'active' },
          type: sequelize.constructor.QueryTypes.SELECT
        }
      )

      return {
        /** 近7天总销量（所有在售商品） */
        trending_count: parseInt(trendingResult?.trending_count || 0, 10),
        /** 平均折扣率（0-1之间，如0.85表示85折，null表示无数据） */
        avg_discount: discountAndRatingResult?.avg_discount
          ? parseFloat(parseFloat(discountAndRatingResult.avg_discount).toFixed(4))
          : null,
        /** 有原价数据的商品数量 */
        has_original_price_count: parseInt(
          discountAndRatingResult?.has_original_price_count || 0,
          10
        ),
        /** 平均评分（1-5分，null表示暂无评分数据） */
        avg_rating: discountAndRatingResult?.avg_rating
          ? parseFloat(parseFloat(discountAndRatingResult.avg_rating).toFixed(2))
          : null,
        /** 已评分订单数量 */
        rated_order_count: parseInt(discountAndRatingResult?.rated_order_count || 0, 10)
      }
    } catch (error) {
      logger.warn('[兑换市场] 统计摘要计算失败（非致命）:', error.message)
      // 统计失败不影响列表返回
      return {
        trending_count: 0,
        avg_discount: null,
        has_original_price_count: 0,
        avg_rating: null,
        rated_order_count: 0
      }
    }
  }

  /*
   * =====================================================================
   *  统一商品中心查询方法（Product / ProductSku / ExchangeChannelPrice）
   * =====================================================================
   */

  /**
   * 查询统一商品列表（替代 getMarketItems 的 Product 版本）
   *
   * 数据来源：products → product_skus → exchange_channel_prices
   * 前端兼容：返回结果包含 exchange_item_id / item_name 等兼容字段
   *
   * @param {Object} [filters={}] - 筛选条件
   * @param {string}  [filters.status='active']    - 商品状态
   * @param {string}  [filters.asset_code]          - 材料资产代码（定价层筛选）
   * @param {string}  [filters.space]               - 展示空间 lucky/premium
   * @param {string}  [filters.keyword]             - 关键词搜索（匹配 product_name）
   * @param {string|number} [filters.category]      - 品类代码或品类 ID
   * @param {number}  [filters.exclude_id]          - 排除指定商品
   * @param {number}  [filters.min_cost]            - 最低价格
   * @param {number}  [filters.max_cost]            - 最高价格
   * @param {Object} [pagination={}] - 分页与排序
   * @param {number}  [pagination.page=1]           - 页码
   * @param {number}  [pagination.page_size=20]     - 每页数量
   * @param {string}  [pagination.sort_by='sort_order'] - 排序字段
   * @param {string}  [pagination.sort_order='ASC'] - 排序方向
   * @returns {Promise<Object>} { items, pagination }
   */
  async listProducts(filters = {}, pagination = {}) {
    const {
      status = 'active',
      asset_code = null,
      space = null,
      keyword = null,
      category = null,
      exclude_id = null,
      min_cost = null,
      max_cost = null
    } = filters

    const { page = 1, page_size = 20, sort_by = 'sort_order', sort_order = 'ASC' } = pagination

    try {
      if (!this.Product) {
        throw new Error('Product 模型未注册，请检查 models 配置')
      }

      logger.info('[商品中心] 查询商品列表', {
        status,
        asset_code,
        space,
        keyword,
        page,
        page_size
      })

      // ---- 商品层 WHERE ----
      const where = { status }

      if (space) {
        where.space = { [Op.in]: [space, 'both'] }
      }
      if (keyword) {
        where.product_name = { [Op.like]: `%${keyword}%` }
      }
      if (category) {
        const categoryIds = await this._resolveCategoryIds(category)
        if (categoryIds && categoryIds.length > 0) {
          where.category_id = { [Op.in]: categoryIds }
        }
      }
      if (exclude_id) {
        where.product_id = { [Op.ne]: parseInt(exclude_id, 10) }
      }

      // ---- 定价层 WHERE（ExchangeChannelPrice）----
      const priceWhere = { is_enabled: true }
      const hasPriceFilter = !!(asset_code || min_cost !== null || max_cost !== null)

      if (asset_code) {
        priceWhere.cost_asset_code = asset_code
      }
      if (min_cost !== null) {
        priceWhere.cost_amount = {
          ...priceWhere.cost_amount,
          [Op.gte]: parseInt(min_cost, 10)
        }
      }
      if (max_cost !== null) {
        priceWhere.cost_amount = {
          ...priceWhere.cost_amount,
          [Op.lte]: parseInt(max_cost, 10)
        }
      }

      const offset = (page - 1) * page_size
      const limit = page_size

      const { count, rows } = await this.Product.findAndCountAll({
        where,
        attributes: PRODUCT_VIEW_ATTRIBUTES.listView,
        include: [
          {
            model: this.Category,
            as: 'category',
            attributes: ['category_id', 'category_name', 'category_code'],
            required: false
          },
          {
            model: this.models.MediaFile,
            as: 'primary_media',
            attributes: ['media_id', 'object_key', 'mime_type', 'thumbnail_keys'],
            required: false
          },
          {
            model: this.models.RarityDef,
            as: 'rarityDef',
            attributes: ['rarity_code', 'display_name', 'color_hex', 'tier'],
            required: false
          },
          {
            model: this.ProductSku,
            as: 'skus',
            where: { status: 'active' },
            required: hasPriceFilter,
            attributes: ['sku_id', 'sku_code', 'stock', 'sold_count', 'status', 'sort_order'],
            include: [
              {
                model: this.ExchangeChannelPrice,
                as: 'channelPrices',
                where: priceWhere,
                required: hasPriceFilter,
                attributes: [
                  'id',
                  'cost_asset_code',
                  'cost_amount',
                  'original_amount',
                  'is_enabled'
                ]
              }
            ]
          }
        ],
        limit,
        offset,
        order: [
          ['is_pinned', 'DESC'],
          ['pinned_at', 'DESC'],
          ['is_recommended', 'DESC'],
          ['sort_order', 'ASC'],
          [sort_by, sort_order]
        ],
        distinct: true,
        subQuery: false
      })

      logger.info(`[商品中心] 找到${count}个商品，返回第${page}页（${rows.length}个）`)

      const items = rows.map(p => this._formatProductForListing(p))

      return {
        items,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error('[商品中心] 查询商品列表失败:', error.message)
      throw new Error(`查询商品列表失败: ${error.message}`)
    }
  }

  /**
   * 获取单个商品详情（Product 版本，替代 getItemDetail）
   *
   * 包含 SKU 列表、渠道定价、品类、稀有度、主图、画廊图等全量信息
   *
   * @param {number} productId - 商品 ID（products.product_id）
   * @returns {Promise<Object>} { item }
   */
  async getProductDetail(productId) {
    try {
      if (!this.Product) {
        throw new Error('Product 模型未注册，请检查 models 配置')
      }

      logger.info('[商品中心] 查询商品详情', { product_id: productId })

      const product = await this.Product.findOne({
        where: { product_id: productId },
        attributes: PRODUCT_VIEW_ATTRIBUTES.detailView,
        include: [
          {
            model: this.Category,
            as: 'category',
            attributes: ['category_id', 'category_name', 'category_code'],
            required: false
          },
          {
            model: this.models.MediaFile,
            as: 'primary_media',
            attributes: ['media_id', 'object_key', 'mime_type', 'thumbnail_keys'],
            required: false
          },
          {
            model: this.models.RarityDef,
            as: 'rarityDef',
            attributes: ['rarity_code', 'display_name', 'color_hex', 'tier'],
            required: false
          },
          {
            model: this.ProductSku,
            as: 'skus',
            where: { status: 'active' },
            required: false,
            attributes: [
              'sku_id',
              'sku_code',
              'stock',
              'sold_count',
              'cost_price',
              'status',
              'image_id',
              'sort_order'
            ],
            include: [
              {
                model: this.ExchangeChannelPrice,
                as: 'channelPrices',
                where: { is_enabled: true },
                required: false,
                attributes: [
                  'id',
                  'cost_asset_code',
                  'cost_amount',
                  'original_amount',
                  'is_enabled',
                  'publish_at',
                  'unpublish_at'
                ]
              },
              ...(this.models.MediaFile
                ? [
                    {
                      model: this.models.MediaFile,
                      as: 'skuImage',
                      attributes: ['media_id', 'object_key', 'mime_type', 'thumbnail_keys'],
                      required: false
                    }
                  ]
                : [])
            ]
          }
        ]
      })

      if (!product) {
        const err = new Error('商品不存在')
        err.statusCode = 404
        err.errorCode = 'PRODUCT_NOT_FOUND'
        throw err
      }

      // 画廊 / 详情图 / 展示图（通过 media_attachments）
      const { MediaAttachment, MediaFile } = this.models
      const { getImageUrl } = require('../../utils/ImageUrlHelper')

      const attachments =
        MediaAttachment && MediaFile
          ? await MediaAttachment.findAll({
              where: {
                attachable_type: 'product',
                attachable_id: productId
              },
              include: [
                {
                  model: MediaFile,
                  as: 'media',
                  attributes: ['media_id', 'object_key', 'mime_type', 'thumbnail_keys']
                }
              ],
              order: [['sort_order', 'ASC']]
            })
          : []

      const toImageJson = a => {
        const m = a.media || a.Media
        if (!m) return null
        const url = m.object_key ? getImageUrl(m.object_key) : null
        return {
          media_id: m.media_id,
          url,
          mime: m.mime_type,
          thumbnail_url: m.thumbnail_keys?.small ? getImageUrl(m.thumbnail_keys.small) : url
        }
      }

      const images = attachments
        .filter(a => a.role === 'gallery' || a.role === 'products')
        .map(toImageJson)
        .filter(Boolean)
      const detail_images = attachments
        .filter(a => a.role === 'detail')
        .map(toImageJson)
        .filter(Boolean)
      const showcase_images = attachments
        .filter(a => a.role === 'showcase')
        .map(toImageJson)
        .filter(Boolean)

      const itemJSON = this._formatProductForDetail(product)
      itemJSON.images = images
      itemJSON.detail_images = detail_images
      itemJSON.showcase_images = showcase_images

      return { item: itemJSON }
    } catch (error) {
      logger.error(`[商品中心] 查询商品详情失败(product_id:${productId}):`, error.message)
      throw error
    }
  }

  /**
   * 获取统一商品统计数据（替代 getMarketStatistics 中的商品统计部分）
   *
   * 统计维度：商品状态分布、SKU 库存/销量汇总、空间分布
   *
   * @returns {Promise<Object>} { statistics: { products, skus, spaces } }
   */
  async getProductStats() {
    try {
      if (!this.Product) {
        throw new Error('Product 模型未注册，请检查 models 配置')
      }

      logger.info('[商品中心] 查询商品统计数据')

      const [productStatusRows, skuStatusRows, spaceRows] = await Promise.all([
        // 商品按状态分组计数
        this.Product.findAll({
          attributes: [
            'status',
            [this.sequelize.fn('COUNT', this.sequelize.col('product_id')), 'count']
          ],
          group: ['status'],
          raw: true
        }),
        // SKU 按状态分组计数、库存/销量合计
        this.ProductSku.findAll({
          attributes: [
            'status',
            [this.sequelize.fn('COUNT', this.sequelize.col('sku_id')), 'sku_count'],
            [this.sequelize.fn('SUM', this.sequelize.col('stock')), 'total_stock'],
            [this.sequelize.fn('SUM', this.sequelize.col('sold_count')), 'total_sold']
          ],
          group: ['status'],
          raw: true
        }),
        // 在售商品按空间分组计数
        this.Product.findAll({
          attributes: [
            'space',
            [this.sequelize.fn('COUNT', this.sequelize.col('product_id')), 'count']
          ],
          where: { status: 'active' },
          group: ['space'],
          raw: true
        })
      ])

      const byStatus = {}
      productStatusRows.forEach(row => {
        byStatus[row.status] = parseInt(row.count, 10)
      })

      const skuByStatus = {}
      let totalStock = 0
      let totalSold = 0
      skuStatusRows.forEach(row => {
        const stock = parseInt(row.total_stock || 0, 10)
        const sold = parseInt(row.total_sold || 0, 10)
        skuByStatus[row.status] = {
          count: parseInt(row.sku_count, 10),
          stock,
          sold
        }
        totalStock += stock
        totalSold += sold
      })

      const spaces = {}
      spaceRows.forEach(row => {
        spaces[row.space] = parseInt(row.count, 10)
      })

      return {
        statistics: {
          products: {
            by_status: byStatus,
            total: Object.values(byStatus).reduce((s, v) => s + v, 0)
          },
          skus: {
            by_status: skuByStatus,
            total_stock: totalStock,
            total_sold: totalSold
          },
          spaces
        }
      }
    } catch (error) {
      logger.error('[商品中心] 查询商品统计失败:', error.message)
      throw new Error(`查询商品统计失败: ${error.message}`)
    }
  }

  /*
   * =====================================================================
   *  Product 查询私有工具方法
   * =====================================================================
   */

  /**
   * 将 category_code 或 category_id 解析为该品类及其所有子品类 ID 列表
   *
   * @param {string|number} category - 品类代码或品类 ID
   * @returns {Promise<number[]|null>} 品类 ID 数组，无法解析时返回 null
   * @private
   */
  async _resolveCategoryIds(category) {
    if (category == null) return null
    const CategoryModel = this.Category
    if (!CategoryModel) return null

    let categoryId
    const num = parseInt(category, 10)
    if (!Number.isNaN(num) && String(num) === String(category)) {
      categoryId = num
    } else {
      const cat = await CategoryModel.findOne({
        where: { category_code: String(category) },
        attributes: ['category_id']
      })
      categoryId = cat ? cat.category_id : null
    }

    if (!categoryId) return null

    const children = await CategoryModel.findAll({
      where: { parent_category_id: categoryId },
      attributes: ['category_id']
    })

    return [categoryId, ...children.map(c => c.category_id)]
  }

  /**
   * 将 Product 实例格式化为列表视图 JSON（含前端兼容字段）
   *
   * 兼容映射：product_id → exchange_item_id、product_name → item_name 等
   *
   * @param {Model} product - Product Sequelize 实例
   * @returns {Object} 格式化后的商品 JSON
   * @private
   */
  _formatProductForListing(product) {
    const json = product.toJSON()

    const totalStock = (json.skus || []).reduce((sum, sku) => sum + (sku.stock || 0), 0)
    const totalSoldCount = (json.skus || []).reduce((sum, sku) => sum + (sku.sold_count || 0), 0)

    let cheapestPrice = null
    for (const sku of json.skus || []) {
      for (const price of sku.channelPrices || []) {
        if (!cheapestPrice || price.cost_amount < cheapestPrice.cost_amount) {
          cheapestPrice = price
        }
      }
    }

    return {
      ...json,
      exchange_item_id: json.product_id,
      item_name: json.product_name,
      stock: totalStock,
      sold_count: totalSoldCount,
      cost_asset_code: cheapestPrice?.cost_asset_code || null,
      cost_amount: cheapestPrice?.cost_amount || null,
      original_price: cheapestPrice?.original_amount || null,
      category_def_id: json.category_id
    }
  }

  /**
   * 将 Product 实例格式化为详情视图 JSON（含前端兼容字段）
   *
   * @param {Model} product - Product Sequelize 实例（含 skus、channelPrices 等嵌套）
   * @returns {Object} 格式化后的商品详情 JSON
   * @private
   */
  _formatProductForDetail(product) {
    const json = product.toJSON()

    const totalStock = (json.skus || []).reduce((sum, sku) => sum + (sku.stock || 0), 0)
    const totalSoldCount = (json.skus || []).reduce((sum, sku) => sum + (sku.sold_count || 0), 0)

    let cheapestPrice = null
    for (const sku of json.skus || []) {
      for (const price of sku.channelPrices || []) {
        if (!cheapestPrice || price.cost_amount < cheapestPrice.cost_amount) {
          cheapestPrice = price
        }
      }
    }

    return {
      ...json,
      exchange_item_id: json.product_id,
      item_name: json.product_name,
      stock: totalStock,
      sold_count: totalSoldCount,
      cost_asset_code: cheapestPrice?.cost_asset_code || null,
      cost_amount: cheapestPrice?.cost_amount || null,
      original_price: cheapestPrice?.original_amount || null,
      category_def_id: json.category_id
    }
  }

  /**
   * 获取兑换趋势数据（按日统计）
   *
   * 业务场景：管理后台「统计分析」Tab 的兑换趋势图，展示每日兑换量变化
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.days=7] - 统计天数（7/14/30）
   * @returns {Promise<Object>} 趋势数据
   * @returns {Array<Object>} returns.trend - 每日兑换量数组
   * @returns {string} returns.trend[].date - 日期（YYYY-MM-DD）
   * @returns {number} returns.trend[].order_count - 当日兑换订单数
   * @returns {number} returns.trend[].completed_count - 当日完成订单数
   * @returns {number} returns.trend[].total_amount - 当日材料消耗总量
   */
  async getExchangeTrend({ days = 7 } = {}) {
    try {
      const validDays = [7, 14, 30].includes(days) ? days : 7
      logger.info('[兑换市场] 查询兑换趋势', { days: validDays })

      const startDate = new Date()
      startDate.setDate(startDate.getDate() - validDays)
      startDate.setHours(0, 0, 0, 0)

      const results = await this.sequelize.query(
        `SELECT
          DATE(created_at) AS date,
          COUNT(*) AS order_count,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
          COALESCE(SUM(pay_amount), 0) AS total_amount
        FROM exchange_records
        WHERE created_at >= :start_date
        GROUP BY DATE(created_at)
        ORDER BY date ASC`,
        {
          replacements: { start_date: startDate },
          type: this.sequelize.QueryTypes.SELECT
        }
      )

      // 补齐无数据的日期（确保前端图表连续）
      const trend = []
      const resultMap = new Map()
      results.forEach(r => {
        const dateStr =
          typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().slice(0, 10)
        resultMap.set(dateStr, r)
      })

      for (let i = 0; i < validDays; i++) {
        const d = new Date(startDate)
        d.setDate(d.getDate() + i)
        const dateStr = d.toISOString().slice(0, 10)
        const row = resultMap.get(dateStr)
        trend.push({
          date: dateStr,
          order_count: parseInt(row?.order_count || 0, 10),
          completed_count: parseInt(row?.completed_count || 0, 10),
          total_amount: parseInt(row?.total_amount || 0, 10)
        })
      }

      return { days: validDays, trend }
    } catch (error) {
      logger.error('[兑换市场] 查询兑换趋势失败:', error.message)
      throw new Error(`查询兑换趋势失败: ${error.message}`)
    }
  }

  /**
   * 获取商品排行榜（按兑换量/库存周转排序）
   *
   * 业务场景：管理后台「统计分析」Tab 的商品排行，展示兑换量 Top N 商品
   *
   * @param {Object} options - 查询参数
   * @param {string} [options.sort_by='sold_count'] - 排序字段（sold_count / stock_turnover / avg_rating）
   * @param {number} [options.limit=10] - 返回数量
   * @returns {Promise<Object>} 排行数据
   * @returns {Array<Object>} returns.ranking - 排行列表
   * @returns {number} returns.ranking[].exchange_item_id - 商品ID
   * @returns {string} returns.ranking[].item_name - 商品名称
   * @returns {number} returns.ranking[].sold_count - 总销量
   * @returns {number} returns.ranking[].stock - 当前库存
   * @returns {number} returns.ranking[].stock_turnover - 库存周转率（sold_count / (stock + sold_count)）
   * @returns {number|null} returns.ranking[].avg_rating - 平均评分
   */
  async getItemRanking({ sort_by = 'sold_count', limit = 10 } = {}) {
    try {
      const validLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50)
      const validSortBy = ['sold_count', 'stock_turnover', 'avg_rating'].includes(sort_by)
        ? sort_by
        : 'sold_count'

      logger.info('[兑换市场] 查询商品排行', { sort_by: validSortBy, limit: validLimit })

      // 基础查询：商品信息 + 平均评分
      const rows = await this.sequelize.query(
        `SELECT
          p.product_id,
          p.product_name,
          COALESCE(SUM(ps.sold_count), 0) AS sold_count,
          COALESCE(SUM(ps.stock), 0) AS stock,
          MIN(ecp.cost_amount) AS cost_amount,
          p.status,
          ROUND(COALESCE(SUM(ps.sold_count), 0) / GREATEST(COALESCE(SUM(ps.stock), 0) + COALESCE(SUM(ps.sold_count), 0), 1), 4) AS stock_turnover,
          AVG(er.rating) AS avg_rating,
          COUNT(DISTINCT er.exchange_record_id) AS total_orders
        FROM products p
        LEFT JOIN product_skus ps ON ps.product_id = p.product_id AND ps.status = 'active'
        LEFT JOIN exchange_channel_prices ecp ON ecp.sku_id = ps.sku_id
        LEFT JOIN exchange_records er
          ON er.product_id = p.product_id
          AND er.rating IS NOT NULL
        GROUP BY p.product_id
        ORDER BY ${validSortBy === 'stock_turnover' ? 'stock_turnover' : validSortBy === 'avg_rating' ? 'avg_rating' : 'sold_count'} DESC
        LIMIT :limit`,
        {
          replacements: { limit: validLimit },
          type: this.sequelize.QueryTypes.SELECT
        }
      )

      const ranking = rows.map((r, index) => ({
        rank: index + 1,
        exchange_item_id: r.product_id,
        item_name: r.product_name,
        sold_count: parseInt(r.sold_count || 0, 10),
        stock: parseInt(r.stock || 0, 10),
        cost_amount: r.cost_amount,
        status: r.status,
        stock_turnover: parseFloat(r.stock_turnover || 0),
        avg_rating: r.avg_rating ? parseFloat(parseFloat(r.avg_rating).toFixed(2)) : null,
        total_orders: parseInt(r.total_orders || 0, 10)
      }))

      return { sort_by: validSortBy, limit: validLimit, ranking }
    } catch (error) {
      logger.error('[兑换市场] 查询商品排行失败:', error.message)
      throw new Error(`查询商品排行失败: ${error.message}`)
    }
  }
}

module.exports = QueryService
