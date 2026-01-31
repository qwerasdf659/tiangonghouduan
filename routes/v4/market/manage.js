/**
 * 交易市场模块 - 撤回/管理
 *
 * @route /api/v4/market
 * @description 卖家管理已上架的商品（撤回）
 *
 * API列表：
 * - POST /listings/:listing_id/withdraw - 撤回物品实例挂牌
 * - POST /fungible-assets/:listing_id/withdraw - 撤回可叠加资产挂牌（C2C材料交易）
 *
 * 业务场景：
 * - 卖家撤回已上架的商品/可叠加资产
 * - 撤回后物品状态恢复为可用，资产解冻至可用余额
 *
 * 创建时间：2025年12月22日
 * 从inventory-market.js拆分而来
 * 更新时间：2026年01月08日 - 实现可叠加资产撤回功能（C2C材料交易）
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { requireValidSession } = require('../../../middleware/sensitiveOperation') // 🔐 会话管理功能（2026-01-21）
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
// 事务边界治理 - 统一事务管理器
const TransactionManager = require('../../../utils/TransactionManager')
// P1-9：服务通过 ServiceManager 获取（B1-Injected + E2-Strict snake_case）

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
  requireValidSession, // 🔐 市场撤回属于敏感操作，需验证会话（2026-01-21 会话管理功能）
  marketRiskMiddleware.createWithdrawRiskMiddleware(),
  validatePositiveInteger('listing_id', 'params'),
  async (req, res) => {
    // P1-9：通过 ServiceManager 获取服务（B1-Injected + E2-Strict snake_case）
    const MarketListingService = req.app.locals.services.getService('market_listing_core')

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
 * @desc 撤回可叠加资产挂牌（C2C材料交易）
 * @access Private (需要登录，只能撤回自己的挂牌)
 *
 * @param {number} listing_id - 挂牌ID
 * @body {string} withdraw_reason - 撤回原因（可选，默认"用户主动撤回"）
 *
 * @returns {Object} 撤回结果
 * @returns {number} data.listing_id - 挂牌ID
 * @returns {string} data.offer_asset_code - 资产代码
 * @returns {number} data.offer_amount - 撤回数量
 * @returns {string} data.withdrawn_at - 撤回时间
 * @returns {Object} data.balance_after - 解冻后余额信息
 *
 * 业务场景：卖家撤回已挂牌的可叠加资产，解冻资产到可用余额
 */
router.post(
  '/fungible-assets/:listing_id/withdraw',
  authenticateToken,
  requireValidSession, // 🔐 可叠加资产撤回属于敏感操作，需验证会话（2026-01-21 会话管理功能）
  marketRiskMiddleware.createWithdrawRiskMiddleware(),
  validatePositiveInteger('listing_id', 'params'),
  async (req, res) => {
    // P1-9：通过 ServiceManager 获取服务（B1-Injected + E2-Strict snake_case）
    const MarketListingService = req.app.locals.services.getService('market_listing_core')

    try {
      const listingId = req.validated.listing_id
      const sellerId = req.user.user_id
      const { withdraw_reason } = req.body

      // 使用 TransactionManager 执行撤回操作
      const result = await TransactionManager.execute(
        async transaction => {
          return await MarketListingService.withdrawFungibleAssetListing(
            {
              listing_id: listingId,
              seller_user_id: sellerId
            },
            { transaction }
          )
        },
        { description: 'market_fungible_asset_withdraw' }
      )

      // 缓存失效已在 MarketListingService.withdrawFungibleAssetListing 中处理

      logger.info('可叠加资产挂牌撤回成功', {
        listing_id: listingId,
        seller_id: sellerId,
        offer_asset_code: result.listing.offer_asset_code,
        offer_amount: result.listing.offer_amount,
        withdraw_reason: withdraw_reason || '用户主动撤回'
      })

      return res.apiSuccess(
        {
          listing_id: listingId,
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
      if (error.code === 'INVALID_LISTING_KIND') {
        return res.apiError(
          '此接口仅支持可叠加资产挂牌，请使用 /listings/:listing_id/withdraw 撤回物品挂牌',
          error.code,
          null,
          error.statusCode || 400
        )
      }

      logger.error('撤回可叠加资产挂牌失败', {
        error: error.message,
        listing_id: req.validated.listing_id,
        seller_id: req.user?.user_id
      })

      return handleServiceError(error, res, '撤回失败')
    }
  }
)

module.exports = router
