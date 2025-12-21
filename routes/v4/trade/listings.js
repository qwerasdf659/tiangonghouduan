/**
 * 餐厅积分抽奖系统 V4.0 - 交易市场功能API（重构版）
 *
 * ⚠️ 2025-12-21 暴力重构：
 * - 移除对已删除 InventoryService 的依赖
 * - 使用 MarketListing 模型 + TradeOrderService 实现功能
 * - 资产操作通过 AssetService 实现
 *
 * 业务范围：
 * - 市场商品列表查询 → 使用 MarketListing 模型
 * - 市场商品详情查看 → 使用 MarketListing 模型
 * - 商品上架到市场 → 使用 MarketListing 模型 + ItemInstance
 * - 购买市场商品 → 使用 TradeOrderService
 * - 撤回市场商品 → 使用 MarketListing 模型
 * - 查询用户上架状态 → 使用 MarketListing 模型
 *
 * 架构规范：
 * - 路由层只负责：认证/鉴权、参数校验、调用Service、统一响应
 * - 使用统一错误处理 handleServiceError
 * - 使用统一响应 res.apiSuccess / res.apiError
 *
 * 创建时间：2025-12-11
 * 重构时间：2025-12-21 - 暴力重构移除 InventoryService
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
const { MarketListing, ItemInstance, sequelize } = require('../../../models')
// 注：Op 暂时未使用，如需查询条件时再导入 const { Op } = require('sequelize')

/**
 * 获取交易市场挂牌列表
 * GET /api/v4/inventory/market/listings
 *
 * 业务场景：用户浏览交易市场中其他用户上架的商品
 * 支持功能：分类筛选、排序（最新、价格）、分页
 *
 * 重构说明：
 * - 原：调用 InventoryService.getMarketProducts()
 * - 新：直接查询 MarketListing 模型
 */
router.get('/market/listings', authenticateToken, async (req, res) => {
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
 *
 * 重构说明：
 * - 原：调用 InventoryService.getMarketProductDetail()
 * - 新：直接查询 MarketListing 模型
 */
router.get(
  '/market/listings/:listing_id',
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
 * 购买市场商品
 * POST /api/v4/inventory/market/listings/:listing_id/purchase
 *
 * 🔴 业务场景：用户购买交易市场中的商品
 * 幂等性控制：通过 business_id 防止重复购买
 *
 * 重构说明：
 * - 原：调用 InventoryService.purchaseMarketListing()
 * - 新：调用 TradeOrderService.createOrder() + completeOrder()
 */
router.post(
  '/market/listings/:listing_id/purchase',
  authenticateToken,
  validatePositiveInteger('listing_id', 'params'),
  async (req, res) => {
    try {
      const listingId = req.validated.listing_id
      const buyerId = req.user.user_id
      const { purchase_note } = req.body

      // 【强制幂等】客户端必须传入business_id或Idempotency-Key（二选一）
      const businessId = req.body.business_id || req.headers['idempotency-key']

      if (!businessId) {
        return res.apiError(
          '缺少必填参数：business_id（Body）或 Idempotency-Key（Header），强幂等控制',
          'BAD_REQUEST',
          null,
          400
        )
      }

      // 获取 TradeOrderService
      const TradeOrderService = req.app.locals.services.getService('tradeOrder')

      // 查询挂牌信息
      const listing = await MarketListing.findOne({
        where: {
          listing_id: listingId,
          status: 'on_sale'
        }
      })

      if (!listing) {
        return res.apiError('挂牌不存在或已下架', 'NOT_FOUND', null, 404)
      }

      // 不能购买自己的商品
      if (listing.seller_user_id === buyerId) {
        return res.apiError('不能购买自己的商品', 'BAD_REQUEST', null, 400)
      }

      // 创建并完成交易订单
      const orderResult = await TradeOrderService.createOrder({
        buyer_id: buyerId,
        seller_id: listing.seller_user_id,
        listing_id: listingId,
        item_instance_id: listing.item_instance_id,
        price_amount: listing.price_amount,
        price_asset_code: listing.price_asset_code || 'DIAMOND',
        business_id: businessId
      })

      // 如果是幂等请求（订单已存在），直接返回
      if (orderResult.is_duplicate) {
        return res.apiSuccess(
          {
            ...orderResult,
            purchase_note: purchase_note || null
          },
          '购买成功（幂等请求）'
        )
      }

      // 完成订单
      const completeResult = await TradeOrderService.completeOrder({
        order_id: orderResult.order_id,
        buyer_id: buyerId
      })

      logger.info('市场商品购买成功', {
        listing_id: listingId,
        buyer_id: buyerId,
        seller_id: listing.seller_user_id,
        price_amount: listing.price_amount,
        order_id: orderResult.order_id
      })

      return res.apiSuccess(
        {
          order_id: orderResult.order_id,
          listing_id: listingId,
          seller_id: listing.seller_user_id,
          asset_code: listing.price_asset_code || 'DIAMOND',
          gross_amount: listing.price_amount,
          fee_amount: completeResult.fee_amount || 0,
          net_amount: completeResult.net_amount || listing.price_amount,
          is_duplicate: false,
          purchase_note: purchase_note || null
        },
        '购买成功'
      )
    } catch (error) {
      logger.error('购买市场商品失败', {
        error: error.message,
        listing_id: req.validated.listing_id,
        buyer_id: req.user?.user_id
      })

      return handleServiceError(error, res, '购买失败')
    }
  }
)

/**
 * 撤回市场挂牌
 * POST /api/v4/inventory/market/listings/:listing_id/withdraw
 *
 * 业务场景：卖家撤回已上架的商品
 *
 * 重构说明：
 * - 原：调用 InventoryService.withdrawMarketProduct()
 * - 新：直接更新 MarketListing 和 ItemInstance 状态
 */
router.post(
  '/market/listings/:listing_id/withdraw',
  authenticateToken,
  validatePositiveInteger('listing_id', 'params'),
  async (req, res) => {
    try {
      const listingId = req.validated.listing_id
      const sellerId = req.user.user_id
      const { withdraw_reason } = req.body

      // 查询挂牌信息
      const listing = await MarketListing.findOne({
        where: {
          listing_id: listingId,
          seller_user_id: sellerId,
          status: 'on_sale'
        }
      })

      if (!listing) {
        return res.apiError('挂牌不存在或已下架', 'NOT_FOUND', null, 404)
      }

      // 使用事务处理撤回操作
      const transaction = await sequelize.transaction()

      try {
        // 更新挂牌状态
        await listing.update(
          {
            status: 'withdrawn',
            withdrawn_at: new Date(),
            withdraw_reason: withdraw_reason || '用户主动撤回'
          },
          { transaction }
        )

        // 恢复物品状态为可用
        await ItemInstance.update(
          { status: 'available' },
          {
            where: { item_instance_id: listing.item_instance_id },
            transaction
          }
        )

        await transaction.commit()

        logger.info('市场挂牌撤回成功', {
          listing_id: listingId,
          seller_id: sellerId,
          item_instance_id: listing.item_instance_id,
          withdraw_reason: withdraw_reason || '用户主动撤回'
        })

        return res.apiSuccess(
          {
            listing_id: listingId,
            item_instance_id: listing.item_instance_id,
            withdrawn_at: new Date().toISOString()
          },
          '撤回成功。您可以重新编辑后再次上架。'
        )
      } catch (innerError) {
        await transaction.rollback()
        throw innerError
      }
    } catch (error) {
      logger.error('撤回市场挂牌失败', {
        error: error.message,
        listing_id: req.validated.listing_id,
        seller_id: req.user?.user_id
      })

      return handleServiceError(error, res, '撤回失败')
    }
  }
)

/**
 * 上架商品到交易市场
 * POST /api/v4/inventory/market/list
 *
 * 业务场景：用户将库存物品上架到交易市场出售
 * 上架限制：最多同时上架10件商品
 *
 * 重构说明：
 * - 原：调用 InventoryService.listProductToMarket()
 * - 新：直接创建 MarketListing 记录
 */
router.post('/market/list', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { item_instance_id, price_amount, condition = 'good' } = req.body

    // 🔴 强幂等：business_id（Body）或 Idempotency-Key（Header）二选一
    const businessId = req.body.business_id || req.headers['idempotency-key']
    if (!businessId) {
      return res.apiError(
        '缺少幂等键：请在 Body 中提供 business_id 或在 Header 中提供 Idempotency-Key',
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 【不做兼容】参数命名严格对齐最终方案（snake_case）
    if (req.body.inventory_id !== undefined || req.body.selling_amount !== undefined) {
      return res.apiError(
        '参数已升级：请使用 item_instance_id 与 price_amount（不再支持 inventory_id/selling_amount）',
        'BAD_REQUEST',
        null,
        400
      )
    }

    if (!item_instance_id || price_amount === undefined) {
      return res.apiError(
        '缺少必要参数：item_instance_id 和 price_amount',
        'BAD_REQUEST',
        null,
        400
      )
    }

    const itemId = parseInt(item_instance_id, 10)
    const priceAmountValue = parseInt(price_amount, 10)

    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的物品ID', 'BAD_REQUEST', null, 400)
    }

    if (isNaN(priceAmountValue) || priceAmountValue <= 0) {
      return res.apiError('售价必须是大于0的整数（DIAMOND）', 'BAD_REQUEST', null, 400)
    }

    // 幂等性检查
    const existingListing = await MarketListing.findOne({
      where: { business_id: businessId }
    })

    if (existingListing) {
      logger.info('上架请求幂等命中', {
        business_id: businessId,
        listing_id: existingListing.listing_id
      })

      // 查询上架状态
      const onSaleCount = await MarketListing.count({
        where: {
          seller_user_id: userId,
          status: 'on_sale'
        }
      })

      return res.apiSuccess(
        {
          listing: {
            listing_id: existingListing.listing_id,
            item_instance_id: existingListing.item_instance_id,
            price_amount: existingListing.price_amount,
            is_duplicate: true
          },
          listing_status: {
            current: onSaleCount,
            limit: 10,
            remaining: 10 - onSaleCount
          }
        },
        '上架成功（幂等请求）'
      )
    }

    // 检查上架数量限制
    const onSaleCount = await MarketListing.count({
      where: {
        seller_user_id: userId,
        status: 'on_sale'
      }
    })

    if (onSaleCount >= 10) {
      return res.apiError(
        '上架数量已达上限（10件）',
        'LIMIT_EXCEEDED',
        { current: onSaleCount, limit: 10 },
        400
      )
    }

    // 检查物品是否存在且属于用户
    const item = await ItemInstance.findOne({
      where: {
        item_instance_id: itemId,
        owner_user_id: userId,
        status: 'available'
      }
    })

    if (!item) {
      return res.apiError('物品不存在或不可上架', 'NOT_FOUND', null, 404)
    }

    // 使用事务处理上架操作
    const transaction = await sequelize.transaction()

    try {
      // 锁定物品
      await item.update({ status: 'locked' }, { transaction })

      // 创建挂牌记录
      const listing = await MarketListing.create(
        {
          item_instance_id: itemId,
          seller_user_id: userId,
          price_amount: priceAmountValue,
          price_asset_code: 'DIAMOND',
          status: 'on_sale',
          condition,
          business_id: businessId
        },
        { transaction }
      )

      await transaction.commit()

      logger.info('商品上架成功', {
        user_id: userId,
        item_instance_id: itemId,
        listing_id: listing.listing_id,
        business_id: businessId,
        price_amount: priceAmountValue,
        current_listings: onSaleCount + 1
      })

      return res.apiSuccess(
        {
          listing: {
            listing_id: listing.listing_id,
            item_instance_id: itemId,
            price_amount: priceAmountValue
          },
          listing_status: {
            current: onSaleCount + 1,
            limit: 10,
            remaining: 10 - onSaleCount - 1
          }
        },
        '上架成功'
      )
    } catch (innerError) {
      await transaction.rollback()
      throw innerError
    }
  } catch (error) {
    logger.error('上架失败', {
      error: error.message,
      user_id: req.user?.user_id
    })

    return handleServiceError(error, res, '上架失败')
  }
})

/**
 * 获取用户上架状态
 * GET /api/v4/inventory/market/listing-status
 *
 * 业务场景：查询用户当前上架商品数量和剩余上架额度
 *
 * 重构说明：
 * - 原：调用 InventoryService.checkListingStatus()
 * - 新：直接查询 MarketListing 表统计
 */
router.get('/market/listing-status', authenticateToken, async (req, res) => {
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

/**
 * 挂牌可叠加资产到市场
 * POST /api/v4/inventory/market/fungible-assets/list
 *
 * 🔴 业务场景：用户将可叠加资产挂牌到市场出售
 * 暂未实现：此功能需要 AssetService 的冻结功能支持
 */
router.post('/market/fungible-assets/list', authenticateToken, async (req, res) => {
  // 暂时返回功能重构中的提示
  return res.apiError(
    '可叠加资产挂牌功能正在重构中，敬请期待',
    'FEATURE_REBUILDING',
    {
      suggestion: '请使用 /api/v4/exchange_market 进行资产兑换'
    },
    503
  )
})

/**
 * 撤回可叠加资产挂牌
 * POST /api/v4/inventory/market/fungible-assets/:listing_id/withdraw
 *
 * 暂未实现：此功能需要 AssetService 的解冻功能支持
 */
router.post(
  '/market/fungible-assets/:listing_id/withdraw',
  authenticateToken,
  validatePositiveInteger('listing_id', 'params'),
  async (req, res) => {
    // 暂时返回功能重构中的提示
    return res.apiError(
      '可叠加资产撤回功能正在重构中，敬请期待',
      'FEATURE_REBUILDING',
      {
        suggestion: '请联系客服处理'
      },
      503
    )
  }
)

module.exports = router
