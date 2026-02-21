/**
 * 资产域路由聚合
 *
 * 顶层路径：/api/v4/assets
 *
 * 职责：
 * - 聚合资产相关路由
 * - 余额查询 (/balance, /balances)
 * - 流水查询 (/transactions)
 * - 转换规则查询 (/conversion-rules) - 2026-01-14 新增
 * - 今日收支汇总 (/today-summary) - 2026-02-21 新增（决策 D-1）
 *
 * 架构原则：
 * - 路由层不直连 models（通过 ServiceManager 获取服务）
 * - 路由层不开启事务（事务管理在 Service 层）
 *
 * 创建时间：2025-12-29
 * 更新时间：2026-02-21（新增今日收支汇总，决策 D-1）
 */

'use strict'

const express = require('express')
const router = express.Router()

const balanceRoutes = require('./balance')
const transactionsRoutes = require('./transactions')
const conversionRulesRoutes = require('./conversion-rules')
const todaySummaryRoutes = require('./today-summary')

router.use('/', balanceRoutes)
router.use('/', transactionsRoutes)
router.use('/', conversionRulesRoutes) // GET /conversion-rules
router.use('/', todaySummaryRoutes) // GET /today-summary（决策 D-1：资产域通用今日汇总）

module.exports = router
