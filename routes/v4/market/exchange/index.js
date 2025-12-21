/**
 * 兑换市场模块 - 聚合入口
 *
 * @route /api/v4/exchange_market
 * @description 兑换市场相关业务的统一入口，按功能拆分为多个子模块
 *
 * 子模块划分（按业务职责）：
 * - items.js    - 商品列表/详情（GET /items, GET /items/:item_id）
 * - exchange.js - 兑换操作（POST /exchange）
 * - orders.js   - 订单查询/管理（GET /orders, GET /orders/:order_no, POST /orders/:order_no/status）
 * - statistics.js - 统计数据（GET /statistics）
 *
 * 业务规则（V4.5.0强制）：
 * - ✅ 兑换只能使用材料资产支付（cost_asset_code + cost_amount）
 * - ✅ 支付资产扣减通过AssetService.changeBalance()执行
 * - ✅ 订单记录pay_asset_code和pay_amount字段（必填）
 * - ✅ 支持幂等性控制（business_id必填）
 * - ❌ 禁止积分支付和虚拟价值支付（已彻底移除）
 *
 * 架构规范：
 * - 符合技术架构标准TR-005：路由文件150-250行正常，>300行必须拆分
 * - 统一使用 res.apiSuccess / res.apiError 响应
 * - 通过 ServiceManager 获取 ExchangeMarketService
 *
 * 创建时间：2025年12月22日
 * 拆分原因：原exchange_market.js文件530行，超标1.8倍
 */

const express = require('express')
const router = express.Router()

// 导入子模块
const itemsRoutes = require('./items')
const exchangeRoutes = require('./exchange')
const ordersRoutes = require('./orders')
const statisticsRoutes = require('./statistics')

// 挂载子路由
router.use('/', itemsRoutes) // 商品列表/详情
router.use('/', exchangeRoutes) // 兑换操作
router.use('/', ordersRoutes) // 订单查询/管理
router.use('/', statisticsRoutes) // 统计数据

module.exports = router
