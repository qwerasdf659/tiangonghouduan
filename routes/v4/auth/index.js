/**
 * auth域 - 认证授权业务域聚合
 *
 * 顶层路径：/api/v4/auth
 * 内部目录：routes/v4/auth/
 *
 * 职责：
 * - 用户登录/登出/注册
 * - Token验证/刷新
 *
 * 模块拆分说明：
 * - login.js: 登录功能（login, quick-login, decrypt-phone）
 * - token.js: Token管理（verify, refresh, logout）
 * - profile.js: 用户信息查询（profile）
 *
 * 📌 2026-01-08 重要变更：
 * - permissions.js 已独立挂载到 /api/v4/permissions（解决路由冲突）
 * - 原因：token.js 和 permissions.js 都有 POST /refresh，导致权限缓存接口不可达
 * - 详见文档：docs/路由冲突修复方案-POST-auth-refresh-2026-01-08.md
 *
 * 📌 遵循规范：
 * - 用户端禁止/:id参数
 * - 仅保留/me端点（当前用户自查）
 *
 */

const express = require('express')
const router = express.Router()

// 导入拆分后的子模块路由
const loginRoutes = require('./login')
const tokenRoutes = require('./token')
const profileRoutes = require('./profile')
// 挂载路由
router.use('/', loginRoutes) // POST /login, /quick-login, /decrypt-phone
router.use('/', tokenRoutes) // GET /verify, POST /refresh, /logout
router.use('/', profileRoutes) // GET /profile
/*
 * 🔧 2026-01-08：权限路由已独立挂载到 /api/v4/permissions（解决路由冲突）
 * router.use('/', permissionRoutes)
 */

module.exports = router
