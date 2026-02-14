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
const BeijingTimeHelper = require('../../utils/timeHelper')
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
    'primary_image_id',
    // 臻选空间/幸运空间扩展字段（9个）
    'space',
    'original_price',
    'tags',
    'is_new',
    'is_hot',
    'is_lucky',
    'has_warranty',
    'free_shipping',
    'sell_point',
    'created_at'
  ],

  /**
   * 商品详情视图
   * 包含臻选空间/幸运空间扩展字段
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
    'primary_image_id',
    // 臻选空间/幸运空间扩展字段（9个）
    'space',
    'original_price',
    'tags',
    'is_new',
    'is_hot',
    'is_lucky',
    'has_warranty',
    'free_shipping',
    'sell_point',
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
    this.ImageResources = models.ImageResources
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
   * @param {boolean} [options.refresh=false] - 强制刷新缓存
   * @returns {Promise<Object>} 商品列表和分页信息
   */
  async getMarketItems(options = {}) {
    const {
      status = 'active',
      asset_code = null,
      space = null,
      keyword = null,
      category = null,
      min_cost = null,
      max_cost = null,
      stock_status = null,
      page = 1,
      page_size = 20,
      sort_by = 'sort_order',
      sort_order = 'ASC',
      refresh = false
    } = options

    try {
      // Redis 缓存读取
      const cacheParams = {
        status,
        asset_code: asset_code || 'all',
        space: space || 'all',
        keyword: keyword || '',
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

      // 分类筛选
      if (category) {
        where.category = category
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
            model: this.ImageResources,
            as: 'primaryImage',
            attributes: ['image_resource_id', 'file_path', 'mime_type', 'thumbnail_paths'],
            required: false
          }
        ],
        limit,
        offset,
        order: [[sort_by, sort_order]]
      })

      logger.info(`[兑换市场] 找到${count}个商品，返回第${page}页（${rows.length}个）`)

      // 添加中文显示名称
      const itemsWithDisplayNames = await displayNameHelper.attachDisplayNames(
        rows.map(item => item.toJSON()),
        [{ field: 'status', dictType: 'product_status' }]
      )

      const result = {
        success: true,
        items: itemsWithDisplayNames,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        },
        timestamp: BeijingTimeHelper.now()
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
        where: { item_id },
        attributes: EXCHANGE_MARKET_ATTRIBUTES.marketItemDetailView,
        include: [
          {
            model: this.ImageResources,
            as: 'primaryImage',
            attributes: ['image_resource_id', 'file_path', 'mime_type', 'thumbnail_paths'],
            required: false
          }
        ]
      })

      if (!item) {
        throw new Error('商品不存在')
      }

      // 添加中文显示名称
      const itemWithDisplayNames = await displayNameHelper.attachDisplayNames(item.toJSON(), [
        { field: 'status', dictType: 'product_status' }
      ])

      return {
        success: true,
        item: itemWithDisplayNames,
        timestamp: BeijingTimeHelper.now()
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
        success: true,
        orders: ordersWithDisplayNames,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        },
        timestamp: BeijingTimeHelper.now()
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
        throw new Error('订单不存在或无权访问')
      }

      // 添加中文显示名称
      const orderWithDisplayNames = await displayNameHelper.attachDisplayNames(order.toJSON(), [
        { field: 'status', dictType: 'exchange_status' }
      ])

      return {
        success: true,
        order: orderWithDisplayNames,
        timestamp: BeijingTimeHelper.now()
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
        success: true,
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
        },
        timestamp: BeijingTimeHelper.now()
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

      const order = await this.ExchangeRecord.findOne({
        where: { order_no },
        attributes: EXCHANGE_MARKET_ATTRIBUTES.adminMarketOrderView
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

      // 添加中文显示名称
      const orderWithDisplayNames = await displayNameHelper.attachDisplayNames(order.toJSON(), [
        { field: 'status', dictType: 'exchange_status' }
      ])

      return {
        success: true,
        order: orderWithDisplayNames,
        timestamp: BeijingTimeHelper.now()
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
        success: true,
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
        },
        timestamp: BeijingTimeHelper.now()
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
}

module.exports = QueryService
