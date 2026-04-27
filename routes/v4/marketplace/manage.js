/**
 * 交易市场模块 - 撤回/管理
 *
 * @route /api/v4/market
 * @description 卖家管理已上架的商品（撤回）
 *
 * API列表：
 * - POST /listings/:market_listing_id/withdraw - 撤回物品实例挂牌
 * - POST /fungible-assets/:market_listing_id/withdraw - 撤回可叠加资产挂牌（交易市场材料交易）
 *
 * 业务场景：
 * - 卖家撤回已上架的商品/可叠加资产
 * - 撤回后物品状态恢复为可用，资产解冻至可用余额
 *
 * 从inventory-market.js拆分而来
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { requireValidSession } = require('../../../middleware/sensitiveOperation')
const { validatePositiveInteger, asyncHandler } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
// 事务边界治理 - 统一事务管理器
const TransactionManager = require('../../../utils/TransactionManager')

/*
 * 风控中间件（2026-01-14 多币种扩展新增）
 * - 撤回操作不执行 fail-closed 策略：允许用户在任何情况下取回资产
 * - 仅提供上下文注入，不阻断请求
 */
const {
  getMarketRiskControlMiddleware
} = require('../../../middleware/MarketRiskControlMiddleware')
const marketRiskMiddleware = getMarketRiskControlMiddleware()

/**
 * @route POST /api/v4/marketplace/listings/:market_listing_id/withdraw
 * @desc 撤回市场挂牌
 * @access Private (需要登录，只能撤回自己的商品)
 *
 * @param {number} market_listing_id - 挂牌ID
 * @body {string} withdraw_reason - 撤回原因（可选，默认"用户主动撤回"）
 *
 * @returns {Object} 撤回结果
 * @returns {number} data.market_listing_id - 挂牌ID
 * @returns {number} data.item_id - 物品ID
 * @returns {string} data.withdrawn_at - 撤回时间
 *
 * 业务场景：卖家撤回已上架的商品
 */
router.post(
  '/listings/:market_listing_id/withdraw',
  authenticateToken,
  requireValidSession, // 🔐 市场撤回属于敏感操作，需验证会话（2026-01-21 会话管理功能）
  marketRiskMiddleware.createWithdrawRiskMiddleware(),
  validatePositiveInteger('market_listing_id', 'params'),
  asyncHandler(async (req, res) => {
    const MarketListingService = req.app.locals.services.getService('market_listing_core')

    const listingId = req.validated.market_listing_id
    const sellerId = req.user.user_id
    const { withdraw_reason } = req.body

    // 决策5B/0C：使用 MarketListingService 统一处理撤回
    const result = await TransactionManager.execute(
      async transaction => {
        return await MarketListingService.withdrawListing(
          {
            market_listing_id: listingId,
            seller_user_id: sellerId
          },
          { transaction }
        )
      },
      { description: 'market_listing_withdraw' }
    )

    // 缓存失效已在 MarketListingService.withdrawListing 中处理（决策5B）

    logger.info('市场挂牌撤回成功', {
      market_listing_id: listingId,
      seller_id: sellerId,
      item_id: result.listing.offer_item_id,
      withdraw_reason: withdraw_reason || '用户主动撤回'
    })

    return res.apiSuccess(
      {
        market_listing_id: listingId,
        item_id: result.listing.offer_item_id,
        withdrawn_at: new Date().toISOString()
      },
      '撤回成功。您可以重新编辑后再次上架。'
    )
  })
)

/**
 * @route POST /api/v4/marketplace/fungible-assets/:market_listing_id/withdraw
 * @desc 撤回可叠加资产挂牌（交易市场材料交易）
 * @access Private (需要登录，只能撤回自己的挂牌)
 *
 * @param {number} market_listing_id - 挂牌ID
 * @body {string} withdraw_reason - 撤回原因（可选，默认"用户主动撤回"）
 *
 * @returns {Object} 撤回结果
 * @returns {number} data.market_listing_id - 挂牌ID
 * @returns {string} data.offer_asset_code - 资产代码
 * @returns {number} data.offer_amount - 撤回数量
 * @returns {string} data.withdrawn_at - 撤回时间
 * @returns {Object} data.balance_after - 解冻后余额信息
 *
 * 业务场景：卖家撤回已挂牌的可叠加资产，解冻资产到可用余额
 */
router.post(
  '/fungible-assets/:market_listing_id/withdraw',
  authenticateToken,
  requireValidSession, // 🔐 可叠加资产撤回属于敏感操作，需验证会话（2026-01-21 会话管理功能）
  marketRiskMiddleware.createWithdrawRiskMiddleware(),
  validatePositiveInteger('market_listing_id', 'params'),
  asyncHandler(async (req, res) => {
    const MarketListingService = req.app.locals.services.getService('market_listing_core')

    const listingId = req.validated.market_listing_id
    const sellerId = req.user.user_id
    const { withdraw_reason } = req.body

    // 使用 TransactionManager 执行撤回操作
    const result = await TransactionManager.execute(
      async transaction => {
        return await MarketListingService.withdrawFungibleAssetListing(
          {
            market_listing_id: listingId,
            seller_user_id: sellerId
          },
          { transaction }
        )
      },
      { description: 'market_fungible_asset_withdraw' }
    )

    // 缓存失效已在 MarketListingService.withdrawFungibleAssetListing 中处理

    logger.info('可叠加资产挂牌撤回成功', {
      market_listing_id: listingId,
      seller_id: sellerId,
      offer_asset_code: result.listing.offer_asset_code,
      offer_amount: result.listing.offer_amount,
      withdraw_reason: withdraw_reason || '用户主动撤回'
    })

    return res.apiSuccess(
      {
        market_listing_id: listingId,
        offer_asset_code: result.listing.offer_asset_code,
        offer_amount: Number(result.listing.offer_amount),
        withdrawn_at: new Date().toISOString(),
        balance_after: result.unfreeze_result?.balance
          ? {
              available_amount: Number(result.unfreeze_result.balance.available_amount),
              frozen_amount: Number(result.unfreeze_result.balance.frozen_amount)
            }
          : null
      },
      '撤回成功。资产已解冻至您的可用余额。'
    )
  })
)

module.exports = router
