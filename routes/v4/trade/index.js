/**
 * 餐厅积分抽奖系统 V4.0 - 交易市场路由聚合入口
 *
 * 路由结构：
 * - /market/listings - 市场挂牌列表查询
 * - /market/listings/:id - 市场挂牌详情查询
 * - /market/listings/:id/purchase - 购买市场商品
 * - /market/listings/:id/withdraw - 撤回市场挂牌
 * - /market/list - 上架商品到市场
 * - /market/listing-status - 用户上架状态查询
 * - /market/fungible-assets/* - 可叠加资产功能
 *
 * 模块拆分说明：
 * - market-query.js: 市场查询功能（列表、详情、状态）
 * - market-trade.js: 市场交易功能（购买）
 * - market-manage.js: 市场管理功能（上架、撤回）
 * - fungible-assets.js: 可叠加资产功能
 *
 * 创建时间：2025-12-22
 */

const express = require('express')
const router = express.Router()

// 导入拆分后的子模块路由
const marketQueryRoutes = require('./market-query')
const marketTradeRoutes = require('./market-trade')
const marketManageRoutes = require('./market-manage')
const fungibleAssetsRoutes = require('./fungible-assets')

/*
 * 挂载市场查询路由（列表、详情、状态）
 * GET /market/listings
 * GET /market/listings/:listing_id
 * GET /market/listing-status
 */
router.use('/market', marketQueryRoutes)

/*
 * 挂载市场交易路由（购买）
 * POST /market/listings/:listing_id/purchase
 */
router.use('/market', marketTradeRoutes)

/*
 * 挂载市场管理路由（上架、撤回）
 * POST /market/list
 * POST /market/listings/:listing_id/withdraw
 */
router.use('/market', marketManageRoutes)

/*
 * 挂载可叠加资产路由
 * POST /market/fungible-assets/list
 * POST /market/fungible-assets/:listing_id/withdraw
 */
router.use('/market/fungible-assets', fungibleAssetsRoutes)

module.exports = router
