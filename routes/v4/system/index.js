/**
 * system域 - 系统功能业务域聚合
 *
 * 顶层路径：/api/v4/system
 * 内部目录：routes/v4/system/
 *
 * 职责：
 * - 系统公告管理
 * - 用户反馈系统
 * - 数据统计报表
 * - 系统通知管理
 * - 客服会话管理（用户端创建会话）
 *
 * 📌 遵循规范：
 * - 统计功能统一挂载到/system域（不再单独/statistics）
 * - 通知功能统一挂载到/system域（不再单独/notifications）
 *
 * 创建时间：2025年01月21日
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()

// 系统核心功能路由（公告、反馈、客服会话）
const systemRoutes = require('./system')

// 数据统计报表路由
const statisticsRoutes = require('./statistics')

// 系统通知路由
const notificationsRoutes = require('./notifications')

// 挂载路由
router.use('/', systemRoutes)
router.use('/statistics', statisticsRoutes)
router.use('/notifications', notificationsRoutes)

module.exports = router
