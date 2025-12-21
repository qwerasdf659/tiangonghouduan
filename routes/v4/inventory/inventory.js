/**
 * 餐厅积分抽奖系统 V4.0 - 用户库存管理API（路由聚合入口）
 *
 * 路由模块划分：
 * 1. inventory-core.js（核心库存功能）：
 *    - 库存物品详情查看
 *    - 转让历史记录查询
 *    - 管理员库存统计
 *
 * 2. market/（市场交易功能，已拆分为子模块）：
 *    - listings.js - 市场商品列表查询
 *    - sell.js     - 商品上架
 *    - buy.js      - 商品购买
 *    - manage.js   - 撤回/管理
 *
 * 注意：兑换功能已迁移到 /api/v4/exchange_market
 *
 * 创建时间：2025-12-11
 * 更新时间：2025-12-21 - 暴力重构清理
 */

const express = require('express')
const router = express.Router()

// 引入子路由模块
const inventoryCoreRoutes = require('./inventory-core')
const inventoryMarketRoutes = require('./market/index')

/**
 * 路由映射表（Route Mapping Table）
 *
 * 核心库存功能（inventory-core.js）：
 * - GET    /item/:item_id           - 获取库存物品详情
 * - GET    /transfer-history        - 获取转让历史
 * - GET    /admin/statistics        - 获取管理员统计
 *
 * 市场交易功能（inventory-market.js）：
 * - GET    /market/listings                        - 获取市场挂牌列表
 * - GET    /market/listings/:listing_id            - 获取市场挂牌详情
 * - POST   /market/listings/:listing_id/purchase   - 购买市场挂牌
 * - POST   /market/listings/:listing_id/withdraw   - 撤回市场挂牌
 * - POST   /market/list                            - 上架商品到市场
 * - GET    /market/listing-status                  - 获取用户上架状态
 */

/*
 * 挂载子路由（Mount Sub-Routes）
 * 所有子路由都挂载到当前路由的根路径
 */
router.use('/', inventoryCoreRoutes)
router.use('/', inventoryMarketRoutes)

/**
 * 导出路由聚合器（Export Route Aggregator）
 *
 * 使用方式（Usage in app.js）：
 * ```javascript
 * const inventoryRoutes = require('./routes/v4/unified-engine/inventory');
 * app.use('/api/v4/inventory', inventoryRoutes);
 * ```
 *
 * 完整API访问路径示例（API Path Examples）：
 * - GET  /api/v4/inventory/user/:user_id
 * - POST /api/v4/inventory/use/:item_id
 * - GET  /api/v4/inventory/market/listings
 * - POST /api/v4/inventory/market/listings/:listing_id/purchase
 */
module.exports = router
