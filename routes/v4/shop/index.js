/**
 * shop域 - 积分商城业务域聚合（商家员工专用）
 *
 * 顶层路径：/api/v4/shop
 * 内部目录：routes/v4/shop/
 *
 * 职责：
 * - B2C材料兑换（官方商城兑换商品）
 * - 核销系统（兑换码核销）
 * - 消费记录（商家员工录入）
 * - 会员权益
 * - 资产管理
 * - 员工管理（店长功能）
 * - 商家审计日志
 * - 风险告警管理
 *
 * 📌 域边界隔离（2026-01-12 商家员工域权限体系升级 AC1.4）：
 * - 此域仅限 merchant_staff/merchant_manager 角色访问
 * - 必须在 store_staff 表中有 active 记录
 * - 平台内部角色（admin/ops/regional_manager 等）应使用 /api/v4/console/*
 * - 超级管理员（role_level >= 100）可兜底访问，但不建议日常使用
 *
 * 📌 遵循规范：
 * - 统一使用/shop作为顶层路径
 * - /exchange 子路径用于B2C材料兑换（从market域迁移）
 * - 用户端禁止/:id参数（使用/me端点）
 * - /assets 子路径用于资产余额和流水查询（替代旧 /points 路由）
 *
 * 📌 重构记录：
 * - 2026-01-12：增加商家域准入中间件（AC1.4）
 *
 * 创建时间：2025年01月21日
 * 更新时间：2026年01月12日
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()

// 认证中间件
const { authenticateToken, requireMerchantDomainAccess } = require('../../../middleware/auth')

/*
 * [已迁移] B2C材料兑换路由
 * 📌 2026-02-07 从 /api/v4/shop/exchange 迁移到 /api/v4/backpack/exchange
 * 原因：兑换是用户侧操作，不应被商家域准入中间件拦截（41个普通用户会被403）
 * 迁移位置：routes/v4/backpack/exchange.js
 */

// 核销系统路由（已拆分为子模块：orders.js, fulfill.js, query.js）
const redemptionRoutes = require('./redemption/index')

// 消费记录路由（已拆分为子模块：submit.js, query.js, review.js, qrcode.js）
const consumptionRoutes = require('./consumption/index')

/*
 * [已迁移] 高级空间（臻选空间）路由
 * 📌 2026-02-16 从 /api/v4/shop/premium 迁移到 /api/v4/backpack/exchange/premium-status 和 /unlock-premium
 * 原因：高级空间是用户侧功能，不应被商家域准入中间件拦截（决策2）
 * 迁移位置：routes/v4/backpack/exchange.js（premium-status + unlock-premium）
 */

// 资产管理路由（已拆分为子模块：convert.js, balance.js, transactions.js, rules.js）
const assetsRoutes = require('./assets/index')

// 员工管理路由（2026-01-12 商家员工域权限体系升级 AC3）
const staffRoutes = require('./staff/index')

// 商家审计日志路由（2026-01-12 商家员工域权限体系升级 AC4.3）
const auditRoutes = require('./audit/index')

// 风险告警管理路由（2026-01-12 商家员工域权限体系升级 AC5）
const riskRoutes = require('./risk/index')

/*
 * =================================================================
 * 🛡️ 商家域准入中间件（AC1.4 域边界隔离）
 *
 * 说明：
 * - 此中间件应用于整个 /api/v4/shop/* 域
 * - 验证用户是否为商家员工角色（merchant_staff/merchant_manager）
 * - 验证用户是否在 store_staff 表中有 active 记录
 * - 超级管理员（role_level >= 100）可跳过检查
 *
 * 被拦截的情况：
 * - 未认证用户 → 401 UNAUTHENTICATED
 * - 非商家角色（如 ops/regional_manager）→ 403 MERCHANT_DOMAIN_ACCESS_DENIED
 * - 无活跃门店绑定 → 403 NO_STORE_BINDING
 *
 * 📌 DB-3 迁移记录（2026-02-20）：
 * - GET /consumption/qrcode 已迁移到 /api/v4/user/consumption/qrcode
 * - 原因：QR 码生成是消费者行为，不属于商家域
 * - 与 exchange → backpack、premium → backpack 迁移决策一致
 * =================================================================
 */
router.use(authenticateToken, requireMerchantDomainAccess())

/*
 * 挂载子路由
 * [已迁移] router.use('/exchange', ...) → /api/v4/backpack/exchange（2026-02-07）
 * [已迁移] GET /consumption/qrcode → /api/v4/user/consumption/qrcode（2026-02-20 DB-3）
 */
router.use('/redemption', redemptionRoutes) // 核销系统（商家扫码核销，保留在 shop 域）
router.use('/consumption', consumptionRoutes) // 消费记录（submit/user-info/merchant-query 等商家操作）
// [已迁移] router.use('/premium', premiumRoutes) → /api/v4/backpack/exchange/（2026-02-16 决策2）
router.use('/assets', assetsRoutes) // 资产余额和流水查询（替代旧 /points 路由）
router.use('/staff', staffRoutes) // 员工管理（入职/调店/禁用/启用）
router.use('/audit', auditRoutes) // 商家审计日志查询
router.use('/risk', riskRoutes) // 风险告警管理

module.exports = router
