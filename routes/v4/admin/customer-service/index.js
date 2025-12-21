/**
 * 客服管理 - 路由聚合入口
 *
 * @description 管理员端客服系统API路由聚合
 * @version 5.0.0（模块化重构版）
 * @date 2025-12-22
 *
 * 模块结构：
 * - sessions.js: 会话列表和统计
 * - messages.js: 消息获取、发送、标记已读
 * - operations.js: 会话转接和关闭
 *
 * 路由挂载说明：
 * - 此模块挂载在 /api/v4/admin/customer-service 路径下
 * - 原有 customer_service.js 路由已拆分到子模块
 */

const express = require('express')
const router = express.Router()

// 导入子模块路由
const sessionsRoutes = require('./sessions')
const messagesRoutes = require('./messages')
const operationsRoutes = require('./operations')

// 挂载子模块路由
router.use('/sessions', sessionsRoutes) // 包含 /sessions 和 /sessions/stats
router.use('/sessions', messagesRoutes) // 包含 /sessions/:session_id/messages, /send, /mark-read
router.use('/sessions', operationsRoutes) // 包含 /sessions/:session_id/transfer, /close

module.exports = router
