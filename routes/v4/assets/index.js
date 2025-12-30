/**
 * 资产域路由聚合
 *
 * 顶层路径：/api/v4/assets
 *
 * 职责：
 * - 聚合资产相关路由
 * - 余额查询 (/balance, /balances)
 * - 流水查询 (/transactions)
 *
 * 架构原则：
 * - 路由层不直连 models（通过 ServiceManager 获取服务）
 * - 路由层不开启事务（事务管理在 Service 层）
 *
 * 创建时间：2025-12-29
 */

'use strict'

const express = require('express')
const router = express.Router()

const balanceRoutes = require('./balance')
const transactionsRoutes = require('./transactions')

router.use('/', balanceRoutes)
router.use('/', transactionsRoutes)

module.exports = router
