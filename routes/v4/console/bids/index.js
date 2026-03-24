/**
 * 竞拍管理 — 独立顶级域路由聚合入口
 *
 * @route /api/v4/console/bids/*
 * @description 竞拍商品创建/列表/详情/结算/取消
 * @module routes/v4/console/bids
 */

'use strict'

const express = require('express')
const router = express.Router()

router.use('/', require('./management'))

module.exports = router
