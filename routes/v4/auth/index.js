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
 * 模块拆分说明：
 * - login.js: 登录功能（login, quick-login, decrypt-phone）
 * - token.js: Token管理（verify, refresh, logout）
 * - profile.js: 用户信息查询（profile）
 * - permissions.js: 权限相关
 *
 * 📌 遵循规范：
 * - 用户端禁止/:id参数（查询他人权限已迁移到/admin域）
 * - 仅保留/me端点（当前用户自查）
 *
 * 创建时间：2025年01月21日
 * 更新时间：2025年12月22日 - 拆分大文件
 */

const express = require('express')
const router = express.Router()

// 导入拆分后的子模块路由
const loginRoutes = require('./login')
const tokenRoutes = require('./token')
const profileRoutes = require('./profile')
const permissionRoutes = require('./permissions')

// 挂载路由
router.use('/', loginRoutes) // POST /login, /quick-login, /decrypt-phone
router.use('/', tokenRoutes) // GET /verify, POST /refresh, /logout
router.use('/', profileRoutes) // GET /profile
router.use('/', permissionRoutes) // 权限相关

module.exports = router
