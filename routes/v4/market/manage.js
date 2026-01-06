/**
 * 交易市场模块 - 撤回/管理
 *
 * @route /api/v4/market
 * @description 卖家管理已上架的商品（撤回）
 *
 * API列表：
 * - POST /listings/:listing_id/withdraw - 撤回市场挂牌
 * - POST /fungible-assets/:listing_id/withdraw - 撤回可叠加资产挂牌（暂未实现）
 *
 * 业务场景：
 * - 卖家撤回已上架的商品
 * - 撤回后物品状态恢复为可用
 *
 * 创建时间：2025年12月22日
 * 从inventory-market.js拆分而来
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
// 事务边界治理 - 统一事务管理器
const TransactionManager = require('../../../utils/TransactionManager')
// 决策5B/0C：市场挂牌统一收口到Service层
const MarketListingService = require('../../../services/MarketListingService')

/**
 * @route POST /api/v4/market/listings/:listing_id/withdraw
 * @desc 撤回市场挂牌
 * @access Private (需要登录，只能撤回自己的商品)
 *
 * @param {number} listing_id - 挂牌ID
 * @body {string} withdraw_reason - 撤回原因（可选，默认"用户主动撤回"）
 *
 * @returns {Object} 撤回结果
 * @returns {number} data.listing_id - 挂牌ID
 * @returns {number} data.item_instance_id - 物品实例ID
 * @returns {string} data.withdrawn_at - 撤回时间
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

      // 决策5B/0C：使用 MarketListingService 统一处理撤回
      const result = await TransactionManager.execute(
        async transaction => {
          return await MarketListingService.withdrawListing(
            {
              listing_id: listingId,
              seller_user_id: sellerId
            },
            { transaction }
          )
        },
        { description: 'market_listing_withdraw' }
      )

      // 缓存失效已在 MarketListingService.withdrawListing 中处理（决策5B）

      logger.info('市场挂牌撤回成功', {
        listing_id: listingId,
        seller_id: sellerId,
        item_instance_id: result.listing.offer_item_instance_id,
        withdraw_reason: withdraw_reason || '用户主动撤回'
      })

      return res.apiSuccess(
        {
          listing_id: listingId,
          item_instance_id: result.listing.offer_item_instance_id,
          withdrawn_at: new Date().toISOString()
        },
        '撤回成功。您可以重新编辑后再次上架。'
      )
    } catch (error) {
      // 处理Service层特定错误码
      if (error.code === 'LISTING_NOT_FOUND') {
        return res.apiError('挂牌不存在', error.code, null, error.statusCode || 404)
      }
      if (error.code === 'NOT_OWNER') {
        return res.apiError('无权操作此挂牌', error.code, null, error.statusCode || 403)
      }
      if (error.code === 'INVALID_LISTING_STATUS') {
        return res.apiError('挂牌已下架或状态异常', error.code, null, error.statusCode || 400)
      }

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
 * @route POST /api/v4/market/fungible-assets/:listing_id/withdraw
 * @desc 撤回可叠加资产挂牌
 * @access Private (需要登录)
 *
 * 暂未实现：此功能需要 AssetService 的解冻功能支持
 */
router.post(
  '/fungible-assets/:listing_id/withdraw',
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
