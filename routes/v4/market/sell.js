/**
 * 交易市场模块 - 上架商品
 *
 * @route /api/v4/market
 * @description 用户上架商品到交易市场
 *
 * API列表：
 * - POST /list - 上架商品到交易市场
 * - POST /fungible-assets/list - 挂牌可叠加资产到市场（暂未实现）
 *
 * 业务场景：
 * - 用户将库存物品上架到交易市场出售
 * - 上架限制：最多同时上架10件商品
 * - 使用 business_id 进行幂等控制
 *
 * 创建时间：2025年12月22日
 * 从inventory-market.js拆分而来
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
const { MarketListing, ItemInstance, sequelize } = require('../../../models')

/**
 * @route POST /api/v4/market/list
 * @desc 上架商品到交易市场
 * @access Private (需要登录)
 *
 * @body {number} item_instance_id - 物品实例ID（必填）
 * @body {number} price_amount - 售价（DIAMOND，必填，大于0的整数）
 * @body {string} condition - 物品状态（可选，默认good）
 * @body {string} business_id - 幂等键（必填，或使用Header: Idempotency-Key）
 *
 * @returns {Object} 上架结果
 * @returns {Object} data.listing - 挂牌信息
 * @returns {number} data.listing.listing_id - 挂牌ID
 * @returns {number} data.listing.item_instance_id - 物品实例ID
 * @returns {number} data.listing.price_amount - 售价
 * @returns {Object} data.listing_status - 上架状态
 * @returns {number} data.listing_status.current - 当前上架数量
 * @returns {number} data.listing_status.limit - 上架上限
 * @returns {number} data.listing_status.remaining - 剩余可上架数量
 *
 * 业务场景：用户将库存物品上架到交易市场出售
 * 上架限制：最多同时上架10件商品
 */
router.post('/list', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { item_instance_id, price_amount } = req.body

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

    // 幂等性检查（强幂等：同一 business_id 只能成功创建一次）
    const existingListing = await MarketListing.findOne({
      where: { business_id: businessId }
    })

    if (existingListing) {
      // 防御性：如果业务ID被他人占用，不能返回他人的挂牌信息
      if (existingListing.seller_user_id !== userId) {
        return res.apiError(
          '幂等键冲突：该 business_id 已被其他用户使用，请更换 business_id',
          'IDEMPOTENCY_KEY_CONFLICT',
          { business_id: businessId },
          409
        )
      }

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
            item_instance_id: existingListing.offer_item_instance_id,
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
          listing_kind: 'item_instance',
          seller_user_id: userId,
          offer_item_instance_id: itemId,
          price_amount: priceAmountValue,
          price_asset_code: 'DIAMOND',
          seller_offer_frozen: false,
          status: 'on_sale',
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
 * @route POST /api/v4/market/fungible-assets/list
 * @desc 挂牌可叠加资产到市场
 * @access Private (需要登录)
 *
 * 🔴 业务场景：用户将可叠加资产挂牌到市场出售
 * 暂未实现：此功能需要 AssetService 的冻结功能支持
 */
router.post('/fungible-assets/list', authenticateToken, async (req, res) => {
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

module.exports = router
