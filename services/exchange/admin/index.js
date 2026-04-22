'use strict'

/**
 * 兑换市场管理 - Facade 入口
 *
 * 将原 AdminService.js (2308行) 拆分为 4 个子服务，
 * 通过 Facade 模式对外暴露统一接口，保持向后兼容。
 *
 * 子服务清单：
 * - ItemManagementService: 商品 CRUD（createExchangeItem/updateExchangeItem/deleteExchangeItem/_logStockChange）
 * - BatchOperationService: 批量操作（batchBindImages/batchUpdateSpace/batchUpdateStatus/batchUpdatePrice/batchSetIndividualPrices/batchUpdateCategory/batchUpdateRarity/getMissingImageItems）
 * - MarketQueryService: 市场查询/统计（getUserListingStats/getUserListings/updateUserListingLimit/checkTimeoutAndAlert/getAdminMarketItems/getMarketItemStatistics/getExchangeTopline/getItemDashboard/getSpaceDistribution）
 * - SkuService: SKU 管理（listSkus/createSku/updateSku/deleteSku/_updateSpuSummary）
 *
 * @module services/exchange/admin
 */

const ItemManagementService = require('./ItemManagementService')
const BatchOperationService = require('./BatchOperationService')
const MarketQueryService = require('./MarketQueryService')
const SkuService = require('./SkuService')

/* eslint-disable require-jsdoc */
class ExchangeAdminFacade {
  constructor(models) {
    this._item = new ItemManagementService(models)
    this._batch = new BatchOperationService(models)
    this._market = new MarketQueryService(models)
    this._sku = new SkuService(models)
  }

  // --- ItemManagementService ---
  createExchangeItem(...args) { return this._item.createExchangeItem(...args) }
  updateExchangeItem(...args) { return this._item.updateExchangeItem(...args) }
  deleteExchangeItem(...args) { return this._item.deleteExchangeItem(...args) }
  _logStockChange(...args) { return this._item._logStockChange(...args) }

  // --- BatchOperationService ---
  batchBindImages(...args) { return this._batch.batchBindImages(...args) }
  batchUpdateSpace(...args) { return this._batch.batchUpdateSpace(...args) }
  batchUpdateStatus(...args) { return this._batch.batchUpdateStatus(...args) }
  batchUpdatePrice(...args) { return this._batch.batchUpdatePrice(...args) }
  batchSetIndividualPrices(...args) { return this._batch.batchSetIndividualPrices(...args) }
  batchUpdateCategory(...args) { return this._batch.batchUpdateCategory(...args) }
  batchUpdateRarity(...args) { return this._batch.batchUpdateRarity(...args) }
  getMissingImageItems(...args) { return this._batch.getMissingImageItems(...args) }

  // --- MarketQueryService ---
  getUserListingStats(...args) { return this._market.getUserListingStats(...args) }
  getUserListings(...args) { return this._market.getUserListings(...args) }
  updateUserListingLimit(...args) { return this._market.updateUserListingLimit(...args) }
  checkTimeoutAndAlert(...args) { return this._market.checkTimeoutAndAlert(...args) }
  getAdminMarketItems(...args) { return this._market.getAdminMarketItems(...args) }
  getMarketItemStatistics(...args) { return this._market.getMarketItemStatistics(...args) }
  getExchangeTopline(...args) { return this._market.getExchangeTopline(...args) }
  getItemDashboard(...args) { return this._market.getItemDashboard(...args) }
  getSpaceDistribution(...args) { return this._market.getSpaceDistribution(...args) }

  // --- SkuService ---
  listSkus(...args) { return this._sku.listSkus(...args) }
  createSku(...args) { return this._sku.createSku(...args) }
  updateSku(...args) { return this._sku.updateSku(...args) }
  deleteSku(...args) { return this._sku.deleteSku(...args) }
  _updateSpuSummary(...args) { return this._sku._updateSpuSummary(...args) }
}

module.exports = ExchangeAdminFacade
