/**
 * 市场/交易域路由聚合入口
 *
 * @description C2C 二级市场管理（瘦身后仅 C2C 挂牌管理 + 市场统计 + 可交易资产配置）
 * @route /api/v4/console/marketplace/*
 *
 * 已迁移到独立顶级域的路由：
 * - B2C 兑换商品 → /console/exchange/items
 * - B2C 兑换订单 → /console/exchange/orders
 * - B2C 兑换统计 → /console/exchange/stats
 * - 汇率管理 → /console/assets/rates
 * - 竞拍管理 → /console/bids
 * - C2C 订单 → /console/marketplace/orders
 */
const express = require('express')
const router = express.Router()

/** C2C 挂牌管理 + 市场统计 + 可交易资产配置 */
router.use('/marketplace', require('./marketplace'))

/** C2C 交易订单（合并原 trade_orders + trade-orders 两处重复） */
router.use('/marketplace/orders', require('../marketplace/orders'))

module.exports = router
