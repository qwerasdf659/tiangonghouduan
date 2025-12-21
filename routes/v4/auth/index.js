/**
 * auth域 - 认证授权业务域聚合
 *
 * 顶层路径：/api/v4/auth
 * 内部目录：routes/v4/auth/
 *
 * 职责：
 * - 用户登录/登出/注册
 * - Token验证/刷新
 * - 权限检查（仅自己的权限）
 *
 * 📌 遵循规范：
 * - 用户端禁止/:id参数（查询他人权限已迁移到/admin域）
 * - 仅保留/me端点（当前用户自查）
 *
 * 创建时间：2025年01月21日
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()

// 认证相关路由（登录/登出/注册/验证）
const authRoutes = require('./auth')

// 权限相关路由（仅/me端点，查询他人权限在/admin域）
const permissionRoutes = require('./permissions')

// 挂载路由
router.use('/', authRoutes)
router.use('/', permissionRoutes)

module.exports = router
