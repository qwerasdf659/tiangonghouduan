/**
 * 餐厅积分抽奖系统 V4.0 - 市场管理API
 *
 * @description 管理员查看市场统计信息和用户上架状态
 * @version 1.0.0
 * @created 2025-12-05
 *
 * 核心功能：
 * - 查询所有用户的上架统计
 * - 识别接近上限和达到上限的用户
 * - 分页查询和筛选
 */

const express = require('express')
const router = express.Router()
const models = require('../../../../models')
const { authenticateToken, requireAdmin } = require('../../../../middleware/auth')
const Logger = require('../../../../services/UnifiedLotteryEngine/utils/Logger')
const marketplaceConfig = require('../../../../config/marketplace.config')

const logger = new Logger('MarketplaceAdminAPI')

/**
 * 管理员查询所有用户上架状态
 * GET /api/v4/admin/marketplace/listing-stats
 *
 * @description 查询所有用户的上架状态统计，支持筛选和分页
 *
 * 🎯 核心功能：
 * 1. 按用户分组统计在售商品数量
 * 2. 支持筛选（全部/接近上限/达到上限）
 * 3. 分页查询
 * 4. 返回用户详情和统计信息
 *
 * @query {number} page - 页码（默认1）
 * @query {number} limit - 每页数量（默认20）
 * @query {string} filter - 筛选条件：all/near_limit/at_limit（默认all）
 *
 * @returns {Object} 统计数据
 * @returns {Array} data.stats - 用户上架统计列表
 * @returns {Object} data.pagination - 分页信息
 * @returns {Object} data.summary - 总体统计摘要
 */
router.get('/listing-stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, filter = 'all' } = req.query
    const offset = (page - 1) * limit
    const maxListings = marketplaceConfig.max_active_listings

    logger.info('管理员查询用户上架状态', {
      admin_id: req.user.user_id,
      page,
      limit,
      filter
    })

    /*
     * 🔥 核心查询：按用户分组统计在售商品数量
     * GROUP BY user_id，使用idx_user_inventory_user_market索引
     */
    const stats = await models.UserInventory.findAll({
      attributes: [
        'user_id',
        [models.sequelize.fn('COUNT', models.sequelize.col('inventory_id')), 'active_listings']
      ],
      where: {
        market_status: 'on_sale'
      },
      include: [
        {
          model: models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile', 'created_at'],
          required: true
        }
      ],
      group: ['user_id'],
      order: [[models.sequelize.literal('active_listings'), 'DESC']],
      raw: true
    })

    // 应用筛选条件
    let filteredStats = stats
    if (filter === 'near_limit') {
      // 接近上限：8-9件
      filteredStats = stats.filter(
        item => item.active_listings >= 8 && item.active_listings < maxListings
      )
    } else if (filter === 'at_limit') {
      // 达到上限：10件及以上
      filteredStats = stats.filter(item => item.active_listings >= maxListings)
    }

    // 分页处理
    const totalCount = filteredStats.length
    const paginatedStats = filteredStats.slice(offset, offset + parseInt(limit))

    // 格式化返回数据
    const formattedStats = paginatedStats.map(item => {
      const activeListings = parseInt(item.active_listings)
      let status = 'normal'
      if (activeListings >= maxListings) {
        status = 'at_limit'
      } else if (activeListings >= 8) {
        status = 'near_limit'
      }

      return {
        user_id: item.user_id,
        nickname: item['user.nickname'],
        mobile: item['user.mobile'],
        active_listings: activeListings,
        limit: maxListings,
        remaining: maxListings - activeListings,
        percentage: Math.round((activeListings / maxListings) * 100),
        status,
        registered_at: item['user.created_at']
      }
    })

    // 计算总体统计摘要
    const summary = {
      total_users_with_listings: stats.length,
      users_at_limit: stats.filter(s => s.active_listings >= maxListings).length,
      users_near_limit: stats.filter(s => s.active_listings >= 8 && s.active_listings < maxListings)
        .length
    }

    logger.info('查询用户上架状态成功', {
      admin_id: req.user.user_id,
      total_users: summary.total_users_with_listings,
      filtered_count: totalCount,
      page: parseInt(page)
    })

    return res.apiSuccess({
      stats: formattedStats,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total: totalCount,
        total_pages: Math.ceil(totalCount / limit)
      },
      summary
    })
  } catch (error) {
    logger.error('查询用户上架状态失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })

    return res.apiError(error.message || '查询失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 创建兑换商品（管理员操作）
 * POST /api/v4/admin/exchange_market/items
 *
 * @body {string} item_name - 商品名称（必填，最长100字符）
 * @body {string} item_description - 商品描述（可选，最长500字符）
 * @body {string} price_type - 支付方式（必填：只支持 virtual）
 * @body {number} virtual_value_price - 虚拟价值价格（必填，实际扣除的虚拟奖品价值）
 * @body {number} points_price - 积分价格（可选，仅用于前端展示，不扣除用户显示积分）
 * @body {number} cost_price - 成本价（必填）
 * @body {number} stock - 初始库存（必填，>=0）
 * @body {number} sort_order - 排序号（必填，默认100）
 * @body {string} status - 商品状态（必填：active/inactive）
 */
router.post('/exchange_market/items', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      item_name,
      item_description = '',
      price_type,
      virtual_value_price = 0,
      points_price = 0,
      cost_price,
      stock,
      sort_order = 100,
      status = 'active'
    } = req.body

    const admin_id = req.user.user_id

    logger.info('管理员创建兑换商品', {
      admin_id,
      item_name,
      price_type,
      stock
    })

    // 参数验证
    if (!item_name || item_name.trim().length === 0) {
      return res.apiError('商品名称不能为空', 'BAD_REQUEST', null, 400)
    }

    if (item_name.length > 100) {
      return res.apiError('商品名称最长100字符', 'BAD_REQUEST', null, 400)
    }

    if (item_description && item_description.length > 500) {
      return res.apiError('商品描述最长500字符', 'BAD_REQUEST', null, 400)
    }

    const validPriceTypes = ['virtual']
    if (!validPriceTypes.includes(price_type)) {
      return res.apiError(
        '无效的price_type参数，当前只支持 virtual（虚拟奖品价值支付）',
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 虚拟价值价格验证（必填）
    if (!virtual_value_price || virtual_value_price <= 0) {
      return res.apiError('虚拟价值价格必须大于0', 'BAD_REQUEST', null, 400)
    }

    if (cost_price === undefined || cost_price < 0) {
      return res.apiError('成本价必须大于等于0', 'BAD_REQUEST', null, 400)
    }

    if (stock === undefined || stock < 0) {
      return res.apiError('库存必须大于等于0', 'BAD_REQUEST', null, 400)
    }

    const validStatuses = ['active', 'inactive']
    if (!validStatuses.includes(status)) {
      return res.apiError(
        `无效的status参数，允许值：${validStatuses.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 创建商品
    const { ExchangeItem } = models
    const BeijingTimeHelper = require('../../../../utils/timeHelper')
    const DataSanitizer = require('../../../../services/DataSanitizer')

    const item = await ExchangeItem.create({
      item_name: item_name.trim(),
      item_description: item_description.trim(),
      price_type,
      virtual_value_price: parseFloat(virtual_value_price) || 0,
      points_price: parseInt(points_price) || 0,
      cost_price: parseFloat(cost_price),
      stock: parseInt(stock),
      sort_order: parseInt(sort_order),
      status,
      created_at: BeijingTimeHelper.createDatabaseTime(),
      updated_at: BeijingTimeHelper.createDatabaseTime()
    })

    logger.info('兑换商品创建成功', {
      admin_id,
      item_id: item.item_id,
      item_name: item.item_name
    })

    return res.apiSuccess(
      {
        item: DataSanitizer.sanitizeExchangeMarketItem(item.toJSON(), 'full')
      },
      '商品创建成功'
    )
  } catch (error) {
    logger.error('创建兑换商品失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })
    return res.apiError(error.message || '创建商品失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 更新兑换商品（管理员操作）
 * PUT /api/v4/admin/exchange_market/items/:item_id
 *
 * @param {number} item_id - 商品ID
 */
router.put('/exchange_market/items/:item_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { item_id } = req.params
    const {
      item_name,
      item_description,
      price_type,
      virtual_value_price,
      points_price,
      cost_price,
      stock,
      sort_order,
      status
    } = req.body

    const admin_id = req.user.user_id

    logger.info('管理员更新兑换商品', {
      admin_id,
      item_id
    })

    // 参数验证
    const itemId = parseInt(item_id)
    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
    }

    // 查询商品
    const { ExchangeItem } = models
    const BeijingTimeHelper = require('../../../../utils/timeHelper')
    const DataSanitizer = require('../../../../services/DataSanitizer')

    const item = await ExchangeItem.findByPk(itemId)
    if (!item) {
      return res.apiError('商品不存在', 'NOT_FOUND', null, 404)
    }

    // 构建更新数据
    const updateData = { updated_at: BeijingTimeHelper.createDatabaseTime() }

    if (item_name !== undefined) {
      if (item_name.trim().length === 0) {
        return res.apiError('商品名称不能为空', 'BAD_REQUEST', null, 400)
      }
      if (item_name.length > 100) {
        return res.apiError('商品名称最长100字符', 'BAD_REQUEST', null, 400)
      }
      updateData.item_name = item_name.trim()
    }

    if (item_description !== undefined) {
      if (item_description.length > 500) {
        return res.apiError('商品描述最长500字符', 'BAD_REQUEST', null, 400)
      }
      updateData.item_description = item_description.trim()
    }

    if (price_type !== undefined) {
      const validPriceTypes = ['virtual']
      if (!validPriceTypes.includes(price_type)) {
        return res.apiError(
          '无效的price_type参数，当前只支持 virtual（虚拟奖品价值支付）',
          'BAD_REQUEST',
          null,
          400
        )
      }
      updateData.price_type = price_type
    }

    if (virtual_value_price !== undefined) {
      if (virtual_value_price < 0) {
        return res.apiError('虚拟价值价格必须大于等于0', 'BAD_REQUEST', null, 400)
      }
      updateData.virtual_value_price = parseFloat(virtual_value_price)
    }

    if (points_price !== undefined) {
      if (points_price < 0) {
        return res.apiError('积分价格必须大于等于0', 'BAD_REQUEST', null, 400)
      }
      updateData.points_price = parseInt(points_price)
    }

    if (cost_price !== undefined) {
      if (cost_price < 0) {
        return res.apiError('成本价必须大于等于0', 'BAD_REQUEST', null, 400)
      }
      updateData.cost_price = parseFloat(cost_price)
    }

    if (stock !== undefined) {
      if (stock < 0) {
        return res.apiError('库存必须大于等于0', 'BAD_REQUEST', null, 400)
      }
      updateData.stock = parseInt(stock)
    }

    if (sort_order !== undefined) {
      updateData.sort_order = parseInt(sort_order)
    }

    if (status !== undefined) {
      const validStatuses = ['active', 'inactive']
      if (!validStatuses.includes(status)) {
        return res.apiError(
          `无效的status参数，允许值：${validStatuses.join(', ')}`,
          'BAD_REQUEST',
          null,
          400
        )
      }
      updateData.status = status
    }

    // 更新商品
    await item.update(updateData)

    logger.info('兑换商品更新成功', {
      admin_id,
      item_id: itemId,
      item_name: item.item_name
    })

    return res.apiSuccess(
      {
        item: DataSanitizer.sanitizeExchangeMarketItem(item.toJSON(), 'full')
      },
      '商品更新成功'
    )
  } catch (error) {
    logger.error('更新兑换商品失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id,
      item_id: req.params.item_id
    })
    return res.apiError(error.message || '更新商品失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 删除兑换商品（管理员操作）
 * DELETE /api/v4/admin/exchange_market/items/:item_id
 *
 * @param {number} item_id - 商品ID
 */
router.delete('/exchange_market/items/:item_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { item_id } = req.params
    const admin_id = req.user.user_id

    logger.info('管理员删除兑换商品', {
      admin_id,
      item_id
    })

    // 参数验证
    const itemId = parseInt(item_id)
    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
    }

    // 查询商品
    const { ExchangeItem, ExchangeMarketRecord } = models
    const BeijingTimeHelper = require('../../../../utils/timeHelper')
    const DataSanitizer = require('../../../../services/DataSanitizer')

    const item = await ExchangeItem.findByPk(itemId)
    if (!item) {
      return res.apiError('商品不存在', 'NOT_FOUND', null, 404)
    }

    // 检查是否有相关订单
    const orderCount = await ExchangeMarketRecord.count({
      where: { item_id: itemId }
    })

    if (orderCount > 0) {
      // 如果有订单，只能下架不能删除
      await item.update({
        status: 'inactive',
        updated_at: BeijingTimeHelper.createDatabaseTime()
      })

      logger.warn('商品有关联订单，已下架而非删除', {
        admin_id,
        item_id: itemId,
        order_count: orderCount
      })

      return res.apiSuccess(
        {
          item: DataSanitizer.sanitizeExchangeMarketItem(item.toJSON(), 'full')
        },
        `该商品有${orderCount}个关联订单，已自动下架而非删除`
      )
    }

    // 删除商品
    await item.destroy()

    logger.info('兑换商品删除成功', {
      admin_id,
      item_id: itemId,
      item_name: item.item_name
    })

    return res.apiSuccess(null, '商品删除成功')
  } catch (error) {
    logger.error('删除兑换商品失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id,
      item_id: req.params.item_id
    })
    return res.apiError(error.message || '删除商品失败', 'INTERNAL_ERROR', null, 500)
  }
})

module.exports = router
