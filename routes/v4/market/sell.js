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
 * - 使用 Idempotency-Key（Header）进行幂等控制
 *
 * 幂等性保证（业界标准形态 - 破坏性重构 2026-01-02）：
 * - 统一只接受 Header Idempotency-Key，不接受 body 中的 business_id
 * - 缺失幂等键直接返回 400
 *
 * 创建时间：2025年12月22日
 * 更新时间：2026年01月02日 - 业界标准形态破坏性重构
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
const { MarketListing, ItemInstance } = require('../../../models')
// 业界标准幂等架构 - 统一入口幂等服务
const IdempotencyService = require('../../../services/IdempotencyService')
// 事务边界治理 - 统一事务管理器
const TransactionManager = require('../../../utils/TransactionManager')

/**
 * @route POST /api/v4/market/list
 * @desc 上架商品到交易市场
 * @access Private (需要登录)
 *
 * @header {string} Idempotency-Key - 幂等键（必填，不接受body参数）
 * @body {number} item_instance_id - 物品实例ID（必填）
 * @body {number} price_amount - 售价（DIAMOND，必填，大于0的整数）
 * @body {string} condition - 物品状态（可选，默认good）
 *
 * @returns {Object} 上架结果
 * @returns {Object} data.listing - 挂牌信息
 * @returns {number} data.listing.listing_id - 挂牌ID
 * @returns {number} data.listing.item_instance_id - 物品实例ID
 * @returns {number} data.listing.price_amount - 售价
 * @returns {boolean} data.listing.is_duplicate - 是否为幂等回放请求
 * @returns {Object} data.listing_status - 上架状态
 * @returns {number} data.listing_status.current - 当前上架数量
 * @returns {number} data.listing_status.limit - 上架上限
 * @returns {number} data.listing_status.remaining - 剩余可上架数量
 *
 * 业务场景：用户将库存物品上架到交易市场出售
 * 上架限制：最多同时上架10件商品
 * 幂等性控制（业界标准形态）：统一通过 Header Idempotency-Key 防止重复上架
 */
router.post('/list', authenticateToken, async (req, res) => {
  // 【业界标准形态】强制从 Header 获取幂等键，不接受 body
  const idempotency_key = req.headers['idempotency-key']

  // 缺失幂等键直接返回 400
  if (!idempotency_key) {
    return res.apiError(
      '缺少必需的幂等键：请在 Header 中提供 Idempotency-Key。' +
        '重试时必须复用同一幂等键以防止重复上架。',
      'MISSING_IDEMPOTENCY_KEY',
      {
        required_header: 'Idempotency-Key',
        example: 'Idempotency-Key: market_list_<timestamp>_<random>'
      },
      400
    )
  }

  try {
    const userId = req.user.user_id
    const { item_instance_id, price_amount } = req.body

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

    /*
     * 【入口幂等检查】防止同一次请求被重复提交
     * 统一使用 IdempotencyService 进行请求级幂等控制
     */
    const idempotencyResult = await IdempotencyService.getOrCreateRequest(idempotency_key, {
      api_path: '/api/v4/market/list',
      http_method: 'POST',
      request_params: { item_instance_id: itemId, price_amount: priceAmountValue },
      user_id: userId
    })

    // 如果已完成，直接返回首次结果（幂等性要求）+ is_duplicate 标记
    if (!idempotencyResult.should_process) {
      logger.info('🔄 入口幂等拦截：重复请求，返回首次结果', {
        idempotency_key,
        user_id: userId,
        item_instance_id: itemId
      })
      const duplicateResponse = {
        ...idempotencyResult.response,
        is_duplicate: true
      }
      return res.apiSuccess(duplicateResponse, '上架成功（幂等回放）')
    }

    // 检查上架数量限制
    const onSaleCount = await MarketListing.count({
      where: {
        seller_user_id: userId,
        status: 'on_sale'
      }
    })

    if (onSaleCount >= 10) {
      await IdempotencyService.markAsFailed(idempotency_key, '上架数量已达上限')
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
      await IdempotencyService.markAsFailed(idempotency_key, '物品不存在或不可上架')
      return res.apiError('物品不存在或不可上架', 'NOT_FOUND', null, 404)
    }

    // 使用 TransactionManager 处理上架操作
    const responseData = await TransactionManager.execute(
      async transaction => {
        // 锁定物品
        await item.update({ status: 'locked' }, { transaction })

        // 创建挂牌记录（使用 idempotency_key 字段名）
        const listing = await MarketListing.create(
          {
            listing_kind: 'item_instance',
            seller_user_id: userId,
            offer_item_instance_id: itemId,
            price_amount: priceAmountValue,
            price_asset_code: 'DIAMOND',
            seller_offer_frozen: false,
            status: 'on_sale',
            idempotency_key
          },
          { transaction }
        )

        // 构建响应数据
        return {
          listing: {
            listing_id: listing.listing_id,
            item_instance_id: itemId,
            price_amount: priceAmountValue,
            is_duplicate: false
          },
          listing_status: {
            current: onSaleCount + 1,
            limit: 10,
            remaining: 10 - onSaleCount - 1
          },
          _listing_id: listing.listing_id // 内部使用，记录幂等
        }
      },
      { description: 'market_list_item' }
    )

    /*
     * 【标记请求完成】保存结果快照到入口幂等表
     */
    await IdempotencyService.markAsCompleted(
      idempotency_key,
      responseData._listing_id, // 业务事件ID = 挂牌ID
      { listing: responseData.listing, listing_status: responseData.listing_status }
    )

    logger.info('商品上架成功', {
      user_id: userId,
      item_instance_id: itemId,
      listing_id: responseData._listing_id,
      idempotency_key,
      price_amount: priceAmountValue,
      current_listings: onSaleCount + 1
    })

    return res.apiSuccess(
      { listing: responseData.listing, listing_status: responseData.listing_status },
      '上架成功'
    )
  } catch (error) {
    // 标记幂等请求失败（允许重试）
    await IdempotencyService.markAsFailed(idempotency_key, error.message).catch(markError => {
      logger.error('标记幂等请求失败状态时出错:', markError)
    })

    // 处理幂等键冲突错误（409状态码）
    if (error.statusCode === 409) {
      logger.warn('幂等性错误:', {
        idempotency_key,
        error_code: error.errorCode,
        message: error.message
      })
      return res.apiError(error.message, error.errorCode || 'IDEMPOTENCY_ERROR', {}, 409)
    }

    logger.error('上架失败', {
      error: error.message,
      user_id: req.user?.user_id,
      idempotency_key
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
