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

const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')

const logger = require('../../../utils/logger').logger

/**
 * 获取交易市场挂牌列表
 * GET /api/v4/inventory/market/listings
 *
 * 业务场景：用户浏览交易市场中其他用户上架的商品
 * 支持功能：分类筛选、排序（最新、价格）、分页
 */
router.get('/market/listings', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, category, sort = 'newest' } = req.query

    // 调用 InventoryService 获取市场挂牌列表
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.getMarketProducts(
      { category, sort, page, limit },
      { transaction: null }
    )

    logger.info('获取交易市场挂牌列表成功', {
      user_id: req.user.user_id,
      category,
      sort,
      total: result.pagination.total,
      returned: result.products.length
    })

    return res.apiSuccess(result, '获取市场挂牌列表成功')
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
  '/market/listings/:listing_id',
  authenticateToken,
  validatePositiveInteger('listing_id', 'params'),
  async (req, res) => {
    try {
      const listingId = req.validated.listing_id

      // 调用 InventoryService 获取市场挂牌详情
      const InventoryService = req.app.locals.services.getService('inventory')
      const listingDetail = await InventoryService.getMarketProductDetail(listingId)

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
 * 🔴 P0-3 修复：使用 listing_id（挂牌ID）而非 item_instance_id（物品ID）
 * 业务场景：用户购买交易市场中的商品
 * 幂等性控制：通过 business_id 防止重复购买
 */
router.post(
  '/market/listings/:listing_id/purchase',
  authenticateToken,
  validatePositiveInteger('listing_id', 'params'),
  async (req, res) => {
    try {
      const listingId = req.validated.listing_id
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
      const result = await InventoryService.purchaseMarketListing(buyer_id, listingId, {
        business_id: businessId
      })

      logger.info('市场商品购买成功（DIAMOND结算）', {
        listing_id: listingId,
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
        listing_id: req.validated.listing_id,
        buyer_id: req.user?.user_id
      })

      return handleServiceError(error, res, '购买失败')
    }
  }
)

/**
 * 撤回市场挂牌（统一语义：按 listing_id 撤回）
 * POST /api/v4/inventory/market/listings/:listing_id/withdraw
 *
 * 业务场景：卖家撤回已上架的商品
 *
 * @param {Object} req Express Request
 * @param {Object} res Express Response
 * @param {number} listingId 挂单ID（listing_id）
 * @returns {Promise<any>} API 响应
 */
async function handleWithdrawListing(req, res, listingId) {
  try {
    const seller_id = req.user.user_id
    const { withdraw_reason } = req.body

    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.withdrawMarketProduct(seller_id, listingId, {
      withdraw_reason
    })

    logger.info('市场挂牌撤回成功', {
      listing_id: listingId,
      seller_id,
      withdraw_reason: withdraw_reason || '用户主动撤回'
    })

    return res.apiSuccess(result, '撤回成功。您可以重新编辑后再次上架。')
  } catch (error) {
    logger.error('撤回市场挂牌失败', {
      error: error.message,
      listing_id: listingId,
      seller_id: req.user?.user_id
    })

    return handleServiceError(error, res, '撤回失败')
  }
}

// ✅ 新标准接口：按 listing_id 撤回（语义明确）
router.post(
  '/market/listings/:listing_id/withdraw',
  authenticateToken,
  validatePositiveInteger('listing_id', 'params'),
  async (req, res) => {
    return handleWithdrawListing(req, res, req.validated.listing_id)
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
    const { item_instance_id, price_amount, condition = 'good' } = req.body

    // 🔴 强幂等：business_id（Body）或 Idempotency-Key（Header）二选一
    const business_id = req.body.business_id || req.headers['idempotency-key']
    if (!business_id) {
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

    // 调用 InventoryService 上架商品（使用DIAMOND定价）
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.listProductToMarket(userId, itemId, {
      business_id,
      price_amount: priceAmountValue,
      condition
    })

    // 获取上架状态统计
    const listingStatus = await InventoryService.checkListingStatus(userId)

    logger.info('商品上架成功', {
      user_id: userId,
      item_instance_id: itemId,
      business_id,
      price_amount: priceAmountValue,
      current_listings: listingStatus.on_sale_count
    })

    return res.apiSuccess(
      {
        listing: result,
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

/**
 * 挂牌可叠加资产到市场
 * POST /api/v4/inventory/market/fungible-assets/list
 *
 * 🔴 P1-1a 新增：可叠加资产挂牌API（如材料、钻石等）
 * 业务场景：用户将可叠加资产（如red_shard、DIAMOND）挂牌到市场出售
 * 幂等性控制：通过 business_id 防止重复挂牌
 * 冻结机制：挂牌时冻结卖家标的资产
 */
router.post('/market/fungible-assets/list', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { offer_asset_code, offer_amount, price_amount } = req.body

    // 【强制幂等】客户端必须传入business_id或Idempotency-Key（二选一）
    const business_id = req.body.business_id || req.headers['idempotency-key']
    if (!business_id) {
      return res.apiError(
        '缺少幂等键：请在 Body 中提供 business_id 或在 Header 中提供 Idempotency-Key',
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 参数验证
    if (!offer_asset_code) {
      return res.apiError(
        '缺少必填参数：offer_asset_code（标的资产代码）',
        'BAD_REQUEST',
        null,
        400
      )
    }

    if (!offer_amount || offer_amount <= 0) {
      return res.apiError('标的资产数量必须大于0', 'BAD_REQUEST', null, 400)
    }

    if (!price_amount || price_amount <= 0) {
      return res.apiError('售价必须大于0（DIAMOND）', 'BAD_REQUEST', null, 400)
    }

    // 限制只允许特定资产类型挂牌（避免DIAMOND直接挂牌DIAMOND）
    const allowedAssets = ['red_shard', 'blue_shard', 'green_shard', 'yellow_shard']
    if (!allowedAssets.includes(offer_asset_code)) {
      return res.apiError(
        `不支持挂牌该资产类型：${offer_asset_code}。允许的类型：${allowedAssets.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 调用 InventoryService 挂牌可叠加资产
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.listFungibleAssetToMarket(userId, {
      business_id,
      offer_asset_code,
      offer_amount: parseInt(offer_amount, 10),
      price_amount: parseInt(price_amount, 10)
    })

    logger.info('可叠加资产挂牌成功', {
      user_id: userId,
      listing_id: result.listing_id,
      offer_asset_code,
      offer_amount,
      price_amount,
      business_id
    })

    return res.apiSuccess(result, '挂牌成功，卖家标的资产已冻结')
  } catch (error) {
    logger.error('可叠加资产挂牌失败', {
      error: error.message,
      user_id: req.user?.user_id,
      body: req.body
    })

    return handleServiceError(error, res, '挂牌失败')
  }
})

/**
 * 撤回可叠加资产挂牌
 * POST /api/v4/inventory/market/fungible-assets/:listing_id/withdraw
 *
 * 🔴 P1-1b 新增：撤回可叠加资产挂牌
 * 业务场景：卖家撤回已挂牌的可叠加资产
 * 解冻机制：撤回时解冻卖家标的资产
 */
router.post(
  '/market/fungible-assets/:listing_id/withdraw',
  authenticateToken,
  validatePositiveInteger('listing_id', 'params'),
  async (req, res) => {
    try {
      const userId = req.user.user_id
      const listingId = req.validated.listing_id
      const { withdraw_reason } = req.body

      // 【强制幂等】客户端必须传入business_id或Idempotency-Key（二选一）
      const business_id = req.body.business_id || req.headers['idempotency-key']
      if (!business_id) {
        return res.apiError(
          '缺少幂等键：请在 Body 中提供 business_id 或在 Header 中提供 Idempotency-Key',
          'BAD_REQUEST',
          null,
          400
        )
      }

      // 调用 InventoryService 撤回可叠加资产挂牌
      const InventoryService = req.app.locals.services.getService('inventory')
      const result = await InventoryService.withdrawFungibleAssetListing(userId, listingId, {
        business_id,
        withdraw_reason: withdraw_reason || '用户主动撤回'
      })

      logger.info('可叠加资产挂牌撤回成功', {
        user_id: userId,
        listing_id: listingId,
        business_id,
        withdraw_reason: withdraw_reason || '用户主动撤回'
      })

      return res.apiSuccess(result, '撤回成功，卖家标的资产已解冻')
    } catch (error) {
      logger.error('可叠加资产挂牌撤回失败', {
        error: error.message,
        user_id: req.user?.user_id,
        listing_id: req.validated?.listing_id
      })

      return handleServiceError(error, res, '撤回失败')
    }
  }
)

module.exports = router
