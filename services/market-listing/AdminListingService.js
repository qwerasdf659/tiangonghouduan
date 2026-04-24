/**
 * 市场挂牌管理端服务（AdminListingService）
 *
 * V4.7.0 大文件拆分方案 Phase 3
 * 从 CoreService.js (1375行) 拆分
 *
 * 职责：
 * - 管理员强制撤回挂牌
 *
 * @module services/market-listing/AdminListingService
 */

const {
  MarketListing,
  Item
} = require('../../models')
const BalanceService = require('../asset/BalanceService')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const logger = require('../../utils/logger').logger
const AuditLogService = require('../AuditLogService')
const { OPERATION_TYPES } = require('../../constants/AuditOperationTypes')
const CoreService = require('./CoreService')

/**
 * 市场挂牌管理端服务类
 *
 * @class MarketListingAdminListingService
 */
class MarketListingAdminListingService {
  /**
   * 管理员强制撤回挂牌
   *
   * @param {Object} params - 撤回参数
   * @param {number} params.market_listing_id - 挂牌ID
   * @param {number} params.operator_id - 操作员ID
   * @param {string} params.reason - 撤回原因
   * @param {Object} [options] - 事务选项
   * @returns {Promise<Object>} 撤回结果
   */
  static async adminForceWithdrawListing(params, options = {}) {
    const { market_listing_id, operator_id, reason } = params

    if (!market_listing_id) {
      const error = new Error('market_listing_id 是必需参数')
      error.code = 'MISSING_LISTING_ID'
      error.statusCode = 400
      throw error
    }

    if (!operator_id) {
      const error = new Error('operator_id 是必需参数')
      error.code = 'MISSING_OPERATOR_ID'
      error.statusCode = 400
      throw error
    }
    if (!reason) {
      const error = new Error('撤回原因是必需参数')
      error.code = 'MISSING_WITHDRAW_REASON'
      error.statusCode = 400
      throw error
    }

    const transaction = assertAndGetTransaction(
      options,
      'AdminListingService.adminForceWithdrawListing'
    )

    const listing = await MarketListing.findOne({
      where: { market_listing_id },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!listing) {
      const error = new Error(`挂牌不存在: ${market_listing_id}`)
      error.code = 'LISTING_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    const allowedStatuses = ['on_sale', 'locked']
    if (!allowedStatuses.includes(listing.status)) {
      const error = new Error(`挂牌状态不可撤回: ${listing.status}（仅支持 on_sale、locked 状态）`)
      error.code = 'INVALID_LISTING_STATUS'
      error.statusCode = 400
      throw error
    }

    const originalStatus = listing.status

    let cancelledOrders = []
    if (listing.status === 'locked' && listing.locked_by_order_id) {
      cancelledOrders = await CoreService._cancelBuyerOrdersForListing(
        listing.market_listing_id,
        transaction
      )
    }

    const needsSellerUnfreeze =
      listing.listing_kind === 'fungible_asset' && listing.seller_offer_frozen

    await listing.update(
      {
        status: 'admin_withdrawn',
        locked_by_order_id: null,
        locked_at: null,
        seller_offer_frozen: needsSellerUnfreeze ? false : listing.seller_offer_frozen,
        meta: {
          ...listing.meta,
          force_withdrawn_by: operator_id,
          force_withdrawn_reason: reason,
          force_withdrawn_at: new Date().toISOString(),
          original_status: originalStatus
        }
      },
      { transaction }
    )

    let item = null
    if (listing.listing_kind === 'item' && listing.offer_item_id) {
      item = await Item.findOne({
        where: { item_id: listing.offer_item_id },
        transaction
      })
      if (item) {
        await item.update({ status: 'available' }, { transaction })
      }
    } else if (needsSellerUnfreeze) {
      // eslint-disable-next-line no-restricted-syntax
      await BalanceService.unfreeze(
        {
          idempotency_key: `admin_force_withdraw_${listing.market_listing_id}`,
          business_type: 'admin_force_withdraw_unfreeze',
          user_id: listing.seller_user_id,
          asset_code: listing.offer_asset_code,
          amount: listing.offer_amount,
          meta: {
            market_listing_id: listing.market_listing_id,
            reason,
            operator_id
          }
        },
        { transaction }
      )
    }

    await AuditLogService.logOperation({
      operator_id,
      operation_type: OPERATION_TYPES.MARKET_LISTING_ADMIN_WITHDRAW,
      target_type: 'MarketListing',
      target_id: listing.market_listing_id,
      action: 'admin_force_withdraw',
      before_data: { status: originalStatus },
      after_data: { status: 'admin_withdrawn' },
      reason,
      is_critical_operation: true,
      idempotency_key: `admin_force_withdraw_${listing.market_listing_id}_${Date.now()}`
    })

    try {
      await BusinessCacheHelper.invalidateMarketListings('admin_force_withdrawn')
    } catch (cacheError) {
      logger.warn('[AdminListingService] 缓存失效失败（非致命）:', cacheError.message)
    }

    logger.warn(`[AdminListingService] 管理员强制撤回挂牌: ${listing.market_listing_id}`, {
      operator_id,
      reason,
      original_status: originalStatus,
      new_status: 'admin_withdrawn',
      cancelled_orders_count: cancelledOrders.length
    })

    return { listing, item, cancelled_orders: cancelledOrders }
  }
}

module.exports = MarketListingAdminListingService
