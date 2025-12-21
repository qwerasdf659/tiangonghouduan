/**
 * 餐厅积分抽奖系统 V4.5 - 兑换市场路由聚合入口
 *
 * 路由结构：
 * - /items - 商品列表查询
 * - /items/:id - 商品详情查询
 * - /exchange - 兑换商品
 * - /orders - 订单列表查询
 * - /orders/:order_no - 订单详情查询
 * - /orders/:order_no/status - 更新订单状态（管理员）
 * - /statistics - 统计数据（管理员）
 *
 * 模块拆分说明：
 * - products.js: 商品查询（GET /items, /items/:id）
 * - exchange.js: 兑换功能（POST /exchange）
 * - orders.js: 订单查询（GET /orders, /orders/:order_no）
 * - admin-exchange.js: 管理员功能（POST /orders/:order_no/status, GET /statistics）
 *
 * 创建时间：2025-12-22
 */

const express = require('express')
const router = express.Router()

// 导入拆分后的子模块路由
const productsRoutes = require('./products')
const exchangeRoutes = require('./exchange')
const ordersRoutes = require('./orders')
const adminExchangeRoutes = require('./admin-exchange')

// 挂载路由
router.use('/', productsRoutes) // GET /items, /items/:id
router.use('/', exchangeRoutes) // POST /exchange
router.use('/', ordersRoutes) // GET /orders, /orders/:order_no
router.use('/', adminExchangeRoutes) // POST /orders/:order_no/status, GET /statistics

module.exports = router
