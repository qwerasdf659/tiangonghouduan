/**
 * 抽奖管理模块 - 路由聚合入口
 *
 * @description 管理员抽奖控制功能路由聚合
 * @version 5.0.0（模块化重构版）
 * @date 2025-12-22
 *
 * 模块结构：
 * - force-control.js: 强制中奖/不中奖控制
 * - adjustment.js: 概率调整和队列设置
 * - user-status.js: 用户状态查询和清理
 *
 * 路由挂载说明：
 * - 此模块挂载在 /api/v4/admin/lottery-management 路径下
 * - 原有 lottery_management.js 路由已拆分到子模块
 */

const express = require('express')
const router = express.Router()

// 导入子模块路由
const forceControlRoutes = require('./force-control')
const adjustmentRoutes = require('./adjustment')
const userStatusRoutes = require('./user-status')

// 挂载子模块路由（路径相对于当前模块）
router.use('/', forceControlRoutes) // 包含 /force-win, /force-lose
router.use('/', adjustmentRoutes) // 包含 /probability-adjust, /user-specific-queue
router.use('/', userStatusRoutes) // 包含 /user-status/:user_id, /clear-user-settings/:user_id

module.exports = router
