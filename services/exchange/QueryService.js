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
 * 🎯 统一数据输出视图常量（Data Output View Constants）
 */
const EXCHANGE_MARKET_ATTRIBUTES = {
  /**
   * 市场商品列表视图（用户浏览）
   * 包含臻选空间/幸运空间扩展字段（决策12：9个新字段）
   */
  marketItemView: [
    'exchange_item_id',
    'item_name',
    'description',
    'cost_asset_code',
    'cost_amount',
    'stock',
    'sold_count',
    'sort_order',
    'status',
    'primary_media_id',
    'category_def_id',
    // 臻选空间/幸运空间扩展字段（9个）
    'space',
    'original_price',
    'tags',
    'is_new',
    'is_hot',
    'is_lucky',
    'has_warranty',
    'free_shipping',
    'is_limited',
    'sell_point',
    'rarity_code',
    'usage_rules',
    'created_at'
  ],

  /**
   * 商品详情视图
   * 包含臻选空间/幸运空间扩展字段 + 稀有度 + 详情页增强字段
   */
  marketItemDetailView: [
    'exchange_item_id',
    'item_name',
    'description',
    'cost_asset_code',
    'cost_amount',
    'stock',
    'sold_count',
    'sort_order',
    'status',
    'primary_media_id',
    'category_def_id',
    // 臻选空间/幸运空间扩展字段（9个）
    'space',
    'original_price',
    'tags',
    'is_new',
    'is_hot',
    'is_lucky',
    'has_warranty',
    'free_shipping',
    'is_limited',
    'sell_point',
    'usage_rules',
    'rarity_code',
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
    this.ExchangeItem = models.ExchangeItem
    this.ExchangeRecord = models.ExchangeRecord
    this.ExchangeOrderEvent = models.ExchangeOrderEvent
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

      // 构建查询条件
      const where = { status }

      // 材料资产类型筛选
      if (asset_code) {
        where.cost_asset_code = asset_code
      }

      // 空间筛选（lucky/premium）— 臻选空间/幸运空间核心逻辑
      if (space) {
        // space='lucky' 时查 lucky 和 both；space='premium' 时查 premium 和 both
        where.space = { [Op.in]: [space, 'both'] }
      }

      // 关键词搜索（匹配 item_name）
      if (keyword) {
        where.item_name = { [Op.like]: `%${keyword}%` }
      }

      // 分类筛选（支持两级分类：选择一级分类时自动包含其下所有子分类商品）
      if (category) {
        const categoryDefId = await this._resolveCategoryDefId(category)
        if (categoryDefId !== null) {
          const { CategoryDef } = this.models
          const categoryIds = await CategoryDef.getIdsWithChildren(categoryDefId)
          where.category_def_id = { [Op.in]: categoryIds }
        }
      }

      // 排除指定商品（用于详情页"相关推荐"，排除当前商品自身）
      if (exclude_id) {
        where.exchange_item_id = { [Op.ne]: parseInt(exclude_id, 10) }
      }

      // 价格范围筛选
      if (min_cost !== null) {
        where.cost_amount = { ...where.cost_amount, [Op.gte]: parseInt(min_cost, 10) }
      }
      if (max_cost !== null) {
        where.cost_amount = { ...where.cost_amount, [Op.lte]: parseInt(max_cost, 10) }
      }

      // 库存状态筛选
      if (stock_status === 'in_stock') {
        where.stock = { [Op.gt]: 5 }
      } else if (stock_status === 'low_stock') {
        where.stock = { [Op.between]: [1, 5] }
      }

      const offset = (page - 1) * page_size
      const limit = page_size

      const { count, rows } = await this.ExchangeItem.findAndCountAll({
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
      const item = await this.ExchangeItem.findOne({
        where: { exchange_item_id: item_id },
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
            model: this.models.CategoryDef,
            as: 'categoryDef',
            attributes: ['category_code', 'display_name'],
            required: false
          },
          ...(this.models.ExchangeItemSku
            ? [
                {
                  model: this.models.ExchangeItemSku,
                  as: 'skus',
                  where: { status: 'active' },
                  required: false,
                  order: [['sort_order', 'ASC']],
                  attributes: [
                    'sku_id',
                    'spec_values',
                    'cost_asset_code',
                    'cost_amount',
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

      // 多图数据：通过 media_attachments 获取（image_resources 表已删除）
      const { MediaAttachment, MediaFile } = this.models
      const { getImageUrl } = require('../../utils/ImageUrlHelper')
      const attachments =
        MediaAttachment && MediaFile
          ? await MediaAttachment.findAll({
              where: {
                attachable_type: 'exchange_item',
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
   * @param {number} [options.exchange_item_id] - 商品ID筛选
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
        exchange_item_id,
        order_no,
        page,
        page_size
      })

      const where = {}
      if (status) where.status = status
      if (user_id) where.user_id = user_id
      if (exchange_item_id) where.exchange_item_id = exchange_item_id
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

      // 查询商品库存统计
      const itemStats = await this.ExchangeItem.findAll({
        attributes: [
          'status',
          [this.sequelize.fn('COUNT', this.sequelize.col('exchange_item_id')), 'count'],
          [this.sequelize.fn('SUM', this.sequelize.col('stock')), 'total_stock']
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

      const [totalProducts, newCount, hotCount, assetDistribution] = await Promise.all([
        // 该空间商品总数（仅 active）
        this.ExchangeItem.count({
          where: { space: spaceCondition, status: 'active' }
        }),
        // 新品数量
        this.ExchangeItem.count({
          where: { space: spaceCondition, status: 'active', is_new: true }
        }),
        // 热门数量
        this.ExchangeItem.count({
          where: { space: spaceCondition, status: 'active', is_hot: true }
        }),
        // 资产类型分布
        this.ExchangeItem.findAll({
          attributes: [
            'cost_asset_code',
            [this.sequelize.fn('COUNT', this.sequelize.col('exchange_item_id')), 'count']
          ],
          where: { space: spaceCondition, status: 'active' },
          group: ['cost_asset_code'],
          raw: true
        })
      ])

      // 转换资产分布为对象格式
      const assetCodeDistribution = {}
      assetDistribution.forEach(row => {
        assetCodeDistribution[row.cost_asset_code] = parseInt(row.count, 10)
      })

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
    const { status, asset_code, space, keyword, category, min_cost, max_cost, stock_status } =
      filterValues

    try {
      const { sequelize } = this.ExchangeItem

      /**
       * 构建基础 WHERE（status + asset_code + space + keyword 不参与维度排除，始终保留）
       * 这些是"全局筛选"，不属于 facet 维度
       *
       * @returns {Object} SQL 片段和参数 { parts, replacements }
       */
      const buildBaseWhere = () => {
        const parts = ['ei.status = :status']
        const replacements = { status }

        if (asset_code) {
          parts.push('ei.cost_asset_code = :asset_code')
          replacements.asset_code = asset_code
        }
        if (space) {
          parts.push('ei.space IN (:space_values)')
          replacements.space_values = [space, 'both']
        }
        if (keyword) {
          parts.push('ei.item_name LIKE :keyword')
          replacements.keyword = `%${keyword}%`
        }
        return { parts, replacements }
      }

      // 1. 分类计数：排除 category 条件，保留 price + stock 条件
      const catBase = buildBaseWhere()
      if (min_cost !== null) {
        catBase.parts.push('ei.cost_amount >= :min_cost')
        catBase.replacements.min_cost = parseInt(min_cost, 10)
      }
      if (max_cost !== null) {
        catBase.parts.push('ei.cost_amount <= :max_cost')
        catBase.replacements.max_cost = parseInt(max_cost, 10)
      }
      if (stock_status === 'in_stock') {
        catBase.parts.push('ei.stock > 5')
      } else if (stock_status === 'low_stock') {
        catBase.parts.push('ei.stock BETWEEN 1 AND 5')
      }

      // 2. 价格区间计数：排除 price 条件，保留 category + stock 条件（支持两级分类）
      const priceBase = buildBaseWhere()
      if (category) {
        const catDefId = await this._resolveCategoryDefId(category)
        if (catDefId !== null) {
          const { CategoryDef } = this.models
          const catIds = await CategoryDef.getIdsWithChildren(catDefId)
          priceBase.parts.push(`ei.category_def_id IN (${catIds.join(',')})`)
        }
      }
      if (stock_status === 'in_stock') {
        priceBase.parts.push('ei.stock > 5')
      } else if (stock_status === 'low_stock') {
        priceBase.parts.push('ei.stock BETWEEN 1 AND 5')
      }

      // 3. 库存状态计数：排除 stock 条件，保留 category + price 条件（支持两级分类）
      const stockBase = buildBaseWhere()
      if (category) {
        const catDefIdS = await this._resolveCategoryDefId(category)
        if (catDefIdS !== null) {
          const { CategoryDef } = this.models
          const catIdsS = await CategoryDef.getIdsWithChildren(catDefIdS)
          stockBase.parts.push(`ei.category_def_id IN (${catIdsS.join(',')})`)
        }
      }
      if (min_cost !== null) {
        stockBase.parts.push('ei.cost_amount >= :min_cost_s')
        stockBase.replacements.min_cost_s = parseInt(min_cost, 10)
      }
      if (max_cost !== null) {
        stockBase.parts.push('ei.cost_amount <= :max_cost_s')
        stockBase.replacements.max_cost_s = parseInt(max_cost, 10)
      }

      // 并行执行 3 个聚合查询（category_def_id 迁移：JOIN category_defs 获取 category_code）
      const [categoryRows, priceRows, stockRows] = await Promise.all([
        // 分类维度计数（按 category_def_id 分组，关联 category_defs 取 category_code）
        sequelize.query(
          `SELECT COALESCE(cd.category_code, '__null__') AS category_code, COUNT(*) AS cnt
           FROM exchange_items ei
           LEFT JOIN category_defs cd ON ei.category_def_id = cd.category_def_id
           WHERE ${catBase.parts.join(' AND ')}
           GROUP BY ei.category_def_id, cd.category_code`,
          { replacements: catBase.replacements, type: sequelize.constructor.QueryTypes.SELECT }
        ),
        // 价格区间维度计数（区间定义：0-100, 100-500, 500-1000, 1000+）
        sequelize.query(
          `SELECT
             SUM(CASE WHEN ei.cost_amount <= 100 THEN 1 ELSE 0 END) AS range_0_100,
             SUM(CASE WHEN ei.cost_amount > 100 AND ei.cost_amount <= 500 THEN 1 ELSE 0 END) AS range_100_500,
             SUM(CASE WHEN ei.cost_amount > 500 AND ei.cost_amount <= 1000 THEN 1 ELSE 0 END) AS range_500_1000,
             SUM(CASE WHEN ei.cost_amount > 1000 THEN 1 ELSE 0 END) AS range_1000_plus,
             COUNT(*) AS total
           FROM exchange_items ei
           WHERE ${priceBase.parts.join(' AND ')}`,
          { replacements: priceBase.replacements, type: sequelize.constructor.QueryTypes.SELECT }
        ),
        // 库存状态维度计数
        sequelize.query(
          `SELECT
             SUM(CASE WHEN ei.stock > 5 THEN 1 ELSE 0 END) AS in_stock,
             SUM(CASE WHEN ei.stock BETWEEN 1 AND 5 THEN 1 ELSE 0 END) AS low_stock,
             SUM(CASE WHEN ei.stock = 0 THEN 1 ELSE 0 END) AS out_of_stock,
             COUNT(*) AS total
           FROM exchange_items ei
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
      const { sequelize } = this.ExchangeItem

      // 1. 计算近7天趋势销量（trending_count）
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const [trendingResult] = await sequelize.query(
        `SELECT COUNT(*) AS trending_count
         FROM exchange_records er
         INNER JOIN exchange_items ei ON er.exchange_item_id = ei.exchange_item_id
         WHERE er.created_at >= :seven_days_ago
           AND er.status IN ('completed', 'shipped', 'pending')
           AND ei.status = :item_status`,
        {
          replacements: {
            seven_days_ago: sevenDaysAgo,
            item_status: where.status || 'active'
          },
          type: sequelize.constructor.QueryTypes.SELECT
        }
      )

      // 2. 计算平均折扣率（avg_discount）+ 平均评分（avg_rating）
      const [discountAndRatingResult] = await sequelize.query(
        `SELECT
           AVG(CASE WHEN ei.original_price > 0 THEN ei.cost_amount / ei.original_price END) AS avg_discount,
           COUNT(CASE WHEN ei.original_price > 0 THEN 1 END) AS has_original_price_count,
           AVG(er.rating) AS avg_rating,
           COUNT(er.rating) AS rated_order_count
         FROM exchange_items ei
         LEFT JOIN exchange_records er
           ON er.exchange_item_id = ei.exchange_item_id AND er.rating IS NOT NULL
         WHERE ei.status = :item_status`,
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
          ei.exchange_item_id,
          ei.item_name,
          ei.sold_count,
          ei.stock,
          ei.cost_amount,
          ei.status,
          ROUND(ei.sold_count / GREATEST(ei.stock + ei.sold_count, 1), 4) AS stock_turnover,
          AVG(er.rating) AS avg_rating,
          COUNT(er.exchange_record_id) AS total_orders
        FROM exchange_items ei
        LEFT JOIN exchange_records er
          ON er.exchange_item_id = ei.exchange_item_id
          AND er.rating IS NOT NULL
        GROUP BY ei.exchange_item_id
        ORDER BY ${validSortBy === 'stock_turnover' ? 'stock_turnover' : validSortBy === 'avg_rating' ? 'avg_rating' : 'ei.sold_count'} DESC
        LIMIT :limit`,
        {
          replacements: { limit: validLimit },
          type: this.sequelize.QueryTypes.SELECT
        }
      )

      const ranking = rows.map((r, index) => ({
        rank: index + 1,
        exchange_item_id: r.exchange_item_id,
        item_name: r.item_name,
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
