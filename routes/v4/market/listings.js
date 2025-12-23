/**
 * 交易市场模块 - 列表查询
 *
 * @route /api/v4/market
 * @description 交易市场商品列表查询与详情获取
 *
 * API列表：
 * - GET /listings - 获取交易市场挂牌列表
 * - GET /listings/:listing_id - 获取市场挂牌详情
 * - GET /listing-status - 获取用户上架状态
 *
 * 业务场景：
 * - 用户浏览交易市场中其他用户上架的商品
 * - 查看市场商品的详细信息
 * - 查询用户当前上架商品数量和剩余上架额度
 *
 * 创建时间：2025年12月22日
 * 从inventory-market.js拆分而来
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
const { MarketListing, ItemInstance } = require('../../../models')

/**
 * @route GET /api/v4/market/listings
 * @desc 获取交易市场挂牌列表
 * @access Private (需要登录)
 *
 * @query {number} page - 页码（默认1）
 * @query {number} limit - 每页数量（默认20）
 * @query {string} category - 分类筛选（可选）
 * @query {string} sort - 排序方式（newest/price_asc/price_desc，默认newest）
 *
 * @returns {Object} 市场商品列表和分页信息
 * @returns {Array} data.products - 商品列表
 * @returns {Object} data.pagination - 分页信息
 *
 * 业务场景：用户浏览交易市场中其他用户上架的商品
 */
router.get('/listings', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, category, sort = 'newest' } = req.query

    // 构建查询条件 - 只查询上架中的商品
    const whereClause = { status: 'on_sale' }
    if (category) {
      whereClause.category = category
    }

    // 排序逻辑
    let orderClause
    switch (sort) {
      case 'price_asc':
        orderClause = [['price_amount', 'ASC']]
        break
      case 'price_desc':
        orderClause = [['price_amount', 'DESC']]
        break
      case 'newest':
      default:
        orderClause = [['created_at', 'DESC']]
        break
    }

    // 分页查询
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10)
    const { count, rows } = await MarketListing.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: ItemInstance,
          as: 'offerItem', // 🔧 V4.3修复：使用MarketListing模型中定义的正确别名
          attributes: ['item_instance_id', 'item_type', 'meta'] // 🔧 V4.3修复：移除不存在的item_name字段
        }
      ],
      order: orderClause,
      limit: parseInt(limit, 10),
      offset
    })

    // 格式化返回数据（商品名称从meta.name或item_type获取）
    const products = rows.map(listing => ({
      listing_id: listing.listing_id,
      item_instance_id: listing.offer_item_instance_id, // 🔧 V4.3修复：使用正确的外键字段名
      item_name: listing.offerItem?.meta?.name || listing.offerItem?.item_type || '未知商品', // 🔧 从meta.name获取名称
      item_type: listing.offerItem?.item_type || 'unknown',
      price_amount: listing.price_amount,
      price_asset_code: listing.price_asset_code || 'DIAMOND',
      seller_user_id: listing.seller_user_id,
      status: listing.status,
      listed_at: listing.created_at,
      rarity: listing.offerItem?.meta?.rarity || 'common'
    }))

    logger.info('获取交易市场挂牌列表成功', {
      user_id: req.user.user_id,
      category,
      sort,
      total: count,
      returned: products.length
    })

    return res.apiSuccess(
      {
        products,
        pagination: {
          total: count,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total_pages: Math.ceil(count / parseInt(limit, 10))
        }
      },
      '获取市场挂牌列表成功'
    )
  } catch (error) {
    logger.error('获取交易市场挂牌列表失败', {
      error: error.message,
      user_id: req.user?.user_id,
      query: req.query
    })

    return handleServiceError(error, res, '获取市场挂牌列表失败')
  }
})

/**
 * @route GET /api/v4/market/listings/:listing_id
 * @desc 获取市场挂牌详情
 * @access Private (需要登录)
 *
 * @param {number} listing_id - 挂牌ID
 *
 * @returns {Object} 挂牌详情
 * @returns {number} data.listing_id - 挂牌ID
 * @returns {number} data.item_instance_id - 物品实例ID
 * @returns {string} data.item_name - 物品名称
 * @returns {string} data.item_type - 物品类型
 * @returns {number} data.price_amount - 价格数量
 * @returns {string} data.price_asset_code - 价格资产类型（如DIAMOND）
 * @returns {number} data.seller_user_id - 卖家用户ID
 * @returns {string} data.status - 状态（on_sale/sold/withdrawn）
 * @returns {string} data.listed_at - 上架时间
 * @returns {string} data.description - 物品描述
 * @returns {string} data.rarity - 稀有度
 * @returns {boolean} data.is_own - 是否是自己的商品
 *
 * 业务场景：用户查看市场商品的详细信息
 */
router.get(
  '/listings/:listing_id',
  authenticateToken,
  validatePositiveInteger('listing_id', 'params'),
  async (req, res) => {
    try {
      const listingId = req.validated.listing_id

      // 查询挂牌详情
      const listing = await MarketListing.findOne({
        where: { listing_id: listingId },
        include: [
          {
            model: ItemInstance,
            as: 'offerItem', // 🔧 V4.3修复：使用MarketListing模型中定义的正确别名
            attributes: ['item_instance_id', 'item_type', 'meta', 'status'] // 🔧 V4.3修复：移除不存在的item_name字段
          }
        ]
      })

      if (!listing) {
        return res.apiError('挂牌不存在', 'NOT_FOUND', null, 404)
      }

      // 格式化返回数据（商品名称从meta.name或item_type获取）
      const listingDetail = {
        listing_id: listing.listing_id,
        item_instance_id: listing.offer_item_instance_id, // 🔧 V4.3修复：使用正确的外键字段名
        item_name: listing.offerItem?.meta?.name || listing.offerItem?.item_type || '未知商品', // 🔧 从meta.name获取名称
        item_type: listing.offerItem?.item_type || 'unknown',
        price_amount: listing.price_amount,
        price_asset_code: listing.price_asset_code || 'DIAMOND',
        seller_user_id: listing.seller_user_id,
        status: listing.status,
        listed_at: listing.created_at,
        description: listing.offerItem?.meta?.description || '',
        rarity: listing.offerItem?.meta?.rarity || 'common',
        is_own: listing.seller_user_id === req.user.user_id
      }

      logger.info('获取市场挂牌详情成功', {
        listing_id: listingId,
        user_id: req.user.user_id
      })

      return res.apiSuccess(listingDetail, '获取挂牌详情成功')
    } catch (error) {
      logger.error('获取市场挂牌详情失败', {
        error: error.message,
        listing_id: req.validated.listing_id,
        user_id: req.user?.user_id
      })

      return handleServiceError(error, res, '获取挂牌详情失败')
    }
  }
)

/**
 * @route GET /api/v4/market/listing-status
 * @desc 获取用户上架状态
 * @access Private (需要登录)
 *
 * @returns {Object} 用户上架状态
 * @returns {number} data.current - 当前上架数量
 * @returns {number} data.limit - 上架上限（10）
 * @returns {number} data.remaining - 剩余可上架数量
 * @returns {number} data.percentage - 已使用百分比
 *
 * 业务场景：查询用户当前上架商品数量和剩余上架额度
 */
router.get('/listing-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id

    // 直接查询 MarketListing 表
    const onSaleCount = await MarketListing.count({
      where: {
        seller_user_id: userId,
        status: 'on_sale'
      }
    })

    const maxListings = 10

    logger.info('查询上架状态', {
      user_id: userId,
      current: onSaleCount,
      limit: maxListings
    })

    return res.apiSuccess(
      {
        current: onSaleCount,
        limit: maxListings,
        remaining: maxListings - onSaleCount,
        percentage: Math.round((onSaleCount / maxListings) * 100)
      },
      '获取上架状态成功'
    )
  } catch (error) {
    logger.error('获取上架状态失败', {
      error: error.message,
      user_id: req.user?.user_id
    })

    return handleServiceError(error, res, '获取上架状态失败')
  }
})

module.exports = router
