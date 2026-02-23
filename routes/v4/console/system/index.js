/**
 * 管理后台 - 系统模块路由聚合入口
 *
 * @description 聚合系统监控、公告管理、反馈管理相关路由
 * @version 6.0.0
 * @date 2025-12-22
 * @updated 2026-02-06（审计日志已迁移到 /api/v4/console/admin-audit-logs 统一管理）
 *
 * 模块结构：
 * - monitoring.js: 系统监控（/status, /dashboard, /management-status）
 * - feedbacks.js: 反馈管理（列表、回复、状态更新）
 * - placement.js: 活动投放位置配置管理
 * - exchange-page-config.js: 兑换页面配置管理
 *
 * 路由挂载说明：
 * - 此模块挂载在 /api/v4/console/system 路径下
 * - 完整路径示例：/api/v4/console/system/status
 */

const express = require('express')
const router = express.Router()

// 导入子模块路由
const monitoringRoutes = require('./monitoring')
// 公告已合并到 ad-campaigns（category=system），此处不再单独挂载
const feedbacksRoutes = require('./feedbacks')
const placementRoutes = require('./placement') // 2026-02-15: 活动投放位置配置管理
const exchangePageConfigRoutes = require('./exchange-page-config') // 2026-02-19: 兑换页面配置管理

// 挂载子模块路由
router.use('/', monitoringRoutes) // 包含 /status, /dashboard, /management-status
router.use('/feedbacks', feedbacksRoutes) // 反馈管理
router.use('/placement', placementRoutes) // 活动投放位置配置管理 GET+PUT
router.use('/exchange-page-config', exchangePageConfigRoutes) // 兑换页面配置管理 GET+PUT

module.exports = router
