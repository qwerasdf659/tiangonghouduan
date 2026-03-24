/**
 * B2C 兑换商城管理 — 路由聚合入口
 *
 * @route /api/v4/console/exchange/*
 * @description 商品 CRUD + SKU + 订单 + 统计 + 运营操作
 * @module routes/v4/console/exchange
 */

'use strict'

const express = require('express')
const router = express.Router()

/** 商品 CRUD + SKU 管理 */
router.use('/items', require('./items'))

/** 兑换订单管理 */
router.use('/orders', require('./orders'))

/** 兑换市场统计 */
router.use('/stats', require('./stats'))

/** 商品运营操作（置顶、推荐、批量操作、缺图、绑图） */
router.use('/', require('./operations'))

module.exports = router
