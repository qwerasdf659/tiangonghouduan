/**
 * 餐厅积分抽奖系统 V4.0 - 用户库存管理API（路由聚合入口）
 *
 * ✅ P2-A 优化完成（2025-12-11）：
 * - 按领域拆分为三个子路由文件，避免单文件过大
 * - 主路由文件作为聚合入口，负责路由分发
 * - 符合架构规范：单个路由文件 < 800 行
 *
 * 路由模块划分：
 * 1. inventory-core.js（核心库存功能）：
 *    - 用户库存列表查询
 *    - 库存物品详情查看
 *    - 库存物品使用（核销）
 *    - 库存物品转让
 *    - 核销码生成与验证
 *    - 转让历史记录查询
 *    - 管理员库存统计
 *
 * 2. inventory-market.js（市场交易功能）：
 *    - 市场商品列表查询
 *    - 市场商品详情查看
 *    - 商品上架到市场
 *    - 购买市场商品
 *    - 撤回市场商品
 *    - 查询用户上架状态
 *
 * 3. ❌ inventory-exchange.js（兑换功能 - 已废弃，P0-1架构重构）：
 *    - 该模块已在 2025-12-12 废弃，原因：
 *      - 调用不存在的 exchangeOperation 服务导致500错误
 *      - 功能已迁移到 /api/v4/exchange_market/* 新接口
 *    - 迁移路径：
 *      - /api/v4/inventory/products → /api/v4/exchange_market/items
 *      - /api/v4/inventory/exchange → /api/v4/exchange_market/exchange
 *
 * 架构优势：
 * - 职责清晰：每个子路由文件专注于特定领域功能
 * - 易于维护：减少单文件代码量，降低维护复杂度
 * - 可扩展性：新增功能时只需修改对应的子路由文件
 * - 符合规范：遵循P2-A架构重构要求
 *
 * 创建时间：2025-12-11
 * 使用模型：Claude Sonnet 4.5
 */

const express = require('express')
const router = express.Router()

// 引入子路由模块
const inventoryCoreRoutes = require('./inventory-core')
const inventoryMarketRoutes = require('./inventory-market')
/*
 * ❌ P0-1架构重构（2025-12-12）：旧兑换入口已废弃，已迁移到 /api/v4/exchange_market
 * const inventoryExchangeRoutes = require('./inventory-exchange')
 */

/**
 * 路由映射表（Route Mapping Table）
 *
 * 核心库存功能（inventory-core.js）：
 * - GET    /user/:user_id                          - 获取用户库存列表
 * - GET    /item/:item_id                          - 获取库存物品详情
 * - POST   /use/:item_id                           - 使用库存物品
 * - POST   /transfer                                - 转让库存物品
 * - POST   /generate-code/:item_id                 - 生成核销码
 * - POST   /verification/verify                    - 核销验证码
 * - GET    /transfer-history                       - 获取转让历史
 * - GET    /admin/statistics                       - 获取管理员统计
 *
 * 市场交易功能（inventory-market.js）：
 * - GET    /market/listings                        - 获取市场挂牌列表
 * - GET    /market/listings/:listing_id            - 获取市场挂牌详情
 * - POST   /market/listings/:listing_id/purchase   - 购买市场挂牌
 * - POST   /market/listings/:listing_id/withdraw   - 撤回市场挂牌
 * - POST   /market/list                            - 上架商品到市场
 * - GET    /market/listing-status                  - 获取用户上架状态
 *
 * ❌ 兑换功能（inventory-exchange.js - 已废弃，P0-1架构重构 2025-12-12）：
 * - 该模块已废弃，所有兑换功能已迁移到 /api/v4/exchange_market
 * - 旧接口：/api/v4/inventory/products → 新接口：/api/v4/exchange_market/items
 * - 旧接口：/api/v4/inventory/exchange → 新接口：/api/v4/exchange_market/exchange
 */

/*
 * 挂载子路由（Mount Sub-Routes）
 * 所有子路由都挂载到当前路由的根路径
 */
router.use('/', inventoryCoreRoutes)
router.use('/', inventoryMarketRoutes)
/*
 * ❌ P0-1架构重构（2025-12-12）：旧兑换路由已废弃，统一使用 /api/v4/exchange_market
 * 原因：旧路由调用不存在的 exchangeOperation 服务导致500错误
 * 迁移路径：/api/v4/inventory/exchange → /api/v4/exchange_market/exchange
 * router.use('/', inventoryExchangeRoutes)
 */

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
