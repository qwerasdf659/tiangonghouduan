/**
 * market域 - 交易市场业务域聚合
 *
 * 顶层路径：/api/v4/market
 * 内部目录：routes/v4/market/
 *
 * 职责：
 * - 商品上架/下架
 * - 商品搜索/列表
 * - 商品购买
 * - 交易记录查询
 *
 * 📌 遵循规范：
 * - 统一使用/market作为顶层路径（不再使用/exchange-market）
 * - 用户端禁止/:id参数
 *
 * 创建时间：2025年01月21日
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()

// 交易市场核心路由
const exchangeMarketRoutes = require('./exchange_market')

// 挂载路由
router.use('/', exchangeMarketRoutes)

module.exports = router
