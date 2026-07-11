/**
 * 运营看板 — Dashboard 路由聚合入口（唯一 dashboard 模块，2026-07-11 双 dashboard 合并）
 *
 * 子路由：
 * - overview.js：系统概览 / 待处理聚合 / 业务健康度 / 时间对比 / 平台收入
 * - stats.js：跨域顶线数据（B2C 兑换 + 官方竞价）
 *
 * @route /api/v4/console/dashboard/*
 * @module routes/v4/console/dashboard
 */

'use strict'

const express = require('express')
const router = express.Router()

router.use('/stats', require('./stats'))
router.use('/', require('./overview'))

module.exports = router
