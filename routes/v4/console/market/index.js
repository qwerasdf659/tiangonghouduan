/**
 * 市场/交易域路由聚合入口
 *
 * @description 市场统计、竞价管理、兑换商品、汇率、交易订单
 * @route /api/v4/console/marketplace  /api/v4/console/bid-management  /api/v4/console/exchange-*  /api/v4/console/trade-orders
 */
const express = require('express')
const router = express.Router()

router.use('/marketplace', require('./marketplace'))
router.use('/bid-management', require('./bid-management'))
router.use('/exchange-items', require('./exchange-items'))
router.use('/exchange-rates', require('./exchange-rates'))
router.use('/trade-orders', require('./trade-orders'))

module.exports = router
