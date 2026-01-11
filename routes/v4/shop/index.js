/**
 * shop域 - 积分商城业务域聚合
 *
 * 顶层路径：/api/v4/shop
 * 内部目录：routes/v4/shop/
 *
 * 职责：
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
 * - /assets 子路径用于资产余额和流水查询（替代旧 /points 路由）
 *
 * 📌 重构记录（2025-12-30）：
 * - 移除 /points 子路由（已迁移到 /assets）
 * - 积分操作统一使用 AssetService
 *
 * 创建时间：2025年01月21日
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()

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

// 员工管理路由（2026-01-12 商家员工域权限体系升级 AC3）
const staffRoutes = require('./staff/index')

// 商家审计日志路由（2026-01-12 商家员工域权限体系升级 AC4.3）
const auditRoutes = require('./audit/index')

// 风险告警管理路由（2026-01-12 商家员工域权限体系升级 AC5）
const riskRoutes = require('./risk/index')

// 挂载路由
router.use('/exchange', exchangeRoutes) // B2C材料兑换（从 /api/v4/market 迁移）
router.use('/redemption', redemptionRoutes)
router.use('/consumption', consumptionRoutes)
router.use('/premium', premiumRoutes)
router.use('/assets', assetsRoutes) // 资产余额和流水查询（替代旧 /points 路由）
router.use('/staff', staffRoutes) // 员工管理（入职/调店/禁用/启用）
router.use('/audit', auditRoutes) // 商家审计日志查询
router.use('/risk', riskRoutes) // 风险告警管理

module.exports = router
