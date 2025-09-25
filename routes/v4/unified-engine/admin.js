/**
 * 统一决策引擎管理员API v4.0 - 模块化版本
 *
 * @description 管理员专用接口的主入口，使用模块化架构提供引擎配置、监控和管理功能
 * @version 4.0.0
 * @date 2025-09-24
 * @refactored 从单文件1604行重构为模块化架构
 */

const express = require('express')
const router = express.Router()

// 使用新的模块化admin路由
const adminModules = require('./admin/index')

// 挂载模块化的admin路由
router.use('/', adminModules)

/**
 * 重构说明：
 *
 * 原有的admin.js文件已被重构为模块化架构：
 *
 * 1. shared/middleware.js - 共享中间件和工具函数
 * 2. auth.js - 管理员认证模块
 * 3. system.js - 系统监控模块
 * 4. config.js - 配置管理模块
 * 5. prize_pool.js - 奖品池管理模块
 * 6. user_management.js - 用户管理模块
 * 7. lottery_management.js - 抽奖管理模块
 * 8. analytics.js - 数据分析模块
 * 9. index.js - 主入口文件
 *
 * 原始文件备份为 admin.js.backup-YYYYMMDDHHMMSS
 */

module.exports = router
