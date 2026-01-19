/**
 * 抽奖管理模块 - 路由聚合入口
 *
 * @description 管理员抽奖控制功能路由聚合
 * @version 5.2.0（新增定价配置管理端点）
 * @date 2026-01-19
 *
 * 模块结构：
 * - force-control.js: 强制中奖/不中奖控制
 * - adjustment.js: 概率调整和队列设置
 * - user-status.js: 用户状态查询和清理
 * - interventions.js: 干预规则列表和管理（2026-01-09新增）
 * - pricing-config.js: 活动定价配置管理（2026-01-19新增，Phase 3）
 *
 * 路由挂载说明：
 * - 此模块挂载在 /api/v4/console/lottery-management 路径下
 * - 原有 lottery_management.js 路由已拆分到子模块
 */

const express = require('express')
const router = express.Router()

// 导入子模块路由
const forceControlRoutes = require('./force-control')
const adjustmentRoutes = require('./adjustment')
const userStatusRoutes = require('./user-status')
const interventionsRoutes = require('./interventions') // 🆕 干预规则列表和管理（2026-01-09）
const pricingConfigRoutes = require('./pricing-config') // 🆕 定价配置管理（2026-01-19，Phase 3）

// 挂载子模块路由（路径相对于当前模块）
router.use('/', forceControlRoutes) // 包含 /force-win, /force-lose
router.use('/', adjustmentRoutes) // 包含 /probability-adjust, /user-specific-queue
router.use('/', userStatusRoutes) // 包含 /user-status/:user_id, /clear-user-settings/:user_id
router.use('/', interventionsRoutes) // 包含 /interventions, /interventions/:id, /interventions/:id/cancel
router.use('/', pricingConfigRoutes) // 包含 /campaigns/:campaign_id/pricing 系列端点

module.exports = router
