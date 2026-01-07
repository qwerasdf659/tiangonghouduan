/**
 * 餐厅积分抽奖系统 V4.5.0 - 商城资产管理API入口
 *
 * 功能模块（仅保留商城业务专用）：
 * - convert.js   - 材料转换接口（碎红水晶 → 钻石）- 用户端功能
 * - rules.js     - 转换规则查询接口 - 用户端功能
 *
 * 迁移说明（2026-01-07）：
 * - balance.js、transactions.js 已迁移到 /api/v4/assets/*（跨业务域底座）
 * - portfolio.js 已迁移到 /api/v4/console/assets/*（后台运营能力）
 *
 * 创建时间：2025年12月22日
 * 更新时间：2026年01月07日（架构重构 - 资产域接口迁移）
 */

'use strict'

const express = require('express')
const router = express.Router()

// 导入子路由模块（仅保留商城业务专用）
const convertRoutes = require('./convert')
const rulesRoutes = require('./rules')

// 挂载子路由
router.use('/', convertRoutes) // POST /convert
router.use('/', rulesRoutes) // GET /conversion-rules

module.exports = router
