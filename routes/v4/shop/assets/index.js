/**
 * 餐厅积分抽奖系统 V4.5.0 - 资产管理API入口
 *
 * 功能模块：
 * - portfolio.js - 资产总览接口（统一资产域入口 - 2025-12-28新增）
 * - convert.js   - 材料转换接口（碎红水晶 → 钻石）
 * - balance.js   - 余额查询接口（单个/全部资产）
 * - transactions.js - 资产流水查询接口
 * - rules.js     - 转换规则查询接口
 *
 * 创建时间：2025年12月22日
 * 更新时间：2025年12月28日（新增资产总览接口）
 * 使用 Claude Sonnet 4.5 模型
 */

const express = require('express')
const router = express.Router()

// 导入子路由模块
const portfolioRoutes = require('./portfolio')
const convertRoutes = require('./convert')
const balanceRoutes = require('./balance')
const transactionsRoutes = require('./transactions')
const rulesRoutes = require('./rules')

// 挂载子路由
router.use('/', portfolioRoutes) // GET /portfolio, GET /portfolio/items, GET /portfolio/items/:id
router.use('/', convertRoutes) // POST /convert
router.use('/', balanceRoutes) // GET /balance, GET /balances
router.use('/', transactionsRoutes) // GET /transactions
router.use('/', rulesRoutes) // GET /conversion-rules

module.exports = router
