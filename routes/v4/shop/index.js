/**
 * shop域 - 积分商城业务域聚合
 *
 * 顶层路径：/api/v4/shop
 * 内部目录：routes/v4/shop/
 *
 * 职责：
 * - 积分管理（查询、记录）
 * - 兑换系统（兑换码核销）
 * - 消费记录
 * - 会员权益
 * - 资产管理
 *
 * 📌 遵循规范：
 * - 统一使用/shop作为顶层路径
 * - 不再单独使用/redemption、/consumption、/premium等路径
 * - 用户端禁止/:id参数（使用/me端点）
 *
 * 创建时间：2025年01月21日
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()

// 积分管理路由（已拆分为子模块：balance.js, transactions.js, statistics.js, admin.js）
const pointsRoutes = require('./points/index')

// 兑换系统路由（已拆分为子模块：orders.js, fulfill.js, query.js）
const redemptionRoutes = require('./redemption/index')

// 消费记录路由（已拆分为子模块：submit.js, query.js, review.js, qrcode.js）
const consumptionRoutes = require('./consumption/index')

// 会员权益路由
const premiumRoutes = require('./premium')

// 资产管理路由（已拆分为子模块：convert.js, balance.js, transactions.js, rules.js）
const assetsRoutes = require('./assets/index')

// 挂载路由
router.use('/points', pointsRoutes)
router.use('/redemption', redemptionRoutes)
router.use('/consumption', consumptionRoutes)
router.use('/premium', premiumRoutes)
router.use('/assets', assetsRoutes)

module.exports = router
