/**
 * 餐厅积分抽奖系统 V4.0 - 系统功能业务域聚合
 *
 * 顶层路径：/api/v4/system
 * 内部目录：routes/v4/system/
 *
 * 职责：
 * - 系统公告管理（announcements.js）
 * - 用户反馈系统（feedback.js）
 * - 系统状态和配置（status.js）
 * - 客服聊天系统（chat.js）
 * - 用户统计和管理员概览（user-stats.js）
 * - 数据统计报表（statistics.js）
 * - 系统通知管理（notifications.js）
 *
 * 📌 遵循规范：
 * - Controller拆分规范：每个子模块 150-250行
 * - 统一挂载到/system域
 *
 * 创建时间：2025年01月21日
 * 更新时间：2025年12月22日（拆分system.js为子模块）
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()

// 🔄 系统核心功能路由（已拆分为子模块）
const announcementsRoutes = require('./announcements') // 公告管理
const feedbackRoutes = require('./feedback') // 用户反馈
const statusRoutes = require('./status') // 系统状态和配置
const chatRoutes = require('./chat') // 客服聊天
const userStatsRoutes = require('./user-stats') // 用户统计和管理员概览

// 数据统计报表路由
const statisticsRoutes = require('./statistics')

// 系统通知路由
const notificationsRoutes = require('./notifications')

// 弹窗Banner路由（2025-12-22 新增）
const popupBannersRoutes = require('./popup-banners')

// 系统字典路由（2026-01-22 新增 - 中文化显示名称系统）
const dictionariesRoutes = require('./dictionaries')

// 挂载公告路由
router.use('/', announcementsRoutes)

// 挂载反馈路由
router.use('/', feedbackRoutes)

// 挂载系统状态和配置路由
router.use('/', statusRoutes)

// 挂载客服聊天路由
router.use('/', chatRoutes)

// 挂载用户统计和管理员概览路由
router.use('/', userStatsRoutes)

// 挂载数据统计报表路由
router.use('/statistics', statisticsRoutes)

// 挂载系统通知路由
router.use('/notifications', notificationsRoutes)

// 挂载弹窗Banner路由（2025-12-22 新增）
router.use('/', popupBannersRoutes)

// 挂载系统字典路由（2026-01-22 新增 - 中文化显示名称系统）
router.use('/dictionaries', dictionariesRoutes)

module.exports = router
