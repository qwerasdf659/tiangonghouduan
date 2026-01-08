/**
 * 后台运营资产中心 - console/assets 路由入口
 *
 * 路由路径：/api/v4/console/assets/*
 *
 * 功能模块：
 * - portfolio.js - 资产总览接口（含物品列表、物品详情、物品事件历史）
 *
 * 权限要求：admin（可写）或 ops（只读）角色
 *
 * 迁移说明（2026-01-07）：
 * - 从 /api/v4/shop/assets/portfolio 迁移到 /api/v4/console/assets/portfolio
 * - 这些是后台运营能力，而非 shop 业务的一部分
 *
 * 创建时间：2026-01-07
 */

'use strict'

const express = require('express')
const router = express.Router()

// 导入子路由模块
const portfolioRoutes = require('./portfolio')
const transactionsRoutes = require('./transactions')

/*
 * 挂载子路由
 * GET /portfolio - 资产总览
 * GET /portfolio/items - 物品列表
 * GET /portfolio/items/:id - 物品详情
 * GET /item-events - 物品事件历史
 * GET /transactions - 资产流水查询（管理员视角）
 */
router.use('/', portfolioRoutes)
router.use('/transactions', transactionsRoutes)

module.exports = router
