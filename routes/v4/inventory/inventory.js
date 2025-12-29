/**
 * 餐厅积分抽奖系统 V4.0 - 用户库存管理API（路由聚合入口）
 *
 * 路由模块划分：
 * 1. inventory-core.js（核心库存功能）：
 *    - 库存物品详情查看
 *    - 转让历史记录查询
 *    - 管理员库存统计
 *
 * 创建时间：2025-12-11
 */

const express = require('express')
const router = express.Router()

// 引入子路由模块（仅核心库存功能）
const inventoryCoreRoutes = require('./inventory-core')

/**
 * 路由映射表（Route Mapping Table）
 *
 * 核心库存功能（inventory-core.js）：
 * - GET    /item/:item_id           - 获取库存物品详情
 * - GET    /transfer-history        - 获取转让历史
 * - GET    /admin/statistics        - 获取管理员统计
 */

// 挂载子路由（Mount Sub-Routes）
router.use('/', inventoryCoreRoutes)

/**
 * 导出路由聚合器（Export Route Aggregator）
 *
 * 使用方式（Usage in app.js）：
 * ```javascript
 * const inventoryRoutes = require('./routes/v4/inventory/inventory');
 * app.use('/api/v4/inventory', inventoryRoutes);
 * ```
 *
 * 完整API访问路径示例（API Path Examples）：
 * - GET  /api/v4/inventory/item/:item_id
 * - GET  /api/v4/inventory/transfer-history
 * - GET  /api/v4/inventory/admin/statistics
 */
module.exports = router
