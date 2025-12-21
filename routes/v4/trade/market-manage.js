/**
 * 餐厅积分抽奖系统 V4.0 - 交易市场管理API
 *
 * 业务范围：
 * - 上架商品到交易市场（带幂等控制）
 * - 撤回市场挂牌
 *
 * 架构规范：
 * - 路由层只负责：认证/鉴权、参数校验、调用Model、统一响应
 * - 使用统一错误处理 handleServiceError
 * - 使用统一响应 res.apiSuccess / res.apiError
 * - 事务操作直接在路由层处理（符合现有架构）
 *
 * 创建时间：2025-12-22
 * 来源：从 listings.js 拆分
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
const { MarketListing, ItemInstance, sequelize } = require('../../../models')

/**
 * 上架商品到交易市场
 * POST /api/v4/inventory/market/list
 *
 * 业务场景：用户将库存物品上架到交易市场出售
 * 上架限制：最多同时上架10件商品
 * 幂等性控制：通过 business_id 或 Idempotency-Key 防止重复上架
 */
router.post('/list', authenticateToken, async (req, res) => {
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
 * 撤回市场挂牌
 * POST /api/v4/inventory/market/listings/:listing_id/withdraw
 *
 * 业务场景：卖家撤回已上架的商品
 */
router.post(
  '/listings/:listing_id/withdraw',
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

module.exports = router
