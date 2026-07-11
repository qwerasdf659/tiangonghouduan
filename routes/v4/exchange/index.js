/**
 * 用户域 B2C 兑换路由 - 挂载入口（技术债务方案 7.4-8：路由拆分）
 *
 * 路径：/api/v4/exchange
 *
 * 职责：只做子路由挂载，不承载业务端点（原 1086 行端点实现拆至各子路由文件）。
 *
 * 子路由清单（挂载顺序保持拆分前各端点注册相对顺序，所有对外 URL 完全不变）：
 * - items.js       （'/' 无前缀挂载）商品浏览类：GET /items、GET /items/:exchange_item_id、
 *                   GET /space-stats、GET /premium-status、POST /unlock-premium
 * - orders.js      （'/' 无前缀挂载）下单/订单类：POST /、POST /orders/:order_no/rate、
 *                   GET /orders、GET /orders/:order_no、POST /orders/:order_no/confirm-receipt、
 *                   POST /orders/:order_no/cancel、PUT /orders/:order_no/address、
 *                   GET /orders/:order_no/contact、GET /orders/:order_no/track
 * - bid.js         （'/bid' 前缀挂载）竞价子路由（B2C 兑换商品竞拍，底表 FK→exchange_items）
 * - decorations.js （'/decorations' 前缀挂载）星石虚拟装饰子路由（模块D）
 * - barter.js      （'/barter' 前缀挂载）以物易物：GET /barter/recipes、POST /barter
 *
 * 架构规范：
 * - 通过 ServiceManager 获取 ExchangeService（exchange_query / exchange_core）
 * - 写操作通过 TransactionManager.execute() 管理事务边界
 * - 统一使用 res.apiSuccess / res.apiError 响应
 *
 * @module routes/v4/exchange
 * @updated 2026-07-11（技术债务方案 7.4-8：拆分为 items/orders/barter 子路由，本文件只做挂载）
 */

'use strict'

const express = require('express')
const router = express.Router()

/**
 * 商品浏览类子路由（商品列表/详情、空间统计、高级空间状态与解锁）
 * 无前缀挂载：对外 URL 保持 /api/v4/exchange/items 等原路径不变
 */
const itemRoutes = require('./items')
router.use('/', itemRoutes)

/**
 * 下单/订单类子路由（执行兑换、订单列表/详情、收货/取消/评分/地址/物流）
 * 无前缀挂载：对外 URL 保持 POST /api/v4/exchange、/api/v4/exchange/orders/* 等原路径不变
 */
const orderRoutes = require('./orders')
router.use('/', orderRoutes)

/**
 * 竞价子路由（B2C 兑换商品竞拍）
 * 底表 FK→exchange_items
 */
const bidRoutes = require('./bid')
router.use('/bid', bidRoutes)

/**
 * 星石虚拟装饰子路由（模块D：纯展示装饰，星石明码标价购买）
 */
const decorationRoutes = require('./decorations')
router.use('/decorations', decorationRoutes)

/**
 * 以物易物子路由（B2C 官方合成：旧物核销 → 官方库存产出新物）
 * '/barter' 前缀挂载：对外 URL 保持 GET /barter/recipes、POST /barter 原路径不变
 */
const barterRoutes = require('./barter')
router.use('/barter', barterRoutes)

module.exports = router
