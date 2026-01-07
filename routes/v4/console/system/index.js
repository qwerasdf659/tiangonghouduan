/**
 * 管理后台 - 系统模块路由聚合入口
 *
 * @description 聚合系统监控、公告管理、反馈管理相关路由
 * @version 5.0.0（模块化重构版）
 * @date 2025-12-22
 *
 * 模块结构：
 * - monitoring.js: 系统监控（/status, /dashboard, /management-status）
 * - announcements.js: 公告管理（CRUD）
 * - feedbacks.js: 反馈管理（列表、回复、状态更新）
 *
 * 路由挂载说明：
 * - 此模块挂载在 /api/v4/console/system 路径下
 * - 同时在 /api/v4/console 根路径挂载核心监控接口（兼容性）
 */

const express = require('express')
const router = express.Router()

// 导入子模块路由
const monitoringRoutes = require('./monitoring')
const announcementsRoutes = require('./announcements')
const feedbacksRoutes = require('./feedbacks')

// 挂载子模块路由
router.use('/', monitoringRoutes) // 包含 /status, /dashboard, /management-status
router.use('/announcements', announcementsRoutes) // 公告管理 CRUD
router.use('/feedbacks', feedbacksRoutes) // 反馈管理

module.exports = router
