/**
 * inventory域 - 库存管理业务域聚合
 *
 * 顶层路径：/api/v4/inventory
 * 内部目录：routes/v4/inventory/
 *
 * 职责：
 * - 用户背包管理（物品查询、详情）
 * - 物品实例核心操作
 * - 物品转移/赠送
 *
 * 📌 重构记录（2025-12-22）：
 * - 移除 /market 子路由（已迁移到独立的 /api/v4/market 域）
 * - inventory域专注于纯库存管理，不再包含交易逻辑
 *
 * 📌 遵循规范：
 * - 用户端禁止/:id参数（用户查看自己背包通过token识别）
 * - 物品使用/核销已迁移到/redemption域
 * - 交易功能已迁移到/market域
 *
 * 创建时间：2025年01月21日
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()

// 库存主路由
const inventoryRoutes = require('./inventory')

// 库存核心操作路由
const inventoryCoreRoutes = require('./inventory-core')

// 用户背包路由
const backpackRoutes = require('./backpack')

// 挂载路由
router.use('/', inventoryRoutes)
router.use('/core', inventoryCoreRoutes)
router.use('/backpack', backpackRoutes)

module.exports = router
