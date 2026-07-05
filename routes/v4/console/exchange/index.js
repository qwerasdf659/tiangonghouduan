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

/** 以物易物配方管理（合规整改阶段六：旧物组合→官方产出物） */
router.use('/barter-recipes', require('./barter-recipes'))

/** 兑换复合门槛配置管理（模块C：高价值实物 VIP+多资产+消耗道具门槛） */
router.use('/redeem-requirements', require('./redeem-requirements'))

/** 供应商管理（商品编码体系 §3.8：供货商 CRUD + 货号辅助查询 + 健康统计） */
router.use('/suppliers', require('./suppliers'))

/** 产品系列管理（商品编码体系 §3.6：可读系列号轨道，系列 CRUD） */
router.use('/product-series', require('./product-series'))

/** 商品运营操作（置顶、推荐、批量操作、缺图、绑图） */
router.use('/', require('./operations'))

module.exports = router
