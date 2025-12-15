/**
 * 餐厅积分抽奖系统 V4.0 - 交易市场功能API
 *
 * 业务范围：
 * - 市场商品列表查询
 * - 市场商品详情查看
 * - 商品上架到市场
 * - 购买市场商品
 * - 撤回市场商品
 * - 查询用户上架状态
 *
 * 架构规范：
 * - 路由层只负责：认证/鉴权、参数校验、调用Service、统一响应
 * - 业务逻辑全部在 InventoryService 中处理
 * - 使用统一错误处理 handleServiceError
 * - 使用统一响应 res.apiSuccess / res.apiError
 *
 * 创建时间：2025-12-11
 * P2-A 任务：inventory.js 胖路由瘦身与拆分
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')

const logger = new Logger('InventoryMarketAPI')

/**
 * 获取交易市场商品列表
 * GET /api/v4/inventory/market/products
 *
 * 业务场景：用户浏览交易市场中其他用户上架的商品
 * 支持功能：分类筛选、排序（最新、价格）、分页
 */
router.get('/market/products', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, category, sort = 'newest' } = req.query

    // 调用 InventoryService 获取市场商品列表
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.getMarketProducts(
      { category, sort, page, limit },
      { transaction: null }
    )

    logger.info('获取交易市场商品成功', {
      user_id: req.user.user_id,
      category,
      sort,
      total: result.pagination.total,
      returned: result.products.length
    })

    return res.apiSuccess(result, '获取交易市场商品成功')
  } catch (error) {
    logger.error('获取交易市场商品失败', {
      error: error.message,
      user_id: req.user?.user_id,
      query: req.query
    })

    return handleServiceError(error, res, '获取交易市场商品失败')
  }
})

/**
 * 获取市场商品详情
 * GET /api/v4/inventory/market/products/:id
 *
 * 业务场景：用户查看市场商品的详细信息
 */
router.get(
  '/market/products/:id',
  authenticateToken,
  validatePositiveInteger('id', 'params'),
  async (req, res) => {
    try {
      const productId = req.validated.id

      // 调用 InventoryService 获取市场商品详情
      const InventoryService = req.app.locals.services.getService('inventory')
      const productDetail = await InventoryService.getMarketProductDetail(productId)

      logger.info('获取市场商品详情成功', {
        product_id: productId,
        user_id: req.user.user_id
      })

      return res.apiSuccess(productDetail, '获取商品详情成功')
    } catch (error) {
      logger.error('获取市场商品详情失败', {
        error: error.message,
        product_id: req.validated.id,
        user_id: req.user?.user_id
      })

      return handleServiceError(error, res, '获取商品详情失败')
    }
  }
)

/**
 * 购买市场商品
 * POST /api/v4/inventory/market/products/:id/purchase
 *
 * 业务场景：用户购买交易市场中的商品
 * 幂等性控制：通过 business_id 防止重复购买
 */
router.post(
  '/market/products/:id/purchase',
  authenticateToken,
  validatePositiveInteger('id', 'params'),
  async (req, res) => {
    try {
      const productId = req.validated.id
      const buyer_id = req.user.user_id
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

      // 调用 InventoryService 购买市场商品（使用DIAMOND结算）
      const InventoryService = req.app.locals.services.getService('inventory')
      const result = await InventoryService.purchaseMarketProduct(buyer_id, productId, {
        business_id: businessId
      })

      logger.info('市场商品购买成功（DIAMOND结算）', {
        product_id: productId,
        buyer_id,
        seller_id: result.seller_id,
        asset_code: result.asset_code,
        gross_amount: result.gross_amount,
        fee_amount: result.fee_amount,
        net_amount: result.net_amount,
        is_duplicate: result.is_duplicate
      })

      return res.apiSuccess(
        {
          ...result,
          purchase_note: purchase_note || null
        },
        result.is_duplicate ? '购买成功（幂等请求）' : '购买成功'
      )
    } catch (error) {
      logger.error('购买市场商品失败（DIAMOND结算）', {
        error: error.message,
        product_id: req.validated.id,
        buyer_id: req.user?.user_id
      })

      return handleServiceError(error, res, '购买失败')
    }
  }
)

/**
 * 撤回市场商品
 * POST /api/v4/inventory/market/products/:id/withdraw
 *
 * 业务场景：卖家撤回已上架的商品
 */
router.post(
  '/market/products/:id/withdraw',
  authenticateToken,
  validatePositiveInteger('id', 'params'),
  async (req, res) => {
    try {
      const productId = req.validated.id
      const seller_id = req.user.user_id
      const { withdraw_reason } = req.body

      // 调用 InventoryService 撤回市场商品
      const InventoryService = req.app.locals.services.getService('inventory')
      const result = await InventoryService.withdrawMarketProduct(seller_id, productId, {
        withdraw_reason
      })

      logger.info('市场商品撤回成功', {
        product_id: productId,
        seller_id,
        withdraw_reason: withdraw_reason || '用户主动撤回'
      })

      return res.apiSuccess(result, '商品撤回成功。您可以重新编辑后再次上架。')
    } catch (error) {
      logger.error('撤回市场商品失败', {
        error: error.message,
        product_id: req.validated.id,
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
 */
router.post('/market/list', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { inventory_id, selling_points, selling_amount, condition = 'good' } = req.body

    // 【不做兼容】拒绝selling_points参数
    if (selling_points !== undefined) {
      return res.apiError('不支持selling_points参数，请使用selling_amount（DIAMOND定价）', 'BAD_REQUEST', null, 400)
    }

    // 【必填验证】selling_amount必须存在
    if (!inventory_id || selling_amount === undefined) {
      return res.apiError('缺少必要参数：inventory_id 和 selling_amount', 'BAD_REQUEST', null, 400)
    }

    const itemId = parseInt(inventory_id, 10)
    const sellingAmountValue = parseInt(selling_amount, 10)

    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的物品ID', 'BAD_REQUEST', null, 400)
    }

    if (isNaN(sellingAmountValue) || sellingAmountValue <= 0) {
      return res.apiError('售价必须是大于0的整数（DIAMOND）', 'BAD_REQUEST', null, 400)
    }

    // 调用 InventoryService 上架商品（使用DIAMOND定价）
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.listProductToMarket(userId, itemId, {
      selling_amount: sellingAmountValue,
      condition
    })

    // 获取上架状态统计
    const listingStatus = await InventoryService.checkListingStatus(userId)

    logger.info('商品上架成功', {
      user_id: userId,
      inventory_id: itemId,
      selling_price: sellingPrice,
      current_listings: listingStatus.on_sale_count
    })

    return res.apiSuccess(
      {
        inventory: result,
        listing_status: {
          current: listingStatus.on_sale_count,
          limit: 10,
          remaining: 10 - listingStatus.on_sale_count
        }
      },
      '上架成功'
    )
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
 */
router.get('/market/listing-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id

    // 调用 InventoryService 获取上架状态
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.checkListingStatus(userId)

    const maxListings = 10

    logger.info('查询上架状态', {
      user_id: userId,
      current: result.on_sale_count,
      limit: maxListings
    })

    return res.apiSuccess(
      {
        current: result.on_sale_count,
        limit: maxListings,
        remaining: maxListings - result.on_sale_count,
        percentage: Math.round((result.on_sale_count / maxListings) * 100)
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
