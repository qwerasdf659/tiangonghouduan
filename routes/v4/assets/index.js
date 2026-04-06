/**
 * 资产域路由聚合
 *
 * 顶层路径：/api/v4/assets
 *
 * 职责：
 * - 余额查询 (/balance, /balances)
 * - 流水查询 (/transactions)
 * - 今日收支汇总 (/today-summary) - 2026-02-21 新增（决策 D-1）
 * - 统一资产转换 (/conversion) - 2026-04-05 合并 rates + shop/assets/convert
 *
 * 架构原则：
 * - 路由层不直连 models（通过 ServiceManager 获取服务）
 * - 路由层不开启事务（事务管理在 Service 层）
 */

'use strict'

const express = require('express')
const router = express.Router()

const balanceRoutes = require('./balance')
const transactionsRoutes = require('./transactions')
const todaySummaryRoutes = require('./today-summary')

router.use('/', balanceRoutes)
router.use('/', transactionsRoutes)
router.use('/', todaySummaryRoutes) // GET /today-summary（决策 D-1：资产域通用今日汇总）

/** 统一资产转换（2026-04-05 合并 rates + shop/assets/convert） */
const conversionRoutes = require('./conversion')
router.use('/conversion', conversionRoutes) // GET /conversion/rules, POST /conversion/preview, POST /conversion/convert

module.exports = router
