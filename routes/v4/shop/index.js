/**
 * shop域 - 积分商城业务域聚合
 *
 * 顶层路径：/api/v4/shop
 * 内部目录：routes/v4/shop/
 *
 * 职责：
 * - 积分管理（查询、记录）
 * - B2C材料兑换（官方商城兑换商品）
 * - 核销系统（兑换码核销）
 * - 消费记录
 * - 会员权益
 * - 资产管理
 *
 * 📌 遵循规范：
 * - 统一使用/shop作为顶层路径
 * - /exchange 子路径用于B2C材料兑换（从market域迁移）
 * - 用户端禁止/:id参数（使用/me端点）
 *
 * 📌 重构记录（2025-12-22）：
 * - 新增 /exchange 子路由（B2C材料兑换，从 /api/v4/market 迁移）
 * - 明确区分：shop/exchange 是B2C兑换，market 是C2C交易
 *
 * 创建时间：2025年01月21日
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()

// 积分管理路由（已拆分为子模块：balance.js, transactions.js, statistics.js, admin.js）
const pointsRoutes = require('./points/index')

/*
 * B2C材料兑换路由（已拆分为子模块：items.js, exchange.js, orders.js, statistics.js）
 * 📌 2025-12-22 从 /api/v4/market 迁移到 /api/v4/shop/exchange
 */
const exchangeRoutes = require('./exchange/index')

// 核销系统路由（已拆分为子模块：orders.js, fulfill.js, query.js）
const redemptionRoutes = require('./redemption/index')

// 消费记录路由（已拆分为子模块：submit.js, query.js, review.js, qrcode.js）
const consumptionRoutes = require('./consumption/index')

// 会员权益路由
const premiumRoutes = require('./premium')

// 资产管理路由（已拆分为子模块：convert.js, balance.js, transactions.js, rules.js）
const assetsRoutes = require('./assets/index')

// 挂载路由
router.use('/points', pointsRoutes)
router.use('/exchange', exchangeRoutes) // B2C材料兑换（从 /api/v4/market 迁移）
router.use('/redemption', redemptionRoutes)
router.use('/consumption', consumptionRoutes)
router.use('/premium', premiumRoutes)
router.use('/assets', assetsRoutes)

module.exports = router
