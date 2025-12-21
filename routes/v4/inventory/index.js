/**
 * inventory域 - 库存管理业务域聚合
 *
 * 顶层路径：/api/v4/inventory
 * 内部目录：routes/v4/inventory/
 *
 * 职责：
 * - 用户背包管理（物品查询、详情）
 * - 物品实例核心操作
 * - 库存市场相关功能
 *
 * 📌 遵循规范：
 * - 用户端禁止/:id参数（用户查看自己背包通过token识别）
 * - 物品使用/核销已迁移到/redemption域
 *
 * 创建时间：2025年01月21日
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()

// 库存主路由（兼容旧接口）
const inventoryRoutes = require('./inventory')

// 库存核心操作路由
const inventoryCoreRoutes = require('./inventory-core')

// 库存市场相关路由（已拆分为子模块：listings.js, sell.js, buy.js, manage.js）
const inventoryMarketRoutes = require('./market/index')

// 用户背包路由
const backpackRoutes = require('./backpack')

// 挂载路由
router.use('/', inventoryRoutes)
router.use('/core', inventoryCoreRoutes)
router.use('/market', inventoryMarketRoutes)
router.use('/backpack', backpackRoutes)

module.exports = router
