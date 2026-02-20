/**
 * 客服管理 - 路由聚合入口
 *
 * @description 管理员端客服系统API路由聚合
 * @version 6.0.0（新增座席管理和用户分配模块）
 * @date 2026-02-20
 *
 * 模块结构：
 * - sessions.js: 会话列表和统计
 * - messages.js: 消息获取、发送、标记已读
 * - operations.js: 会话转接和关闭
 * - agents.js: 客服座席管理（注册/配置/停用/工作负载）
 * - assignments.js: 用户-客服分配管理（分配/批量分配/解除）
 *
 * 路由挂载说明：
 * - 此模块挂载在 /api/v4/console/customer-service 路径下
 */

const express = require('express')
const router = express.Router()

// 导入子模块路由
const sessionsRoutes = require('./sessions')
const messagesRoutes = require('./messages')
const operationsRoutes = require('./operations')
const agentsRoutes = require('./agents')
const assignmentsRoutes = require('./assignments')

// 挂载子模块路由
router.use('/sessions', sessionsRoutes)
router.use('/sessions', messagesRoutes)
router.use('/sessions', operationsRoutes)
router.use('/agents', agentsRoutes) // 客服座席管理
router.use('/assignments', assignmentsRoutes) // 用户-客服分配管理

module.exports = router
