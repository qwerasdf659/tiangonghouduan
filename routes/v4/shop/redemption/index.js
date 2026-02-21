/**
 * 餐厅积分抽奖系统 V4.2 - 核销系统路由入口（Redemption System Routes）
 *
 * 职责：
 * - 新版核销系统HTTP API层
 * - 12位Base32核销码生成和核销
 * - 30天有效期管理
 * - 替代旧版8位HEX核销码系统
 *
 * 功能模块：
 * - orders.js   - 订单生成和取消
 * - fulfill.js  - 核销接口
 * - query.js    - 订单查询接口
 *
 * 核心接口：
 * 1. POST /api/v4/redemption/orders - 生成核销订单（12位Base32码）
 * 2. POST /api/v4/redemption/fulfill - 核销订单
 * 3. GET /api/v4/redemption/orders/:order_id - 查询订单详情
 * 4. POST /api/v4/redemption/orders/:order_id/cancel - 取消订单
 * 5. GET /api/v4/redemption/items/:item_instance_id/order - 查询物品的核销订单
 *
 * 创建时间：2025年12月22日
 * 使用 Claude Sonnet 4.5 模型
 */

const express = require('express')
const router = express.Router()

// 导入子路由模块
const ordersRoutes = require('./orders')
const fulfillRoutes = require('./fulfill')
const scanRoutes = require('./scan')
const queryRoutes = require('./query')

// 挂载子路由
router.use('/', ordersRoutes) // POST /orders, POST /orders/:order_id/cancel
router.use('/', fulfillRoutes) // POST /fulfill（文本码核销，备用）
router.use('/', scanRoutes) // POST /scan（QR码扫码核销，主流程）
router.use('/', queryRoutes) // GET /orders/:order_id, GET /items/:item_instance_id/order

module.exports = router
