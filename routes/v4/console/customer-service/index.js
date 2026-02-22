/**
 * 客服管理 - 路由聚合入口
 *
 * @description 管理员端客服系统API路由聚合（GM工作台架构）
 * @version 7.0.0（新增用户上下文查询、工单系统、GM工具）
 * @date 2026-02-22
 *
 * 模块结构：
 * - sessions.js: 会话列表和统计
 * - messages.js: 消息获取、发送、标记已读
 * - operations.js: 会话转接和关闭
 * - agents.js: 客服座席管理（注册/配置/停用/工作负载）
 * - assignments.js: 用户-客服分配管理（分配/批量分配/解除）
 * - user-context.js: 用户上下文聚合查询（9个GET接口 + 一键诊断）
 * - issues.js: 工单CRUD + 内部备注
 * - gm-tools.js: 补偿发放 + 消息模板库
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
const userContextRoutes = require('./user-context') // 用户上下文聚合查询（C区面板数据源）
const issuesRoutes = require('./issues') // 工单管理（问题跟踪到底）
const gmToolsRoutes = require('./gm-tools') // GM工具（补偿发放 + 消息模板）

// 挂载子模块路由
router.use('/sessions', sessionsRoutes)
router.use('/sessions', messagesRoutes)
router.use('/sessions', operationsRoutes)
router.use('/agents', agentsRoutes) // 客服座席管理
router.use('/assignments', assignmentsRoutes) // 用户-客服分配管理
router.use('/user-context', userContextRoutes) // 用户上下文聚合查询
router.use('/issues', issuesRoutes) // 工单管理
router.use('/gm-tools', gmToolsRoutes) // GM工具

module.exports = router
