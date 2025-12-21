/**
 * 餐厅积分抽奖系统 V4.0 - 交易市场查询API
 *
 * 业务范围：
 * - 市场商品列表查询
 * - 市场商品详情查看
 * - 用户上架状态查询
 *
 * 架构规范：
 * - 路由层只负责：认证/鉴权、参数校验、调用Model、统一响应
 * - 使用统一错误处理 handleServiceError
 * - 使用统一响应 res.apiSuccess / res.apiError
 *
 * 创建时间：2025-12-22
 * 来源：从 listings.js 拆分
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
const { MarketListing, ItemInstance } = require('../../../models')

/**
 * 获取交易市场挂牌列表
 * GET /api/v4/inventory/market/listings
 *
 * 业务场景：用户浏览交易市场中其他用户上架的商品
 * 支持功能：分类筛选、排序（最新、价格）、分页
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
          as: 'item',
          attributes: ['item_instance_id', 'item_type', 'item_name', 'meta']
        }
      ],
      order: orderClause,
      limit: parseInt(limit, 10),
      offset
    })

    // 格式化返回数据
    const products = rows.map(listing => ({
      listing_id: listing.listing_id,
      item_instance_id: listing.item_instance_id,
      item_name: listing.item?.item_name || '未知商品',
      item_type: listing.item?.item_type || 'unknown',
      price_amount: listing.price_amount,
      price_asset_code: listing.price_asset_code || 'DIAMOND',
      seller_user_id: listing.seller_user_id,
      status: listing.status,
      listed_at: listing.created_at,
      rarity: listing.item?.meta?.rarity || 'common'
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
 * 获取市场挂牌详情
 * GET /api/v4/inventory/market/listings/:listing_id
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
            as: 'item',
            attributes: ['item_instance_id', 'item_type', 'item_name', 'meta', 'status']
          }
        ]
      })

      if (!listing) {
        return res.apiError('挂牌不存在', 'NOT_FOUND', null, 404)
      }

      // 格式化返回数据
      const listingDetail = {
        listing_id: listing.listing_id,
        item_instance_id: listing.item_instance_id,
        item_name: listing.item?.item_name || '未知商品',
        item_type: listing.item?.item_type || 'unknown',
        price_amount: listing.price_amount,
        price_asset_code: listing.price_asset_code || 'DIAMOND',
        seller_user_id: listing.seller_user_id,
        status: listing.status,
        listed_at: listing.created_at,
        description: listing.item?.meta?.description || '',
        rarity: listing.item?.meta?.rarity || 'common',
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
 * 获取用户上架状态
 * GET /api/v4/inventory/market/listing-status
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
