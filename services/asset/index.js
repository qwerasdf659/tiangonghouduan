'use strict'

/**
 * 资产模块统一导出入口
 *
 * @description 提供统一的资产服务访问接口
 * @module services/asset
 * @version 1.0.0
 * @date 2026-01-31
 *
 * 本模块由 AssetService.js 拆分而来（V4.7.0 大文件拆分方案 Phase 1）
 *
 * 拆分后的服务：
 * - BalanceService：余额操作（8个方法）
 *   - getOrCreateAccount, getOrCreateBalance, changeBalance
 *   - freeze, unfreeze, settleFromFrozen
 *   - getBalance, getAllBalances
 *
 * - ItemService：物品操作（9个方法）
 *   - mintItem, lockItem, unlockItem, transferItem, consumeItem
 *   - recordItemEvent, getItemEvents, getUserItemInstances, getItemInstanceDetail
 *
 * - QueryService：查询统计（7个方法）
 *   - getTotalBudgetPoints, getBudgetPointsByCampaigns, getTransactions
 *   - getTransactionByIdempotencyKey, getAssetPortfolio, getSystemStats
 *
 * 服务类型：所有子服务均为静态类（与原 AssetService 保持一致）
 *
 * 服务注册（services/index.js）：
 * - asset_balance → BalanceService
 * - asset_item → ItemService
 * - asset_query → QueryService
 *
 * 调用方式：
 * 1. 通过 ServiceManager：
 *    const BalanceService = services.getService('asset_balance')
 *    await BalanceService.changeBalance(userId, assetCode, amount, options)
 *
 * 2. 直接引用：
 *    const { BalanceService } = require('./services/asset')
 *    await BalanceService.changeBalance(userId, assetCode, amount, options)
 */

const BalanceService = require('./BalanceService')
const ItemService = require('./ItemService')
const QueryService = require('./QueryService')
const PortfolioQueryService = require('./PortfolioQueryService')

module.exports = {
  BalanceService,
  ItemService,
  QueryService,
  PortfolioQueryService
}
