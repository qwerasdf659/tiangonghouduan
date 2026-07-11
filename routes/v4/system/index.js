/**
 * 天工商户营销平台 V4.0 - 系统功能业务域聚合
 *
 * 顶层路径：/api/v4/system
 * 内部目录：routes/v4/system/
 *
 * 职责：
 * - 用户反馈系统（feedback.js）
 * - 系统状态和配置（status.js）
 * - 客服聊天系统（chat.js）
 * - 用户统计（user-stats.js；管理员概览已迁 console 域 2026-07-11）
 * - 数据统计报表（statistics.js）
 * - 系统字典（dictionaries.js）
 * - 系统公开配置（config.js）
 * - 广告事件上报（ad-events.js）
 *
 * 📌 遵循规范：
 * - Controller拆分规范：每个子模块 150-250行
 * - 统一挂载到/system域
 *
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()

// 🔄 系统核心功能路由（已拆分为子模块）
const feedbackRoutes = require('./feedback') // 用户反馈
const statusRoutes = require('./status') // 系统状态和配置
const chatRoutes = require('./chat') // 客服聊天
const csAgentRoutes = require('./cs-agent') // 小程序简版客服回复端（座席专用）
const userStatsRoutes = require('./user-stats') // 用户统计和管理员概览

// 数据统计报表路由
const statisticsRoutes = require('./statistics')

// 弹窗Banner路由（2025-12-22 新增）

// 轮播图路由（Phase 1 新增 — 拍板决策1：轮播图独立表）

// 系统字典路由（2026-01-22 新增 - 中文化显示名称系统）
const dictionariesRoutes = require('./dictionaries')

// 系统公开配置路由（2026-02-15 新增 - 活动位置配置，无需登录）
const configRoutes = require('./config')

// 售后申诉路由（2026-06-02 新增 - 方案A，C端只读查询售后进度，脱敏下发）
const disputesRoutes = require('./disputes')

// 协议正文只读路由（BE-6 新增 - 用户协议/隐私政策正文，公开只读，存 system_settings）
const agreementRoutes = require('./agreement')

// 小程序版本闸门路由（2026-06-02 新增 - 公开只读，无需登录，维护期可读）
const appVersionRoutes = require('./app-version')

// 🔴 广告事件上报路由（Phase 2-5）
const adEventsRoutes = require('./ad-events')
const adDeliveryRoutes = require('./ad-delivery')

// 挂载反馈路由
router.use('/', feedbackRoutes)

// 挂载系统状态和配置路由
router.use('/', statusRoutes)

// 挂载客服聊天路由
router.use('/', chatRoutes)
router.use('/cs-agent', csAgentRoutes) // 小程序简版客服回复端（/api/v4/system/cs-agent/*）

// 挂载用户统计路由
router.use('/', userStatsRoutes)

// 挂载数据统计报表路由
router.use('/statistics', statisticsRoutes)

// 挂载系统字典路由（2026-01-22 新增 - 中文化显示名称系统）
router.use('/dictionaries', dictionariesRoutes)

// 挂载系统公开配置路由（2026-02-15 新增 - 活动位置配置，前端直接调用获取最新配置）
router.use('/config', configRoutes)

router.use('/disputes', disputesRoutes)

// 挂载协议正文路由（BE-6 新增 - GET /api/v4/system/agreement/:doc_type，公开只读）
router.use('/agreement', agreementRoutes)

// 挂载小程序版本闸门路由（2026-06-02 新增 - GET /api/v4/system/app-version，公开只读）
router.use('/', appVersionRoutes)

// 挂载广告事件上报路由（Phase 2-5 新增）
router.use('/ad-events', adEventsRoutes)
router.use('/ad-delivery', adDeliveryRoutes)

module.exports = router
