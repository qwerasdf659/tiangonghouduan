/**
 * market域 - C2C用户交易市场聚合入口
 *
 * @route /api/v4/market
 * @description C2C用户间交易市场（类似Steam市场、BUFF），用户可以上架/购买物品
 *
 * 📌 重构记录（2025-12-22）：
 * - 从 /api/v4/market 迁移到 /api/v4/market
 * - 明确业务语义：market域专门负责C2C用户间交易
 * - shop/exchange 负责B2C官方兑换
 *
 * 子模块划分（按业务职责）：
 * - listings.js - 市场挂单查询（GET /listings, GET /listings/:market_listing_id, GET /listing-status）
 * - sell.js     - 上架商品（POST /list, POST /fungible-assets/list）
 * - buy.js      - 购买商品（POST /listings/:market_listing_id/purchase）
 * - manage.js   - 撤回/管理（POST /listings/:market_listing_id/withdraw, POST /fungible-assets/:market_listing_id/withdraw）
 * - escrow.js   - C2C担保码（POST /trade-orders/:id/confirm-delivery, GET /trade-orders/:id/escrow-status, POST /trade-orders/:id/cancel）
 *
 * 业务说明：
 * - 用户可以将 inventory 中的物品挂单出售
 * - 其他用户可以购买挂单的物品
 * - 涉及资产冻结、交易订单、资产结算
 *
 * 架构规范：
 * - 符合技术架构标准TR-005：路由文件150-250行正常，>300行必须拆分
 * - 统一使用 res.apiSuccess / res.apiError 响应
 * - 通过 ServiceManager 获取 TradeOrderService
 *
 * 创建时间：2025年12月22日
 */

const express = require('express')
const router = express.Router()

// 导入子模块
const listingsRoutes = require('./listings')
const sellRoutes = require('./sell')
const buyRoutes = require('./buy')
const manageRoutes = require('./manage')
const escrowRoutes = require('./escrow')
const exchangeRateRoutes = require('./exchange-rate') // 固定汇率兑换（2026-02-23 市场增强）
const priceRoutes = require('./price') // 价格发现（2026-02-23 市场增强）
const analyticsRoutes = require('./analytics') // 市场数据分析（2026-02-23 市场增强）

// 挂载子路由
router.use('/', listingsRoutes) // 市场列表查询
router.use('/', sellRoutes) // 上架商品
router.use('/', buyRoutes) // 购买商品
router.use('/', manageRoutes) // 撤回/管理
router.use('/', escrowRoutes) // C2C担保码确认（Phase 4）
router.use('/', exchangeRateRoutes) // 固定汇率兑换
router.use('/', priceRoutes) // 价格发现
router.use('/', analyticsRoutes) // 市场数据分析

module.exports = router
