/**
 * 交易市场模块 - 聚合入口
 *
 * @route /api/v4/inventory/market
 * @description 交易市场相关业务的统一入口，按功能拆分为多个子模块
 *
 * 子模块划分（按业务职责）：
 * - listings.js - 市场列表查询（GET /listings, GET /listings/:listing_id, GET /listing-status）
 * - sell.js     - 上架商品（POST /list, POST /fungible-assets/list）
 * - buy.js      - 购买商品（POST /listings/:listing_id/purchase）
 * - manage.js   - 撤回/管理（POST /listings/:listing_id/withdraw, POST /fungible-assets/:listing_id/withdraw）
 *
 * 架构规范：
 * - 符合技术架构标准TR-005：路由文件150-250行正常，>300行必须拆分
 * - 统一使用 res.apiSuccess / res.apiError 响应
 * - 通过 ServiceManager 获取所需 Service
 *
 * 创建时间：2025年12月22日
 * 拆分原因：原inventory-market.js文件679行，超标2.3倍
 */

const express = require('express')
const router = express.Router()

// 导入子模块
const listingsRoutes = require('./listings')
const sellRoutes = require('./sell')
const buyRoutes = require('./buy')
const manageRoutes = require('./manage')

// 挂载子路由
router.use('/', listingsRoutes) // 市场列表查询
router.use('/', sellRoutes) // 上架商品
router.use('/', buyRoutes) // 购买商品
router.use('/', manageRoutes) // 撤回/管理

module.exports = router
